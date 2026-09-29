"use client"

import {
  setWorkerUrl,
  type ExpressionSpecification,
  type FilterSpecification,
} from "maplibre-gl"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Map, {
  Layer,
  Marker,
  NavigationControl,
  Popup,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre"
import type { ResultsMap as ResultsMapData } from "@/lib/queries"
import { MAP_LAYER_KEYS, MAP_LAYERS, type MapLayer } from "@/lib/map-layers"
import { cn } from "@/lib/utils"

// Free vector tiles, no API key needed (same basemap as the dashboard map).
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty"
// See scripts/copy-maplibre-worker.mjs
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs")

/** Card buttons ask the map to show an area through this window event. */
export const SHOW_AREA_EVENT = "kiez:show-area"

type Geo =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] }
type Area = ResultsMapData["areas"][number]
type Poi = ResultsMapData["pois"][number]

const HOBBY_CATEGORIES: Record<string, string> = {
  yoga: "yoga_studios",
  gym: "gym",
  bouldering: "bouldering",
}

/** Basemap POIs per tiles layer, filtered from the OpenMapTiles `poi` source layer. */
const TILE_POI_FILTERS: Partial<Record<MapLayer, FilterSpecification>> = {
  schools: ["==", ["get", "subclass"], "school"],
  playgrounds: ["==", ["get", "class"], "playground"],
  cafes: ["==", ["get", "class"], "cafe"],
  transit: [
    "match",
    ["get", "subclass"],
    ["station", "halt", "subway", "tram_stop"],
    true,
    false,
  ],
}
const POINT_COLORS = [
  "match",
  ["get", "layer"],
  ...MAP_LAYER_KEYS.flatMap((k) => [k, MAP_LAYERS[k].color]),
  "#737373",
] as unknown as ExpressionSpecification

/** The OpenMapTiles `poi` layer is complete only in z14 tiles */
const TILE_COUNT_MIN_ZOOM = 14

/** Basemap polygons each tiles layer recolours while it is on. */
const TILE_FILLS: Partial<Record<MapLayer, string[]>> = {
  green: ["park", "landcover_wood", "landcover_grass"],
  schools: ["landuse_school"],
}

function inRing([x, y]: number[], ring: number[][]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside
  }
  return inside
}
function inArea(pt: number[], g: Geo) {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates
  return polys.some(
    ([outer, ...holes]) =>
      inRing(pt, outer) && !holes.some((h) => inRing(pt, h)),
  )
}

function poiLayer(p: Poi, hobbies: string[]): MapLayer | null {
  if (p.category === "kita") return "kitas"
  if (p.category === "kinderarzt") return "kinderarzt"
  const wanted = hobbies.length
    ? hobbies.map((h) => HOBBY_CATEGORIES[h])
    : Object.values(HOBBY_CATEGORIES)
  return wanted.includes(p.category) ? "hobbies" : null
}

type Picked = { lon: number; lat: number; name: string; layer: MapLayer }

