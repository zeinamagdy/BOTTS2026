// Builds data/derived/osm-amenities.json: per-PLZ counts of parks, cafés and
// playgrounds within 1 km, plus a green/water land-cover share, sourced from
// OpenStreetMap via Overpass (one request per tag category, see
// CATEGORY_QUERIES below).
//
// Reads the 193 PLZ centroids from Postgres (kiez_profiles), fetches raw OSM
// data once per category (cached under data/derived/.cache/overpass-v2-*.json,
// re-fetched only with --refresh), then computes everything locally in plain JS.
//
// Usage: node scripts/fetch-osm.mjs [--refresh]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import postgres from "postgres"
import { config } from "dotenv"

config({ path: path.resolve(import.meta.dirname, "..", ".env.local") })

const REFRESH = process.argv.includes("--refresh")

const ROOT = path.resolve(import.meta.dirname, "..")
const DERIVED_DIR = path.join(ROOT, "data/derived")
const CACHE_DIR = path.join(DERIVED_DIR, ".cache")
const OUT_FILE = path.join(DERIVED_DIR, "osm-amenities.json")

const RADIUS_KM = 1
const GRASS_MIN_AREA_M2 = 5000
// (south, west, north, east)
const BBOX = "52.33,13.08,52.68,13.77"

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
]

const geomBlock = (selector) => `
[out:json][timeout:180];
(
  way${selector}(${BBOX});
  relation${selector}(${BBOX});
);
out geom;
`

// v2: one request per tag category (rather than one giant combined query),
// each cached separately under .cache/. The combined-query version this
// started from hit Overpass's own server-side runtime timeout (HTTP 504)
// even at [timeout:180] once forest/wood/water were added — those layers are
// huge over the whole Berlin bbox. Splitting keeps every single request
// small and reliable; "out geom" on a relation embeds each member's geometry
// inline (an array of {lat,lon} per way member), so multipolygon rings can
// be assembled from "outer" members without a separate recursion step. Used
// for every green/water category so parks (including big multi-way
// relations like Tiergarten), forests, nature reserves, meadows, grass and
// water bodies all get full geometry, not just a tagged center point.
const CATEGORY_QUERIES = {
  park: geomBlock('["leisure"="park"]'),
  nature_reserve: geomBlock('["leisure"="nature_reserve"]'),
  forest: geomBlock('["landuse"="forest"]'),
  wood: geomBlock('["natural"="wood"]'),
  meadow: geomBlock('["landuse"="meadow"]'),
  grass: geomBlock('["landuse"="grass"]'),
  water: geomBlock('["natural"="water"]'),
  poi: `
[out:json][timeout:180];
(
  node["amenity"="cafe"](${BBOX});
  way["amenity"="cafe"](${BBOX});
);
out center;
(
  node["leisure"="playground"](${BBOX});
  way["leisure"="playground"](${BBOX});
);
out center;
`,
}

