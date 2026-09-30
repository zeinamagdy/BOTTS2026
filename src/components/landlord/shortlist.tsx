"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowLeftIcon, CheckIcon } from "lucide-react"
import { toast } from "sonner"
import { SiteNav } from "@/components/home/site-nav"
import { Divider, Progress } from "@/components/landlord/parts"
import { Button } from "@/components/ui/button"
import { householdLabel, type explainShortlist } from "@/lib/applicants"
import { flatSettingsToParams, type FlatSettings } from "@/lib/landlord"
import { cn } from "@/lib/utils"

type Card = ReturnType<typeof explainShortlist>[number]

const COUNT_WORD = ["No one", "This one", "These two", "These three"]

function ApplicantCard({
  card: { applicant: a, reasons, toCheck },
  href,
  invited,
  onInvite,
}: {
  card: Card
  href: string
  invited: boolean
  onInvite: () => void
}) {
  return (
    <article className="flex flex-1 flex-col justify-between gap-10">
      <div className="flex flex-col gap-7">
        <div className="flex flex-col gap-3.5">
          <h2 className="text-heading text-3xl leading-[1.1] sm:text-[35px]">
            {a.name}
          </h2>
          <p className="text-muted-foreground">{householdLabel(a)}</p>
        </div>
        <Divider />
        <ul className="flex flex-col gap-4">
          {reasons.map((r, i) => (
            <li key={r} className="flex flex-col gap-4">
              {i > 0 && <Divider />}
              <p className="text-foreground text-lg leading-normal">{r}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-10">
        <div className="flex flex-col gap-3">
          <h3 className="text-subtle text-lg leading-normal">To check</h3>
          {toCheck.length ? (
            <ul className="text-foreground flex flex-col gap-1.5">
              {toCheck.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          ) : (
            <p className="text-foreground">Nothing outstanding</p>
          )}
        </div>
        <div className="flex flex-col gap-4">
          <Button
            type="button"
            onClick={onInvite}
            disabled={invited}
            className={cn(
              "h-[59px] w-full rounded-full px-8 text-lg font-bold",
              invited
                ? "bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-200 disabled:opacity-100"
                : "bg-brand-500 hover:bg-brand-500/90 text-white",
            )}
          >
            {invited ? (
              <>
                <CheckIcon aria-hidden className="size-5" /> Invited
              </>
            ) : (
              "Invite to viewing"
            )}
          </Button>
          <Button
            variant="ghost"
            nativeButton={false}
            render={<Link href={href} />}
            className="text-brand-950 dark:text-brand-200 h-[59px] w-full rounded-full px-8 text-lg font-bold"
          >
            Open application
          </Button>
        </div>
      </div>
    </article>
  )
}

export function Shortlist({
  flat,
  qualified,
  drawn,
  cards,
}: {
  flat: FlatSettings
  qualified: number
  drawn: boolean
  cards: Card[]
}) {
  const [invited, setInvited] = useState<string[]>([])
  const back = `/landlord/applications?${flatSettingsToParams(flat)}`

  return (
    <main className="flex flex-1 flex-col">
      <SiteNav tone="page" audience="landlords" />
      <div className="mx-auto flex w-full max-w-[1184px] flex-col gap-10 px-4 pt-4 pb-16 sm:px-6 sm:pt-8 lg:gap-16">
        <Progress step={3} label="Shortlist" noun={flat.type} />

        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <p className="text-subtle font-medium">Short listed candidates</p>
            <Link
              href={back}
              className="text-muted-foreground hover:text-heading flex items-center gap-1.5 text-sm font-medium"
            >
              <ArrowLeftIcon aria-hidden className="size-4" />
              All applications
            </Link>
          </div>
          <h1 className="text-heading text-4xl leading-[1.1] sm:text-[52px]">
            Recommended for review.
          </h1>
          <p className="text-muted-foreground max-w-[560px] text-lg leading-normal">
            {cards.length
              ? `${COUNT_WORD[cards.length] ?? `These ${cards.length}`} ${cards.length === 1 ? "meets" : "meet"} every requirement you set${qualified > cards.length ? `, and ${cards.length === 1 ? "was" : "were"} drawn first by Fair Pick from the ${qualified} who do` : ""}. We explain why; you decide who to invite. Nobody is rejected automatically.`
              : !drawn && qualified
                ? `${qualified.toLocaleString("en")} applicants meet every requirement. Run Fair Pick in the overview to draw who is shortlisted.`
                : "Nobody meets every requirement yet. Nobody is rejected automatically: the applications that need a check are still waiting in the overview."}
          </p>
        </section>

        {cards.length > 0 ? (
          <section className="bg-card grid gap-10 rounded-3xl p-5 sm:p-10 lg:grid-cols-3 lg:gap-16">
            {cards.map((c, i) => (
              <div key={c.applicant.id} className="flex flex-col gap-10">
                {i > 0 && (
                  <div className="lg:hidden">
                    <Divider />
                  </div>
                )}
                <ApplicantCard
                  card={c}
                  href={`/landlord/applications/${c.applicant.id}?${flatSettingsToParams(flat)}`}
                  invited={invited.includes(c.applicant.id)}
                  onInvite={() => {
                    setInvited((prev) => [...prev, c.applicant.id])
                    toast(`${c.applicant.name} is invited`, {
                      description:
                        "Demo only: no message is sent. They would pick a viewing slot.",
                    })
                  }}
                />
              </div>
            ))}
          </section>
        ) : (
          <Button
            nativeButton={false}
            render={<Link href={back} />}
            className="bg-brand-500 hover:bg-brand-500/90 h-auto self-start rounded-full px-8 py-4 text-lg font-bold text-white"
          >
            Back to all applications
          </Button>
        )}

        <p className="text-subtle text-sm font-medium">
          Demo applications, generated for the pitch, shown without names.
          Household and employment are explained, never scored.
        </p>
      </div>
    </main>
  )
}
