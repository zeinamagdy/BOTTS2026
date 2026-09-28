// MapLibre v6 loads its web worker as a separate ES module, which Turbopack
// doesn't bundle. Serve it (plus the shared chunk it imports) from /public.
import { copyFileSync, mkdirSync } from "node:fs"

const src = "node_modules/maplibre-gl/dist"
const out = "public/maplibre"
mkdirSync(out, { recursive: true })
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(`${src}/${f}`, `${out}/${f}`)
}
