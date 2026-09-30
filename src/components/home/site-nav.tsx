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
    { href: "/#for-renters", label: "For renters" },
    { href: "/#for-landlords", label: "For landlords" },
    { href: "/#how-it-works", label: "How it works" },
    { href: "/#about", label: "About" },
  ],
  landlords: [
    { href: "/", label: "For renters" },
    { href: "/landlord", label: "For landlords", current: true },
    { href: "/#how-it-works", label: "How it works" },
    { href: "/#about", label: "About" },
  ],
} satisfies Record<string, { href: string; label: string; current?: boolean }[]>

/** The KiezKiss mark from Figma (node 117:727), in the current text colour */
function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32.88 33.41" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M16.7148 20.1666C21.3093 21.5632 24.2878 23.9753 25.5977 26.2594C26.4811 27.8003 26.5743 29.1816 26.1553 30.2769C25.7456 31.3477 24.6946 32.5351 22.4941 33.4137H17.5215C17.2056 33.2425 16.9148 33.0401 16.6514 32.8101C15.2996 31.6303 14.3593 29.5235 14.4385 26.8648C14.4988 24.8422 15.1726 22.4947 16.7148 20.1666ZM0 20.0797C2.78374 19.2184 6.34941 18.7181 10.8457 19.0826C11.2933 19.1189 11.7316 19.1634 12.1602 19.2164C10.8058 21.7028 10.1271 24.2727 10.0537 26.734C9.98152 29.1567 10.5124 31.4796 11.5938 33.4137H4.85742C2.17495 33.4137 9.39302e-05 31.2387 0 28.5562V20.0797ZM31.0342 10.2008C32.1994 11.1219 32.8789 12.5259 32.8789 14.0113V28.5562C32.8788 30.6801 31.5154 32.4843 29.6162 33.1441C29.8654 32.7298 30.0789 32.2965 30.252 31.8443C31.2378 29.2675 30.7952 26.5053 29.4033 24.0777C27.6461 21.013 24.3349 18.333 19.8486 16.61C22.4509 14.3142 26.1281 12.2297 31.165 10.7398L30.9961 10.1705L31.0342 10.2008ZM13.4277 1.04647C15.1932 -0.348824 17.6857 -0.348825 19.4512 1.04647L27.4277 7.35018C21.9116 9.34321 17.8283 12.1211 15.0107 15.232C13.7958 14.9935 12.5239 14.8169 11.2002 14.7096C6.78434 14.3515 3.07752 14.737 0 15.524V14.0113C0 12.5257 0.680179 11.1219 1.8457 10.2008L13.4277 1.04647Z"
      />
    </svg>
  )
}

function Logo({ overlay }: { overlay: boolean }) {
  return (
    <Link
      href="/"
      className={cn(
        "flex items-center gap-2",
        overlay ? "text-white" : "text-heading",
      )}
    >
      <LogoMark className="h-[33px] w-[33px]" />
      <span className="text-[23px] leading-normal font-semibold">KiezKiss</span>
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
              ? "ml-auto gap-8 text-white"
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
                <FindKiezButton className="mt-2" />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  )
}
