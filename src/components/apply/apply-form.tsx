"use client"

import Link from "next/link"
import { useId, useState, useTransition, type ReactNode } from "react"
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  FileUpIcon,
  LoaderIcon,
  SparklesIcon,
} from "lucide-react"
import { toast } from "sonner"
import {
  draftCoverLetterAction,
  submitApplicationAction,
} from "@/app/apply/actions"
import { ChoiceGroup } from "@/components/finder/choice-group"
import { FieldLabel, SectionTitle } from "@/components/finder/finder-shell"
import { FIELD } from "@/components/finder/form-bits"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { EMPLOYMENT, householdLabel, type Employment } from "@/lib/applicants"
import {
  DEFAULT_INCOME_MULTIPLE,
  DEMO_SETTINGS,
  DOCUMENTS,
  flatSettingsToParams,
  SAVINGS_MONTHS,
  type DocumentKey,
} from "@/lib/landlord"
import {
  cleanOrtsteil,
  listingLines,
  type ListingSummary,
} from "@/lib/listing-labels"
import { cn } from "@/lib/utils"

type Rental = ListingSummary & {
  id: string
  plrName: string | null
  ortsteil: string
  kaltmiete: number
  warmmiete: number
}

/** What /api/documents/check returns, plus the signature submit checks */
type Checked = {
  status: "verified" | "rejected" | "unchecked"
  demo: boolean
  netIncome?: number | null
  detail: string
  token: string
}
type DocState =
  | { state: "checking"; file: string }
  | ({ state: "done"; file: string } & Checked)
  | { state: "error"; file: string; detail: string }

const eur = (n: number) => `€${Math.round(n).toLocaleString("en")}`
const num = (t: string) => {
  const n = Number(t.replace(/\D/g, ""))
  return t.trim() && Number.isFinite(n) ? n : null
}

/** The fictional sample PDFs in public/demo-documents (accepted by their hash) */
const DEMO_FILES: [DocumentKey, string][] = [
  ["id", "demo-identity.pdf"],
  ["payslips", "demo-payslips.pdf"],
  ["schufa", "demo-schufa.pdf"],
  ["rentDebt", "demo-rent-certificate.pdf"],
]

const HINT: Partial<Record<DocumentKey, string>> = {
  id: "We only check that it looks like an ID: no name, photo or nationality is read.",
  payslips: "We read only the net pay, to compare it with what you state.",
  schufa:
    "We only check that it’s a SCHUFA report. No score or entries are read.",
}

const YES_NO = [
  { value: "no", label: "No" },
  { value: "yes", label: "Yes" },
] as const

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-6">
      <SectionTitle>{title}</SectionTitle>
      {children}
    </section>
  )
}

function DocRow({
  label,
  hint,
  doc,
  onFile,
}: {
  label: string
  hint?: string
  doc?: DocState
  onFile: (f: File) => void
}) {
  const id = useId()
  const ok = doc?.state === "done" && doc.status === "verified"
  const bad =
    doc?.state === "error" ||
    (doc?.state === "done" && doc.status === "rejected")
  return (
    <li className="border-input flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-heading flex items-center gap-2 font-medium">
          {ok ? (
            <CheckCircle2Icon
              aria-hidden
              className="text-brand-600 size-5 shrink-0"
            />
          ) : bad ? (
            <CircleAlertIcon
              aria-hidden
              className="text-destructive size-5 shrink-0"
            />
          ) : doc?.state === "checking" ? (
            <LoaderIcon
              aria-hidden
              className="text-subtle size-5 shrink-0 animate-spin"
            />
          ) : (
            <FileUpIcon aria-hidden className="text-subtle size-5 shrink-0" />
          )}
          {label}
        </p>
        <p className="text-subtle text-sm leading-normal" aria-live="polite">
          {doc
            ? `${doc.file} · ${doc.state === "checking" ? "Checking…" : doc.detail}`
            : hint}
        </p>
      </div>
      <label
        htmlFor={id}
        className="border-input text-heading hover:bg-muted focus-within:ring-ring/50 shrink-0 cursor-pointer rounded-full border px-4 py-2 text-sm font-bold focus-within:ring-3"
      >
        {doc ? "Replace" : "Upload"}
        <input
          id={id}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onFile(f)
            e.target.value = ""
          }}
        />
      </label>
    </li>
  )
}

