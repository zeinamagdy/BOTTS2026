// Fetches a representative photo per Kiez (PLZ) from Wikimedia Commons geosearch,
// filtered to real free-licensed landscape photos, and writes
// data/derived/kiez-photos.json. Plain Node ESM, no new dependencies.
//
// Usage:
//   node scripts/fetch-photos.mjs           # use cache when available
//   node scripts/fetch-photos.mjs --refresh  # ignore cache, re-fetch everything

import postgres from "postgres"
import dotenv from "dotenv"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")

dotenv.config({ path: path.join(rootDir, ".env.local") })

const REFRESH = process.argv.includes("--refresh")
const USER_AGENT = "KiezConcierge/0.1 (hackathon; contact via github)"
const CACHE_DIR = path.join(rootDir, "data/derived/.cache/commons")
const OUT_PATH = path.join(rootDir, "data/derived/kiez-photos.json")
const CONCURRENCY = 2
const DELAY_MS = 400

const BAD_WORDS =
  /\b(map|plan|logo|wappen|coat|diagram|karte|schild|sign|stolperstein|plaque|gedenktafel|interior|innen|document|poster|portrait|concert|konzert|privat\s?club)\b/i

// German compound nouns where the bad term never has a trailing word
// boundary (e.g. "Gewaltschutzambulanz", "Verkehrsopferhilfe") - matched as
// plain substrings instead of \b-delimited words.
const BAD_SUBSTRINGS = [
  "verkehrsopfer",
  "unfallopfer",
  "rechtsmedizin",
  "forensisch",
  "gewaltschutz",
  "guggenheim",
]

// Vehicles/car-show photos: geosearch near car dealerships/museums (e.g. the
// "Automobilforum Unter den Linden") surfaces a lot of these; they aren't
// neighbourhood photos even though they're geotagged nearby.
const VEHICLE_WORDS =
  /\b(porsche|bentley|bugatti|ferrari|karmann|spyder|roadster|showcar|show car|oldtimer|sportwagen|sports car|automobilforum|volkswagen group forum)\b/i

// Wildlife/plant close-ups from iNaturalist imports: real photos, but not
// neighbourhood scenes.
const NATURE_PHOTO = /inaturalist|bryophyta|\blichen\b|\bmoss(es)?\b/i

const FREE_LICENSE = /(cc[\s-]?by(-sa)?|cc0|public\s*domain|pd-)/i

// Commons flags recognisable-people photos with this category; treat as a
// portrait/event-photo signal and exclude, same spirit as the interior/plaque
// exclusions above.
const PERSONALITY_RIGHTS = /personality rights warning/i

const KIEZ_WORDS =
  /\b(kiez|straße|strasse|platz|park|allee|weg|ufer|damm|brücke|bruecke)\b/i

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function stripHtml(html) {
  if (!html) return null
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
}

async function fetchGeosearch(plz, lat, lon) {
  const cachePath = path.join(CACHE_DIR, `${plz}.json`)
  if (!REFRESH && existsSync(cachePath)) {
    const cached = JSON.parse(readFileSync(cachePath, "utf8"))
    // Don't trust a cached error (e.g. rate limit) as a real "no photos" result.
    if (!cached.error) return cached
  }

  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "geosearch",
    ggscoord: `${lat}|${lon}`,
    ggsradius: "1000",
    ggsnamespace: "6",
    ggslimit: "30",
    prop: "imageinfo",
    iiprop: "url|extmetadata|size|mime",
    iiurlwidth: "1200",
  })

  const url = `https://commons.wikimedia.org/w/api.php?${params.toString()}`

  const maxAttempts = 5
  let data = { error: "unknown" }
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
      })
      if (res.status === 429 || res.status === 503) {
        const retryAfter = Number(res.headers.get("retry-after")) || 0
        const backoff = Math.max(retryAfter * 1000, 1000 * 2 ** attempt)
        data = { error: `HTTP ${res.status}` }
        if (attempt < maxAttempts) {
          await sleep(backoff)
          continue
        }
      } else if (!res.ok) {
        data = { error: `HTTP ${res.status}` }
        break
      } else {
        data = await res.json()
        break
      }
    } catch (err) {
      data = { error: String(err) }
      if (attempt < maxAttempts) {
        await sleep(1000 * 2 ** attempt)
        continue
      }
    }
  }

  writeFileSync(cachePath, JSON.stringify(data), "utf8")
  return data
}

