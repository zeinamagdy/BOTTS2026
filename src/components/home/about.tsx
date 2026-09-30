export function About() {
  return (
    <section
      id="about"
      className="flex scroll-mt-8 flex-col gap-6 lg:flex-row lg:justify-between lg:gap-16"
    >
      <h2 className="text-heading text-4xl leading-[1.1] sm:text-[44px]">
        About KiezKiss
      </h2>
      <p className="text-muted-foreground max-w-[642px] text-lg">
        A decision layer for the Berlin housing market: it helps renters
        discover where to look and landlords decide who to consider, built to
        plug into existing housing and relocation platforms. Made for the Berlin
        housing hackathon; listings, prices and applicants in this prototype are
        synthetic.
      </p>
    </section>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-border flex flex-col gap-3 border-t py-8 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
        <p className="text-heading text-[28px] leading-[1.1] font-medium">
          KiezKiss
        </p>
        <p className="text-muted-foreground text-lg">
          Where renters, landlords and neighbourhoods match.
        </p>
      </div>
      <p className="text-muted-foreground text-lg">
        Prototype · synthetic data
      </p>
    </footer>
  )
}
