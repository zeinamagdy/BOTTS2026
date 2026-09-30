import {
  DEFAULT_INCOME_MULTIPLE,
  DEMO_FLAT,
  DOCUMENTS,
  INCOME_MULTIPLES,
  SAVINGS_MONTHS,
  type DocumentKey,
  type FinancialRoute,
} from "@/lib/landlord"

/**
 * Demo applications for the landlord flow (client-safe, deterministic). There is
 * no applicant data in the data repo, so these are generated from a fixed seed:
 * the same flat settings always give the same inbox, which keeps the pitch
 * reproducible. Labelled as demo data in the UI.
 *
 * Only the requirements the landlord set are checked: financial security (any
 * one of four equal routes, see `FinancialRoute`), the chosen documents, the
 * move-in date and, when the landlord asks for it, a non-smoking household. Household and employment are shown
 * but never scored. Nobody is shown by name: a name (and a surname especially)
 * hints at origin, so every applicant is a neutral label (`applicantLabel`).
 */

export const EMPLOYMENT = [
  "Permanent",
  "Civil servant",
  "Fixed-term",
  "Self employed",
  "Student",
  "Retired",
] as const
export type Employment = (typeof EMPLOYMENT)[number]

/** What a cover note may mention that a landlord must not weigh (AGG), hidden from review */
export const HIDDEN_TOPICS = ["origin", "religion", "health"] as const
export type HiddenTopic = (typeof HIDDEN_TOPICS)[number]

export type Applicant = {
  id: string
  /** Neutral label ("Applicant 12", see `applicantLabel`), never a name */
  name: string
  adults: number
  children: number
  employment: Employment
  /** Net household income per month, null when not stated */
  income: number | null
  /** Net income ÷ cold rent */
  ratio: number | null
  hasGuarantor: boolean
  /** Mietkautionsversicherung: an insurer stands in for the deposit */
  hasDepositInsurance: boolean
  /** Savings in €, rounded to hundreds */
  savings: number
  /** The financial-security routes this applicant meets (any one is enough) */
  routes: FinancialRoute[]
  docsProvided: DocumentKey[]
  docsMissing: DocumentKey[]
  /** Self-employed only: latest tax assessment attached (null otherwise) */
  taxAssessment: boolean | null
  /** Fixed-term only: months left on the contract (null otherwise) */
  contractMonthsLeft: number | null
  /** Stated income agrees with the payslips (true when there are none to compare) */
  consistent: boolean
  /** Can move in on the flat's date */
  moveInOk: boolean
  /** Someone in the household smokes; null when not stated (applications sent before the question existed) */
  smoker: boolean | null
  /** Hours after the listing went online */
  receivedAfterH: number
  bucket: "meets" | "check" | "below"
  /** Years in the current job, business or service (drawn for everyone, shown by employment) */
  tenureYears: number
  /** Which wording of the cover note, and the passage hidden from review (if any) */
  note: { variant: number; hidden: HiddenTopic | null }
  /** Why an application needs a check, shortest first */
  issues: string[]
  /** Sent through /apply (stored), not a demo applicant */
  submitted?: {
    appliedAt: string
    rentalId: string
    coverLetter: string
    /** Uploaded, but the automatic check couldn't read them */
    unchecked: DocumentKey[]
  }
}

/** A stored application (`applications` table), as the landlord flow needs it */
export type Submission = {
  id: string
  createdAt: Date
  rentalId: string
  name: string
  adults: number
  children: number
  employment: string
  income: number | null
  hasGuarantor: boolean
  hasDepositInsurance: boolean
  savings: number
  moveIn: string
  smoker: boolean | null
  documents: Record<
    string,
    { status: "verified" | "rejected" | "unchecked"; netIncome?: number | null }
  >
  coverLetter: string
}

/** How the landlord sees every applicant: a number in order of arrival, never a name */
export const applicantLabel = (n: number) => `Applicant ${n}`

const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * Hides the applicant's own name in their letter: the full name first, then each
 * part, as whole words (umlauts included, any case). It catches the declared
 * name, not every name or detail a letter might mention.
 */