function scoreCandidate(page, ortsteil) {
  const imageinfo = page.imageinfo?.[0]
  if (!imageinfo) return null

  const mime = imageinfo.mime
  if (mime !== "image/jpeg") return null

  const width = imageinfo.thumbwidth ?? imageinfo.width
  const height = imageinfo.thumbheight ?? imageinfo.height
  if (!width || !height) return null
  if (width < 1200) return null
  if (!(width > height)) return null

  const title = page.title ?? ""
  const extmetadata = imageinfo.extmetadata ?? {}
  const description = extmetadata.ImageDescription?.value ?? ""
  const categories = extmetadata.Categories?.value ?? ""

  const combinedText = `${title} ${description} ${categories}`
  const combinedLower = combinedText.toLowerCase()
  if (BAD_WORDS.test(combinedText)) return null
  if (BAD_SUBSTRINGS.some((word) => combinedLower.includes(word))) return null
  if (VEHICLE_WORDS.test(combinedText)) return null
  if (NATURE_PHOTO.test(combinedText)) return null
  if (PERSONALITY_RIGHTS.test(categories)) return null

  const licenseShortName = extmetadata.LicenseShortName?.value ?? ""
  if (!FREE_LICENSE.test(licenseShortName)) return null

  const ratio = width / height
  const ratioScore = ratio >= 1.3 && ratio <= 1.8 ? 1 : 0.3
  const sizeScore = Math.min(imageinfo.width ?? width, 4000) / 4000

  let relevanceScore = 0
  if (ortsteil && combinedText.toLowerCase().includes(ortsteil.toLowerCase())) {
    relevanceScore += 2
  }
  if (KIEZ_WORDS.test(combinedText)) {
    relevanceScore += 1
  }

  const totalScore = relevanceScore * 10 + ratioScore * 3 + sizeScore

  const licenseUrl = extmetadata.LicenseUrl?.value ?? null
  const author = stripHtml(extmetadata.Artist?.value)

  return {
    score: totalScore,
    row: {
      title,
      thumbUrl: imageinfo.thumburl ?? null,
      pageUrl: imageinfo.descriptionurl ?? null,
      author: author ?? null,
      license: licenseShortName || null,
      licenseUrl: licenseUrl,
    },
  }
}

function pickBestPhoto(data, ortsteil) {
  const pages = data?.query?.pages
  if (!pages) return null

  const candidates = []
  for (const page of Object.values(pages)) {
    // Commons imageinfo mostly returns thumburl on thumb.wikimedia.org these
    // days (a Wikimedia-operated thumbnailing CDN), not upload.wikimedia.org
    // directly. Accept any *.wikimedia.org host, reject anything else.
    const thumbUrl = page.imageinfo?.[0]?.thumburl
    if (thumbUrl && !/^https:\/\/[a-z0-9.-]*\.?wikimedia\.org\//.test(thumbUrl))
      continue
    const candidate = scoreCandidate(page, ortsteil)
    if (candidate) candidates.push(candidate)
  }

  if (candidates.length === 0) return null

  candidates.sort((a, b) => b.score - a.score)
  return candidates[0].row
}

async function processKiez(kiez) {
  const { plz, lat, lon, ortsteil } = kiez

  if (lat == null || lon == null) {
    return {
      plz,
      ortsteil,
      title: null,
      thumbUrl: null,
      pageUrl: null,
      author: null,
      license: null,
      licenseUrl: null,
    }
  }

  const data = await fetchGeosearch(plz, lat, lon)
  const best = pickBestPhoto(data, ortsteil)

  if (!best) {
    return {
      plz,
      ortsteil,
      title: null,
      thumbUrl: null,
      pageUrl: null,
      author: null,
      license: null,
      licenseUrl: null,
    }
  }

  return {
    plz,
    ortsteil,
    title: best.title,
    thumbUrl: best.thumbUrl,
    pageUrl: best.pageUrl,
    author: best.author,
    license: best.license,
    licenseUrl: best.licenseUrl,
  }
}

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length)
  let index = 0

  async function next() {
    while (index < items.length) {
      const current = index++
      results[current] = await worker(items[current], current)
      await sleep(DELAY_MS)
    }
  }

  const workers = Array.from({ length: concurrency }, () => next())
  await Promise.all(workers)
  return results
}

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true })
  mkdirSync(path.dirname(OUT_PATH), { recursive: true })

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error("DATABASE_URL not set (check .env.local)")
    process.exit(1)
  }

  const sql = postgres(databaseUrl)

  let kiezRows
  try {
    kiezRows =
      await sql`select plz, lat, lon, ortsteil, bezirk from kiez_profiles order by plz`
  } finally {
    await sql.end()
  }

  console.log(`Fetched ${kiezRows.length} kiez profiles from Postgres`)

  let done = 0
  const results = await runPool(
    kiezRows,
    async (kiez) => {
      const row = await processKiez(kiez)
      done++
      if (done % 20 === 0 || done === kiezRows.length) {
        console.log(`  ${done}/${kiezRows.length} processed`)
      }
      return row
    },
    CONCURRENCY,
  )

  results.sort((a, b) => String(a.plz).localeCompare(String(b.plz)))

  const output = {
    fetchedAt: new Date().toISOString(),
    source: "Wikimedia Commons",
    rows: results,
  }

  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), "utf8")

  const found = results.filter((r) => r.thumbUrl).length
  console.log(`\nDone. ${found}/${results.length} PLZs got a photo.`)
  console.log(`Written to ${path.relative(rootDir, OUT_PATH)}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
