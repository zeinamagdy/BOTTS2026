import Image from "next/image"
import { TrainFrontIcon } from "lucide-react"
import type { KiezMatch } from "@/lib/queries"
import { cn } from "@/lib/utils"
import house from "../../../public/home/house.jpg"

const FACTOR_LABELS: Record<string, string> = {
  affordability: "Affordable",
  schools: "Schools",
  safety: "Safety",
  noise: "Quiet",
  air: "Clean air",
  green: "Green",
  heat: "Cool summers",
  kitas: "Kitas",
  transit: "Transit",
  locationQuality: "Good area",
  hobbies: "Hobbies",
  nearCenter: "Central",
}

/** "Köpenick (Ort)" → "Köpenick" */
const clean = (s: string | null) =>
  s?.replace(/\s*\((Ort|Ortsteil)\)$/, "") ?? null

/** The user's most important factors, strongest first, with this area's 0–100 score. */
function strengths(m: KiezMatch, weights: Record<string, number>) {
  return Object.entries(m.factorScores)
    .filter(([f]) => FACTOR_LABELS[f])
    .sort(
      ([a, sa], [b, sb]) => (weights[b] ?? 0) - (weights[a] ?? 0) || sb - sa,
    )
    .slice(0, 4)
    .map(([f, score]) => ({ label: FACTOR_LABELS[f], score }))
}

function factLine(m: KiezMatch) {
  const f = m.facts
  return [
    f.rentPerM2KaltSynthetic != null &&
      `€${f.rentPerM2KaltSynthetic.toFixed(2)}/m² cold (synthetic)`,
    f.nKitas != null && `${f.nKitas} Kita${f.nKitas === 1 ? "" : "s"}`,
    f.distanceFromCenterKm != null &&
      `${f.distanceFromCenterKm} km to Alexanderplatz`,
  ]
    .filter(Boolean)
    .join(" · ")
}

export function MatchCard({
  match: m,
  rank,
  weights,
}: {
  match: KiezMatch
  rank: number
  weights: Record<string, number>
}) {
  const place = clean(m.ortsteil)
  return (
    <li className="border-input flex flex-col overflow-hidden rounded-2xl border sm:flex-row">
      <div className="relative h-44 shrink-0 sm:h-auto sm:w-52">
        <Image
          src={m.photo?.url ?? house}
          alt={m.photo ? `Street view near ${m.plrName}` : ""}
          fill
          sizes="(min-width: 640px) 208px, 100vw"
          className="object-cover"
        />
        <span className="bg-brand-500 absolute top-3 left-3 rounded-full px-2.5 py-0.5 text-sm font-bold text-white">
          #{rank}
        </span>
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

      <div className="flex min-w-0 flex-1 flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-heading text-xl font-medium">{m.plrName}</h3>
            <p className="text-subtle text-sm">
              {[
                place,
                place !== m.bezirk && m.bezirk,
                m.insideRing ? "inside the Ring" : "outside the Ring",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <p className="bg-secondary text-secondary-foreground shrink-0 rounded-full px-3 py-1 text-sm font-bold">
            {m.score}% match
          </p>
        </div>

        {m.commutes.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {m.commutes.map((c) => (
              <li
                key={c.kind + c.to}
                title={c.lines.length ? `via ${c.lines.join(", ")}` : c.to}
                className={cn(
                  "flex items-center gap-1.5 rounded-[4px] border px-2 py-0.5 text-sm",
                  c.overLimit
                    ? "border-destructive/40 text-destructive"
                    : "border-input text-heading",
                )}
              >
                <TrainFrontIcon aria-hidden className="size-3.5 opacity-70" />
                <span className="font-medium">{c.kind}</span>
                {c.estimated ? `~${c.minutes} min (est.)` : `${c.minutes} min`}
                {c.lines.length > 0 && (
                  <span className="text-subtle">· {c.lines.join(", ")}</span>
                )}
              </li>
            ))}
          </ul>
        )}

        <ul className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          {strengths(m, weights).map((s) => (
            <li key={s.label} className="flex flex-col gap-1">
              <span className="text-subtle text-xs font-medium">
                {s.label}
                <span className="sr-only">: {s.score} of 100</span>
              </span>
              <span
                aria-hidden
                className="bg-muted h-1.5 overflow-hidden rounded-full"
              >
                <span
                  className="bg-brand-500 block h-full rounded-full"
                  style={{ width: `${s.score}%` }}
                />
              </span>
            </li>
          ))}
        </ul>

        <p className="text-muted-foreground text-sm">{factLine(m)}</p>
      </div>
    </li>
  )
}
