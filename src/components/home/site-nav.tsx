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

const LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#hidden-gems", label: "For people" },
  { href: "#about", label: "About" },
]

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-white">
      {/* Placeholder mark from the design, until the real logo exists */}
      <span className="h-[47px] w-14 rounded-full border-5 border-white" />
      <span className="font-bold">Kiez Concierge</span>
    </Link>
  )
}

/** Transparent navbar that sits on top of the hero photo. */
export function SiteNav() {
  return (
    <header className="absolute inset-x-0 top-0 z-20 px-4 py-4 sm:px-6">
      <nav className="flex items-center justify-between gap-4">
        <Logo />
        <div className="hidden items-center gap-6 font-medium text-white md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="hover:underline">
              {l.label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle className="text-white hover:bg-white/15 hover:text-white" />
          <FindKiezButton size="pill" className="hidden sm:inline-flex" />
          <Sheet>
            <SheetTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Open menu"
                  className="text-white hover:bg-white/15 hover:text-white md:hidden"
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
