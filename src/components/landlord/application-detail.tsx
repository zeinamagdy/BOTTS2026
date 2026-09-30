"use client"

import Link from "next/link"
import { Fragment, useState } from "react"
import { ArrowLeftIcon, CheckIcon, EyeOffIcon } from "lucide-react"
import { toast } from "sonner"
import { SiteNav } from "@/components/home/site-nav"
import { Divider, eur, Progress } from "@/components/landlord/parts"
import { Button } from "@/components/ui/button"
import {
  DOC_LABEL,
  householdLabel,
  ROUTE_LABEL,
  LATER_MOVE_IN,
  type Applicant,
  type NotePart,
} from "@/lib/applicants"
import {
  DEMO_FLAT,
  flatSettingsToParams,
  type FlatSettings,
} from "@/lib/landlord"
import { cn } from "@/lib/utils"

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <p className="text-muted-foreground">{label}</p>
      <p className="text-heading text-2xl leading-[1.1] sm:text-[35px]">
        {value}
      </p>
    </div>
  )
}

function decisionText(a: Applicant, shortlisted: boolean) {
  if (a.bucket === "meets")
    return shortlisted
      ? "This applicant is recommended for review. Every requirement you set is met."
      : "Every requirement you set is met. It isn’t among the first Fair Pick drew for the shortlist (or you haven’t drawn yet)."
  if (a.bucket === "below")
    return "No route to financial security is met yet: income, a guarantor, deposit insurance or savings. Nobody is rejected automatically, so the decision stays yours."
  return "Some points are open. Settle them before you decide; nobody is rejected automatically."
}

