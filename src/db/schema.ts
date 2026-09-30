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
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
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
  // Commute (135-station list, not full VBB network; the planungsraum table has the real VBB version)
  nearestTransitStation: text("nearest_transit_station"),
  nearestTransitLine: text("nearest_transit_line"),
  transitDistanceKm: real("transit_distance_km"),
  // Abitur 2025, Bezirk-level, inherited. Lower grade = better; higher vs-peer = better.
  abiturMeanGradeBezirk: real("abitur_mn_scls_bezirk_avg"),
  abiturVsPeerBezirk: real("abitur_performance_vs_peer_bezirk_avg"),
  nAbiturSchoolsInBezirk: integer("n_abitur_schools_in_bezirk"),
  /** AMAZING | GOOD | OK | BAD */
  abiturTierBezirk: text("abitur_tier_bezirk"),
  // Umweltgerechtigkeit 2023/24 (Umweltatlas), from a point query at the PLZ centroid.
  // Coarser than `planungsraum`, whose versions are the trusted ones: prefer those.
  ugPlanungsraumNr: text("ug_planungsraum_nr"),
  ugPlanungsraumName: text("ug_planungsraum_name"),
  ugLaerm: text("ug_laerm"),
  ugLuft: text("ug_luft"),
  ugGruenversorgung: text("ug_gruenversorgung"),
  ugThermisch: text("ug_thermisch"),
  /** Status-Index: HIGHER = MORE ADVANTAGED, despite the name */
  ugSozialeBenachteiligung: text("ug_soziale_benachteiligung"),
  ugMehrfachbelastungUmwelt: text("ug_mehrfachbelastung_umwelt"),
  ugMehrfachbelastungUmweltSozial: text("ug_mehrfachbelastung_umwelt_sozial"),
  ugGesamtUmweltgerechtigkeitskarte: text(
    "ug_gesamt_umweltgerechtigkeitskarte",
  ),
})

/**
 * One row per Planungsraum (542), Berlin's official planning geography, finer than PLZ. Built by the
 * data repo with point-in-polygon joins. Joins to kiez_profiles through `dominantPlz`. Read the data
 * repo's "Kiez Profile Master Table/README.md" for grain and trust levels. Highlights:
 * - `plrId` is an 8-character STRING with leading zeros ("01100101"). Never parse it as a number.
 * - ug_*: real, native grain. ordinal text. `ugMehrfachbelastungUmwelt` is 5-level (keine starke
 *   Belastung → vierfach), `…Sozial` 6-level. Status-Index: HIGHER = MORE ADVANTAGED.
 * - crime is Bezirk-level and inherited. `crimeRatePer10k` is per capita, `crimeTotalAvg` absolute.
 * - transit is real VBB GTFS (878 stations, all lines), unlike kiez_profiles and transit_stations.
 * - population is allocated down from PLZ×Bezirk by address share: an estimate, check `pctPopulationCoverage`.
 * - buyPricePerM2Real is inherited from `dominantPlz`. Abitur is PLR-exact for only ~61 areas.
 * - n_* POI counts are OpenStreetMap; the `*Plz` versions are counted per dominant PLZ.
 */
