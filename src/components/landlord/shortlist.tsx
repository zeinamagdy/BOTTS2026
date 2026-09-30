"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowLeftIcon, CalendarIcon, CheckIcon, MailIcon } from "lucide-react"
import { toast } from "sonner"
import { SiteNav } from "@/components/home/site-nav"
import { Divider, Progress } from "@/components/landlord/parts"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { FieldLabel } from "@/components/finder/finder-shell"
import { FIELD } from "@/components/finder/form-bits"
import { householdLabel, type explainShortlist } from "@/lib/applicants"
import { flatSettingsToParams, type FlatSettings } from "@/lib/landlord"
import { cn } from "@/lib/utils"

type Card = ReturnType<typeof explainShortlist>[number]

const COUNT_WORD = ["No one", "This one", "These two", "These three"]

/** "Saturday, 7 November 2026" */
const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })

/**
 * One invitation for everyone drawn: a date and time, then an email draft.
 * The draft has no recipients: the landlord sees only "Applicant N", so the
 * live product would relay it without showing anyone's address. Nothing is sent
 * from here.
 */
function ViewingDay({
  street,
  noun,
  labels,
  onInvite,
}: {
  street: string
  noun: string
  labels: string[]
  onInvite: () => void
}) {
  const [day, setDay] = useState("")
  const [time, setTime] = useState("17:00")
  const ready = !!day && !!time
  const body = [
    "Hello,",
    "",
    `Thank you for applying for the ${noun} at ${street}. You were drawn for a viewing.`,
    "",
    `When: ${ready ? `${longDate(day)}, ${time}` : "[date and time]"}`,
    `Where: ${street}`,
    "",
    "Please reply to confirm or to suggest another time. Bring your ID; the other documents you sent are enough.",
    "",
    "Kind regards",
  ].join("\n")
  const href = `mailto:?${new URLSearchParams({
    subject: `Viewing: ${street}`,
    body,
  })
    .toString()
    .replace(/\+/g, "%20")}`

  return (
    <section className="bg-card flex flex-col gap-8 rounded-3xl p-5 sm:p-10">
      <div className="flex flex-col gap-3">
        <h2 className="text-heading text-2xl leading-[1.1] font-medium sm:text-[28px]">
          Set up a viewing day
        </h2>
        <p className="text-muted-foreground text-lg leading-normal">
          Invite {labels.join(", ")} to the same slot. You still decide after
          the viewing.
        </p>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <FieldLabel htmlFor="viewing-day">Day</FieldLabel>
          <Input
            id="viewing-day"
            type="date"
            value={day}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDay(e.target.value)}
            className={FIELD}
          />
        </div>
        <div className="flex flex-col gap-3">
          <FieldLabel htmlFor="viewing-time">Time</FieldLabel>
          <Input
            id="viewing-time"
            type="time"
            value={time}
            step={900}
            onChange={(e) => setTime(e.target.value)}
            className={FIELD}
          />
        </div>
      </div>
      <pre className="bg-secondary text-foreground rounded-2xl p-5 font-sans text-base leading-normal whitespace-pre-wrap">
        {body}
      </pre>
      <div className="flex flex-col gap-3">
        <Button
          nativeButton={false}
          render={
            <a
              href={ready ? href : undefined}
              aria-disabled={!ready}
              onClick={(e) => {
                if (!ready) {
                  e.preventDefault()
                  return
                }
                onInvite()
              }}
            />
          }
          className={cn(
            "bg-brand-500 hover:bg-brand-500/90 h-auto self-start rounded-full px-8 py-4 text-lg font-bold text-white",
            !ready && "pointer-events-none opacity-50",
          )}
        >
          <MailIcon aria-hidden className="size-5" />
          Email the invitation to all {labels.length}
        </Button>
        <p className="text-subtle flex items-start gap-2 text-sm">
          <CalendarIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          Opens a draft in your email app without recipients: you never see
          applicants’ addresses. In a live listing KiezKiss relays it to the
          drawn households. Demo only, nothing is sent from here.
        </p>
      </div>
    </section>
  )
}

