import "server-only"
import { z } from "zod"

const schema = z.object({
  DATABASE_URL: z
    .string()
    .default("postgres://postgres:postgres@localhost:5432/berlin_housing"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-5.5"),
})

export const env = schema.parse(process.env)
