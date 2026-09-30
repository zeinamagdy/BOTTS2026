"use client"

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react"
import { SparklesIcon } from "lucide-react"
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
  EXTRA_KEYS,
  groupLevel,
  INTERESTS,
  LEVELS,
  MUST_HAVES,
  PRIORITY_META,
  RENT_CAPS,
  SIMPLE_PRIORITIES,
  withGroupLevel,
  type FinderState,
  type Level,
  type Picks,
  type SimplePriority,
} from "@/lib/finder-params"
import { cn } from "@/lib/utils"

type Simple = SimplePriority["value"]

function PriorityRow({
  p,
  level,
  onChange,
  highlighted,
}: {
  p: SimplePriority
  level: Level
  onChange: (l: Level) => void
  highlighted: boolean
}) {
  return (
    <li
      className={cn(
        "-mx-3 flex flex-col gap-2 rounded-lg px-3 py-1.5 transition-colors duration-700 @xl:flex-row @xl:items-center @xl:justify-between @xl:gap-4",
        highlighted && "bg-secondary",
      )}
    >
      <div className="min-w-0">
        <p className="text-heading text-lg leading-normal font-medium">
          {p.label}
        </p>
        <p className="text-subtle text-sm">{p.hint}</p>
      </div>
      <div className="shrink-0">
        <ChoiceGroup
          label={p.label}
          size="lg"
          options={LEVELS}
          value={level}
          onChange={onChange}
        />
      </div>
    </li>
  )
}

/** One group of choices as a compact card: tight inside, the page gap between groups */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-background flex flex-col gap-3 rounded-[20px] p-5 sm:p-6">
      <h3 className="text-heading text-xl leading-[1.1] font-medium">
        {title}
      </h3>
      {children}
    </section>
  )
}

/**
 * Step 2, "What matters most?": four broad Must have / Flexible / Don't need switches
 * (`SIMPLE_PRIORITIES`, each covering one or more ranking factors), things nearby,
 * must-haves and a rent cap. The optional text box asks the AI to fill in the switches;
 * a priority it would raise to Must have is set to Flexible until the person confirms.
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
  const [highlight, setHighlight] = useState<Simple[]>([])
  /** Suggested by the text as Must have, waiting for a yes */
  const [confirm, setConfirm] = useState<Simple[]>([])
  const [filling, startFilling] = useTransition()

  useEffect(() => {
    if (!highlight.length) return
    const t = setTimeout(() => setHighlight([]), 2500)
    return () => clearTimeout(t)
  }, [highlight])

  const setLevel = (p: SimplePriority, l: Level) => {
    setPicks({ levels: withGroupLevel(picks.levels, p, l) })
    setConfirm((c) => c.filter((v) => v !== p.value))
  }

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
      // A new Must have from the text is only a suggestion: Flexible until confirmed
      let levels = res.picks.levels
      const ask: Simple[] = []
      for (const p of SIMPLE_PRIORITIES)
        if (
          groupLevel(levels, p) === "protect" &&
          groupLevel(picks.levels, p) !== "protect"
        ) {
          levels = withGroupLevel(levels, p, "ok")
          ask.push(p.value)
        }
      const changed = SIMPLE_PRIORITIES.filter(
        (p) => groupLevel(levels, p) !== groupLevel(picks.levels, p),
      ).map((p) => p.value)
      set({
        picks: { ...res.picks, levels },
        extras: cleanExtras(res.extras),
      })
      setConfirm(ask)
      setHighlight([...changed, ...ask])
      toast.success(
        ask.length
          ? "Read your text. Confirm below what should be a Must have."
          : changed.length
            ? `Filled in ${changed.length} ${changed.length === 1 ? "priority" : "priorities"} from your text. Adjust them below.`
            : "Your text matches the current picks.",
      )
    })
  }

  // Factors outside the four switches that the text moved away from Flexible
  const extraSet = EXTRA_KEYS.filter((k) => picks.levels[k] !== "ok")

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
            placeholder="e.g. Good schools matter most, and nature nearby for hiking and cycling. I can give up being central."
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

      <Group title="Your priorities">
        {state.picks == null && (state.kids > 0 || state.expecting) && (
          <p className="text-subtle text-sm">
            We started from your household: Family-friendly is set to Must have.
          </p>
        )}
        <ul className="@container flex flex-col gap-0.5">
          {SIMPLE_PRIORITIES.map((p) => (
            <PriorityRow
              key={p.value}
              p={p}
              level={groupLevel(picks.levels, p)}
              highlighted={highlight.includes(p.value)}
              onChange={(l) => setLevel(p, l)}
            />
          ))}
        </ul>
        {confirm.map((v) => {
          const p = SIMPLE_PRIORITIES.find((x) => x.value === v)!
          return (
            <div
              key={v}
              role="status"
              className="bg-secondary flex flex-col gap-3 rounded-[12px] p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <p className="text-heading text-base">
                Your text suggests <strong>{p.label}</strong> matters. We set it
                to Flexible. Make it a Must have?
              </p>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  onClick={() => setLevel(p, "protect")}
                  className="rounded-[10px]"
                >
                  Yes, Must have
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLevel(p, "ok")}
                  className="rounded-[10px]"
                >
                  Keep Flexible
                </Button>
              </div>
            </div>
          )
        })}
        {extraSet.length > 0 && (
          <p className="text-subtle flex flex-wrap items-center gap-x-2 text-sm">
            Also from your text:{" "}
            {extraSet
              .map(
                (k) =>
                  `${PRIORITY_META[k].label} (${LEVELS.find((l) => l.value === picks.levels[k])!.label})`,
              )
              .join(", ")}
            <button
              type="button"
              onClick={() =>
                setPicks({
                  levels: {
                    ...picks.levels,
                    ...Object.fromEntries(extraSet.map((k) => [k, "ok"])),
                  },
                })
              }
              className="text-brand-600 font-bold hover:underline"
            >
              Reset
            </button>
          </p>
        )}
      </Group>

      <Group title="Nice to have nearby">
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
      </Group>

      <Group title="Must-haves">
        <ToggleChips
          label="Must-haves"
          options={MUST_HAVES}
          value={picks.must}
          onChange={(must) => setPicks({ must })}
        />
      </Group>

      <Group title="Max cold rent per m²">
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
      </Group>

      <StepButtons
        back={onBack}
        next={onNext}
        nextLabel={pending ? "Finding your Kiez…" : "Show my suggestions"}
        pending={pending || filling}
      />
    </FinderShell>
  )
}
