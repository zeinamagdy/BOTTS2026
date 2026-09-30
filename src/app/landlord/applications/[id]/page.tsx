import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { loadLandlordInbox } from "@/app/landlord/load-context"
import { ApplicationDetail } from "@/components/landlord/application-detail"
import {
  applicantStatus,
  coverNote,
  explainShortlist,
  SHORTLIST,
  tenureLabel,
} from "@/lib/applicants"
import { DEMO_FLAT } from "@/lib/landlord"

export const metadata: Metadata = {
  title: "Application · For landlords · KiezKiss",
}

/** Step 4: one application in full, with the landlord's decision */
export default async function ApplicationPage({
  params,
  searchParams,
}: PageProps<"/landlord/applications/[id]">) {
  await connection()
  const [{ id }, query] = await Promise.all([params, searchParams])
  const { flat, inbox, draw } = await loadLandlordInbox(query)
  const noun = flat.type === "house" ? "house" : "flat"

  const found = inbox.meets.findIndex((a) => a.id === id)
  // A place in the draw only exists once Fair Pick has run
  const rank = draw ? found : -1
  const a =
    inbox.meets[found] ??
    inbox.check.find((x) => x.id === id) ??
    inbox.below.find((x) => x.id === id)
  if (!a) notFound()

  const [{ reasons, toCheck }] = explainShortlist([a], {
    rooms: flat.rooms,
    docs: flat.docs,
    noun,
  })
  return (
    <ApplicationDetail
      flat={flat}
      from={query.from === "applications" ? "applications" : "shortlist"}
      applicant={a}
      status={applicantStatus(a, rank)}
      shortlisted={rank >= 0 && rank < SHORTLIST}
      reasons={reasons}
      toCheck={[...a.issues, ...toCheck]}
      tenure={tenureLabel(a)}
      note={
        a.submitted
          ? [{ text: a.submitted.coverLetter || "No cover letter." }]
          : coverNote(a, {
              noun,
              moveIn: DEMO_FLAT.moveIn,
              docsAsked: flat.docs.length,
            })
      }
    />
  )
}
