# Berlin Housing — Battle of the Tech Schools 2026

Starter for the **Berlin Housing Market** challenge (Sept 28–30, 2026). The exact prompt is revealed on Day 1, so this repo gives you a working full-stack base to build on: DB, dashboard, map, and an LLM assistant.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | **Next.js 16** (App Router, Turbopack, React 19, React Compiler) | Server Components + Route Handlers = frontend and backend in one app |
| UI | **shadcn/ui** (Base UI primitives) + **Tailwind CSS v4** | Polished, accessible components you own and can edit |
| Charts | shadcn `chart` (Recharts) | Themed charts that match the UI |
| Map | **MapLibre GL** + `react-map-gl` + OpenFreeMap tiles | Free, no API key |
| DB | **PostgreSQL 17** (Docker) + **Drizzle ORM** | Type-safe SQL, instant migrations with `db:push` |
| LLM | **`openai`** (Responses API, `gpt-5.5` by default) | Official SDK: streaming, tool calling, structured outputs |
| Markdown streaming | `streamdown` | Renders streaming LLM markdown cleanly |
| Validation | Zod 4 | Request bodies and env vars |

## Quick start

```bash
npm install
cp .env.example .env.local   # then add OPENAI_API_KEY
npm run db:up                # starts Postgres in Docker
npm run db:setup             # clones the data repo, creates tables, loads ~500k rows (~1 min)
npm run dev
```

## Scripts

| Script | What it does |
| --- | --- |
| `dev` / `build` / `start` | Next.js |
| `lint` / `typecheck` / `format` | ESLint, `tsc`, Prettier |
| `db:up` / `db:down` | Start or stop the Postgres container |
| `db:push` | Sync schema to DB (fast, for hackathon use) |
| `db:generate` / `db:migrate` | Versioned SQL migrations (use these once you deploy) |
| `db:studio` | Drizzle Studio DB browser |
| `data:fetch` | Clone/update the data repo ([esakovaa/tech-battle](https://github.com/esakovaa/tech-battle)) into `data/` |
| `db:seed` | Wipe and reload every table from the CSVs |
| `db:setup` | `data:fetch` + `db:push --force` + `db:seed` |

## Structure

```
src/
  app/
    page.tsx              dashboard (server component, reads DB)
    api/chat/route.ts     streaming OpenAI endpoint with function tools over the DB
  components/
    ui/                   shadcn components (add more: npx shadcn@latest add <name>)
    dashboard/            KPI cards, chart, Kiez map, table, AI chat
  db/
    schema.ts             Drizzle tables mirroring the data repo CSVs
    index.ts              DB client
    seed.ts               CSV loader (derives PLZ + Wohnlage for synthetic listings)
  lib/
    ai.ts                 OpenAI client (lazy) + model id
    env.ts                validated env vars
    queries.ts            data access functions
    filters.ts            Zod input schemas (shared by queries and LLM tools)
    tools.ts              OpenAI function tools wrapping queries
scripts/copy-maplibre-worker.mjs   postinstall: serves MapLibre's worker from /public
```

## ⚠️ Sample data

The seeded rents and prices are **illustrative placeholders**. Swap in real sources once the task is known:

- [Berlin Open Data](https://daten.berlin.de/) (district boundaries as GeoJSON, demographics)
- [Berliner Mietspiegel](https://www.stadtentwicklung.berlin.de/wohnen/mietspiegel/) (official rent index)
- Amt für Statistik Berlin-Brandenburg (population, housing stock)

## LLM notes

- The model defaults to `gpt-5.5`; override it with `OPENAI_MODEL` in `.env.local` (e.g. `gpt-5.4-mini` for cheaper, faster calls).
- `/api/chat` puts the district stats into the system prompt (OpenAI caches the stable prefix automatically). That works for small datasets. For larger data, give the model **function tools** (e.g. `search_listings`, `get_district`) that call `queries.ts`.
- Server-side refusal fallbacks (`fallbacks: "default"`) are enabled.
- For structured JSON output (e.g. "extract fields from this listing text"), use `client.messages.parse()` with a Zod schema.

## Deploy

Vercel plus a hosted Postgres (Neon, Supabase). Set `DATABASE_URL` and `OPENAI_API_KEY` in the project env, then run `npm run db:push && npm run db:seed` against the hosted DB.
