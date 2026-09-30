import { ChevronDownIcon, ScaleIcon, ShieldAlertIcon } from "lucide-react"
import type { FairnessAudit } from "@/lib/fairness-audit"

const pct = (x: number) => `${Math.round(x * 100)}%`
const TOPIC = { origin: "origin", religion: "religion", health: "health" }

/**
 * Step 2: the fairness audit (lib/fairness-audit.ts), run on this inbox with
 * the requirements set in step 1. Collapsed to one line until opened.
 */
export function FairnessAuditPanel({ audit }: { audit: FairnessAudit }) {
  const Icon = audit.flagged ? ShieldAlertIcon : ScaleIcon
  return (
    <details className="group bg-secondary rounded-2xl p-5 leading-normal">
      <summary className="flex cursor-pointer list-none items-start gap-2 outline-none [&::-webkit-details-marker]:hidden">
        <Icon aria-hidden className="text-brand-600 mt-1 size-5 shrink-0" />
        <span className="flex flex-1 flex-col gap-1">
          <span className="text-heading text-lg font-bold">Fairness audit</span>
          <span className="text-foreground">
            {audit.flagged
              ? "A check flagged a result outside ordinary sampling noise. Look at the details before relying on it."
              : "Whether a note mentions origin, religion or health changes nobody’s chance, and an attempt to trick the review from the cover letter had no effect."}
          </span>
        </span>
        <ChevronDownIcon
          aria-hidden
          className="text-muted-foreground mt-1 size-5 shrink-0 transition-transform group-open:rotate-180"
        />
      </summary>

      <div className="mt-5 flex flex-col gap-5 text-sm">
        <p className="text-foreground">
          About a third of cover notes mention something a landlord must not
          weigh. The review never reads it, so those applicants should qualify
          as often as everyone else and land in the middle of the draw on
          average. Checked on these {audit.applications.toLocaleString("en")}{" "}
          applications with your requirements, over {audit.draws} Fair Pick
          draws.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left">
            <thead className="text-subtle">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Note mentions</th>
                <th className="py-1.5 pr-3 text-right font-medium">n</th>
                <th className="py-1.5 pr-3 text-right font-medium">Qualify</th>
                <th className="py-1.5 pr-3 text-right font-medium">Others</th>
                <th className="py-1.5 pr-3 text-right font-medium">z</th>
                <th className="py-1.5 text-right font-medium">Place in draw</th>
              </tr>
            </thead>
            <tbody className="text-foreground">
              {audit.groups.map((g) => (
                <tr key={g.topic} className="border-input border-t">
                  <td className="py-1.5 pr-3">{TOPIC[g.topic]}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{g.n}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {pct(g.qualify)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {pct(g.others)}
                  </td>
                  <td
                    className={
                      g.flagged
                        ? "text-brand-600 py-1.5 pr-3 text-right font-bold tabular-nums"
                        : "py-1.5 pr-3 text-right tabular-nums"
                    }
                  >
                    {g.z.toFixed(2)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {g.place == null
                      ? "–"
                      : `${g.place.toFixed(2)} vs ${g.othersPlace?.toFixed(2)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-subtle">
          Two-proportion z-test: |z| under 1.96 is ordinary sampling noise.
          Place 0 is drawn first, 1 last, 0.50 is fair.
        </p>

        <div className="flex flex-col gap-2">
          <p className="text-heading font-bold">
            Prompt injection:{" "}
            {audit.injection.passed ? "no effect" : "changed the outcome"}
          </p>
          <p className="text-foreground">
            We sent one weak and one qualifying application through the same
            check as KiezKiss applications, each with this cover letter:
          </p>
          <blockquote className="border-brand-300 text-muted-foreground border-l-2 pl-3 italic">
            {audit.injection.text}
          </blockquote>
          <ul className="text-foreground flex flex-col gap-1">
            {audit.injection.cases.map((c) => (
              <li key={String(c.strong)}>
                {c.strong ? "Qualifying" : "Weak"} application:{" "}
                {c.bucket === "meets"
                  ? "meets the requirements"
                  : c.bucket === "below"
                    ? "no financial route met, not in the draw"
                    : "needs a check, not in the draw"}
                {c.unchanged
                  ? ", exactly as without the text."
                  : ", which differs from the same application without it."}
              </li>
            ))}
          </ul>
          <p className="text-subtle">
            The check reads only the facts (income, routes, documents, move-in,
            smoking), never the letter, and no model ranks anyone.
          </p>
        </div>
        <p className="text-faint">
          The demo applicants’ traits are generated independently, so this shows
          the review and the draw add no bias of their own, not that real
          applicant data is fair.
        </p>
      </div>
    </details>
  )
}
