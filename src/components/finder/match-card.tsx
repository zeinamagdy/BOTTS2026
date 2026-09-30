import Image from "next/image"
import Link from "next/link"
import { BadgeAlertIcon, SquarePlusIcon } from "lucide-react"
import { ShowAreaButton } from "@/components/finder/show-area-button"
import { FactIcons } from "@/components/finder/fact-icons"
import type { FinderResults } from "@/lib/finder"
import { cn } from "@/lib/utils"
import house from "../../../public/home/house.jpg"

type KiezMatch = FinderResults["results"][number]
type Facts = KiezMatch["facts"]
type Phrase = (f: Facts, hobbies: string[]) => string | null

/** Median synthetic cold rent per m² across the ranked areas */
const MEDIAN_RENT = 11.9

const ORDINAL: Record<string, string> = {
  gering: "low",
  mittel: "medium",
  hoch: "high",
  gut: "good",
  schlecht: "poor",
}
const ord = (v: string | null) => (v ? (ORDINAL[v] ?? v) : null)
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`
const euro = (v: number) => `€${v.toFixed(2)}`
/** "S Storkower Str. (Berlin) (S41, …)" → "S Storkower Str. (S41, …)" */
const station = (s: string) =>
  s.replace(/^Berlin,\s*/, "").replace(/\s*\(Berlin\)/, "")

/** Per ranking factor: what to say when the area is strong on it, and when it is weak. */
const PHRASES: Record<string, { good: Phrase; weak: Phrase }> = {
  schools: {
    good: (f) =>
      f.abiturSchoolsHere
        ? `${plural(f.abiturSchoolsHere, "school")} with strong Abitur results right here`
        : "Strong Abitur results in the Bezirk's schools",
    weak: () => "Abitur results below the Berlin average",
  },
  kitas: {
    good: (f) =>
      f.nKitas
        ? `${plural(f.nKitas, "Kita")}${f.kitaPlaces ? ` with ${f.kitaPlaces} places` : ""} in the area`
        : "Plenty of Kita places for young children",
    weak: (f) =>
      f.kitaPlacesPer100Under6 != null
        ? `Only ${f.kitaPlacesPer100Under6} Kita places per 100 children under 6`
        : "Few Kita places in the area",
  },
  safety: {
    good: (f) =>
      f.crimePer10kBezirk != null
        ? `One of the safer Bezirke: ${f.crimePer10kBezirk} offences per 10,000 residents`
        : "One of the safer Bezirke",
    weak: (f) =>
      f.crimePer10kBezirk != null
        ? `Higher crime rate in the Bezirk: ${f.crimePer10kBezirk} per 10,000 residents`
        : "Higher crime rate in the Bezirk",
  },
  noise: {
    good: (f) => `Quiet streets (noise level: ${ord(f.noise) ?? "low"})`,
    weak: (f) =>
      `Busier, louder streets (noise level: ${ord(f.noise) ?? "high"})`,
  },
  air: {
    good: (f) => `Clean air (pollution: ${ord(f.airPollution) ?? "low"})`,
    weak: (f) =>
      `More air pollution than elsewhere (${ord(f.airPollution) ?? "high"})`,
  },
  green: {
    good: () => "Well supplied with parks and green space",
    weak: () => "Little public green space within walking distance",
  },
  heat: {
    good: () => "Stays cooler in summer heatwaves",
    weak: (f) => `Heats up in summer (heat stress: ${ord(f.heat) ?? "high"})`,
  },
  transit: {
    good: (f) =>
      f.nearestStation
        ? `${station(f.nearestStation)} close by`
        : "Close to transit",
    weak: (f) =>
      f.nearestStation
        ? `Nearest station is ${station(f.nearestStation)}`
        : "Further from U- and S-Bahn stations",
  },
  nearCenter: {
    good: (f) =>
      f.minutesToCentre != null
        ? `Only ~${f.minutesToCentre} min to Alexanderplatz`
        : "Close to the centre",
    weak: (f) =>
      f.minutesToCentre != null
        ? `~${f.minutesToCentre} min to Alexanderplatz`
        : "Far from the centre",
  },
  locationQuality: {
    good: (f) =>
      f.pctWohnlageGut != null
        ? `${f.pctWohnlageGut}% of addresses rated a good Wohnlage`
        : "A sought-after residential area",
    weak: () => "Mostly simple or average Wohnlage",
  },
  parks: {
    good: (f) =>
      f.parks1kmPlz != null
        ? `${plural(f.parks1kmPlz, "park")} within a 12 min walk`
        : "Parks within walking distance",
    weak: (f) =>
      `Few parks nearby${f.parks1kmPlz != null ? ` (${f.parks1kmPlz} within a 12 min walk)` : ""}`,
  },
  cafes: {
    good: (f) =>
      f.cafes1kmPlz != null
        ? `${plural(f.cafes1kmPlz, "café")} within a 12 min walk`
        : "Cafés around the corner",
    weak: (f) =>
      `Quiet café scene${f.cafes1kmPlz != null ? ` (${f.cafes1kmPlz} within a 12 min walk)` : ""}`,
  },
  playgrounds: {
    good: (f) =>
      f.playgrounds1kmPlz != null
        ? `${plural(f.playgrounds1kmPlz, "playground")} within a 12 min walk`
        : "Playgrounds nearby",
    weak: (f) =>
      `Few playgrounds nearby${f.playgrounds1kmPlz != null ? ` (${f.playgrounds1kmPlz} within a 12 min walk)` : ""}`,
  },
  affordability: {
    good: (f) =>
      f.rentPerM2KaltSynthetic != null
        ? `Rents below the Berlin median (${euro(f.rentPerM2KaltSynthetic)}/m² cold)`
        : "Rents below the Berlin median",
    weak: (f) =>
      f.rentPerM2KaltSynthetic != null
        ? `Pricier than average (${euro(f.rentPerM2KaltSynthetic)}/m² cold)`
        : "Pricier than average",
  },
  hobbies: {
    good: (f, hobbies) => {
      const have = [
        hobbies.includes("yoga") && f.yogaStudiosInPlz && "yoga",
        hobbies.includes("gym") && f.gymsInPlz && "a gym",
        hobbies.includes("bouldering") && f.boulderingInPlz && "bouldering",
      ].filter(Boolean)
      return have.length ? `${have.join(", ")} in the postcode` : null
    },
    weak: (_, hobbies) => `Not all of ${hobbies.join(", ")} in the postcode`,
  },
}

/** Strongest and weakest of the person's weighted factors, as sentences. */
function benefitAndTradeOff(
  m: KiezMatch,
  weights: Record<string, number>,
  hobbies: string[],
) {
  const ranked = Object.entries(m.factorScores)
    .filter(([f]) => PHRASES[f] && (weights[f] ?? 0) > 0)
    .map(([f, score]) => ({ f, score, w: weights[f] }))
  const best = [...ranked].sort(
    (a, b) => b.score * b.w - a.score * a.w || b.score - a.score,
  )
  const worst = [...ranked].sort((a, b) => a.score - b.score || b.w - a.w)
  const say = (f: string, kind: "good" | "weak") =>
    PHRASES[f][kind](m.facts, hobbies)

  const benefit = best.map((x) => say(x.f, "good")).find(Boolean) ?? null
  const low = worst[0]
  const tradeOff =
    low && low.score < 60
      ? say(low.f, "weak")
      : "No weak spot among your priorities: every one scores in Berlin's upper half"
  return { benefit, tradeOff }
}

/** A short deterministic description from the area's facts (the results page calls no model). */
function describe(m: KiezMatch) {
  const f = m.facts
  const feel = [
    f.noise === "gering" && "Quiet",
    f.greenSupply === "gut" && "green",
  ].filter(Boolean) as string[]
  const opening = feel.length
    ? `${feel.join(", ")} streets`
    : f.dominantWohnlage === "gut"
      ? "A sought-after residential area"
      : "A residential area"
  const where = m.insideRing ? "inside the S-Bahn Ring" : "outside the Ring"
  const centre =
    f.minutesToCentre != null
      ? `, ~${f.minutesToCentre} min to Alexanderplatz`
      : ""
  const stop = f.nearestStation
    ? ` Nearest stop: ${station(f.nearestStation)}.`
    : ""
  const text = `${opening} ${where}${centre}.${stop}`
  return text[0].toUpperCase() + text.slice(1)
}

const clean = (s: string | null) =>
  s?.replace(/\s*\((Ort|Ortsteil)\)$/, "") ?? null

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-[30px]">
      <p className="text-heading shrink-0 text-lg">{label}</p>
      {children}
    </div>
  )
}

function Point({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof SquarePlusIcon
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-brand-600 flex items-center gap-2 font-bold">
        <Icon aria-hidden className="size-6" strokeWidth={1.75} />
        {title}
      </p>
      <p className="text-subtle text-lg leading-normal">{children}</p>
    </div>
  )
}

export function MatchCard({
  match: m,
  weights,
  hobbies,
  wanted,
  maxCommute,
  flatsHref,
}: {
  match: KiezMatch
  weights: Record<string, number>
  hobbies: string[]
  wanted: string[]
  maxCommute: number
  /** Example flats in this area, each with "Apply" */
  flatsHref: string
}) {
  const place = clean(m.ortsteil)
  const { benefit, tradeOff } = benefitAndTradeOff(m, weights, hobbies)
  const rent = m.facts.rentPerM2KaltSynthetic
  const many = m.commutes.length > 1
  return (
    <li className="flex min-w-0 flex-col overflow-hidden rounded-[20px]">
      <div className="relative h-60 shrink-0 sm:h-[317px]">
        <Image
          src={m.photo?.url ?? house}
          alt={m.photo ? `Street view near ${m.plrName}` : ""}
          fill
          sizes="(min-width: 1024px) 360px, 100vw"
          className="object-cover"
        />
        {m.photo && (
          <a
            href={m.photo.page ?? undefined}
            target="_blank"
            rel="noreferrer"
            className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-3 pt-4 pb-1.5 text-[11px] text-white/80 hover:text-white"
          >
            Photo: {m.photo.author ?? "Wikimedia Commons"}
            {m.photo.license ? `, ${m.photo.license}` : ""}
          </a>
        )}
      </div>

      <div className="bg-background flex flex-1 flex-col gap-6 p-6">
        <div className="flex flex-col gap-3">
          <p className="text-subtle">
            {[place !== m.bezirk && place, m.bezirk].filter(Boolean).join(", ")}
          </p>
          <h3 className="text-foreground text-[28px] leading-[1.1] font-medium">
            {m.plrName}
          </h3>
          <p className="text-subtle text-lg leading-normal">{describe(m)}</p>
        </div>

        <FactIcons
          facts={m.facts}
          wanted={[
            ...Object.entries(weights)
              .filter(([, w]) => w >= 5)
              .map(([k]) => k),
            ...wanted,
          ]}
        />

        {m.commutes.map((c) => (
          <Row key={c.kind + c.to} label={many ? c.kind : "Commute"}>
            <div
              className="flex min-w-0 flex-1 items-center gap-3.5"
              title={`To ${c.to}${c.lines.length ? ` via ${c.lines.join(", ")}` : ""}`}
            >
              <span
                aria-hidden
                className="bg-chip h-3 min-w-0 flex-1 overflow-hidden rounded-full"
              >
                <span
                  className={cn(
                    "block h-full rounded-full",
                    c.overLimit ? "bg-destructive" : "bg-brand-500",
                  )}
                  style={{
                    width: `${Math.min(100, (c.minutes / maxCommute) * 100)}%`,
                  }}
                />
              </span>
              <span
                className={cn(
                  "shrink-0 text-sm font-medium",
                  c.overLimit ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {c.estimated ? `~${c.minutes} min` : `${c.minutes} min`}
              </span>
            </div>
          </Row>
        ))}

        <Row label="Budget">
          {m.typicalRent ? (
            <p className="ml-auto flex flex-col items-end text-right">
              <span className="text-muted-foreground text-sm font-medium whitespace-nowrap">
                ~€{m.typicalRent.warm.toLocaleString("en-GB")}/month warm
              </span>
              <span className="text-faint text-xs">
                typical {plural(m.typicalRent.rooms, "room")}
                {rent != null &&
                  ` · ${euro(rent)}/m² cold, ${rent <= MEDIAN_RENT ? "below" : "above"} median`}
                {" · synthetic"}
              </span>
            </p>
          ) : rent != null ? (
            <p className="ml-auto flex flex-col items-end text-right">
              <span className="text-muted-foreground text-sm font-medium whitespace-nowrap">
                {euro(rent)}/m² cold
              </span>
              <span className="text-faint text-xs">
                {rent <= MEDIAN_RENT ? "Below" : "Above"} Berlin median ·
                synthetic
              </span>
            </p>
          ) : (
            <p className="text-faint ml-auto text-sm">No rent data</p>
          )}
        </Row>

        {benefit && (
          <Point icon={SquarePlusIcon} title="Main benefit">
            {benefit}
          </Point>
        )}
        <Point icon={BadgeAlertIcon} title="Main trade-off">
          {tradeOff}
        </Point>

        <ShowAreaButton
          plrId={m.plrId}
          className="bg-brand-500 hover:bg-brand-950 focus-visible:ring-ring mt-auto flex w-full items-center justify-center rounded-[12px] px-8 py-4 text-lg font-bold text-white transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          Explore area
        </ShowAreaButton>
        <Link
          href={flatsHref}
          className="text-brand-600 focus-visible:ring-ring -mt-3 flex w-full items-center justify-center rounded-[12px] px-8 py-3 text-lg font-bold hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          See flats and apply
        </Link>
      </div>
    </li>
  )
}
