// Builds the placeholder first-name pool for the landlord demo applicants from
// Berlin's open data "Liste der häufigen Vornamen" (names of newborns registered
// at the 12 Bezirk registry offices, 2012–2023, MIT-licensed mirror of
// daten.berlin.de at github.com/berlin/haeufige-vornamen-berlin). Writes
// data/derived/berlin-first-names.json. Plain Node ESM, no dependencies.
//
// Usage: node scripts/fetch-names.mjs

import { writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const OUT_PATH = path.join(rootDir, "data/derived/berlin-first-names.json")
const BASE =
  "https://raw.githubusercontent.com/berlin/haeufige-vornamen-berlin/master/data"
const YEARS = Array.from({ length: 12 }, (_, i) => 2012 + i)
const BEZIRKE = [
  "charlottenburg-wilmersdorf",
  "friedrichshain-kreuzberg",
  "lichtenberg",
  "marzahn-hellersdorf",
  "mitte",
  "neukoelln",
  "pankow",
  "reinickendorf",
  "spandau",
  "steglitz-zehlendorf",
  "tempelhof-schoeneberg",
  "treptow-koepenick",
]
/** Per gender: large enough for variety, small enough that every name is common */
const TOP = 150

// Tiny CSV reader: the files are plain "vorname,anzahl,geschlecht[,position]"
function parse(csv) {
  const [header, ...lines] = csv.trim().split(/\r?\n/)
  const cols = header.split(",")
  return lines.map((l) =>
    Object.fromEntries(l.split(",").map((v, i) => [cols[i], v])),
  )
}

const counts = { w: new Map(), m: new Map() }
for (const year of YEARS) {
  for (const bezirk of BEZIRKE) {
    const res = await fetch(`${BASE}/${year}/${bezirk}.csv`)
    if (!res.ok) {
      console.warn(`skip ${year}/${bezirk}: HTTP ${res.status}`)
      continue
    }
    for (const row of parse(await res.text())) {
      // From 2017 on a name is listed per position; the first one is closest to a call name
      if (row.position && row.position !== "1") continue
      const map = counts[row.geschlecht]
      const name = row.vorname?.trim()
      if (!map || !name || !/^\p{L}[\p{L}' -]*$/u.test(name)) continue
      map.set(name, (map.get(name) ?? 0) + Number(row.anzahl || 0))
    }
  }
  console.log(`read ${year}`)
}

const top = (map) =>
  [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP)
    .map(([name]) => name)

const out = {
  source:
    "Berlin open data, Liste der häufigen Vornamen 2012–2023 (daten.berlin.de, via github.com/berlin/haeufige-vornamen-berlin, MIT)",
  note: `Top ${TOP} first names per gender among Berlin newborns, first position only from 2017. Placeholder names for demo data, not real people.`,
  female: top(counts.w),
  male: top(counts.m),
}
writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n")
console.log(
  `wrote ${OUT_PATH}: ${out.female.length} female, ${out.male.length} male`,
)
