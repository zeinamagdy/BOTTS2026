@AGENTS.md

# Kiez Concierge — hackathon project

## Context

- **Event:** Battle of the Tech Schools 2026, Sept 28–30, 2026. Theme: **Berlin Housing Market**. Six schools compete, with 5-person cross-functional teams. The user is the team's **full-stack developer**.
- **Schedule:** Day 1 (Sept 28, online): the exact task prompt and tech specs are revealed. Day 2 (online): build sprint and MVP testing. Day 3 (Sept 30, 42 Berlin campus): live pitch, **7 minutes max**, one presenter, livestreamed.
- **Judging:**
  - *Technical excellence*: code quality, robustness and architecture; a working MVP on Berlin housing data or tools; smart use of the stack.
  - *Business potential*: clear value for tenants, landlords or city stakeholders; a scalable business model and market entry; pitch quality.
- **Sponsors and jury:** Get The Flat (prize partner, flat-finding, offers a paid internship), DocMorris, Doctolib (they judge UX quality and product viability), Delivery Hero (they judge scalability and innovation). Tailoring the product to a tenant or flat-search angle fits Get The Flat.
- **The task is "Kiez Concierge"**: match people to the right Berlin neighbourhood (budget, schools, kitas, safety, air, commute). The final UI comes from Figma designs, and the current dashboard is a placeholder over the real data (see "Implementing the design").

## Stack

Next.js 16 (App Router, Turbopack, React 19, React Compiler) · TypeScript · Tailwind v4 · shadcn/ui (`base-nova` style, **Base UI** primitives) · Postgres 17 (Docker) · Drizzle ORM · `openai` (Responses API) · Zod 4 · `csv-parse` (seed) · Recharts (via shadcn `chart`) · MapLibre + `react-map-gl/maplibre` · `streamdown` · sonner · next-themes.

## Commands

```bash
npm run dev              # dev server
npm run build            # production build (run before claiming done)
npm run lint && npm run typecheck
npm run db:up            # start Postgres container (berlin-housing-db, port 5432)
npm run db:push          # sync src/db/schema.ts -> DB (no migration files). Add `-- --force` to skip prompts
npm run data:fetch       # clone/update the data repo into data/tech-battle (git-ignored)
npm run db:seed          # wipes + reloads all tables from the CSVs (~1 min, ~500k rows)
npm run db:setup         # data:fetch + db:push --force + db:seed (fresh machine)
npm run data:osm         # re-fetch OSM green/water/parks/cafés → data/derived/osm-amenities.json (slow, Overpass is often busy)
npm run data:photos      # re-fetch Wikimedia Commons photos → data/derived/kiez-photos.json
npm run db:enrich        # reload only kiez_enrichment from data/derived/*.json (seconds)
npm run db:studio        # Drizzle Studio
npm run db:generate / db:migrate   # versioned migrations, once deployed
```

Env lives in `.env.local` (git-ignored; `.env.example` is committed): `DATABASE_URL`, `OPENAI_API_KEY` (set, and verified working), optional `OPENAI_MODEL`, optional `DATA_DIR` (default `data/tech-battle`).

## Layout

