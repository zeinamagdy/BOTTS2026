/**
 * Zod schemas for query inputs, shared by `queries.ts` and the LLM tools in `tools.ts`.
 * Optional fields are `.nullable()` (not `.optional()`), because OpenAI strict
 * function schemas require every key to be present.
 */
import { z } from "zod"

export const BEZIRKE = [
  "Charlottenburg-Wilmersdorf",
  "Friedrichshain-Kreuzberg",
  "Lichtenberg",
  "Marzahn-Hellersdorf",
  "Mitte",
  "Neukölln",
  "Pankow",
  "Reinickendorf",
  "Spandau",
  "Steglitz-Zehlendorf",
  "Tempelhof-Schöneberg",
  "Treptow-Köpenick",
] as const
export const TIERS = ["AMAZING", "GOOD", "OK", "BAD"] as const
export const WOHNLAGEN = ["einfach", "mittel", "gut"] as const
/** The only lines in the station data (135 stations). U5, U6, U9 and most S-Bahn lines are missing. */
export const TRANSIT_LINES = [
  "U1",
  "U2",
  "U7",
  "U8",
  "S1",
  "Stadtbahn",
  "S Ringbahn",
] as const

const bezirke = z
  .array(z.enum(BEZIRKE))
  .nullable()
  .describe("Only these districts (Bezirke)")
const limit = z
  .number()
  .int()
  .nullable()
  .describe("Max results, default 10, max 25")
const near = z
  .object({
    lat: z.number(),
    lon: z.number(),
    radiusKm: z.number().describe("Search radius in km"),
  })
  .nullable()
  .describe("Only results within radiusKm of this point")

const transitLines = z
  .array(z.enum(TRANSIT_LINES))
  .nullable()
  .describe(
    "Only listings near a station on one of these lines. The data only covers these 7 lines",
  )
const maxStationKm = z
  .number()
  .nullable()
  .describe(
    "Max straight-line km to the nearest station (on transitLines if given). Default 1 km when transitLines is set. ~1 km ≈ 12 min walk",
  )

const weight = z.number().nullable()
export const rankKiezInput = z.object({
  weights: z
    .object({
      affordability: weight.describe("Low cold rent per m²"),
      schools: weight.describe("District Abitur results vs peer schools"),
      safety: weight.describe("Low district crime (2017–2019)"),
      air: weight.describe("Low NO₂ at the nearest station"),
      kitas: weight.describe("Kita places in the PLZ"),
      transit: weight.describe("Close to an U-/S-Bahn station"),
      locationQuality: weight.describe(
        "Share of addresses with Wohnlage 'gut'",
      ),
    })
    .nullable()
    .describe(
      "Importance 0–5 per factor. Omitted factors count 0; all omitted = equal weights",
    ),
  bezirke,
  maxRentPerM2: z
    .number()
    .nullable()
    .describe("Max average cold rent €/m² in the PLZ"),
  minAbiturTier: z.enum(TIERS).nullable(),
  maxTransitKm: z.number().nullable(),
  apartment: z
    .object({
      maxWarmmiete: z.number().nullable(),
      minRooms: z.number().int().nullable(),
      minAreaM2: z.number().nullable(),
      balcony: z.boolean().nullable(),
    })
    .nullable()
    .describe("Only keep PLZs that have rental listings matching this"),
  limit,
})
export type RankKiezInput = z.infer<typeof rankKiezInput>

export const RENTAL_SORTS = [
  "warmmiete_asc",
  "rent_per_m2_asc",
  "area_desc",
  "newest",
] as const
export const rentalFilters = z.object({
  bezirke,
  plz: z.array(z.number().int()).nullable(),
  ortsteil: z
    .string()
    .nullable()
    .describe("Neighbourhood name, e.g. 'Prenzlauer Berg'"),
  minRooms: z.number().int().nullable(),
  maxRooms: z.number().int().nullable(),
  minAreaM2: z.number().nullable(),
  maxWarmmiete: z.number().nullable().describe("Max monthly warm rent in €"),
  maxKaltmiete: z.number().nullable().describe("Max monthly cold rent in €"),
  balcony: z.boolean().nullable(),
  lift: z.boolean().nullable(),
  furnished: z.boolean().nullable(),
  wohnlage: z.array(z.enum(WOHNLAGEN)).nullable(),
  listedSince: z.string().nullable().describe("ISO date, e.g. 2025-01-01"),
  near,
  transitLines,
  maxStationKm,
  sort: z.enum(RENTAL_SORTS).nullable(),
  limit,
})
export type RentalFilters = z.infer<typeof rentalFilters>

export const SALE_SORTS = [
  "price_asc",
  "price_per_m2_asc",
  "area_desc",
  "newest",
] as const
export const saleFilters = z.object({
  kind: z.enum(["resale", "new_build"]).nullable().describe("Default resale"),
  bezirke,
  plz: z.array(z.number().int()).nullable(),
  ortsteil: z.string().nullable(),
  minRooms: z.number().int().nullable(),
  minAreaM2: z.number().nullable(),
  maxPrice: z.number().nullable().describe("Max purchase price in €"),
  maxPricePerM2: z.number().nullable(),
  balcony: z.boolean().nullable(),
  wohnlage: z.array(z.enum(WOHNLAGEN)).nullable(),
  near,
  transitLines,
  maxStationKm,
  sort: z.enum(SALE_SORTS).nullable(),
  limit,
})
export type SaleFilters = z.infer<typeof saleFilters>

export const addressInput = z.object({
  street: z
    .string()
    .describe("Street name, e.g. 'Oranienstraße' or 'Oranienstr.'"),
  houseNumber: z.string().nullable(),
})

export const rentCheckInput = z.object({
  areaM2: z.number(),
  kaltmiete: z.number().describe("Monthly cold rent in €"),
  rooms: z.number().int().nullable(),
  plz: z.number().int().nullable(),
  street: z.string().nullable(),
  houseNumber: z.string().nullable(),
})
export type RentCheckInput = z.infer<typeof rentCheckInput>

export const priceTrendInput = z.object({
  ortsteil: z.string().nullable(),
  bezirk: z.enum(BEZIRKE).nullable(),
  granularity: z.enum(["month", "year"]).nullable().describe("Default year"),
})

export const kitaInput = z.object({
  plz: z.number().int().nullable(),
  near,
  minCapacity: z.number().int().nullable(),
  limit,
})

export const schoolInput = z.object({
  bezirk: z.enum(BEZIRKE).nullable(),
  plz: z.number().int().nullable(),
  schoolType: z
    .enum([
      "Gymnasien",
      "ISS/Gemeinschaftsschulen",
      "berufliche Schulen",
      "privat",
      "Kollegs/Abendgymnasien",
    ])
    .nullable(),
  minTier: z.enum(TIERS).nullable().describe("Minimum tier_vs_peer"),
  limit,
})

export const crimeInput = z.object({ bezirk: z.enum(BEZIRKE).nullable() })

/** Every key optional; `null` and missing both mean "no filter". For calling queries directly. */
export type Loose<T> = { [K in keyof T]?: T[K] | null }
