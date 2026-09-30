"use server"

import { z } from "zod"
import type { Picks } from "@/lib/finder-params"
import {
  refineInput,
  refinePicks,
  suggestInput,
  suggestPicks,
} from "@/lib/finder"

export type SuggestResult =
  { ok: true; picks: Picks; extras: string[] } | { ok: false; error: string }

/** "Fill in from my text": the AI reads the free text and suggests a pick per key. */
export async function suggestPicksAction(
  input: unknown,
): Promise<SuggestResult> {
  const parsed = suggestInput.safeParse(input)
  if (!parsed.success)
    return {
      ok: false,
      error: z.prettifyError(parsed.error),
    }
  try {
    return { ok: true, ...(await suggestPicks(parsed.data)) }
  } catch (err) {
    console.error("suggestPicks failed:", (err as Error).message)
    return {
      ok: false,
      error: "Couldn't read your text right now. Pick below instead.",
    }
  }
}

export type RefineResult =
  | { ok: true; picks: Picks; extras: string[]; changes: string[] }
  | { ok: false; error: string }

/** Results page "Refine": new picks from the person's text, plus what changed in words */
export async function refineAction(input: unknown): Promise<RefineResult> {
  const parsed = refineInput.safeParse(input)
  if (!parsed.success)
    return { ok: false, error: z.prettifyError(parsed.error) }
  try {
    return { ok: true, ...(await refinePicks(parsed.data)) }
  } catch (err) {
    console.error("refinePicks failed:", (err as Error).message)
    return {
      ok: false,
      error: "Couldn't read that right now. Edit your answers instead.",
    }
  }
}
