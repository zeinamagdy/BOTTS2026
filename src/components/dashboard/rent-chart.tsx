"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { BezirkSummary } from "@/lib/queries"

const config = {
  avgRentPerM2: { label: "Cold rent €/m²", color: "var(--chart-1)" },
} satisfies ChartConfig

export function RentChart({ bezirke }: { bezirke: BezirkSummary[] }) {
  return (
    <ChartContainer config={config} className="h-[360px] w-full">
      <BarChart
        data={bezirke}
        layout="vertical"
        margin={{ left: 8, right: 16 }}
      >
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} unit=" €" />
        <YAxis
          type="category"
          dataKey="bezirk"
          width={170}
          tickLine={false}
          axisLine={false}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar
          dataKey="avgRentPerM2"
          fill="var(--color-avgRentPerM2)"
          radius={4}
        />
      </BarChart>
    </ChartContainer>
  )
}
