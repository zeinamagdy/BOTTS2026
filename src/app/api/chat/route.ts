import OpenAI from "openai"
import { z } from "zod"
import { getOpenAI, MODEL } from "@/lib/ai"
import { env } from "@/lib/env"
import { encodeEvent, type ChatEvent } from "@/lib/chat-events"
import { runTool, tools } from "@/lib/tools"

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      }),
    )
    .min(1)
    .max(50),
})

const MAX_TOOL_ROUNDS = 6

// Stable prefix so OpenAI's automatic prompt caching kicks in.
const SYSTEM_PROMPT = `You are KiezKiss, a Berlin neighbourhood and housing advisor for people looking for a home.
Always answer from the tools, which query our database. Never invent numbers. If the data doesn't cover something, say so.
For "where should I live" questions, start with rank_planungsraeume (542 finer planning areas); use rank_neighbourhoods (PLZ) when the person talks in PLZ or wants green/water share. rank_planungsraeume's parks, cafes and playgrounds factors are the PLZ counts, so every area of the same PLZ shares them. When recommending areas, name the Planungsraum (plrName) with its Ortsteil and Bezirk, or the PLZ and its Ortsteil, and explain the trade-offs behind the ranking.

Data caveats you must respect:
- Rental, sale, new-build listings and the price trend are SYNTHETIC. Use them for relative comparison. Their € levels run ~25–40% below the real market. Say "synthetic" when quoting them.
- buyPricePerM2Real2023 comes from real listings (April 2023).
- Wohnlage (einfach/mittel/gut) is the real, official Mietspiegel 2026 classification per address.
- Crime is per Bezirk (every PLZ in a Bezirk shares it), 2017–2019, and absolute counts, not per capita. Present it as directional only.
- Abitur (school) data is 2025 and covers only schools with an Oberstufe, not Grundschulen. Tiers are per Bezirk. Lower mean grade = better. Prefer tierVsPeer.
- Air quality is from the nearest of 15 stations, February 2026 only.
- The PLZ tools and the rental/sale search cover only U1, U2, U7, U8, S1, Stadtbahn and S Ringbahn (135 stations). If someone asks about another line (e.g. U6, U9, S41) there, say it isn't in the data and offer the nearest alternative. The Planungsraum tools use the full VBB network (U, S, tram, bus hubs, regional trains, some just over the Brandenburg border): nearestStation is the closest one, straight-line km.
- Planungsraum ratings for noise, air pollution, green supply and heat come from the official Umweltatlas 2023/24 as categories (gering/mittel/hoch, green: gut/mittel/schlecht). They are ordinal, so many areas tie: don't over-read small score gaps.
- Planungsraum population and children under 6 are estimates split down from PLZ figures (unknown year). kitaPlacesPer100Under6 compares Kita places inside the area with children living there, and children often use Kitas in the next area: directional only. crimePer10kBezirk is per capita but still per Bezirk, 2017–2019.
- Hobby availability (yoga, gym, bouldering) and paediatricians come from OpenStreetMap, so incomplete mapping means a zero can be a gap. The hobbies and requireKinderarzt filters use the dominant PLZ (the *InPlz facts); the plain counts (kinderarzt, gyms, …) are inside the area itself. If an area passed requireKinderarzt but its own kinderarzt is 0, say the paediatrician is in the same PLZ, not in the area. buyPricePerM2Real2023 in a Planungsraum is inherited from its main PLZ. Abitur is the area's own schools only where it has any (else its Bezirk).
- check_rent_fairness is a market comparison, not a legal Mietspiegel calculation. Don't give legal advice.
- Green/water share, parks, cafés and playgrounds (within 1 km of the PLZ centre) come from OpenStreetMap. They are good for comparing areas; small green spaces may be missing.
- "Outside the Ring" means outside the S-Bahn Ring (rank_neighbourhoods outsideRing=true). The data covers Berlin only, not Brandenburg.
- get_commute uses the live BVG timetable. If results say estimated=true, the API was down and the minutes are a rough straight-line estimate: say so.

Web search: use it only for what the database can't answer, such as recommended flat size per household (e.g. WBS Wohnflächengrenzen), Brandenburg towns near Berlin, or current rules and programmes. Prefer official sources (berlin.de, brandenburg.de, IBB, BVG). Cite the source inline as a markdown link and say the information comes from the web, not from our data. Never use the web to replace numbers our tools provide.

Be concise. Use markdown: short lists, a small table when comparing areas, bold key numbers.`

