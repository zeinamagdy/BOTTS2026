import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

const STEPS = 4
export const eur = (n: number) => `€${Math.round(n).toLocaleString("en")}`

/** Figma progress: "LANDLORD", 4 bars, "THE FLAT" (the same on every step); `label` names the step for screen readers. */
export function Progress({
  step,
  label,
  noun,
}: {
  step: number
  label: string
  noun: string
}) {
  return (
    <div className="flex items-center gap-4 sm:gap-5">
      <p className="text-muted-foreground hidden shrink-0 font-bold sm:block">
        LANDLORD
      </p>
      <div
        role="progressbar"
        aria-label={`Step ${step} of ${STEPS}: ${label}`}
        aria-valuemin={1}
        aria-valuemax={STEPS}
        aria-valuenow={step}
        className="flex flex-1 gap-2.5 py-2.5 sm:px-2.5"
      >
        {Array.from({ length: STEPS }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-2 flex-1 rounded-full",
              i < step ? "bg-brand-500" : "bg-brand-200 dark:bg-brand-950",
            )}
          />
        ))}
      </div>
      <p className="text-muted-foreground shrink-0 text-sm font-bold sm:text-base">
        THE {noun.toUpperCase()}
      </p>
    </div>
  )
}

export function Heading({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-heading text-2xl leading-[1.1] font-medium sm:text-[28px]">
      {children}
    </h2>
  )
}

export function Divider() {
  return <hr className="border-input w-full" />
}
