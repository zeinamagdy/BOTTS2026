"use server"

import { z } from "zod"
import { MAX_AREA_M2, MIN_AREA_M2, type FlatContext } from "@/lib/landlord"
import {
  suggestFlatInput,
  suggestFlatSettings,
  type FlatSuggestion,
} from "@/lib/landlord-ai"
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

export type SuggestFlatResult =
  ({ ok: true } & FlatSuggestion) | { ok: false; error: string }

/** "Fill in from my text": the AI reads the landlord's description and fills the form. */
export async function suggestFlatAction(
  raw: unknown,
): Promise<SuggestFlatResult> {
  const parsed = suggestFlatInput.safeParse(raw)
  if (!parsed.success)
    return { ok: false, error: z.prettifyError(parsed.error) }
  try {
    return { ok: true, ...(await suggestFlatSettings(parsed.data)) }
  } catch (err) {
    console.error("suggestFlatSettings failed:", (err as Error).message)
    return {
      ok: false,
      error: "Couldn't read your text right now. Fill in the fields instead.",
    }
  }
}
