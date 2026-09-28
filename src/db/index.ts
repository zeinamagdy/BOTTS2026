import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { env } from "@/lib/env"
import * as schema from "./schema"

// Reuse one connection pool across hot reloads in dev.
const globalForDb = globalThis as unknown as {
  pg?: ReturnType<typeof postgres>
}
// Neon's pooled URL (-pooler host) goes through PgBouncer in transaction mode,
// which doesn't support prepared statements. Serverless needs a small pool.
const pooled = env.DATABASE_URL.includes("-pooler")
const client =
  globalForDb.pg ??
  postgres(env.DATABASE_URL, {
    max: process.env.VERCEL ? 3 : 10,
    prepare: !pooled,
  })
if (process.env.NODE_ENV !== "production") globalForDb.pg = client

export const db = drizzle(client, { schema })
