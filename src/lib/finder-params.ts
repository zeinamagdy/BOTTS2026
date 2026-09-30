import { z } from "zod"
import {
  HOBBIES as POI_HOBBIES,
  type RankPlanungsraumInput,
} from "@/lib/filters"

/**
 * The Kiez finder's answers, kept in the URL so a result is shareable and the
 * pitch demo is reproducible. Shared by the client wizard and the results page.
 */
export const PLACE_KINDS = [
  "Work",
  "School",
  "Kita",
  "Hobbies",
  "Family",
  "Home",
  "Other",
] as const
export const COMMUTE_OPTIONS = [20, 30, 45, 60] as const
export const KIDS_OPTIONS = [0, 1, 2, 3] as const
export const MAX_PLACES = 3

// ─── Priorities: the ranking keys of `rankPlanungsraum` ─────────────────────

type Factor = keyof NonNullable<RankPlanungsraumInput["weights"]>
/** Every ranking factor except `hobbies`, which the hobby chips drive */
export type PriorityKey = Exclude<Factor, "hobbies">

/**
 * Everything a person can tick under "Things you'd like nearby". The first three are
 * OSM hobby points (ranked through `rankPlanungsraum`'s `hobbies`); the rest raise the
 * weight of the ranking factor of the same key to Must have.
 */
export const INTERESTS = [
  { value: "yoga", label: "Yoga" },
  { value: "gym", label: "Gym" },
  { value: "bouldering", label: "Bouldering" },
  { value: "cafes", label: "Cafés" },
  { value: "playgrounds", label: "Playgrounds" },
  { value: "parks", label: "Parks & green" },
] as const
export type Hobby = (typeof INTERESTS)[number]["value"]
export const HOBBIES = INTERESTS.map((i) => i.value) as Hobby[]
export type PoiHobby = (typeof POI_HOBBIES)[number]
export const isPoiHobby = (h: Hobby): h is PoiHobby =>
  (POI_HOBBIES as readonly string[]).includes(h)

/**
 * Label and data source per ranking factor. Typed against the `rankPlanungsraumInput`
 * weights, so a new factor there fails the build until it is added here.
 */
export const PRIORITY_META: Record<
  PriorityKey,
  { label: string; hint: string }
> = {
  schools: {
    label: "Good schools",
    hint: "Abitur results vs peer schools, Bezirk-level where the area has none",
  },
  kitas: { label: "Kita places", hint: "Kita places per child under 6" },
  safety: {
    label: "Safety",
    hint: "Crime rate per 10,000 residents, Bezirk-level",
  },
  noise: { label: "Quiet", hint: "Umweltatlas noise" },
  air: { label: "Clean air", hint: "Umweltatlas air" },
  green: { label: "Green space", hint: "Umweltatlas green-space supply" },
  heat: { label: "Cool summers", hint: "Umweltatlas heat stress" },
  transit: {
    label: "Close to transit",
    hint: "Nearest U, S, tram or regional stop (VBB)",
  },
  nearCenter: { label: "Central", hint: "Distance to Alexanderplatz" },
  locationQuality: {
    label: "Good residential area",
    hint: "Share of 'gut' Wohnlage addresses (Mietspiegel)",
  },
  parks: {
    label: "Parks nearby",
    hint: "OpenStreetMap, within 1 km, per postcode",
  },
  cafes: { label: "Cafés", hint: "OpenStreetMap, within 1 km, per postcode" },
  playgrounds: {
    label: "Playgrounds",
    hint: "OpenStreetMap, within 1 km, per postcode",
  },
  affordability: {
    label: "Affordable rent",
    hint: "Average cold rent per m² (synthetic listings)",
  },
}
export const PRIORITY_KEYS = Object.keys(PRIORITY_META) as PriorityKey[]

/**
 * The four broad choices step 2 shows. Each sets the level of all its ranking factors
 * at once; the factors in none of them stay Flexible unless the text says otherwise.
 */
export const SIMPLE_PRIORITIES = [
  {
    value: "family",
    label: "Family-friendly",
    hint: "Good schools, Kita places and a low crime rate",
    keys: ["schools", "kitas", "safety"],
  },
  {
    value: "green",
    label: "Green spaces",
    hint: "Parks, green space and quiet streets",
    keys: ["green", "noise"],
  },
  {
    value: "transit",
    label: "Close to transit",
    hint: "Nearest U, S, tram or regional stop (VBB)",
    keys: ["transit"],
  },
  {
    value: "affordable",
    label: "Affordable rent",
    hint: "Average cold rent per m² (synthetic listings)",
    keys: ["affordability"],
  },
] as const satisfies readonly {
  value: string
  label: string
  hint: string
  keys: readonly PriorityKey[]
}[]
export type SimplePriority = (typeof SIMPLE_PRIORITIES)[number]
/** Factors in none of the simple priorities: only the text box changes them */
export const EXTRA_KEYS = PRIORITY_KEYS.filter(
  (k) =>
    !SIMPLE_PRIORITIES.some((p) => (p.keys as readonly string[]).includes(k)),
)

