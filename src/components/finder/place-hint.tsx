"use client"

import { useEffect, useRef, useState } from "react"
import { locatePlaceAction } from "@/app/find/actions"
import type { PlaceMatch } from "@/lib/queries"

const FOUND_LABEL = {
  address: "Found",
  station: "Station found",
  street: "Street found",
  plz: "Postcode found",
  place: "Place found",
} satisfies Record<NonNullable<PlaceMatch["found"]>, string>

/**
 * Under an address field: what we'll measure the commute from, like the
 * landlord's address lookup. Debounced; stale answers are dropped.
 */
export function PlaceHint({
  query,
  onPick,
}: {
  query: string
  /** A suggested spelling was chosen: the new text for the field */
  onPick: (address: string) => void
}) {
  const [match, setMatch] = useState<{ q: string; m: PlaceMatch } | null>(null)
  const request = useRef(0)
  const q = query.trim()

  useEffect(() => {
    if (q.length < 3) return
    const n = ++request.current
    const t = setTimeout(async () => {
      const m = await locatePlaceAction(q)
      if (n === request.current) setMatch({ q, m })
    }, 600)
    return () => clearTimeout(t)
  }, [q])

  if (q.length < 3) return null
  if (match?.q !== q)
    return <p className="text-subtle text-sm">Looking up the address…</p>
  const m = match.m
  if (!m.found) {
    // keep the house number and PLZ when swapping in a suggested street
    const rest = q.match(/\s+\d+\s*[a-z]?\b.*$/i)?.[0] ?? ""
    return (
      <p className="text-subtle text-sm">
        Not a place we know in Berlin yet. Try “Street 12, PLZ”
        {m.suggestions.length > 0 && (
          <>
            , or did you mean{" "}
            {m.suggestions.map((s, i) => (
              <span key={s}>
                {i > 0 && (i === m.suggestions.length - 1 ? " or " : ", ")}
                <button
                  type="button"
                  onClick={() => onPick(s + rest)}
                  className="text-heading font-medium underline underline-offset-2"
                >
                  {s}
                </button>
              </span>
            ))}
            ?
          </>
        )}
        {m.suggestions.length === 0 && "."}
      </p>
    )
  }
  return (
    <p className="text-subtle text-sm">
      {FOUND_LABEL[m.found]}:{" "}
      {[m.found === "plz" ? null : m.name, m.plz, m.ortsteil]
        .filter(Boolean)
        .join(" · ")}
    </p>
  )
}
