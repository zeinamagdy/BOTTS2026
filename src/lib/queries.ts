import "server-only"
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  lte,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm"
import { db } from "@/db"
import {
  addresses,
  crimeStats,
  kiezPricesMonthly,
  kiezProfiles,
  kitas,
  newConstruction,
  realListings2023,
  rentals,
  sales,
  schools,
  transitStations,
  type KiezProfile,
} from "@/db/schema"
import {
  TIERS,
  type Loose,
  type RankKiezInput,
  type RentalFilters,
  type RentCheckInput,
  type SaleFilters,
} from "@/lib/filters"

const COS_LAT = Math.cos((52.52 * Math.PI) / 180)
const clampLimit = (n?: number | null, max = 25) =>
  Math.min(Math.max(n ?? 10, 1), max)
const round = (n: number | null | undefined, digits = 0) =>
  n == null ? null : Math.round(n * 10 ** digits) / 10 ** digits

/** Approximate distance in km (equirectangular, fine within Berlin). */
function distanceKm(
  lat: AnyColumn,
  lon: AnyColumn,
  pLat: number | AnyColumn,
  pLon: number | AnyColumn,
) {
  return sql<number>`111.32 * sqrt(power(${lat} - ${pLat}, 2) + power((${lon} - ${pLon}) * ${COS_LAT}, 2))`
}
const median = (col: AnyColumn) =>
  sql<number>`percentile_cont(0.5) within group (order by ${col})`.mapWith(
    Number,
  )
const avgOf = (col: AnyColumn) => sql<number>`avg(${col})`.mapWith(Number)

/** Normalise user-typed street names to the Wohnlage spelling ("Oranienstr." → "oranienstraße"). */
/** Matches the addresses_street_idx expression: lower-case, no spaces or hyphens. */
const streetKey = (col: AnyColumn) =>
  sql`regexp_replace(lower(${col}), '[[:space:]-]', '', 'g')`

function normStreet(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/str\.?$/, "straße")
    .replace(/strasse$/, "straße")
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export async function getOverview() {
  const [[r], [k], [a], [kt], [sc]] = await Promise.all([
    db
      .select({
        nRentals: count(),
        medianWarmmiete: median(rentals.warmmiete),
        avgRentPerM2: avgOf(rentals.rentPerM2Kalt),
      })
      .from(rentals),
    db.select({ nPlz: count() }).from(kiezProfiles),
    db.select({ nAddresses: count() }).from(addresses),
    db
      .select({
        nKitas: count(),
        places: sql<number>`sum(${kitas.capacity})`.mapWith(Number),
      })
      .from(kitas),
    db.select({ nSchools: count() }).from(schools),
  ])
  return { ...r, ...k, ...a, ...kt, ...sc }
}

export async function getBezirkSummary() {
  const [rent, kiez] = await Promise.all([
    db
      .select({
        bezirk: rentals.bezirk,
        nRentals: count(),
        avgRentPerM2: avgOf(rentals.rentPerM2Kalt),
        medianWarmmiete: median(rentals.warmmiete),
      })
      .from(rentals)
      .groupBy(rentals.bezirk),
    db
      .select({
        bezirk: kiezProfiles.bezirk,
        nPlz: count(),
        // Weighted by listing count so tiny PLZs don't dominate
        buyPricePerM2Real:
          sql<number>`sum(${kiezProfiles.buyPricePerM2Real} * ${kiezProfiles.nRealListings}) / nullif(sum(${kiezProfiles.nRealListings}), 0)`.mapWith(
            Number,
          ),
        crimeTotalAvg: sql<number>`max(${kiezProfiles.crimeTotalAvg})`.mapWith(
          Number,
        ),
        abiturTier: sql<string>`max(${kiezProfiles.abiturTierBezirk})`,
        kitaPlaces: sql<number>`sum(${kiezProfiles.totalKitaCapacity})`.mapWith(
          Number,
        ),
      })
      .from(kiezProfiles)
      .groupBy(kiezProfiles.bezirk),
  ])
  const byName = new Map(kiez.map((k) => [k.bezirk, k]))
  return rent
    .map((r) => ({ ...r, ...byName.get(r.bezirk)! }))
    .sort((a, b) => a.avgRentPerM2 - b.avgRentPerM2)
}

