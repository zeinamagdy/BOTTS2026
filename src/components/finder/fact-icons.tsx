import {
  BabyIcon,
  CoffeeIcon,
  DumbbellIcon,
  GraduationCapIcon,
  MountainIcon,
  PersonStandingIcon,
  StethoscopeIcon,
  FerrisWheelIcon,
  TrainFrontIcon,
  TreesIcon,
  type LucideIcon,
} from "lucide-react"
import type { FinderResults } from "@/lib/finder"

type Facts = FinderResults["results"][number]["facts"]

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

type Item = {
  key: string
  icon: LucideIcon
  /** priority / hobby / must-have keys that make this item worth showing first */
  wants: string[]
  count: (f: Facts) => number | null
  label: (n: number, f: Facts) => string
}

const ITEMS: Item[] = [
  {
    key: "parks",
    icon: TreesIcon,
    wants: ["parks", "green", "nature", "park"],
    count: (f) => f.parks1kmPlz,
    label: (n) => `${plural(n, "park")} within a 12 min walk`,
  },
  {
    key: "kitas",
    icon: BabyIcon,
    wants: ["kitas", "kita"],
    count: (f) => f.nKitas,
    label: (n) => plural(n, "Kita") + " in the area",
  },
  {
    key: "playgrounds",
    icon: FerrisWheelIcon,
    wants: ["playgrounds", "playground"],
    count: (f) => f.playgrounds1kmPlz,
    label: (n) => `${plural(n, "playground")} within a 12 min walk`,
  },
  {
    key: "cafes",
    icon: CoffeeIcon,
    wants: ["cafes", "cafe"],
    count: (f) => f.cafes1kmPlz,
    label: (n) => `${plural(n, "café")} within a 12 min walk`,
  },
  {
    key: "kinderarzt",
    icon: StethoscopeIcon,
    wants: ["kinderarzt"],
    count: (f) => f.kinderarztInPlz,
    label: (n) => `${plural(n, "paediatrician")} in the postcode`,
  },
  {
    key: "yoga",
    icon: PersonStandingIcon,
    wants: ["yoga"],
    count: (f) => f.yogaStudiosInPlz,
    label: (n) => `${plural(n, "yoga studio")} in the postcode`,
  },
  {
    key: "gym",
    icon: DumbbellIcon,
    wants: ["gym"],
    count: (f) => f.gymsInPlz,
    label: (n) => `${plural(n, "gym")} in the postcode`,
  },
  {
    key: "bouldering",
    icon: MountainIcon,
    wants: ["bouldering"],
    count: (f) => f.boulderingInPlz,
    label: (n) => `${plural(n, "bouldering gym")} in the postcode`,
  },
  {
    key: "schools",
    icon: GraduationCapIcon,
    wants: ["schools"],
    count: (f) => f.abiturSchoolsHere,
    label: (n) => `${plural(n, "Abitur school")} in the area`,
  },
]

/** Walk minutes out of "Name (S41, 8 min walk)" */
const walkMinutes = (s: string | null) =>
  Number(s?.match(/(\d+) min walk\)$/)?.[1]) || null

/**
 * A scannable row of pictograms with counts. What the person asked for
 * (`wanted` = priorities set to Must have, hobbies and must-haves) comes first;
 * zero counts are left out; at most `max` are shown.
 */
export function FactIcons({
  facts,
  wanted,
  max = 6,
}: {
  facts: Facts
  wanted: string[]
  max?: number
}) {
  const shown = ITEMS.map((it, i) => ({
    it,
    n: it.count(facts),
    rank: it.wants.some((w) => wanted.includes(w)) ? 0 : 1,
    i,
  }))
    .filter((x) => x.n != null && x.n > 0)
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .slice(0, max)
    .map((x) => ({
      key: x.it.key,
      Icon: x.it.icon,
      n: x.n!,
      label: x.it.label(x.n!, facts),
    }))

  const walk = walkMinutes(facts.nearestStation)
  if (walk != null && shown.length < max)
    shown.push({
      key: "stop",
      Icon: TrainFrontIcon,
      n: walk,
      label: `Nearest stop ~${walk} min walk`,
    })
  if (!shown.length) return null

  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2">
      {shown.map(({ key, Icon, n, label }) => (
        <li
          key={key}
          title={label}
          aria-label={label}
          className="text-subtle flex items-center gap-1.5"
        >
          <Icon
            aria-hidden
            className="text-brand-600 size-6"
            strokeWidth={1.75}
          />
          <span className="text-base font-medium">
            {key === "stop" ? `${n} min` : n}
          </span>
        </li>
      ))}
    </ul>
  )
}
