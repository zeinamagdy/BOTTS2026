"use client"

import { useId, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { SparklesIcon } from "lucide-react"
import { toast } from "sonner"
import { refineAction } from "@/app/find/actions"
import { FIELD } from "@/components/finder/form-bits"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  effectivePicks,
  finderQuery,
  type FinderState,
} from "@/lib/finder-params"
import { cn } from "@/lib/utils"

type Area = { plrId: string; name: string }

/** How the top list moved: "Parkstraße is new at #1", "Buch: #1 → #3" */
function rankingChanges(before: Area[], after: Area[]) {
  const was = new Map(before.map((a, i) => [a.plrId, i]))
  const out: string[] = []
  after.forEach((a, i) => {
    const old = was.get(a.plrId)
    if (old == null) out.push(`${a.name} is new at #${i + 1}`)
    else if (old !== i) out.push(`${a.name}: #${old + 1} → #${i + 1}`)
  })
  for (const b of before)
    if (!after.some((a) => a.plrId === b.plrId))
      out.push(`${b.name} dropped out`)
  return out.length ? out : ["The same areas still fit best, in the same order"]
}

/**
 * "Refine": the person says what changed ("rent matters more", "we need a pool
 * nearby"). The AI turns it into new picks; the URL changes and the page
 * re-ranks as usual. Wishes we can't rank are looked up on the web per card.
 */
export function RefineBox({
  state,
  areas,
}: {
  state: FinderState
  areas: Area[]
}) {
  const id = useId()
  const router = useRouter()
  const [text, setText] = useState("")
  const [pending, start] = useTransition()
  const [last, setLast] = useState<{
    changes: string[]
    before: Area[]
  } | null>(null)

  const submit = () => {
    if (!text.trim()) return
    start(async () => {
      const res = await refineAction({
        text,
        kids: state.kids,
        expecting: state.expecting,
        placeKinds: state.places.map((p) => p.kind),
        current: effectivePicks(state),
        extras: state.extras,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      if (!res.changes.length) {
        toast("That matches your answers already, so nothing changed.")
        return
      }
      setLast({ changes: res.changes, before: areas })
      setText("")
      router.push(
        `/find/results?${finderQuery({ ...state, picks: res.picks, extras: res.extras })}`,
        { scroll: false },
      )
    })
  }

  return (
    <section className="flex flex-col gap-3">
      <label htmlFor={id} className="text-heading text-lg font-medium">
        Not quite right? Tell us what matters.
      </label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Textarea
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          maxLength={500}
          placeholder="e.g. rent matters more than I said, and we’d love a swimming pool nearby"
          className={cn(
            FIELD,
            "placeholder:text-faint field-sizing-content min-h-[60px] flex-1 resize-none rounded-2xl placeholder:font-normal",
          )}
        />
        <Button
          type="button"
          onClick={submit}
          disabled={pending || !text.trim()}
          className="bg-brand-500 hover:bg-brand-500/90 h-auto shrink-0 rounded-full px-6 py-4 text-base font-bold text-white"
        >
          <SparklesIcon />
          {pending ? "Re-ranking…" : "Update results"}
        </Button>
      </div>
      {last && !pending && (
        <div
          aria-live="polite"
          className="bg-secondary flex flex-col gap-2 rounded-2xl p-4 leading-normal"
        >
          <p className="text-heading font-bold">What changed</p>
          <ul className="text-foreground flex flex-col gap-1">
            {last.changes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <p className="text-muted-foreground text-sm">
            {rankingChanges(last.before, areas).join(" · ")}
          </p>
        </div>
      )}
      <p className="text-subtle text-sm">
        The AI only changes your answers; the ranking itself is the same
        calculation as before. Wishes we have no data for are looked up on the
        web for each area.
      </p>
    </section>
  )
}