async function fetchOverpassCategory(name, query) {
  const cacheFile = path.join(CACHE_DIR, `overpass-v2-${name}.json`)
  if (!REFRESH && existsSync(cacheFile)) {
    const cached = JSON.parse(readFileSync(cacheFile, "utf8"))
    console.log(`[${name}] cached: ${cached.elements.length} elements`)
    return cached.elements
  }

  // Overpass returns "the server is probably too busy" 504s in bursts, so a
  // single pass over the two endpoints isn't reliable — retry each endpoint
  // a few times with backoff before moving on / giving up.
  const BACKOFF_MS = [15_000, 30_000, 60_000]
  let lastErr
  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
      console.log(`[${name}] querying ${endpoint}… (attempt ${attempt + 1})`)
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 190_000)
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            "user-agent":
              "kiez-concierge-hackathon/1.0 (Berlin housing hackathon project; contact: zainabmagdy8@gmail.com)",
          },
          body: "data=" + encodeURIComponent(query),
          signal: controller.signal,
        })
        clearTimeout(timeout)
        if (!res.ok) {
          throw new Error(
            `${endpoint} -> HTTP ${res.status} ${await res.text().catch(() => "")}`,
          )
        }
        const json = await res.json()
        mkdirSync(CACHE_DIR, { recursive: true })
        writeFileSync(cacheFile, JSON.stringify(json))
        console.log(`[${name}] fetched: ${json.elements.length} elements`)
        return json.elements
      } catch (err) {
        console.warn(`[${name}]   failed: ${err.message}`)
        lastErr = err
        if (attempt < BACKOFF_MS.length) {
          const wait = BACKOFF_MS[attempt]
          console.log(`[${name}]   retrying in ${wait / 1000}s…`)
          await sleep(wait)
        }
      }
    }
  }
  throw lastErr ?? new Error(`[${name}] all Overpass endpoints failed`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchAllCategories() {
  const result = {}
  for (const [name, query] of Object.entries(CATEGORY_QUERIES)) {
    result[name] = await fetchOverpassCategory(name, query)
    // Be polite between categories: Overpass's fair-use policy allows only a
    // couple of concurrent/rapid-fire slots per IP.
    await sleep(2_000)
  }
  return result
}

// --- geometry helpers ------------------------------------------------------

const BERLIN_LAT = 52.52
const KM_PER_DEG_LAT = 111.32
const KM_PER_DEG_LON = 111.32 * Math.cos((BERLIN_LAT * Math.PI) / 180)

// Equirectangular projection around Berlin -> flat x/y in km, good enough at
// this scale (matches the equirectangular distanceKm already used in
// src/lib/queries.ts).
function project(lat, lon) {
  return { x: lon * KM_PER_DEG_LON, y: lat * KM_PER_DEG_LAT }
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const p1 = project(lat1, lon1)
  const p2 = project(lat2, lon2)
  return Math.hypot(p1.x - p2.x, p1.y - p2.y)
}

// Shoelace formula on the projected (km) ring, returns m².
function polygonAreaM2(coords) {
  if (coords.length < 3) return 0
  let sum = 0
  const pts = coords.map((c) => project(c.lat, c.lon))
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum / 2) * 1_000_000 // km² -> m²
}

function centroidOf(coords) {
  let lat = 0
  let lon = 0
  for (const c of coords) {
    lat += c.lat
    lon += c.lon
  }
  return { lat: lat / coords.length, lon: lon / coords.length }
}

function round(x, decimals) {
  const f = 10 ** decimals
  return Math.round(x * f) / f
}

// --- relation ring assembly --------------------------------------------

// Key a point to ~1cm precision so shared OSM nodes compare equal even after
// float round-tripping through JSON.
function pointKey(pt) {
  return pt.lat.toFixed(7) + "," + pt.lon.toFixed(7)
}

// Greedily stitches "outer" way segments of a multipolygon relation into
// closed rings by matching shared endpoints. Not a full topology solver, but
// good enough for the vast majority of real-world park/forest/water
// relations, whose outer ways already share endpoint nodes. Inner (hole)
// members are ignored, per the task: holes only shrink the true area/share
// slightly and Berlin's green/water relations rarely have large ones.
function joinSegments(segments) {
  const remaining = segments.map((s) => s.slice())
  const rings = []
  while (remaining.length) {
    let chain = remaining.shift()
    let extended = true
    while (
      extended &&
      pointKey(chain[0]) !== pointKey(chain[chain.length - 1])
    ) {
      extended = false
      for (let i = 0; i < remaining.length; i++) {
        const seg = remaining[i]
        if (pointKey(seg[0]) === pointKey(chain[chain.length - 1])) {
          chain = chain.concat(seg.slice(1))
        } else if (
          pointKey(seg[seg.length - 1]) === pointKey(chain[chain.length - 1])
        ) {
          chain = chain.concat(seg.slice(0, -1).reverse())
        } else if (pointKey(seg[seg.length - 1]) === pointKey(chain[0])) {
          chain = seg.slice(0, -1).concat(chain)
        } else if (pointKey(seg[0]) === pointKey(chain[0])) {
          chain = seg.slice(1).reverse().concat(chain)
        } else {
          continue
        }
        remaining.splice(i, 1)
        extended = true
        break
      }
    }
    rings.push(chain)
  }
  return rings
}

