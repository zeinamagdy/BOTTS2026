"use client"

import { setWorkerUrl } from "maplibre-gl"
import { useState } from "react"
import Map, { Marker, NavigationControl, Popup } from "react-map-gl/maplibre"
import type { KiezRow } from "@/lib/queries"

// Free vector tiles, no API key needed.
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty"

// See scripts/copy-maplibre-worker.mjs
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs")

const WOHNLAGE_COLOR: Record<string, string> = {
  einfach: "var(--chart-3)",
  mittel: "var(--chart-2)",
  gut: "var(--chart-1)",
}

/** One dot per PLZ centroid, coloured by dominant Wohnlage. */
export function KiezMap({ kieze }: { kieze: KiezRow[] }) {
  const [selected, setSelected] = useState<KiezRow | null>(null)

  return (
    <div className="ring-foreground/10 relative h-[480px] overflow-hidden rounded-xl ring-1">
      <Map
        initialViewState={{ latitude: 52.515, longitude: 13.4, zoom: 10 }}
        mapStyle={MAP_STYLE}
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="top-right" />
        {kieze.map((k) => (
          <Marker
            key={k.plz}
            latitude={k.lat}
            longitude={k.lon}
            onClick={(e) => {
              e.originalEvent.stopPropagation()
              setSelected(k)
            }}
          >
            <button
              className="size-3.5 rounded-full border-2 border-white shadow"
              style={{
                background:
                  WOHNLAGE_COLOR[k.dominantWohnlage ?? ""] ??
                  "var(--muted-foreground)",
              }}
              aria-label={`${k.plz} ${k.ortsteil ?? ""}`}
            />
          </Marker>
        ))}
        {selected && (
          <Popup
            latitude={selected.lat}
            longitude={selected.lon}
            onClose={() => setSelected(null)}
            closeOnClick={false}
          >
            <div className="space-y-0.5 text-sm text-neutral-900">
              <p className="font-medium">
                {selected.plz} {selected.ortsteil}
              </p>
              <p className="text-xs text-neutral-600">{selected.bezirk}</p>
              <p>
                Wohnlage: {selected.dominantWohnlage} (
                {Math.round(selected.pctWohnlageGut ?? 0)}% gut)
              </p>
              {selected.rentPerM2KaltSynthetic != null && (
                <p>
                  Rent: {selected.rentPerM2KaltSynthetic.toFixed(2)} €/m²
                  (synthetic)
                </p>
              )}
              <p>
                Kitas: {selected.nKitas} · Abitur: {selected.abiturTierBezirk}
              </p>
              {selected.nearestTransitStation && (
                <p>
                  {selected.nearestTransitStation} (
                  {selected.nearestTransitLine})
                </p>
              )}
            </div>
          </Popup>
        )}
      </Map>
      <div className="bg-background/90 absolute bottom-3 left-3 flex gap-3 rounded-md px-3 py-1.5 text-xs shadow">
        {Object.entries(WOHNLAGE_COLOR).map(([label, color]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-full"
              style={{ background: color }}
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
