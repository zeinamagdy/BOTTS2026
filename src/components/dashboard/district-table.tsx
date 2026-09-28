import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { BezirkSummary } from "@/lib/queries"

const num = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 })

export function DistrictTable({ bezirke }: { bezirke: BezirkSummary[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>District</TableHead>
          <TableHead className="text-right">Rent €/m²</TableHead>
          <TableHead className="text-right">Buy €/m² (real)</TableHead>
          <TableHead className="text-right">Kita places</TableHead>
          <TableHead>Abitur</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {bezirke.map((d) => (
          <TableRow key={d.bezirk}>
            <TableCell className="font-medium">{d.bezirk}</TableCell>
            <TableCell className="text-right tabular-nums">
              {d.avgRentPerM2.toFixed(2)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {d.buyPricePerM2Real ? num.format(d.buyPricePerM2Real) : "–"}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {num.format(d.kitaPlaces)}
            </TableCell>
            <TableCell>
              <Badge
                variant={
                  d.abiturTier === "AMAZING" || d.abiturTier === "GOOD"
                    ? "default"
                    : "outline"
                }
              >
                {d.abiturTier}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
