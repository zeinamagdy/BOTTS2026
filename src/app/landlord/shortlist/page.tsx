import type { Metadata } from "next"
import { connection } from "next/server"
import { loadLandlordInbox } from "@/app/landlord/load-context"
import { Shortlist } from "@/components/landlord/shortlist"
import { explainShortlist, SHORTLIST } from "@/lib/applicants"

export const metadata: Metadata = {
  title: "Shortlist · For landlords · KiezKiss",
}

/** Step 3: the first qualified applicants, with the reasons and open points */
export default async function ShortlistPage({
  searchParams,
}: PageProps<"/landlord/shortlist">) {
  await connection()
  const { flat, inbox } = await loadLandlordInbox(await searchParams)
  const noun = flat.type === "house" ? "house" : "flat"
  return (
    <Shortlist
      flat={flat}
      qualified={inbox.meets.length}
      cards={explainShortlist(inbox.meets.slice(0, SHORTLIST), {
        rooms: flat.rooms,
        docs: flat.docs,
        noun,
      })}
    />
  )
}
