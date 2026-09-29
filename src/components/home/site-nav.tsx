import Link from "next/link"
import { MenuIcon } from "lucide-react"
import { FindKiezButton } from "@/components/home/find-kiez-button"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

const LINKS = {
  people: [
    { href: "/#how-it-works", label: "How it works" },
    { href: "/#hidden-gems", label: "Hidden gems" },
    { href: "/landlord", label: "For landlords" },
    { href: "/#about", label: "About" },
  ],
  landlords: [
    { href: "/", label: "For renters" },
    { href: "/landlord", label: "For landlords", current: true },
    { href: "/#how-it-works", label: "How it works" },
    { href: "/#about", label: "About" },
  ],
} satisfies Record<string, { href: string; label: string; current?: boolean }[]>

function Logo({ overlay }: { overlay: boolean }) {
  return (
    <Link
      href="/"
      className={cn(
        "flex items-center gap-2",
        overlay ? "text-white" : "text-heading",
      )}
    >
      {/* Placeholder mark from the design, until the real logo exists */}
      <span
        className={cn(
          "h-[34px] w-14 rounded-full border-5",
          overlay ? "border-white" : "border-heading",
        )}
      />
      <span className="text-[28px] leading-[1.1] font-medium">KiezKiss</span>
    </Link>
  )
}

/**
 * `overlay`: transparent, white, on top of the hero photo (landing page).
 * `page`: dark text in the page flow, without the CTA (the finder screens).
 */
export function SiteNav({
  tone = "overlay",
  audience = "people",
}: {
  tone?: "overlay" | "page"
  /** `landlords`: the landlord flow, which links back to the tenant side */
  audience?: "people" | "landlords"
}) {
  const overlay = tone === "overlay"
  const links = LINKS[audience]
  const onPhoto = overlay && "text-white hover:bg-white/15 hover:text-white"
  return (
    <header
      className={cn(
        "z-20 px-4 py-4 sm:px-6",
        overlay
          ? "absolute inset-x-0 top-0"
          : "mx-auto w-full max-w-[1184px] sm:py-8",
      )}
    >
      <nav className="flex items-center justify-between gap-4">
        <Logo overlay={overlay} />
        <div
          className={cn(
            "hidden items-center md:flex",
            overlay
              ? "gap-6 font-medium text-white"
              : "text-muted-foreground ml-auto gap-8",
          )}
        >
          {links.map((l) => {
            const current = "current" in l && l.current
            return (
              <a
                key={l.href}
                href={l.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "hover:underline",
                  current && "text-brand-600 font-medium",
                )}
              >
                {l.label}
              </a>
            )
          })}
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle className={cn(onPhoto)} />
          {overlay && (
            <FindKiezButton size="pill" className="hidden sm:inline-flex" />
          )}
          <Sheet>
            <SheetTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Open menu"
                  className={cn(onPhoto, "md:hidden")}
                />
              }
            >
              <MenuIcon />
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>KiezKiss</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-4 px-4 text-lg font-medium">
                {links.map((l) => (
                  <SheetClose key={l.href} render={<a href={l.href} />}>
                    {l.label}
                  </SheetClose>
                ))}
                <FindKiezButton size="pill" className="mt-2" />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  )
}
