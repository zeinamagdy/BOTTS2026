const USED = [
  "Income relative to rent",
  "Employment security",
  "Household size and rooms",
  "Required documents provided",
  "Consistency of information",
]
const NEVER = [
  "Ethnicity and origin",
  "Religion",
  "Disability",
  "Gender and age",
  "Name, photos and writing style",
]

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="flex flex-1 flex-col gap-2">
      <h3 className="text-panel-accent text-lg font-medium">{title}</h3>
      <ul className="divide-panel-foreground/20 text-panel-foreground divide-y text-lg">
        {items.map((i) => (
          <li key={i} className="py-1">
            {i}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function FairByDesign() {
  return (
    <section className="bg-panel flex flex-col gap-10 rounded-3xl p-6 sm:p-16 lg:flex-row lg:gap-16">
      <div className="flex flex-col gap-6 lg:w-[375px] lg:shrink-0">
        <h2 className="text-panel-foreground text-4xl leading-[1.1] sm:text-[44px]">
          Fair by design.
        </h2>
        <p className="text-panel-muted text-lg">
          Protected characteristics are excluded from applicant scoring. Every
          recommendation shows its reasons, and a person always makes the final
          decision. Application data is deleted 30 days after a flat is let.
        </p>
      </div>
      <List title="What we use" items={USED} />
      <List title="What we never use" items={NEVER} />
    </section>
  )
}
