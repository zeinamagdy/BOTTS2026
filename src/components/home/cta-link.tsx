import Link from "next/link"
import type { ComponentProps, ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * The Figma "Signup" pill: orange (on beige or a photo) or cream (on orange
 * or a photo). Brown text in both, so it reads the same in dark mode.
 */
export function CtaLink({
  href,
  tone = "orange",
  icon,
  className,
  children,
}: {
  href: ComponentProps<typeof Link>["href"]
  tone?: "orange" | "cream"
  icon: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <Button
      size="pill-lg"
      nativeButton={false}
      render={<Link href={href} />}
      className={cn(
        "text-brand-950 gap-2 px-10 [&_svg:not([class*='size-'])]:size-6",
        tone === "orange"
          ? "bg-brand-500 hover:bg-brand-500/85"
          : "bg-cream hover:bg-cream/85",
        className,
      )}
    >
      {children}
      {icon}
    </Button>
  )
}
