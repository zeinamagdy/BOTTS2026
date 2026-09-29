"use client"

import Image from "next/image"
import Link from "next/link"
import { useState } from "react"
import { ArrowLeftIcon } from "lucide-react"
import { SiteNav } from "@/components/home/site-nav"
import { Divider, eur, Heading, Progress } from "@/components/landlord/parts"
import { Button } from "@/components/ui/button"
import {
  applicantStatus,
  DOC_LABEL,
  householdLabel,
  SHORTLIST,
  type Applicant,
  type ApplicantInbox,
} from "@/lib/applicants"
import {
  DEMO_FLAT,
  flatSettingsToParams,
  INCOME_FACTOR,
  type FlatSettings,
} from "@/lib/landlord"
import { cn } from "@/lib/utils"
import flatPhoto from "../../../public/landlord/flat.jpg"

/** "a", "a and b", "a, b and c" */
const listOf = (items: string[]) =>
  items.length < 2
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`

const PAGE = 10

const FILTERS = [
  { key: "recommended", label: "Recommended" },
  { key: "meets", label: "Met requirements" },
  { key: "check", label: "Need further checks" },
] as const
type FilterKey = (typeof FILTERS)[number]["key"]

function Stat({
  value,
  label,
  accent,
}: {
  value: number
  label: string
  accent?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 sm:gap-5">
      <p
        className={cn(
          "text-4xl leading-[1.1] sm:text-[52px]",
          accent ? "text-brand-600" : "text-heading",
        )}
      >
        {value.toLocaleString("en")}
      </p>
      <p className="text-heading leading-snug">{label}</p>
    </div>
  )
}

// Figma has 7 equal columns with Status spanning 2; weighted ones keep "2 adults, 1 child" on one line
const COLS =
  "sm:grid sm:grid-cols-[1fr_1.4fr_1fr_1.2fr_0.9fr_2fr] sm:gap-x-4 lg:gap-x-6"

function ApplicantRow({
  a,
  rank,
  requiredDocs,
  href,
}: {
  a: Applicant
  rank: number
  href: string
  requiredDocs: number
}) {
  const docsShort = requiredDocs > 0 && a.docsMissing.length > 0
  const cells = [
    { label: "Household", value: householdLabel(a) },
    {
      label: "Income/rent",
      value: a.ratio == null ? "Not stated" : `${a.ratio.toFixed(1)} times`,
      warn: a.ratio == null,
    },
    { label: "Employment", value: a.employment },
    {
      label: "Documents",
      value: requiredDocs
        ? `${requiredDocs - a.docsMissing.length} of ${requiredDocs}`
        : "None asked",
      warn: docsShort,
    },
  ]
  return (
    <li
      className={cn(
        "flex flex-col gap-1 text-lg leading-normal font-medium",
        COLS,
      )}
    >
      <p className="text-muted-foreground flex items-baseline justify-between gap-4 sm:block">
        <Link
          href={href}
          className="hover:text-heading shrink-0 underline-offset-4 hover:underline"
        >
          {a.name}
        </Link>
        <span className="text-brand-700 text-right text-base sm:hidden">
          {applicantStatus(a, rank)}
        </span>
      </p>
      {cells.map((c) => (
        <p
          key={c.label}
          className={cn(
            "text-base sm:text-lg",
            c.warn ? "text-brand-600" : "text-muted-foreground",
          )}
        >
          <span className="text-subtle sm:sr-only">{c.label}: </span>
          {c.value}
        </p>
      ))}
      <p className="text-brand-700 hidden sm:block">
        {applicantStatus(a, rank)}
      </p>
    </li>
  )
}

export function ApplicationsOverview({
  flat,
  street,
  coldRent,
  inbox,
}: {
  flat: FlatSettings
  street: string
  coldRent: number
  inbox: ApplicantInbox
}) {
  const [filter, setFilter] = useState<FilterKey>("recommended")
  const [shown, setShown] = useState(PAGE)
  const noun = flat.type === "house" ? "house" : "flat"

  const rows =
    filter === "recommended"
      ? inbox.meets.slice(0, SHORTLIST)
      : filter === "meets"
        ? inbox.meets
        : inbox.check
  const visible = rows.slice(0, shown)

  return (
    <main className="flex flex-1 flex-col">
      <SiteNav tone="page" audience="landlords" />
      <div className="mx-auto flex w-full max-w-[1184px] flex-col gap-10 px-4 pt-4 pb-16 sm:px-6 sm:pt-8 lg:gap-16">
        <Progress step={2} label="Applications" noun={noun} />

        <div className="flex flex-col gap-10 lg:gap-12">
          <section className="flex flex-col gap-5">
            <div className="bg-chip relative h-56 overflow-hidden rounded-3xl sm:h-[406px]">
              <Image
                src={flatPhoto}
                alt="The demo house in Baumschulenweg, next to a playground"
                fill
                priority
                placeholder="blur"
                sizes="(min-width: 1184px) 1136px, 100vw"
                className="object-cover object-[50%_55%]"
              />
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <p className="text-muted-foreground text-lg leading-normal uppercase">
                  {[
                    street,
                    eur(flat.warmRent),
                    `${flat.rooms} ${flat.rooms === 1 ? "room" : "rooms"}`,
                    `${flat.areaM2} m²`,
                  ].join(" · ")}
                </p>
                <Link
                  href={`/landlord?${flatSettingsToParams(flat)}`}
                  className="text-muted-foreground hover:text-heading flex items-center gap-1.5 text-sm font-medium"
                >
                  <ArrowLeftIcon aria-hidden className="size-4" />
                  Edit the {noun}
                </Link>
              </div>
              <h1 className="text-heading text-4xl leading-[1.1] sm:text-[52px]">
                <span className="text-brand-700">
                  {inbox.received.toLocaleString("en")} applications
                </span>
                . Here’s where they stand.
              </h1>
            </div>
          </section>

          <section className="bg-card flex flex-col gap-10 rounded-3xl p-5 sm:p-10">
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-6 sm:gap-8 lg:grid-cols-4">
                <Stat value={inbox.received} label="applications received" />
                <Stat
                  value={inbox.duplicatesMerged}
                  label="duplicates merged"
                />
                <Stat
                  value={inbox.meets.length}
                  label="meet all your requirements"
                />
                <Stat
                  value={inbox.check.length}
                  label="missing information or need a check"
                  accent
                />
              </div>
              <p className="text-subtle text-sm leading-normal">
                Required: net income ≥ {INCOME_FACTOR} × the cold rent (
                {eur(coldRent * INCOME_FACTOR)}),{" "}
                {flat.docs.length
                  ? listOf(flat.docs.map((k) => DOC_LABEL[k]))
                  : "no documents"}
                , and a move-in from {DEMO_FLAT.moveIn}. Of the{" "}
                {(inbox.received - inbox.duplicatesMerged).toLocaleString("en")}{" "}
                applications left after merging duplicates,{" "}
                {inbox.below.length.toLocaleString("en")} are below the income
                requirement. Dearer listings draw fewer applicants.{" "}
                <span className="text-faint">
                  Demo applications, generated for the pitch. Placeholder names
                  from Berlin’s open list of common first names.
                </span>
              </p>
            </div>

            <Divider />

            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <Heading>
                  {filter === "check" ? "Need a check" : "Top applicants"}
                </Heading>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <p
                    id="applicant-filters"
                    className="text-muted-foreground font-bold"
                  >
                    Filters
                  </p>
                  <div
                    role="radiogroup"
                    aria-labelledby="applicant-filters"
                    className="flex flex-wrap gap-2"
                  >
                    {FILTERS.map((f) => {
                      const on = f.key === filter
                      return (
                        <button
                          key={f.key}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => {
                            setFilter(f.key)
                            setShown(PAGE)
                          }}
                          className={cn(
                            "focus-visible:ring-ring/50 rounded-full border px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-3",
                            on
                              ? "bg-brand-700 border-brand-700 text-brand-100 dark:text-brand-950"
                              : "bg-brand-50 border-brand-50 text-brand-700 hover:bg-brand-100 hover:border-brand-100 dark:hover:bg-brand-950 dark:hover:border-brand-950",
                          )}
                        >
                          {f.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-6">
                <div
                  aria-hidden
                  className={cn(
                    "text-heading hidden text-lg leading-normal font-medium",
                    COLS,
                  )}
                >
                  <p>Applicant</p>
                  <p>Household</p>
                  <p>Income/rent</p>
                  <p>Employment</p>
                  <p>Documents</p>
                  <p>Status</p>
                </div>
                <Divider />
                {visible.length ? (
                  <ul className="flex flex-col gap-6">
                    {visible.map((a, i) => (
                      <ApplicantRow
                        key={a.id}
                        a={a}
                        rank={filter === "check" ? -1 : i}
                        requiredDocs={flat.docs.length}
                        href={`/landlord/applications/${a.id}?${flatSettingsToParams(flat)}&from=applications`}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground text-lg">
                    {filter === "check"
                      ? "Nothing to check: every application is complete."
                      : `No application meets all requirements yet. Try the “Need further checks” filter.`}
                  </p>
                )}
                {rows.length > shown && (
                  <Button
                    variant="ghost"
                    onClick={() => setShown(shown + PAGE)}
                    className="text-brand-700 self-start px-0 text-base font-medium hover:bg-transparent hover:underline"
                  >
                    Show {Math.min(PAGE, rows.length - shown)} more of{" "}
                    {rows.length}
                  </Button>
                )}
              </div>
            </div>

            <p className="text-subtle text-sm font-medium">
              {filter === "check"
                ? "Fewest open points first, then who applied first."
                : "Everyone here clears the bar, so they are listed by who applied first."}{" "}
              Household and employment are shown, never scored. Application data
              is kept only for this letting and deleted 30 days after the {noun}{" "}
              is let.
            </p>

            <Divider />

            <Button
              nativeButton={false}
              render={
                <Link
                  href={`/landlord/shortlist?${flatSettingsToParams(flat)}`}
                />
              }
              className="bg-brand-500 hover:bg-brand-500/90 h-auto w-full rounded-full px-8 py-4 text-lg leading-normal font-bold text-white"
            >
              {inbox.meets.length
                ? `Review the shortlist of ${Math.min(SHORTLIST, inbox.meets.length)}`
                : "Review the shortlist"}
            </Button>
          </section>
        </div>
      </div>
    </main>
  )
}