export const planungsraum = pgTable("planungsraum", {
  plrId: text("plr_id").primaryKey(),
  plrName: text("plr_name").notNull(),
  ugLaerm: text("ug_laerm"),
  ugLuft: text("ug_luft"),
  ugGruenversorgung: text("ug_gruenversorgung"),
  ugThermisch: text("ug_thermisch"),
  ugSozialeBenachteiligung: text("ug_soziale_benachteiligung"),
  ugMehrfachbelastungUmwelt: text("ug_mehrfachbelastung_umwelt"),
  ugMehrfachbelastungUmweltSozial: text("ug_mehrfachbelastung_umwelt_sozial"),
  ugGesamtUmweltgerechtigkeitskarte: text(
    "ug_gesamt_umweltgerechtigkeitskarte",
  ),
  lat: doublePrecision("lat").notNull(),
  lon: doublePrecision("lon").notNull(),
  nAddresses: integer("n_addresses").notNull(),
  bezirk: text("bezirk").notNull(),
  /** Majority PLZ of the real addresses inside this Planungsraum */
  dominantPlz: integer("dominant_plz"),
  pctWohnlageEinfach: real("pct_wohnlage_einfach"),
  pctWohnlageGut: real("pct_wohnlage_gut"),
  pctWohnlageMittel: real("pct_wohnlage_mittel"),
  dominantWohnlage: text("dominant_wohnlage"),
  nKitas: integer("n_kitas"),
  totalKitaCapacity: integer("total_kita_capacity"),
  nSchoolConstructionProjects: integer("n_school_construction_projects"),
  nUniqueSchoolsWithProjects: integer("n_unique_schools_with_projects"),
  totalPlannedSchoolCapacity: integer("total_planned_school_capacity"),
  /** Abitur of schools located in this Planungsraum (lower grade = better); null for most areas */
  abiturMeanGradePlr: real("abitur_mn_scls_plr_avg"),
  abiturVsPeerPlr: real("abitur_performance_vs_peer_plr_avg"),
  nAbiturSchoolsInPlr: integer("n_abitur_schools_in_plr"),
  rentPerM2KaltSynthetic: real("rent_per_m2_kalt_avg_synthetic"),
  nRentalListingsSynthetic: integer("n_rental_listings_synthetic"),
  buyPricePerM2Synthetic: real("buy_price_per_m2_avg_synthetic"),
  nSyntheticSalesListings: integer("n_synthetic_sales_listings"),
  newConstructionPricePerM2: real("new_construction_price_per_m2_avg"),
  nNewConstructionListings: integer("n_new_construction_listings"),
  nearestTransitStation: text("nearest_transit_station"),
  nearestTransitLine: text("nearest_transit_line"),
  transitDistanceKm: real("transit_distance_km"),
  /** Real listings, April 2023, inherited from dominantPlz */
  buyPricePerM2Real: real("buy_price_per_m2_avg_real"),
  nRealListings: integer("n_real_listings"),
  /** Bezirk-level, inherited, absolute count */
  crimeTotalAvg: real("crime_total_avg_2017_2019"),
  abiturMeanGradeBezirk: real("abitur_mn_scls_bezirk_avg"),
  abiturVsPeerBezirk: real("abitur_performance_vs_peer_bezirk_avg"),
  // OpenStreetMap POI counts inside the Planungsraum
  nYogaStudios: integer("n_yoga_studios"),
  nKinderarzt: integer("n_kinderarzt"),
  nGym: integer("n_gym"),
  nBouldering: integer("n_bouldering"),
  // …and per dominant PLZ, with a "has at least one" flag
  nYogaStudiosPlz: integer("n_yoga_studios_plz"),
  nKinderarztPlz: integer("n_kinderarzt_plz"),
  nGymPlz: integer("n_gym_plz"),
  nBoulderingPlz: integer("n_bouldering_plz"),
  hasYogaStudiosPlz: boolean("has_yoga_studios_plz"),
  hasKinderarztPlz: boolean("has_kinderarzt_plz"),
  hasGymPlz: boolean("has_gym_plz"),
  hasBoulderingPlz: boolean("has_bouldering_plz"),
  // Population, allocated from PLZ×Bezirk by address share (estimate)
  nPopulation: integer("n_population"),
  nPopulationUnder6: integer("n_population_under6"),
  nPopulation6To15: integer("n_population_6_15"),
  nPopulation15To18: integer("n_population_15_18"),
  nPopulation18To27: integer("n_population_18_27"),
  nPopulation27To45: integer("n_population_27_45"),
  nPopulation45To55: integer("n_population_45_55"),
  nPopulation55To65: integer("n_population_55_65"),
  nPopulation65Plus: integer("n_population_65plus"),
  nPopulationFemale: integer("n_population_female"),
  /** Share (%) of this area's addresses that landed in a matched population cell; 503/542 are 100 */
  pctPopulationCoverage: real("pct_population_coverage"),
  bezirkPopulation: integer("bezirk_population"),
  /** Bezirk-level, inherited: crime_total_avg / (bezirk_population / 10,000) */
  crimeRatePer10k: real("crime_rate_per_10k_2017_2019"),
  /** Haversine distance from the centroid to Alexanderplatz */
  distanceFromCenterKm: real("distance_from_center_km"),
})

/** Real Planungsraum polygons (MultiPolygon GeoJSON geometry), for maps and choropleths. */
export const planungsraumBoundaries = pgTable("planungsraum_boundaries", {
  plrId: text("plr_id").primaryKey(),
  plrName: text("plr_name").notNull(),
  geometry: jsonb("geometry").notNull(),
})

