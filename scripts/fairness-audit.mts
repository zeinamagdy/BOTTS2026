/**
 * Fairness audit of the landlord flow in the terminal: the same `auditFairness`
 * as step 2's panel (src/lib/fairness-audit.ts), over the demo inbox. Names
 * aren't tested: nobody is shown or checked by name.
 *
 *   npm run audit:fairness            (demo flat, 3× income)
 *   npm run audit:fairness -- 2.5     (another income multiple)
 */
import { buildInbox } from "../src/lib/applicants"
import { auditFairness } from "../src/lib/fairness-audit"
import {
  coldRent,
  DEFAULT_INCOME_MULTIPLE,
  DEMO_FLAT,
  DEMO_SETTINGS,
} from "../src/lib/landlord"

const multiple = Number(process.argv[2]) || DEFAULT_INCOME_MULTIPLE
const flat = DEMO_SETTINGS
// No DB here, so the cold rent uses the fallback service charge
const cold = coldRent(flat.warmRent, flat.areaM2, null)
const req = {
  coldRent: cold,
  warmRent: flat.warmRent,
  docs: flat.docs,
  incomeMultiple: multiple,
  moveInDate: DEMO_FLAT.moveInDate,
}
const audit = auditFairness(buildInbox(req), req, 500)

const pct = (x: number) => `${(x * 100).toFixed(1)}%`
console.log(
  `Demo flat: ${audit.applications} unique applications, ${audit.qualified} qualify at ${multiple}× the cold rent (€${Math.round(cold)}), ${audit.draws} Fair Pick draws\n`,
)
console.log(
  "group".padEnd(26),
  "n".padStart(5),
  "qualify".padStart(9),
  "others".padStart(9),
  "z".padStart(7),
  "  mean place in draw (0.50 = fair)",
)
for (const g of audit.groups)
  console.log(
    `note mentions ${g.topic}`.padEnd(26),
    String(g.n).padStart(5),
    pct(g.qualify).padStart(9),
    pct(g.others).padStart(9),
    g.z.toFixed(2).padStart(7),
    `  ${g.place?.toFixed(2) ?? "–"} vs ${g.othersPlace?.toFixed(2) ?? "–"}`,
    g.flagged ? " ← beyond sampling noise" : "",
  )
console.log(
  "\n|z| < 1.96: the difference is within ordinary sampling noise (95%).",
)
console.log(
  `\nPrompt injection in the cover letter: ${audit.injection.passed ? "no effect" : "CHANGED THE OUTCOME"}`,
)
for (const c of audit.injection.cases)
  console.log(
    `  ${c.strong ? "qualifying" : "weak"} application → ${c.bucket}, ${c.unchanged ? "same as without the text" : "differs from without the text"}`,
  )