export const LEVELS = [
  { value: "protect", label: "Must have", weight: 5 },
  { value: "ok", label: "Flexible", weight: 2 },
  { value: "letgo", label: "Don't need", weight: 0 },
] as const
export type Level = (typeof LEVELS)[number]["value"]
export const levelWeight = (l: Level) =>
  LEVELS.find((x) => x.value === l)!.weight
const levelOfWeight = (w: number): Level | null =>
  LEVELS.find((x) => x.weight === w)?.value ?? null

/** A simple priority's level: the strongest of its factors */
export const groupLevel = (levels: Picks["levels"], p: SimplePriority) =>
  LEVELS.map((l) => l.value).find((l) => p.keys.some((k) => levels[k] === l))!
export const withGroupLevel = (
  levels: Picks["levels"],
  p: SimplePriority,
  l: Level,
) => ({
  ...levels,
  ...Object.fromEntries(p.keys.map((k) => [k, l])),
})
/** Every factor of a simple priority at the group's level, so the switch and the ranking agree */
export const normaliseLevels = (levels: Picks["levels"]) =>
  SIMPLE_PRIORITIES.reduce(
    (acc, p) => withGroupLevel(acc, p, groupLevel(levels, p)),
    levels,
  )

/** Labels of what sits at a level: the simple priorities, then any extra factor the text set */
export function labelsAtLevel(levels: Picks["levels"], l: Level) {
  return [
    ...SIMPLE_PRIORITIES.filter((p) => groupLevel(levels, p) === l).map(
      (p) => p.label,
    ),
    ...EXTRA_KEYS.filter((k) => levels[k] === l).map(
      (k) => PRIORITY_META[k].label,
    ),
  ]
}

export const MUST_HAVES = [
  { value: "kita", label: "A Kita in the area" },
  { value: "kinderarzt", label: "A Kinderarzt (paediatrician) nearby" },
  { value: "playground", label: "A playground nearby" },
  { value: "park", label: "A park nearby" },
] as const
export type MustHave = (typeof MUST_HAVES)[number]["value"]
const MUST_VALUES = MUST_HAVES.map((m) => m.value) as MustHave[]

/** Caps on the synthetic average cold rent (median across areas ≈ €11.90) */
export const RENT_CAPS = [10, 12, 15, 18] as const

export type Picks = {
  levels: Record<PriorityKey, Level>
  hobbies: Hobby[]
  must: MustHave[]
  maxRent: number | null
}

/** Starting point from the household answers, until the person picks something. */
export function householdPicks(s: { kids: number; expecting: boolean }): Picks {
  const levels = Object.fromEntries(
    PRIORITY_KEYS.map((k) => [k, "ok"]),
  ) as Picks["levels"]
  if (s.kids > 0 || s.expecting)
    Object.assign(levels, { schools: "protect", kitas: "protect" })
  return {
    levels: normaliseLevels(levels),
    hobbies: [],
    must: s.expecting ? ["kita"] : [],
    maxRent: null,
  }
}

// ─── State and URL ──────────────────────────────────────────────────────────

export type PlaceKind = (typeof PLACE_KINDS)[number]
export type FinderPlace = { kind: PlaceKind; address: string }
export type FinderState = {
  home: string
  kids: number
  expecting: boolean
  places: FinderPlace[]
  commute: number
  /** null = not touched yet: `householdPicks` applies */
  picks: Picks | null
  /** Free text, only used to fill in `picks` */
  priorities: string
  /** Wishes the ranking can't express ("dog park"): shown as noted, looked up on the web for the results */
  extras: string[]
}
export const effectivePicks = (s: FinderState) => s.picks ?? householdPicks(s)

/** A typical flat for the household: 3 rooms with kids, else 2. Context only, not a filter */
export const typicalRooms = (s: Pick<FinderState, "kids" | "expecting">) =>
  s.kids > 0 || s.expecting ? 3 : 2

type RawParams = URLSearchParams | Record<string, string | string[] | undefined>

