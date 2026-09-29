"use client"

import { cn } from "@/lib/utils"

/**
 * A row of single-choice chips (Figma "Pagination" and "Input" option components):
 * outlined grey when idle, filled Brand/500 when selected. Arrow keys move the selection.
 */
export function ChoiceGroup<T extends string | number>({
  options,
  value,
  onChange,
  label,
  labelledBy,
  size = "md",
}: {
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  label?: string
  labelledBy?: string
  /** md: 16 px square-ish chips (children count), lg: 18 px text chips */
  size?: "md" | "lg"
}) {
  const move = (i: number) => {
    const next = options[(i + options.length) % options.length]
    onChange(next.value)
    return next.value
  }
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-labelledby={labelledBy}
      className="flex flex-wrap items-center gap-3"
    >
      {options.map((o, i) => {
        const selected = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              const d =
                e.key === "ArrowRight" || e.key === "ArrowDown"
                  ? 1
                  : e.key === "ArrowLeft" || e.key === "ArrowUp"
                    ? -1
                    : 0
              if (!d) return
              e.preventDefault()
              const v = move(i + d)
              const group = e.currentTarget.parentElement
              const idx = options.findIndex((x) => x.value === v)
              ;(group?.children[idx] as HTMLElement | undefined)?.focus()
            }}
            className={cn(
              "focus-visible:ring-ring/50 border whitespace-nowrap transition-colors outline-none focus-visible:ring-3",
              size === "md"
                ? "min-w-10 rounded-lg px-3 py-2 text-base leading-none"
                : "rounded-[4px] px-2 py-0.5 text-lg leading-normal",
              selected
                ? "bg-brand-500 border-brand-500 text-white"
                : "border-input text-faint hover:border-subtle hover:text-subtle",
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Multi-select version of `ChoiceGroup`: each chip toggles on its own (aria-pressed). */
export function ToggleChips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[]
  value: readonly T[]
  onChange: (v: T[]) => void
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-3">
      {options.map((o) => {
        const on = value.includes(o.value)
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() =>
              onChange(
                on ? value.filter((v) => v !== o.value) : [...value, o.value],
              )
            }
            className={cn(
              "focus-visible:ring-ring/50 rounded-[4px] border px-2 py-0.5 text-lg leading-normal whitespace-nowrap transition-colors outline-none focus-visible:ring-3",
              on
                ? "bg-brand-500 border-brand-500 text-white"
                : "border-input text-faint hover:border-subtle hover:text-subtle",
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