function assembleRelationRings(el) {
  const outerSegments = (el.members ?? [])
    .filter(
      (m) =>
        m.role === "outer" &&
        Array.isArray(m.geometry) &&
        m.geometry.length >= 2,
    )
    .map((m) => m.geometry.filter((g) => typeof g?.lat === "number"))
    .filter((seg) => seg.length >= 2)
  return joinSegments(outerSegments).filter((r) => r.length >= 3)
}

// A polygon (way or relation) as { rings, areaM2, centroid, bbox, name }.
// bbox is used to cheaply skip polygons that can't overlap a PLZ's 1 km
// circle before running point-in-polygon tests.
function polygonFromElement(el) {
  let rings
  if (el.type === "way") {
    if (!Array.isArray(el.geometry)) return null
    const coords = el.geometry.filter((g) => typeof g?.lat === "number")
    if (coords.length < 3) return null
    rings = [coords]
  } else if (el.type === "relation") {
    rings = assembleRelationRings(el)
    if (!rings.length) return null
  } else {
    return null
  }

  const areaM2 = rings.reduce((sum, r) => sum + polygonAreaM2(r), 0)
  const allPts = rings.flat()
  const lats = allPts.map((p) => p.lat)
  const lons = allPts.map((p) => p.lon)
  return {
    rings,
    areaM2,
    centroid: centroidOf(allPts),
    bbox: {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLon: Math.min(...lons),
      maxLon: Math.max(...lons),
    },
    name: el.tags?.name ?? null,
  }
}

function extractPolygons(elements, matchTags) {
  const polys = []
  for (const el of elements) {
    if (!el.tags || !matchTags(el.tags)) continue
    const poly = polygonFromElement(el)
    if (poly) polys.push(poly)
  }
  return polys
}

function extractPoints(elements, tagKey, tagValue) {
  const points = []
  for (const el of elements) {
    if (el.tags?.[tagKey] !== tagValue) continue
    if (el.type === "node" && typeof el.lat === "number") {
      points.push({ lat: el.lat, lon: el.lon })
    } else if (el.center) {
      points.push({ lat: el.center.lat, lon: el.center.lon })
    }
  }
  return points
}

// Ray casting on plain lat/lon: a purely topological test, so an unprojected
// (but locally near-orthogonal) coordinate frame is fine at Berlin's scale.
function pointInRing(lat, lon, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i].lat
    const xi = ring[i].lon
    const yj = ring[j].lat
    const xj = ring[j].lon
    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function bboxIntersects(a, b) {
  return (
    a.minLat <= b.maxLat &&
    a.maxLat >= b.minLat &&
    a.minLon <= b.maxLon &&
    a.maxLon >= b.minLon
  )
}

function pointInPolygon(lat, lon, poly) {
  if (
    lat < poly.bbox.minLat ||
    lat > poly.bbox.maxLat ||
    lon < poly.bbox.minLon ||
    lon > poly.bbox.maxLon
  ) {
    return false
  }
  return poly.rings.some((ring) => pointInRing(lat, lon, ring))
}

// Precompute a regular grid of (dLat, dLon) offsets covering a 1 km-radius
// circle, targeting ~400 sample points. Circle area / bounding-square area =
// pi/4, so n = sqrt(target / (pi/4)) points per axis over the square gives
// about `target` points once points outside the circle are dropped.
function buildGridOffsets(radiusKm, targetCount) {
  const n = Math.round(Math.sqrt(targetCount / (Math.PI / 4)))
  const stepKm = (2 * radiusKm) / (n - 1)
  const offsets = []
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const dx = -radiusKm + i * stepKm
      const dy = -radiusKm + j * stepKm
      if (dx * dx + dy * dy <= radiusKm * radiusKm) {
        offsets.push({ dLat: dy / KM_PER_DEG_LAT, dLon: dx / KM_PER_DEG_LON })
      }
    }
  }
  return offsets
}