const text = (max: number) => z.string().trim().max(max).catch("")
const list = z.array(z.string()).catch([])
const schema = z.object({
  home: text(200),
  kids: z.coerce
    .number()
    .int()
    .refine((n) => KIDS_OPTIONS.includes(n as never))
    .catch(0),
  baby: z.enum(["yes", "no"]).catch("no"),
  place: z
    .array(
      z.string().transform((s): FinderPlace | null => {
        // "Work:Friedrichstraße 100" (the kind never contains a colon)
        const i = s.indexOf(":")
        const kind = s.slice(0, i) as PlaceKind
        const address = s.slice(i + 1).trim()
        return i > 0 && PLACE_KINDS.includes(kind) && address
          ? { kind, address: address.slice(0, 200) }
          : null
      }),
    )
    .catch([]),
  commute: z.coerce
    .number()
    .refine((n) => COMMUTE_OPTIONS.includes(n as never))
    .catch(30),
  // "schools:5,noise:5,heat:0" (keys left out are OK), "ok" = all OK
  w: z.string().max(500).optional().catch(undefined),
  hobby: list,
  must: list,
  rent: z.coerce
    .number()
    .refine((n) => RENT_CAPS.includes(n as never))
    .optional()
    .catch(undefined),
  q: text(1000),
  x: z
    .array(z.string())
    .catch([])
    .transform((xs) => cleanExtras(xs)),
})

/** Up to `MAX_EXTRAS` short, distinct wish labels */
export const MAX_EXTRAS = 3
export function cleanExtras(xs: readonly string[]) {
  const seen = new Set<string>()
  return xs
    .map((x) => x.replace(/\s+/g, " ").trim().slice(0, 40))
    .filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()))
    .slice(0, MAX_EXTRAS)
}

const ARRAY_PARAMS = ["place", "hobby", "must", "x"] as const

function toObject(raw: RawParams) {
  const obj: Record<string, unknown> =
    raw instanceof URLSearchParams ? Object.fromEntries(raw) : { ...raw }
  for (const k of ARRAY_PARAMS) {
    const v = raw instanceof URLSearchParams ? raw.getAll(k) : obj[k]
    // A single ?place= arrives as a string, not an array
    obj[k] = typeof v === "string" ? [v] : (v ?? [])
  }
  return obj
}

function parsePicks(p: z.infer<typeof schema>): Picks | null {
  if (p.w == null && !p.hobby.length && !p.must.length && p.rent == null)
    return null
  const picks = householdPicks({ kids: 0, expecting: false }) // all OK
  for (const part of (p.w ?? "").split(",")) {
    const [k, w] = part.split(":")
    const level = levelOfWeight(Number(w))
    if (k in PRIORITY_META && level) picks.levels[k as PriorityKey] = level
  }
  picks.levels = normaliseLevels(picks.levels)
  picks.hobbies = HOBBIES.filter((h) => p.hobby.includes(h))
  picks.must = MUST_VALUES.filter((m) => p.must.includes(m))
  picks.maxRent = p.rent ?? null
  return picks
}

export function parseFinderParams(raw: RawParams): FinderState {
  const p = schema.parse(toObject(raw))
  return {
    home: p.home,
    kids: p.kids,
    expecting: p.baby === "yes",
    places: p.place.filter((x) => x != null).slice(0, MAX_PLACES),
    commute: p.commute,
    picks: parsePicks(p),
    priorities: p.q,
    extras: p.x,
  }
}

export function finderQuery(s: FinderState, extra?: Record<string, string>) {
  const q = new URLSearchParams()
  if (s.home.trim()) q.set("home", s.home.trim())
  q.set("kids", String(s.kids))
  q.set("baby", s.expecting ? "yes" : "no")
  for (const p of s.places)
    if (p.address.trim()) q.append("place", `${p.kind}:${p.address.trim()}`)
  q.set("commute", String(s.commute))
  if (s.picks) {
    const w = PRIORITY_KEYS.filter((k) => s.picks!.levels[k] !== "ok")
      .map((k) => `${k}:${levelWeight(s.picks!.levels[k])}`)
      .join(",")
    q.set("w", w || "ok")
    for (const h of s.picks.hobbies) q.append("hobby", h)
    for (const m of s.picks.must) q.append("must", m)
    if (s.picks.maxRent != null) q.set("rent", String(s.picks.maxRent))
  }
  if (s.priorities.trim()) q.set("q", s.priorities.trim())
  for (const x of s.extras) q.append("x", x)
  for (const [k, v] of Object.entries(extra ?? {})) q.set(k, v)
  return q.toString()
}
