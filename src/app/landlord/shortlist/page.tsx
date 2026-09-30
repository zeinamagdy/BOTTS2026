import type { Metadata } from "next"
import { connection } from "next/server"
import { loadLandlordInbox } from "@/app/landlord/load-context"
import { Shortlist } from "@/components/landlord/shortlist"
import { explainShortlist, SHORTLIST } from "@/lib/applicants"

export const metadata: Metadata = {
  title: "Shortlist · For landlords · KiezKiss",
}

/** Step 3: the first qualified applicants in the Fair Pick draw, with the reasons and open points */
export default async function ShortlistPage({
  searchParams,
}: PageProps<"/landlord/shortlist">) {
  await connection()
  const { flat, street, inbox, draw } = await loadLandlordInbox(
    await searchParams,
  )
  const noun = flat.type === "house" ? "house" : "flat"
  return (
    <Shortlist
      flat={flat}
      street={street}
      qualified={inbox.meets.length}
      drawn={draw != null}
      // Before the draw there is no shortlist: step 2 asks for Fair Pick first
      cards={explainShortlist(draw ? inbox.meets.slice(0, SHORTLIST) : [], {
        rooms: flat.rooms,
        docs: flat.docs,
        noun,
      })}
    />
  )
}
