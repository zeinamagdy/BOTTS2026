const TRACKS = [
  {
    label: "For renters",
    steps: [
      {
        title: "Tell us about your life",
        text: "Household, commutes, budget and why you are moving.",
      },
      {
        title: "We understand what matters",
        text: "Write freely. We turn it into must-haves and flexible wishes.",
      },
      {
        title: "Discover relevant Kieze",
        text: "Three areas, including hidden gems you may not know.",
      },
      {
        title: "Understand the trade-offs",
        text: "Honest gains and trade-offs against where you live now.",
      },
    ],
  },
  {
    label: "For landlords",
    steps: [
      {
        title: "Define the flat",
        text: "Address, rent, rooms and the documents you need.",
      },
      {
        title: "Receive applications",
        text: "Duplicates merged, each one checked against your requirements.",
      },
      {
        title: "Permitted information only",
        text: "Income, employment, household and documents. Nothing else counts.",
      },
      {
        title: "Review and decide",
        text: "A shortlist with reasons and open points. You make the call.",
      },
    ],
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="flex scroll-mt-8 flex-col gap-16">
      <h2 className="text-heading text-4xl leading-[1.1] sm:text-[52px]">
        How it works
      </h2>
      {TRACKS.map((track) => (
        <div key={track.label} className="flex flex-col gap-5">
          <h3 className="text-brand-600 border-border border-b pb-5 text-lg font-medium">
            {track.label}
          </h3>
          <ol className="grid gap-x-16 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {track.steps.map((s) => (
              <li key={s.title} className="flex flex-col gap-5">
                <p className="text-heading text-[28px] leading-[1.1] font-medium">
                  {s.title}
                </p>
                <p className="text-muted-foreground text-lg">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  )
}
