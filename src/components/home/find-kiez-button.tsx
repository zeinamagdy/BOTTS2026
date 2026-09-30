import { ArrowRightIcon } from "lucide-react"
import { CtaLink } from "@/components/home/cta-link"

/** The orange "Find my Kiez →" pill: starts the Kiez finder. */
export function FindKiezButton({
  label = "Find my Kiez",
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <CtaLink href="/find" icon={<ArrowRightIcon />} className={className}>
      {label}
    </CtaLink>
  )
}
