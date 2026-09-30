import "server-only"
import { applicantFromSubmission, buildInbox } from "@/lib/applicants"
import { orderByDraw, poolHash, sha256Hex } from "@/lib/fair-pick"
import {
  coldRent,
  DEMO_FLAT,
  flatSettingsFromParams,
  type FlatContext,
  type FlatSettings,
} from "@/lib/landlord"
import { getApplications, getLandlordFlatContext } from "@/lib/queries"

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

/**
 * Steps 2–4: the flat from the URL and the demo inbox checked against it. With a
 * revealed Fair Pick seed in the URL, the qualified applicants come in draw order.
 */
export async function loadLandlordInbox(
  params: Record<string, string | string[] | undefined>,
) {
  const flat = flatSettingsFromParams(params)
  const context = await loadFlatContext(flat)
  const cold = coldRent(flat.warmRent, flat.areaM2, context?.serviceChargePerM2)
  const req = {
    coldRent: cold,
    warmRent: flat.warmRent,
    docs: flat.docs,
    incomeMultiple: flat.incomeMultiple,
    nonSmoking: flat.nonSmoking,
    moveInDate: DEMO_FLAT.moveInDate,
  }
  const inbox = buildInbox(req)
  // Numbered after the demo applicants, oldest first
  const first = inbox.meets.length + inbox.check.length + inbox.below.length + 1
  // Applications sent through /apply, checked against the same requirements.
  // They join the same buckets (and the Fair Pick pool) as the demo applicants
  const submitted = (
    await getApplications().catch((err: Error) => {
      console.error("getApplications failed:", err.message)
      return []
    })
  ).map((row, i, rows) =>
    applicantFromSubmission(
      row,
      req,
      // Newest first from the DB, numbered in order of arrival
      first + rows.length - 1 - i,
    ),
  )
  for (const a of submitted) inbox[a.bucket].push(a)
  inbox.received += submitted.length
  const pool = poolHash(inbox.meets.map((a) => a.id))
  const draw = flat.seed
    ? { seed: flat.seed, seedHash: sha256Hex(flat.seed), pool }
    : null
  if (flat.seed) inbox.meets = orderByDraw(flat.seed, inbox.meets)
  return {
    flat,
    street: context?.address ?? flat.address.split(",")[0],
    coldRent: cold,
    req,
    inbox,
    submitted,
    pool,
    draw,
  }
}