/**
 * "Invite to viewing" for one applicant: a message the landlord can edit, then
 * a demo send. The message stays in this component; nothing leaves the browser.
 */
function InviteDialog({
  open,
  onOpenChange,
  label,
  street,
  noun,
  onSend,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  label: string
  street: string
  noun: string
  onSend: (message: string) => void
}) {
  const draft = [
    "Hello,",
    "",
    `Thank you for applying for the ${noun} at ${street}. I would like to invite you to a viewing.`,
    "",
    "Please suggest a few times that suit you this week, and bring your ID.",
    "",
    "Kind regards",
  ].join("\n")
  const [message, setMessage] = useState(draft)
  const id = `invite-${label.replace(/\W+/g, "-").toLowerCase()}`

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setMessage(draft)
        onOpenChange(next)
      }}
    >
      <DialogContent className="theme-kiez bg-card text-foreground gap-6 rounded-3xl p-6 sm:max-w-lg sm:p-8">
        <DialogHeader className="gap-3">
          <DialogTitle className="text-heading text-2xl leading-[1.1] font-medium">
            Invite {label} to a viewing
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-base leading-normal">
            Write the message they will get. You never see their contact
            details: KiezKiss relays it.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault()
            if (message.trim()) onSend(message.trim())
          }}
        >
          <div className="flex flex-col gap-3">
            <FieldLabel htmlFor={id}>Your message</FieldLabel>
            <Textarea
              id={id}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
              required
              className={cn(
                FIELD,
                "field-sizing-fixed min-h-[220px] resize-y rounded-2xl leading-normal",
              )}
            />
          </div>
          <DialogFooter className="mx-0 mb-0 items-center gap-3 rounded-none border-0 bg-transparent p-0 sm:justify-between">
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="ghost"
                  className="text-brand-950 dark:text-brand-200 h-12 rounded-full px-6 text-base font-bold"
                />
              }
            >
              Cancel
            </DialogClose>
            <Button
              type="submit"
              disabled={!message.trim()}
              className="bg-brand-500 hover:bg-brand-500/90 h-12 rounded-full px-8 text-base font-bold text-white"
            >
              <MailIcon aria-hidden className="size-5" />
              Send invitation
            </Button>
          </DialogFooter>
        </form>
        <p className="text-subtle -mt-2 text-sm">
          Demo only: nothing is sent from here.
        </p>
      </DialogContent>
    </Dialog>
  )
}

function ApplicantCard({
  card: { applicant: a, reasons, toCheck },
  href,
  street,
  noun,
  invited,
  onInvite,
}: {
  card: Card
  href: string
  street: string
  noun: string
  invited: boolean
  onInvite: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
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
            onClick={() => setOpen(true)}
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
          <InviteDialog
            open={open}
            onOpenChange={setOpen}
            label={a.name}
            street={street}
            noun={noun}
            onSend={(message) => {
              setOpen(false)
              onInvite(message)
            }}
          />
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
  street,
  qualified,
  drawn,
  cards,
}: {
  flat: FlatSettings
  street: string
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
                  street={street}
                  noun={flat.type === "house" ? "house" : "flat"}
                  invited={invited.includes(c.applicant.id)}
                  onInvite={() => {
                    setInvited((prev) => [...prev, c.applicant.id])
                    toast(`${c.applicant.name} is invited`, {
                      description:
                        "Demo only: your message is not sent. They would reply with a time.",
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

        {cards.length > 0 && (
          <ViewingDay
            street={street}
            noun={flat.type === "house" ? "house" : "flat"}
            labels={cards.map((c) => c.applicant.name)}
            onInvite={() => {
              setInvited(cards.map((c) => c.applicant.id))
              toast("Invitation drafted for everyone drawn", {
                description: "Demo only: nothing is sent from KiezKiss.",
              })
            }}
          />
        )}

        <p className="text-subtle text-sm font-medium">
          Demo applications, generated for the pitch, shown without names.
          Household and employment are explained, never scored.
        </p>
      </div>
    </main>
  )
}
