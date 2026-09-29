import "server-only"
import {
  and,
  asc,
  count,
  desc,
  getTableColumns,
  eq,
  gte,
  inArray,
  lte,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm"
import { db } from "@/db"
import {
  addresses,
  crimeStats,
  kiezEnrichment,
  kiezPricesMonthly,
  kiezProfiles,
  kitas,
  newConstruction,
  planungsraum,
  planungsraumBoundaries,
  poiLocations,
  realListings2023,
  rentals,
  sales,
  schools,
  transitStations,
  type KiezEnrichment,
  type KiezProfile,
  type Planungsraum,
} from "@/db/schema"
import { withPhotoOverride } from "@/lib/area-photos"
import { bvgGeocode, bvgJourney, type Place } from "@/lib/bvg"
import {
  TIERS,
  type CommuteInput,
  type Loose,
  type RankKiezInput,
  type RankPlanungsraumInput,
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

/** Profile + our own OSM/photo enrichment (null fields if not seeded). */
type KiezFull = KiezProfile &
  Omit<KiezEnrichment, "plz"> & { insideRing: boolean }
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- drop plz, keep the rest
const { plz: _plz, ...enrichmentCols } = getTableColumns(kiezEnrichment)

export async function getKiezProfiles(): Promise<KiezFull[]> {
  const [rows, ring] = await Promise.all([
    db
      .select({ ...getTableColumns(kiezProfiles), ...enrichmentCols })
      .from(kiezProfiles)
      .leftJoin(kiezEnrichment, eq(kiezEnrichment.plz, kiezProfiles.plz))
      .orderBy(asc(kiezProfiles.plz)),
    getRingPolygon(),
  ])
  return rows.map((r) => ({
    ...(r as Omit<KiezFull, "insideRing">),
    insideRing: ring.length > 2 && pointInPolygon(r.lat, r.lon, ring),
  }))
}

async function getKiezFull(plz: number) {
  return (await getKiezProfiles()).find((p) => p.plz === plz) ?? null
}

/** Ringbahn stations missing from transit_stations.csv (coordinates from OSM). */
const MISSING_RING_STATIONS = [
  { lat: 52.5186, lon: 13.2842 }, // Westend
  { lat: 52.5075, lon: 13.2835 }, // Messe Nord/ICC
  { lat: 52.5429, lon: 13.3664 }, // Wedding
  { lat: 52.5547, lon: 13.3977 }, // Bornholmer Straße
]

/**
 * The S-Bahn Ring as a polygon: the "S Ringbahn" stations (plus the ones the
 * data repo lacks) sorted by angle around their centroid.
 */
async function getRingPolygon() {
  const pts = await db
    .select({ lat: transitStations.lat, lon: transitStations.lon })
    .from(transitStations)
    .where(eq(transitStations.line, "S Ringbahn"))
  pts.push(...MISSING_RING_STATIONS)
  const cLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length
  const cLon = pts.reduce((s, p) => s + p.lon, 0) / pts.length
  const angle = (p: { lat: number; lon: number }) =>
    Math.atan2(p.lat - cLat, (p.lon - cLon) * COS_LAT)
  return pts.sort((a, b) => angle(a) - angle(b))
}

function pointInPolygon(
  lat: number,
  lon: number,
  poly: { lat: number; lon: number }[],
) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (
      a.lat > lat !== b.lat > lat &&
      lon < ((b.lon - a.lon) * (lat - a.lat)) / (b.lat - a.lat) + a.lon
    )
      inside = !inside
  }
  return inside
}

// ─── Neighbourhood ranking ───────────────────────────────────────────────────

type Factor = keyof NonNullable<RankKiezInput["weights"]>
const FACTORS: Record<
  Factor,
  { value: (p: KiezFull) => number | null; higherIsBetter: boolean }
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
  nature: {
    value: (p) =>
      p.greenShare1km == null
        ? p.parkAreaM2
        : p.greenShare1km + (p.waterShare1km ?? 0) / 2,
    higherIsBetter: true,
  },
  amenities: {
    value: (p) =>
      p.cafes1km == null && p.playgrounds1km == null
        ? null
        : (p.cafes1km ?? 0) + (p.playgrounds1km ?? 0),
    higherIsBetter: true,
  },
}
const tierRank = (t: string | null) =>
  t ? TIERS.length - TIERS.indexOf(t as (typeof TIERS)[number]) : 0

/**
 * Percentile rank in [0, 1] of every item for one value (1 = best). Missing = 0.5.
 * Ties score at their midpoint, so identical Bezirk-level values score the same.
 */
