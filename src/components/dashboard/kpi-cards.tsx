import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { BezirkSummary, Overview } from "@/lib/queries"

const num = new Intl.NumberFormat("de-DE")
const eur = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
})

export function KpiCards({
  overview,
  bezirke,
}: {
  overview: Overview
  bezirke: BezirkSummary[]
}) {
  const cheapest = bezirke[0]
  const priciest = bezirke.at(-1)!

  const items = [
    {
      label: "Avg. cold rent",
      value: `${overview.avgRentPerM2.toFixed(2)} €/m²`,
      sub: `median ${eur.format(overview.medianWarmmiete)} warm · synthetic`,
    },
    {
      label: "Most affordable",
      value: cheapest.bezirk,
      sub: `${cheapest.avgRentPerM2.toFixed(2)} €/m²`,
    },
    {
      label: "Most expensive",
      value: priciest.bezirk,
      sub: `${priciest.avgRentPerM2.toFixed(2)} €/m²`,
    },
    {
      label: "Coverage",
      value: `${overview.nPlz} PLZ`,
      sub: `${num.format(overview.nAddresses)} addresses · ${num.format(overview.nKitas)} kitas · ${num.format(overview.nRentals)} rentals`,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {items.map((it) => (
        <Card key={it.label}>
          <CardHeader>
            <CardDescription>{it.label}</CardDescription>
            <CardTitle className="text-xl tabular-nums">{it.value}</CardTitle>
            {it.sub && (
              <p className="text-muted-foreground text-xs">{it.sub}</p>
            )}
          </CardHeader>
        </Card>
      ))}
    </div>
  )
}
