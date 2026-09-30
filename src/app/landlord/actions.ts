"use server"

import { cookies } from "next/headers"
import { z } from "zod"
import { loadLandlordInbox } from "@/app/landlord/load-context"
import { newSeed, sha256Hex } from "@/lib/fair-pick"
import {
  MAX_AREA_M2,
  MIN_AREA_M2,
  SEED_PATTERN,
  type FlatContext,
} from "@/lib/landlord"
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

const FAIR_PICK_COOKIE = "fair-pick"
const fairPickCookie = z.object({
  hash: z.string(),
  seed: z.string().regex(SEED_PATTERN),
  pool: z.string(),
})

/** The flat settings as a query string, without any seed: the draw is always over the current pool */
const flatQuery = z.string().max(2000)
const settingsFrom = (query: string) => {
  const params = Object.fromEntries(new URLSearchParams(query))
  delete params.seed
  return params
}

export type FairPickCommit =
  | {
      ok: true
      hash: string
      pool: string
      poolSize: number
      committedAt: string
    }
  | { ok: false; error: string }

/**
 * Fair Pick step 1: fix the pool and a random seed, show only the seed's hash.
 * The seed stays server-side in an httpOnly cookie until the reveal.
 */
export async function commitFairPickAction(
  raw: unknown,
): Promise<FairPickCommit> {
  const parsed = flatQuery.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "Invalid flat settings." }
  const { inbox, pool } = await loadLandlordInbox(settingsFrom(parsed.data))
  if (!inbox.meets.length)
    return { ok: false, error: "Nobody meets every requirement yet." }
  const seed = newSeed()
  const hash = sha256Hex(seed)
  ;(await cookies()).set(
    FAIR_PICK_COOKIE,
    JSON.stringify({ hash, seed, pool }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/landlord",
      maxAge: 60 * 60,
    },
  )
  return {
    ok: true,
    hash,
    pool,
    poolSize: inbox.meets.length,
    committedAt: new Date().toISOString(),
  }
}

export type FairPickReveal =
  { ok: true; seed: string } | { ok: false; error: string }

/** Fair Pick step 2: publish the committed seed, if the pool hasn't changed since */
export async function revealFairPickAction(
  raw: unknown,
): Promise<FairPickReveal> {
  const parsed = z.object({ hash: z.string(), query: flatQuery }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: "Invalid request." }
  const store = await cookies()
  let saved: z.infer<typeof fairPickCookie> | null = null
  try {
    saved = fairPickCookie.parse(
      JSON.parse(store.get(FAIR_PICK_COOKIE)?.value ?? ""),
    )
  } catch {
    saved = null
  }
  if (!saved || saved.hash !== parsed.data.hash)
    return {
      ok: false,
      error: "This commitment has expired. Commit a new draw.",
    }
  const { pool } = await loadLandlordInbox(settingsFrom(parsed.data.query))
  if (pool !== saved.pool)
    return {
      ok: false,
      error: "The requirements changed after the commitment. Commit again.",
    }
  store.delete({ name: FAIR_PICK_COOKIE, path: "/landlord" })
  return { ok: true, seed: saved.seed }
}