export async function getKiezProfiles() {
  return db.select().from(kiezProfiles).orderBy(asc(kiezProfiles.plz))
}

// ─── Neighbourhood ranking ───────────────────────────────────────────────────

type Factor = keyof NonNullable<RankKiezInput["weights"]>
const FACTORS: Record<
  Factor,
  { value: (p: KiezProfile) => number | null; higherIsBetter: boolean }
> = {
  affordability: {
    value: (p) => p.rentPerM2KaltSynthetic,
    higherIsBetter: false,
  },
  schools: { value: (p) => p.abiturVsPeerBezirk, higherIsBetter: true },
  safety: { value: (p) => p.crimeTotalAvg, higherIsBetter: false },
  air: { value: (p) => p.airNo2Avg, higherIsBetter: false },
  kitas: { value: (p) => p.totalKitaCapacity, higherIsBetter: true },
  transit: { value: (p) => p.transitDistanceKm, higherIsBetter: false },
  locationQuality: { value: (p) => p.pctWohnlageGut, higherIsBetter: true },
}
const tierRank = (t: string | null) =>
  t ? TIERS.length - TIERS.indexOf(t as (typeof TIERS)[number]) : 0

/** Percentile rank in [0, 1] of every profile for one factor (1 = best). Missing = 0.5. */
function percentileScores(profiles: KiezProfile[], factor: Factor) {
  const { value, higherIsBetter } = FACTORS[factor]
  const vals = profiles
    .map(value)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b)
  return (p: KiezProfile) => {
    const v = value(p)
    if (v == null || vals.length < 2) return 0.5
    // Midpoint of ties, so identical Bezirk-level values score the same
    const lo = vals.findIndex((x) => x >= v)
    const hi = vals.findLastIndex((x) => x <= v)
    const pct = (lo + hi) / 2 / (vals.length - 1)
    return higherIsBetter ? pct : 1 - pct
  }
}

/**
 * Scores every PLZ on weighted factors (percentile ranks across all of Berlin) and
 * returns the best matches. PLZs with <100 addresses (parks, industrial) are skipped.
 */
export async function rankKiez(input: Loose<RankKiezInput> = {}) {
  const all = (await getKiezProfiles()).filter((p) => p.nAddresses >= 100)
  const given = Object.entries(input.weights ?? {}).filter(
    ([, w]) => w != null && w > 0,
  ) as [Factor, number][]
  const weights = given.length
    ? given
    : (Object.keys(FACTORS) as Factor[]).map((f) => [f, 1] as [Factor, number])
  const scorers = weights.map(([f, w]) => ({
    f,
    w,
    score: percentileScores(all, f),
  }))
  const totalW = weights.reduce((s, [, w]) => s + w, 0)

  let apt: Map<number, { matching: number; medianWarmmiete: number }> | null =
    null
  if (input.apartment) {
    const a = input.apartment
    const where = and(
      a.maxWarmmiete != null
        ? lte(rentals.warmmiete, a.maxWarmmiete)
        : undefined,
      a.minRooms != null ? gte(rentals.rooms, a.minRooms) : undefined,
      a.minAreaM2 != null ? gte(rentals.areaM2, a.minAreaM2) : undefined,
      a.balcony ? eq(rentals.hasBalcony, true) : undefined,
    )
    const rows = await db
      .select({
        plz: rentals.plz,
        matching: count(),
        medianWarmmiete: median(rentals.warmmiete),
      })
      .from(rentals)
      .where(where)
      .groupBy(rentals.plz)
    apt = new Map(rows.map((r) => [r.plz, r]))
  }

  const minTier = input.minAbiturTier ? tierRank(input.minAbiturTier) : 0
  const results = all
    .filter(
      (p) =>
        (!input.bezirke?.length || input.bezirke.includes(p.bezirk as never)) &&
        (input.maxRentPerM2 == null ||
          (p.rentPerM2KaltSynthetic ?? Infinity) <= input.maxRentPerM2) &&
        (input.maxTransitKm == null ||
          (p.transitDistanceKm ?? Infinity) <= input.maxTransitKm) &&
        tierRank(p.abiturTierBezirk) >= minTier &&
        (!apt || (apt.get(p.plz)?.matching ?? 0) > 0),
    )
    .map((p) => {
      const factorScores = Object.fromEntries(
        scorers.map(({ f, score }) => [f, Math.round(score(p) * 100)]),
      )
      const score =
        scorers.reduce((s, { w, score }) => s + w * score(p), 0) / totalW
      return {
        plz: p.plz,
        ortsteil: p.ortsteil,
        bezirk: p.bezirk,
        score: Math.round(score * 100),
        factorScores,
        facts: kiezFacts(p),
        matchingRentals: apt?.get(p.plz) ?? null,
      }
    })
    .sort((a, b) => b.score - a.score)

  return {
    weightsUsed: Object.fromEntries(weights),
    candidates: results.length,
    results: results.slice(0, clampLimit(input.limit, 20)),
  }
}

