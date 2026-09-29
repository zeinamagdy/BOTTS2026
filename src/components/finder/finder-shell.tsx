import type { ReactNode } from "react"
import { SiteNav } from "@/components/home/site-nav"

/** Page frame of every finder screen (Figma "Step 01"/"Step 2"): navbar + white card with a grey side panel. */
export function FinderShell({
  aside,
  children,
}: {
  aside: ReactNode
  children: ReactNode
}) {
  return (
    <main className="flex flex-1 flex-col">
      <SiteNav tone="page" />
      <div className="mx-auto w-full max-w-[1184px] px-4 pt-4 pb-16 sm:px-6 sm:pt-8">
        <div className="bg-card flex flex-col gap-8 rounded-3xl p-5 sm:p-10 lg:flex-row lg:items-start lg:gap-[84px]">
          <aside className="bg-background rounded-[20px] p-6 sm:p-8 lg:sticky lg:top-6 lg:w-[399px] lg:shrink-0">
            {aside}
          </aside>
          <div className="flex min-w-0 flex-1 flex-col gap-10">{children}</div>
        </div>
      </div>
    </main>
  )
}

export function AsideText({
  step,
  title,
  children,
}: {
  step?: string
  title?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3.5">
      {step && (
        <p className="text-subtle text-sm font-medium tracking-wide uppercase">
          {step}
        </p>
      )}
      {title && (
        <h1 className="text-foreground text-[28px] leading-[1.1] font-medium">
          {title}
        </h1>
      )}
      <div className="text-muted-foreground text-lg leading-normal">
        {children}
      </div>
    </div>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-heading text-[28px] leading-[1.1] font-medium">
      {children}
    </h2>
  )
}

export function FieldLabel({
  children,
  htmlFor,
  id,
}: {
  children: ReactNode
  htmlFor?: string
  id?: string
}) {
  return (
    <label
      id={id}
      htmlFor={htmlFor}
      className="text-subtle block text-sm font-medium"
    >
      {children}
    </label>
  )
}

/** Page frame of the results screen (Figma "Results"): navbar + one full-width white card. */
export function ResultsShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 flex-col">
      <SiteNav tone="page" />
      <div className="mx-auto w-full max-w-[1184px] px-4 pt-4 pb-16 sm:px-6 sm:pt-8">
        <div className="bg-card flex flex-col gap-10 rounded-3xl p-5 sm:gap-12 sm:p-10">
          {children}
        </div>
      </div>
    </main>
  )
}
