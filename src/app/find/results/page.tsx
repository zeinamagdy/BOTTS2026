import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { Suspense } from "react"
import { ResultsShell } from "@/components/finder/finder-shell"
import { MatchCard } from "@/components/finder/match-card"
import { RefineBox } from "@/components/finder/refine-box"
import { WebNote, WebNoteLoading } from "@/components/finder/web-note"
import { ResultsMapLazy } from "@/components/finder/results-map-lazy"
import { getFinderResults, type FinderResults } from "@/lib/finder"
import {
  effectivePicks,
  finderQuery,
  parseFinderParams,
  type FinderState,
} from "@/lib/finder-params"
import { defaultMapLayers } from "@/lib/map-layers"
import { getResultsMap } from "@/lib/queries"

export const metadata: Metadata = {
  title: "Your best-fit Kieze · KiezKiss",
}

const NUMBER_WORDS = ["No", "One", "Two", "Three"]

function household(s: FinderState) {
  const kids =
    s.kids === 0
      ? "No children"
      : s.kids === 1
        ? "1 child"
        : `${s.kids} children`
  return s.expecting ? `${kids}, baby on the way` : kids
}

/** The answers as tags (Figma: "1 child, baby on the way", "Max 45 min", priorities). */
function tags(s: FinderState, r: FinderResults) {
  return [
    household(s),
    r.places.some((p) => p.foundAs) && `Max ${s.commute} min`,
    ...r.understood.protect,
    ...r.understood.interestLabels,
    ...r.understood.mustHaves,
    ...s.extras.map((x) => `${x} (from the web)`),
  ].filter(Boolean) as string[]
}

function headline(r: FinderResults) {
  const n = r.results.length
  if (r.relaxed) return "The closest matches we found"
  if (n === 1) return "One area you may not have considered"
  return `${NUMBER_WORDS[n] ?? n} areas you may not have considered`
}

function subline(s: FinderState, r: FinderResults) {
  const areas = r.results
  const ring = areas.every((a) => !a.insideRing)
    ? "All outside the Ring"
    : areas.every((a) => a.insideRing)
      ? "All inside the Ring"
      : "Inside and outside the Ring"
  const who = s.kids > 0 || s.expecting ? "your family goes" : "you go"
  const hasPlaces = r.places.some((p) => p.foundAs)
  if (!hasPlaces) return `${ring}, ranked on what matters to you.`
  if (r.relaxed)
    return `No area gets you everywhere within ${s.commute} min. These come closest.`
  const allFit = areas.every((a) => !a.commutes.some((c) => c.overLimit))
  return allFit
    ? `${ring}, all within ${s.commute} min of the places ${who} every day.`
    : `${ring}. The live timetable puts some journeys over ${s.commute} min (marked red).`
}

async function load(s: FinderState) {
  try {
    const data = await getFinderResults(s)
    // The map is extra: the results still show if it fails
    const map = await getResultsMap(data.results.map((r) => r.plrId)).catch(
      (err: Error) => {
        console.error("getResultsMap failed:", err.message)
        return null
      },
    )
    return { data, map, error: null }
  } catch (err) {
    console.error("getFinderResults failed:", (err as Error).message)
    return { data: null, map: null, error: (err as Error).message }
  }
}

const editLink =
  "text-brand-600 rounded-full px-3 py-2 text-lg font-medium hover:underline"