export function ApplicationDetail({
  flat,
  from,
  applicant: a,
  status,
  shortlisted,
  reasons,
  toCheck,
  tenure,
  note,
}: {
  flat: FlatSettings
  from: "shortlist" | "applications"
  applicant: Applicant
  status: string
  shortlisted: boolean
  reasons: string[]
  toCheck: string[]
  tenure: string
  note: NotePart[]
}) {
  const [invited, setInvited] = useState(false)
  const [saved, setSaved] = useState(false)
  const back = `/landlord/${from}?${flatSettingsToParams(flat)}`

  const askFor = [
    ...a.docsMissing.map((k) => `the ${DOC_LABEL[k]}`),
    ...(a.income == null ? ["the net income"] : []),
    ...(a.employment === "Self employed" && !a.taxAssessment
      ? ["the latest tax assessment"]
      : []),
    ...(a.routes.length
      ? []
      : ["a guarantor, deposit insurance or proof of savings"]),
  ]

  return (
    <main className="flex flex-1 flex-col">
      <SiteNav tone="page" audience="landlords" />
      <div className="mx-auto flex w-full max-w-[1184px] flex-col gap-8 px-4 pt-4 pb-16 sm:px-6 sm:pt-8">
        <div className="flex flex-col gap-10 lg:gap-16">
          <Progress step={4} label="Application" noun={flat.type} />
          <Link
            href={back}
            className="text-muted-foreground hover:text-heading flex items-center gap-4 self-start text-lg font-medium"
          >
            <ArrowLeftIcon aria-hidden className="size-6" />
            {from === "shortlist"
              ? "Back to Shortlist"
              : "Back to all applications"}
          </Link>
        </div>

        <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
          <article className="bg-card flex min-w-0 flex-col gap-10 rounded-3xl p-5 sm:p-10 lg:w-[649px] lg:shrink-0">
            <header className="flex flex-col gap-4">
              <h1 className="text-heading text-4xl leading-[1.1] sm:text-[52px]">
                {a.name}
              </h1>
              <p className="text-muted-foreground text-lg leading-normal">
                {householdLabel(a)} · {status}
              </p>
            </header>
            <Divider />

            <div className="flex flex-col gap-6">
              <div className="flex gap-5">
                <Fact label="Household" value={householdLabel(a)} />
                <Fact
                  label="Net income"
                  value={a.income == null ? "Not stated" : eur(a.income)}
                />
              </div>
              <Divider />
              <div className="flex gap-5">
                <Fact
                  label="Income to cold rent"
                  value={
                    a.ratio == null
                      ? "Not stated"
                      : `${a.ratio.toFixed(1)} times`
                  }
                />
                <Fact label="Employment" value={a.employment} />
              </div>
              <Divider />
              <div className="flex gap-5">
                <Fact label="In detail" value={tenure} />
                <Fact
                  label="Move-in"
                  value={a.moveInOk ? DEMO_FLAT.moveIn : LATER_MOVE_IN}
                />
              </div>
              <Divider />
              <div className="flex gap-5">
                <Fact
                  label="Financial security"
                  value={
                    a.routes.length
                      ? `Through ${a.routes.map((r) => ROUTE_LABEL[r]).join(", ")}`
                      : "No route met yet"
                  }
                />
                <Fact
                  label="Savings"
                  value={a.savings ? eur(a.savings) : "None stated"}
                />
              </div>
              <Divider />
              <div className="flex gap-5">
                <Fact
                  label="Smoking"
                  value={
                    a.smoker == null
                      ? "Not stated"
                      : a.smoker
                        ? "Someone smokes"
                        : "Non-smoking household"
                  }
                />
                <Fact
                  label="Documents"
                  value={
                    flat.docs.length
                      ? `${flat.docs.length - a.docsMissing.length} of ${flat.docs.length}`
                      : "None asked"
                  }
                />
              </div>
            </div>
            <Divider />

            <section className="flex flex-col gap-5">
              <h2 className="text-heading text-2xl leading-[1.1] font-medium sm:text-[28px]">
                In their own words
              </h2>
              <p className="text-muted-foreground">
                {a.submitted
                  ? `Their cover letter, sent ${new Date(a.submitted.appliedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} through KiezKiss. Their name is hidden, as for every applicant; you get it when you invite them. The letter is never part of the checks or the draw.`
                  : "Parts that could reveal protected characteristics are hidden from review."}
              </p>
              <blockquote className="border-brand-500 text-heading border-l-4 py-1 pl-6 text-lg leading-normal whitespace-pre-line sm:pl-8">
                {note.map((p, i) =>
                  "text" in p ? (
                    <Fragment key={i}>{p.text}</Fragment>
                  ) : (
                    <span
                      key={i}
                      className="bg-chip text-subtle mx-0.5 inline-flex items-center gap-1 rounded-md px-2 align-baseline text-sm font-medium"
                    >
                      <EyeOffIcon aria-hidden className="size-3.5" />
                      hidden: may reveal {p.hidden}
                    </span>
                  ),
                )}
              </blockquote>
            </section>

            <Button
              type="button"
              variant="outline"
              onClick={() =>
                toast(`Question sent to ${a.name}`, {
                  description: `Demo only: no message is sent. We’d ask for ${
                    askFor.length
                      ? askFor.join(", ")
                      : "anything you want to know before the viewing"
                  }.`,
                })
              }
              className="border-brand-500 text-brand-500 hover:bg-brand-50 hover:text-brand-600 dark:border-brand-500 h-[71px] w-full rounded-full border-2 bg-transparent px-8 text-lg font-bold dark:bg-transparent"
            >
              Ask for more information
            </Button>
          </article>

          <aside className="bg-panel text-panel-foreground flex flex-col gap-10 rounded-3xl p-5 sm:p-10 lg:sticky lg:top-8 lg:flex-1">
            <div className="flex flex-col gap-4">
              <h2 className="text-2xl leading-[1.1] sm:text-[35px]">
                Your decision
              </h2>
              <p className="text-panel-muted text-lg leading-normal">
                {decisionText(a, shortlisted)}
              </p>
            </div>

            {(toCheck.length > 0 || reasons.length > 0) && (
              <div className="flex flex-col gap-5">
                {toCheck.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h3 className="font-medium">To check</h3>
                    <ul className="text-panel-muted flex list-disc flex-col gap-1.5 pl-5">
                      {toCheck.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {reasons.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h3 className="font-medium">In favour</h3>
                    <ul className="text-panel-muted flex list-disc flex-col gap-1.5 pl-5">
                      {reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-4">
              <Button
                type="button"
                disabled={invited}
                onClick={() => {
                  setInvited(true)
                  toast(`${a.name} is invited`, {
                    description:
                      "Demo only: no message is sent. They would pick a viewing slot.",
                  })
                }}
                className={cn(
                  "h-[59px] w-full rounded-full px-8 text-lg font-bold",
                  invited
                    ? "bg-brand-100 text-brand-950 disabled:opacity-100"
                    : "bg-brand-500 hover:bg-brand-500/90 text-white",
                )}
              >
                {invited ? (
                  <>
                    <CheckIcon aria-hidden className="size-5" /> Invited to a
                    viewing
                  </>
                ) : (
                  "Invite to a viewing"
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                aria-pressed={saved}
                onClick={() => {
                  setSaved(!saved)
                  if (!saved)
                    toast(`${a.name} is saved for later`, {
                      description: "Demo only: kept for this session.",
                    })
                }}
                className="text-panel-foreground hover:text-panel-foreground h-[59px] w-full rounded-full px-8 text-lg font-bold hover:bg-white/10 dark:hover:bg-white/10"
              >
                {saved ? (
                  <>
                    <CheckIcon aria-hidden className="size-5" /> Saved for later
                  </>
                ) : (
                  "Save for later"
                )}
              </Button>
            </div>
          </aside>
        </div>

        <p className="text-subtle text-sm font-medium">
          {a.submitted
            ? "Sent through KiezKiss. Shown without a name, like every applicant."
            : "Demo application, generated for the pitch. Shown without a name, like every applicant."}{" "}
          Household and employment are shown, never scored.
        </p>
      </div>
    </main>
  )
}
