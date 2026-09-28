import "server-only"
import OpenAI from "openai"
import { env } from "@/lib/env"

// Lazy: the OpenAI constructor throws without a key, which would break `next build`.
let client: OpenAI | undefined
export function getOpenAI() {
  client ??= new OpenAI({ apiKey: env.OPENAI_API_KEY })
  return client
}

// Override with OPENAI_MODEL in .env.local, e.g. "gpt-5.4-mini" for cheaper, high-volume calls.
export const MODEL = env.OPENAI_MODEL
