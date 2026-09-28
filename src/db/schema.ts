/**
 * Tables mirror the CSVs in the data repo (github.com/esakovaa/tech-battle).
 * DB column names match the CSV headers wherever possible, so the seed can map
 * them automatically. Renames are listed in `seed.ts`.
 *
 * Trust levels (see the data repo's "Kiez Profile Master Table/README.md"):
 * - REAL: addresses (Wohnlage), kitas, schools (Abitur 2025), realListings2023, crimeStats (≤2019)
 * - SYNTHETIC: rentals, sales, newConstruction, kiezPricesMonthly. Useful for relative
 *   comparison. Absolute € levels run ~25–40% below real listings.
 */
import { sql } from "drizzle-orm"
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"

/** One row per Berlin postal code (193). The main unit for filtering and ranking neighbourhoods. */
export const kiezProfiles = pgTable("kiez_profiles", {
  plz: integer("plz").primaryKey(),
  lat: doublePrecision("lat").notNull(),
  lon: doublePrecision("lon").notNull(),
  nAddresses: integer("n_addresses").notNull(),
  bezirk: text("bezirk").notNull(),
  /** Human-readable label, derived in the seed: most common Ortsteil of its listings, else Planungsraum */
  ortsteil: text("ortsteil"),
  // Wohnlage (Mietspiegel location quality), exact PLZ, real
  pctWohnlageEinfach: real("pct_wohnlage_einfach"),
  pctWohnlageMittel: real("pct_wohnlage_mittel"),
  pctWohnlageGut: real("pct_wohnlage_gut"),
  dominantWohnlage: text("dominant_wohnlage"),
  // Kitas, exact PLZ, real
  nKitas: integer("n_kitas"),
  totalKitaCapacity: integer("total_kita_capacity"),
  // School construction/expansion projects: capacity, not quality
  nSchoolConstructionProjects: integer("n_school_construction_projects"),
  nUniqueSchoolsWithProjects: integer("n_unique_schools_with_projects"),
  totalPlannedSchoolCapacity: integer("total_planned_school_capacity"),
  /** Bezirk-level, inherited, 2017–2019 average: directional only */
  crimeTotalAvg: real("crime_total_avg_2017_2019"),
  // Air quality: nearest of 15 stations, Feb 2026 only
  nearestAirStation: text("nearest_air_station"),
  airStationDistanceKm: real("air_station_distance_km"),
  airCoAvg: real("air_co_avg"),
  airNo2Avg: real("air_no2_avg"),
  airO3Avg: real("air_o3_avg"),
  airPm10Avg: real("air_pm10_avg"),
  airPm25Avg: real("air_pm25_avg"),
  // Prices
  rentPerM2KaltSynthetic: real("rent_per_m2_kalt_avg_synthetic"),
  nRentalListingsSynthetic: integer("n_rental_listings_synthetic"),
  /** Real listings, April 2023 */
  buyPricePerM2Real: real("buy_price_per_m2_avg_real"),
  nRealListings: integer("n_real_listings"),
  buyPricePerM2Synthetic: real("buy_price_per_m2_avg_synthetic"),
  nSyntheticSalesListings: integer("n_synthetic_sales_listings"),
  newConstructionPricePerM2: real("new_construction_price_per_m2_avg"),
  nNewConstructionListings: integer("n_new_construction_listings"),
  // Commute (135-station list, not full VBB network)
  nearestTransitStation: text("nearest_transit_station"),
  nearestTransitLine: text("nearest_transit_line"),
  transitDistanceKm: real("transit_distance_km"),
  // Abitur 2025, Bezirk-level, inherited. Lower grade = better; higher vs-peer = better.
  abiturMeanGradeBezirk: real("abitur_mn_scls_bezirk_avg"),
  abiturVsPeerBezirk: real("abitur_performance_vs_peer_bezirk_avg"),
  nAbiturSchoolsInBezirk: integer("n_abitur_schools_in_bezirk"),
  /** AMAZING | GOOD | OK | BAD */
  abiturTierBezirk: text("abitur_tier_bezirk"),
})

/** 2025 Abitur results per school (Oberstufe only, no Grundschulen). Only 63/185 have a PLZ. */
export const schools = pgTable(
  "schools",
  {
    bsn: text("bsn").primaryKey(),
    name: text("name"),
    plz: integer("plz"),
    bezirk: text("bezirk").notNull(),
    schoolType: text("school_type").notNull(),
    nCandidates: integer("n_candidates"),
    /** Share of candidates who passed (source: n.best) */
    passRate: real("pass_rate"),
    nGraded: integer("n_graded"),
    /** Average Abitur grade (source: mn.scls). 1.0 best, 4.0 worst */
    meanGrade: real("mean_grade"),
    /** State-wide average for the same school type (source: mn.vgl) */
    peerBenchmark: real("peer_benchmark"),
    /** peerBenchmark − meanGrade. Positive = beats its peer group */
    performanceVsPeer: real("performance_vs_peer"),
    tierRawGrade: text("tier_raw_grade"),
    /** Preferred tier: AMAZING | GOOD | OK | BAD relative to peer group */
    tierVsPeer: text("tier_vs_peer"),
  },
  (t) => [
    index("schools_bezirk_idx").on(t.bezirk),
    index("schools_plz_idx").on(t.plz),
  ],
)