/** Compact, rounded summary of a profile (what the LLM and UI usually need). */
function kiezFacts(p: KiezProfile) {
  return {
    rentPerM2KaltSynthetic: round(p.rentPerM2KaltSynthetic, 2),
    buyPricePerM2Real2023: round(p.buyPricePerM2Real),
    dominantWohnlage: p.dominantWohnlage,
    pctWohnlageGut: round(p.pctWohnlageGut, 1),
    abiturTierBezirk: p.abiturTierBezirk,
    nKitas: p.nKitas,
    kitaPlaces: p.totalKitaCapacity,
    crimeTotalAvgBezirk: round(p.crimeTotalAvg),
    no2: round(p.airNo2Avg, 1),
    nearestStation: p.nearestTransitStation
      ? `${p.nearestTransitStation} (${p.nearestTransitLine}, ${round(p.transitDistanceKm, 1)} km)`
      : null,
  }
}

export async function getKiezDetail(plz: number) {
  const [profile] = await db
    .select()
    .from(kiezProfiles)
    .where(eq(kiezProfiles.plz, plz))
  if (!profile) return null
  const [rentByRooms, topSchools, bigKitas, stations, real] = await Promise.all(
    [
      db
        .select({
          rooms: rentals.rooms,
          listings: count(),
          medianWarmmiete: median(rentals.warmmiete),
          avgRentPerM2Kalt: avgOf(rentals.rentPerM2Kalt),
        })
        .from(rentals)
        .where(eq(rentals.plz, plz))
        .groupBy(rentals.rooms)
        .orderBy(rentals.rooms),
      listSchools({ bezirk: profile.bezirk as never, limit: 5 }),
      db
        .select({
          name: kitas.name,
          capacity: kitas.capacity,
          pedagogy: kitas.pedagogy,
          address: sql<string>`${kitas.strasse} || ' ' || ${kitas.hnr}`,
        })
        .from(kitas)
        .where(eq(kitas.plz, plz))
        .orderBy(sql`${kitas.capacity} desc nulls last`)
        .limit(5),
      db
        .select({
          station: transitStations.stationName,
          line: transitStations.line,
          km: distanceKm(
            transitStations.lat,
            transitStations.lon,
            profile.lat,
            profile.lon,
          ),
        })
        .from(transitStations)
        .orderBy(
          distanceKm(
            transitStations.lat,
            transitStations.lon,
            profile.lat,
            profile.lon,
          ),
        )
        .limit(3),
      db
        .select({
          listings: count(),
          medianPricePerM2: median(realListings2023.pricePerM2),
        })
        .from(realListings2023)
        .where(eq(realListings2023.plz, plz)),
    ],
  )
  return {
    ...profile,
    rentByRooms: rentByRooms.map((r) => ({
      ...r,
      medianWarmmiete: round(r.medianWarmmiete),
      avgRentPerM2Kalt: round(r.avgRentPerM2Kalt, 2),
    })),
    schoolsInBezirk: topSchools,
    largestKitas: bigKitas,
    nearestStations: stations.map((s) => ({ ...s, km: round(s.km, 2) })),
    realSales2023: {
      listings: real[0].listings,
      medianPricePerM2: round(real[0].medianPricePerM2),
    },
  }
}

