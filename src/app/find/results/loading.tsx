import { AsideText, FinderShell } from "@/components/finder/finder-shell"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <FinderShell
      aside={
        <AsideText title="Finding your Kiez…">
          Weighing 542 Berlin neighbourhoods against your priorities and
          checking the commutes.
        </AsideText>
      }
    >
      <Skeleton className="h-8 w-64" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-40 w-full rounded-2xl" />
      ))}
    </FinderShell>
  )
}