function percentileScorer<T>(
  items: T[],
  value: (item: T) => number | null,
  higherIsBetter: boolean,
) {
  const vals = items
    .map(value)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b)
  return (item: T) => {
    const v = value(item)
    if (v == null || vals.length < 2) return 0.5
    const lo = vals.findIndex((x) => x >= v)
    const hi = vals.findLastIndex((x) => x <= v)
    const pct = (lo + hi) / 2 / (vals.length - 1)
    return higherIsBetter ? pct : 1 - pct
  }
}

function percentileScores(profiles: KiezFull[], factor: Factor) {
  const { value, higherIsBetter } = FACTORS[factor]
  return percentileScorer(profiles, value, higherIsBetter)
}

/**
 * Scores every PLZ on weighted factors (percentile ranks across all of Berlin) and
 * returns the best matches. PLZs with <100 addresses (parks, industrial) are skipped.
 */
export async function rankKiez(
  input: Loose<Omit<RankKiezInput, "weights">> & {
    weights?: Loose<NonNullable<RankKiezInput["weights"]>> | null
  } = {},
) {
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
        (input.outsideRing == null || input.outsideRing === !p.insideRing) &&
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
        insideRing: p.insideRing,
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

/**
 * Landing page: the best family Kieze outside the Ring (kitas, schools, safety,
 * air, nature), each with its photo, plus the total PLZ count.
 */
export async function getHomeHighlights() {
  const [profiles, ranked] = await Promise.all([
    getKiezProfiles(),
    rankKiez({
      weights: { kitas: 4, schools: 4, safety: 3, air: 3, nature: 3 },
      outsideRing: true,
      minAbiturTier: "OK",
      limit: 3,
    }),
  ])
  const byPlz = new Map(profiles.map((p) => [p.plz, p]))
  return {
    totalKieze: profiles.length,
    outsideRing: profiles.filter((p) => !p.insideRing).length,
    gems: ranked.results.map((r) => {
      const p = byPlz.get(r.plz)!
      return {
        ...r,
        photo: withPhotoOverride(
          r.plz,
          p.photoUrl
            ? {
                url: p.photoUrl,
                title: p.photoTitle,
                author: p.photoAuthor,
                license: p.photoLicense,
                page: p.photoPage,
              }
            : null,
        ),
      }
    }),
  }
}
export type HomeHighlights = Awaited<ReturnType<typeof getHomeHighlights>>
export type HomeGem = HomeHighlights["gems"][number]

/** Compact, rounded summary of a profile (what the LLM and UI usually need). */
function kiezFacts(p: KiezFull) {
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
    greenPct1km: round(p.greenShare1km == null ? null : p.greenShare1km * 100),
    waterPct1km: round(p.waterShare1km == null ? null : p.waterShare1km * 100),
    parks1km: p.parks1km,
    parkAreaHa1km: round(p.parkAreaM2 == null ? null : p.parkAreaM2 / 10_000),
    nearestPark: p.nearestParkName
      ? `${p.nearestParkName} (${round(p.nearestParkKm, 1)} km)`
      : null,
    cafes1km: p.cafes1km,
    playgrounds1km: p.playgrounds1km,
  }
}

