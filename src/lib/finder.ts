import "server-only"
import { zodTextFormat } from "openai/helpers/zod"
import { z } from "zod"
import { FAST_MODEL, getOpenAI } from "@/lib/ai"
import { env } from "@/lib/env"
import {
  cleanExtras,
  effectivePicks,
  HOBBIES,
  INTERESTS,
  LEVELS,
  isPoiHobby,
  labelsAtLevel,
  levelWeight,
  normaliseLevels,
  MUST_HAVES,
  PRIORITY_KEYS,
  PRIORITY_META,
  RENT_CAPS,
  EXTRA_KEYS,
  SIMPLE_PRIORITIES,
  groupLevel,
  type FinderState,
  type Picks,
  type PriorityKey,
  typicalRooms,
} from "@/lib/finder-params"
import { findKiezMatches, getTypicalRents } from "@/lib/queries"

/** The person's picks as `rankPlanungsraum` input. Deterministic: no model involved. */
function picksToRank(p: Picks) {
  const weights: Record<string, number> = Object.fromEntries(
    PRIORITY_KEYS.map((k) => [k, levelWeight(p.levels[k])]),
  )
  // Cafés, playgrounds and parks are ranking factors of their own: ticking one makes it a Must have
  for (const h of p.hobbies)
    if (!isPoiHobby(h)) weights[h] = Math.max(weights[h], 5)
  const poi = p.hobbies.filter(isPoiHobby)
  if (poi.length) weights.hobbies = 4
  return {
    weights,
    hobbies: poi.length ? poi : null,
    requireKita: p.must.includes("kita") || null,
    requireKinderarzt: p.must.includes("kinderarzt") || null,
    requirePlayground: p.must.includes("playground") || null,
    requirePark: p.must.includes("park") || null,
    // Always: the finder only suggests areas outside the S-Bahn Ring
    outsideRing: true,
    maxRentPerM2: p.maxRent,
  }
}

/** Everything the results page shows: the picks in words, plus the matching areas. */
export async function getFinderResults(s: FinderState) {
  const picks = effectivePicks(s)
  const matches = await findKiezMatches({
    rank: picksToRank(picks),
    places: s.places,
    maxCommuteMin: s.commute,
    limit: 3,
  })
  const rooms = typicalRooms(s)
  const rents = await getTypicalRents(
    matches.results.map((r) => r.plrId),
    rooms,
  )
  return {
    understood: {
      protect: labelsAtLevel(picks.levels, "protect"),
      letGo: labelsAtLevel(picks.levels, "letgo"),
      mustHaves: [
        ...MUST_HAVES.filter((m) => picks.must.includes(m.value)).map(
          (m) => m.label,
        ),
        ...(picks.maxRent != null
          ? [`Max €${picks.maxRent}/m² cold (synthetic)`]
          : []),
      ],
      /** Only the OSM hobby points: what the card's hobby phrases can check */
      hobbies: picks.hobbies.filter(isPoiHobby),
      /** Everything ticked under "nearby" and the must-haves, for the card's icon order */
      wanted: [...picks.hobbies, ...picks.must],
      interestLabels: INTERESTS.filter((i) =>
        picks.hobbies.includes(i.value),
      ).map((i) => i.label),
      fromHousehold: s.picks == null,
    },
    ...matches,
    results: matches.results.map((r) => ({
      ...r,
      typicalRent: rents.get(r.plrId) ?? null,
    })),
  }
}
export type FinderResults = Awaited<ReturnType<typeof getFinderResults>>

// ─── "Fill in from my text" ─────────────────────────────────────────────────

const level = z.enum(["protect", "ok", "letgo"])
const levels = z.object(
  Object.fromEntries(
    PRIORITY_KEYS.map((k) => [
      k,
      level.describe(`${PRIORITY_META[k].label}: ${PRIORITY_META[k].hint}`),
    ]),
  ) as Record<PriorityKey, typeof level>,
)
const suggestion = z.object({
  levels,
  hobbies: z.array(z.enum(HOBBIES)),
  must: z.array(z.enum(MUST_HAVES.map((m) => m.value))),
  maxRentPerM2: z
    .number()
    .nullable()
    .describe("Only when they name a cold rent per m² cap, else null"),
  extras: z
    .array(z.string())
    .describe(
      "Up to 3 short labels (1-3 words) for things they want nearby that none of the hobbies or must-haves cover, e.g. 'Dog park'. Empty if none.",
    ),
})

const INSTRUCTIONS = `You turn a Berlin flat-hunter's own words into settings for a neighbourhood ranking.
You get their current settings. Return the full set, changing only what the text talks about:
"protect" = Must have (they said it matters), "letgo" = Don't need (they said they can give it up or don't want it:
"not central" → nearCenter letgo), "ok" = Flexible (neither). Keys the text doesn't mention keep their current value.
Return the current hobbies and must-haves plus what the text adds, minus what it rules out.
Nature, hiking, cycling, forests, parks, lakes or other outdoor activities mean green space matters: set green to "protect".
hobbies: the things they like to have nearby (yoga, gym, bouldering, cafés, playgrounds, parks). Pick every one the text implies.
must: only hard requirements they state ("must have a Kita nearby" → kita, "a paediatrician" → kinderarzt,
"a playground close by" → playground, "a park nearby" → park). Liking nature or the outdoors is not a hard requirement.
extras: wishes none of the above can express (e.g. "dog park", "sauna"); we can't rank them, but we show them as noted.
Never list what green space already covers (nature, forest, hiking, cycling, outdoors) as extras.
Set maxRentPerM2 only if they name a cold rent per m² cap. Commutes are handled elsewhere: ignore them.`

