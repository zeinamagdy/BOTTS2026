"use server"

import { z } from "zod"
import { EMPLOYMENT } from "@/lib/applicants"
import { coverLetterInput, draftCoverLetter } from "@/lib/cover-letter"
import { verifyCheck, type DocumentCheck } from "@/lib/documents"
import { DOCUMENTS, type DocumentKey } from "@/lib/landlord"
import { getRentalForApplication, insertApplication } from "@/lib/queries"

export type DraftResult =
  { ok: true; text: string } | { ok: false; error: string }

/** "Write my cover letter": a draft from the tenant's own answers, which they edit */
export async function draftCoverLetterAction(
  raw: unknown,
): Promise<DraftResult> {
  const parsed = coverLetterInput.safeParse(raw)
  if (!parsed.success)
    return { ok: false, error: z.prettifyError(parsed.error) }
  const a = parsed.data.answers
  if (!a.household && !a.why && !a.other)
    return { ok: false, error: "Answer at least one question first." }
  try {
    return { ok: true, text: await draftCoverLetter(parsed.data) }
  } catch (err) {
    console.error("draftCoverLetter failed:", (err as Error).message)
    return {
      ok: false,
      error: "The letter writer is offline right now. Write it yourself below.",
    }
  }
}

const documentCheck = z.object({
  status: z.enum(["verified", "rejected", "unchecked"]),
  demo: z.boolean(),
  netIncome: z.number().int().nullable().optional(),
  detail: z.string().max(300),
  token: z.string().regex(/^[0-9a-f]{64}$/),
})

const application = z.object({
  rentalId: z.string().regex(/^R\d{6}$/),
  name: z.string().trim().min(2).max(80),
  adults: z.number().int().min(1).max(6),
  children: z.number().int().min(0).max(8),
  employment: z.enum(EMPLOYMENT),
  income: z.number().int().min(0).max(100_000).nullable(),
  hasGuarantor: z.boolean(),
  hasDepositInsurance: z.boolean(),
  savings: z.number().int().min(0).max(10_000_000),
  moveIn: z.iso.date(),
  smoker: z.boolean(),
  documents: z.partialRecord(
    z.enum(DOCUMENTS.map((d) => d.key) as [DocumentKey, ...DocumentKey[]]),
    documentCheck,
  ),
  coverLetter: z.string().trim().max(3000),
  consent: z.literal(true),
})

export type SubmitResult =
  { ok: true; id: string } | { ok: false; error: string }

/** Stores the application; it then shows in the landlord inbox (steps 2–4) */
export async function submitApplicationAction(
  raw: unknown,
): Promise<SubmitResult> {
  const parsed = application.safeParse(raw)
  if (!parsed.success)
    return { ok: false, error: z.prettifyError(parsed.error) }
  const { consent, documents, ...a } = parsed.data
  void consent
  try {
    const rental = await getRentalForApplication(a.rentalId)
    if (!rental) return { ok: false, error: "This flat isn’t listed any more." }
    // Only a signed check result counts; anything else waits for a check by hand
    const checked = Object.fromEntries(
      Object.entries(documents).map(([key, c]) => {
        const { token, detail, ...result } = c!
        const valid = verifyCheck(
          key as DocumentKey,
          { ...result, detail } as DocumentCheck,
          token,
        )
        return [
          key,
          valid
            ? {
                status: result.status,
                demo: result.demo,
                netIncome: result.netIncome ?? null,
              }
            : { status: "unchecked" as const, demo: false },
        ]
      }),
    )
    const id = await insertApplication({
      ...a,
      plrId: rental.plrId,
      documents: checked,
      consentAt: new Date(),
    })
    return { ok: true, id }
  } catch (err) {
    console.error("submitApplication failed:", (err as Error).message)
    return {
      ok: false,
      error: "Couldn’t send the application. Please try again.",
    }
  }
}
