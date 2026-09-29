import "server-only"
import { zodTextFormat } from "openai/helpers/zod"
import { z } from "zod"
import { FAST_MODEL, getOpenAI } from "@/lib/ai"
import { env } from "@/lib/env"
import {
  effectivePicks,
  HOBBIES,
  INTERESTS,
  isPoiHobby,
  levelWeight,
  MUST_HAVES,
  PRIORITY_KEYS,
  PRIORITY_META,
  RENT_CAPS,
  type FinderState,
  type Picks,
  type PriorityKey,
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
    outsideRing: p.must.includes("outsideRing") || null,
    maxRentPerM2: p.maxRent,
  }
}

/** Everything the results page shows: the picks in words, plus the matching areas. */
export async function getFinderResults(s: FinderState) {
  const picks = effectivePicks(s)
  const labelsAt = (level: Picks["levels"][PriorityKey]) =>
    PRIORITY_KEYS.filter((k) => picks.levels[k] === level).map(
      (k) => PRIORITY_META[k].label,
    )
  const matches = await findKiezMatches({
    rank: picksToRank(picks),
    places: s.places,
    maxCommuteMin: s.commute,
    limit: 3,
  })
  // A typical flat for the household: 3 rooms with kids, else 2. Context only, not a filter.
  const rooms = s.kids > 0 || s.expecting ? 3 : 2
  const rents = await getTypicalRents(
    matches.results.map((r) => r.plrId),
    rooms,
  )
  return {
    understood: {
      protect: labelsAt("protect"),
      letGo: labelsAt("letgo"),
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
hobbies: the things they like to have nearby (yoga, gym, bouldering, cafés, playgrounds, parks). Pick every one the text implies.
must: only hard requirements they state ("must have a Kita nearby" → kita, "a paediatrician" → kinderarzt,
"a playground close by" → playground, "a park nearby" → park, "outside the Ring" / "not in the city bustle" → outsideRing).
extras: wishes none of the above can express (e.g. "dog park", "sauna"); we can't rank them, but we show them as noted.
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
    levels: s.levels,
    hobbies: s.hobbies,
    must: s.must,
    maxRent: snapRent(s.maxRentPerM2) ?? input.current.maxRent,
  }
  const out = { picks, extras: s.extras.slice(0, 3) }
  if (cache.size >= 200) cache.delete(cache.keys().next().value!)
  cache.set(key, out)
  return out
}
