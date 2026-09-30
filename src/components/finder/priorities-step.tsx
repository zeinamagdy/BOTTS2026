"use client"

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react"
import { ChevronDownIcon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"
import { suggestPicksAction } from "@/app/find/actions"
import { ChoiceGroup, ToggleChips } from "@/components/finder/choice-group"
import {
  AsideText,
  FieldLabel,
  FinderShell,
  SectionTitle,
} from "@/components/finder/finder-shell"
import { FIELD, StepButtons } from "@/components/finder/form-bits"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  cleanExtras,
  effectivePicks,
  FEATURED_KEYS,
  INTERESTS,
  LEVELS,
  MUST_HAVES,
  PRIORITY_GROUPS,
  PRIORITY_KEYS,
  PRIORITY_META,
  RENT_CAPS,
  type FinderState,
  type Picks,
  type PriorityKey,
} from "@/lib/finder-params"
import { cn } from "@/lib/utils"

const HIDDEN_KEYS = PRIORITY_KEYS.filter((k) => !FEATURED_KEYS.includes(k))

function PriorityRow({
  k,
  level,
  onChange,
  highlighted,
}: {
  k: PriorityKey
  level: Picks["levels"][PriorityKey]
  onChange: (l: Picks["levels"][PriorityKey]) => void
  highlighted: boolean
}) {
  const meta = PRIORITY_META[k]
  return (
    <li
      className={cn(
        "-mx-3 flex flex-col gap-2 rounded-lg px-3 py-2 transition-colors duration-700 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
        highlighted && "bg-secondary",
      )}
    >
      <div className="min-w-0">
        <p className="text-heading text-lg leading-normal font-medium">
          {meta.label}
        </p>
        <p className="text-subtle text-sm">{meta.hint}</p>
      </div>
      <div className="shrink-0">
        <ChoiceGroup
          label={meta.label}
          size="lg"
          options={LEVELS}
          value={level}
          onChange={onChange}
        />
      </div>
    </li>
  )
}

function Subsection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3.5">
      <h3 className="text-heading text-xl leading-[1.1] font-medium">
        {title}
      </h3>
      {children}
    </div>
  )
}

/**
 * Step 2, "What matters most?": one Must have / Flexible / Don't need switch per ranking key from
 * the database (`PRIORITY_META`), hobbies, must-haves and a rent cap. The optional text
 * box asks the AI to fill in the switches, which the person can then adjust.
 */
