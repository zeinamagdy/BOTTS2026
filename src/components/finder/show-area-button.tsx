"use client"

import type { ReactNode } from "react"

/** Must match SHOW_AREA_EVENT in results-map.tsx (not imported: that file pulls in maplibre) */
const SHOW_AREA_EVENT = "kiez:show-area"

/** Scrolls to the results map and shows this area there. */
export function ShowAreaButton({
  plrId,
  className,
  children,
}: {
  plrId: string
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        window.dispatchEvent(
          new CustomEvent(SHOW_AREA_EVENT, { detail: plrId }),
        )
        // Fallback while the lazy map is still loading
        document
          .getElementById("results-map")
          ?.scrollIntoView({ behavior: "smooth", block: "start" })
      }}
    >
      {children}
    </button>
  )
}