/** Every Berlin address (~400k) with its Mietspiegel 2026 Wohnlage. Real, daten.berlin.de. */
export const addresses = pgTable(
  "addresses",
  {
    schluessel: text("schluessel").primaryKey(),
    bezirk: text("bezirk").notNull(),
    plz: integer("plz").notNull(),
    strasse: text("strasse").notNull(),
    /** House number without leading zeros, e.g. "12A" */
    hnr: text("hnr").notNull(),
    /** einfach | mittel | gut */
    wohnlage: text("wohnlage").notNull(),
    /** West | Ost */
    stadtteil: text("stadtteil").notNull(),
    /** Planungsraum (LOR) name */
    plrName: text("plr_name").notNull(),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
  },
  (t) => [
    index("addresses_plz_idx").on(t.plz),
    index("addresses_street_idx").on(
      sql`regexp_replace(lower(${t.strasse}), '[[:space:]-]', '', 'g')`,
      t.hnr,
    ),
  ],
)

// Shared by the three synthetic listing tables. plz/wohnlage/plrName are derived in
// the seed from the nearest real address.
const listingLocation = {
  dateListed: date("date_listed").notNull(),
  ortsteil: text("ortsteil").notNull(),
  bezirk: text("bezirk").notNull(),
  lat: doublePrecision("lat").notNull(),
  lon: doublePrecision("lon").notNull(),
  plz: integer("plz").notNull(),
  wohnlage: text("wohnlage").notNull(),
  plrName: text("plr_name").notNull(),
  rooms: integer("rooms").notNull(),
  areaM2: real("area_m2").notNull(),
  floor: integer("floor").notNull(),
  totalFloors: integer("total_floors").notNull(),
  energyClass: text("energy_class").notNull(),
  hasLift: boolean("has_lift").notNull(),
  hasBalcony: boolean("has_balcony").notNull(),
  transitStation: text("transit_station").notNull(),
  transitLine: text("transit_line").notNull(),
  transitDistanceMin: integer("transit_distance_min").notNull(),
  toBrandenburgGateKm: real("to_brandenburg_gate_km").notNull(),
}

/** 30k synthetic rental listings, 2020–2026 */
export const rentals = pgTable(
  "rentals",
  {
    id: text("id").primaryKey(),
    ...listingLocation,
    /** low | medium | high */
    kiezPremium: text("kiez_premium").notNull(),
    buildingEra: text("building_era").notNull(),
    position: text("position").notNull(),
    condition: text("condition").notNull(),
    furnished: boolean("furnished").notNull(),
    kaltmiete: integer("kaltmiete_eur_monthly").notNull(),
    nebenkosten: integer("nebenkosten_eur_monthly").notNull(),
    warmmiete: integer("warmmiete_eur_monthly").notNull(),
    rentPerM2Kalt: real("rent_per_m2_kalt_eur").notNull(),
    rentIncludesWarmmiete: boolean("rent_includes_warmmiete").notNull(),
    kautionMonths: integer("kaution_months").notNull(),
  },
  (t) => [
    index("rentals_plz_idx").on(t.plz),
    index("rentals_bezirk_idx").on(t.bezirk),
    index("rentals_rooms_warm_idx").on(t.rooms, t.warmmiete),
  ],
)

/** 50k synthetic resale (secondary market) listings */
export const sales = pgTable(
  "sales",
  {
    id: text("id").primaryKey(),
    ...listingLocation,
    kiezPremium: text("kiez_premium").notNull(),
    yearBuilt: integer("year_built").notNull(),
    buildingEra: text("building_era").notNull(),
    position: text("position").notNull(),
    condition: text("condition").notNull(),
    hasCellar: boolean("has_cellar").notNull(),
    hasParking: boolean("has_parking").notNull(),
    /** walk | tram_bus */
    transitDistanceType: text("transit_distance_type").notNull(),
    priceEur: integer("price_eur").notNull(),
    pricePerM2: integer("price_per_m2_eur").notNull(),
    mortgageRate: real("mortgage_rate_at_listing").notNull(),
  },
  (t) => [
    index("sales_plz_idx").on(t.plz),
    index("sales_bezirk_idx").on(t.bezirk),
    index("sales_rooms_price_idx").on(t.rooms, t.priceEur),
  ],
)

/** 10k synthetic new-build units across 177 projects */
export const newConstruction = pgTable(
  "new_construction",
  {
    id: text("id").primaryKey(),
    ...listingLocation,
    projectId: text("project_id").notNull(),
    projectName: text("project_name").notNull(),
    developer: text("developer").notNull(),
    completionYear: integer("completion_year").notNull(),
    totalProjectUnits: integer("total_project_units").notNull(),
    /** under_construction | ready_within_6m | completed */
    possessionStatus: text("possession_status").notNull(),
    paymentPlan: text("payment_plan").notNull(),
    hasParking: boolean("has_parking").notNull(),
    priceEur: integer("price_eur").notNull(),
    pricePerM2: integer("price_per_m2_eur").notNull(),
    mortgageRate: real("mortgage_rate_at_listing").notNull(),
  },
  (t) => [
    index("new_construction_plz_idx").on(t.plz),
    index("new_construction_bezirk_idx").on(t.bezirk),
  ],
)

