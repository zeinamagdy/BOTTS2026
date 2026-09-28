import Link from "next/link"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** The orange "Find my Kiez →" pill. Points at /explore until the finder exists. */
export function FindKiezButton({
  size = "pill-lg",
  className,
}: {
  size?: "pill" | "pill-lg"
  className?: string
}) {
  return (
    <Button
      size={size}
      nativeButton={false}
      render={<Link href="/explore" />}
      className={cn("hover:bg-primary/90", className)}
    >
      Find my Kiez →
    </Button>
  )
}
