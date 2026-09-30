/**
 * Tenant criteria a landlord may not set, or should set differently (client-safe).
 * A fixed, reviewed list of phrasings, matched word for word: no model, so it
 * can't be talked round and every match can be traced to a line here. Ported
 * from the data repo's `landlord-illegal-criteria.ts`, with German phrasings
 * added. Product policy, not a legal opinion: whether the AGG applies depends
 * on the letting (§ 19 AGG). A text that matches nothing is not cleared.
 */

export type CriterionCategory = {
  key: string
  label: string
  /** Lower-case examples, English and German; matched as whole words */
  phrasings: string[]
  basis: string
  /** refuse: we won't apply it; redirect: there is a fair way to get what the landlord wants */
  action: "refuse" | "redirect"
  alternative: string | null
}

const AGG =
  "AGG §§ 1, 2(1) no. 8 and 19 protect access to housing from discrimination on this ground, within the statute’s scope."

export const TENANT_CRITERIA: CriterionCategory[] = [
  {
    key: "origin",
    label: "Ethnic origin",
    phrasings: [
      "no foreigners",
      "german tenants only",
      "only german tenants",
      "germans only",
      "no immigrants",
      "no refugees",
      "german names only",
      "no turkish",
      "no arabs",
      "no africans",
      "keine ausländer",
      "keine auslaender",
      "nur deutsche",
      "nur deutsche mieter",
      "keine flüchtlinge",
      "keine migranten",
      "keine türken",
      "keine araber",
      "nur deutsche namen",
    ],
    basis: `${AGG} Ethnic origin is protected for every letting, whatever the landlord’s size.`,
    action: "refuse",
    alternative: null,
  },
  {
    key: "religion",
    label: "Religion or belief",
    phrasings: [
      "christian tenants only",
      "christians only",
      "no muslims",
      "no muslim tenants",
      "no jewish tenants",
      "no jews",
      "no headscarves",
      "no headscarf",
      "nur christen",
      "keine muslime",
      "keine juden",
      "kein kopftuch",
      "keine kopftücher",
    ],
    basis: AGG,
    action: "refuse",
    alternative: null,
  },
  {
    key: "disability",
    label: "Disability",
    phrasings: [
      "no disabled tenants",
      "no disabled",
      "able bodied tenants only",
      "no wheelchair users",
      "no wheelchairs",
      "keine behinderten",
      "keine rollstuhlfahrer",
      "keine menschen mit behinderung",
    ],
    basis: AGG,
    action: "refuse",
    alternative: null,
  },
  {
    key: "age",
    label: "Age",
    phrasings: [
      "young professionals only",
      "no pensioners",
      "no retirees",
      "no elderly",
      "under 30 only",
      "under 40 only",
      "keine rentner",
      "keine senioren",
      "nur junge leute",
      "nur junge mieter",
      "unter 40",
    ],
    basis: AGG,
    action: "refuse",
    alternative: null,
  },
  {
    key: "gender",
    label: "Sex, gender or sexual orientation",
    phrasings: [
      "no gay",
      "no gays",
      "no lesbians",
      "no trans",
      "heterosexual couples only",
      "women only",
      "men only",
      "no men",
      "no women",
      "keine schwulen",
      "keine lesben",
      "nur frauen",
      "nur männer",
      "keine männer",
      "keine frauen",
    ],
    basis: AGG,
    action: "refuse",
    alternative: null,
  },
  {
    key: "language",
    label: "Language or passport as a stand-in for origin",
    phrasings: [
      "fluent german required",
      "must speak fluent german",
      "native german speakers only",
      "german speakers only",
      "german passport required",
      "german citizens only",
      "fließend deutsch",
      "fliessend deutsch",
      "muttersprache deutsch",
      "deutsche muttersprachler",
      "nur deutsche staatsbürger",
      "deutscher pass",
      "deutsche staatsangehörigkeit",
    ],
    basis: `${AGG} Language and passport rules often act as a stand-in for ethnic origin.`,
    action: "refuse",
    alternative: null,
  },
  {
    key: "family",
    label: "Excluding households with children, or by family type",
    phrasings: [
      "no kids",
      "no children",
      "no families",
      "no families with kids",
      "no families with children",
      "child free",
      "singles only",
      "couples only",
      "keine kinder",
      "keine familien",
      "kinderlos",
      "nur singles",
      "nur paare",
      "ohne kinder",
    ],
    basis:
      "KiezKiss policy: no household type is excluded. Whether a household fits the flat is a question of rooms, which you set above.",
    action: "redirect",
    alternative:
      "Set the room count accurately. We show how many people each household has next to the rooms, never as a filter.",
  },
  {
    key: "employment",
    label: "Excluding a type of employment or income",
    phrasings: [
      "permanent contract only",
      "permanent job required",
      "permanent employment only",
      "no freelancers",
      "no self employed",
      "no students",
      "no unemployed",
      "no benefits",
      "no jobcenter",
      "employed only",
      "nur festanstellung",
      "nur unbefristet",
      "unbefristeter arbeitsvertrag",
      "keine freiberufler",
      "keine selbstständigen",
      "keine selbststaendigen",
      "keine studenten",
      "keine studierenden",
      "keine arbeitslosen",
      "kein bürgergeld",
      "kein jobcenter",
    ],
    basis:
      "KiezKiss policy: financial security has four equal routes, so no type of work or income is a gate on its own.",
    action: "redirect",
    alternative:
      "Set the income multiple above instead. A guarantor, deposit insurance or three months’ rent in savings count the same as income.",
  },
]

/** Lower-case, umlauts spelled out (ä → ae), punctuation to spaces, padded for whole-word matching */
function normalize(text: string) {
  const s = text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
  return ` ${s} `
}

const INDEX = TENANT_CRITERIA.map((c) => ({
  category: c,
  phrasings: c.phrasings.map(normalize),
}))

export type CriterionMatch = { category: CriterionCategory; phrase: string }

/** Every category the text matches, with the first phrasing that matched. Empty is not legal clearance */
export function checkTenantCriteria(text: string): CriterionMatch[] {
  const t = normalize(text)
  if (!t.trim()) return []
  return INDEX.flatMap(({ category, phrasings }) => {
    const i = phrasings.findIndex((p) => t.includes(p))
    return i < 0 ? [] : [{ category, phrase: category.phrasings[i] }]
  })
}