export function hideName(text: string, real: string, replacement = "[name]") {
  const parts = real
    .trim()
    .split(/\s+/)
    .filter((p) => p.length >= 2)
  if (!parts.length) return text
  return [real.trim(), ...parts]
    .sort((a, b) => b.length - a.length)
    .reduce(
      (t, from) =>
        t.replace(
          new RegExp(
            `(?<![\\p{L}\\p{N}])${escapeRe(from)}(?![\\p{L}\\p{N}])`,
            "giu",
          ),
          replacement,
        ),
      text,
    )
}

/** Stored applications get ids that can't clash with the demo ones (a0, a1, …) */
export const SUBMISSION_PREFIX = "k-"

/**
 * A stored application checked against the landlord's current requirements.
 * A rejected document counts as missing; one the check couldn't read counts as
 * provided but is listed to check by hand.
 *
 * The landlord never sees the real name: like every applicant it is a label
 * (`number` in order of arrival), and the name is hidden in the letter too.
 */
export function applicantFromSubmission(
  s: Submission,
  req: Requirements & { moveInDate: string },
  number: number,
): Applicant {
  const name = applicantLabel(number)
  const status = (k: DocumentKey) => s.documents[k]?.status
  const docsProvided = DOCUMENTS.map((d) => d.key).filter(
    (k) => status(k) === "verified" || status(k) === "unchecked",
  )
  const unchecked = docsProvided.filter((k) => status(k) === "unchecked")
  // A payslip shows one earner, so it is only compared for single-adult households
  const payslipIncome = s.documents.payslips?.netIncome
  const consistent =
    s.adults !== 1 ||
    s.income == null ||
    payslipIncome == null ||
    Math.abs(payslipIncome - s.income) <= 100
  const employment = (EMPLOYMENT as readonly string[]).includes(s.employment)
    ? (s.employment as Employment)
    : "Permanent"
  const facts: ApplicantFacts = {
    income: s.income,
    hasGuarantor: s.hasGuarantor,
    hasDepositInsurance: s.hasDepositInsurance,
    savings: s.savings,
    docsProvided,
    consistent,
    moveInOk: s.moveIn <= req.moveInDate,
    smoker: s.smoker,
  }
  const checked = checkApplicant(facts, req)
  const issues = [
    ...checked.issues,
    ...(unchecked.length
      ? [`Check by hand: ${unchecked.map((k) => DOC_LABEL[k]).join(", ")}`]
      : []),
  ]
  return {
    id: `${SUBMISSION_PREFIX}${s.id}`,
    name,
    adults: s.adults,
    children: s.children,
    employment,
    ...facts,
    ...checked,
    issues,
    bucket:
      checked.bucket === "meets" && unchecked.length ? "check" : checked.bucket,
    taxAssessment: null,
    contractMonthsLeft: null,
    receivedAfterH: 0,
    tenureYears: 0,
    note: { variant: 0, hidden: null },
    submitted: {
      appliedAt: s.createdAt.toISOString(),
      rentalId: s.rentalId,
      coverLetter: hideName(s.coverLetter, s.name),
      unchecked,
    },
  }
}

export type ApplicantInbox = {
  received: number
  duplicatesMerged: number
  meets: Applicant[]
  check: Applicant[]
  below: Applicant[]
}

// mulberry32: tiny seeded PRNG, good enough for demo data
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(r: () => number, items: readonly (readonly [T, number])[]) {
  let x = r() * items.reduce((s, [, w]) => s + w, 0)
  for (const [v, w] of items) if ((x -= w) < 0) return v
  return items[items.length - 1][0]
}

/** Standard normal via Box–Muller */
function normal(r: () => number) {
  return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r())
}

export const DOC_LABEL: Record<DocumentKey, string> = {
  id: "ID",
  payslips: "payslips",
  schufa: "SCHUFA",
  contract: "employment contract",
  rentDebt: "Mietschuldenfreiheitsbescheinigung",
}

/** How often each document is attached (SCHUFA is the one people lack most) */
const DOC_RATE: Record<DocumentKey, number> = {
  id: 0.95,
  payslips: 0.86,
  schufa: 0.8,
  contract: 0.85,
  rentDebt: 0.7,
}

const MEDIAN_INCOME: Record<Employment, number> = {
  Permanent: 3300,
  "Civil servant": 3400,
  "Fixed-term": 2700,
  "Self employed": 3100,
  Student: 1300,
  Retired: 2100,
}