// Multi-tool answers stream for a while; don't let the platform cut them off.
export const maxDuration = 60

export async function POST(req: Request) {
  if (!env.OPENAI_API_KEY) {
    return new Response("OPENAI_API_KEY is not set in .env.local", {
      status: 500,
    })
  }

  const parsed = bodySchema.safeParse(await req.json())
  if (!parsed.success) {
    return Response.json(
      { error: z.treeifyError(parsed.error) },
      { status: 400 },
    )
  }

  const openai = getOpenAI()
  const abort = new AbortController()
  const encoder = new TextEncoder()

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ChatEvent) =>
        controller.enqueue(encoder.encode(encodeEvent(e)))
      const write = (delta: string) => send({ type: "text", delta })
      let input: OpenAI.Responses.ResponseInput = parsed.data.messages
      let previousResponseId: string | undefined
      try {
        // Tool loop: stream text as it arrives; when the model calls tools, run
        // them and continue from the previous response with their outputs.
        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          const stream = await openai.responses.create(
            {
              model: MODEL,
              instructions: SYSTEM_PROMPT,
              input,
              tools: round < MAX_TOOL_ROUNDS ? tools : undefined,
              previous_response_id: previousResponseId,
              reasoning: { effort: "low" },
              include: ["web_search_call.action.sources"],
              max_output_tokens: 16000,
              stream: true,
            },
            { signal: abort.signal },
          )
          const calls: OpenAI.Responses.ResponseFunctionToolCall[] = []
          const searchStarted = new Map<string, number>()
          let refused = false
          for await (const event of stream) {
            if (event.type === "response.output_text.delta") {
              write(event.delta)
            } else if (
              event.type === "response.output_item.added" &&
              event.item.type === "web_search_call"
            ) {
              searchStarted.set(event.item.id, Date.now())
            } else if (
              event.type === "response.output_item.done" &&
              event.item.type === "web_search_call"
            ) {
              // Hosted tool: OpenAI already ran it, we only surface it in the UI
              const { id, action, status } = event.item
              const query =
                action?.type === "search"
                  ? (action.queries?.join(" · ") ?? action.query ?? "")
                  : action?.type === "open_page"
                    ? (action.url ?? "")
                    : (action?.pattern ?? "")
              const sources =
                action?.type === "search"
                  ? (action.sources?.map((s) => s.url) ?? [])
                  : []
              send({
                type: "tool_call",
                id,
                name: "web_search",
                args: { query, sources },
              })
              send({
                type: "tool_result",
                id,
                ok: status === "completed",
                summary:
                  action?.type === "search"
                    ? `${sources.length} sources`
                    : action?.type === "open_page"
                      ? "Opened page"
                      : "Searched page",
                ms: Date.now() - (searchStarted.get(id) ?? Date.now()),
              })
            } else if (
              event.type === "response.output_item.done" &&
              event.item.type === "function_call"
            ) {
              calls.push(event.item)
              send({
                type: "tool_call",
                id: event.item.call_id,
                name: event.item.name,
                args: safeJson(event.item.arguments),
              })
            } else if (event.type === "response.completed") {
              previousResponseId = event.response.id
            } else if (event.type === "response.refusal.delta") {
              refused = true
            } else if (event.type === "error") {
              write(`\n\n⚠️ ${event.message}`)
            } else if (event.type === "response.failed") {
              write(
                `\n\n⚠️ ${event.response.error?.message ?? "Response failed"}`,
              )
            }
          }
          if (refused) write("\n\n_Sorry, I can't help with that request._")
          if (!calls.length || !previousResponseId) break

          input = await Promise.all(
            calls.map(async (c) => {
              const t0 = Date.now()
              const { output, ok, summary } = await runTool(c.name, c.arguments)
              send({
                type: "tool_result",
                id: c.call_id,
                ok,
                summary,
                ms: Date.now() - t0,
              })
              return {
                type: "function_call_output" as const,
                call_id: c.call_id,
                output,
              }
            }),
          )
        }
      } catch (err) {
        const msg =
          err instanceof OpenAI.APIError
            ? `API error ${err.status}: ${err.message}`
            : "Unexpected error"
        if (!abort.signal.aborted) write(`\n\n⚠️ ${msg}`)
      } finally {
        controller.close()
      }
    },
    cancel() {
      abort.abort()
    },
  })

  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  })
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}
