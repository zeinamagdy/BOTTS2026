"use client"

import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import {
  ArrowLeftIcon,
  DicesIcon,
  LockIcon,
  ShieldCheckIcon,
} from "lucide-react"
import { toast } from "sonner"
import {
  commitFairPickAction,
  revealFairPickAction,
  type FairPickCommit,
} from "@/app/landlord/actions"
import { SiteNav } from "@/components/home/site-nav"
import { FairnessAuditPanel } from "@/components/landlord/fairness-audit-panel"
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
import type { FairnessAudit } from "@/lib/fairness-audit"
import {
  DEMO_FLAT,
  flatSettingsToParams,
  SAVINGS_MONTHS,
  WELCOME,
  type FinancialRoute,
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

/** Short route names for the table */
const ROW_ROUTE: Record<FinancialRoute, string> = {
  income: "income",
  guarantor: "guarantor",
  depositInsurance: "deposit insurance",
  savings: "savings",
}

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
  "sm:grid sm:grid-cols-[1.2fr_1.4fr_1fr_1.2fr_0.9fr_2fr] sm:gap-x-4 lg:gap-x-6"

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
      value: [
        a.ratio == null ? "Not stated" : `${a.ratio.toFixed(1)} times`,
        // Qualifies another way: say which
        ...(a.routes.length && !a.routes.includes("income")
          ? [ROW_ROUTE[a.routes[0]]]
          : []),
      ].join(" · "),
      warn: a.ratio == null && !a.routes.length,
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
      <p className="text-muted-foreground flex min-w-0 items-baseline justify-between gap-4 sm:block">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            href={href}
            className="hover:text-heading underline-offset-4 hover:underline"
          >
            {a.name}
          </Link>
          {a.submitted && (
            <span className="bg-brand-500 rounded-full px-2 py-0.5 text-xs font-bold text-white">
              New
            </span>
          )}
        </span>
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

const short = (hash: string) => `${hash.slice(0, 12)}…${hash.slice(-6)}`

/**
 * Fair Pick (lib/fair-pick.ts): commit to a random seed by showing its hash,
 * then reveal it. The revealed seed goes into the URL, so the order is
 * reproducible and anyone can check it.
 */
function FairPick({
  flat,
  qualified,
  draw,
}: {
  flat: FlatSettings
  qualified: number
  draw: { seed: string; seedHash: string; pool: string } | null
}) {
  const router = useRouter()
  const [commit, setCommit] = useState<Extract<
    FairPickCommit,
    { ok: true }
  > | null>(null)
  const [busy, start] = useTransition()
  const query = flatSettingsToParams({ ...flat, seed: undefined })

  if (draw)
    return (
      <div className="bg-secondary flex flex-col gap-3 rounded-2xl p-5 text-sm leading-normal">
        <p className="text-heading flex items-center gap-2 text-base font-bold">
          <ShieldCheckIcon aria-hidden className="text-brand-600 size-5" />
          Fair Pick drawn among {qualified.toLocaleString("en")} qualifying{" "}
          {qualified === 1 ? "household" : "households"}
        </p>
        <p className="text-foreground">
          Seed <code className="break-all">{draw.seed}</code>
        </p>
        <p className="text-foreground">
          SHA-256 of the seed <code className="break-all">{draw.seedHash}</code>
          {commit &&
            (commit.hash === draw.seedHash
              ? " · matches the hash committed before the draw ✓"
              : " · does not match the commitment")}
        </p>
        <p className="text-subtle">
          The order is every qualifying application id sorted by
          SHA-256(seed:id). Check the hash yourself with{" "}
          <code>echo -n SEED | shasum -a 256</code>. In a live listing the hash
          goes to every applicant before the draw, so redrawing would show.
        </p>
      </div>
    )

  return (
    <div className="bg-secondary flex flex-col gap-4 rounded-2xl p-5 leading-normal">
      <div className="flex flex-col gap-1">
        <p className="text-heading flex items-center gap-2 text-lg font-bold">
          <DicesIcon aria-hidden className="text-brand-600 size-5" />
          Fair Pick
        </p>
        <p className="text-foreground">
          {qualified
            ? `${qualified.toLocaleString("en")} ${qualified === 1 ? "household meets" : "households meet"} every requirement you set. Instead of ranking them by a hidden score, a random draw decides who is shortlisted, and anyone can check it wasn’t rigged.`
            : "Nobody meets every requirement yet, so there is nothing to draw."}
        </p>
      </div>
      {commit && (
        <p className="text-foreground flex items-start gap-2 text-sm">
          <LockIcon
            aria-hidden
            className="text-brand-600 mt-0.5 size-4 shrink-0"
          />
          <span>
            Committed at{" "}
            {new Date(commit.committedAt).toLocaleTimeString("en-GB")}: the seed
            is fixed and hidden, its SHA-256 is{" "}
            <code className="break-all">{short(commit.hash)}</code>. Pool of{" "}
            {commit.poolSize.toLocaleString("en")}, fingerprint{" "}
            <code>{short(commit.pool)}</code>.
          </span>
        </p>
      )}
      {qualified > 0 && (
        <Button
          type="button"
          disabled={busy}
          onClick={() =>
            start(async () => {
              if (!commit) {
                const res = await commitFairPickAction(query)
                if (res.ok) setCommit(res)
                else toast.error(res.error)
                return
              }
              const res = await revealFairPickAction({
                hash: commit.hash,
                query,
              })
              if (!res.ok) {
                setCommit(null)
                toast.error(res.error)
                return
              }
              router.replace(
                `/landlord/applications?${flatSettingsToParams({ ...flat, seed: res.seed })}`,
                { scroll: false },
              )
            })
          }
          className="bg-brand-500 hover:bg-brand-500/90 h-auto self-start rounded-full px-6 py-3 text-base font-bold text-white"
        >
          {busy
            ? commit
              ? "Drawing…"
              : "Committing…"
            : commit
              ? "Reveal the seed and draw"
              : "1. Commit to a random seed"}
        </Button>
      )}
    </div>
  )
}

export function ApplicationsOverview({
  flat,
  street,
  coldRent,
  inbox,
  submitted,
  draw,
  audit,
}: {
  flat: FlatSettings
  street: string
  coldRent: number
  inbox: ApplicantInbox
  /** Sent through /apply; also inside `inbox` */
  submitted: Applicant[]
  draw: { seed: string; seedHash: string; pool: string } | null
  audit: FairnessAudit
}) {
  const [filter, setFilter] = useState<FilterKey>("recommended")
  const [shown, setShown] = useState(PAGE)
  const noun = flat.type === "house" ? "house" : "flat"

  const rows =
    filter === "recommended"
      ? draw
        ? inbox.meets.slice(0, SHORTLIST)
        : []
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
                Required: net income ≥ {flat.incomeMultiple} × the cold rent (
                {eur(coldRent * flat.incomeMultiple)}) or a guarantor, deposit
                insurance or {SAVINGS_MONTHS} months’ rent in savings,{" "}
                {flat.docs.length
                  ? listOf(flat.docs.map((k) => DOC_LABEL[k]))
                  : "no documents"}
                {flat.nonSmoking ? ", a non-smoking household" : ""}, and a
                move-in from {DEMO_FLAT.moveIn}. Of the{" "}
                {(inbox.received - inbox.duplicatesMerged).toLocaleString("en")}{" "}
                applications left after merging duplicates,{" "}
                {inbox.below.length.toLocaleString("en")} meet none of the
                financial routes. Dearer listings draw fewer applicants.{" "}
                <span className="text-faint">
                  Demo applications, generated for the pitch. Nobody is shown by
                  name, including those sent through KiezKiss: a name can hint
                  at origin, so it can’t sway the review.
                </span>
              </p>
              {flat.welcome.length > 0 && (
                <p className="text-subtle text-sm leading-normal">
                  Your ad says welcome:{" "}
                  {listOf(
                    WELCOME.filter((w) => flat.welcome.includes(w.key)).map(
                      (w) => w.label.toLowerCase(),
                    ),
                  )}
                  . That never filters or changes anyone’s chance in the draw.
                </p>
              )}
            </div>

            {submitted.length > 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-heading font-bold">
                  {submitted.length === 1
                    ? "1 application"
                    : `${submitted.length} applications`}{" "}
                  sent through KiezKiss, checked like all the others
                </p>
                <ul className="flex flex-col gap-2">
                  {submitted.slice(0, 5).map((a) => (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
                    >
                      <Link
                        href={`/landlord/applications/${a.id}?${flatSettingsToParams(flat)}&from=applications`}
                        className="text-heading font-medium underline-offset-4 hover:underline"
                      >
                        {a.name}
                      </Link>
                      <span className="text-muted-foreground text-sm">
                        {householdLabel(a)} ·{" "}
                        {a.bucket === "meets"
                          ? draw
                            ? (() => {
                                const place = inbox.meets.findIndex(
                                  (x) => x.id === a.id,
                                )
                                return place < SHORTLIST
                                  ? `drawn #${place + 1}, on the shortlist`
                                  : `in the draw, #${place + 1} of ${inbox.meets.length}`
                              })()
                            : "meets every requirement, in the Fair Pick pool"
                          : applicantStatus(a, -1)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <FairPick flat={flat} qualified={inbox.meets.length} draw={draw} />
            <FairnessAuditPanel audit={audit} />

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
                        rank={filter === "check" || !draw ? -1 : i}
                        requiredDocs={flat.docs.length}
                        href={`/landlord/applications/${a.id}?${flatSettingsToParams(flat)}&from=applications`}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground text-lg">
                    {filter === "check"
                      ? "Nothing to check: every application is complete."
                      : !inbox.meets.length
                        ? `No application meets all requirements yet. Try the “Need further checks” filter.`
                        : "Run Fair Pick above to draw who is recommended."}
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
                : draw
                  ? "Everyone here clears the bar, so the Fair Pick draw sets the order."
                  : "Everyone here clears the bar. They are listed by who applied first until you run Fair Pick."}{" "}
              Household and employment are shown, never scored. Application data
              is kept only for this letting and deleted 30 days after the {noun}{" "}
              is let.
            </p>

            <Divider />

            {draw ? (
              <Button
                nativeButton={false}
                render={
                  <Link
                    href={`/landlord/shortlist?${flatSettingsToParams(flat)}`}
                  />
                }
                className="bg-brand-500 hover:bg-brand-500/90 h-auto w-full rounded-full px-8 py-4 text-lg leading-normal font-bold text-white"
              >
                {`Review the shortlist of ${Math.min(SHORTLIST, inbox.meets.length)}`}
              </Button>
            ) : (
              <Button
                type="button"
                disabled
                className="bg-brand-500 h-auto w-full rounded-full px-8 py-4 text-lg leading-normal font-bold text-white"
              >
                {inbox.meets.length
                  ? "Run Fair Pick to draw the shortlist"
                  : "Nobody to shortlist yet"}
              </Button>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
