/**
 * Fairness audit of the landlord flow: runs the real `buildInbox` checks and the
 * real Fair Pick draw over the demo inbox, and compares groups the checks never
 * see (a cover note mentioning origin, religion or health) with everyone else.
 * Names aren't tested: nobody is shown or checked by name. Two-proportion z-test on who qualifies,
 * and the average place in 500 Fair Pick draws.
 *
 * Read it honestly: the demo generator draws these traits independently, so this
 * shows the checks and the draw add no bias of their own, not that real
 * applicant data would be fair.
 *
 *   npm run audit:fairness            (demo flat, 3× income)
 *   npm run audit:fairness -- 2.5     (another income multiple)
 */
import { buildInbox, type Applicant } from "../src/lib/applicants"
import { drawOrder, newSeed } from "../src/lib/fair-pick"
import {
  coldRent,
  DEFAULT_INCOME_MULTIPLE,
  DEMO_SETTINGS,
} from "../src/lib/landlord"

const multiple = Number(process.argv[2]) || DEFAULT_INCOME_MULTIPLE
const flat = DEMO_SETTINGS
// No DB here, so the cold rent uses the fallback service charge
const cold = coldRent(flat.warmRent, flat.areaM2, null)
const inbox = buildInbox({
  coldRent: cold,
  warmRent: flat.warmRent,
  docs: flat.docs,
  incomeMultiple: multiple,
})
const all = [...inbox.meets, ...inbox.check, ...inbox.below]

const groups: [string, (a: Applicant) => boolean][] = [
  ["note mentions origin", (a) => a.note.hidden === "origin"],
  ["note mentions religion", (a) => a.note.hidden === "religion"],
  ["note mentions health", (a) => a.note.hidden === "health"],
]

function z(k1: number, n1: number, k2: number, n2: number) {
  const p = (k1 + k2) / (n1 + n2)
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2))
  return se ? (k1 / n1 - k2 / n2) / se : 0
}

// Average place in the draw (0 = first, 1 = last) over many seeds
const DRAWS = 500
const ids = inbox.meets.map((a) => a.id)
const place = new Map(ids.map((id) => [id, 0]))
for (let i = 0; i < DRAWS; i++)
  drawOrder(newSeed(), ids).forEach((id, j) =>
    place.set(id, place.get(id)! + j / Math.max(1, ids.length - 1) / DRAWS),
  )
const meanPlace = (list: Applicant[]) => {
  const q = list.filter((a) => place.has(a.id))
  return q.length ? q.reduce((s, a) => s + place.get(a.id)!, 0) / q.length : NaN
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`
console.log(
  `Demo flat: ${all.length} unique applications, ${inbox.meets.length} qualify at ${multiple}× the cold rent (€${Math.round(cold)}), ${DRAWS} Fair Pick draws\n`,
)
console.log(
  "group".padEnd(26),
  "n".padStart(5),
  "qualify".padStart(9),
  "others".padStart(9),
  "z".padStart(7),
  "  mean place in draw (0.50 = fair)",
)
for (const [name, inGroup] of groups) {
  const g = all.filter(inGroup)
  const rest = all.filter((a) => !inGroup(a))
  const kg = g.filter((a) => a.bucket === "meets").length
  const kr = rest.filter((a) => a.bucket === "meets").length
  const zz = z(kg, g.length, kr, rest.length)
  console.log(
    name.padEnd(26),
    String(g.length).padStart(5),
    pct(kg / g.length).padStart(9),
    pct(kr / rest.length).padStart(9),
    zz.toFixed(2).padStart(7),
    `  ${meanPlace(g).toFixed(2)} vs ${meanPlace(rest).toFixed(2)}`,
    Math.abs(zz) > 1.96 ? " ← beyond sampling noise" : "",
  )
}
console.log(
  "\n|z| < 1.96: the difference is within ordinary sampling noise (95%).",
)
