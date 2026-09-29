import firstNames from "../../data/derived/berlin-first-names.json"
import {
  DEMO_FLAT,
  DOCUMENTS,
  INCOME_FACTOR,
  type DocumentKey,
} from "@/lib/landlord"

/**
 * Demo applications for the landlord flow (client-safe, deterministic). There is
 * no applicant data in the data repo, so these are generated from a fixed seed:
 * the same flat settings always give the same inbox, which keeps the pitch
 * reproducible. Labelled as demo data in the UI.
 *
 * Only the requirements the landlord set are checked (income ≥ 3 × cold rent,
 * the chosen documents, the move-in date). Household and employment are shown
 * but never scored. The names are placeholders (see `SURNAMES`) and never
 * feed into anything.
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
  /** Placeholder name of the main applicant */
  name: string
  adults: number
  children: number
  employment: Employment
  /** Net household income per month, null when not stated */
  income: number | null
  /** Net income ÷ cold rent */
  ratio: number | null
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
  /** Hours after the listing went online */
  receivedAfterH: number
  bucket: "meets" | "check" | "below"
  /** Years in the current job, business or service (drawn for everyone, shown by employment) */
  tenureYears: number
  /** Which wording of the cover note, and the passage hidden from review (if any) */
  note: { variant: number; hidden: HiddenTopic | null }
  /** Why an application needs a check, shortest first */
  issues: string[]
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

/**
 * Surnames for the placeholder names. Berlin publishes no open surname data, so
 * these are hand-picked: common German surnames (Lehmann and Schulze are Berlin
 * classics) plus common surnames from the countries most Berliners with a
 * foreign citizenship come from (Turkey, Poland, Syria, Ukraine, Russia,
 * Bulgaria, Vietnam, Italy, Romania, Serbia, Lebanon, Afghanistan, India).
 * Only forms that work for any gender (no Polish -ska, no Russian -ova).
 */
const SURNAMES = {
  german: [
    "Müller",
    "Schmidt",
    "Schneider",
    "Fischer",
    "Weber",
    "Meyer",
    "Wagner",
    "Becker",
    "Schulz",
    "Hoffmann",
    "Koch",
    "Richter",
    "Klein",
    "Wolf",
    "Schröder",
    "Neumann",
    "Schwarz",
    "Braun",
    "Zimmermann",
    "Krüger",
    "Hartmann",
    "Lange",
    "Werner",
    "Krause",
    "Lehmann",
    "Schulze",
    "König",
    "Walter",
    "Peters",
    "Möller",
    "Jung",
    "Friedrich",
    "Vogel",
    "Keller",
    "Günther",
    "Frank",
    "Berger",
    "Winkler",
    "Roth",
    "Beck",
    "Lorenz",
    "Baumann",
    "Franke",
    "Albrecht",
    "Voigt",
    "Pohl",
    "Engel",
    "Kühn",
    "Horn",
    "Sommer",
  ],
  other: [
    "Yılmaz",
    "Kaya",
    "Demir",
    "Şahin",
    "Çelik",
    "Öztürk",
    "Arslan",
    "Doğan",
    "Nowak",
    "Kowalczyk",
    "Wójcik",
    "Kamiński",
    "Lewandowski",
    "Haddad",
    "Khalil",
    "Al-Hassan",
    "Nasser",
    "Mansour",
    "Shevchenko",
    "Kovalenko",
    "Bondarenko",
    "Melnyk",
    "Petrenko",
    "Popov",
    "Georgiev",
    "Nguyen",
    "Tran",
    "Pham",
    "Le",
    "Rossi",
    "Russo",
    "Esposito",
    "Popescu",
    "Ionescu",
    "Petrović",
    "Jovanović",
    "Hamdan",
    "Saleh",
    "Ahmadi",
    "Hosseini",
    "Patel",
    "Sharma",
    "García",
    "Kim",
    "Chen",
    "Silva",
    "Novak",
    "Horvat",
  ],
}
/** Share of surnames from the second list, near Berlin's ~40% with a migration background */
const OTHER_SURNAME_SHARE = 0.4

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

