import "server-only"

/**
 * Minimal client for the public BVG HAFAS REST API (v6.bvg.transport.rest, no
 * key, ~100 req/min). It is a volunteer-run service and is sometimes down, so
 * every call returns null on failure and callers fall back to an estimate.
 */
const BASE = process.env.BVG_API_URL ?? "https://v6.bvg.transport.rest"
const TIMEOUT_MS = 8000

async function api<T>(path: string, params: Record<string, string>) {
  try {
    const res = await fetch(`${BASE}${path}?${new URLSearchParams(params)}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": "KiezConcierge/0.1 (hackathon demo)" },
      next: { revalidate: 86_400 },
    })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

export type Place = { lat: number; lon: number; name: string; stopId?: string }

export async function bvgGeocode(query: string): Promise<Place | null> {
  type Loc = {
    type: string
    id?: string
    name?: string
    address?: string
    latitude?: number
    longitude?: number
    location?: { latitude: number; longitude: number }
  }
  const locs = await api<Loc[]>("/locations", {
    query,
    results: "1",
    addresses: "true",
    stops: "true",
    poi: "true",
  })
  const l = locs?.[0]
  const lat = l?.latitude ?? l?.location?.latitude
  const lon = l?.longitude ?? l?.location?.longitude
  if (!l || lat == null || lon == null) return null
  return {
    lat,
    lon,
    name: l.name ?? l.address ?? query,
    stopId: l.type === "stop" || l.type === "station" ? l.id : undefined,
  }
}

/** Next weekday 08:00 in Berlin, as ISO with the correct DST offset. */
function nextWeekdayMorning(time = "08:00") {
  const d = new Date(Date.now() + 86_400_000)
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1)
  const date = d.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
  const offset =
    new Intl.DateTimeFormat("en", {
      timeZone: "Europe/Berlin",
      timeZoneName: "longOffset",
    })
      .formatToParts(d)
      .find((p) => p.type === "timeZoneName")
      ?.value.replace("GMT", "") || "+01:00"
  return `${date}T${time}:00${offset}`
}

export type Journey = {
  minutes: number
  transfers: number
  lines: string[]
  departure: string
}

export async function bvgJourney(
  from: Place,
  to: Place,
  departAt?: string | null,
): Promise<Journey | null> {
  const end = (p: Place, k: "from" | "to") =>
    p.stopId
      ? { [k]: p.stopId }
      : {
          [`${k}.latitude`]: String(p.lat),
          [`${k}.longitude`]: String(p.lon),
          [`${k}.address`]: p.name,
        }
  type Leg = {
    departure: string
    arrival: string
    walking?: boolean
    line?: { name: string }
  }
  const data = await api<{ journeys?: { legs: Leg[] }[] }>("/journeys", {
    ...end(from, "from"),
    ...end(to, "to"),
    departure: nextWeekdayMorning(departAt ?? undefined),
    results: "1",
    stopovers: "false",
    remarks: "false",
  })
  const legs = data?.journeys?.[0]?.legs
  if (!legs?.length) return null
  const rides = legs.filter((l) => !l.walking && l.line)
  return {
    minutes: Math.round(
      (Date.parse(legs.at(-1)!.arrival) - Date.parse(legs[0].departure)) /
        60_000,
    ),
    transfers: Math.max(rides.length - 1, 0),
    lines: rides.map((l) => l.line!.name),
    departure: legs[0].departure,
  }
}