/** Synthetic monthly price index per Ortsteil, 2020-01 → 2026-04 */
export const kiezPricesMonthly = pgTable(
  "kiez_prices_monthly",
  {
    id: serial("id").primaryKey(),
    /** "YYYY-MM" */
    yearMonth: text("year_month").notNull(),
    ortsteil: text("ortsteil").notNull(),
    bezirk: text("bezirk").notNull(),
    kiezPremium: text("kiez_premium").notNull(),
    secondaryPricePerM2: integer("secondary_price_per_m2_eur").notNull(),
    newConstructionPricePerM2: integer(
      "new_construction_price_per_m2_eur",
    ).notNull(),
    kaltmietePerM2: real("kaltmiete_per_m2_monthly_eur").notNull(),
    nListingsSecondary: integer("n_listings_secondary").notNull(),
    nListingsNewConstruction: integer("n_listings_new_construction").notNull(),
    nListingsRental: integer("n_listings_rental").notNull(),
    ecbMainRatePct: real("ecb_main_rate_pct").notNull(),
    avgMortgageRatePct: real("avg_mortgage_rate_pct").notNull(),
  },
  (t) => [
    uniqueIndex("kiez_prices_month_ortsteil_idx").on(t.ortsteil, t.yearMonth),
    index("kiez_prices_bezirk_idx").on(t.bezirk, t.yearMonth),
  ],
)

/** 135 U-/S-Bahn stations (subset of the VBB network) */
export const transitStations = pgTable("transit_stations", {
  stationName: text("station_name").primaryKey(),
  line: text("line").notNull(),
  lat: doublePrecision("lat").notNull(),
  lon: doublePrecision("lon").notNull(),
  yearOpened: integer("year_opened"),
  toBrandenburgGateKm: real("to_brandenburg_gate_km"),
})

/** 2,905 Kitas with capacity. Real, Kita WFS. */
export const kitas = pgTable(
  "kitas",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    bezirk: text("bezirk").notNull(),
    plz: integer("plz").notNull(),
    strasse: text("strasse").notNull(),
    hnr: text("hnr").notNull(),
    phone: text("phone"),
    website: text("website"),
    /** Number of places */
    capacity: integer("capacity"),
    kitaType: text("kita_type").notNull(),
    /** Pedagogical approach, e.g. "Offene-Arbeit/Situationsansatz" */
    pedagogy: text("pedagogy"),
    traegerName: text("traeger_name").notNull(),
    /** freie Träger | Eigenbetriebe */
    traegerType: text("traeger_type").notNull(),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
  },
  (t) => [index("kitas_plz_idx").on(t.plz)],
)

/** Real sale listings scraped from immowelt, April 2023 (Berlin PLZs only) */
export const realListings2023 = pgTable(
  "real_listings_2023",
  {
    url: text("url").primaryKey(),
    plz: integer("plz").notNull(),
    priceEur: integer("price_eur").notNull(),
    areaM2: real("area_m2").notNull(),
    rooms: real("rooms"),
    pricePerM2: real("price_per_m2").notNull(),
    fee: real("fee"),
    energy: text("energy"),
    heating: text("heating"),
    constructionYear: integer("construction_year"),
    level: integer("level"),
  },
  (t) => [index("real_listings_plz_idx").on(t.plz)],
)

/** Reported crimes per Bezirksregion and year, 2012–2019. Real but dated. */
export const crimeStats = pgTable(
  "crime_stats",
  {
    year: integer("year").notNull(),
    bezirk: text("bezirk").notNull(),
    /** LOR Bezirksregion code */
    code: integer("code").notNull(),
    location: text("location").notNull(),
    robbery: integer("robbery").notNull(),
    streetRobbery: integer("street_robbery").notNull(),
    injury: integer("injury").notNull(),
    aggAssault: integer("agg_assault").notNull(),
    threat: integer("threat").notNull(),
    theft: integer("theft").notNull(),
    car: integer("car").notNull(),
    fromCar: integer("from_car").notNull(),
    bike: integer("bike").notNull(),
    burglary: integer("burglary").notNull(),
    fire: integer("fire").notNull(),
    arson: integer("arson").notNull(),
    damage: integer("damage").notNull(),
    graffiti: integer("graffiti").notNull(),
    drugs: integer("drugs").notNull(),
    local: integer("local").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.year, t.code] }),
    index("crime_bezirk_idx").on(t.bezirk),
  ],
)

export type KiezProfile = typeof kiezProfiles.$inferSelect
export type School = typeof schools.$inferSelect
export type Address = typeof addresses.$inferSelect
export type Rental = typeof rentals.$inferSelect
export type Sale = typeof sales.$inferSelect
export type NewConstructionUnit = typeof newConstruction.$inferSelect
export type Kita = typeof kitas.$inferSelect