/**
 * Demand model for the demo, anchored on the demo flat (527 applications at
 * €1,480 warm, 63 of them duplicates). A dearer listing draws fewer applicants,
 * and the ones it draws earn more: people mostly apply where they can roughly
 * afford the rent. Both use the warm rent, the price tenants see in the ad.
 * The exponents are guesses for the pitch, not fitted on data.
 */
const DEMAND_ELASTICITY = 1.2
const INCOME_SELF_SELECTION = 0.85
const DUPLICATE_SHARE = 63 / DEMO_FLAT.applications
const MIN_APPLICATIONS = 12
const MAX_APPLICATIONS = 1500

export function inboxSize(warmRent: number) {
  const priceRatio = warmRent > 0 ? DEMO_FLAT.warmRent / warmRent : 1
  const total = Math.round(
    Math.min(
      MAX_APPLICATIONS,
      Math.max(
        MIN_APPLICATIONS,
        DEMO_FLAT.applications * priceRatio ** DEMAND_ELASTICITY,
      ),
    ),
  )
  return { total, duplicates: Math.round(total * DUPLICATE_SHARE) }
}

/** What the landlord may ask for: 2–3 × the cold rent, anything else falls back to 3 */
export function clampIncomeMultiple(m: number) {
  return INCOME_MULTIPLES.find((x) => x === m) ?? DEFAULT_INCOME_MULTIPLE
}

export const ROUTE_LABEL: Record<FinancialRoute, string> = {
  income: "income",
  guarantor: "a guarantor",
  depositInsurance: "deposit insurance",
  savings: `savings of ${SAVINGS_MONTHS} months’ warm rent`,
}

/** Guarantors are common for students (usually parents), rare otherwise. Guesses for the demo */
const GUARANTOR_RATE: Record<Employment, number> = {
  Permanent: 0.04,
  "Civil servant": 0.02,
  "Fixed-term": 0.1,
  "Self employed": 0.08,
  Student: 0.55,
  Retired: 0.02,
}
const DEPOSIT_INSURANCE_RATE = 0.08
/** Share with no savings to speak of; the rest hold up to `MAX_SAVINGS_MONTHS` of warm rent */
const NO_SAVINGS_SHARE = 0.55
const MAX_SAVINGS_MONTHS = 5
/** Households with a smoker. A guess for the demo (roughly the German adult smoking rate) */
const SMOKER_SHARE = 0.22

/** What the requirement checks read about an applicant: never name, note or household */
export type ApplicantFacts = Pick<
  Applicant,
  | "income"
  | "hasGuarantor"
  | "hasDepositInsurance"
  | "savings"
  | "docsProvided"
  | "consistent"
  | "moveInOk"
  | "smoker"
>

export type Requirements = {
  coldRent: number
  warmRent: number
  docs: readonly DocumentKey[]
  incomeMultiple?: number
  nonSmoking?: boolean
}

/**
 * The landlord's requirements against one applicant, the same for the demo
 * inbox and for applications sent through /apply. It takes only
 * `ApplicantFacts`, so a name, a cover letter or the household can't reach it.
 */
export function checkApplicant(f: ApplicantFacts, req: Requirements) {
  const minIncome =
    req.coldRent *
    clampIncomeMultiple(req.incomeMultiple ?? DEFAULT_INCOME_MULTIPLE)
  const ratio =
    f.income == null || !req.coldRent ? null : f.income / req.coldRent
  const docsMissing = req.docs.filter((k) => !f.docsProvided.includes(k))
  const routes = (
    [
      ["income", f.income != null && f.income >= minIncome],
      ["guarantor", f.hasGuarantor],
      ["depositInsurance", f.hasDepositInsurance],
      [
        "savings",
        req.warmRent > 0 && f.savings >= SAVINGS_MONTHS * req.warmRent,
      ],
    ] as const
  )
    .filter(([, ok]) => ok)
    .map(([route]) => route) as FinancialRoute[]

  const issues = [
    ...(f.income == null && !routes.length ? ["Income not stated"] : []),
    ...(docsMissing.length
      ? [`Missing ${docsMissing.map((k) => DOC_LABEL[k]).join(", ")}`]
      : []),
    ...(f.moveInOk ? [] : ["Later move-in"]),
    ...(f.consistent ? [] : ["Income differs from the payslips"]),
    // A requirement like the documents: an open point, never an automatic rejection
    ...(req.nonSmoking && f.smoker !== false
      ? [f.smoker ? "Smoking household" : "Smoking not stated"]
      : []),
  ]
  // Below only when no route is met: a low income with a guarantor, deposit
  // insurance or enough savings is just as secure
  const bucket: Applicant["bucket"] =
    f.income != null && !routes.length
      ? "below"
      : issues.length
        ? "check"
        : "meets"
  return { routes, ratio, docsMissing, issues, bucket }
}

