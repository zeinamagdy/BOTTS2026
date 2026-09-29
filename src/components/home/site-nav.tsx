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

const LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#hidden-gems", label: "Hidden gems" },
  { href: "/#about", label: "About" },
]

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
          "h-[47px] w-14 rounded-full border-5",
          overlay ? "border-white" : "border-heading",
        )}
      />
      <span className="font-bold">Kiez Concierge</span>
    </Link>
  )
}

/**
 * `overlay`: transparent, white, on top of the hero photo (landing page).
 * `page`: dark text in the page flow, without the CTA (the finder screens).
 */
export function SiteNav({ tone = "overlay" }: { tone?: "overlay" | "page" }) {
  const overlay = tone === "overlay"
  const onPhoto = overlay && "text-white hover:bg-white/15 hover:text-white"
  return (
    <header
      className={cn(
        "z-20 px-4 py-4 sm:px-6",
        overlay ? "absolute inset-x-0 top-0" : "mx-auto w-full max-w-[1184px]",
      )}
    >
      <nav className="flex items-center justify-between gap-4">
        <Logo overlay={overlay} />
        <div
          className={cn(
            "hidden items-center gap-6 font-medium md:flex",
            overlay ? "text-white" : "text-heading ml-auto",
          )}
        >
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="hover:underline">
              {l.label}
            </a>
          ))}
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
                <SheetTitle>Kiez Concierge</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-4 px-4 text-lg font-medium">
                {LINKS.map((l) => (
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