// ─── Listings search ─────────────────────────────────────────────────────────

type ListingTable = typeof rentals | typeof sales | typeof newConstruction
function commonListingWhere(
  t: ListingTable,
  f: Loose<RentalFilters> | Loose<SaleFilters>,
): (SQL | undefined)[] {
  return [
    f.bezirke?.length ? inArray(t.bezirk, f.bezirke) : undefined,
    f.plz?.length ? inArray(t.plz, f.plz) : undefined,
    f.ortsteil ? sql`${t.ortsteil} ilike ${`%${f.ortsteil}%`}` : undefined,
    f.minRooms != null ? gte(t.rooms, f.minRooms) : undefined,
    f.minAreaM2 != null ? gte(t.areaM2, f.minAreaM2) : undefined,
    f.balcony != null ? eq(t.hasBalcony, f.balcony) : undefined,
    f.wohnlage?.length ? inArray(t.wohnlage, f.wohnlage) : undefined,
    f.near
      ? lte(distanceKm(t.lat, t.lon, f.near.lat, f.near.lon), f.near.radiusKm)
      : undefined,
    f.transitLines?.length || f.maxStationKm != null
      ? sql`exists (select 1 from ${transitStations} where ${and(
          stationOnLines(f.transitLines),
          lte(
            distanceKm(t.lat, t.lon, transitStations.lat, transitStations.lon),
            f.maxStationKm ?? 1,
          ),
        )})`
      : undefined,
  ]
}

const stationOnLines = (lines?: readonly string[] | null) =>
  lines?.length ? inArray(transitStations.line, [...lines]) : undefined

/**
 * Real nearest station (on the requested lines, if any), computed from coordinates.
 * The listings' own transit_station field is unreliable (median 6 km away), so we don't use it.
 */
function nearestStationSql(t: ListingTable, lines?: readonly string[] | null) {
  const dist = distanceKm(
    transitStations.lat,
    transitStations.lon,
    t.lat,
    t.lon,
  )
  return sql<string>`(select ${transitStations.stationName} || ' (' || ${transitStations.line} || ', ' || round((${dist})::numeric, 1) || ' km)'
    from ${transitStations} ${lines?.length ? sql`where ${stationOnLines(lines)}` : sql``}
    order by ${dist} limit 1)`
}