export async function getKiezDetail(plz: number) {
  const profile = await getKiezFull(plz)
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

// ─── Planungsraum (the finer unit, 542 areas) ────────────────────────────────

/** A Planungsraum row plus the readable label, photo and OSM counts of its dominant PLZ. */
type PlanungsraumFull = Planungsraum & {
  ortsteil: string | null
  /** OSM, within 1 km of the dominant PLZ's centroid: shared by every area of that PLZ */
  parks1kmPlz: number | null
  cafes1kmPlz: number | null
  playgrounds1kmPlz: number | null
  photoUrl: string | null
  photoAuthor: string | null
  photoLicense: string | null
  photoPage: string | null
  insideRing: boolean
}

export async function getPlanungsraeume(): Promise<PlanungsraumFull[]> {
  const [rows, ring] = await Promise.all([
    db
      .select({
        ...getTableColumns(planungsraum),
        ortsteil: kiezProfiles.ortsteil,
        photoUrl: kiezEnrichment.photoUrl,
        photoAuthor: kiezEnrichment.photoAuthor,
        photoLicense: kiezEnrichment.photoLicense,
        photoPage: kiezEnrichment.photoPage,
        parks1kmPlz: kiezEnrichment.parks1km,
        cafes1kmPlz: kiezEnrichment.cafes1km,
        playgrounds1kmPlz: kiezEnrichment.playgrounds1km,
      })
      .from(planungsraum)
      .leftJoin(kiezProfiles, eq(kiezProfiles.plz, planungsraum.dominantPlz))
      .leftJoin(
        kiezEnrichment,
        eq(kiezEnrichment.plz, planungsraum.dominantPlz),
      )
      .orderBy(asc(planungsraum.plrId)),
    getRingPolygon(),
  ])
  return rows.map((r) => ({
    ...r,
    insideRing: ring.length > 2 && pointInPolygon(r.lat, r.lon, ring),
  }))
}

type PlrFactor = keyof NonNullable<RankPlanungsraumInput["weights"]>
type Hobby = NonNullable<RankPlanungsraumInput["hobbies"]>[number]
const LOW_TO_HIGH = ["gering", "mittel", "hoch"] as const
const POOR_TO_GOOD = ["schlecht", "mittel", "gut"] as const
/** Position of an ordinal Umweltatlas category, null if missing. */
function ordinal(levels: readonly string[], v: string | null) {
  const i = v == null ? -1 : levels.indexOf(v)
  return i < 0 ? null : i
}
const HOBBY_FLAG: Record<Hobby, (p: Planungsraum) => boolean | null> = {
  yoga: (p) => p.hasYogaStudiosPlz,
  gym: (p) => p.hasGymPlz,
  bouldering: (p) => p.hasBoulderingPlz,
}
/** Kita places per child under 6, only where the (allocated) population is big enough to mean something. */
const kitaPlacesPerChild = (p: Planungsraum) =>
  p.nPopulationUnder6 != null && p.nPopulationUnder6 >= 30
    ? (p.totalKitaCapacity ?? 0) / p.nPopulationUnder6
    : null

const PLR_FACTORS: Record<
  PlrFactor,
  {
    value: (p: PlanungsraumFull, hobbies: Hobby[]) => number | null
    higherIsBetter: boolean
  }
> = {
  affordability: {
    value: (p) => p.rentPerM2KaltSynthetic,
    higherIsBetter: false,
  },
  // PLR-exact where the area has Abitur schools (~61 areas), else the Bezirk value
  schools: {
    value: (p) => p.abiturVsPeerPlr ?? p.abiturVsPeerBezirk,
    higherIsBetter: true,
  },
  safety: { value: (p) => p.crimeRatePer10k, higherIsBetter: false },
  noise: {
    value: (p) => ordinal(LOW_TO_HIGH, p.ugLaerm),
    higherIsBetter: false,
  },
  air: { value: (p) => ordinal(LOW_TO_HIGH, p.ugLuft), higherIsBetter: false },
  green: {
    value: (p) => ordinal(POOR_TO_GOOD, p.ugGruenversorgung),
    higherIsBetter: true,
  },
  heat: {
    value: (p) => ordinal(LOW_TO_HIGH, p.ugThermisch),
    higherIsBetter: false,
  },
  kitas: { value: kitaPlacesPerChild, higherIsBetter: true },
  transit: { value: (p) => p.transitDistanceKm, higherIsBetter: false },
  locationQuality: { value: (p) => p.pctWohnlageGut, higherIsBetter: true },
  hobbies: {
    value: (p, hobbies) =>
      hobbies.length
        ? hobbies.filter((h) => HOBBY_FLAG[h](p)).length / hobbies.length
        : null,
    higherIsBetter: true,
  },
  nearCenter: {
    value: (p) => p.distanceFromCenterKm,
    higherIsBetter: false,
  },
  // PLZ-level (every area of a PLZ shares the value), see PlanungsraumFull
  parks: { value: (p) => p.parks1kmPlz, higherIsBetter: true },
  cafes: { value: (p) => p.cafes1kmPlz, higherIsBetter: true },
  playgrounds: { value: (p) => p.playgrounds1kmPlz, higherIsBetter: true },
}
/** Used when no weights are given: the area's own factors, without the preference-specific and PLZ-level ones. */
const PLR_DEFAULT_FACTORS = (Object.keys(PLR_FACTORS) as PlrFactor[]).filter(
  (f) =>
    !["hobbies", "nearCenter", "parks", "cafes", "playgrounds"].includes(f),
)

/** Compact, rounded summary of a Planungsraum (what the LLM and UI usually need). */
function plrFacts(p: PlanungsraumFull) {
  const under6 = p.nPopulationUnder6
  const perChild = kitaPlacesPerChild(p)
  return {
    rentPerM2KaltSynthetic: round(p.rentPerM2KaltSynthetic, 2),
    /** Real 2023 listings, inherited from the dominant PLZ */
    buyPricePerM2Real2023: round(p.buyPricePerM2Real),
    dominantWohnlage: p.dominantWohnlage,
    pctWohnlageGut: round(p.pctWohnlageGut, 1),
    noise: p.ugLaerm,
    airPollution: p.ugLuft,
    greenSupply: p.ugGruenversorgung,
    heat: p.ugThermisch,
    multiBurden: p.ugMehrfachbelastungUmwelt,
    nKitas: p.nKitas,
    kitaPlaces: p.totalKitaCapacity,
    kitaPlacesPer100Under6: perChild == null ? null : round(perChild * 100),
    crimePer10kBezirk: round(p.crimeRatePer10k),
    /** "Name (line, N min walk)" at 12 min per km */
    nearestStation: p.nearestTransitStation
      ? `${p.nearestTransitStation} (${p.nearestTransitLine}, ${Math.max(1, Math.round((p.transitDistanceKm ?? 0) * 12))} min walk)`
      : null,
    distanceFromCenterKm: round(p.distanceFromCenterKm, 1),
    /** Estimated ÖPNV minutes to Alexanderplatz (same fit as the commute estimate) */
    minutesToCentre:
      p.distanceFromCenterKm == null
        ? null
        : estimateTransitMinutes(p.distanceFromCenterKm),
    population: p.nPopulation,
    pctUnder6:
      under6 != null && p.nPopulation
        ? round((under6 / p.nPopulation) * 100, 1)
        : null,
    abiturSchoolsHere: p.nAbiturSchoolsInPlr,
    // counted inside the area itself ...
    yogaStudios: p.nYogaStudios,
    kinderarzt: p.nKinderarzt,
    gyms: p.nGym,
    bouldering: p.nBouldering,
    // ... and in its dominant PLZ, which is what the hobbies/requireKinderarzt filters use
    yogaStudiosInPlz: p.nYogaStudiosPlz,
    kinderarztInPlz: p.nKinderarztPlz,
    gymsInPlz: p.nGymPlz,
    boulderingInPlz: p.nBoulderingPlz,
    parks1kmPlz: p.parks1kmPlz,
    cafes1kmPlz: p.cafes1kmPlz,
    playgrounds1kmPlz: p.playgrounds1kmPlz,
  }
}

type RankPlrInput = Loose<Omit<RankPlanungsraumInput, "weights">> & {
  weights?: Loose<NonNullable<RankPlanungsraumInput["weights"]>> | null
}

/**
 * Scores every Planungsraum on weighted factors (percentile ranks across all of Berlin) and
 * returns the best matches. Areas with <100 addresses (new-build sites, parks) are skipped.
 * Most factors are ordinal (Umweltatlas) or Bezirk-level, so ties are common; see `PLR_FACTORS`.
 */
export async function rankPlanungsraum(input: RankPlrInput = {}) {
  const { weightsUsed, results } = await scorePlanungsraeume(input)
  return {
    weightsUsed,
    candidates: results.length,
    results: results.slice(0, clampLimit(input.limit, 20)),
  }
}

/** Every Planungsraum that passes the filters, best score first (`rankPlanungsraum` without the limit). */
async function scorePlanungsraeume(input: RankPlrInput) {
  const all = (await getPlanungsraeume()).filter((p) => p.nAddresses >= 100)
  const hobbies = input.hobbies ?? []
  const given = (
    Object.entries(input.weights ?? {}).filter(
      ([, w]) => w != null && w > 0,
    ) as [PlrFactor, number][]
  ).filter(([f]) => f !== "hobbies" || hobbies.length > 0)
  const weights = given.length
    ? given
    : PLR_DEFAULT_FACTORS.map((f) => [f, 1] as [PlrFactor, number])
  const scorers = weights.map(([f, w]) => {
    const { value, higherIsBetter } = PLR_FACTORS[f]
    return {
      f,
      w,
      score: percentileScorer(all, (p) => value(p, hobbies), higherIsBetter),
    }
  })
  const totalW = weights.reduce((s, [, w]) => s + w, 0)

  let apt: Map<string, { matching: number; medianWarmmiete: number }> | null =
    null
  if (input.apartment) {
    const a = input.apartment
    const rows = await db
      .select({
        plrId: rentals.plrId,
        matching: count(),
        medianWarmmiete: median(rentals.warmmiete),
      })
      .from(rentals)
      .where(
        and(
          a.maxWarmmiete != null
            ? lte(rentals.warmmiete, a.maxWarmmiete)
            : undefined,
          a.minRooms != null ? gte(rentals.rooms, a.minRooms) : undefined,
          a.minAreaM2 != null ? gte(rentals.areaM2, a.minAreaM2) : undefined,
          a.balcony ? eq(rentals.hasBalcony, true) : undefined,
        ),
      )
      .groupBy(rentals.plrId)
    apt = new Map(rows.filter((r) => r.plrId).map((r) => [r.plrId!, r]))
  }

  const results = all
    .filter(
      (p) =>
        (!input.bezirke?.length || input.bezirke.includes(p.bezirk as never)) &&
        (input.maxRentPerM2 == null ||
          (p.rentPerM2KaltSynthetic ?? Infinity) <= input.maxRentPerM2) &&
        (input.maxTransitKm == null ||
          (p.transitDistanceKm ?? Infinity) <= input.maxTransitKm) &&
        (input.minDistanceFromCenterKm == null ||
          (p.distanceFromCenterKm ?? 0) >= input.minDistanceFromCenterKm) &&
        (input.maxDistanceFromCenterKm == null ||
          (p.distanceFromCenterKm ?? Infinity) <=
            input.maxDistanceFromCenterKm) &&
        (input.outsideRing == null || input.outsideRing === !p.insideRing) &&
        (!input.requireKita || (p.nKitas ?? 0) > 0) &&
        (!input.requireKinderarzt || p.hasKinderarztPlz === true) &&
        (!input.requirePlayground || (p.playgrounds1kmPlz ?? 0) > 0) &&
        (!input.requirePark || (p.parks1kmPlz ?? 0) > 0) &&
        (!apt || (apt.get(p.plrId)?.matching ?? 0) > 0),
    )
    .map((p) => {
      const factorScores = Object.fromEntries(
        scorers.map(({ f, score }) => [f, Math.round(score(p) * 100)]),
      )
      const score =
        scorers.reduce((s, { w, score }) => s + w * score(p), 0) / totalW
      return {
        plrId: p.plrId,
        plrName: p.plrName,
        ortsteil: p.ortsteil,
        bezirk: p.bezirk,
        dominantPlz: p.dominantPlz,
        insideRing: p.insideRing,
        lat: p.lat,
        lon: p.lon,
        photo: withPhotoOverride(
          p.dominantPlz,
          p.photoUrl
            ? {
                url: p.photoUrl,
                author: p.photoAuthor,
                license: p.photoLicense,
                page: p.photoPage,
              }
            : null,
        ),
        score: Math.round(score * 100),
        factorScores,
        facts: plrFacts(p),
        matchingRentals: apt?.get(p.plrId) ?? null,
      }
    })
    .sort((a, b) => b.score - a.score)

  return { weightsUsed: Object.fromEntries(weights), results }
}

export async function getPlanungsraumDetail(plrId: string) {
  const profile = (await getPlanungsraeume()).find((p) => p.plrId === plrId)
  if (!profile) return null
  const [rentByRooms, pois] = await Promise.all([
    db
      .select({
        rooms: rentals.rooms,
        listings: count(),
        medianWarmmiete: median(rentals.warmmiete),
        avgRentPerM2Kalt: avgOf(rentals.rentPerM2Kalt),
      })
      .from(rentals)
      .where(eq(rentals.plrId, plrId))
      .groupBy(rentals.rooms)
      .orderBy(rentals.rooms),
    db
      .select({
        category: poiLocations.category,
        name: poiLocations.name,
        lat: poiLocations.lat,
        lon: poiLocations.lon,
      })
      .from(poiLocations)
      .where(eq(poiLocations.plrId, plrId))
      .orderBy(asc(poiLocations.category), asc(poiLocations.name)),
  ])
  return {
    ...profile,
    facts: plrFacts(profile),
    rentByRooms: rentByRooms.map((r) => ({
      ...r,
      medianWarmmiete: round(r.medianWarmmiete),
      avgRentPerM2Kalt: round(r.avgRentPerM2Kalt, 2),
    })),
    /** Every Kita and OSM point inside the area, for the per-Kiez map */
    pois,
  }
}

/**
 * Median (synthetic) warm rent per month for a typical flat of `rooms` rooms in each area.
 * Uses the closest room count the area has listings for; `null` when it has none.
 */
export async function getTypicalRents(plrIds: string[], rooms: number) {
  if (!plrIds.length) return new Map<string, { rooms: number; warm: number }>()
  const rows = await db
    .select({
      plrId: rentals.plrId,
      rooms: rentals.rooms,
      warm: median(rentals.warmmiete),
    })
    .from(rentals)
    .where(inArray(rentals.plrId, plrIds))
    .groupBy(rentals.plrId, rentals.rooms)
  const best = new Map<string, { rooms: number; warm: number }>()
  for (const r of rows) {
    if (!r.plrId || r.rooms == null || r.warm == null) continue
    const cur = best.get(r.plrId)
    if (!cur || Math.abs(r.rooms - rooms) < Math.abs(cur.rooms - rooms))
      best.set(r.plrId, { rooms: r.rooms, warm: Math.round(r.warm) })
  }
  return best
}

/** Example (synthetic) rentals inside a Planungsraum; the closest available room count fills in. */
export async function getPlanungsraumRentals(input: {
  plrId: string
  rooms?: number | null
  limit?: number | null
}) {
  const wanted = input.rooms ?? 2
  const rows = await db
    .select({
      id: rentals.id,
      dateListed: rentals.dateListed,
      ortsteil: rentals.ortsteil,
      rooms: rentals.rooms,
      areaM2: rentals.areaM2,
      floor: rentals.floor,
      totalFloors: rentals.totalFloors,
      hasBalcony: rentals.hasBalcony,
      hasLift: rentals.hasLift,
      condition: rentals.condition,
      buildingEra: rentals.buildingEra,
      kaltmiete: rentals.kaltmiete,
      warmmiete: rentals.warmmiete,
      rentPerM2Kalt: rentals.rentPerM2Kalt,
    })
    .from(rentals)
    .where(eq(rentals.plrId, input.plrId))
    .orderBy(sql`abs(${rentals.rooms} - ${wanted})`, desc(rentals.dateListed))
    .limit(clampLimit(input.limit ?? 3, 10))
  return {
    /** true when fewer than `limit` listings have exactly the wanted room count */
    roomsRelaxed: rows.some((r) => r.rooms !== wanted),
    results: rows,
  }
}

/** Planungsraum polygons as a GeoJSON FeatureCollection (all 542, or only `plrIds`), for maps. */
export async function getPlanungsraumBoundaries(plrIds?: string[] | null) {
  const rows = await db
    .select()
    .from(planungsraumBoundaries)
    .where(
      plrIds?.length
        ? inArray(planungsraumBoundaries.plrId, plrIds)
        : undefined,
    )
    .orderBy(asc(planungsraumBoundaries.plrId))
  return {
    type: "FeatureCollection" as const,
    features: rows.map((r) => ({
      type: "Feature" as const,
      id: r.plrId,
      properties: { plr_id: r.plrId, plr_name: r.plrName },
      geometry: r.geometry,
    })),
  }
}

/** Padding around each area for its map points, in degrees (~0.9 km north–south) */
const AREA_MAP_PAD_DEG = 0.008

/**
 * The finder's results map: each area's polygon and bounding box, plus the Kita / Kinderarzt /
 * hobby points in and around it (our own `poi_locations`; parks, schools, playgrounds, cafés and
 * stops come from the basemap tiles). Areas keep the order of `plrIds`.
 */
export async function getResultsMap(plrIds: string[]) {
  const ids = plrIds.slice(0, 10)
  if (!ids.length) return { areas: [], pois: [] }
  const shapes = await getPlanungsraumBoundaries(ids)
  const areas = ids.flatMap((id) => {
    const f = shapes.features.find((x) => x.id === id)
    if (!f) return []
    const pts = JSON.stringify(f.geometry)
      .match(/-?\d+\.\d+/g)!
      .map(Number)
    const lons = pts.filter((_, i) => i % 2 === 0)
    const lats = pts.filter((_, i) => i % 2 === 1)
    return [
      {
        plrId: id,
        plrName: f.properties.plr_name,
        geometry: f.geometry,
        /** [west, south, east, north] */
        bbox: [
          Math.min(...lons),
          Math.min(...lats),
          Math.max(...lons),
          Math.max(...lats),
        ] as [number, number, number, number],
      },
    ]
  })
  const near = areas.map(({ bbox: [w, s, e, n] }) =>
    and(
      gte(poiLocations.lon, w - AREA_MAP_PAD_DEG * 1.6),
      lte(poiLocations.lon, e + AREA_MAP_PAD_DEG * 1.6),
      gte(poiLocations.lat, s - AREA_MAP_PAD_DEG),
      lte(poiLocations.lat, n + AREA_MAP_PAD_DEG),
    ),
  )
  const pois = near.length
    ? await db
        .select({
          category: poiLocations.category,
          name: poiLocations.name,
          lat: poiLocations.lat,
          lon: poiLocations.lon,
          plrId: poiLocations.plrId,
        })
        .from(poiLocations)
        .where(or(...near))
    : []
  return { areas, pois }
}
export type ResultsMap = Awaited<ReturnType<typeof getResultsMap>>

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
  /** Preferred when the street name exists in several postcodes */
  plz?: number | null,
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
      .orderBy(plz ? sql`${addresses.plz} = ${plz} desc` : sql`1`)
      .limit(1)
    if (hit) {
      const profile = await getKiezFull(hit.plz)
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
export type KiezRow = KiezFull
export type PlanungsraumRow = PlanungsraumFull

// ─── Commute (BVG) ───────────────────────────────────────────────────────────

/** Geocode from our own data when the BVG API is down: address, station or PLZ. */
/**
 * "Harzer Str. 42, 12059 Berlin" → street "Harzer Str.", number "42", PLZ 12059.
 * Also takes "Friedrichstraße 100", "Harzer Str. 42 Berlin" and "12059".
 */
function parseAddress(query: string) {
  const plzMatch = query.match(/\b(1[0-4]\d{3})\b/)
  const rest = query
    .replace(/\b1[0-4]\d{3}\b/, " ")
    .replace(/\b(berlin|deutschland|germany)\b/gi, " ")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)[0]
    ?.replace(/\s+/g, " ")
  const m = rest?.match(/^(.+?)\s+(\d+\s*[a-z]?)$/i)
  return {
    street: m ? m[1] : (rest ?? ""),
    houseNumber: m ? m[2] : null,
    plz: plzMatch ? Number(plzMatch[1]) : null,
  }
}

/** Offline geocoder for when the BVG API is down: our 400k addresses, then stations, streets, PLZ. */
async function geocodeLocal(query: string): Promise<Place | null> {
  const q = query.trim()
  const { street, houseNumber, plz } = parseAddress(q)
  if (street && houseNumber) {
    const r = await lookupAddress(street, houseNumber, plz)
    if (r.found === "address")
      return { lat: r.address.lat, lon: r.address.lon, name: q }
  }
  if (street) {
    const [station] = await db
      .select()
      .from(transitStations)
      .where(sql`${transitStations.stationName} ilike ${`%${street}%`}`)
      .limit(1)
    if (station)
      return { lat: station.lat, lon: station.lon, name: station.stationName }
    const [onStreet] = await db
      .select({ lat: avgOf(addresses.lat), lon: avgOf(addresses.lon) })
      .from(addresses)
      .where(
        and(
          eq(
            streetKey(addresses.strasse),
            normStreet(street).replace(/[\s-]/g, ""),
          ),
          plz ? eq(addresses.plz, plz) : undefined,
        ),
      )
    if (onStreet?.lat) return { lat: onStreet.lat, lon: onStreet.lon, name: q }
  }
  if (plz) {
    const p = await getKiezFull(plz)
    if (p) return { lat: p.lat, lon: p.lon, name: `PLZ ${plz}` }
  }
  return null
}

const straightKm = (
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
) => 111.32 * Math.hypot(a.lat - b.lat, (a.lon - b.lon) * COS_LAT)
/**
 * Door-to-door ÖPNV minutes from straight-line km. Fitted on 72 live BVG journeys
 * (weekday 08:00, 1–18 km): median error ~0, one in four trips is 6+ min slower.
 */
const estimateTransitMinutes = (km: number) => Math.round(14.6 + 2.6 * km)
/** 75th percentile of (live − estimate) in the same fit */
const ESTIMATE_MARGIN_MIN = 6

/** Our own address data first; BVG only for what it can't place (landmarks, POIs). */
const geocode = async (query: string) =>
  (await geocodeLocal(query)) ?? (await bvgGeocode(query))

/**
 * Door-to-door public transport time from each candidate PLZ (centroid) to a
 * work place, next weekday morning. Live BVG journeys when the API answers,
 * otherwise a straight-line estimate flagged `estimated: true`.
 */
export async function getCommute({ to, plzs, departAt }: CommuteInput) {
  const dest = await geocode(to)
  if (!dest) return { error: `Could not find "${to}" in Berlin` }
  const profiles = await getKiezProfiles()
  const homes = [...new Set(plzs)]
    .slice(0, 10)
    .map((plz) => profiles.find((p) => p.plz === plz))
    .filter((p) => p != null)
  const results = await Promise.all(
    homes.map(async (p) => {
      const from = { lat: p.lat, lon: p.lon, name: `${p.plz} Berlin` }
      const j = await bvgJourney(from, dest, departAt)
      const km = straightKm(p, dest)
      return {
        plz: p.plz,
        ortsteil: p.ortsteil,
        straightLineKm: round(km, 1),
        ...(j
          ? { ...j, estimated: false }
          : { minutes: estimateTransitMinutes(km), estimated: true }),
      }
    }),
  )
  return {
    to: dest.name,
    source: results.some((r) => !r.estimated)
      ? "BVG timetable (v6.bvg.transport.rest)"
      : "Estimate from straight-line distance (BVG API unavailable)",
    results: results.sort((a, b) => a.minutes - b.minutes),
  }
}

/**
 * The Kiez finder: ranks Planungsraeume like `rankPlanungsraum`, then keeps only areas from which
 * every important place (work, school, …) is within `maxCommuteMin` by ÖPNV. The filter uses the
 * straight-line estimate for all 500+ areas; the shown results then get a live BVG journey where the
 * API answers (`estimated: false`), which can come out above the limit (`overLimit`).
 * If no area fits, returns the areas with the shortest worst commute instead (`relaxed: true`).
 */
export async function findKiezMatches(input: {
  rank: RankPlrInput
  places: { kind: string; address: string }[]
  maxCommuteMin: number
  limit?: number | null
}) {
  const [{ weightsUsed, results }, places] = await Promise.all([
    scorePlanungsraeume(input.rank),
    Promise.all(
      input.places
        .slice(0, 3)
        .map(async (pl) => ({ ...pl, at: await geocode(pl.address) })),
    ),
  ])
  const found = places.filter((p) => p.at != null)
  const withCommutes = results.map((r) => {
    const commutes = found.map((p) => {
      const km = straightKm(r, p.at!)
      return {
        kind: p.kind,
        to: p.at!.name,
        minutes: estimateTransitMinutes(km),
        estimated: true,
        lines: [] as string[],
        overLimit: false,
      }
    })
    return {
      ...r,
      commutes,
      worstCommute: Math.max(0, ...commutes.map((c) => c.minutes)),
    }
  })
  const within = withCommutes.filter(
    (r) => r.worstCommute <= input.maxCommuteMin,
  )
  const relaxed = within.length === 0 && withCommutes.length > 0
  const limit = clampLimit(input.limit, 6)
  // The estimate is a median, so half of the areas that pass it are really slower.
  // Prefer areas that pass with the 75th-percentile error (+6 min) for the live check.
  const safe = within.filter(
    (r) => r.worstCommute + ESTIMATE_MARGIN_MIN <= input.maxCommuteMin,
  )
  const pool = (
    relaxed
      ? [...withCommutes].sort((a, b) => a.worstCommute - b.worstCommute)
      : [...safe, ...within.filter((r) => !safe.includes(r))]
  ).slice(0, limit * 2)

  // Live journeys refine the estimate for the pool (instant null while BVG is down)
  await Promise.all(
    pool.flatMap((r) =>
      r.commutes.map(async (c, i) => {
        const j = await bvgJourney(
          { lat: r.lat, lon: r.lon, name: r.plrName },
          found[i].at!,
        )
        if (!j) return
        Object.assign(c, {
          minutes: j.minutes,
          lines: j.lines,
          estimated: false,
          overLimit: j.minutes > input.maxCommuteMin,
        })
      }),
    ),
  )
  for (const r of pool)
    r.worstCommute = Math.max(0, ...r.commutes.map((c) => c.minutes))
  // Stable sort: areas that really fit first, each group still by score
  const top = pool
    .map((r) => ({ r, over: r.commutes.some((c) => c.overLimit) }))
    .sort((a, b) => Number(a.over) - Number(b.over))
    .map(({ r }) => r)
    .slice(0, limit)

  return {
    weightsUsed,
    candidates: results.length,
    withinCommute: within.length,
    relaxed,
    places: places.map((p) => ({
      kind: p.kind,
      address: p.address,
      foundAs: p.at?.name ?? null,
    })),
    results: top,
  }
}
export type KiezMatches = Awaited<ReturnType<typeof findKiezMatches>>
export type KiezMatch = KiezMatches["results"][number]