export default async function ResultsPage({
  searchParams,
}: PageProps<"/find/results">) {
  await connection() // reads live DB data
  const s = parseFinderParams(await searchParams)
  const { data, map, error } = await load(s)
  const edit = `/find?${finderQuery(s, { step: "2" })}`

  if (!data)
    return (
      <ResultsShell>
        <div className="flex flex-col gap-5">
          <h1 className="text-foreground text-4xl leading-[1.1] font-medium sm:text-[52px]">
            Something went wrong
          </h1>
          <p className="text-muted-foreground text-lg">
            We couldn&apos;t rank the neighbourhoods right now. Please try
            again.
          </p>
          <p className="text-faint text-sm">{error}</p>
          <Link href={edit} className={`${editLink} self-start px-0`}>
            Back to my answers
          </Link>
        </div>
      </ResultsShell>
    )

  // One web lookup for all cards (deduplicated by `getWebFindings`)
  const webAreas = JSON.stringify(
    data.results.map((r) => ({
      plrId: r.plrId,
      name: r.plrName,
      district: [r.ortsteil?.replace(/\s*\((Ort|Ortsteil)\)$/, ""), r.bezirk]
        .filter(Boolean)
        .join(", "),
    })),
  )

  // Not shown to the person: the commute check just leaves the place out
  const missing = data.places.filter((p) => !p.foundAs)
  if (missing.length)
    console.warn(
      "Finder: couldn't geocode, left out of the commute check:",
      missing.map((p) => p.address),
    )

  return (
    <ResultsShell>
      <div className="flex flex-col gap-5">
        <div className="flex max-w-[653px] flex-col gap-6">
          <h1 className="text-foreground text-4xl leading-[1.1] font-medium text-balance sm:text-[52px]">
            {headline(data)}
          </h1>
          <p className="text-muted-foreground text-lg leading-normal">
            {subline(s, data)}
          </p>
        </div>
        <ul className="flex flex-wrap items-center gap-3 sm:gap-[18px]">
          {tags(s, data).map((t) => (
            <li
              key={t}
              className="bg-background border-input text-subtle rounded-full border px-3 py-2 text-base font-medium sm:text-lg"
            >
              {t}
            </li>
          ))}
          <li>
            <Link href={edit} className={editLink}>
              Edit tags
            </Link>
          </li>
        </ul>
      </div>

      <RefineBox
        state={s}
        areas={data.results.map((r) => ({ plrId: r.plrId, name: r.plrName }))}
      />

      {data.results.length > 0 ? (
        <ol className="grid gap-3.5 md:grid-cols-2 lg:grid-cols-3">
          {data.results.map((r) => (
            <MatchCard
              key={r.plrId}
              match={r}
              weights={data.weightsUsed}
              hobbies={data.understood.hobbies}
              wanted={data.understood.wanted}
              maxCommute={s.commute}
              flatsHref={`/find/flats?${finderQuery(s, { plr: r.plrId })}`}
              webNote={
                s.extras.length > 0 && (
                  <Suspense fallback={<WebNoteLoading wishes={s.extras} />}>
                    <WebNote
                      plrId={r.plrId}
                      areasJson={webAreas}
                      wishes={s.extras}
                    />
                  </Suspense>
                )
              }
            />
          ))}
        </ol>
      ) : (
        <p className="text-muted-foreground text-lg">
          No neighbourhood matches these filters. Try a longer commute or fewer
          must-haves.
        </p>
      )}

      {map && map.areas.length > 0 && (
        <section id="results-map" className="flex scroll-mt-6 flex-col gap-6">
          <div className="flex flex-col gap-3">
            <h2 className="text-foreground text-[28px] leading-[1.1] font-medium">
              What matters to you, on the map
            </h2>
            <p className="text-muted-foreground text-lg">
              Your priorities are switched on. Tap a tag to add or hide more,
              and a number to switch area. Counts are inside the outlined area.
            </p>
          </div>
          <ResultsMapLazy
            areas={map.areas}
            pois={map.pois}
            initialLayers={defaultMapLayers(effectivePicks(s))}
            hobbies={data.understood.hobbies}
          />
        </section>
      )}

      <p className="text-faint text-xs">
        Map: Kitas from the Berlin Kita register; Kinderarzt, yoga, gyms and
        bouldering from OpenStreetMap; parks, schools, playgrounds, cafés and
        stations from the OpenStreetMap basemap (OpenFreeMap). Areas are Berlin
        Planungsräume, ranked by percentile across the city and weighted by your
        priorities. Rents are synthetic (for comparison only); crime and school
        results are Bezirk-level where no local value exists. Commutes are BVG
        timetable journeys for a weekday 08:00 start, or straight-line estimates
        marked “~”.
      </p>
    </ResultsShell>
  )
}
