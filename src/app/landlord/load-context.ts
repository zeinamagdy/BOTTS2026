import "server-only"
import { buildInbox } from "@/lib/applicants"
import {
  coldRent,
  flatSettingsFromParams,
  type FlatContext,
  type FlatSettings,
} from "@/lib/landlord"
import { getLandlordFlatContext } from "@/lib/queries"

/** Wohnlage, Ortsteil, service charge and comparables, or null if the DB fails */
export async function loadFlatContext(
  s: Pick<FlatSettings, "address" | "areaM2">,
): Promise<FlatContext | null> {
  try {
    return await getLandlordFlatContext(s)
  } catch (err) {
    // The screens still work without the rent comparison
    console.error("getLandlordFlatContext failed:", (err as Error).message)
    return null
  }
}

/** Steps 2 and 3: the flat from the URL and the demo inbox checked against it */
export async function loadLandlordInbox(
  params: Record<string, string | string[] | undefined>,
) {
  const flat = flatSettingsFromParams(params)
  const context = await loadFlatContext(flat)
  const cold = coldRent(flat.warmRent, flat.areaM2, context?.serviceChargePerM2)
  return {
    flat,
    street: context?.address ?? flat.address.split(",")[0],
    coldRent: cold,
    inbox: buildInbox({
      coldRent: cold,
      warmRent: flat.warmRent,
      docs: flat.docs,
    }),
  }
}
