import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { FinderShell, AsideText } from "@/components/finder/finder-shell"
import { MatchCard } from "@/components/finder/match-card"
import { Button } from "@/components/ui/button"
import { getFinderResults, type FinderResults } from "@/lib/finder"
import { finderQuery, parseFinderParams } from "@/lib/finder-params"

export const metadata: Metadata = {
  title: "Your Kiez matches · Kiez Concierge",
}

function Chips({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null
  return (
    <div className="flex flex-col gap-2">
      <p className="text-subtle text-sm font-medium">{label}</p>
      <ul className="flex flex-wrap gap-2">
        {items.map((t) => (
          <li
            key={t}
            className="bg-card text-heading rounded-full border px-3 py-1 text-sm"
          >
            {t}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Understood({ r, commute }: { r: FinderResults; commute: number }) {
  const places = r.places.filter((p) => p.foundAs)
  const missing = r.places.filter((p) => !p.foundAs)
  return (
    <div className="flex flex-col gap-6">
      <AsideText title="Your suggestions">
        {r.understood.fromHousehold
          ? "Ranked on your household. Edit your answers to set your own priorities."
          : "Ranked on the priorities you picked."}
      </AsideText>
      <Chips label="You want to protect" items={r.understood.protect} />
      <Chips label="You can let go" items={r.understood.letGo} />
      <Chips
        label="Hobbies"
        items={r.understood.hobbies.map((h) => h[0].toUpperCase() + h.slice(1))}
      />
      <Chips label="Must-haves" items={r.understood.mustHaves} />
      {places.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-subtle text-sm font-medium">
            Max {commute} min by public transport to
          </p>
          <ul className="text-heading text-sm">
            {places.map((p) => (
              <li key={p.kind + p.address}>
                <span className="font-medium">{p.kind}:</span> {p.foundAs}
              </li>
            ))}
          </ul>
        </div>
      )}
      {missing.length > 0 && (
        <p className="text-destructive text-sm">
          Couldn&apos;t find {missing.map((p) => `“${p.address}”`).join(", ")}{" "}
          in Berlin, so it is not part of the commute check.
        </p>
      )}
    </div>
  )
}

async function load(s: ReturnType<typeof parseFinderParams>) {
  try {
    return { data: await getFinderResults(s), error: null }
  } catch (err) {
    console.error("getFinderResults failed:", (err as Error).message)
    return { data: null, error: (err as Error).message }
  }
}

export default async function ResultsPage({
  searchParams,
}: PageProps<"/find/results">) {
  await connection() // reads live DB data
  const s = parseFinderParams(await searchParams)
  const { data, error } = await load(s)
  const edit = `/find?${finderQuery(s, { step: "2" })}`

  if (!data)
    return (
      <FinderShell
        aside={<AsideText title="Something went wrong">{error}</AsideText>}
      >
        <p className="text-muted-foreground text-lg">
          We couldn&apos;t rank the neighbourhoods right now. Please try again.
        </p>
        <Button nativeButton={false} render={<Link href={edit} />}>
          Back to my answers
        </Button>
      </FinderShell>
    )

  const fitting = data.results.filter(
    (r) => !r.commutes.some((c) => c.overLimit),
  ).length

  return (
    <FinderShell
      aside={
        <div className="flex flex-col gap-6">
          <Understood r={data} commute={s.commute} />
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={edit} />}
            className="text-heading h-auto self-start rounded-[12px] px-6 py-3 text-base font-bold"
          >
            Edit my answers
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        <h2 className="text-heading text-[28px] leading-[1.1] font-medium">
          Best matches for you
        </h2>
        <p className="text-subtle text-sm font-medium">
          {data.relaxed
            ? `No area fits every commute within ${s.commute} min. These come closest.`
            : `${data.withinCommute} of ${data.candidates} Berlin neighbourhoods fit your commute limit${
                fitting < data.results.length
                  ? `; the live timetable puts ${data.results.length - fitting} of these over it`
                  : ""
              }.`}
        </p>
      </div>
      {data.results.length > 0 ? (
        <ol className="flex flex-col gap-5">
          {data.results.map((r, i) => (
            <MatchCard
              key={r.plrId}
              match={r}
              rank={i + 1}
              weights={data.weightsUsed}
            />
          ))}
        </ol>
      ) : (
        <p className="text-muted-foreground text-lg">
          No neighbourhood matches these filters. Try a longer commute or fewer
          must-haves.
        </p>
      )}
      <p className="text-faint text-xs">
        Match score: percentile ranks across Berlin, weighted by your
        priorities. Rents are synthetic (for comparison only); crime and school
        results are Bezirk-level where no local value exists. Commutes are BVG
        timetable journeys for a weekday 08:00 start, or straight-line estimates
        marked “est.”.
      </p>
    </FinderShell>
  )
}
