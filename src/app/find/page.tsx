import type { Metadata } from "next"
import { FinderWizard } from "@/components/finder/finder-wizard"
import { parseFinderParams } from "@/lib/finder-params"

export const metadata: Metadata = { title: "Find my Kiez · KiezKiss" }

export default async function FindPage({ searchParams }: PageProps<"/find">) {
  const sp = await searchParams
  const step = sp.step === "2" ? 2 : 1
  return <FinderWizard initial={parseFinderParams(sp)} step={step} />
}