export function PrioritiesStep({
  state,
  set,
  onBack,
  onNext,
  pending,
}: {
  state: FinderState
  set: (patch: Partial<FinderState>) => void
  onBack: () => void
  onNext: () => void
  pending: boolean
}) {
  const id = useId()
  const picks = effectivePicks(state)
  const setPicks = (patch: Partial<Picks>) =>
    set({ picks: { ...picks, ...patch } })
  const [expanded, setExpanded] = useState(false)
  // Extra keys that are not "OK" stay visible while collapsed (and keep showing if set back)
  const [pinned, setPinned] = useState<PriorityKey[]>(() =>
    HIDDEN_KEYS.filter((k) => picks.levels[k] !== "ok"),
  )
  const [highlight, setHighlight] = useState<PriorityKey[]>([])
  const [filling, startFilling] = useTransition()

  useEffect(() => {
    if (!highlight.length) return
    const t = setTimeout(() => setHighlight([]), 2500)
    return () => clearTimeout(t)
  }, [highlight])

  const textRef = useRef<HTMLTextAreaElement>(null)
  const [needText, setNeedText] = useState(false)

  const fillIn = () => {
    if (!state.priorities.trim()) {
      setNeedText(true)
      textRef.current?.focus()
      return
    }
    startFilling(async () => {
      const res = await suggestPicksAction({
        text: state.priorities,
        kids: state.kids,
        expecting: state.expecting,
        placeKinds: state.places.map((p) => p.kind),
        current: picks,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      const changed = PRIORITY_KEYS.filter(
        (k) => res.picks.levels[k] !== picks.levels[k],
      )
      set({ picks: res.picks, extras: cleanExtras(res.extras) })
      setHighlight(changed)
      setPinned((p) => [
        ...new Set([...p, ...changed.filter((k) => HIDDEN_KEYS.includes(k))]),
      ])
      toast.success(
        changed.length
          ? `Filled in ${changed.length} ${changed.length === 1 ? "priority" : "priorities"} from your text. Adjust them below.`
          : "Your text matches the current picks.",
      )
    })
  }

  const visible = PRIORITY_KEYS.filter(
    (k) => expanded || FEATURED_KEYS.includes(k) || pinned.includes(k),
  )
  const more = PRIORITY_KEYS.length - visible.length

  return (
    <FinderShell
      aside={
        <AsideText step="Step 2 of 2" title="Priorities & trade-offs">
          Every move trades something. Tell us what you must have and what you
          don&apos;t need
        </AsideText>
      }
    >
      <div className="flex flex-col gap-6">
        <SectionTitle>What matters most?</SectionTitle>
        <div className="flex flex-col gap-3.5">
          <FieldLabel htmlFor={`${id}-q`}>
            Describe it in your own words (optional)
          </FieldLabel>
          <Textarea
            id={`${id}-q`}
            value={state.priorities}
            ref={textRef}
            onChange={(e) => {
              set({ priorities: e.target.value })
              setNeedText(false)
            }}
            maxLength={1000}
            aria-invalid={needText || undefined}
            aria-describedby={needText ? `${id}-need` : undefined}
            placeholder="e.g. A quiet street and good schools matter most, and a park nearby. I can give up being central."
            // lighter and regular weight, so the example never reads as typed text
            className={cn(
              FIELD,
              "placeholder:text-faint field-sizing-fixed min-h-[120px] resize-y placeholder:font-normal",
            )}
          />
          {needText && (
            <p id={`${id}-need`} className="text-destructive text-sm">
              Write a few words first, then we fill in the priorities below.
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={fillIn}
            disabled={filling}
            className="text-heading h-auto self-start rounded-[12px] px-5 py-3 text-base font-bold"
          >
            <SparklesIcon className="text-brand-500" />
            {filling ? "Reading your text…" : "Fill in from my text"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {state.picks == null && (state.kids > 0 || state.expecting) && (
          <p className="text-subtle text-sm">
            We started from your household: Kitas and schools are set to Must
            have.
          </p>
        )}
        {PRIORITY_GROUPS.map((g) => {
          const keys = visible.filter((k) => PRIORITY_META[k].group === g)
          if (!keys.length) return null
          return (
            <section key={g} className="flex flex-col gap-2">
              <h3 className="text-subtle text-sm font-medium tracking-wide uppercase">
                {g}
              </h3>
              <ul className="flex flex-col gap-1">
                {keys.map((k) => (
                  <PriorityRow
                    key={k}
                    k={k}
                    level={picks.levels[k]}
                    highlighted={highlight.includes(k)}
                    onChange={(l) =>
                      setPicks({ levels: { ...picks.levels, [k]: l } })
                    }
                  />
                ))}
              </ul>
            </section>
          )
        })}
        {(expanded || more > 0) && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((e) => !e)}
            className="text-brand-600 flex items-center gap-1.5 self-start text-base font-bold hover:underline"
          >
            {expanded ? "Fewer priorities" : `More priorities (${more})`}
            <ChevronDownIcon
              aria-hidden
              className={cn(
                "size-5 transition-transform",
                expanded && "rotate-180",
              )}
            />
          </button>
        )}
      </div>

      <Subsection title="Nice to have nearby">
        <ToggleChips
          label="Nice to have nearby"
          options={INTERESTS}
          value={picks.hobbies}
          onChange={(hobbies) => setPicks({ hobbies })}
        />
        {state.extras.length > 0 && (
          <ul className="flex flex-wrap items-center gap-2">
            {state.extras.map((e) => (
              <li
                key={e}
                className="text-faint border-input rounded-full border border-dashed px-3 py-1.5 text-sm"
              >
                {e}
              </li>
            ))}
            <li className="text-faint text-sm">
              Noted: we can’t rank these, so the results look them up on the web
            </li>
          </ul>
        )}
      </Subsection>

      <Subsection title="Must-haves">
        <ToggleChips
          label="Must-haves"
          options={MUST_HAVES}
          value={picks.must}
          onChange={(must) => setPicks({ must })}
        />
      </Subsection>

      <Subsection title="Max cold rent per m²">
        <ChoiceGroup
          label="Max cold rent per m²"
          size="lg"
          options={[
            { value: 0, label: "No limit" },
            ...RENT_CAPS.map((c) => ({ value: c, label: `€${c}` })),
          ]}
          value={picks.maxRent ?? 0}
          onChange={(v) => setPicks({ maxRent: v || null })}
        />
        <p className="text-subtle text-sm">
          Average of synthetic listings, 25–40% below the real market. Median
          across Berlin: €11.90.
        </p>
      </Subsection>

      <StepButtons
        back={onBack}
        next={onNext}
        nextLabel={pending ? "Finding your Kiez…" : "Show my suggestions"}
        pending={pending || filling}
      />
    </FinderShell>
  )
}
