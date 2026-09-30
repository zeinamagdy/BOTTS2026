import { NextResponse } from "next/server"
import { z } from "zod"
import {
  checkDocument,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_TYPES,
  signCheck,
} from "@/lib/documents"
import { DOCUMENTS } from "@/lib/landlord"

export const maxDuration = 60

const documentKey = z.enum(DOCUMENTS.map((d) => d.key))

/**
 * POST multipart/form-data: `file` + `documentType` (a `DocumentKey`). Returns
 * the `DocumentCheck` plus a `token` the application form sends back on
 * submit. The file is read in memory and not stored.
 */
export async function POST(req: Request) {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data" },
      { status: 400 },
    )
  }
  const file = form.get("file")
  const key = documentKey.safeParse(form.get("documentType"))
  if (!key.success)
    return NextResponse.json(
      { error: z.treeifyError(key.error) },
      { status: 400 },
    )
  if (!(file instanceof File) || file.size === 0)
    return NextResponse.json({ error: "No file" }, { status: 400 })
  if (file.size > DOCUMENT_MAX_BYTES)
    return NextResponse.json(
      { error: "Files can be at most 4 MB." },
      { status: 413 },
    )
  if (!DOCUMENT_TYPES.includes(file.type))
    return NextResponse.json(
      { error: "Only PDF, PNG and JPG files." },
      { status: 415 },
    )
  const result = await checkDocument(key.data, {
    bytes: new Uint8Array(await file.arrayBuffer()),
    mediaType: file.type,
    filename: file.name,
  })
  return NextResponse.json({ ...result, token: signCheck(key.data, result) })
}
