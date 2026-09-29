"use server"

import { z } from "zod"
import type { Picks } from "@/lib/finder-params"
import { suggestInput, suggestPicks } from "@/lib/finder"

export type SuggestResult =
  { ok: true; picks: Picks } | { ok: false; error: string }

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
    return { ok: true, picks: await suggestPicks(parsed.data) }
  } catch (err) {
    console.error("suggestPicks failed:", (err as Error).message)
    return {
      ok: false,
      error: "Couldn't read your text right now. Pick below instead.",
    }
  }
}