export async function searchRentals(f: Loose<RentalFilters> = {}) {
  const where = and(
    ...commonListingWhere(rentals, f),
    f.maxRooms != null ? lte(rentals.rooms, f.maxRooms) : undefined,
    f.maxWarmmiete != null ? lte(rentals.warmmiete, f.maxWarmmiete) : undefined,
    f.maxKaltmiete != null ? lte(rentals.kaltmiete, f.maxKaltmiete) : undefined,
    f.lift != null ? eq(rentals.hasLift, f.lift) : undefined,
    f.furnished != null ? eq(rentals.furnished, f.furnished) : undefined,
    f.listedSince ? gte(rentals.dateListed, f.listedSince) : undefined,
  )
  const order = {
    warmmiete_asc: asc(rentals.warmmiete),
    rent_per_m2_asc: asc(rentals.rentPerM2Kalt),
    area_desc: desc(rentals.areaM2),
    newest: desc(rentals.dateListed),
  }[f.sort ?? "warmmiete_asc"]

  const [[stats], rows] = await Promise.all([
    db
      .select({
        total: count(),
        medianWarmmiete: median(rentals.warmmiete),
        avgRentPerM2Kalt: avgOf(rentals.rentPerM2Kalt),
      })
      .from(rentals)
      .where(where),
    db
      .select({
        id: rentals.id,
        dateListed: rentals.dateListed,
        plz: rentals.plz,
        ortsteil: rentals.ortsteil,
        bezirk: rentals.bezirk,
        wohnlage: rentals.wohnlage,
        rooms: rentals.rooms,
        areaM2: rentals.areaM2,
        kaltmiete: rentals.kaltmiete,
        warmmiete: rentals.warmmiete,
        rentPerM2Kalt: rentals.rentPerM2Kalt,
        floor: rentals.floor,
        hasBalcony: rentals.hasBalcony,
        hasLift: rentals.hasLift,
        condition: rentals.condition,
        buildingEra: rentals.buildingEra,
        energyClass: rentals.energyClass,
        nearestStation: nearestStationSql(rentals, f.transitLines),
        lat: rentals.lat,
        lon: rentals.lon,
      })
      .from(rentals)
      .where(where)
      .orderBy(order)
      .limit(clampLimit(f.limit)),
  ])
  return {
    total: stats.total,
    medianWarmmiete: round(stats.medianWarmmiete),
    avgRentPerM2Kalt: round(stats.avgRentPerM2Kalt, 2),
    results: rows,
  }
}

export async function searchSales(f: Loose<SaleFilters> = {}) {
  const t = f.kind === "new_build" ? newConstruction : sales
  const where = and(
    ...commonListingWhere(t, f),
    f.maxPrice != null ? lte(t.priceEur, f.maxPrice) : undefined,
    f.maxPricePerM2 != null ? lte(t.pricePerM2, f.maxPricePerM2) : undefined,
  )
  const order = {
    price_asc: asc(t.priceEur),
    price_per_m2_asc: asc(t.pricePerM2),
    area_desc: desc(t.areaM2),
    newest: desc(t.dateListed),
  }[f.sort ?? "price_asc"]
  const extra: Record<string, AnyColumn> =
    t === newConstruction
      ? {
          projectName: newConstruction.projectName,
          developer: newConstruction.developer,
          completionYear: newConstruction.completionYear,
          possessionStatus: newConstruction.possessionStatus,
        }
      : { yearBuilt: sales.yearBuilt, condition: sales.condition }

  const [[stats], rows] = await Promise.all([
    db
      .select({
        total: count(),
        medianPrice: median(t.priceEur),
        medianPricePerM2: median(t.pricePerM2),
      })
      .from(t)
      .where(where),
    db
      .select({
        id: t.id,
        dateListed: t.dateListed,
        plz: t.plz,
        ortsteil: t.ortsteil,
        bezirk: t.bezirk,
        wohnlage: t.wohnlage,
        rooms: t.rooms,
        areaM2: t.areaM2,
        priceEur: t.priceEur,
        pricePerM2: t.pricePerM2,
        energyClass: t.energyClass,
        hasBalcony: t.hasBalcony,
        nearestStation: nearestStationSql(t, f.transitLines),
        lat: t.lat,
        lon: t.lon,
        ...extra,
      })
      .from(t)
      .where(where)
      .orderBy(order)
      .limit(clampLimit(f.limit)),
  ])
  return {
    kind: f.kind ?? "resale",
    total: stats.total,
    medianPrice: round(stats.medianPrice),
    medianPricePerM2: round(stats.medianPricePerM2),
    results: rows,
  }
}

// ─── Address & rent check ────────────────────────────────────────────────────

/**
 * Finds an address in the official Wohnlage register. Without a house number it
 * summarises the whole street. Unknown streets return close spellings.
 */