export function ResultsMap({
  areas,
  pois,
  initialLayers,
  hobbies,
}: ResultsMapData & { initialLayers: MapLayer[]; hobbies: string[] }) {
  const mapRef = useRef<MapRef>(null)
  const [loaded, setLoaded] = useState(false)
  const [selected, setSelected] = useState(0)
  const [on, setOn] = useState<Set<MapLayer>>(() => new Set(initialLayers))
  const [picked, setPicked] = useState<Picked | null>(null)
  const [hovering, setHovering] = useState(false)
  const [tileCounts, setTileCounts] = useState<
    Partial<Record<MapLayer, number>>
  >({})
  const originals = useRef<Record<string, [string, number]>>({})
  const area: Area | undefined = areas[selected]

  const points = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: pois.flatMap((p) => {
        const layer = poiLayer(p, hobbies)
        return layer
          ? [
              {
                type: "Feature" as const,
                geometry: {
                  type: "Point" as const,
                  coordinates: [p.lon, p.lat],
                },
                properties: { layer, name: p.name ?? "", plrId: p.plrId },
              },
            ]
          : []
      }),
    }),
    [pois, hobbies],
  )
  const shapes = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: areas.map((a, i) => ({
        type: "Feature" as const,
        geometry: a.geometry as Geo,
        properties: { selected: i === selected },
      })),
    }),
    [areas, selected],
  )

  const show = useCallback(
    (i: number) => {
      const a = areas[i]
      if (!a) return
      setSelected(i)
      setPicked(null)
      setTileCounts({})
      mapRef.current?.fitBounds(a.bbox, { padding: 48, maxZoom: 15.5 })
    },
    [areas],
  )

  // "Explore area" on a card: scroll here and show that area
  useEffect(() => {
    const onShow = (e: Event) => {
      const i = areas.findIndex(
        (a) => a.plrId === (e as CustomEvent<string>).detail,
      )
      if (i < 0) return
      show(i)
      document
        .getElementById("results-map")
        ?.scrollIntoView({ behavior: "smooth", block: "start" })
    }
    window.addEventListener(SHOW_AREA_EVENT, onShow)
    return () => window.removeEventListener(SHOW_AREA_EVENT, onShow)
  }, [areas, show])

  // Recolour the basemap's parks / school grounds while their layer is on
  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!loaded || !map) return
    for (const [key, ids] of Object.entries(TILE_FILLS)) {
      const active = on.has(key as MapLayer)
      for (const id of ids) {
        if (!map.getLayer(id)) continue
        originals.current[id] ??= [
          map.getPaintProperty(id, "fill-color") as string,
          map.getPaintProperty(id, "fill-opacity") as number,
        ]
        const [color, opacity] = originals.current[id]
        map.setPaintProperty(
          id,
          "fill-color",
          active ? MAP_LAYERS[key as MapLayer].color : color,
        )
        map.setPaintProperty(id, "fill-opacity", active ? 0.45 : opacity)
      }
    }
  }, [loaded, on])

  // Count the basemap POIs inside the shown area whenever the map settles (tiles loaded)
  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!loaded || !map || !area) return
    const count = () => {
      const next: Partial<Record<MapLayer, number>> = {}
      // Below z14 the tiles leave out most small POIs: show no number rather than a wrong one
      if (map.getZoom() < TILE_COUNT_MIN_ZOOM)
        return setTileCounts((prev) => (Object.keys(prev).length ? {} : prev))
      for (const [key, filter] of Object.entries(TILE_POI_FILTERS)) {
        const seen = new Set<string>()
        for (const f of map.querySourceFeatures("openmaptiles", {
          sourceLayer: "poi",
          filter,
        })) {
          if (f.geometry.type !== "Point") continue
          const c = f.geometry.coordinates
          if (inArea(c, area.geometry as Geo))
            seen.add(
              `${f.properties.name ?? ""}|${c[0].toFixed(4)},${c[1].toFixed(4)}`,
            )
        }
        next[key as MapLayer] = seen.size
      }
      setTileCounts((prev) =>
        JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
      )
    }
    map.on("idle", count)
    return () => {
      map.off("idle", count)
    }
  }, [loaded, area])

  const counts = useMemo(() => {
    const c: Partial<Record<MapLayer, number>> = {
      ...tileCounts,
      kitas: 0,
      kinderarzt: 0,
      hobbies: 0,
    }
    for (const f of points.features)
      if (f.properties.plrId === area?.plrId) c[f.properties.layer]! += 1
    return c
  }, [points, tileCounts, area])

  const toggle = (k: MapLayer) =>
    setOn((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })

  const tileLayerIds = Object.keys(TILE_POI_FILTERS).map((k) => `hl-${k}`)
  const onClick = (e: MapLayerMouseEvent) => {
    const f = e.features?.[0]
    if (!f || f.geometry.type !== "Point") return setPicked(null)
    const layer = (f.properties.layer ??
      f.layer.id.replace(/^hl-/, "")) as MapLayer
    const [lon, lat] = f.geometry.coordinates
    setPicked({ lon, lat, name: f.properties.name || "", layer })
  }

  if (!area) return null
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Area">
        {areas.map((a, i) => (
          <button
            key={a.plrId}
            role="tab"
            aria-selected={i === selected}
            onClick={() => show(i)}
            className={cn(
              "flex items-center gap-2 rounded-full border px-3 py-2 font-medium transition-colors",
              i === selected
                ? "bg-brand-950 border-brand-950 text-white"
                : "bg-background border-input text-subtle hover:text-heading",
            )}
          >
            <span
              className={cn(
                "grid size-6 place-items-center rounded-full text-sm font-bold",
                i === selected ? "bg-brand-500" : "bg-chip text-heading",
              )}
            >
              {i + 1}
            </span>
            {a.plrName}
          </button>
        ))}
      </div>

      <ul className="flex flex-wrap gap-2" aria-label="Show on the map">
        {MAP_LAYER_KEYS.map((k) => {
          const l = MAP_LAYERS[k]
          const active = on.has(k)
          const n = counts[k]
          return (
            <li key={k}>
              <button
                aria-pressed={active}
                onClick={() => toggle(k)}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-background border-input text-heading"
                    : "border-input text-faint hover:text-subtle border-dashed",
                )}
              >
                <span
                  aria-hidden
                  className="size-3 rounded-full border-2"
                  style={{
                    borderColor: l.color,
                    background: active ? l.color : "transparent",
                  }}
                />
                {l.label}
                {n != null && (
                  <span className="text-subtle tabular-nums">
                    · {n}
                    <span className="sr-only"> in the area</span>
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      <div className="ring-foreground/10 relative h-[420px] overflow-hidden rounded-[20px] ring-1 sm:h-[520px]">
        <Map
          ref={mapRef}
          initialViewState={{
            bounds: area.bbox,
            fitBoundsOptions: { padding: 48, maxZoom: 15.5 },
          }}
          mapStyle={MAP_STYLE}
          style={{ width: "100%", height: "100%" }}
          onLoad={() => setLoaded(true)}
          interactiveLayerIds={["hl-points", ...tileLayerIds]}
          onClick={onClick}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          cursor={hovering ? "pointer" : "grab"}
        >
          <NavigationControl position="top-right" showCompass={false} />

          <Source id="areas" type="geojson" data={shapes}>
            <Layer
              id="area-fill"
              type="fill"
              paint={{
                "fill-color": "#ea580c",
                "fill-opacity": ["case", ["get", "selected"], 0.1, 0.04],
              }}
            />
            <Layer
              id="area-line"
              type="line"
              paint={{
                "line-color": "#ea580c",
                "line-width": ["case", ["get", "selected"], 3, 1.5],
                "line-opacity": ["case", ["get", "selected"], 1, 0.6],
              }}
            />
          </Source>

          {Object.entries(TILE_POI_FILTERS).map(([k, filter]) => (
            <Layer
              key={k}
              id={`hl-${k}`}
              type="circle"
              source="openmaptiles"
              source-layer="poi"
              filter={filter}
              minzoom={12}
              layout={{
                visibility: on.has(k as MapLayer) ? "visible" : "none",
              }}
              paint={{
                "circle-radius": 6,
                "circle-color": MAP_LAYERS[k as MapLayer].color,
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 2,
              }}
            />
          ))}

          <Source id="points" type="geojson" data={points}>
            <Layer
              id="hl-points"
              type="circle"
              filter={[
                "in",
                ["get", "layer"],
                ["literal", MAP_LAYER_KEYS.filter((k) => on.has(k))],
              ]}
              paint={{
                "circle-radius": 6,
                "circle-color": POINT_COLORS,
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 2,
              }}
            />
          </Source>

          {areas.map((a, i) => (
            <Marker
              key={a.plrId}
              longitude={(a.bbox[0] + a.bbox[2]) / 2}
              latitude={(a.bbox[1] + a.bbox[3]) / 2}
            >
              <button
                onClick={() => show(i)}
                aria-label={`Show ${a.plrName}`}
                className={cn(
                  "grid size-8 place-items-center rounded-full border-2 border-white text-sm font-bold text-white shadow-md",
                  i === selected ? "bg-brand-950" : "bg-brand-500",
                )}
              >
                {i + 1}
              </button>
            </Marker>
          ))}

          {picked && (
            <Popup
              longitude={picked.lon}
              latitude={picked.lat}
              onClose={() => setPicked(null)}
              closeOnClick={false}
              offset={10}
            >
              <div className="text-sm text-neutral-900">
                <p className="font-medium">
                  {picked.name || MAP_LAYERS[picked.layer].label}
                </p>
                {picked.name && (
                  <p className="text-xs text-neutral-600">
                    {MAP_LAYERS[picked.layer].label}
                  </p>
                )}
              </div>
            </Popup>
          )}
        </Map>
      </div>
    </div>
  )
}
