"use client"

import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"

// maplibre touches `window`, so load it only in the browser.
export const KiezMapLazy = dynamic(
  () => import("./kiez-map").then((m) => m.KiezMap),
  { ssr: false, loading: () => <Skeleton className="h-[480px] rounded-xl" /> },
)