export async function lookupAddress(
  street: string,
  houseNumber?: string | null,
) {
  const s = normStreet(street)
  const hnr = houseNumber
    ?.trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/^0+(?=.)/, "")
  const onStreet = eq(streetKey(addresses.strasse), s.replace(/[\s-]/g, ""))

  if (hnr) {
    const [hit] = await db
      .select()
      .from(addresses)
      .where(and(onStreet, eq(addresses.hnr, hnr)))
      .limit(1)
    if (hit) {
      const [profile] = await db
        .select()
        .from(kiezProfiles)
        .where(eq(kiezProfiles.plz, hit.plz))
      return {
        found: "address" as const,
        address: hit,
        kiez: profile
          ? { ortsteil: profile.ortsteil, ...kiezFacts(profile) }
          : null,
      }
    }
  }
  const street_ = await db
    .select({ plz: addresses.plz, wohnlage: addresses.wohnlage, n: count() })
    .from(addresses)
    .where(onStreet)
    .groupBy(addresses.plz, addresses.wohnlage)
  if (street_.length) {
    const [first] = await db
      .select({ strasse: addresses.strasse, bezirk: addresses.bezirk })
      .from(addresses)
      .where(onStreet)
      .limit(1)
    return {
      found: "street" as const,
      note: hnr ? `House number ${hnr} not found on this street` : undefined,
      street: first.strasse,
      bezirk: first.bezirk,
      byPlzAndWohnlage: street_,
    }
  }
  // Typo-tolerant: trigram similarity (pg_trgm, enabled by the seed)
  const suggestions = await db.execute<{ strasse: string }>(sql`
    select strasse from (select distinct ${addresses.strasse} as strasse from ${addresses}) s
    where similarity(lower(strasse), ${s}) > 0.3
    order by similarity(lower(strasse), ${s}) desc limit 5`)
  return {
    found: "none" as const,
    suggestions: suggestions.map((x) => x.strasse),
  }
}

/**
 * Compares a rent to similar SYNTHETIC listings (same PLZ + Wohnlage, ±25% size).
 * This is a rough market comparison, not the official Mietspiegel calculation.
 */
export async function checkRentFairness(
  input: Loose<RentCheckInput> & { areaM2: number; kaltmiete: number },
) {
  let plz = input.plz ?? null
  let wohnlage: string | null = null
  let address = null
  if (input.street) {
    const res = await lookupAddress(input.street, input.houseNumber)
    if (res.found === "address") {
      address = `${res.address.strasse} ${res.address.hnr}, ${res.address.plz}`
      plz = res.address.plz
      wohnlage = res.address.wohnlage
    } else if (res.found === "street" && res.byPlzAndWohnlage.length) {
      const top = [...res.byPlzAndWohnlage].sort((a, b) => b.n - a.n)[0]
      plz ??= top.plz
      wohnlage = top.wohnlage
    }
  }
  if (plz == null) return { error: "Need a PLZ or a valid Berlin address" }
  const [profile] = await db
    .select()
    .from(kiezProfiles)
    .where(eq(kiezProfiles.plz, plz))
  if (!profile) return { error: `PLZ ${plz} is not in Berlin` }
  wohnlage ??= profile.dominantWohnlage

  const perM2 = input.kaltmiete / input.areaM2
  const sizeBand = and(
    gte(rentals.areaM2, input.areaM2 * 0.75),
    lte(rentals.areaM2, input.areaM2 * 1.25),
  )
  const attempts: [string, SQL | undefined][] = [
    [
      `PLZ ${plz}, Wohnlage ${wohnlage}`,
      and(eq(rentals.plz, plz), eq(rentals.wohnlage, wohnlage!), sizeBand),
    ],
    [`PLZ ${plz}`, and(eq(rentals.plz, plz), sizeBand)],
    [
      `${profile.bezirk}, Wohnlage ${wohnlage}`,
      and(
        eq(rentals.bezirk, profile.bezirk),
        eq(rentals.wohnlage, wohnlage!),
        sizeBand,
      ),
    ],
  ]
  for (const [scope, where] of attempts) {
    const [st] = await db
      .select({
        n: count(),
        p25: sql<number>`percentile_cont(0.25) within group (order by ${rentals.rentPerM2Kalt})`.mapWith(
          Number,
        ),
        p50: median(rentals.rentPerM2Kalt),
        p75: sql<number>`percentile_cont(0.75) within group (order by ${rentals.rentPerM2Kalt})`.mapWith(
          Number,
        ),
        pctBelow:
          sql<number>`avg(case when ${rentals.rentPerM2Kalt} < ${perM2} then 1.0 else 0 end)`.mapWith(
            Number,
          ),
      })
      .from(rentals)
      .where(where)
    if (st.n < 15) continue
    const verdict =
      perM2 > st.p75 * 1.1
        ? "well above comparable listings"
        : perM2 > st.p75
          ? "above typical"
          : perM2 < st.p25
            ? "below typical"
            : "within the typical range"
    return {
      address,
      plz,
      wohnlage,
      yourRentPerM2: round(perM2, 2),
      comparables: {
        scope,
        n: st.n,
        p25: round(st.p25, 2),
        median: round(st.p50, 2),
        p75: round(st.p75, 2),
      },
      percentile: Math.round(st.pctBelow * 100),
      verdict,
      caveat:
        "Comparables are synthetic listings (price levels run below the real market). Not the official Mietspiegel. Under the Mietpreisbremse a new-lease rent may generally exceed the local comparative rent by at most 10%.",
    }
  }
  return { error: "Not enough comparable listings", plz, wohnlage }
}

