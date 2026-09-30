import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { ArrowLeftIcon } from "lucide-react"
import { ResultsShell } from "@/components/finder/finder-shell"
import {
  finderQuery,
  parseFinderParams,
  typicalRooms,
} from "@/lib/finder-params"
import { cleanOrtsteil, listingLines } from "@/lib/listing-labels"
import { getPlanungsraumName, getPlanungsraumRentals } from "@/lib/queries"

export const metadata: Metadata = { title: "Flats in this area · KiezKiss" }

const eur = (n: number) => `€${Math.round(n).toLocaleString("en")}`

/** Placeholder flat photos in public/flats (Unsplash) */
const FLAT_PHOTOS = Array.from(
  { length: 10 },
  (_, i) => `/flats/flat-${String(i + 1).padStart(2, "0")}.jpg`,
)

/** A random order of the placeholder photos, so each card gets a different one */
function shuffledFlatPhotos() {
  const photos = [...FLAT_PHOTOS]
  for (let i = photos.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[photos[i], photos[j]] = [photos[j], photos[i]]
  }
  return photos
}

/** From a result card: example flats in one area, each with "Apply" */
export default async function FlatsPage({
  searchParams,
}: PageProps<"/find/flats">) {
  await connection()
  const params = await searchParams
  const plr = typeof params.plr === "string" ? params.plr : ""
  if (!/^\d{8}$/.test(plr)) notFound()
  const s = parseFinderParams(params)
  const rooms = typicalRooms(s)
  const [name, { results, roomsRelaxed }] = await Promise.all([
    getPlanungsraumName(plr),
    getPlanungsraumRentals({ plrId: plr, rooms, limit: 6 }),
  ])
  if (!name) notFound()
  const query = finderQuery(s)
  const photos = shuffledFlatPhotos()

  return (
    <ResultsShell>
      <div className="flex flex-col gap-5">
        <Link
          href={`/find/results?${query}`}
          className="text-muted-foreground hover:text-heading flex items-center gap-1.5 self-start text-sm font-medium"
        >
          <ArrowLeftIcon aria-hidden className="size-4" />
          Back to your areas
        </Link>
        <h1 className="text-foreground text-4xl leading-[1.1] font-medium sm:text-[52px]">
          Flats in {name}
        </h1>
        <p className="text-muted-foreground max-w-[653px] text-lg leading-normal">
          {roomsRelaxed
            ? `Not enough ${rooms}-room flats here, so the closest sizes fill in.`
            : `${rooms}-room flats, the size that suits your household.`}{" "}
          Apply once: your documents are checked straight away and the landlord
          sees an application that is complete.
        </p>
      </div>

      {results.length ? (
        <ul className="grid gap-3.5 md:grid-cols-2 lg:grid-cols-3">
          {results.map((f, i) => {
            const [facts, building] = listingLines(f)
            return (
              <li
                key={f.id}
                className="border-input flex flex-col overflow-hidden rounded-2xl border"
              >
                <div className="bg-muted relative aspect-[4/3]">
                  <Image
                    src={photos[i % photos.length]}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                    className="object-cover"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-5 p-5">
                  <div className="flex flex-col gap-1">
                    <p className="text-heading text-2xl font-medium">
                      {eur(f.warmmiete)}
                      <span className="text-muted-foreground text-base font-normal">
                        {" "}
                        / month warm
                      </span>
                    </p>
                    <p className="text-subtle text-sm">
                      {eur(f.kaltmiete)} cold · {cleanOrtsteil(f.ortsteil)}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="text-foreground">{facts}</p>
                    <p className="text-muted-foreground text-sm">{building}</p>
                  </div>
                  <Link
                    href={`/apply?${new URLSearchParams({ rental: f.id })}&${query}`}
                    className="bg-brand-500 hover:bg-brand-950 focus-visible:ring-ring mt-auto flex w-full items-center justify-center rounded-[12px] px-8 py-4 text-lg font-bold text-white transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  >
                    Apply
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground text-lg">
          No example flats in this area.
        </p>
      )}

      <p className="text-faint text-xs">
        Example listings from the synthetic rental dataset (prices run 25–40%
        below the real market), for the demo. The application goes to the demo
        landlord.
      </p>
    </ResultsShell>
  )
}
