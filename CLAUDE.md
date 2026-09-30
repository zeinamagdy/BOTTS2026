@AGENTS.md

# KiezKiss (formerly Kiez Concierge) — hackathon project

## Context

- **Event:** Battle of the Tech Schools 2026, Sept 28–30, 2026. Theme: **Berlin Housing Market**. Six schools compete, with 5-person cross-functional teams. The user is the team's **full-stack developer**.
- **Schedule:** Day 1 (Sept 28, online): the exact task prompt and tech specs are revealed. Day 2 (online): build sprint and MVP testing. Day 3 (Sept 30, 42 Berlin campus): live pitch, **7 minutes max**, one presenter, livestreamed.
- **Judging:**
  - *Technical excellence*: code quality, robustness and architecture; a working MVP on Berlin housing data or tools; smart use of the stack.
  - *Business potential*: clear value for tenants, landlords or city stakeholders; a scalable business model and market entry; pitch quality.
- **Sponsors and jury:** Get The Flat (prize partner, flat-finding, offers a paid internship), DocMorris, Doctolib (they judge UX quality and product viability), Delivery Hero (they judge scalability and innovation). Tailoring the product to a tenant or flat-search angle fits Get The Flat.
- **Product name: KiezKiss** (renamed from "Kiez Concierge" on 2026-09-30, following the Figma frames). **The task is "Kiez Concierge"**: match people to the right Berlin neighbourhood (budget, schools, kitas, safety, air, commute). The final UI comes from Figma designs, and the current dashboard is a placeholder over the real data (see "Implementing the design").

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
npm run db:refresh-profiles  # reloads only kiez_profiles + planungsraum* + poi_locations + rentals.plr_id (seconds); use after data:fetch when only the profile tables changed
npm run db:setup         # data:fetch + db:push --force + db:seed (fresh machine)
npm run data:osm         # re-fetch OSM green/water/parks/cafés → data/derived/osm-amenities.json (slow, Overpass is often busy)
npm run data:photos      # re-fetch Wikimedia Commons photos → data/derived/kiez-photos.json
npm run data:names       # re-build data/derived/berlin-first-names.json (Berlin open data). Unused since the landlord flow shows "Applicant N" instead of names
npm run db:enrich        # reload only kiez_enrichment from data/derived/*.json (seconds)
npm run db:studio        # Drizzle Studio
npm run db:generate / db:migrate   # versioned migrations, once deployed
```

Env lives in `.env.local` (git-ignored; `.env.example` is committed): `DATABASE_URL`, `OPENAI_API_KEY` (set, and verified working), optional `OPENAI_MODEL`, optional `OPENAI_FAST_MODEL` (default `gpt-5.4-mini`, used by the Kiez finder), optional `DATA_DIR` (default `data/tech-battle`).

## Layout

```
src/app/page.tsx                  landing page from Figma (node 117:210), static (no DB), in `.theme-kiez`: hero (Find my Kiez / I'm a landlord), renter + landlord split card, Baumschulenweg spotlight (static copy, checked against the data: 27 min BVG to Alexanderplatz, 16 Kitas), How it works (renter + landlord tracks), Fair by design, About, footer. `getHomeHighlights` (the old Hidden Gems) is unused now
src/app/explore/page.tsx          old placeholder dashboard (Overview / Kiez map / AI Assistant)
src/app/find/page.tsx             Kiez finder wizard from Figma (Step 01 = node 41:3826, Step 2 = node 57:5068), `?step=2`; all "Find my Kiez →" CTAs point here
src/app/find/results/page.tsx     finder results from Figma (node 69:250): headline, answer tags + "Edit tags", 3 cards (photo, commute bar, budget, main benefit/trade-off from the weighted factors, "Explore area" scrolls to the map and selects that area) + a priorities map + loading.tsx
src/app/landlord/page.tsx         landlord flow step 1 "Tell us about the flat" from Figma (node 101:699): address (debounced Server Action `flatContextAction` → Wohnlage, Ortsteil, comparables), flat or house (changes the wording only), living space m² (also re-queries: the comparables use ±25% of it), warm rent (→ cold via the PLZ's median service charge/m², shown next to synthetic comparables), rooms, required documents, a live "How applications will be reviewed" summary. The demo flat is `DEMO_FLAT` in `src/lib/landlord.ts`; address, living space and warm rent start empty with the demo values as placeholders and no rooms or documents selected (the CTA needs the three fields and a room count; zero documents is allowed); the answers travel in the URL (`flatSettingsToParams` / `flatSettingsFromParams`, lenient, falls back to the demo), so "Show matches" → step 2 and "Edit the flat" → back keep them. Linked from the nav ("For landlords") and under the hero CTA
src/app/landlord/applications/page.tsx   landlord step 2 "527 applications. Here's where they stand." from Figma (node 101:983): stats (received, duplicates merged, meet all requirements, need a check), filters Recommended (first 10 qualified) / Met requirements / Need further checks, rows ("Applicant N", never a name: names hint at origin, so the flow shows none; household, income ÷ cold rent, employment, documents x of n, status). Applicants are **demo data** from `src/lib/applicants.ts` (`buildInbox`, seeded PRNG, same inbox for the same inputs). `inboxSize` scales the count with the warm rent (527 at the demo's €1,480, elasticity 1.2, clamped 12–1500, duplicates 12%), and incomes scale with it too (self-selection, exponent 0.85; both guesses, not fitted), so a dear flat gets fewer but richer applicants; the bucketing uses the cold rent and the chosen documents. Only the step-1 requirements decide the bucket; qualified applicants are listed by arrival until the landlord runs Fair Pick, which sets the order (never income: that would always shortlist the richest), checks by fewest open points. "Review the shortlist of 3" (the design said "Open 527 applications") → step 3, enabled after the draw; the Recommended filter is the first `SHORTLIST` (3) drawn.
src/app/landlord/shortlist/page.tsx      landlord step 3 "Recommended for review." from Figma (node 101:1167): 3 cards (name, household, reasons, "To check", Invite to viewing = local state + toast, Open application → step 4). `explainShortlist` in `applicants.ts` builds the reasons with plain rules (income ratio, secure employment, household vs rooms, documents, Mietschuldenfreiheitsbescheinigung, consistency) and the open points (self-employed without tax assessment, fixed-term end, student guarantor, crowded, closest to the threshold). The step-3 attributes draw from their own PRNG stream, so they don't shift the others. Steps 2, 3 and 4 share `loadLandlordInbox` in `load-context.ts`.
src/app/landlord/applications/[id]/page.tsx   landlord step 4, one application, from Figma (node 101:1520): facts (household, net income, income ÷ cold rent, employment, "In detail" = `tenureLabel`, move-in), "In their own words" (`coverNote`, assembled from the demo attributes so it never contradicts them; ~35% contain a passage on origin/religion/health, shown only as a "hidden" marker) and a dark "Your decision" panel (`--panel` tokens: status text, To check, In favour, Invite / Save for later = local state + toast; "Ask for more information" toasts what it would ask for). Opened from step 3's "Open application" and from the names in step 2's rows (`&from=applications` switches the back link); unknown id → 404. Its attributes (tenure, note) use a fourth PRNG stream (seed 1520). Shared bits (Progress, Heading, Divider, eur) in `src/components/landlord/parts.tsx`; `load-context.ts` wraps `getLandlordFlatContext` with a null fallback
src/lib/fair-pick.ts              landlord "Fair Pick" (server-only): commit–reveal draw among everyone who meets the requirements. `commitFairPickAction` (landlord/actions.ts) keeps the seed in an httpOnly cookie (serverless instances share no memory); `revealFairPickAction` checks the pool fingerprint is unchanged and returns the seed, which goes into the URL (`seed=`). The UI runs both actions from one "Run Fair Pick" click and shows no seed or hash. Order = qualifying ids sorted by sha256(`${seed}:${id}`); `loadLandlordInbox` applies it. Before the draw there are no "Recommended" rows and no shortlist
src/lib/tenant-criteria.ts        landlord guardrail (client-safe): fixed phrase list (English + German, whole-word, umlauts normalised) of discriminatory tenant criteria, ported from the data repo's `landlord-illegal-criteria.ts`. refuse (AGG grounds) or redirect (family type, employment type → rooms / financial routes). Checks step 1's description box and the "Anything else you need from a tenant?" field; nothing typed there is ever applied. No model on purpose; no match ≠ legal clearance
src/lib/fairness-audit.ts         `auditFairness` (server-only): z-test of who qualifies (note mentions origin/religion/health vs the rest), mean place over fixed-seed Fair Pick draws, and a prompt-injection case (a weak and a qualifying application sent through `applicantFromSubmission` with "ignore all rules…" as the cover letter must come out unchanged). Shown on step 2 (`fairness-audit-panel.tsx`, collapsed) and by `npm run audit:fairness [-- 2.5]` (scripts/fairness-audit.mts). The generator draws those traits independently, so it proves the checks add no bias, not that real data is fair
src/components/finder/refine-box.tsx   results page "Not quite right? Tell us what matters.": `refineAction` → `refinePicks` (finder.ts: the same `suggestPicks` on the current picks) → new URL → the usual deterministic ranking. Shows "What changed" (`describeChanges`: levels, nearby, must-haves, rent cap, new web wishes) and how the top list moved. The model only changes inputs
src/lib/finder-web.ts             wishes the ranking can't express (URL `x`, ≤3, from step 2's "noted" chips or the refine box) → one OpenAI hosted web_search call for all result areas (FAST_MODEL, 45 s, no retries, 12 h memory cache, React `cache` per request). A finding is kept only if its link is one of the pages the search actually returned. `web-note.tsx` streams it into each card under Suspense ("From the web", never part of the ranking). ~6–8 s for 3 areas × 2 wishes; gpt-5.5 was too slow (>45 s)
src/app/find/flats/page.tsx       "See flats and apply" from a result card: up to 6 synthetic listings in the area (`getPlanungsraumRentals`, household's typical rooms), each → /apply
src/app/apply/page.tsx            tenant application (`components/apply/apply-form.tsx`): about you, the 4 financial routes (live check at 3× the listing's cold rent), 5 document uploads checked on upload, 3 guided answers → AI cover letter (editable), storage consent → `submitApplicationAction` (apply/actions.ts) → `applications` table. "Fill in a demo applicant" loads Alex Demo + the 4 fictional PDFs in public/demo-documents (from the data repo). Every application goes to the demo landlord's flat
src/app/api/documents/check       POST multipart (≤4 MB, PDF/PNG/JPG): `checkDocument` (lib/documents.ts) asks FAST_MODEL with a **narrow schema per document type** (ID → looks valid only; payslip → net pay only), never stores the file. Demo PDFs pass by SHA-256 without a model. Results are HMAC-signed (APP_SECRET, else a hash of DATABASE_URL); submit trusts only signed ones, anything else is stored as "unchecked"
src/lib/cover-letter.ts           `draftCoverLetter`: only what the tenant wrote, never adds origin/religion/health, no numbers
src/app/find/actions.ts           Server Action `suggestPicksAction` ("Fill in from my text")
src/lib/landlord-ai.ts            landlord "Fill in from my text" (`suggestFlatSettings`, FAST_MODEL, same pattern as `suggestPicks`): free text → address, type, m², warm rent (a cold rent is returned as `coldRent` and the client adds the PLZ's service charge), rooms, documents; other wishes come back as muted "noted, not checked" chips, and the prompt drops protected characteristics. Action `suggestFlatAction` in `src/app/landlord/actions.ts`
src/components/finder/            finder-shell (nav + card + grey aside), choice-group (ChoiceGroup + ToggleChips), form-bits (FIELD, StepButtons), finder-wizard (client, step 1), priorities-step (step 2), match-card
src/lib/finder-params.ts          client-safe: the priority keys (`PRIORITY_META`, typed against the `rankPlanungsraumInput` weights, so a new factor fails the build until it has a label), Must have/Flexible/Don't need levels (internal values protect/ok/letgo, weights 5/2/0), the `INTERESTS` (yoga, gym, bouldering + cafés/playgrounds/parks, which raise the same-named factor to Must have) and must-haves, the rent caps, household defaults, and answers <-> URL (home, kids, baby, place=Kind:address ≤3, commute, w=key:weight,…, hobby, must, rent, q, x=noted wish ≤3)
src/components/finder/results-map.tsx   results map (client, lazy via results-map-lazy): one area at a time (outline + number tabs), highlight layers from `src/lib/map-layers.ts`; the person's protected priorities start switched on. Parks/green and school grounds recolour the basemap's own layers; schools, playgrounds, cafés and stations are circles on the basemap's `poi` source layer (OpenMapTiles classes, counted inside the outline only at zoom ≥14, where the tiles are complete); Kitas, Kinderarzt and hobbies are our `poi_locations` via `getResultsMap(plrIds)`. Cards talk to it through the `kiez:show-area` window event (`show-area-button.tsx`)
src/lib/finder.ts                 server: picks → rankPlanungsraum input (deterministic, no model) → findKiezMatches; `suggestPicks` (OpenAI `responses.parse`, FAST_MODEL, gets the current picks and changes only what the text mentions, cached in memory)
src/components/home/              landing sections (site-nav with the Figma logo mark, hero, audience-split, spotlight, how-it-works, fair-by-design, about + SiteFooter) and `CtaLink` (the orange / cream Figma pill; `FindKiezButton` wraps it)
public/home/                      Figma image exports (hero-park.jpg is only 731 px wide and shown full-bleed, ask the designer for full res; house.jpg is the match-card fallback)
src/lib/area-photos.ts            hand-picked photo per PLZ (`AREA_PHOTOS`, files in `public/areas/`); wins over the Wikimedia photo in the gems and result cards, no DB change
src/lib/bvg.ts                    BVG HAFAS REST client (v6.bvg.transport.rest, no key), null on failure
data/derived/                     OUR derived JSON (OSM, Wikimedia), committed; `.cache/` inside is ignored
scripts/fetch-osm.mjs / fetch-photos.mjs   produce data/derived/*.json
src/app/api/chat/route.ts         POST, OpenAI tool-calling loop, streams NDJSON events
src/components/ui/                shadcn components (generated; ok to edit)
src/components/dashboard/         kpi-cards, rent-chart, kiez-map(+ -lazy), district-table, assistant-chat
src/components/theme-*.tsx        next-themes provider + toggle
src/db/schema.ts                  14 tables mirroring the data repo CSVs (see "Data")
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

- **Pushing to `main` redeploys Vercel, which reads Neon.** If a commit changes the schema or seeded data, update Neon first (see "Deploying" → the rule). Never push such a commit to `main` with Neon behind.
- Put data access in `src/lib/queries.ts` and import it from server components or route handlers. Client components get their data as props. Use Server Actions for mutations.
- A page that reads the DB must call `await connection()` (from `next/server`). Without it, `next build` tries to prerender the page and needs a live DB.
- Validate request bodies with Zod `safeParse`, and return 400 with `z.treeifyError(...)` on failure.
- Code style: no semicolons, double quotes, Prettier with the tailwind plugin. Imports use the `@/` alias. Run `npx prettier --write` on the files you touch.
- shadcn: add components with `npx shadcn@latest add <name>`. Base UI uses the **`render` prop, not `asChild`**. Tabs, Select and similar components follow Base UI APIs, not Radix.
- **Two palettes:** the root theme is the older neutral grey + orange; the landing page and the landlord flow (`src/app/landlord/layout.tsx`) wrap their pages in `.theme-kiez` (globals.css), the newer Figma palette: beige `#f5efe3` page, forest green `#173f2a` headings and decision panel, sage `#4f5d53` text (dark values are ours). Tokens are overridden, so components keep using `text-heading`, `bg-background`, `bg-panel` etc. Move it to `:root` once the other screens get the new design.
- Every page must work in both light and dark mode. Use theme tokens (`bg-muted`, `text-muted-foreground`, `var(--chart-N)`), not hard-coded colors. The current theme is neutral grey, so `--chart-1..5` are grey shades until the Figma palette is mapped.
- Label synthetic numbers as "synthetic" in the UI (see "Data").
- Landlord "Non-smokers only" (URL `smoking=no`, `FlatSettings.nonSmoking`, also filled by the AI) is a requirement like the documents: a smoker or an unstated answer goes to "check", never rejected. Demo applicants draw `smoker` from their own PRNG stream (seed 4747, 22%); /apply asks it (`applications.smoker`, nullable for older rows). Step 3 has "Set up a viewing day": a `mailto:` draft without recipients (the landlord never sees addresses), nothing is sent. Ported from the teammate fork esakovaa/BOTTS2026 (its own lottery/eval engine was not taken: in-memory commitments break on Vercel, and it showed names).
- Landlord financial security has four equal routes (`FinancialRoute`): income ≥ `incomeMultiple` × cold rent (2 / 2.5 / 3, capped at 3, URL `mult`), a guarantor, deposit insurance, or savings ≥ 3 months' warm rent. The demo applicants draw guarantor / insurance / savings from their own PRNG stream (seed 2929). "Who's welcome" chips (URL `welcome`) are shown only, never filter or rank.

## Data

- Source: the team's data repo **github.com/esakovaa/tech-battle** (by a teammate). `npm run data:fetch` clones it into `data/tech-battle/`. **Don't commit the CSVs here** (the user's decision); that repo is the source of truth. Re-run `data:fetch` + `db:seed` when it changes.
- Read `data/tech-battle/Kiez Profile Master Table/README.md` for per-column trust levels.
- Tables and row counts (all match the CSVs). The data repo also ships a teammate's Next.js app and design drafts (`src/`, `design/wurzelraum/`, `photos/`); they are not ours, and `tsconfig.json` excludes `data/tech-battle`.

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
| `planungsraum` | 542 | mixed | Planungsraum (PLR) profile, the finer unit, key `plr_id` (**8-char string with leading zeros, never a number**). Joins to `kiez_profiles` via `dominant_plz`. See the notes below |
| `planungsraum_boundaries` | 542 | real | `plr_id` + MultiPolygon GeoJSON geometry (jsonb, ~6 MB): the choropleth source |
| `poi_locations` | 3,638 | real (Kitas, OSM) | one point per Kita/yoga_studios/kinderarzt/gym/bouldering with its `plr_id` (categories stripped of the `n_` prefix) |
| `kiez_enrichment` | 193 | real (OSM / Commons) | ours, from `data/derived/`: green/water share, parks, cafés, playgrounds within 1 km of the PLZ centroid; one photo per PLZ (185/193) with author + license |
| `applications` | grows | ours | tenant applications from /apply (no uploaded files, only the signed check results). Not in the data repo, never seeded or truncated; `loadLandlordInbox` checks them with `applicantFromSubmission` → the same `checkApplicant` as the demo inbox, so they join the buckets and the Fair Pick pool. The landlord pages never get the real `name`: every applicant, demo or real, is "Applicant N" (`applicantLabel`, real ones numbered after the demo inbox in order of arrival), and `hideName` turns the declared name in the cover letter into "[name]" (whole words; it can't catch nicknames or other names) |

- **Real vs synthetic:** all listings and price trends are synthetic, with € levels ~25–40% below the real market. Use them for relative comparison. `buyPricePerM2Real` (2023) is the real price signal.
- **Planungsraum table** (added 2026-09-29; the data repo builds it with point-in-polygon joins):
  - Native-grain Umweltgerechtigkeit (`ug_*`, ordinal text; `ug_soziale_benachteiligung` is a Status-Index where **higher = more advantaged**; `ug_mehrfachbelastung_umwelt` is 5-level, `…_sozial` 6-level), OSM POI counts (`n_yoga_studios`, `n_kinderarzt`, `n_gym`, `n_bouldering`, plus `*_plz` counts and `has_*_plz` flags), population by age (**allocated** from PLZ×Bezirk by address share: an estimate, check `pct_population_coverage`), `crime_rate_per_10k_2017_2019` (per capita but still Bezirk-level), `distance_from_center_km` (to Alexanderplatz), and **real VBB GTFS transit** (878 stations, all lines).
  - Limits: `buy_price_per_m2_avg_real` is inherited from `dominant_plz`; Abitur is PLR-exact for only ~61 areas (the Bezirk fallback columns are complete); `new_construction_price_per_m2_avg` is null for 421.
  - `rentals.plr_id` is matched by polygon from the data repo's `rentals_by_planungsraum.json` (29,431 of 30,000; 569 are null). It is separate from the nearest-address `plz`/`plr_name` we derive.
  - `kiez_profiles` gained 10 `ug_*` point-query columns; prefer the PLR versions. `n_school_construction_projects` was corrected upstream (now sums to 370).
  - The PLZ transit columns and `transit_stations` are still the 135-station, 7-line list. Real VBB data exists only in `planungsraum`.
  - PLR reads live in `queries.ts` under "Planungsraum" (see the Query API table). Three LLM tools wrap them: `rank_planungsraeume`, `get_planungsraum_profile`, `get_planungsraum_rentals`.
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
| `getCommute({ to, plzs, departAt })` | door-to-door ÖPNV minutes from ≤10 PLZ centroids to a place, next weekday 08:00. Geocodes **locally first** (`parseAddress` understands "Harzer Str. 42, 12059 Berlin": address with the PLZ preferred → station → street → PLZ), BVG only for what that can't place (landmarks); live BVG journeys when it answers, else `estimated: true` |
| `rankKiez({ weights, bezirke, maxRentPerM2, minAbiturTier, maxTransitKm, apartment, limit })` | **the core "find my Kiez" feature.** Weights 0–5 for affordability, schools, safety, air, kitas, transit, locationQuality, nature (green share + ½ water share), amenities (cafés + playgrounds). `outsideRing` true/false filters by the S-Bahn Ring. Each factor is scored as a percentile rank across Berlin, so ties (Bezirk-level values) score equally and missing values count 0.5. PLZs with <100 addresses are skipped. `apartment` keeps only PLZs with matching rentals and returns their count and median warm rent. |
| `getPlanungsraeume()` | all 542 PLR rows, plus `ortsteil` + photo of the dominant PLZ and `insideRing` (centroid vs the S-Ring) |
| `rankPlanungsraum({ weights, hobbies, bezirke, maxRentPerM2, maxTransitKm, min/maxDistanceFromCenterKm, outsideRing, requireKita, requireKinderarzt, apartment, limit })` | the PLR version of `rankKiez`. Weights 0–5 for affordability, schools (PLR-exact Abitur, else Bezirk), safety (crime **rate**), noise, air, green, heat (Umweltatlas ordinals), kitas (places per child under 6), transit (real VBB), locationQuality, hobbies (share of the chosen yoga/gym/bouldering present in the PLZ), nearCenter, and parks / cafes / playgrounds (OSM within 1 km of the **dominant PLZ's** centroid, so every area of a PLZ shares them). No weights = equal over the area's own factors (not hobbies, nearCenter or the three PLZ-level ones). Same percentile scoring and ≥100-address cut-off as `rankKiez`. `apartment` matches through `rentals.plr_id`. Deliberately **no factor on the social Status-Index** (it is a wealth proxy). Ties are common (ordinal and Bezirk-level inputs), so many areas share factor scores |
| `findKiezMatches({ rank, places, maxCommuteMin, limit })` | the finder's results: `rankPlanungsraum` scoring, then keeps areas whose **estimated** ÖPNV time to every place is within the limit, checks the best 2×limit with live BVG journeys (areas passing with a +6 min margin, the fit's 75th-percentile error, first) and lists the ones that really fit first (`overLimit` marks the rest). `relaxed: true` when nothing fits. The estimate is `14.6 + 2.6 × straight-line km`, fitted on 72 live journeys (median error ~0), also used by `getCommute`'s fallback |
| `getLandlordFlatContext({ address, areaM2 })` | landlord flat setup: free-text address (`parseAddress` + `lookupAddress`) → matched address, PLZ, Ortsteil, Wohnlage, median synthetic service charge per m² in the PLZ, and the `checkRentFairness` comparables |
| `getPlanungsraumDetail(plrId)` | full row + `facts`, rent by room count (via `rentals.plr_id`) and every Kita/OSM point (`pois`). `null` for an unknown id. `plrId` is a string |
| `getPlanungsraumRentals({ plrId, rooms, limit })` | example synthetic rentals, exact room count first, closest counts fill in (`roomsRelaxed` says so) |
| `getResultsMap(plrIds)` | finder results map: each area's polygon + bbox (in `plrIds` order) and the `poi_locations` points within ~0.9 km of it |
| `getPlanungsraumBoundaries(plrIds?)` | GeoJSON FeatureCollection of PLR polygons (all 542 ≈ 6 MB, so pass `plrIds` to show only results) |
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
  - The system prompt holds the **data caveats** (synthetic vs real, Bezirk-level crime/Abitur, the 7 transit lines for the PLZ tools vs full VBB for the PLR tools, ordinal Umweltatlas ratings, allocated population, OSM hobby gaps). Keep it in sync when the data changes. It tells the model to start "where should I live" questions with `rank_planungsraeume` and to fall back to the PLZ `rank_neighbourhoods` for PLZ talk or parks/cafés/playgrounds (those exist only per PLZ).
  - The PLR tool wrappers in `tools.ts` slim the output for the model: `rank_planungsraeume` drops `lat`/`lon`/`photo`, and `get_planungsraum_profile` returns only names (max 8 per category) plus counts instead of every POI point.
- **Wire format:** newline-delimited JSON `ChatEvent`s from `src/lib/chat-events.ts`: `{type:"text",delta}`, `{type:"tool_call",id,name,args}`, `{type:"tool_result",id,ok,summary,ms}`. Errors arrive as text deltas starting with "⚠️". The client (`assistant-chat.tsx`) parses lines into message `parts` (text through `<Streamdown>`, tools as expandable rows showing label, summary, ms and args). Only text parts are sent back as history.
- Adding a tool:
  1. Write the query in `queries.ts`.
  2. Add its input schema in `filters.ts`. Every field must be `.nullable()`, not `.optional()`, because `zodResponsesFunction` makes tools strict. Don't use `.min/.max`; clamp in the query instead.
  3. Add an entry to `defs` in `tools.ts`. Optionally teach `summarize()` its one-line result.
  4. Add a label and icon in `TOOL_META` in `assistant-chat.tsx`.
- Seeing the tool rows is useful for debugging: when the model makes many calls for one question (6 rental searches for "near the U8"), a filter is missing.
- For structured JSON use `openai.responses.parse` with `zodTextFormat` (from `openai/helpers/zod`).
- **Hosted web search:** `tools.ts` appends OpenAI's `{ type: "web_search" }`. OpenAI runs it inside the response (no function_call round). `route.ts` turns each `web_search_call` output item into a `tool_call` + `tool_result` event (name `web_search`, args `{ query, sources }`) and requests `include: ["web_search_call.action.sources"]`. The system prompt limits the web to what the DB can't answer (flat size norms, Brandenburg) and requires citing it.
- **BVG / transport.rest is volunteer-run and was down on 2026-09-28 and 2026-09-29.** Nothing depends on it: addresses are geocoded from our own tables first, and live journeys only refine the straight-line estimate. `src/lib/bvg.ts` has a 2.5 s timeout and a circuit breaker (after a failure or 5xx/429 it skips BVG for 5 min per server instance). `BVG_API_URL` overrides the base URL.

## Implementing the design (next chat)

- **Keep:** everything in `src/db`, `src/lib`, `src/app/api/chat`. The screens should consume the Query API above. Don't query the DB from new places.
- **Placeholder, replace freely:** `src/app/page.tsx` and `src/components/dashboard/*`. `assistant-chat.tsx` holds the working streaming + tool-row logic (`applyEvent`, NDJSON parsing). Restyle it or move that logic into a hook rather than rewriting it.
- Wiring patterns:
  - Read-only screens (PLZ detail, district overview): server component + `await connection()` + query call.
  - Interactive filtering (Kiez finder with weight sliders, listing search): a Server Action or a small route handler that validates with the **same Zod schema** from `filters.ts` (`rankKiezInput`, `rentalFilters`, …) and calls the query. Keep filter state in the URL (`searchParams`) so results are shareable and the pitch demo is reproducible.
  - Map: `kiez-map.tsx` shows the 193 PLZ centroids. A choropleth can use `planungsraum_boundaries` (PLR polygons; there are no PLZ polygons).
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

## Deploying (Vercel + Neon)

Live on Vercel with a Neon database. The app was first set up with the steps below.

### Rule: keep the production database in step with every push to `main`

**Every push to `main` redeploys Vercel, and the deployed code reads Neon.** If a commit changes the schema (`src/db/schema.ts`) or the data the app reads (a `data:fetch` update, `seed.ts`, new tables or columns), Neon must be updated **before the push reaches `main`**, or the live app breaks. This already happened once: the Planungsraum change went out first and the dashboard showed "Database not ready" (`column "ug_planungsraum_nr" does not exist`) until Neon was updated.

Before pushing (or merging) to `main`, ask whether the commit touches the schema or data. If it does:

1. Get the Neon **direct** (non-`-pooler`) connection string from the user. Never write it to a file, a commit or `.env.local`, and don't repeat it in replies. Drop `channel_binding=require` from the URL (the Postgres driver may reject it) and keep `sslmode=require`.
2. Look before writing: `docker exec berlin-housing-db psql "$URL" -c "\dt"` against Neon shows which tables and columns it has.
3. Apply the schema: `DATABASE_URL="<neon direct url>" npm run db:push -- --force`. It is additive for new columns and tables, but `--force` also auto-approves drops, so check the diff first when a column is removed or renamed.
4. Load the data: `DATABASE_URL="<neon direct url>" npm run db:refresh-profiles` when only the profile, Planungsraum, POI tables or `rentals.plr_id` changed (seconds). Use `npm run db:seed` when anything else changed (address, listing, kita or crime data, or the seed logic for those). It wipes and reloads everything, and takes longer than local because of the 400k address rows over the network.
5. Verify through the app's own client, using the **pooled** URL and `VERCEL=1` like production does (a tmp `.mts` script, see "Query API"), and delete the script afterwards.
6. Only then push or merge to `main`. A push to a feature branch does not redeploy production, so it is safe to push branches first.

Commits that change neither the schema nor the data (UI, prompts, docs) need no database step. If the user gives the Neon URL, updating Neon is part of the task, not an extra. If they don't, say clearly that Neon still needs updating before the push to `main`.

If the deployed page shows "Database not ready", read the grey error text under the card: `column/relation ... does not exist` means Neon is behind the code (steps above); a connection error means Vercel's `DATABASE_URL` is wrong or unset (it falls back to `localhost` from `src/lib/env.ts`).

### Original setup steps

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
  - Data repo integrated: 14 tables, all row counts match the CSVs (incl. Planungsraum profile, boundaries and POI points).
  - Query layer and 13 LLM tools (10 PLZ + 3 Planungsraum), all verified with real OpenAI responses: rank neighbourhoods, profile, search rentals and sales (with the geometry-based transit line filter), address lookup, rent fairness check, price trend, kitas, schools, crime.
  - Chat UI shows each tool call.
  - Placeholder dashboard rewired to the real data.
  - Build, lint and typecheck are clean.
  - Landing page built from Figma (light + dark, mobile + desktop). Dashboard moved to `/explore`.
  - Kiez finder `/find` (2 steps from Figma) → `/find/results` (`rankPlanungsraum` + commute check), answers in the URL. Step 2 "What matters most?" shows four broad Must have / Flexible / Don't need switches (`SIMPLE_PRIORITIES` in finder-params.ts: Family-friendly = schools+kitas+safety, Green spaces = green+noise, Close to transit, Affordable rent; each sets all its factors, `normaliseLevels` keeps them equal). The other factors stay Flexible unless the text moves them ("Also from your text … Reset"). A priority the text would raise to Must have is set to Flexible with a "Make it a Must have?" confirm. The finder always ranks with `outsideRing: true` (the must-have was removed, 30 Sep UX doc). Air is never the card's "Main trade-off" (`NOT_A_TRADE_OFF` in match-card.tsx). Then the groups as compact cards, "Nice to have nearby" tags and must-haves and a max cold rent per m² cap (the cards also show a typical monthly warm rent from `getTypicalRents`, synthetic); the optional text box fills the switches and tags via the AI, and wishes it can't rank show as muted "noted" chips. Result cards carry a pictogram strip (`fact-icons.tsx`) and show ÖPNV/walk minutes instead of km. The results page calls no model.
  - Deployed on Vercel + Neon; the Planungsraum schema and data were applied to Neon on 2026-09-29.
  - Data gaps filled: OSM green/water/parks/cafés + Wikimedia photos (committed JSON, seeded into `kiez_enrichment`), `nature`/`amenities` ranking factors, `outsideRing` filter, `get_commute` tool (BVG), hosted web search in chat.
- **Next:**
  - Landlord flow: all 4 steps done (invites, saves and questions are demo toasts, nothing is stored or sent); the plot twist on 2026-09-29 made a landlord side required. The home screen design with a proper landlord entry point is still to come.
  - A Planungsraum detail page for the result cards to link to (gem cards still link to `/explore`).
  - (Deployed to Vercel + Neon; keep Neon in step with `main`, see "Deploying".)
- **Ideas, not started:**
  - Add a `transitLines` filter to `rankKiez`.
  - Use the VBB network for transit filters (real stations exist in `planungsraum`; `transit_stations` is still 7 lines).
  - Finder results: address autocomplete (`lookupAddress` suggestions).
  - Optional PLZ×Bezirk population table (`DATA  SOURCES/berlin_population_by_plz_bezirk.csv`), skipped on purpose: PLR already has allocated population, the vintage is unknown and 3 PLZs are missing.
  - Choropleth from `planungsraum_boundaries`.
  - If the transit `exists` filter gets slow, add a bounding-box pre-filter (currently 0.1–0.6 s).