// ─── Trends, kitas, schools, crime ───────────────────────────────────────────

export async function getPriceTrend(
  f: {
    ortsteil?: string | null
    bezirk?: string | null
    granularity?: "month" | "year" | null
  } = {},
) {
  const period =
    f.granularity === "month"
      ? kiezPricesMonthly.yearMonth
      : sql<string>`left(${kiezPricesMonthly.yearMonth}, 4)`
  const where = f.ortsteil
    ? sql`${kiezPricesMonthly.ortsteil} ilike ${`%${f.ortsteil}%`}`
    : f.bezirk
      ? eq(kiezPricesMonthly.bezirk, f.bezirk)
      : undefined
  const rows = await db
    .select({
      period: sql<string>`${period}`,
      kaltmietePerM2: avgOf(kiezPricesMonthly.kaltmietePerM2),
      resalePricePerM2: avgOf(kiezPricesMonthly.secondaryPricePerM2),
      newBuildPricePerM2: avgOf(kiezPricesMonthly.newConstructionPricePerM2),
      mortgageRatePct: avgOf(kiezPricesMonthly.avgMortgageRatePct),
    })
    .from(kiezPricesMonthly)
    .where(where)
    .groupBy(period)
    .orderBy(period)
  const series = rows.map((r) => ({
    period: r.period,
    kaltmietePerM2: round(r.kaltmietePerM2, 2)!,
    resalePricePerM2: round(r.resalePricePerM2)!,
    newBuildPricePerM2: round(r.newBuildPricePerM2)!,
    mortgageRatePct: round(r.mortgageRatePct, 2)!,
  }))
  const [first, last] = [series[0], series.at(-1)]
  const pct = (a?: number, b?: number) =>
    a && b ? round(((b - a) / a) * 100, 1) : null
  return {
    scope: f.ortsteil ?? f.bezirk ?? "Berlin",
    change: {
      from: first?.period,
      to: last?.period,
      kaltmietePct: pct(first?.kaltmietePerM2, last?.kaltmietePerM2),
      resalePricePct: pct(first?.resalePricePerM2, last?.resalePricePerM2),
    },
    series,
  }
}

