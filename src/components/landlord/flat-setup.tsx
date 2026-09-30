"use client"

import Image from "next/image"
import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ComponentProps,
  type ReactNode,
} from "react"
import {
  CheckIcon,
  EuroIcon,
  HouseIcon,
  RulerIcon,
  ShieldAlertIcon,
  SparklesIcon,
  type LucideIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { flatContextAction, suggestFlatAction } from "@/app/landlord/actions"
import { ToggleChips } from "@/components/finder/choice-group"
import { FieldLabel } from "@/components/finder/finder-shell"
import { FIELD } from "@/components/finder/form-bits"
import { SiteNav } from "@/components/home/site-nav"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  coldRent,
  DEMO_FLAT,
  DEMO_SETTINGS,
  DOCUMENTS,
  FALLBACK_SERVICE_CHARGE_M2,
  flatSettingsToParams,
  INCOME_MULTIPLES,
  MAX_AREA_M2,
  MIN_AREA_M2,
  PROPERTY_TYPES,
  ROOM_OPTIONS,
  SAVINGS_MONTHS,
  SMOKING_OPTIONS,
  WELCOME,
  type DocumentKey,
  type FlatContext,
  type FlatSettings,
  type PropertyType,
  type WelcomeKey,
} from "@/lib/landlord"
import { checkTenantCriteria, type CriterionMatch } from "@/lib/tenant-criteria"
import { cn } from "@/lib/utils"
import { Divider, eur, Heading, Progress } from "@/components/landlord/parts"
import flatPhoto from "../../../public/landlord/flat.jpg"

function DocumentCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group flex items-center gap-4 text-left outline-none"
    >
      <span className="bg-card border-input group-focus-visible:ring-ring/50 group-hover:border-subtle flex size-8 shrink-0 items-center justify-center rounded-xl border transition-colors group-focus-visible:ring-3">
        {checked && <CheckIcon aria-hidden className="text-heading size-6" />}
      </span>
      <span className="text-heading text-lg leading-normal">{label}</span>
    </button>
  )
}

/** Figma "Pagination" chips: orange outline, filled when selected. */
function PillChoice<T extends string | number>({
  options,
  value,
  onChange,
  labelledBy,
}: {
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  labelledBy: string
}) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className="flex flex-wrap gap-2"
    >
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "focus-visible:ring-ring/50 flex h-9 min-w-9 items-center justify-center rounded-full border px-3 text-lg transition-colors outline-none focus-visible:ring-3",
              on
                ? "bg-brand-500 border-brand-500 text-white"
                : "border-faint text-brand-500 hover:border-brand-500",
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Rounded Figma "Input" with a leading orange icon. */
function PillInput({
  icon: Icon,
  suffix,
  className,
  ...props
}: ComponentProps<"input"> & { icon: LucideIcon; suffix?: string }) {
  return (
    <div className="border-input focus-within:border-ring focus-within:ring-ring/50 flex items-center gap-2 rounded-full border p-4 focus-within:ring-3">
      <Icon aria-hidden className="text-brand-500 size-6 shrink-0" />
      <input
        {...props}
        className={cn(
          "text-heading placeholder:text-subtle min-w-0 flex-1 bg-transparent text-lg leading-normal font-medium outline-none",
          className,
        )}
      />
      {suffix && (
        <span aria-hidden className="text-subtle text-lg font-medium">
          {suffix}
        </span>
      )}
    </div>
  )
}

/** Under the address: what we matched it to, or why the rent comparison is missing. */
function AddressHint({
  context,
  pending,
  empty,
}: {
  context: FlatContext | null
  pending: boolean
  empty: boolean
}) {
  if (empty)
    return (
      <p className="text-subtle text-sm">
        We look up its Wohnlage and comparable rents nearby.
      </p>
    )
  if (pending)
    return <p className="text-subtle text-sm">Looking up the address…</p>
  if (!context?.found)
    return (
      <p className="text-subtle text-sm">
        Not an address we know in Berlin yet. Try “Street 12, PLZ”.
      </p>
    )
  return (
    <p className="text-subtle text-sm">
      {context.found === "address" ? "Found" : "Street found"}:{" "}
      {[context.address, context.plz, context.ortsteil]
        .filter(Boolean)
        .join(" · ")}
      {context.wohnlage && ` · Wohnlage ${context.wohnlage} (Mietspiegel 2026)`}
    </p>
  )
}