/**
 * Real point locations behind the per-Planungsraum counts: every Kita plus the OSM yoga, kinderarzt,
 * gym and bouldering points that fall inside a polygon. `category` is kita | yoga_studios |
 * kinderarzt | gym | bouldering.
 */
export const poiLocations = pgTable(
  "poi_locations",
  {
    id: serial("id").primaryKey(),
    plrId: text("plr_id").notNull(),
    category: text("category").notNull(),
    name: text("name"),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
  },
  (t) => [index("poi_locations_plr_idx").on(t.plrId, t.category)],
)

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
    /** Planungsraum by point-in-polygon (from the data repo's rentals_by_planungsraum.json); null for ~570 outside every polygon */
    plrId: text("plr_id"),
  },
  (t) => [
    index("rentals_plr_idx").on(t.plrId),
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

/**
 * Per-PLZ extras we derive ourselves (not in the data repo). Built from the JSON
 * files in data/derived/ (`npm run data:osm`, `npm run data:photos`).
 * - OSM: parks/cafés/playgrounds within 1 km of the PLZ centroid (ODbL)
 * - Wikimedia Commons: one freely licensed photo near the centroid
 */
export const kiezEnrichment = pgTable("kiez_enrichment", {
  plz: integer("plz").primaryKey(),
  parks1km: integer("parks_1km"),
  parkAreaM2: doublePrecision("park_area_m2"),
  /** Share of the 1 km circle covered by parks/forest/meadow (0–1) */
  greenShare1km: real("green_share_1km"),
  waterShare1km: real("water_share_1km"),
  cafes1km: integer("cafes_1km"),
  playgrounds1km: integer("playgrounds_1km"),
  nearestParkName: text("nearest_park_name"),
  nearestParkKm: real("nearest_park_km"),
  photoUrl: text("photo_url"),
  photoTitle: text("photo_title"),
  photoAuthor: text("photo_author"),
  photoLicense: text("photo_license"),
  photoPage: text("photo_page"),
})

/**
 * OURS, not from the data repo: rental applications sent through /apply. They
 * appear in the landlord inbox next to the demo applicants. No uploaded file is
 * stored, only what the document check read from it (`documents`). No foreign
 * key to `rentals`, so `db:seed` can truncate the listings. Never seeded.
 */
export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** The synthetic listing the tenant applied from */
    rentalId: text("rental_id").notNull(),
    plrId: text("plr_id"),
    name: text("name").notNull(),
    adults: integer("adults").notNull(),
    children: integer("children").notNull(),
    /** One of `EMPLOYMENT` in applicants.ts */
    employment: text("employment").notNull(),
    /** Net household income per month in € */
    income: integer("income"),
    hasGuarantor: boolean("has_guarantor").notNull(),
    hasDepositInsurance: boolean("has_deposit_insurance").notNull(),
    savings: integer("savings").notNull(),
    moveIn: date("move_in").notNull(),
    /** Someone in the household smokes; null for applications sent before the question existed */
    smoker: boolean("smoker"),
    /** Document key → what the document check found (see `DocumentCheck` in documents.ts) */
    documents: jsonb("documents")
      .$type<
        Record<
          string,
          {
            status: "verified" | "rejected" | "unchecked"
            demo: boolean
            netIncome?: number | null
          }
        >
      >()
      .notNull(),
    coverLetter: text("cover_letter").notNull(),
    /** When the tenant agreed to storage for this letting (deleted 30 days after it is let) */
    consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("applications_created_idx").on(t.createdAt)],
)

export type KiezProfile = typeof kiezProfiles.$inferSelect
export type Planungsraum = typeof planungsraum.$inferSelect
export type PoiLocation = typeof poiLocations.$inferSelect
export type KiezEnrichment = typeof kiezEnrichment.$inferSelect
export type School = typeof schools.$inferSelect
export type Address = typeof addresses.$inferSelect
export type Rental = typeof rentals.$inferSelect
export type Sale = typeof sales.$inferSelect
export type NewConstructionUnit = typeof newConstruction.$inferSelect
export type Kita = typeof kitas.$inferSelect
export type Application = typeof applications.$inferSelect
