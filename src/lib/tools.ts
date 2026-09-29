import "server-only"
import type OpenAI from "openai"
import { zodResponsesFunction } from "openai/helpers/zod"
import { z } from "zod"
import {
  addressInput,
  commuteInput,
  crimeInput,
  kitaInput,
  plrRentalsInput,
  priceTrendInput,
  rankKiezInput,
  rankPlanungsraumInput,
  rentalFilters,
  rentCheckInput,
  saleFilters,
  schoolInput,
} from "@/lib/filters"
import {
  checkRentFairness,
  findKitas,
  getCommute,
  getCrimeByArea,
  getKiezDetail,
  getPlanungsraumDetail,
  getPlanungsraumRentals,
  getPriceTrend,
  listSchools,
  lookupAddress,
  rankKiez,
  rankPlanungsraum,
  searchRentals,
  searchSales,
} from "@/lib/queries"

/**
 * Function tools the assistant can call. Each wraps one query from `queries.ts`.
 * Arguments are re-validated with the same Zod schema before running.
 */
const defs = [
  {
    name: "rank_planungsraeume",
    description:
      "Rank Berlin Planungsräume (542 official planning areas, finer than a PLZ) for a person's priorities: affordability, schools, safety (crime rate), noise, air, green space, heat, kitas per child, transit (full VBB network), location quality, hobbies (yoga, gym, bouldering), closeness to the centre, and parks, cafés and playgrounds (OpenStreetMap, per PLZ). Hard filters: Bezirk, rent, transit distance, distance from Alexanderplatz, outside/inside the Ring, Kita and paediatrician present, matching rental listings. Prefer this over rank_neighbourhoods for 'where should I live' questions.",
    parameters: rankPlanungsraumInput,
    run: async (input: z.infer<typeof rankPlanungsraumInput>) => {
      // the model writes up ~5 areas, so don't feed it 10
      const r = await rankPlanungsraum({ ...input, limit: input.limit ?? 5 })
      return {
        ...r,
        // the map position and photo URL are for the UI, not the model
        results: r.results.map(
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          ({ lat, lon, photo, ...rest }) => rest,
        ),
      }
    },
  },
  {
    name: "get_planungsraum_profile",
    description:
      "Everything known about one Planungsraum by its 8-character plrId (from rank_planungsraeume): environment ratings, kitas, transit, crime rate, population, rent by room count, and the names of its Kitas and yoga/gym/bouldering/paediatrician spots.",
    parameters: z.object({
      plrId: z.string().describe("8-character id, e.g. '01100101'"),
    }),
    run: async ({ plrId }: { plrId: string }) => {
      const d = await getPlanungsraumDetail(plrId)
      if (!d) return null
      const byCategory = Object.groupBy(d.pois, (p) => p.category)
      return {
        plrId: d.plrId,
        plrName: d.plrName,
        ortsteil: d.ortsteil,
        bezirk: d.bezirk,
        dominantPlz: d.dominantPlz,
        insideRing: d.insideRing,
        facts: d.facts,
        rentByRooms: d.rentByRooms,
        // names only, capped, so one profile stays small
        places: Object.fromEntries(
          Object.entries(byCategory).map(([category, list]) => [
            category,
            {
              count: list!.length,
              names: list!
                .map((p) => p.name)
                .filter(Boolean)
                .slice(0, 8),
            },
          ]),
        ),
      }
    },
  },
  {
    name: "get_planungsraum_rentals",
    description:
      "A few example rental listings (synthetic) inside one Planungsraum, for a wanted room count. roomsRelaxed=true means fewer than the requested number had exactly that many rooms.",
    parameters: plrRentalsInput,
    run: getPlanungsraumRentals,
  },
  {
    name: "rank_neighbourhoods",
    description:
      "Rank Berlin postal codes (PLZ) for a person's priorities: affordability, schools, safety, air, kitas, transit (7 lines only), location quality, nature and cafés/playgrounds (OpenStreetMap). Use this when the person talks in PLZ or wants the green/water share; otherwise prefer rank_planungsraeume.",
    parameters: rankKiezInput,
    run: rankKiez,
  },
  {
    name: "get_neighbourhood_profile",
    description:
      "Everything known about one PLZ: Wohnlage mix, prices, rent by room count, kitas, Abitur tier, air, crime, nearest stations, top schools in the district.",
    parameters: z.object({ plz: z.number().int() }),
    run: ({ plz }: { plz: number }) => getKiezDetail(plz),
  },
  {
    name: "search_rentals",
    description:
      "Search rental listings (synthetic, 2020–2026) with filters. Returns match count, median warm rent and the top listings.",
    parameters: rentalFilters,
    run: searchRentals,
  },
  {
    name: "search_properties_for_sale",
    description:
      "Search apartments for sale: resale (synthetic, 50k) or new builds (synthetic, 10k units in 177 projects).",
    parameters: saleFilters,
    run: searchSales,
  },
  {
    name: "lookup_address",
    description:
      "Look up a Berlin address in the official Mietspiegel 2026 Wohnlage register (einfach/mittel/gut, real data) plus its neighbourhood summary.",
    parameters: addressInput,
    run: ({ street, houseNumber }: z.infer<typeof addressInput>) =>
      lookupAddress(street, houseNumber),
  },
  {
    name: "check_rent_fairness",
    description:
      "Compare a rent (cold rent + size) to similar listings in the same PLZ and Wohnlage. Give an address or a PLZ.",
    parameters: rentCheckInput,
    run: checkRentFairness,
  },
  {
    name: "get_price_trend",
    description:
      "Rent and purchase price trend 2020–2026 for an Ortsteil, a Bezirk, or all of Berlin (synthetic index).",
    parameters: priceTrendInput,
    run: getPriceTrend,
  },
  {
    name: "find_kitas",
    description:
      "Find Kitas (daycare, real data) in a PLZ or near a point, with capacity and pedagogy.",
    parameters: kitaInput,
    run: findKitas,
  },
  {
    name: "list_schools",
    description:
      "Schools with 2025 Abitur results (Oberstufe only, no Grundschulen), best first by performance vs peer schools of the same type. Many schools have no published name or PLZ: refer to them by type, Bezirk and BSN.",
    parameters: schoolInput,
    run: listSchools,
  },
  {
    name: "get_crime_by_area",
    description:
      "2019 reported crime totals per Bezirksregion (real but dated), lowest first. Absolute counts, not per capita.",
    parameters: crimeInput,
    run: getCrimeByArea,
  },
  {
    name: "get_commute",
    description:
      "Public transport travel time (BVG timetable, next weekday morning) from up to 10 candidate PLZs to where the person works or studies. Results flagged estimated=true are straight-line estimates because the live API was down: say so.",
    parameters: commuteInput,
    run: getCommute,
  },
] as const

