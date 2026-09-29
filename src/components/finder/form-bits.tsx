import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Figma "Input": 16 px padding, 4 px radius, grey fill, 18 px medium text. */
export const FIELD =
  "bg-background border-input text-heading placeholder:text-subtle h-auto rounded-[4px] p-4 text-lg leading-normal font-medium md:text-lg dark:bg-background"

/** Back (ghost) + primary Brand/500 button at the bottom of every step. */
export function StepButtons({
  back,
  next,
  nextLabel,
  pending,
}: {
  back: () => void
  next: () => void
  nextLabel: string
  pending?: boolean
}) {
  const base =
    "h-auto flex-1 rounded-[12px] px-8 py-4 text-lg leading-normal font-bold"
  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:gap-[19px]">
      <Button
        type="button"
        variant="ghost"
        onClick={back}
        className={cn(base, "text-subtle")}
      >
        Back
      </Button>
      <Button
        type="button"
        onClick={next}
        disabled={pending}
        className={cn(base, "bg-brand-500 hover:bg-brand-600 text-white")}
      >
        {nextLabel}
      </Button>
    </div>
  )
}