export async function findKitas(
  f: {
    plz?: number | null
    near?: { lat: number; lon: number; radiusKm: number } | null
    minCapacity?: number | null
    limit?: number | null
  } = {},
) {
  const dist = f.near
    ? distanceKm(kitas.lat, kitas.lon, f.near.lat, f.near.lon)
    : null
  const where = and(
    f.plz != null ? eq(kitas.plz, f.plz) : undefined,
    dist && f.near ? lte(dist, f.near.radiusKm) : undefined,
    f.minCapacity != null ? gte(kitas.capacity, f.minCapacity) : undefined,
  )
  const [[stats], rows] = await Promise.all([
    db
      .select({
        total: count(),
        places: sql<number>`sum(${kitas.capacity})`.mapWith(Number),
      })
      .from(kitas)
      .where(where),
    db
      .select({
        name: kitas.name,
        address: sql<string>`${kitas.strasse} || ' ' || ${kitas.hnr} || ', ' || ${kitas.plz}`,
        capacity: kitas.capacity,
        kitaType: kitas.kitaType,
        pedagogy: kitas.pedagogy,
        traeger: kitas.traegerName,
        website: kitas.website,
        ...(dist ? { km: dist } : {}),
      })
      .from(kitas)
      .where(where)
      .orderBy(dist ?? sql`${kitas.capacity} desc nulls last`)
      .limit(clampLimit(f.limit)),
  ])
  return { total: stats.total, places: stats.places, results: rows }
}

export async function listSchools(
  f: {
    bezirk?: string | null
    plz?: number | null
    schoolType?: string | null
    minTier?: (typeof TIERS)[number] | null
    limit?: number | null
  } = {},
) {
  const tiers = f.minTier ? TIERS.slice(0, TIERS.indexOf(f.minTier) + 1) : null
  return db
    .select({
      name: schools.name,
      bsn: schools.bsn,
      plz: schools.plz,
      bezirk: schools.bezirk,
      schoolType: schools.schoolType,
      meanGrade: schools.meanGrade,
      performanceVsPeer: schools.performanceVsPeer,
      tierVsPeer: schools.tierVsPeer,
      nCandidates: schools.nCandidates,
    })
    .from(schools)
    .where(
      and(
        f.bezirk ? eq(schools.bezirk, f.bezirk) : undefined,
        f.plz != null ? eq(schools.plz, f.plz) : undefined,
        f.schoolType ? eq(schools.schoolType, f.schoolType) : undefined,
        tiers ? inArray(schools.tierVsPeer, [...tiers]) : undefined,
      ),
    )
    .orderBy(desc(schools.performanceVsPeer))
    .limit(clampLimit(f.limit))
}

/**
 * 2019 crime totals per Bezirksregion (latest year in the data), lowest first.
 * Same 15-category sum as the kiez profile. Absolute counts, not per capita.
 */
export async function getCrimeByArea(f: { bezirk?: string | null } = {}) {
  const c = crimeStats
  const total = sql<number>`${c.robbery} + ${c.streetRobbery} + ${c.injury} + ${c.aggAssault} + ${c.threat} + ${c.theft} + ${c.car} + ${c.fromCar} + ${c.bike} + ${c.burglary} + ${c.fire} + ${c.arson} + ${c.damage} + ${c.graffiti} + ${c.drugs}`
  return db
    .select({
      location: c.location,
      bezirk: c.bezirk,
      total: total.mapWith(Number),
      burglary: c.burglary,
      theft: c.theft,
      injury: c.injury,
      bike: c.bike,
    })
    .from(c)
    .where(
      and(
        eq(c.year, 2019),
        f.bezirk ? eq(c.bezirk, f.bezirk) : undefined,
        // Skip "Bezirk (Nk), nicht zuzuordnen" rows (crimes without a location)
        sql`${c.location} not like '%nicht zuzuordnen%'`,
      ),
    )
    .orderBy(total)
}

export type Overview = Awaited<ReturnType<typeof getOverview>>
export type BezirkSummary = Awaited<ReturnType<typeof getBezirkSummary>>[number]
export type KiezRow = KiezProfile