```
src/app/page.tsx                  landing page from Figma (node 19:270): nav, hero, How it works, Hidden Gems
src/app/explore/page.tsx          old placeholder dashboard (Overview / Kiez map / AI Assistant); "Find my Kiez →" CTAs point here until the finder exists
src/components/home/              landing sections (site-nav, hero, torn-edge, how-it-works, hidden-gems, find-kiez-button)
public/home/                      Figma image exports (hero.jpg is only 1024 px wide, ask the designer for full res)
src/lib/bvg.ts                    BVG HAFAS REST client (v6.bvg.transport.rest, no key), null on failure
data/derived/                     OUR derived JSON (OSM, Wikimedia), committed; `.cache/` inside is ignored
scripts/fetch-osm.mjs / fetch-photos.mjs   produce data/derived/*.json
src/app/api/chat/route.ts         POST, OpenAI tool-calling loop, streams NDJSON events
src/components/ui/                shadcn components (generated; ok to edit)
src/components/dashboard/         kpi-cards, rent-chart, kiez-map(+ -lazy), district-table, assistant-chat
src/components/theme-*.tsx        next-themes provider + toggle
src/db/schema.ts                  11 tables mirroring the data repo CSVs (see "Data")
src/db/index.ts                   drizzle client (global pool reuse in dev)
src/db/seed.ts                    CSV loader: auto-maps headers → columns, derives plz/wohnlage for listings
src/lib/env.ts                    zod-validated env ("server-only")
src/lib/ai.ts                     lazy getOpenAI() client + MODEL ("server-only")
src/lib/queries.ts                all DB reads live here ("server-only"); see "Query API"
src/lib/filters.ts                Zod input schemas shared by queries + LLM tools; BEZIRKE, TIERS, WOHNLAGEN, TRANSIT_LINES
src/lib/tools.ts                  OpenAI function tools (one per query); runTool() validates + summarises
src/lib/chat-events.ts            NDJSON wire format of /api/chat (shared by server + client)
scripts/fetch-data.mjs            clones the data repo (DATA_REPO_URL / DATA_DIR overridable)
scripts/copy-maplibre-worker.mjs  postinstall, see gotchas
data/tech-battle/                 cloned data repo (git-ignored, never commit it)
```

## Conventions

- Put data access in `src/lib/queries.ts` and import it from server components or route handlers. Client components get their data as props. Use Server Actions for mutations.
- A page that reads the DB must call `await connection()` (from `next/server`). Without it, `next build` tries to prerender the page and needs a live DB.
- Validate request bodies with Zod `safeParse`, and return 400 with `z.treeifyError(...)` on failure.
- Code style: no semicolons, double quotes, Prettier with the tailwind plugin. Imports use the `@/` alias. Run `npx prettier --write` on the files you touch.
- shadcn: add components with `npx shadcn@latest add <name>`. Base UI uses the **`render` prop, not `asChild`**. Tabs, Select and similar components follow Base UI APIs, not Radix.
- Every page must work in both light and dark mode. Use theme tokens (`bg-muted`, `text-muted-foreground`, `var(--chart-N)`), not hard-coded colors. The current theme is neutral grey, so `--chart-1..5` are grey shades until the Figma palette is mapped.
- Label synthetic numbers as "synthetic" in the UI (see "Data").

## Data

