import "server-only"
import { zodTextFormat } from "openai/helpers/zod"
import { z } from "zod"
import { FAST_MODEL, getOpenAI } from "@/lib/ai"
import { env } from "@/lib/env"
import {
  DOCUMENTS,
  MAX_AREA_M2,
  MIN_AREA_M2,
  PROPERTY_TYPES,
  ROOM_OPTIONS,
  type DocumentKey,
  type PropertyType,
} from "@/lib/landlord"

// ─── "Fill in from my text" (landlord step 1) ───────────────────────────────

const docKey = z.enum(DOCUMENTS.map((d) => d.key) as [DocumentKey])
const propertyType = z.enum(
  PROPERTY_TYPES.map((t) => t.value) as [PropertyType],
)

const suggestion = z.object({
  address: z
    .string()
    .nullable()
    .describe(
      "The flat's Berlin address as 'Street 12, PLZ Berlin' when the text names one, else null",
    ),
  type: propertyType.describe("flat or house"),
  areaM2: z.number().nullable().describe("Living space in m², else null"),
  warmRent: z
    .number()
    .nullable()
    .describe("Monthly warm rent (incl. service charges) in €, else null"),
  coldRent: z
    .number()
    .nullable()
    .describe(
      "Monthly cold rent (Kaltmiete / Nettokaltmiete) in €, only if they name the cold rent, else null",
    ),
  rooms: z.number().nullable().describe("Number of rooms, else null"),
  docs: z
    .array(docKey)
    .describe(DOCUMENTS.map((d) => `${d.key} = ${d.label}`).join("; ")),
  nonSmoking: z
    .boolean()
    .describe("Only non-smoking households (Nichtraucher) are accepted"),
  extras: z
    .array(z.string())
    .describe(
      "Up to 3 short labels (1-4 words) for other tenant wishes none of the fields cover, e.g. 'No pets', 'Quiet household'. Empty if none.",
    ),
})

const INSTRUCTIONS = `You turn a Berlin landlord's own words about the flat they are letting into the fields of a letting form.
You get the current fields. Return the full set, changing only what the text talks about; fields it doesn't mention keep their current value.
address: only a street address in Berlin they give; add the PLZ only if they state it.
Rent: "warm", "Warmmiete", "all-in", "incl. Nebenkosten" → warmRent; "cold", "kalt", "Kaltmiete", "net" → coldRent (then keep warmRent at its current value).
A bare rent without either word is the warm rent. Convert "1.2k" → 1200.
rooms: German counting, the kitchen and bathroom don't count ("3-Zimmer-Wohnung" → 3; "2 bedrooms and a living room" → 3).
docs: return the current documents plus what the text asks for, minus what it rules out ("Schufa" → schufa, "payslips / Gehaltsnachweise" → payslips,
"ID / Ausweis" → id, "work contract / Arbeitsvertrag" → contract, "Mietschuldenfreiheit / no rent arrears / landlord reference" → rentDebt).
nonSmoking: true when they want non-smokers ("Nichtraucher", "no smoking"), false when they allow smoking, else the current value.
extras: other tenant wishes we can't set as a field. Never include requirements about origin, religion, nationality, gender, age, family status, disability or names:
those are protected characteristics; leave them out entirely.`

export const suggestFlatInput = z.object({
  text: z.string().trim().min(1).max(1000),
  current: z.object({
    address: z.string().max(200),
    type: propertyType,
    areaM2: z.number().min(0).max(MAX_AREA_M2),
    warmRent: z.number().min(0).max(100_000),
    rooms: z.number().int().min(0).max(ROOM_OPTIONS.at(-1)!),
    docs: z.array(docKey),
    nonSmoking: z.boolean(),
  }),
})
export type FlatSuggestion = {
  address: string
  type: PropertyType
  areaM2: number
  warmRent: number
  /** When they named the cold rent: the client adds the PLZ's service charge */
  coldRent: number | null
  rooms: number
  docs: DocumentKey[]
  nonSmoking: boolean
  extras: string[]
}

const cache = new Map<string, FlatSuggestion>()

export async function suggestFlatSettings(
  input: z.infer<typeof suggestFlatInput>,
): Promise<FlatSuggestion> {
  if (!env.OPENAI_API_KEY) throw new Error("The AI is not configured")
  const key = JSON.stringify(input)
  const hit = cache.get(key)
  if (hit) return hit
  const { current } = input
  const res = await getOpenAI().responses.parse({
    model: FAST_MODEL,
    instructions: INSTRUCTIONS,
    input: [
      `Current fields: ${JSON.stringify(current)} (empty string or 0 = not filled in yet)`,
      `In their words: """${input.text}"""`,
    ].join("\n"),
    text: { format: zodTextFormat(suggestion, "flat") },
  })
  const s = res.output_parsed
  if (!s) throw new Error("The AI gave no answer")
  // The model can return anything numeric: keep what the form accepts, else the current value
  const within = (
    v: number | null,
    min: number,
    max: number,
    fallback: number,
  ) => (v != null && v >= min && v <= max ? Math.round(v) : fallback)
  const address = s.address?.trim().slice(0, 200)
  const out: FlatSuggestion = {
    address: address && address.length >= 3 ? address : current.address,
    type: s.type,
    areaM2: within(s.areaM2, MIN_AREA_M2, MAX_AREA_M2, current.areaM2),
    warmRent: within(s.warmRent, 1, 100_000, current.warmRent),
    coldRent:
      s.coldRent != null && s.coldRent > 0 ? Math.round(s.coldRent) : null,
    rooms: within(s.rooms, 1, ROOM_OPTIONS.at(-1)!, current.rooms),
    docs: DOCUMENTS.map((d) => d.key).filter((k) => s.docs.includes(k)),
    nonSmoking: s.nonSmoking,
    extras: s.extras.slice(0, 3),
  }
  if (cache.size >= 200) cache.delete(cache.keys().next().value!)
  cache.set(key, out)
  return out
}