/** OpenAI's hosted web search. OpenAI runs it, so runTool never sees it. */
const webSearch: OpenAI.Responses.WebSearchTool = {
  type: "web_search",
  search_context_size: "medium",
  user_location: { type: "approximate", country: "DE", city: "Berlin" },
}

export const tools: OpenAI.Responses.Tool[] = [
  ...defs.map((d) =>
    zodResponsesFunction({
      name: d.name,
      description: d.description,
      parameters: d.parameters,
    }),
  ),
  webSearch,
]

/** Runs a tool call and returns its JSON output (errors are returned to the model, not thrown). */
export async function runTool(
  name: string,
  rawArgs: string,
): Promise<{ output: string; ok: boolean; summary: string }> {
  const fail = (error: string) => ({
    output: JSON.stringify({ error }),
    ok: false,
    summary: error.split("\n")[0],
  })
  const def = defs.find((d) => d.name === name)
  if (!def) return fail(`Unknown tool ${name}`)
  let json: unknown
  try {
    json = JSON.parse(rawArgs)
  } catch {
    return fail("Arguments are not valid JSON")
  }
  const parsed = def.parameters.safeParse(json)
  if (!parsed.success) return fail(z.prettifyError(parsed.error))
  try {
    const result = await (def.run as (args: unknown) => Promise<unknown>)(
      parsed.data,
    )
    if (result == null) return fail("Not found")
    if (typeof result === "object" && "error" in result)
      return { ...fail(String(result.error)), output: JSON.stringify(result) }
    return {
      output: JSON.stringify(result),
      ok: true,
      summary: summarize(result),
    }
  } catch (err) {
    console.error(`[tool ${name}]`, err)
    return fail("Query failed")
  }
}

/** One-line description of a tool result, shown in the chat UI. */
function summarize(result: unknown): string {
  if (Array.isArray(result)) return `${result.length} rows`
  const r = result as Record<string, unknown>
  const n = new Intl.NumberFormat("en")
  if (Array.isArray(r.results) && typeof r.to === "string") {
    const rs = r.results as { minutes: number; estimated: boolean }[]
    const est = rs.some((x) => x.estimated) ? " (estimated)" : ""
    return rs.length
      ? `${rs[0].minutes}–${rs.at(-1)!.minutes} min to ${r.to}${est}`
      : "No results"
  }
  if (typeof r.roomsRelaxed === "boolean")
    return `${(r.results as unknown[]).length} example listings${r.roomsRelaxed ? " (room count relaxed)" : ""}`
  if (typeof r.candidates === "number")
    return `${n.format(r.candidates)} areas scored`
  if (typeof r.verdict === "string") return r.verdict
  if (r.found === "address") return "Address found"
  if (r.found === "street") return "Street found"
  if (r.found === "none") return "No match, suggested spellings"
  if (typeof r.total === "number") return `${n.format(r.total)} matches`
  if (Array.isArray(r.series)) return `${r.series.length} periods`
  if (typeof r.plz === "number") return `PLZ ${r.plz}`
  if (typeof r.plrId === "string") return `Planungsraum ${r.plrName}`
  return "Done"
}
