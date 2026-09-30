# KiezKiss: tech summary

## Tech stack

- **Frontend:** Next.js 16 (App Router, Turbopack, React 19, React Compiler), TypeScript, Tailwind v4, shadcn/ui (Base UI), Recharts, MapLibre + react-map-gl, Streamdown, next-themes (light and dark)
- **Backend:** Next.js Server Components, Server Actions and route handlers, Zod 4 validation
- **Data:** Postgres 17 + Drizzle ORM. 14+ tables, about 500k rows: 400k real addresses with their Mietspiegel Wohnlage, 542 Planungsräume with polygons, Kitas, schools, crime, real VBB transit, OSM amenities, Wikimedia photos
- **AI:** OpenAI Responses API (`gpt-5.5` for the agent, `gpt-5.4-mini` for the fast tasks), structured outputs (`zodTextFormat`), function tools, hosted `web_search`, vision on documents
- **External:** BVG HAFAS (live journeys, with a circuit breaker and a fallback), OSM Overpass, Wikimedia Commons
- **Infra:** Vercel + Neon (Postgres). Docker Postgres for local development

## Features (tech side)

- **Kiez finder:** a two-step wizard that ranks all 542 Berlin areas (Planungsräume) deterministically. Each factor is scored as a percentile across Berlin, over 15 factors: rent, schools, safety, noise, air, green, heat, Kitas, transit, hobbies and more. Areas are then filtered by commute time: a fitted estimate first, then live BVG journeys. All answers live in the URL, so results are shareable and reproducible.
- **Results:** cards with photos, typical rent, main benefit and trade-off, and an interactive MapLibre map with highlight layers for points of interest (Kitas, pediatricians, gyms, parks and more)
- **Tenant apply flow:** financial checks (four equal routes), document uploads checked by AI, an AI-drafted cover letter, and consent before anything is stored
- **Landlord flow (4 steps):** flat setup (address → official Wohnlage, cold rent, comparables), an applicant inbox bucketed only by the stated requirements, a **Fair Pick** commit–reveal lottery (SHA-256, server-held seed in an httpOnly cookie), a shortlist with rule-based reasons, and application detail. The landlord never sees names ("Applicant N").
- **Fairness audit:** a statistical z-test and a Fair Pick position check against bias on protected traits, plus a prompt-injection test case. It runs in the UI and as `npm run audit:fairness`.
- **Guardrails:** discriminatory landlord criteria are blocked (AGG phrase list in English and German)

## How AI is used

**Core principle: the LLM turns human language into structured, validated inputs, and every decision (ranking, filtering, shortlisting) is deterministic and auditable.**

1. **Agentic data assistant** (`/api/chat`): a streaming tool-calling loop (up to 6 rounds, parallel calls) over **13 typed function tools** that query the real database: rank areas, rent fairness, address → Wohnlage, commute, Kitas, schools, crime and more. It also uses OpenAI's hosted web search for questions the database can't answer. The UI shows every tool call live (NDJSON events), and the system prompt spells out the data caveats (which data is synthetic and which is real).
2. **Natural language → structured search** ("Fill in from my text"): free text → Zod-validated priorities, must-haves, rent cap and places, via `responses.parse`. It changes only what the text mentions. Wishes the ranking can't express come back as "noted" chips instead of being dropped silently.
3. **Conversational refinement:** "Not quite right? Tell us what matters" rewrites the inputs, the deterministic ranker re-runs, and the page shows exactly what changed and how the list moved.
4. **Grounded web research:** unrankable wishes (for example "near a climbing club") trigger one hosted web search per result set. A finding is kept **only if its link is one of the pages the search actually returned**, which stops invented links. Results stream into each card with Suspense and never affect the ranking.
5. **Document verification (vision):** uploaded IDs and payslips are checked with a **narrow schema per document type**: an ID only "looks valid", a payslip returns only the net pay. Files are never stored, and results are HMAC-signed, so the server trusts only checks it made itself.
6. **AI cover letter:** drafted from the tenant's guided answers only. It never adds origin, religion, health or numbers.
7. **Landlord text → flat settings:** free text → address, m², rent, rooms, documents. Protected characteristics are dropped in the prompt.
8. **Responsible AI by design:** the discrimination guardrail deliberately uses **no model** (predictable, explainable). The ranking has no wealth-proxy factor. Fair Pick never ranks by income. The fairness audit shows that a prompt injection in a cover letter ("ignore all rules…") changes nothing.
