"use client"

import Image from "next/image"
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react"
import {
  CheckIcon,
  EuroIcon,
  HouseIcon,
  RulerIcon,
  type LucideIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { flatContextAction } from "@/app/landlord/actions"
import { FieldLabel } from "@/components/finder/finder-shell"
import { SiteNav } from "@/components/home/site-nav"
import { Button } from "@/components/ui/button"
import {
  coldRent,
  DEMO_FLAT,
  DOCUMENTS,
  flatSettingsToParams,
  INCOME_FACTOR,
  MAX_AREA_M2,
  MIN_AREA_M2,
  PROPERTY_TYPES,
  ROOM_OPTIONS,
  type DocumentKey,
  type FlatContext,
  type FlatSettings,
  type PropertyType,
} from "@/lib/landlord"
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
  /** Empty address, 0 for area, rent or rooms and no docs start as blank fields */
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

  // Too short to look up: ignore what an earlier address returned
  const hasAddress = address.trim().length >= 3
  const context = hasAddress ? fetchedContext : null
  const warm = Number(rentText.replace(/\D/g, "")) || 0
  const area = Math.min(Number(areaText) || 0, MAX_AREA_M2)
  const cold = coldRent(warm, area, context?.serviceChargePerM2)
  const minIncome = cold * INCOME_FACTOR
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
              </div>
              <div className="flex flex-col gap-6">
                <p id={`${id}-type`} className="text-heading">
                  What are you letting?
                </p>
                <PillChoice
                  options={PROPERTY_TYPES}
                  value={type}
                  onChange={setType}
                  labelledBy={`${id}-type`}
                />
              </div>
              <div className="flex flex-col gap-3">
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
              </div>
              <div className="flex flex-col gap-3">
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
              </div>
            </div>

            <div className="flex flex-col gap-6">
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
            </div>

            <Divider />

            <div className="flex flex-col gap-8">
              <Heading>What documents must tenants have?</Heading>
              <div className="flex flex-col gap-4">
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
              </div>
            </div>

            <Divider />

            <div className="flex flex-col gap-8">
              <Heading>How applications will be reviewed</Heading>
              <div className="flex flex-col gap-6 text-lg leading-normal">
                <ReviewRow label="Required">
                  Net income at least three times the cold rent
                  {area ? ` (${eur(minIncome)})` : ""},{" "}
                  {docs.length
                    ? `the ${docs.length === 1 ? "document" : `${docs.length} documents`} you selected`
                    : "no documents"}
                  , and a move-in from {DEMO_FLAT.moveIn}.
                </ReviewRow>
                <ReviewRow label="Shown but not scored">
                  Household size
                  {rooms
                    ? ` for ${rooms} ${rooms === 1 ? "room" : "rooms"}`
                    : ""}
                  , employment security, non-smoking household.
                </ReviewRow>
                <ReviewRow label="Never used">
                  Protected characteristics, names, photos, nationality, writing
                  style or language.
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
                  `/landlord/applications?${flatSettingsToParams({ address, type, areaM2: area, warmRent: warm, rooms, docs })}`,
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
