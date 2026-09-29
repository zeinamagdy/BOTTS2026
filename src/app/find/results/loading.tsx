import { ResultsShell } from "@/components/finder/finder-shell"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <ResultsShell>
      <div className="flex flex-col gap-5">
        <h1 className="text-foreground text-4xl leading-[1.1] font-medium sm:text-[52px]">
          Finding your Kiez…
        </h1>
        <p className="text-muted-foreground text-lg">
          Weighing 542 Berlin neighbourhoods against your priorities and
          checking the commutes.
        </p>
        <div className="flex flex-wrap gap-[18px]">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-11 w-36 rounded-full" />
          ))}
        </div>
      </div>
      <ul className="grid gap-3.5 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[760px] rounded-[20px]" />
        ))}
      </ul>
    </ResultsShell>
  )
}
