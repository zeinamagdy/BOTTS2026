"use client"

import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"

// maplibre touches `window`, so load it only in the browser.
export const ResultsMapLazy = dynamic(
  () => import("./results-map").then((m) => m.ResultsMap),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[520px] rounded-[20px]" />,
  },
)
