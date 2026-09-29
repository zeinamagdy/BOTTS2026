import Image, { type StaticImageData } from "next/image"
import Link from "next/link"
import { FindKiezButton } from "@/components/home/find-kiez-button"
import { kiezName } from "@/components/home/kiez-name"
import type { HomeGem } from "@/lib/queries"
import gem1 from "../../../public/home/gem-1.jpg"
import gem3 from "../../../public/home/gem-3.jpg"
import house from "../../../public/home/house.jpg"

const FALLBACK_PHOTOS: StaticImageData[] = [gem1, house, gem3]

function factLine(g: HomeGem) {
  const f = g.facts
  return [
    f.greenPct1km != null && `${f.greenPct1km}% green`,
    f.kitaPlaces && `${f.kitaPlaces.toLocaleString("en")} Kita places`,
    (f.abiturTierBezirk === "AMAZING" || f.abiturTierBezirk === "GOOD") &&
      `${f.abiturTierBezirk.toLowerCase()} schools`,
  ]
    .filter(Boolean)
    .join(" · ")
}

function GemCard({ gem, index }: { gem: HomeGem; index: number }) {
  const photo = gem.photo
  return (
    <div className="group relative h-[440px] overflow-hidden rounded-3xl sm:h-[576px]">
      <Image
        src={photo?.url ?? FALLBACK_PHOTOS[index % FALLBACK_PHOTOS.length]}
        alt={photo?.title ?? `${kiezName(gem)} in Berlin`}
        fill
        sizes="(min-width: 768px) 33vw, 100vw"
        className="object-cover transition-transform duration-500 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent from-45% to-neutral-950" />
      {photo && (
        <a
          href={photo.page ?? undefined}
          target="_blank"
          rel="noreferrer"
          className="absolute top-3 right-4 z-10 max-w-[80%] truncate text-[11px] text-white/75 hover:text-white"
        >
          Photo: {photo.author ?? "Wikimedia Commons"}
          {photo.license ? `, ${photo.license}` : ""}
        </a>
      )}
      <Link
        href="/explore"
        className="font-inter absolute inset-x-0 bottom-0 flex flex-col p-6 text-neutral-50"
      >
        <span className="text-xl font-bold">
          {kiezName(gem)}{" "}
          <span className="font-normal text-neutral-300">{gem.plz}</span>
        </span>
        <span className="text-base">{gem.bezirk}</span>
        <span className="mt-1 text-sm text-neutral-300">{factLine(gem)}</span>
      </Link>
    </div>
  )
}

export function HiddenGems({
  gems,
  outsideRing,
}: {
  gems: HomeGem[]
  outsideRing: number | null
}) {
  return (
    <section
      id="hidden-gems"
      className="bg-section scroll-mt-8 px-4 py-16 sm:px-6 sm:py-20"
    >
      <div className="mb-10 flex flex-col items-center gap-4 text-center sm:mb-[60px]">
        <h2 className="text-heading text-4xl font-medium sm:text-[52px]">
          Hidden Gems for you.
        </h2>
        <p className="text-muted-foreground text-lg">
          {outsideRing
            ? `See ${outsideRing} Kieze outside the Ring that can be just the right fit`
            : "See the Kieze outside the Ring that can be just the right fit"}
        </p>
      </div>
      {gems.length > 0 ? (
        <div className="mx-auto grid max-w-[1392px] gap-[18px] md:grid-cols-3">
          {gems.map((g, i) => (
            <GemCard key={g.plz} gem={g} index={i} />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-center">
          Recommendations appear once the database is seeded.
        </p>
      )}
      <p className="text-muted-foreground mx-auto mt-6 max-w-[1392px] text-center text-xs">
        Top family picks outside the S-Bahn Ring, ranked on Kitas, school
        results, safety, air and green space. Green share from OpenStreetMap.
      </p>
      <div className="mt-12 flex justify-center">
        <FindKiezButton />
      </div>
    </section>
  )
}