export function buildInbox({
  coldRent,
  warmRent,
  docs,
}: {
  coldRent: number
  warmRent: number
  docs: readonly DocumentKey[]
}): ApplicantInbox {
  const r = rng(2026)
  const minIncome = coldRent * INCOME_FACTOR
  const { total, duplicates } = inboxSize(warmRent)
  const incomeScale =
    warmRent > 0 ? (warmRent / DEMO_FLAT.warmRent) ** INCOME_SELF_SELECTION : 1
  const unique = total - duplicates
  const all: Applicant[] = []
  // Own stream, so the names don't shift the other attributes
  const nr = rng(4711)
  // Attributes added for the shortlist (step 3) draw from a third stream, for the same reason
  const xr = rng(1312)
  // Step 4 (the single application) draws from a fourth stream: 3 draws per applicant
  const dr = rng(1520)
  const usedNames = new Set<string>()
  const drawName = () => {
    for (;;) {
      const first = nr() < 0.5 ? firstNames.female : firstNames.male
      const last = nr() < OTHER_SURNAME_SHARE ? SURNAMES.other : SURNAMES.german
      const name = `${first[Math.floor(nr() * first.length)]} ${last[Math.floor(nr() * last.length)]}`
      if (!usedNames.has(name)) return (usedNames.add(name), name)
    }
  }

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
    const docsMissing = docs.filter((k) => !docsProvided.includes(k))
    const moveInOk = r() < 0.9
    const ratio = income == null || !coldRent ? null : income / coldRent
    const tenureYears = 1 + Math.floor(dr() * 14)
    const variant = Math.floor(dr() * 2)
    const hiddenDraw = dr()

    const issues = [
      ...(income == null ? ["Income not stated"] : []),
      ...(docsMissing.length
        ? [`Missing ${docsMissing.map((k) => DOC_LABEL[k]).join(", ")}`]
        : []),
      ...(moveInOk ? [] : ["Later move-in"]),
      ...(consistent ? [] : ["Income differs from the payslips"]),
    ]
    const bucket =
      income != null && income < minIncome
        ? "below"
        : issues.length
          ? "check"
          : "meets"

    all.push({
      id: `a${i}`,
      name: drawName(),
      adults,
      children,
      employment,
      income,
      ratio,
      docsProvided,
      docsMissing,
      taxAssessment,
      contractMonthsLeft,
      consistent,
      moveInOk,
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

  // First come, first served among those who qualify: ranking by income would
  // always shortlist the richest household, although income only has to clear the bar
  const byTime = (a: Applicant, b: Applicant) =>
    a.receivedAfterH - b.receivedAfterH
  const meets = all.filter((a) => a.bucket === "meets").sort(byTime)
  // Fewest open points first: those are the quickest to settle
  const check = all
    .filter((a) => a.bucket === "check")
    .sort((a, b) => a.issues.length - b.issues.length || byTime(a, b))
  const below = all.filter((a) => a.bucket === "below").sort(byTime)

  return { received: total, duplicatesMerged: duplicates, meets, check, below }
}

export function householdLabel(a: Pick<Applicant, "adults" | "children">) {
  const adults = `${a.adults} ${a.adults === 1 ? "adult" : "adults"}`
  if (!a.children) return adults
  return `${adults}, ${a.children} ${a.children === 1 ? "child" : "children"}`
}

/** How many qualified applicants the overview recommends and step 3 shortlists */
export const SHORTLIST = 3

/** Status line of steps 2 and 4; `rank` is the place among the qualified (-1 otherwise) */
export function applicantStatus(a: Applicant, rank: number) {
  if (a.bucket === "meets")
    return rank === 0
      ? "Top candidate"
      : rank < SHORTLIST
        ? "Recommended for review"
        : "Meets requirements"
  if (a.bucket === "below") return "Below the income requirement"
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
  const lowest = Math.min(...shortlist.map((a) => a.ratio ?? Infinity))
  return shortlist.map((a) => {
    const reasons: string[] = []
    const toCheck: string[] = []
    if (a.ratio != null)
      reasons.push(
        `Affordability threshold met: income is ${a.ratio.toFixed(1)} times the cold rent`,
      )
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
    if (a.employment === "Student")
      toCheck.push("Student: ask whether there is a guarantor")

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

    if (shortlist.length > 1 && a.ratio === lowest)
      toCheck.push(
        `Closest of the ${shortlist.length === 2 ? "two" : shortlist.length === 3 ? "three" : shortlist.length} to the affordability threshold`,
      )
    return { applicant: a, reasons, toCheck }
  })
}

/** The move-in the applicants who can't make the flat's date offer instead */
export const LATER_MOVE_IN = "1 Feb 2027"

const years = (n: number) => `${n} ${n === 1 ? "year" : "years"}`

/** Step 4 "In detail": the one fact about the income source that matters most */
export function tenureLabel(a: Applicant) {
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