// The model is not deterministic: the same text gives the same suggestion (per server instance)
const snapRent = (v: number | null) =>
  v == null
    ? null
    : RENT_CAPS.reduce((best, c) =>
        Math.abs(c - v) < Math.abs(best - v) ? c : best,
      )

const cache = new Map<string, { picks: Picks; extras: string[] }>()

export const suggestInput = z.object({
  text: z.string().trim().min(1).max(1000),
  kids: z.number().int().min(0).max(3),
  expecting: z.boolean(),
  placeKinds: z.array(z.string().max(20)).max(3),
  current: z.object({
    levels,
    hobbies: z.array(z.enum(HOBBIES)),
    must: z.array(z.enum(MUST_HAVES.map((m) => m.value))),
    maxRent: z.number().nullable(),
  }),
})

export async function suggestPicks(
  input: z.infer<typeof suggestInput>,
): Promise<{ picks: Picks; extras: string[] }> {
  if (!env.OPENAI_API_KEY) throw new Error("The AI is not configured")
  const key = JSON.stringify(input)
  const hit = cache.get(key)
  if (hit) return hit
  const res = await getOpenAI().responses.parse({
    model: FAST_MODEL,
    instructions: INSTRUCTIONS,
    input: [
      `Children: ${input.kids}. Expecting a baby: ${input.expecting ? "yes" : "no"}.`,
      `Regular places: ${input.placeKinds.join(", ") || "none"}.`,
      `Current settings: ${JSON.stringify(input.current)}`,
      `In their words: """${input.text}"""`,
    ].join("\n"),
    text: { format: zodTextFormat(suggestion, "priorities") },
  })
  const s = res.output_parsed
  if (!s) throw new Error("The AI gave no answer")
  const picks: Picks = {
    levels: normaliseLevels(s.levels),
    hobbies: s.hobbies,
    must: s.must,
    maxRent: snapRent(s.maxRentPerM2) ?? input.current.maxRent,
  }
  const out = { picks, extras: s.extras.slice(0, 3) }
  if (cache.size >= 200) cache.delete(cache.keys().next().value!)
  cache.set(key, out)
  return out
}

// ─── "Refine" on the results page ───────────────────────────────────────────

type Level = Picks["levels"][PriorityKey]
const levelLabel = (l: Level) => LEVELS.find((x) => x.value === l)!.label
const interestLabel = (h: string) =>
  INTERESTS.find((i) => i.value === h)?.label ?? h
const mustLabel = (m: string) =>
  MUST_HAVES.find((x) => x.value === m)?.label ?? m

/** What the refine changed, in words ("Affordable rent: Flexible → Must have") */
export function describeChanges(
  before: Picks,
  after: Picks,
  extrasBefore: readonly string[],
  extrasAfter: readonly string[],
) {
  const out: string[] = []
  const change = (label: string, a: Level, b: Level) =>
    a !== b && out.push(`${label}: ${levelLabel(a)} → ${levelLabel(b)}`)
  for (const p of SIMPLE_PRIORITIES)
    change(p.label, groupLevel(before.levels, p), groupLevel(after.levels, p))
  for (const k of EXTRA_KEYS)
    change(PRIORITY_META[k].label, before.levels[k], after.levels[k])
  const added = <T>(a: readonly T[], b: readonly T[]) =>
    b.filter((x) => !a.includes(x))
  for (const h of added(before.hobbies, after.hobbies))
    out.push(`Nearby: ${interestLabel(h)} added`)
  for (const h of added(after.hobbies, before.hobbies))
    out.push(`Nearby: ${interestLabel(h)} removed`)
  for (const m of added(before.must, after.must))
    out.push(`Must have: ${mustLabel(m)}`)
  for (const m of added(after.must, before.must))
    out.push(`No longer required: ${mustLabel(m)}`)
  if (before.maxRent !== after.maxRent)
    out.push(
      after.maxRent == null
        ? "Rent cap removed"
        : `Rent cap: max €${after.maxRent}/m² cold`,
    )
  const lower = extrasBefore.map((x) => x.toLowerCase())
  for (const x of extrasAfter.filter((x) => !lower.includes(x.toLowerCase())))
    out.push(`Looked up on the web: ${x}`)
  return out
}

export const refineInput = suggestInput.extend({
  extras: z.array(z.string().max(40)).max(10),
})

/**
 * The results page's "Refine": the same text-to-picks step as the wizard, applied
 * to the current picks. The model only changes the inputs; the ranking that
 * follows is the usual deterministic one. New wishes it can't rank join the
 * noted extras (newest kept first).
 */
export async function refinePicks(input: z.infer<typeof refineInput>) {
  const { extras: before, ...rest } = input
  const { picks, extras } = await suggestPicks(rest)
  const merged = cleanExtras([...extras, ...before])
  return {
    picks,
    extras: merged,
    changes: describeChanges(
      { ...input.current, maxRent: input.current.maxRent },
      picks,
      before,
      merged,
    ),
  }
}
