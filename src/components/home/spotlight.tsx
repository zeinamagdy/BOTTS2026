import { BabyIcon, TramFrontIcon, TreeDeciduousIcon } from "lucide-react"
import Image from "next/image"
import photo from "../../../public/home/baumschulenweg.jpg"

const TAGS = [
  { icon: TreeDeciduousIcon, label: "Plänterwald" },
  { icon: BabyIcon, label: "6+ Kitas" },
  { icon: TramFrontIcon, label: "27 minute commute" },
]

/** One example Kiez (static copy from the design). */
export function Spotlight() {
  return (
    <section className="flex flex-col items-center gap-10 lg:flex-row lg:gap-28">
      <div className="relative aspect-[660/558] w-full overflow-hidden rounded-3xl lg:w-[660px] lg:shrink-0">
        <Image
          src={photo}
          alt="An old brick villa covered in ivy in Baumschulenweg"
          fill
          placeholder="blur"
          sizes="(min-width: 1024px) 660px, 100vw"
          className="object-cover"
        />
      </div>
      <div className="flex flex-col gap-8">
        <h2 className="text-heading text-4xl leading-[1.1] text-balance sm:text-[52px]">
          Baumschulenweg. Get to know it.
        </h2>
        <p className="text-muted-foreground text-lg">
          Forest and river on the doorstep, Kita places you can actually get,
          and 27 minutes to Alexanderplatz. Areas like this are where KiezKiss
          starts.
        </p>
        <ul className="flex flex-wrap gap-x-2 gap-y-4">
          {TAGS.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="bg-panel text-panel-foreground flex items-center gap-1 rounded-full p-3"
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
