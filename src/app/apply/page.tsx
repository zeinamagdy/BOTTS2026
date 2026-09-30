import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { ApplyForm } from "@/components/apply/apply-form"
import { ResultsShell } from "@/components/finder/finder-shell"
import { finderQuery, parseFinderParams } from "@/lib/finder-params"
import { DEMO_FLAT } from "@/lib/landlord"
import { getRentalForApplication } from "@/lib/queries"

export const metadata: Metadata = { title: "Apply · KiezKiss" }

/** Tenant application for one synthetic listing: facts, documents, cover letter */
export default async function ApplyPage({ searchParams }: PageProps<"/apply">) {
  await connection()
  const params = await searchParams
  const rentalId = typeof params.rental === "string" ? params.rental : ""
  if (!/^R\d{6}$/.test(rentalId)) notFound()
  const rental = await getRentalForApplication(rentalId)
  if (!rental) notFound()
  const s = parseFinderParams(params)
  return (
    <ResultsShell>
      <ApplyForm
        rental={rental}
        kids={s.kids}
        moveInDate={DEMO_FLAT.moveInDate}
        back={
          rental.plrId
            ? `/find/flats?${finderQuery(s, { plr: rental.plrId })}`
            : `/find/results?${finderQuery(s)}`
        }
      />
    </ResultsShell>
  )
}
