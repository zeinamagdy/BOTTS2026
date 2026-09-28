import Image from "next/image"
import type { ReactNode } from "react"
import { kiezName } from "@/components/home/kiez-name"
import type { HomeGem } from "@/lib/queries"
import { cn } from "@/lib/utils"
import house from "../../../public/home/house.jpg"
import map from "../../../public/home/map.png"

function UserBubble({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <p
      className={cn(
        "bg-bubble text-bubble-foreground ml-auto max-w-[314px] rounded-[18px] rounded-br-none p-3",
        className,
      )}
    >
      {children}
    </p>
  )
}

function BotBubble({ children }: { children: ReactNode }) {
  return (
    <p className="bg-card mr-auto max-w-[300px] rounded-[18px] rounded-bl-none border p-3">
      {children}
    </p>
  )
}

function Chip({ children, active }: { children: ReactNode; active?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-3 py-2 text-base",
        active ? "bg-info text-info-foreground" : "bg-chip text-foreground",
      )}
    >
      {children}
    </span>
  )
}

/** Illustration card: fixed height on desktop, like the Figma frames. */
function Panel({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "bg-card relative min-h-[380px] overflow-hidden rounded-xl sm:h-[468px]",
        className,
      )}
    >
      {children}
    </div>
  )
}

function Step({
  title,
  text,
  children,
}: {
  title: string
  text: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-6">
      {children}
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-[81px]">
        <h3 className="text-heading w-[185px] shrink-0 text-[28px] leading-[1.1] font-medium">
          {title}
        </h3>
        <p className="text-muted-foreground max-w-[290px] text-lg">{text}</p>
      </div>
    </div>
  )
}

function badgesFor(gem: HomeGem) {
  const f = gem.facts
  const out: string[] = []
  if ((gem.factorScores.kitas ?? 0) >= 60) out.push("Family-friendly")
  if (f.nKitas) out.push(`${f.nKitas} Kitas`)
  if (f.greenPct1km != null && f.greenPct1km >= 20)
    out.push(`${f.greenPct1km}% green`)
  else if (f.parks1km) out.push(`${f.parks1km} parks`)
  return out.slice(0, 3)
}

/** Positions from the 556×468 Figma frame, as percentages so the map scales. */
const pct = (x: number, y: number, w: number, h: number) => ({
  left: `${(x / 556) * 100}%`,
  top: `${(y / 468) * 100}%`,
  width: `${(w / 556) * 100}%`,
  height: `${(h / 468) * 100}%`,
})

export function HowItWorks({ spotlight }: { spotlight: HomeGem | null }) {
  const badges = spotlight ? badgesFor(spotlight) : ["Family-friendly", "Kita"]
  return (
    <section
      id="how-it-works"
      className="mx-auto w-full max-w-[1136px] scroll-mt-8 px-4 py-16 sm:py-24"
    >
      <h2 className="text-heading mb-10 text-4xl font-medium sm:mb-16 sm:text-[52px]">
        How it works
      </h2>
      <div className="grid gap-x-6 gap-y-16 md:grid-cols-2">
        <Step
          title="Tell us about your family"
          text="Be it work, Kita, your preferred commute, we can provide help"
        >
          <Panel className="font-inter flex flex-col justify-center gap-6 px-6 text-lg sm:px-10 sm:text-xl">
            <UserBubble>
              Hello, what is the ideal house size for a one kid family?
            </UserBubble>
            <BotBubble>
              The ideal size is at least 100 m² averaging at least 38 m²
            </BotBubble>
            <UserBubble>Are there any houses that match the size?</UserBubble>
          </Panel>
        </Step>

        <Step
          title="Pick what matters"
          text="Nature, community, budget and more to suit you."
        >
          <Panel className="font-inter flex flex-col justify-center gap-5 px-6 text-lg sm:px-12 sm:text-xl">
            <UserBubble>
              What are some close locations for me and my kids?
            </UserBubble>
            <BotBubble>I can find those for you.</BotBubble>
            <p className="max-w-[306px]">
              What would be some important locations for you?
            </p>
            <div className="flex flex-wrap gap-3 font-sans">
              <Chip>Kita</Chip>
              <Chip active>Nature</Chip>
              <Chip>Cafés</Chip>
            </div>
            <UserBubble className="w-fit">Nature</UserBubble>
          </Panel>
        </Step>

        <Step
          title="Discover your Kieze"
          text="Get area recommendations based on you and for you."
        >
          <Panel className="flex items-center justify-center p-6">
            <div className="bg-card flex w-[283px] flex-col gap-2 rounded-[14px] p-3 shadow-lg ring-1 ring-black/5">
              <p className="font-inter truncate text-xl font-medium">
                {spotlight
                  ? `${kiezName(spotlight)}, ${spotlight.plz}`
                  : "Name of house"}
              </p>
              <div className="relative h-[240px] overflow-hidden rounded sm:h-[300px]">
                <Image
                  src={spotlight?.photo?.url ?? house}
                  alt={spotlight?.photo?.title ?? "Berlin TV tower at dusk"}
                  fill
                  sizes="260px"
                  className="object-cover"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {badges.map((b) => (
                  <span
                    key={b}
                    className="font-geist bg-secondary text-secondary-foreground rounded-full px-2.5 py-0.5 text-sm font-semibold"
                  >
                    {b}
                  </span>
                ))}
              </div>
            </div>
          </Panel>
        </Step>

        <Step
          title="See a new life"
          text="Explore each area with custom maps, local spots and clear trades."
        >
          <Panel className="aspect-[556/468] min-h-0 sm:h-auto">
            <Image
              src={map}
              alt="Map of a Berlin neighbourhood with a route to a Kita"
              className="absolute object-cover dark:brightness-90"
              style={pct(68, 36, 420, 395)}
              sizes="420px"
            />
            {/* eslint-disable-next-line @next/next/no-img-element -- tiny decorative SVGs */}
            <img
              src="/home/route.svg"
              alt=""
              className="absolute"
              style={pct(276.5, 209.5, 121.5, 67.5)}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/home/pin-shadow-outer.svg"
              alt=""
              className="absolute"
              style={pct(265, 268, 24, 13)}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/home/pin.svg"
              alt=""
              className="absolute"
              style={pct(266.93, 224, 20.13, 50.23)}
            />
            <span
              className="absolute rounded-full bg-white px-3 py-2 text-sm text-neutral-900 shadow-lg sm:text-base"
              style={{
                left: `${(206 / 556) * 100}%`,
                top: `${(217 / 468) * 100}%`,
              }}
            >
              Kita
            </span>
          </Panel>
        </Step>
      </div>
    </section>
  )
}
