"use server"

import { z } from "zod"
import { MAX_AREA_M2, MIN_AREA_M2, type FlatContext } from "@/lib/landlord"
import { getLandlordFlatContext } from "@/lib/queries"

const input = z.object({
  address: z.string().trim().min(3).max(200),
  areaM2: z.number().min(MIN_AREA_M2).max(MAX_AREA_M2),
})

/** Re-reads Wohnlage, Ortsteil and rent comparables when the landlord edits the address or size. */
export async function flatContextAction(
  raw: unknown,
): Promise<FlatContext | null> {
  const parsed = input.safeParse(raw)
  if (!parsed.success) return null
  try {
    return await getLandlordFlatContext({
      address: parsed.data.address,
      areaM2: parsed.data.areaM2,
    })
  } catch (err) {
    console.error("getLandlordFlatContext failed:", (err as Error).message)
    return null
  }
}