// --- main -------------------------------------------------------------------

async function main() {
  mkdirSync(DERIVED_DIR, { recursive: true })
  mkdirSync(CACHE_DIR, { recursive: true })

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error("DATABASE_URL not set (check .env.local)")

  const sql = postgres(databaseUrl)
  let plzRows
  try {
    plzRows = await sql`select plz, lat, lon from kiez_profiles`
  } finally {
    await sql.end({ timeout: 1 })
  }
  console.log(`Loaded ${plzRows.length} PLZ centroids from kiez_profiles`)

  const byCategory = await fetchAllCategories()

  const parkPolys = extractPolygons(
    byCategory.park,
    (t) => t.leisure === "park",
  )
  const natureReservePolys = extractPolygons(
    byCategory.nature_reserve,
    (t) => t.leisure === "nature_reserve",
  )
  const forestPolys = extractPolygons(
    byCategory.forest,
    (t) => t.landuse === "forest",
  )
  const woodPolys = extractPolygons(
    byCategory.wood,
    (t) => t.natural === "wood",
  )
  const meadowPolys = extractPolygons(
    byCategory.meadow,
    (t) => t.landuse === "meadow",
  )
  const grassPolys = extractPolygons(
    byCategory.grass,
    (t) => t.landuse === "grass",
  ).filter((p) => p.areaM2 > GRASS_MIN_AREA_M2)
  const waterPolys = extractPolygons(
    byCategory.water,
    (t) => t.natural === "water",
  )

  const greenPolys = [
    ...parkPolys,
    ...natureReservePolys,
    ...forestPolys,
    ...woodPolys,
    ...meadowPolys,
    ...grassPolys,
  ]

  const cafes = extractPoints(byCategory.poi, "amenity", "cafe")
  const playgrounds = extractPoints(byCategory.poi, "leisure", "playground")

  console.log(
    `OSM elements: ${parkPolys.length} parks, ${natureReservePolys.length} nature reserves, ` +
      `${forestPolys.length} forest, ${woodPolys.length} wood, ${meadowPolys.length} meadow, ` +
      `${grassPolys.length} grass(>5000m²), ${waterPolys.length} water, ` +
      `${cafes.length} cafés, ${playgrounds.length} playgrounds`,
  )

  const GRID_TARGET = 400
  const gridOffsets = buildGridOffsets(RADIUS_KM, GRID_TARGET)
  console.log(
    `Grid sample: ${gridOffsets.length} points per PLZ (target ${GRID_TARGET})`,
  )

  // Degrees-equivalent of the 1 km radius, for a cheap per-PLZ bbox
  // pre-filter over the (potentially thousands of) green/water polygons.
  const dLatRadius = RADIUS_KM / KM_PER_DEG_LAT
  const dLonRadius = RADIUS_KM / KM_PER_DEG_LON

  const rows = plzRows
    .map(({ plz, lat, lon }) => {
      if (lat == null || lon == null) return null

      const nearbyParks = parkPolys
        .map((p) => ({
          ...p,
          km: distanceKm(lat, lon, p.centroid.lat, p.centroid.lon),
        }))
        .filter((p) => p.km <= RADIUS_KM)
      const parkAreaM2 = Math.round(
        nearbyParks.reduce((sum, p) => sum + (p.areaM2 ?? 0), 0),
      )

      let nearestParkName = null
      let nearestParkKm = null
      for (const p of parkPolys) {
        const km = distanceKm(lat, lon, p.centroid.lat, p.centroid.lon)
        if (nearestParkKm === null || km < nearestParkKm) {
          nearestParkKm = km
          nearestParkName = p.name
        }
      }

      const cafes1km = cafes.filter(
        (c) => distanceKm(lat, lon, c.lat, c.lon) <= RADIUS_KM,
      ).length
      const playgrounds1km = playgrounds.filter(
        (p) => distanceKm(lat, lon, p.lat, p.lon) <= RADIUS_KM,
      ).length

      const plzBbox = {
        minLat: lat - dLatRadius,
        maxLat: lat + dLatRadius,
        minLon: lon - dLonRadius,
        maxLon: lon + dLonRadius,
      }
      const candidateGreen = greenPolys.filter((p) =>
        bboxIntersects(p.bbox, plzBbox),
      )
      const candidateWater = waterPolys.filter((p) =>
        bboxIntersects(p.bbox, plzBbox),
      )

      let greenHits = 0
      let waterHits = 0
      for (const off of gridOffsets) {
        const plat = lat + off.dLat
        const plon = lon + off.dLon
        if (candidateGreen.some((p) => pointInPolygon(plat, plon, p)))
          greenHits++
        if (candidateWater.some((p) => pointInPolygon(plat, plon, p)))
          waterHits++
      }

      return {
        plz,
        parks1km: nearbyParks.length,
        parkAreaM2,
        cafes1km,
        playgrounds1km,
        nearestParkName,
        nearestParkKm: nearestParkKm === null ? null : round(nearestParkKm, 2),
        greenShare1km: round(greenHits / gridOffsets.length, 3),
        waterShare1km: round(waterHits / gridOffsets.length, 3),
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.plz - b.plz)

  const out = {
    fetchedAt: new Date().toISOString(),
    source: "OpenStreetMap contributors (ODbL) via Overpass",
    radiusKm: RADIUS_KM,
    rows,
  }
  writeFileSync(OUT_FILE, JSON.stringify(out, null, 2))
  console.log(`Wrote ${rows.length} rows to ${OUT_FILE}`)

  report(rows)
}

function stats(rows, key) {
  const vals = rows.map((r) => r[key]).filter((v) => v != null)
  const sorted = [...vals].sort((a, b) => a - b)
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  const median = sorted[Math.floor(sorted.length / 2)]
  return { min, median, max, n: vals.length }
}

function report(rows) {
  console.log("\n--- sanity check ---")
  for (const key of [
    "parks1km",
    "parkAreaM2",
    "cafes1km",
    "playgrounds1km",
    "nearestParkKm",
    "greenShare1km",
    "waterShare1km",
  ]) {
    const s = stats(rows, key)
    console.log(
      `${key}: min=${s.min} median=${s.median} max=${s.max} (n=${s.n})`,
    )
  }

  const topByArea = [...rows]
    .sort((a, b) => b.parkAreaM2 - a.parkAreaM2)
    .slice(0, 5)
  console.log("\nTop 5 PLZ by parkAreaM2:")
  for (const r of topByArea) {
    console.log(
      `  ${r.plz}: ${r.parkAreaM2} m² (${r.parks1km} parks, nearest ${r.nearestParkName ?? "?"})`,
    )
  }

  const topByCafes = [...rows]
    .sort((a, b) => b.cafes1km - a.cafes1km)
    .slice(0, 5)
  console.log("\nTop 5 PLZ by cafes1km:")
  for (const r of topByCafes) {
    console.log(`  ${r.plz}: ${r.cafes1km} cafés`)
  }

  const byGreenDesc = [...rows].sort(
    (a, b) => b.greenShare1km - a.greenShare1km,
  )
  console.log("\nTop 5 PLZ by greenShare1km:")
  for (const r of byGreenDesc.slice(0, 5)) {
    console.log(`  ${r.plz}: ${r.greenShare1km} (water ${r.waterShare1km})`)
  }
  console.log("\nBottom 5 PLZ by greenShare1km:")
  for (const r of byGreenDesc.slice(-5).reverse()) {
    console.log(`  ${r.plz}: ${r.greenShare1km} (water ${r.waterShare1km})`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
