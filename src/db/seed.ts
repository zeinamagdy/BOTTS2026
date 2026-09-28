/**
 * Loads the team data repo (github.com/esakovaa/tech-battle) into Postgres.
 * Run `npm run data:fetch` first. Wipes and reloads every table.
 *
 * CSV headers map onto DB column names automatically (lower-cased). Values are
 * converted by the Drizzle column type ("25.0" → 25, "True" → true, "" → null).
 * Synthetic listings get plz / wohnlage / plr_name from their nearest real address.
 */
import { config } from "dotenv"
config({ path: ".env.local" })

import { parse } from "csv-parse"
import { getTableColumns, getTableName, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import type { PgTable } from "drizzle-orm/pg-core"
import { createReadStream, existsSync, readFileSync } from "node:fs"
import path from "node:path"
import postgres from "postgres"
import * as s from "./schema"

const DATA_DIR = path.resolve(process.env.DATA_DIR ?? "data/tech-battle")
const SRC = path.join(DATA_DIR, "DATA  SOURCES")
const KIEZ = path.join(DATA_DIR, "Kiez Profile Master Table")

const client = postgres(process.env.DATABASE_URL!, {
  max: 1,
  onnotice: () => {},
})
const db = drizzle(client)

type Row = Record<string, string>
type Spec = {
  file: string
  table: PgTable
  /** csv header (lower-cased) → db column name */
  rename?: Record<string, string>
  /** Drop rows, or patch the row before conversion. Return null to skip. */
  transform?: (row: Row) => Row | null
}

async function readCsv(file: string): Promise<Row[]> {
  const rows: Row[] = []
  const parser = createReadStream(file).pipe(
    parse({
      columns: (h: string[]) => h.map((c) => c.toLowerCase()),
      bom: true,
    }),
  )
  for await (const row of parser) rows.push(row)
  return rows
}

function converter(table: PgTable) {
  const cols = Object.entries(getTableColumns(table))
  return (row: Row) => {
    const out: Record<string, unknown> = {}
    for (const [key, col] of cols) {
      const raw = row[col.name]
      if (raw === undefined) continue // e.g. serial ids
      if (raw === "") out[key] = null
      else if (col.dataType === "boolean")
        out[key] = raw.toLowerCase() === "true"
      else if (col.dataType === "number")
        out[key] = col.columnType.includes("Integer")
          ? Math.round(Number(raw))
          : Number(raw)
      else out[key] = raw
    }
    return out
  }
}

async function load(
  { file, table, rename = {}, transform }: Spec,
  rows?: Row[],
) {
  rows ??= await readCsv(file)
  const convert = converter(table)
  const values: Record<string, unknown>[] = []
  let skipped = 0
  for (const r of rows) {
    for (const [from, to] of Object.entries(rename)) r[to] = r[from]
    const patched = transform ? transform(r) : r
    if (patched) values.push(convert(patched))
    else skipped++
  }
  // Postgres allows 65,535 bind params per statement.
  const chunk = Math.floor(60_000 / Object.keys(getTableColumns(table)).length)
  for (let i = 0; i < values.length; i += chunk) {
    await db.insert(table).values(values.slice(i, i + chunk))
  }
  const name = getTableName(table)
  console.log(
    `  ${name.padEnd(20)} ${String(values.length).padStart(7)} rows` +
      (skipped ? ` (skipped ${skipped})` : ""),
  )
  return values.length
}

/** Grid index over every real address, for nearest-address lookups. */
function buildAddressIndex(rows: Row[]) {
  const CELL = 0.005 // ≈ 550 m lat × 340 m lon
  const grid = new Map<string, Row[]>()
  const key = (lat: number, lon: number) =>
    `${Math.floor(lat / CELL)}:${Math.floor(lon / CELL)}`
  for (const r of rows) {
    const k = key(+r.lat, +r.lon)
    const bucket = grid.get(k)
    if (bucket) bucket.push(r)
    else grid.set(k, [r])
  }
  const cosLat = Math.cos((52.52 * Math.PI) / 180)
  return (lat: number, lon: number) => {
    const ci = Math.floor(lat / CELL)
    const cj = Math.floor(lon / CELL)
    let best: Row | undefined
    let bestD = Infinity
    // Expand rings until we have a hit and the next ring can't be closer.
    for (let ring = 0; ring < 60; ring++) {
      for (let i = ci - ring; i <= ci + ring; i++) {
        for (let j = cj - ring; j <= cj + ring; j++) {
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== ring) continue
          for (const a of grid.get(`${i}:${j}`) ?? []) {
            const d = (+a.lat - lat) ** 2 + ((+a.lon - lon) * cosLat) ** 2
            if (d < bestD) [best, bestD] = [a, d]
          }
        }
      }
      if (best && Math.sqrt(bestD) < ring * CELL * cosLat) break
    }
    return best!
  }
}