/**
 * Cold rent next to the synthetic comparables of the PLZ + Wohnlage. No verdict:
 * synthetic prices run 25–40% below the real market, so "above typical" would mislead.
 */
function RentHint({
  cold,
  area,
  context,
}: {
  cold: number
  area: number
  context: FlatContext | null
}) {
  const c = context?.comparables
  if (!area)
    return (
      <p className="text-subtle text-sm">
        Add the living space to estimate the cold rent.
      </p>
    )
  if (!c || c.p25 == null || c.p75 == null || cold <= 0) return null
  return (
    <p className="text-subtle text-sm leading-normal">
      ≈ {eur(cold)} cold ({(cold / area).toFixed(2)} €/m²). Comparable rentals
      in {context.plz}
      {context.wohnlage && ` (Wohnlage ${context.wohnlage})`} list{" "}
      {c.p25.toFixed(2)}–{c.p75.toFixed(2)} €/m² cold{" "}
      <span className="text-faint">
        · synthetic listings, 25–40% below the market, not the Mietspiegel
      </span>
    </p>
  )
}

type Field = "address" | "type" | "area" | "rent" | "rooms" | "docs" | "smoking"

/** Briefly tints a field the AI just filled in, like the finder's priority rows. */
function Filled({
  on,
  className,
  children,
}: {
  on: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "-mx-3 flex flex-col rounded-2xl px-3 py-2 transition-colors duration-700",
        on && "bg-secondary",
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * What the criteria check found in the landlord's own words. Deterministic
 * phrase matching (tenant-criteria.ts); nothing typed here is ever applied.
 */
function CriteriaNotice({
  matches,
  id,
  quiet,
}: {
  matches: CriterionMatch[]
  id?: string
  /** Say nothing when there is no match (the description box) */
  quiet?: boolean
}) {
  if (!matches.length)
    return quiet ? null : (
      <p id={id} className="text-subtle text-sm leading-normal">
        Noted for you, not checked: applicants are reviewed only on the fields
        above. Nothing here matched our list of discriminatory criteria, which
        is not legal clearance.
      </p>
    )
  return (
    <ul id={id} className="flex flex-col gap-3" aria-live="polite">
      {matches.map(({ category: c, phrase }) => (
        <li
          key={c.key}
          className="bg-secondary flex gap-3 rounded-2xl p-4 text-sm leading-normal"
        >
          <ShieldAlertIcon
            aria-hidden
            className="text-brand-600 mt-0.5 size-5 shrink-0"
          />
          <div className="flex flex-col gap-1">
            <p className="text-heading font-bold">
              {c.action === "refuse"
                ? `We can’t apply “${phrase}”: ${c.label.toLowerCase()}.`
                : `“${phrase}” isn’t applied: ${c.label.toLowerCase()}.`}
            </p>
            {c.alternative && (
              <p className="text-foreground">{c.alternative}</p>
            )}
            <p className="text-subtle">{c.basis}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

function ReviewRow({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:gap-8 lg:gap-[112px]">
      <p className="text-heading font-medium sm:w-[127px] sm:shrink-0">
        {label}
      </p>
      <p className="text-muted-foreground flex-1">{children}</p>
    </div>
  )
}

export function FlatSetup({
  initial,
  context: initialContext,
}: {
  /** Empty address, 0 for area, rent or rooms start as blank fields */
  initial: FlatSettings
  context: FlatContext | null
}) {
  const id = useId()
  const router = useRouter()
  const [address, setAddress] = useState(initial.address)
  const [fetchedContext, setContext] = useState(initialContext)
  const [pending, setPending] = useState(false)
  const [type, setType] = useState<PropertyType>(initial.type)
  const [rentText, setRentText] = useState(
    initial.warmRent ? initial.warmRent.toLocaleString("en") : "",
  )
  const [areaText, setAreaText] = useState(
    initial.areaM2 ? String(initial.areaM2) : "",
  )
  const [rooms, setRooms] = useState(initial.rooms)
  const [docs, setDocs] = useState<DocumentKey[]>(initial.docs)
  const [incomeMultiple, setIncomeMultiple] = useState(initial.incomeMultiple)
  const [welcome, setWelcome] = useState<WelcomeKey[]>(initial.welcome)
  const [nonSmoking, setNonSmoking] = useState(initial.nonSmoking)
  // "Anything else you need from a tenant?": checked, never applied
  const [wishes, setWishes] = useState("")

  // "Fill in from my text": the AI fills the fields below, the landlord adjusts them
  const [text, setText] = useState("")
  const [needText, setNeedText] = useState(false)
  const [extras, setExtras] = useState<string[]>([])
  const [highlight, setHighlight] = useState<Field[]>([])
  const [filling, startFilling] = useTransition()
  const textRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (!highlight.length) return
    const t = setTimeout(() => setHighlight([]), 2500)
    return () => clearTimeout(t)
  }, [highlight])

  // Too short to look up: ignore what an earlier address returned
  const hasAddress = address.trim().length >= 3
  const context = hasAddress ? fetchedContext : null
  const warm = Number(rentText.replace(/\D/g, "")) || 0
  const area = Math.min(Number(areaText) || 0, MAX_AREA_M2)
  const cold = coldRent(warm, area, context?.serviceChargePerM2)
  const minIncome = cold * incomeMultiple
  const noun = type === "house" ? "house" : "flat"

  // Re-read Wohnlage and comparables 600 ms after the last keystroke. The address
  // is checked on its own; until a living space is typed, the demo size stands in
  // for the comparables' size band (the rent hint asks for the area meanwhile)
  const lookupArea = area >= MIN_AREA_M2 ? area : DEMO_FLAT.areaM2
  const request = useRef(0)
  // The server already read the initial flat
  const looked = useRef(
    initial.address
      ? `${initial.address}|${initial.areaM2 >= MIN_AREA_M2 ? initial.areaM2 : DEMO_FLAT.areaM2}`
      : "",
  )
  useEffect(() => {
    const key = `${address}|${lookupArea}`
    if (key === looked.current || address.trim().length < 3) return
    const n = ++request.current
    const t = setTimeout(async () => {
      setPending(true)
      const next = await flatContextAction({ address, areaM2: lookupArea })
      if (n !== request.current) return
      looked.current = key
      setContext(next)
      setPending(false)
    }, 600)
    return () => clearTimeout(t)
  }, [address, lookupArea])

  const textMatches = checkTenantCriteria(text)
  const wishMatches = checkTenantCriteria([wishes, ...extras].join(" · "))

  const fillIn = () => {
    if (!text.trim()) {
      setNeedText(true)
      textRef.current?.focus()
      return
    }
    startFilling(async () => {
      const res = await suggestFlatAction({
        text,
        current: {
          address,
          type,
          areaM2: area,
          warmRent: warm,
          rooms,
          docs,
          nonSmoking,
        },
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      // A cold rent becomes warm with the PLZ's median service charge, as the rent hint does
      const nextWarm =
        res.coldRent != null && res.areaM2
          ? Math.round(
              res.coldRent +
                (context?.serviceChargePerM2 ?? FALLBACK_SERVICE_CHARGE_M2) *
                  res.areaM2,
            )
          : res.warmRent
      const sameDocs =
        res.docs.length === docs.length &&
        res.docs.every((d) => docs.includes(d))
      const changed = (
        [
          ["address", res.address !== address],
          ["type", res.type !== type],
          ["area", res.areaM2 !== area],
          ["rent", nextWarm !== warm],
          ["rooms", res.rooms !== rooms],
          ["docs", !sameDocs],
          ["smoking", res.nonSmoking !== nonSmoking],
        ] as const
      )
        .filter(([, c]) => c)
        .map(([f]) => f)
      setAddress(res.address)
      setType(res.type)
      setAreaText(res.areaM2 ? String(res.areaM2) : "")
      setRentText(nextWarm ? nextWarm.toLocaleString("en") : "")
      setRooms(res.rooms)
      setDocs(res.docs)
      setNonSmoking(res.nonSmoking)
      setExtras(res.extras)
      setHighlight(changed)
      toast.success(
        changed.length
          ? `Filled in ${changed.length} ${changed.length === 1 ? "field" : "fields"} from your text. Check them below.`
          : "Your text matches the fields already.",
      )
      if (res.coldRent != null && !res.areaM2)
        toast.info(
          "Add the living space so we can turn the cold rent into warm.",
        )
    })
  }

  // The demo flat in Baumschulenweg, so the pitch can skip the typing
  const fillDemo = () => {
    const d = DEMO_SETTINGS
    setText("")
    setNeedText(false)
    setExtras([])
    setAddress(d.address)
    setType(d.type)
    setAreaText(String(d.areaM2))
    setRentText(d.warmRent.toLocaleString("en"))
    setRooms(d.rooms)
    setDocs(d.docs)
    setIncomeMultiple(d.incomeMultiple)
    setWelcome(d.welcome)
    setNonSmoking(d.nonSmoking)
    setHighlight(["address", "type", "area", "rent", "rooms", "docs"])
  }

  return (
    <main className="flex flex-1 flex-col">
      <SiteNav tone="page" audience="landlords" />
      <div className="mx-auto flex w-full max-w-[1184px] flex-col gap-10 px-4 pt-4 pb-16 sm:px-6 sm:pt-8 lg:gap-16">
        <Progress step={1} label={`The ${noun}`} noun={noun} />

        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
          <section className="flex flex-col gap-5 lg:sticky lg:top-6 lg:w-[455px] lg:shrink-0">
            <div className="flex flex-col gap-4">
              <h1 className="text-heading text-3xl leading-[1.1] sm:text-[35px]">
                Tell us about the {noun}.
              </h1>
              <p className="text-muted-foreground text-lg leading-normal">
                What you set here becomes the main factors that applicants are
                checked against.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={fillDemo}
                className="text-heading h-auto self-start rounded-full px-5 py-3 text-base font-bold"
              >
                <SparklesIcon className="text-brand-500" />
                Fill in a demo {noun}
              </Button>
            </div>
            <div className="bg-chip relative aspect-[455/406] overflow-hidden rounded-3xl">
              <Image
                src={flatPhoto}
                alt="The demo house in Baumschulenweg, next to a playground"
                fill
                placeholder="blur"
                sizes="(min-width: 1024px) 455px, 100vw"
                className="object-cover"
              />
            </div>
            <p className="text-muted-foreground font-medium">
              {[
                context?.address ?? address.split(",")[0],
                context?.ortsteil,
                area ? `${area} m²` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </section>

          <section className="bg-card flex flex-col gap-10 rounded-3xl p-5 sm:p-10 lg:w-[649px] lg:shrink-0">
            <div className="flex flex-col gap-8">
              <Heading>Let’s speak about the {noun}</Heading>
              <div className="flex flex-col gap-3">
                <FieldLabel htmlFor={`${id}-text`}>
                  Describe it in your own words (optional)
                </FieldLabel>
                <Textarea
                  id={`${id}-text`}
                  ref={textRef}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value)
                    setNeedText(false)
                  }}
                  maxLength={1000}
                  aria-invalid={needText || undefined}
                  aria-describedby={needText ? `${id}-need` : undefined}
                  placeholder="e.g. 3-room flat, 79 m², Baumschulenstraße 84 in 12437. €1,480 warm. I need a SCHUFA, payslips and a Mietschuldenfreiheitsbescheinigung."
                  className={cn(
                    FIELD,
                    "placeholder:text-faint field-sizing-fixed min-h-[120px] resize-y rounded-2xl placeholder:font-normal",
                  )}
                />
                {needText && (
                  <p id={`${id}-need`} className="text-destructive text-sm">
                    Write a few words first, then we fill in the fields below.
                  </p>
                )}
                <CriteriaNotice matches={textMatches} quiet />
                <Button
                  type="button"
                  variant="outline"
                  onClick={fillIn}
                  disabled={filling}
                  className="text-heading h-auto self-start rounded-full px-5 py-3 text-base font-bold"
                >
                  <SparklesIcon className="text-brand-500" />
                  {filling ? "Reading your text…" : "Fill in from my text"}
                </Button>
              </div>
              <Filled on={highlight.includes("address")} className="gap-3">
                <FieldLabel htmlFor={`${id}-address`}>
                  Address of the {noun}
                </FieldLabel>
                <PillInput
                  id={`${id}-address`}
                  icon={HouseIcon}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Baumschulenstraße 84, 12437 Berlin"
                  autoComplete="street-address"
                />
                <AddressHint
                  context={context}
                  pending={pending && hasAddress}
                  empty={!hasAddress}
                />
              </Filled>
              <Filled on={highlight.includes("type")} className="gap-6">
                <p id={`${id}-type`} className="text-heading">
                  What are you letting?
                </p>
                <PillChoice
                  options={PROPERTY_TYPES}
                  value={type}
                  onChange={setType}
                  labelledBy={`${id}-type`}
                />
              </Filled>
              <Filled on={highlight.includes("area")} className="gap-3">
                <FieldLabel htmlFor={`${id}-area`}>
                  Living space · in square metres
                </FieldLabel>
                <PillInput
                  id={`${id}-area`}
                  icon={RulerIcon}
                  suffix="m²"
                  inputMode="numeric"
                  value={areaText}
                  onChange={(e) =>
                    setAreaText(e.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  placeholder="79"
                />
              </Filled>
              <Filled on={highlight.includes("rent")} className="gap-3">
                <FieldLabel htmlFor={`${id}-rent`}>
                  Monthly rent · based on the warm rent
                </FieldLabel>
                <PillInput
                  id={`${id}-rent`}
                  icon={EuroIcon}
                  inputMode="numeric"
                  value={rentText}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/\D/g, ""))
                    setRentText(n ? n.toLocaleString("en") : "")
                  }}
                  placeholder="1,480"
                />
                <RentHint cold={cold} area={area} context={context} />
              </Filled>
            </div>

            <Filled on={highlight.includes("rooms")} className="gap-6">
              <p id={`${id}-rooms`} className="text-heading">
                How many rooms do you have available?
              </p>
              <PillChoice
                options={ROOM_OPTIONS.map((n) => ({
                  value: n,
                  label: String(n),
                }))}
                value={rooms}
                onChange={setRooms}
                labelledBy={`${id}-rooms`}
              />
            </Filled>

            <Divider />

            <div className="flex flex-col gap-8">
              <Heading>What documents must tenants have?</Heading>
              <Filled on={highlight.includes("docs")} className="gap-4">
                {DOCUMENTS.map((d) => (
                  <DocumentCheckbox
                    key={d.key}
                    label={d.label}
                    checked={docs.includes(d.key)}
                    onChange={(on) =>
                      setDocs((prev) =>
                        on
                          ? [...prev.filter((k) => k !== d.key), d.key]
                          : prev.filter((k) => k !== d.key),
                      )
                    }
                  />
                ))}
              </Filled>
              <Filled on={highlight.includes("smoking")} className="gap-6">
                <p id={`${id}-smoking`} className="text-heading">
                  Non-smoking household?
                </p>
                <PillChoice
                  options={SMOKING_OPTIONS}
                  value={nonSmoking ? "no" : "any"}
                  onChange={(v) => setNonSmoking(v === "no")}
                  labelledBy={`${id}-smoking`}
                />
              </Filled>
              {extras.length > 0 && (
                <ul className="flex flex-wrap items-center gap-2">
                  {extras.map((e) => (
                    <li
                      key={e}
                      className="text-faint border-input rounded-full border border-dashed px-3 py-1.5 text-sm"
                    >
                      {e}
                    </li>
                  ))}
                  <li className="text-faint text-sm">
                    Noted, but not checked: applicants are reviewed only on the
                    fields above
                  </li>
                </ul>
              )}
            </div>

            <Divider />

            <div className="flex flex-col gap-8">
              <Heading>How should tenants show they can pay?</Heading>
              <div className="flex flex-col gap-6">
                <p id={`${id}-mult`} className="text-heading">
                  Net income at least … times the cold rent
                </p>
                <PillChoice
                  options={INCOME_MULTIPLES.map((m) => ({
                    value: m,
                    label: `${m}×`,
                  }))}
                  value={incomeMultiple}
                  onChange={setIncomeMultiple}
                  labelledBy={`${id}-mult`}
                />
                <p className="text-muted-foreground leading-normal">
                  Or any one of: a guarantor, deposit insurance, or savings
                  covering {SAVINGS_MONTHS} months’ warm rent
                  {warm ? ` (${eur(warm * SAVINGS_MONTHS)})` : ""}. Each route
                  counts the same, so a freelancer, a student or someone new to
                  Germany isn’t shut out by the kind of contract they have.
                  Capped at 3× the cold rent.
                </p>
              </div>
            </div>

            <Divider />

            <div className="flex flex-col gap-8">
              <Heading>Who’s welcome?</Heading>
              <div className="flex flex-col gap-4">
                <p className="text-muted-foreground leading-normal">
                  Shown in your ad to encourage people to apply. It never
                  filters, scores or changes anyone’s chance in the draw.
                </p>
                <ToggleChips
                  options={WELCOME.map((w) => ({
                    value: w.key,
                    label: w.label,
                  }))}
                  value={welcome}
                  onChange={setWelcome}
                  label="Who’s welcome"
                />
              </div>
              <div className="flex flex-col gap-3">
                <FieldLabel htmlFor={`${id}-wishes`}>
                  Anything else you need from a tenant? (optional)
                </FieldLabel>
                <Textarea
                  id={`${id}-wishes`}
                  value={wishes}
                  onChange={(e) => setWishes(e.target.value)}
                  maxLength={500}
                  aria-describedby={`${id}-wishes-check`}
                  placeholder="e.g. quiet household, no pets, would like to meet in person first"
                  className={cn(
                    FIELD,
                    "placeholder:text-faint field-sizing-fixed min-h-[88px] resize-y rounded-2xl placeholder:font-normal",
                  )}
                />
                {(wishes.trim() || wishMatches.length > 0) && (
                  <CriteriaNotice
                    matches={wishMatches}
                    id={`${id}-wishes-check`}
                  />
                )}
              </div>
            </div>

            <Divider />

            <div className="flex flex-col gap-8">
              <Heading>How applications will be reviewed</Heading>
              <div className="flex flex-col gap-6 text-lg leading-normal">
                <ReviewRow label="Required">
                  Net income at least {incomeMultiple}× the cold rent
                  {area ? ` (${eur(minIncome)})` : ""} or a guarantor, deposit
                  insurance or {SAVINGS_MONTHS} months’ rent in savings,{" "}
                  {docs.length
                    ? `the ${docs.length === 1 ? "document" : `${docs.length} documents`} you selected`
                    : "no documents"}
                  {nonSmoking ? ", a non-smoking household" : ""}, and a move-in
                  from {DEMO_FLAT.moveIn}.
                </ReviewRow>
                <ReviewRow label="Shown but not scored">
                  Household size
                  {rooms
                    ? ` for ${rooms} ${rooms === 1 ? "room" : "rooms"}`
                    : ""}
                  , employment security
                  {nonSmoking ? "" : ", smoking"}.
                </ReviewRow>
                <ReviewRow label="Never used">
                  Protected characteristics, names, photos, nationality, writing
                  style or language.
                </ReviewRow>
                <ReviewRow label="Who gets a viewing">
                  Fair Pick: a random draw among everyone who meets the
                  requirements, verifiable by anyone. No hidden score.
                </ReviewRow>
              </div>
            </div>

            <p className="text-subtle text-sm font-medium">
              Application data is kept only for this letting and deleted 30 days
              after the flat is let.
            </p>

            <Divider />

            <Button
              type="button"
              disabled={!hasAddress || !warm || area < MIN_AREA_M2 || !rooms}
              onClick={() =>
                router.push(
                  `/landlord/applications?${flatSettingsToParams({ address, type, areaM2: area, warmRent: warm, rooms, docs, incomeMultiple, welcome, nonSmoking })}`,
                )
              }
              className="bg-brand-300 text-brand-700 hover:bg-brand-300/80 h-auto w-full rounded-full px-8 py-4 text-lg leading-normal font-bold"
            >
              Show matches
            </Button>
          </section>
        </div>
      </div>
    </main>
  )
}
