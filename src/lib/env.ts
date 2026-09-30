import "server-only"
import { z } from "zod"

const schema = z.object({
  DATABASE_URL: z
    .string()
    .default("postgres://postgres:postgres@localhost:5432/berlin_housing"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-5.5"),
  /** Cheap model for one-shot structured sub-tasks (the Kiez finder's priorities) */
  OPENAI_FAST_MODEL: z.string().default("gpt-5.4-mini"),
  /** Signs document-check results between upload and submit (falls back to a hash of DATABASE_URL) */
  APP_SECRET: z.string().min(16).optional(),
})

export const env = schema.parse(process.env)
