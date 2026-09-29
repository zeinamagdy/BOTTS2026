import type { Metadata } from "next"
import { connection } from "next/server"
import { loadLandlordInbox } from "@/app/landlord/load-context"
import { ApplicationsOverview } from "@/components/landlord/applications-overview"

export const metadata: Metadata = {
  title: "Applications · For landlords · KiezKiss",
}

/** Step 2: the demo inbox checked against what the landlord set in step 1 */
export default async function ApplicationsPage({
  searchParams,
}: PageProps<"/landlord/applications">) {
  await connection()
  return (
    <ApplicationsOverview {...await loadLandlordInbox(await searchParams)} />
  )
}