const DERIVED = path.resolve("data/derived")

/** Merges data/derived/{osm-amenities,kiez-photos}.json into kiez_enrichment. */
async function loadEnrichment() {
  const read = (f: string) => {
    const file = path.join(DERIVED, f)
    if (!existsSync(file)) {
      console.log(`  (skipping ${f}: not found)`)
      return new Map<number, Record<string, unknown>>()
    }
    const { rows } = JSON.parse(readFileSync(file, "utf8")) as {
      rows: ({ plz: number } & Record<string, unknown>)[]
    }
    return new Map(rows.map((r) => [r.plz, r]))
  }
  const osm = read("osm-amenities.json")
  const photos = read("kiez-photos.json")
  const plzs = [...new Set([...osm.keys(), ...photos.keys()])]
  await db.delete(s.kiezEnrichment)
  if (!plzs.length) return
  const num = (v: unknown) => (typeof v === "number" ? v : null)
  const str = (v: unknown) => (typeof v === "string" && v ? v : null)
  await db.insert(s.kiezEnrichment).values(
    plzs.map((plz) => {
      const o = osm.get(plz) ?? {}
      const p = photos.get(plz) ?? {}
      return {
        plz,
        parks1km: num(o.parks1km),
        parkAreaM2: num(o.parkAreaM2),
        greenShare1km: num(o.greenShare1km),
        waterShare1km: num(o.waterShare1km),
        cafes1km: num(o.cafes1km),
        playgrounds1km: num(o.playgrounds1km),
        nearestParkName: str(o.nearestParkName),
        nearestParkKm: num(o.nearestParkKm),
        photoUrl: str(p.thumbUrl),
        photoTitle: str(p.title),
        photoAuthor: str(p.author),
        photoLicense: str(p.license),
        photoPage: str(p.pageUrl),
      }
    }),
  )
  console.log(
    `  ${"kiez_enrichment".padEnd(20)} ${String(plzs.length).padStart(7)} rows`,
  )
}

