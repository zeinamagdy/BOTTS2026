import type { Metadata } from "next"
import { connection } from "next/server"
import { loadFlatContext } from "@/app/landlord/load-context"
import { FlatSetup } from "@/components/landlord/flat-setup"
import { DEMO_FLAT, flatSettingsFromParams } from "@/lib/landlord"

export const metadata: Metadata = { title: "For landlords · KiezKiss" }

/** Step 1. Coming back from step 2 keeps the answers, which live in the URL */
export default async function LandlordPage({
  searchParams,
}: PageProps<"/landlord">) {
  await connection()
  const params = await searchParams
  const settings = flatSettingsFromParams(params)
  // A fresh start shows the demo address, size and rent as placeholders only
  // and selects no rooms or documents (0 / []); coming back from step 2 keeps
  // what was entered
  const initial = {
    ...settings,
    address: params.address ? settings.address : "",
    areaM2: params.area ? settings.areaM2 : 0,
    warmRent: params.rent ? settings.warmRent : 0,
    rooms: params.rooms ? settings.rooms : 0,
    docs: params.docs != null ? settings.docs : [],
  }
  return (
    <FlatSetup
      initial={initial}
      context={
        initial.address
          ? await loadFlatContext({
              address: initial.address,
              areaM2: initial.areaM2 || DEMO_FLAT.areaM2,
            })
          : null
      }
    />
  )
}