export function buildInbox({
  coldRent,
  warmRent,
  docs,
  incomeMultiple = DEFAULT_INCOME_MULTIPLE,
  nonSmoking = false,
}: Requirements): ApplicantInbox {
  const r = rng(2026)
  const { total, duplicates } = inboxSize(warmRent)
  const incomeScale =
    warmRent > 0 ? (warmRent / DEMO_FLAT.warmRent) ** INCOME_SELF_SELECTION : 1
  const unique = total - duplicates
  const all: Applicant[] = []
  // Attributes added for the shortlist (step 3) draw from a third stream, for the same reason
  const xr = rng(1312)
  // Step 4 (the single application) draws from a fourth stream: 3 draws per applicant
  const dr = rng(1520)
  // The alternative routes to financial security: a fifth stream, 3 draws per applicant
  const fr = rng(2929)
  // Smoking, added last: a sixth stream, 1 draw per applicant
  const sr = rng(4747)

  for (let i = 0; i < unique; i++) {
    const employment = pick(r, [
      ["Permanent", 52],
      ["Civil servant", 6],
      ["Fixed-term", 14],
      ["Self employed", 12],
      ["Student", 10],
      ["Retired", 6],
    ] as const)
    const adults =
      employment === "Student"
        ? pick(r, [
            [1, 7],
            [2, 3],
          ] as const)
        : pick(r, [
            [1, 45],
            [2, 55],
          ] as const)
    const children =
      employment === "Student" || employment === "Retired"
        ? 0
        : pick(r, [
            [0, 55],
            [1, 25],
            [2, 15],
            [3, 5],
          ] as const)
    // Second adults earn a bit less on average (part-time, parental leave)
    const earners = adults === 2 ? 1 + 0.75 : 1
    const income =
      r() < 0.05
        ? null
        : Math.round(
            (MEDIAN_INCOME[employment] *
              earners *
              incomeScale *
              Math.exp(Math.max(-2, Math.min(2, normal(r))) * 0.25)) /
              10,
          ) * 10
    const docsProvided = DOCUMENTS.map((d) => d.key).filter((k) =>
      k === "rentDebt" ? xr() < DOC_RATE[k] : r() < DOC_RATE[k],
    )
    const taxAssessment = employment === "Self employed" ? xr() < 0.5 : null
    const contractMonthsLeft =
      employment === "Fixed-term" ? 3 + Math.floor(xr() * 22) : null
    const consistent =
      income == null || !docsProvided.includes("payslips") || xr() < 0.95
    const moveInOk = r() < 0.9
    const tenureYears = 1 + Math.floor(dr() * 14)
    const variant = Math.floor(dr() * 2)
    const hiddenDraw = dr()
    const hasGuarantor = fr() < GUARANTOR_RATE[employment]
    const hasDepositInsurance = fr() < DEPOSIT_INSURANCE_RATE
    const savingsDraw = fr()
    const savings =
      savingsDraw < NO_SAVINGS_SHARE
        ? 0
        : Math.round(
            (((savingsDraw - NO_SAVINGS_SHARE) / (1 - NO_SAVINGS_SHARE)) *
              MAX_SAVINGS_MONTHS *
              warmRent) /
              100,
          ) * 100
    const smoker = sr() < SMOKER_SHARE
    const { routes, ratio, docsMissing, issues, bucket } = checkApplicant(
      {
        income,
        hasGuarantor,
        hasDepositInsurance,
        savings,
        docsProvided,
        consistent,
        moveInOk,
        smoker,
      },
      { coldRent, warmRent, docs, incomeMultiple, nonSmoking },
    )

    all.push({
      id: `a${i}`,
      name: applicantLabel(i + 1),
      adults,
      children,
      employment,
      income,
      ratio,
      hasGuarantor,
      hasDepositInsurance,
      savings,
      routes,
      docsProvided,
      docsMissing,
      taxAssessment,
      contractMonthsLeft,
      consistent,
      moveInOk,
      smoker,
      receivedAfterH: Math.round(r() * 72 * 10) / 10,
      tenureYears,
      note: {
        variant,
        // About a third of cover notes mention something a landlord must not weigh
        hidden:
          hiddenDraw < 0.35
            ? HIDDEN_TOPICS[
                Math.floor((hiddenDraw / 0.35) * HIDDEN_TOPICS.length)
              ]
            : null,
      },
      bucket,
      issues,
    })
  }

  // Who applied first until the landlord runs Fair Pick (`orderByDraw` in
  // fair-pick.ts). Never by income: that would always shortlist the richest
  // household, although income only has to clear the bar
  const byTime = (a: Applicant, b: Applicant) =>
    a.receivedAfterH - b.receivedAfterH
  const meets = all.filter((a) => a.bucket === "meets").sort(byTime)
  // Fewest open points first: those are the quickest to settle
  const check = all
    .filter((a) => a.bucket === "check")
    .sort((a, b) => a.issues.length - b.issues.length || byTime(a, b))
  const below = all.filter((a) => a.bucket === "below").sort(byTime)

  return {
    received: total,
    duplicatesMerged: duplicates,
    meets,
    check,
    below,
  }
}

