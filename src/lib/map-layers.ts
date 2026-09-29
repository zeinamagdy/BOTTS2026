import type { Picks, PriorityKey } from "@/lib/finder-params"

/**
 * Highlight layers of the finder's results map. `tiles` layers restyle or filter the OpenFreeMap
 * basemap (OpenStreetMap), `db` layers draw our `poi_locations` points. Map paint can't read CSS
 * variables, so the colours are plain hex (the map itself is always the light basemap).
 */
export const MAP_LAYERS = {
  green: { label: "Parks & green", color: "#16a34a", from: "tiles" },
  kitas: { label: "Kitas", color: "#7c3aed", from: "db" },
  schools: { label: "Schools", color: "#2563eb", from: "tiles" },
  playgrounds: { label: "Playgrounds", color: "#db2777", from: "tiles" },
  kinderarzt: { label: "Kinderarzt", color: "#dc2626", from: "db" },
  transit: { label: "Stations", color: "#0f766e", from: "tiles" },
  cafes: { label: "Cafés", color: "#92400e", from: "tiles" },
  hobbies: { label: "Yoga, gyms, bouldering", color: "#0284c7", from: "db" },
} as const
export type MapLayer = keyof typeof MAP_LAYERS
export const MAP_LAYER_KEYS = Object.keys(MAP_LAYERS) as MapLayer[]

/** Which ranking priority each layer shows (the rest have no location to point at) */
const FROM_PRIORITY: Partial<Record<PriorityKey, MapLayer>> = {
  green: "green",
  parks: "green",
  kitas: "kitas",
  schools: "schools",
  playgrounds: "playgrounds",
  transit: "transit",
  cafes: "cafes",
}

/** Layers switched on at first: what the person protects, needs or does. */
export function defaultMapLayers(p: Picks): MapLayer[] {
  const on = new Set<MapLayer>()
  for (const [k, layer] of Object.entries(FROM_PRIORITY))
    if (p.levels[k as PriorityKey] === "protect") on.add(layer)
  if (p.must.includes("kita")) on.add("kitas")
  if (p.must.includes("kinderarzt")) on.add("kinderarzt")
  if (p.hobbies.length) on.add("hobbies")
  if (!on.size) on.add("green").add("kitas")
  return MAP_LAYER_KEYS.filter((k) => on.has(k))
}