async function main() {
  if (process.argv.includes("--enrichment-only")) {
    await loadEnrichment()
    await client.end()
    return
  }
  if (!existsSync(SRC)) {
    console.error(
      `Data not found at ${DATA_DIR}. Run \`npm run data:fetch\` first.`,
    )
    process.exit(1)
  }
  const t0 = Date.now()
  console.log(`Seeding from ${DATA_DIR}`)

  const tables = [
    s.kiezProfiles,
    s.schools,
    s.addresses,
    s.rentals,
    s.sales,
    s.newConstruction,
    s.kiezPricesMonthly,
    s.transitStations,
    s.kitas,
    s.realListings2023,
    s.crimeStats,
  ]
  await db.execute(sql`create extension if not exists pg_trgm`)
  await db.execute(
    sql.raw(
      `truncate ${tables.map((t) => `"${getTableName(t)}"`).join(", ")} restart identity`,
    ),
  )

  await load({
    file: path.join(KIEZ, "kiez_profile_by_plz.csv"),
    table: s.kiezProfiles,
  })
  const berlinPlz = new Set(
    (await db.select({ plz: s.kiezProfiles.plz }).from(s.kiezProfiles)).map(
      (r) => r.plz,
    ),
  )

  await load({
    file: path.join(KIEZ, "abitur_by_school.csv"),
    table: s.schools,
    rename: {
      schulname: "name",
      schulform_name: "school_type",
      n: "n_candidates",
      "n.best": "pass_rate",
      "n.scls": "n_graded",
      "mn.scls": "mean_grade",
      peer_benchmark_mn_vgl: "peer_benchmark",
    },
  })

  const addressRows = await readCsv(
    path.join(SRC, "all 400k houses in Berlin/wohnlagen_2026.csv"),
  )
  await load(
    {
      file: "",
      table: s.addresses,
      rename: { bezname: "bezirk", wol: "wohnlage" },
      transform: (r) => ({ ...r, hnr: r.hnr.replace(/^0+(?=.)/, "") }),
    },
    addressRows,
  )

  const nearest = buildAddressIndex(addressRows)
  const withLocation = (r: Row) => {
    const a = nearest(+r.lat, +r.lon)
    return { ...r, plz: a.plz, wohnlage: a.wol, plr_name: a.plr_name }
  }
  const RE = path.join(SRC, "Berlin Real Estate Sales Rentals 2020-2026")
  await load({
    file: path.join(RE, "rentals.csv"),
    table: s.rentals,
    transform: withLocation,
  })
  await load({
    file: path.join(RE, "secondary_sales.csv"),
    table: s.sales,
    transform: withLocation,
  })
  await load({
    file: path.join(RE, "new_construction.csv"),
    table: s.newConstruction,
    transform: withLocation,
  })
  // Synthetic ortsteil labels are noisy, so only count listings whose Bezirk matches the PLZ's.
  await db.execute(sql`
    update kiez_profiles k set ortsteil = coalesce(
      (select mode() within group (order by ortsteil) from rentals r where r.plz = k.plz and r.bezirk = k.bezirk),
      (select mode() within group (order by plr_name) from addresses a where a.plz = k.plz))`)
  await load({
    file: path.join(RE, "kiez_prices_monthly.csv"),
    table: s.kiezPricesMonthly,
  })
  await load({
    file: path.join(RE, "transit_stations.csv"),
    table: s.transitStations,
  })

  await load({
    file: path.join(SRC, "Kita Standorte (WFS)/kitas_wfs.csv"),
    table: s.kitas,
    rename: {
      e_nr: "id",
      e_name: "name",
      e_bez: "bezirk",
      e_plz: "plz",
      e_strasse: "strasse",
      e_hnr: "hnr",
      e_tel: "phone",
      e_web: "website",
      e_platz: "capacity",
      e_art: "kita_type",
      ang_1: "pedagogy",
      t_name: "traeger_name",
      t_art: "traeger_type",
    },
    transform: (r) => ({
      ...r,
      // e_zusatz is either a suffix ("-5", "a") or a second address ("Oppelner Str. 21")
      hnr: !r.e_zusatz
        ? r.e_hnr
        : /^(-|[a-z]$)/i.test(r.e_zusatz)
          ? `${r.e_hnr}${r.e_zusatz}`
          : `${r.e_hnr} / ${r.e_zusatz}`,
    }),
  })

  await load({
    file: path.join(
      SRC,
      "Real Estate Listings Berlin (DE) April 2023/real_estate_listings_clean.csv",
    ),
    table: s.realListings2023,
    rename: {
      zipcode: "plz",
      price: "price_eur",
      area: "area_m2",
      price_per_area: "price_per_m2",
    },
    transform: (r) => {
      // Drop non-Berlin zipcodes; blank out impossible years/floors from the scrape.
      if (!berlinPlz.has(Math.round(+r.plz))) return null
      const year = +r.construction_year
      const clean = (v: string) =>
        v === "na" ? "" : v.trim().replace(/,$/, "")
      return {
        ...r,
        construction_year:
          year >= 1800 && year <= 2030 ? r.construction_year : "",
        level: +r.level <= 40 ? r.level : "",
        energy: clean(r.energy),
        heating: clean(r.heating),
      }
    },
  })

  await load({
    file: path.join(SRC, "Berlin_crimes.csv"),
    table: s.crimeStats,
    rename: { district: "bezirk" },
  })

  await loadEnrichment()

  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  await client.end()
}

main().catch(async (err) => {
  console.error(err)
  await client.end()
  process.exit(1)
})