export function householdLabel(a: Pick<Applicant, "adults" | "children">) {
  const adults = `${a.adults} ${a.adults === 1 ? "adult" : "adults"}`
  if (!a.children) return adults
  return `${adults}, ${a.children} ${a.children === 1 ? "child" : "children"}`
}

/** How many qualified applicants the overview recommends and step 3 shortlists */
export const SHORTLIST = 3

/** Status line of steps 2 and 4; `rank` is the place in the Fair Pick draw (-1 before the draw or when not qualified) */
export function applicantStatus(a: Applicant, rank: number) {
  if (a.bucket === "meets")
    return rank === 0
      ? "Drawn first"
      : rank >= 0 && rank < SHORTLIST
        ? "Drawn for review"
        : "Meets requirements"
  if (a.bucket === "below") return "No financial route met"
  return a.issues.join(" · ")
}

/**
 * Step 3: why each shortlisted applicant qualifies, and what is still worth a
 * look. Plain rules over the demo data, no model; nothing here rejects anyone.
 */
export function explainShortlist(
  shortlist: readonly Applicant[],
  flat: { rooms: number; docs: readonly DocumentKey[]; noun: string },
) {
  const byIncome = shortlist.filter((a) => a.routes.includes("income"))
  const lowest = Math.min(...byIncome.map((a) => a.ratio ?? Infinity))
  return shortlist.map((a) => {
    const reasons: string[] = []
    const toCheck: string[] = []
    if (a.routes.includes("income") && a.ratio != null)
      reasons.push(
        `Affordability threshold met: income is ${a.ratio.toFixed(1)} times the cold rent`,
      )
    else if (a.routes.length) {
      const via = a.routes.map((r) => ROUTE_LABEL[r])
      reasons.push(
        `Financial security through ${via.join(" and ")}, which counts the same as income`,
      )
      toCheck.push(
        a.routes.includes("guarantor")
          ? "Ask for the guarantor’s declaration and proof of income"
          : a.routes.includes("depositInsurance")
            ? "Ask for the deposit insurance certificate"
            : "Ask for a recent bank statement showing the savings",
      )
    }
    if (a.employment === "Permanent") reasons.push("Permanent employment")
    if (a.employment === "Civil servant")
      reasons.push("Civil servant, permanent employment")
    if (a.employment === "Retired") reasons.push("Pension income")
    if (a.employment === "Self employed") {
      if (a.taxAssessment)
        reasons.push("Tax assessment for self-employed income provided")
      else
        toCheck.push(
          "The latest tax assessment for self-employed income is missing",
        )
    }
    if (a.contractMonthsLeft != null)
      toCheck.push(
        `Fixed-term contract, ends in ${a.contractMonthsLeft} months`,
      )

    const people = a.adults + a.children
    if (people <= flat.rooms + 1)
      reasons.push(`Household size suits the ${flat.noun}`)
    else
      toCheck.push(
        `${people} people for ${flat.rooms} ${flat.rooms === 1 ? "room" : "rooms"}`,
      )

    if (flat.docs.length) reasons.push("All required documents provided")
    if (!flat.docs.includes("rentDebt") && a.docsProvided.includes("rentDebt"))
      reasons.push(`${DOC_LABEL.rentDebt} provided`)
    if (a.consistent) reasons.push("No inconsistencies detected")

    if (
      byIncome.length > 1 &&
      a.routes.includes("income") &&
      a.ratio === lowest
    )
      toCheck.push(
        `Closest of the ${byIncome.length === 2 ? "two" : byIncome.length === 3 ? "three" : byIncome.length} to the affordability threshold`,
      )
    return { applicant: a, reasons, toCheck }
  })
}