export function ApplyForm({
  rental,
  kids,
  moveInDate,
  back,
}: {
  rental: Rental
  kids: number
  moveInDate: string
  back: string
}) {
  const id = useId()
  const [name, setName] = useState("")
  const [adults, setAdults] = useState(kids > 0 ? 2 : 1)
  const [children, setChildren] = useState(kids)
  const [employment, setEmployment] = useState<Employment>("Permanent")
  const [incomeText, setIncomeText] = useState("")
  const [guarantor, setGuarantor] = useState<"yes" | "no">("no")
  const [insurance, setInsurance] = useState<"yes" | "no">("no")
  const [savingsText, setSavingsText] = useState("")
  const [moveIn, setMoveIn] = useState(moveInDate)
  const [docs, setDocs] = useState<Partial<Record<DocumentKey, DocState>>>({})
  const [answers, setAnswers] = useState({ household: "", why: "", other: "" })
  const [tone, setTone] = useState<"warm" | "formal">("warm")
  const [letter, setLetter] = useState("")
  const [consent, setConsent] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const [drafting, startDraft] = useTransition()
  const [sending, startSend] = useTransition()

  const income = num(incomeText)
  const savings = num(savingsText) ?? 0
  const minIncome = rental.kaltmiete * DEFAULT_INCOME_MULTIPLE
  const routes = [
    income != null &&
      income >= minIncome &&
      `income (${(income / rental.kaltmiete).toFixed(1)}× the cold rent)`,
    guarantor === "yes" && "a guarantor",
    insurance === "yes" && "deposit insurance",
    savings >= SAVINGS_MONTHS * rental.warmmiete && "savings",
  ].filter(Boolean) as string[]
  const payslip =
    docs.payslips?.state === "done" ? docs.payslips.netIncome : null
  const mismatch =
    adults === 1 &&
    income != null &&
    payslip != null &&
    Math.abs(payslip - income) > 100
  const checking = Object.values(docs).some((d) => d?.state === "checking")
  const ready = name.trim().length >= 2 && !!moveIn && consent && !checking
  const [facts, building] = listingLines(rental)
  const flatLabel = `${rental.rooms}-room flat in ${rental.plrName ?? cleanOrtsteil(rental.ortsteil)}`

  const upload = async (key: DocumentKey, file: File) => {
    if (file.size > 4 * 1024 * 1024) {
      toast.error("Files can be at most 4 MB.")
      return
    }
    setDocs((d) => ({ ...d, [key]: { state: "checking", file: file.name } }))
    const form = new FormData()
    form.set("file", file)
    form.set("documentType", key)
    try {
      const res = await fetch("/api/documents/check", {
        method: "POST",
        body: form,
      })
      const body = await res.json()
      if (!res.ok)
        throw new Error(
          typeof body.error === "string" ? body.error : "The check failed.",
        )
      setDocs((d) => ({
        ...d,
        [key]: { state: "done", file: file.name, ...(body as Checked) },
      }))
    } catch (err) {
      setDocs((d) => ({
        ...d,
        [key]: {
          state: "error",
          file: file.name,
          detail: (err as Error).message,
        },
      }))
    }
  }

  const fillDemo = async () => {
    setName("Alex Demo")
    setAdults(1)
    setChildren(0)
    setEmployment("Permanent")
    setIncomeText("3,800")
    setGuarantor("no")
    setInsurance("no")
    setSavingsText("")
    setMoveIn(moveInDate)
    setAnswers({
      household:
        "I live on my own and work as a software developer in Adlershof.",
      why: "It’s a short ride to work, and I’d like a quiet street with a park nearby for running.",
      other: "I’m quiet, I don’t smoke and I’d like to stay for many years.",
    })
    await Promise.all(
      DEMO_FILES.map(async ([key, file]) => {
        const blob = await fetch(`/demo-documents/${file}`).then((r) =>
          r.blob(),
        )
        await upload(key, new File([blob], file, { type: "application/pdf" }))
      }),
    )
  }

  const draft = () =>
    startDraft(async () => {
      const res = await draftCoverLetterAction({
        name,
        household: householdLabel({ adults, children }),
        employment,
        flat: `${flatLabel}, ${eur(rental.warmmiete)} warm`,
        moveIn,
        answers,
        tone,
      })
      if (res.ok) setLetter(res.text)
      else toast.error(res.error)
    })

  const submit = () =>
    startSend(async () => {
      const documents = Object.fromEntries(
        Object.entries(docs).flatMap(([k, d]) =>
          d?.state === "done"
            ? [
                [
                  k,
                  {
                    status: d.status,
                    demo: d.demo,
                    netIncome: d.netIncome ?? null,
                    detail: d.detail,
                    token: d.token,
                  },
                ],
              ]
            : [],
        ),
      )
      const res = await submitApplicationAction({
        rentalId: rental.id,
        name,
        adults,
        children,
        employment,
        income,
        hasGuarantor: guarantor === "yes",
        hasDepositInsurance: insurance === "yes",
        savings,
        moveIn,
        documents,
        coverLetter: letter,
        consent,
      })
      if (res.ok) {
        setSent(res.id)
        window.scrollTo({ top: 0, behavior: "smooth" })
      } else toast.error(res.error)
    })

  if (sent)
    return (
      <div className="flex max-w-[653px] flex-col gap-6">
        <CheckCircle2Icon aria-hidden className="text-brand-600 size-12" />
        <h1 className="text-foreground text-4xl leading-[1.1] font-medium sm:text-[52px]">
          Application sent.
        </h1>
        <p className="text-muted-foreground text-lg leading-normal">
          It’s in the landlord’s inbox now, checked against their requirements
          like everyone else’s. If you qualify, you are in the Fair Pick draw
          with the same chance as every other qualifying household.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            nativeButton={false}
            render={
              <Link
                href={`/landlord/applications?${flatSettingsToParams(DEMO_SETTINGS)}`}
              />
            }
            className="bg-brand-500 hover:bg-brand-500/90 h-auto rounded-full px-6 py-3 text-base font-bold text-white"
          >
            See it as the landlord
          </Button>
          <Button
            variant="ghost"
            nativeButton={false}
            render={<Link href={back} />}
            className="h-auto rounded-full px-6 py-3 text-base font-bold"
          >
            Back to the flats
          </Button>
        </div>
        <p className="text-faint text-sm">
          In the prototype every application goes to the demo landlord’s flat
          (Baumschulenstraße 84).
        </p>
      </div>
    )

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-5">
        <Link
          href={back}
          className="text-muted-foreground hover:text-heading flex items-center gap-1.5 self-start text-sm font-medium"
        >
          <ArrowLeftIcon aria-hidden className="size-4" />
          Back to the flats
        </Link>
        <div className="flex flex-col gap-2">
          <p className="text-subtle font-medium">
            {eur(rental.warmmiete)} warm · {eur(rental.kaltmiete)} cold ·
            synthetic listing
          </p>
          <h1 className="text-foreground text-4xl leading-[1.1] font-medium sm:text-[52px]">
            Apply for the {flatLabel}
          </h1>
          <p className="text-muted-foreground text-lg">
            {facts} · {building}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={fillDemo}
          className="text-heading h-auto self-start rounded-full px-5 py-3 text-base font-bold"
        >
          <SparklesIcon className="text-brand-500" />
          Fill in a demo applicant
        </Button>
      </div>

      <Section title="About you">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <FieldLabel htmlFor={`${id}-name`}>Your name</FieldLabel>
            <Input
              id={`${id}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              autoComplete="name"
              className={FIELD}
            />
            <p className="text-subtle text-sm">
              Never shown to the landlord: they see “Applicant” and a number, so
              a name can’t sway anyone. It’s shared only once they invite you to
              a viewing.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel htmlFor={`${id}-movein`}>Earliest move-in</FieldLabel>
            <Input
              id={`${id}-movein`}
              type="date"
              value={moveIn}
              onChange={(e) => setMoveIn(e.target.value)}
              className={FIELD}
            />
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel id={`${id}-adults`}>Adults moving in</FieldLabel>
            <ChoiceGroup
              options={[1, 2, 3, 4].map((n) => ({
                value: n,
                label: String(n),
              }))}
              value={adults}
              onChange={setAdults}
              labelledBy={`${id}-adults`}
            />
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel id={`${id}-children`}>Children</FieldLabel>
            <ChoiceGroup
              options={[0, 1, 2, 3, 4, 5].map((n) => ({
                value: n,
                label: String(n),
              }))}
              value={children}
              onChange={setChildren}
              labelledBy={`${id}-children`}
            />
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <FieldLabel id={`${id}-work`}>Work</FieldLabel>
          <ChoiceGroup
            size="lg"
            options={EMPLOYMENT.map((e) => ({ value: e, label: e }))}
            value={employment}
            onChange={setEmployment}
            labelledBy={`${id}-work`}
          />
        </div>
      </Section>

      <Section title="Show you can pay">
        <p className="text-muted-foreground -mt-2 text-lg leading-normal">
          Any one of these is enough, and each counts the same. Most landlords
          ask for a net income of {DEFAULT_INCOME_MULTIPLE}× the cold rent (
          {eur(minIncome)} here); on KiezKiss they may ask for 2–3×.
        </p>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <FieldLabel htmlFor={`${id}-income`}>
              Net household income per month (€)
            </FieldLabel>
            <Input
              id={`${id}-income`}
              inputMode="numeric"
              value={incomeText}
              onChange={(e) => {
                const n = num(e.target.value)
                setIncomeText(n == null ? "" : n.toLocaleString("en"))
              }}
              placeholder="e.g. 3,200"
              className={FIELD}
            />
            {mismatch && (
              <p className="text-brand-600 text-sm">
                Your payslip shows {eur(payslip!)} net. The landlord sees both
                figures, so check that they match.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel htmlFor={`${id}-savings`}>
              Savings (€, optional)
            </FieldLabel>
            <Input
              id={`${id}-savings`}
              inputMode="numeric"
              value={savingsText}
              onChange={(e) => {
                const n = num(e.target.value)
                setSavingsText(n == null ? "" : n.toLocaleString("en"))
              }}
              placeholder={`${SAVINGS_MONTHS} months’ warm rent = ${eur(SAVINGS_MONTHS * rental.warmmiete)}`}
              className={FIELD}
            />
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel id={`${id}-guarantor`}>
              A guarantor (e.g. a parent)
            </FieldLabel>
            <ChoiceGroup
              options={YES_NO}
              value={guarantor}
              onChange={setGuarantor}
              labelledBy={`${id}-guarantor`}
            />
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel id={`${id}-insurance`}>
              Deposit insurance (Mietkautionsversicherung)
            </FieldLabel>
            <ChoiceGroup
              options={YES_NO}
              value={insurance}
              onChange={setInsurance}
              labelledBy={`${id}-insurance`}
            />
          </div>
        </div>
        <p
          aria-live="polite"
          className={cn(
            "rounded-2xl p-4 leading-normal",
            routes.length
              ? "bg-secondary text-heading"
              : "bg-muted text-muted-foreground",
          )}
        >
          {routes.length
            ? `✓ Financial security through ${routes.join(" and ")}.`
            : "Not yet: add an income, a guarantor, deposit insurance or savings."}
        </p>
      </Section>

      <Section title="Documents">
        <p className="text-muted-foreground -mt-2 text-lg leading-normal">
          Upload what you have; the landlord decides which they need. Each file
          is checked right away, read in memory and never stored.
        </p>
        <ul className="flex flex-col gap-3">
          {DOCUMENTS.map((d) => (
            <DocRow
              key={d.key}
              label={d.label}
              hint={HINT[d.key] ?? "PDF, PNG or JPG, up to 4 MB."}
              doc={docs[d.key]}
              onFile={(f) => upload(d.key, f)}
            />
          ))}
        </ul>
      </Section>

      <Section title="Your cover letter">
        <div className="flex flex-col gap-5">
          {(
            [
              [
                "household",
                "Who is moving in?",
                "e.g. my partner and I, and our daughter who starts Kita next year",
              ],
              [
                "why",
                "Why this flat and this area?",
                "e.g. close to work, near the park",
              ],
              [
                "other",
                "Anything else the landlord should know?",
                "e.g. how long you’d like to stay",
              ],
            ] as const
          ).map(([key, label, placeholder]) => (
            <div key={key} className="flex flex-col gap-3">
              <FieldLabel htmlFor={`${id}-${key}`}>{label}</FieldLabel>
              <Textarea
                id={`${id}-${key}`}
                value={answers[key]}
                onChange={(e) =>
                  setAnswers((a) => ({ ...a, [key]: e.target.value }))
                }
                maxLength={600}
                placeholder={placeholder}
                className={cn(
                  FIELD,
                  "placeholder:text-faint field-sizing-fixed min-h-[72px] resize-y rounded-2xl placeholder:font-normal",
                )}
              />
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-4">
            <ChoiceGroup
              size="lg"
              options={[
                { value: "warm", label: "Warm" },
                { value: "formal", label: "Formal" },
              ]}
              value={tone}
              onChange={setTone}
              label="Tone"
            />
            <Button
              type="button"
              variant="outline"
              onClick={draft}
              disabled={drafting}
              className="text-heading h-auto rounded-full px-5 py-3 text-base font-bold"
            >
              <SparklesIcon className="text-brand-500" />
              {drafting
                ? "Writing…"
                : letter
                  ? "Write it again"
                  : "Write my cover letter"}
            </Button>
          </div>
          <Textarea
            aria-label="Cover letter"
            value={letter}
            onChange={(e) => setLetter(e.target.value)}
            maxLength={3000}
            placeholder="Your letter appears here. Edit it as you like, or write your own."
            className={cn(
              FIELD,
              "placeholder:text-faint field-sizing-fixed min-h-[220px] resize-y rounded-2xl font-normal placeholder:font-normal",
            )}
          />
          <p className="text-subtle text-sm leading-normal">
            The AI uses only what you wrote above and never adds details about
            origin, religion or health. The landlord reads your letter, but it
            is never part of the checks or the draw.
          </p>
        </div>
      </Section>

      <div className="flex flex-col gap-5">
        <label className="flex items-start gap-3 leading-normal">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="accent-brand-500 mt-1 size-5 shrink-0"
          />
          <span className="text-foreground">
            Store my application for this letting. It is deleted 30 days after
            the flat is let. Uploaded files are never stored.
          </span>
        </label>
        <Button
          type="button"
          onClick={submit}
          disabled={!ready || sending}
          className="bg-brand-500 hover:bg-brand-500/90 h-auto w-full rounded-full px-8 py-4 text-lg font-bold text-white"
        >
          {sending
            ? "Sending…"
            : checking
              ? "Checking documents…"
              : "Send application"}
        </Button>
        {!ready && !checking && (
          <p className="text-subtle text-sm">
            Add your name and move-in date and tick the box to send.
          </p>
        )}
      </div>
    </div>
  )
}