- Source: the team's data repo **github.com/esakovaa/tech-battle** (by a teammate). `npm run data:fetch` clones it into `data/tech-battle/`. **Don't commit the CSVs here** (the user's decision); that repo is the source of truth. Re-run `data:fetch` + `db:seed` when it changes.
- Read `data/tech-battle/Kiez Profile Master Table/README.md` for per-column trust levels.
- Tables and row counts (all match the CSVs):

  | Table | Rows | Real? | Notes |
  |---|---|---|---|
  | `kiez_profiles` | 193 | mixed | one row per PLZ, main unit for ranking; columns documented in `schema.ts` |
  | `addresses` | 400,505 | real | Mietspiegel 2026 Wohnlage per address (einfach/mittel/gut), 77 MB |
  | `rentals` | 30,000 | synthetic | 2020–2026 |
  | `sales` | 50,000 | synthetic | resale |
  | `new_construction` | 10,000 | synthetic | 177 projects |
  | `kiez_prices_monthly` | 6,232 | synthetic | per Ortsteil, 2020-01 → 2026-04 |
  | `schools` | 185 | real | Abitur 2025, Oberstufe only; only 63 have a name/PLZ |
  | `kitas` | 2,905 | real | with capacity |
  | `transit_stations` | 135 | real names | only 7 lines (see below) |
  | `real_listings_2023` | 4,932 | real | immowelt sale listings, 10 non-Berlin zipcodes dropped, junk years/floors nulled |
  | `crime_stats` | 1,200 | real | per Bezirksregion, 2012–2019 |
| `kiez_enrichment` | 193 | real (OSM / Commons) | ours, from `data/derived/`: green/water share, parks, cafés, playgrounds within 1 km of the PLZ centroid; one photo per PLZ (185/193) with author + license |

- **Real vs synthetic:** all listings and price trends are synthetic, with € levels ~25–40% below the real market. Use them for relative comparison. `buyPricePerM2Real` (2023) is the real price signal.
- **Derived in the seed (not in the CSVs):**
  - Synthetic listings get `plz`, `wohnlage` and `plr_name` from their **nearest real address** (grid index over the 400k addresses). This beat the upstream nearest-centroid approach and enables the rent-fairness check.
  - `kiez_profiles.ortsteil`: a readable label per PLZ. It's the most common listing Ortsteil **among listings whose Bezirk matches the PLZ's Bezirk**, falling back to the most common Planungsraum. Without the Bezirk filter, 10439 came out as "Gesundbrunnen" instead of Prenzlauer Berg.
  - Address `hnr` is stored without leading zeros ("001" → "1"). Kita `hnr` merges `e_zusatz`, which is either a suffix ("-5") or a second address (joined with " / ").
  - The seed runs `create extension if not exists pg_trgm` (typo-tolerant street suggestions).
- **Source-data problems found (tell the data teammate / mention in the pitch if asked):**
  - About 7% of synthetic listings have a `bezirk`/`ortsteil` label that disagrees with their coordinates. Trust `plz`.
  - **Don't use the listings' `transit_station` / `transit_line` / `transit_distance_min` columns.** The listed station is a median 6.1 km away (real nearest: 1.7 km, only 11% within 1 km), and the minutes are derived from that wrong station. Transit filters and the `nearestStation` result field are computed from coordinates against `transit_stations`.
  - `transit_stations` covers only **U1, U2, U7, U8, S1, Stadtbahn, S Ringbahn**. No U5, U6, U9, most S-Bahn. The VBB GTFS stops would fix this.
  - Crime and Abitur tiers are **Bezirk-level**: every PLZ in a Bezirk shares the value. Crime is the sum of 15 categories and **absolute counts, not per capita**, so big Bezirke look worse. Rows named "… nicht zuzuordnen" are excluded.
  - Air quality is from the nearest of 15 stations, Feb 2026 only. CO/O₃ are missing for most PLZs.
- **OSM enrichment** is measured in a 1 km circle around the PLZ centroid, which sits where people live, not in the middle of the PLZ. So Nikolassee (14129) scores only 11% green although Grunewald is next door: it measures what's reachable from home, not land area. Forest relations are assembled from outer rings (holes ignored).
- The Ring polygon is built from our 24 "S Ringbahn" stations plus 4 the CSV lacks (Westend, Messe Nord, Wedding, Bornholmer Str.), hard-coded in `MISSING_RING_STATIONS` in `queries.ts`. 61 PLZs are inside, 132 outside. Drop the constant once the stations come from VBB GTFS.
- Some Wikimedia photos are dull (garages, station signs). Hand-pick photos for the PLZs shown in the pitch.
- PLZs 15537/15566/15569 are tiny Berlin border slivers (1–9 addresses), skipped by the ranking.

## Query API (`src/lib/queries.ts`)

All take plain objects. Filter fields may be `null` or missing, and both mean "no filter" (`Loose<T>` in `filters.ts`). Limits are clamped to 25.

| Function | Use it for |
|---|---|
| `getOverview()` | city-wide KPIs (counts, median warm rent, avg €/m²) |
| `getBezirkSummary()` | per-Bezirk rent, real buy price, kita places, Abitur tier, crime |
| `getKiezProfiles()` | all 193 PLZ rows (map, lists), left-joined with `kiez_enrichment`, plus `insideRing` (point-in-polygon vs the S-Ringbahn stations) |
| `getHomeHighlights()` | landing page: top 3 family Kieze outside the Ring (min Abitur tier OK) with photos, plus counts |
| `getCommute({ to, plzs, departAt })` | door-to-door ÖPNV minutes from ≤10 PLZ centroids to a place, next weekday 08:00 via BVG. If the API is down, geocodes locally (address → station → street) and returns `estimated: true` |
| `rankKiez({ weights, bezirke, maxRentPerM2, minAbiturTier, maxTransitKm, apartment, limit })` | **the core "find my Kiez" feature.** Weights 0–5 for affordability, schools, safety, air, kitas, transit, locationQuality, nature (green share + ½ water share), amenities (cafés + playgrounds). `outsideRing` true/false filters by the S-Bahn Ring. Each factor is scored as a percentile rank across Berlin, so ties (Bezirk-level values) score equally and missing values count 0.5. PLZs with <100 addresses are skipped. `apartment` keeps only PLZs with matching rentals and returns their count and median warm rent. |
| `getKiezDetail(plz)` | PLZ detail page: full profile, rent by room count, top schools in the Bezirk, largest kitas, 3 nearest stations, real 2023 sale prices |
| `searchRentals(filters)` / `searchSales({ kind: "resale" \| "new_build", … })` | listing search: bezirke, plz, ortsteil, rooms, area, price, balcony, wohnlage, `near {lat, lon, radiusKm}`, `transitLines` + `maxStationKm` (default 1 km), sort. Returns total, median and rows with `nearestStation` |
| `lookupAddress(street, houseNumber?)` | official Wohnlage per address. Tolerates "Str."/"strasse" and spaces vs hyphens ("Karl Marx Allee"), and suggests spellings via trigram similarity |
| `checkRentFairness({ areaM2, kaltmiete, plz? \| street+houseNumber })` | compares €/m² to synthetic comparables (same PLZ + Wohnlage, ±25% size, widening if <15). Returns percentile and verdict. Not the legal Mietspiegel |
| `getPriceTrend({ ortsteil?, bezirk?, granularity })` | rent/price series plus % change |
| `findKitas`, `listSchools`, `getCrimeByArea` | kitas near a point or PLZ; schools by tier (`tierVsPeer`, lower grade = better); 2019 crime per Bezirksregion |

Test queries without the browser: write a `.mts` script (top-level await) that loads `.env.local` and imports `../src/lib/queries`, then run `npx tsx --conditions=react-server file.mts` (the condition is needed because of the `server-only` import). Put it in a temp folder and delete it after.

## LLM (OpenAI) conventions

- The user only has an OpenAI key, so the app uses the official `openai` SDK via `src/lib/ai.ts`. Don't reintroduce `@anthropic-ai/sdk`.
- `getOpenAI()` is lazy on purpose: the OpenAI constructor throws without a key, which breaks `next build`.
- The model is `env.OPENAI_MODEL` (default `gpt-5.5`). Use a `-mini`/`-nano` model for cheap, high-volume sub-tasks.
- `/api/chat` pattern (tool loop, max 6 rounds):
  - Calls `openai.responses.create({ stream: true, instructions, input, tools, previous_response_id })`. The model can call several tools in parallel.
  - `previous_response_id` relies on OpenAI storing responses (the default `store: true`). If the key's org has zero data retention, switch to passing the output items back manually.
  - Collects `function_call` items from `response.output_item.done`, runs them via `runTool()`, then continues with `function_call_output` items plus `previous_response_id`.
  - The system prompt holds the **data caveats** (synthetic vs real, Bezirk-level crime/Abitur, the 7 transit lines). Keep it in sync when the data changes.
- **Wire format:** newline-delimited JSON `ChatEvent`s from `src/lib/chat-events.ts`: `{type:"text",delta}`, `{type:"tool_call",id,name,args}`, `{type:"tool_result",id,ok,summary,ms}`. Errors arrive as text deltas starting with "⚠️". The client (`assistant-chat.tsx`) parses lines into message `parts` (text through `<Streamdown>`, tools as expandable rows showing label, summary, ms and args). Only text parts are sent back as history.
- Adding a tool:
  1. Write the query in `queries.ts`.
  2. Add its input schema in `filters.ts`. Every field must be `.nullable()`, not `.optional()`, because `zodResponsesFunction` makes tools strict. Don't use `.min/.max`; clamp in the query instead.
  3. Add an entry to `defs` in `tools.ts`. Optionally teach `summarize()` its one-line result.
  4. Add a label and icon in `TOOL_META` in `assistant-chat.tsx`.
- Seeing the tool rows is useful for debugging: when the model makes many calls for one question (6 rental searches for "near the U8"), a filter is missing.
- For structured JSON use `openai.responses.parse` with `zodTextFormat` (from `openai/helpers/zod`).
- **Hosted web search:** `tools.ts` appends OpenAI's `{ type: "web_search" }`. OpenAI runs it inside the response (no function_call round). `route.ts` turns each `web_search_call` output item into a `tool_call` + `tool_result` event (name `web_search`, args `{ query, sources }`) and requests `include: ["web_search_call.action.sources"]`. The system prompt limits the web to what the DB can't answer (flat size norms, Brandenburg) and requires citing it.
- **BVG / transport.rest is volunteer-run and was fully down (503) on 2026-09-28.** The commute tool falls back to estimates; don't rely on it live in the pitch without checking first. `BVG_API_URL` overrides the base URL.

## Implementing the design (next chat)

- **Keep:** everything in `src/db`, `src/lib`, `src/app/api/chat`. The screens should consume the Query API above. Don't query the DB from new places.
- **Placeholder, replace freely:** `src/app/page.tsx` and `src/components/dashboard/*`. `assistant-chat.tsx` holds the working streaming + tool-row logic (`applyEvent`, NDJSON parsing). Restyle it or move that logic into a hook rather than rewriting it.
- Wiring patterns:
  - Read-only screens (PLZ detail, district overview): server component + `await connection()` + query call.
  - Interactive filtering (Kiez finder with weight sliders, listing search): a Server Action or a small route handler that validates with the **same Zod schema** from `filters.ts` (`rankKiezInput`, `rentalFilters`, …) and calls the query. Keep filter state in the URL (`searchParams`) so results are shareable and the pitch demo is reproducible.
  - Map: `kiez-map.tsx` shows the 193 PLZ centroids. A choropleth needs PLZ boundary GeoJSON (daten.berlin.de), which isn't in the data repo yet.
- The Figma workflow is below. Map the palette to `--chart-N` first, so the map and charts get real colours.

## Figma design workflow

- The design comes from Figma. The Figma MCP is connected as the user (zeinab magdy) on a **Starter** plan, which has a very small monthly budget for design reads.
- Make each read count:
  - Ask for **one link** to the parent frame or section that holds all the screens (`node-id=` in the URL), not the whole file.
  - Call `get_design_context` once on that node. Only call `get_screenshot` or `get_variable_defs` if something is still missing.
  - Don't call tools just to explore.
- If the budget runs out, work from the designer's PNG exports and the values they copy from Dev Mode, which uses no reads.
- **Implementation order:**
  1. Map the Figma variables and colours onto the theme variables in `src/app/globals.css` (`:root` and `.dark`: `--primary`, `--muted`, `--chart-N` etc.).
  2. Load the fonts through `next/font` in `layout.tsx`.
  3. Restyle the existing shadcn components before creating new ones.
  4. Build the screens.
  5. Check the result in the browser pane in both light and dark mode, at mobile and desktop widths.
- Use Lucide icons (`lucide-react`). Custom icons come as SVG exports. Code Connect isn't available on this plan, so skip it.
- What to ask the designer for: Figma variables and styles for colour and type in light and dark versions, designs based on the shadcn/ui kit, auto layout with named layers, mobile and desktop frames, Google Fonts, exported images.

## Deploying (Vercel + Neon), not done yet

1. **DB:** create a Neon project (the DB is ~115 MB, so it fits the free 0.5 GB tier; `pg_trgm` is supported). Use the **pooled** connection string (`-pooler` host) for the app. Set `prepare: false` in `postgres(...)` in `src/db/index.ts` when using the pooled (PgBouncer transaction mode) URL. Use a smaller `max` (e.g. 1–3) on serverless.
2. **Load data from the laptop** (Vercel never sees the CSVs): `DATABASE_URL=<neon direct url> npm run db:push -- --force`, then `DATABASE_URL=<neon direct url> npm run db:seed`. `.env.local` loads via dotenv, but an explicitly exported `DATABASE_URL` wins. Use the **direct** (non-pooler) URL for push and seed. Expect it to take longer than local (400k address rows over the network).
3. **Vercel:** import the GitHub repo and set env vars `DATABASE_URL` (pooled), `OPENAI_API_KEY` and optionally `OPENAI_MODEL`. `postinstall` copies the MapLibre worker during the Vercel install. `next build` needs no DB because the pages use `connection()`.
4. Give `/api/chat` time to stream a multi-tool answer: add `export const maxDuration = 60` in `route.ts` if a platform limit cuts it off.
5. Smoke test on the live URL: dashboard loads, map shows 193 dots, then one chat question per tool family (ranking, rent check with an address, U8 search).
6. After the first deploy, move from `db:push` to `db:generate` / `db:migrate` if the schema keeps changing.

## Gotchas (learned the hard way)

- **After every `npx shadcn add`**, run `grep -rn 'from "cn"' src`. The CLI once wrote `import { cn } from "cn"` (an unrelated npm package) and turned `src/lib/utils.ts` into a self-import. `cn` must come from `@/lib/utils`, which uses clsx and tailwind-merge.
- **MapLibre v6** loads its worker as a separate ES module that Turbopack doesn't bundle. The postinstall script copies `maplibre-gl-worker.mjs` and `maplibre-gl-shared.mjs` into `public/maplibre/`. That folder is git-ignored and excluded from ESLint and Prettier. `kiez-map.tsx` calls `setWorkerUrl(...)`. The map is only loaded client-side, through `kiez-map-lazy.tsx` (`next/dynamic`, `ssr: false`). If the map tiles are blank, check this first. Tiles also take a few seconds on first load.
- The postgis/postgis image has no arm64 build and fails on the user's Mac, so the project uses `postgres:17-alpine`. If geo queries are needed, look for a multi-arch PostGIS image. Distances are currently computed in SQL with an equirectangular formula (`distanceKm` in `queries.ts`), which is fine within Berlin.
- **Port 3000 is often this project's own `next dev`,** started by the user, and `next dev` refuses to start a second server in the same directory. Check with `lsof -iTCP:3000 -sTCP:LISTEN` and reuse it (`preview_start` with `url: http://localhost:3000`, or `curl`). Don't kill it. The user's other project (`~/Desktop/hide-seek/backend`) may also use port 3000; `.claude/launch.json` sets `autoPort: true`.
- `drizzle-kit push` prompts interactively on destructive changes. Pass `--force` in scripts and agents.
- `globals.css` holds `@source` for streamdown and the imports for `maplibre-gl.css` and `streamdown/styles.css`. `--font-sans` maps to `--font-geist-sans`.
- `AGENTS.md` is regenerated by `next dev`. Keep project notes here, not there.
- Browser pane: clicks by `ref` can land in the wrong place while viewport emulation is on, so click through `javascript_tool` instead, e.g. `[...document.querySelectorAll('[role=tab]')].find(...).click()`. To test light mode, set `localStorage.theme = "light"` and reload (next-themes ignores the emulated colour scheme when a theme is stored), then remove the key afterwards.
- Test the chat without the UI: `curl -sN localhost:3000/api/chat -H 'content-type: application/json' -d '{"messages":[{"role":"user","content":"…"}]}'`, then `grep -v '"type":"text"'` to see just the tool events.

## Status

- **Done:**
  - Data repo integrated: 11 tables, all row counts match the CSVs.
  - Query layer and 10 LLM tools, all verified with real OpenAI responses: rank neighbourhoods, profile, search rentals and sales (with the geometry-based transit line filter), address lookup, rent fairness check, price trend, kitas, schools, crime.
  - Chat UI shows each tool call.
  - Placeholder dashboard rewired to the real data.
  - Build, lint and typecheck are clean.
  - Landing page built from Figma (light + dark, mobile + desktop). Dashboard moved to `/explore`.
  - Data gaps filled: OSM green/water/parks/cafés + Wikimedia photos (committed JSON, seeded into `kiez_enrichment`), `nature`/`amenities` ranking factors, `outsideRing` filter, `get_commute` tool (BVG), hosted web search in chat.
- **Next:**
  - The remaining Figma screens, especially the Kiez finder (the CTA target) on top of `rankKiez` (weight sliders + commute) and a PLZ detail page (gem cards link to `/explore` for now).
  - Deploy (above).
- **Ideas, not started:**
  - Add a `transitLines` filter to `rankKiez`.
  - VBB GTFS stations for full network coverage.
  - Per-capita crime (needs population data; the Amt für Statistik link in the data README is dead).
  - PLZ boundary GeoJSON for a choropleth.
  - If the transit `exists` filter gets slow, add a bounding-box pre-filter (currently 0.1–0.6 s).