/** The move-in the applicants who can't make the flat's date offer instead */
export const LATER_MOVE_IN = "1 Feb 2027"

const years = (n: number) => `${n} ${n === 1 ? "year" : "years"}`

/** Step 4 "In detail": the one fact about the income source that matters most */
export function tenureLabel(a: Applicant) {
  if (a.submitted) return "Not asked in the application"
  switch (a.employment) {
    case "Permanent":
      return `${years(a.tenureYears)} employed`
    case "Civil servant":
      return `${years(a.tenureYears)} in service`
    case "Fixed-term":
      return `Ends in ${a.contractMonthsLeft} months`
    case "Self employed":
      return `${years(a.tenureYears)} self-employed`
    case "Student":
      return "Studies, works part-time"
    case "Retired":
      return "Receives a pension"
  }
}

export type NotePart = { text: string } | { hidden: HiddenTopic }

/**
 * Step 4 "In their own words": the applicant's cover note, assembled from the
 * demo attributes so it never contradicts them. A passage about origin,
 * religion or health is replaced by a marker before the landlord sees it.
 */
export function coverNote(
  a: Applicant,
  flat: { noun: string; moveIn: string; docsAsked: number },
): NotePart[] {
  const we = a.adults > 1 || a.children > 0
  const I = we ? "We" : "I"
  const people = a.adults + a.children
  const opening =
    a.note.variant === 0
      ? a.children
        ? `We are a family of ${people} and are looking for more space.`
        : we
          ? `We are a couple looking for a ${flat.noun} together.`
          : `I’m looking for a quiet ${flat.noun} close to work.`
      : `${I} ${we ? "are" : "am"} interested in the ${flat.noun} and would love to see it.`

  // A single parent writes "we" but works alone
  const couple = a.adults > 1
  const work = {
    Permanent: couple
      ? `One of us has worked for the same employer for ${years(a.tenureYears)}.`
      : `I have worked for the same employer for ${years(a.tenureYears)}.`,
    "Civil servant": `${couple ? "One of us has" : "I have"} been in public service for ${years(a.tenureYears)}.`,
    "Fixed-term": couple
      ? `One of us has a contract that runs for another ${a.contractMonthsLeft} months.`
      : `My contract runs for another ${a.contractMonthsLeft} months.`,
    "Self employed": `${couple ? "One of us has" : "I have"} been self-employed for ${years(a.tenureYears)}.`,
    Student: couple
      ? "We both study in Berlin and work part-time."
      : "I study in Berlin and work part-time.",
    Retired: `${couple ? "We are" : "I am"} retired and looking for somewhere calm.`,
  }[a.employment]

  const hidden: NotePart[] =
    a.note.hidden === "origin"
      ? [
          { text: `${I} moved to Berlin from ` },
          { hidden: "origin" },
          { text: " a few years ago." },
        ]
      : a.note.hidden === "religion"
        ? [
            { text: `${we ? "We’d" : "I’d"} like to stay close to ` },
            { hidden: "religion" },
            { text: "." },
          ]
        : a.note.hidden === "health"
          ? [
              { text: "Because of " },
              { hidden: "health" },
              { text: ", a lift or a low floor would help." },
            ]
          : []

  const moveIn = a.moveInOk
    ? `${I} can move in from ${flat.moveIn}.`
    : `${I} could move in from ${LATER_MOVE_IN}.`
  const docs = a.docsMissing.length
    ? `${we ? "We’ll" : "I’ll"} send the ${a.docsMissing.map((k) => DOC_LABEL[k]).join(" and ")} shortly.`
    : flat.docsAsked
      ? "All documents are attached."
      : ""

  return [
    { text: `${opening} ${work} ` },
    ...hidden,
    { text: `${hidden.length ? " " : ""}${moveIn}${docs ? ` ${docs}` : ""}` },
  ]
}
