"use client"

import { useRouter } from "next/navigation"
import { useId, useState, type ComponentProps } from "react"
import { HouseIcon, PlusIcon, XIcon } from "lucide-react"
import { ChoiceGroup } from "@/components/finder/choice-group"
import { FIELD, StepButtons } from "@/components/finder/form-bits"
import { PrioritiesStep } from "@/components/finder/priorities-step"
import {
  AsideText,
  FieldLabel,
  FinderShell,
  SectionTitle,
} from "@/components/finder/finder-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  COMMUTE_OPTIONS,
  finderQuery,
  KIDS_OPTIONS,
  MAX_PLACES,
  PLACE_KINDS,
  type FinderState,
  type PlaceKind,
} from "@/lib/finder-params"
import { cn } from "@/lib/utils"

function AddressInput({ className, ...props }: ComponentProps<typeof Input>) {
  return (
    <div className={cn("relative min-w-0 flex-1", className)}>
      <HouseIcon
        aria-hidden
        className="text-subtle pointer-events-none absolute top-1/2 left-4 size-6 -translate-y-1/2"
      />
      <Input {...props} className={cn(FIELD, "pl-12")} />
    </div>
  )
}

function StepOne({
  state,
  set,
  onBack,
  onNext,
}: {
  state: FinderState
  set: (patch: Partial<FinderState>) => void
  onBack: () => void
  onNext: () => void
}) {
  const id = useId()
  const places = state.places
  const setPlace = (i: number, patch: Partial<FinderState["places"][0]>) =>
    set({ places: places.map((p, j) => (i === j ? { ...p, ...patch } : p)) })
  const nextKind =
    PLACE_KINDS.find((k) => !places.some((p) => p.kind === k)) ?? "Other"

  return (
    <FinderShell
      aside={
        <AsideText step="Step 1 of 2">
          The places you go every day decide which areas can work. We can use
          them to keep your main commutes inside your limits.
        </AsideText>
      }
    >
      <section className="flex flex-col gap-6">
        <SectionTitle>Your household</SectionTitle>
        <div className="flex flex-col gap-3.5">
          <FieldLabel htmlFor={`${id}-home`}>
            Where do you currently live?
          </FieldLabel>
          <AddressInput
            id={`${id}-home`}
            value={state.home}
            onChange={(e) => set({ home: e.target.value })}
            placeholder="Friedrichstraße 68, 10117 Berlin"
            autoComplete="street-address"
          />
        </div>
        <div className="flex flex-wrap gap-x-[23px] gap-y-6">
          <div className="flex w-[266px] flex-col gap-3">
            <FieldLabel id={`${id}-kids`}>
              How many children do you have?
            </FieldLabel>
            <ChoiceGroup
              labelledBy={`${id}-kids`}
              options={KIDS_OPTIONS.map((n) => ({
                value: n,
                label: n === 3 ? "3+" : String(n),
              }))}
              value={state.kids}
              onChange={(kids) => set({ kids })}
            />
          </div>
          <div className="flex w-[267px] flex-col gap-3">
            <FieldLabel id={`${id}-baby`}>
              Are you expecting a new baby?
            </FieldLabel>
            <ChoiceGroup
              labelledBy={`${id}-baby`}
              size="lg"
              options={[
                { value: "yes", label: "Yes" },
                { value: "no", label: "No" },
              ]}
              value={state.expecting ? "yes" : "no"}
              onChange={(v) => set({ expecting: v === "yes" })}
            />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <SectionTitle>Your important places</SectionTitle>
        <div className="flex flex-col gap-[18px]">
          <div className="flex flex-col gap-3.5">
            <FieldLabel>Where do you go regularly?</FieldLabel>
            <ul className="flex flex-col gap-[18px]">
              {places.map((p, i) => (
                <li key={i} className="flex items-center gap-3 sm:gap-[18px]">
                  <Select
                    value={p.kind}
                    onValueChange={(v) =>
                      v && setPlace(i, { kind: v as PlaceKind })
                    }
                  >
                    <SelectTrigger
                      aria-label={`Kind of place ${i + 1}`}
                      className={cn(
                        FIELD,
                        "[&>svg]:text-heading! w-[120px] shrink-0 justify-between data-[size=default]:h-auto sm:w-[169px] [&>svg]:size-6!",
                      )}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLACE_KINDS.map((k) => (
                        <SelectItem key={k} value={k} className="text-base">
                          {k}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <AddressInput
                    aria-label={`${p.kind} address`}
                    value={p.address}
                    onChange={(e) => setPlace(i, { address: e.target.value })}
                    placeholder={
                      p.kind === "Work"
                        ? "Alexanderplatz 1"
                        : "Address or place"
                    }
                  />
                  {places.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${p.kind}`}
                      onClick={() =>
                        set({ places: places.filter((_, j) => j !== i) })
                      }
                      className="text-subtle -ml-1 shrink-0"
                    >
                      <XIcon />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex items-center gap-6">
            <button
              type="button"
              disabled={places.length >= MAX_PLACES}
              onClick={() =>
                set({ places: [...places, { kind: nextKind, address: "" }] })
              }
              className="border-input text-subtle hover:bg-muted focus-visible:ring-ring/50 disabled:bg-chip disabled:text-faint flex items-center gap-4 rounded-[4px] border p-3 text-lg leading-normal outline-none focus-visible:ring-3 disabled:cursor-not-allowed"
            >
              <PlusIcon aria-hidden className="size-6" />
              Add an address
            </button>
            <p className="text-faint text-sm font-medium">
              {places.length} of {MAX_PLACES} places
            </p>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <SectionTitle>Commuting</SectionTitle>
        <div className="flex flex-col gap-3.5">
          <FieldLabel id={`${id}-commute`}>
            What is your maximum acceptable one-way commute?
          </FieldLabel>
          <ChoiceGroup
            labelledBy={`${id}-commute`}
            size="lg"
            options={COMMUTE_OPTIONS.map((m) => ({
              value: m,
              label: `${m} min`,
            }))}
            value={state.commute}
            onChange={(commute) => set({ commute })}
          />
        </div>
      </section>

      <StepButtons
        back={onBack}
        next={onNext}
        nextLabel="Continue to priorities"
      />
    </FinderShell>
  )
}

/**
 * The two-step Kiez finder. Answers live in local state while typing and go into the
 * URL on every step change, so Back/Forward, reloads and shared links keep them.
 */
export function FinderWizard({
  initial,
  step,
}: {
  initial: FinderState
  step: 1 | 2
}) {
  const router = useRouter()
  const [state, setState] = useState<FinderState>(() => ({
    ...initial,
    places: initial.places.length
      ? initial.places
      : [{ kind: "Work", address: "" }],
  }))
  const [pending, setPending] = useState(false)
  const set = (patch: Partial<FinderState>) =>
    setState((s) => ({ ...s, ...patch }))
  const go = (path: string, extra?: Record<string, string>) =>
    router.push(`${path}?${finderQuery(state, extra)}`, { scroll: true })

  return step === 1 ? (
    <StepOne
      state={state}
      set={set}
      onBack={() => router.push("/")}
      onNext={() => go("/find", { step: "2" })}
    />
  ) : (
    <PrioritiesStep
      state={state}
      set={set}
      pending={pending}
      onBack={() => go("/find")}
      onNext={() => {
        setPending(true)
        go("/find/results")
      }}
    />
  )
}
