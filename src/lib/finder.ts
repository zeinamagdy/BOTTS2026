import "server-only"
import { zodTextFormat } from "openai/helpers/zod"
import { z } from "zod"
import { FAST_MODEL, getOpenAI } from "@/lib/ai"
import { env } from "@/lib/env"
import {
  effectivePicks,
  HOBBIES,
  levelWeight,
  MUST_HAVES,
  PRIORITY_KEYS,
  PRIORITY_META,
  RENT_CAPS,
  type FinderState,
  type Picks,
  type PriorityKey,
} from "@/lib/finder-params"
import { findKiezMatches } from "@/lib/queries"

/** The person's picks as `rankPlanungsraum` input. Deterministic: no model involved. */
function picksToRank(p: Picks) {
  const weights: Record<string, number> = Object.fromEntries(
    PRIORITY_KEYS.map((k) => [k, levelWeight(p.levels[k])]),
  )
  if (p.hobbies.length) weights.hobbies = 4
  return {
    weights,
    hobbies: p.hobbies.length ? p.hobbies : null,
    requireKita: p.must.includes("kita") || null,
    requireKinderarzt: p.must.includes("kinderarzt") || null,
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
      hobbies: picks.hobbies,
      fromHousehold: s.picks == null,
    },
    ...matches,
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
})

const INSTRUCTIONS = `You turn a Berlin flat-hunter's own words into settings for a neighbourhood ranking.
You get their current settings. Return the full set, changing only what the text talks about:
"protect" (they said it matters), "letgo" (they said they can give it up or don't want it:
"not central" → nearCenter letgo), "ok" (neither). Keys the text doesn't mention keep their current value.
Return the current hobbies, must-haves and rent cap plus what the text adds, minus what it rules out.
hobbies: only yoga, gym, bouldering exist. must: only hard requirements they state
("must have a Kita nearby" → kita, "a paediatrician" → kinderarzt, "outside the Ring" / "not in the city bustle" → outsideRing).
Commutes are handled elsewhere: ignore them.`

// The model is not deterministic: the same text gives the same suggestion (per server instance)
const cache = new Map<string, Picks>()

const snapRent = (v: number | null) =>
  v == null
    ? null
    : RENT_CAPS.reduce((best, c) =>
        Math.abs(c - v) < Math.abs(best - v) ? c : best,
      )

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
): Promise<Picks> {
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
    maxRent: snapRent(s.maxRentPerM2),
  }
  if (cache.size >= 200) cache.delete(cache.keys().next().value!)
  cache.set(key, picks)
  return picks
}
