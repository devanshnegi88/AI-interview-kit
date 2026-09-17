# AI Interview Prep Kit

Turns a job description, a company website, and a number of days available into
a personalized interview preparation kit (research, questions, flashcards, and
a study schedule).

This README covers Phases 1–9 (through independent question generation).
Flashcards, kit assembly UI, practice mode, and the batch evaluator land later.

## Project structure

```
.
├── backend/            Express + TypeScript API
│   └── src/
│       ├── auth/        Phase 3: sessions, bcrypt, HTTP-only cookies
│       ├── kits/        (later — reserved)
│       ├── http/        Phase 4: SSRF-safe HTTP client (crawler uses this later)
│       ├── research/    Phase 5: dynamic same-domain crawler
│       ├── llm/         Phase 6: generateWithLLM (Groq free tier)
│       ├── generation/  Phases 7–9: requirements, research, questions
│       ├── validation/  Phase 2: Zod Appendix A schema, coverage, stable ids
│       ├── scheduling/  Phase 2: deterministic day-by-day allocator
│       ├── evaluation/  (later — reserved)
│       ├── common/      env config + MongoDB connection
│       ├── app.ts       Express app factory (health endpoint)
│       └── server.ts    process entry point
├── frontend/            Next.js (App Router) + TypeScript + Tailwind
│   └── app/
│       ├── layout.tsx
│       ├── page.tsx     landing page, calls backend /health
│       └── globals.css
├── shared/
│   └── types/           API envelope + Appendix A kit types
└── package.json          root convenience scripts
```

## Prerequisites

- Node.js 20+
- A MongoDB instance reachable via a connection string (local `mongod`, Docker, or Atlas)

## Setup

```bash
git clone <repo-url>
cd ai-interview-prep-kit

# install dependencies for both apps
npm run install:all

# create local env files from the examples
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Edit `backend/.env` and set `MONGODB_URI` to a real MongoDB connection string.
The default (`mongodb://127.0.0.1:27017/ai_interview_prep_kit`) assumes a local
MongoDB on the default port.

## Running in development

From the repo root, using the two apps' own dev servers concurrently:

```bash
npm run dev
```

Or run each independently in two terminals:

```bash
npm run dev:backend    # http://localhost:4000
npm run dev:frontend   # http://localhost:3000
```

## Phase 2 — Deterministic core

Built **before any AI generation**. The kit contract, coverage rules, and
scheduler are pure functions: same input always yields the same output. Later
LLM stages must run their output through `assembleKit` / `validateKit`; they
cannot invent coverage or a schedule.

| # | Piece | Where |
| --- | --- | --- |
| 1 | Appendix A Zod schema | `backend/src/validation/schema.ts` (+ `shared/types`) |
| 2 | Requirement validation | `backend/src/validation/requirements.ts` |
| 3 | Question validation | `backend/src/validation/questions.ts` |
| 4 | Flashcard validation | `backend/src/validation/flashcards.ts` |
| 5 | Schedule validation | `backend/src/validation/scheduleCheck.ts` |
| 6 | Stable ID validation | `backend/src/validation/ids.ts` |
| 7 | Referential integrity | `backend/src/validation/integrity.ts` |
| 8 | Coverage checker | `backend/src/validation/coverage.ts` |
| 9 | Deterministic schedule allocator | `backend/src/scheduling/schedule.ts` |

The LLM is never asked to check coverage, build a schedule, validate IDs, or
validate structure. Those are code.

**Coverage algorithm** (pure function, `computeCoverage`):

1. Collect all must requirement IDs (`collectMustRequirementIds`).
2. Collect requirement IDs referenced by questions (`collectReferencedRequirementIds`).
3. Calculate uncovered IDs (`calculateUncoveredIds`): must IDs minus referenced IDs.
   Return them as `uncovered_requirement_ids`. Coverage is a pure function.
4. `must_have_missing` = those uncovered IDs.
   `passed` is false if that set is non-empty, or if the role has no must-haves.
5. `score` = |covered must-haves| / |must-haves| (0 if none).
6. Question counts by `type` must meet `minCountsByType(days_available)`.
7. Flashcard count must meet `minFlashcards(questionCount, days_available)`.
8. Questions with no linked flashcard are warnings; they do not fail `passed`.
9. Any `kit.coverage` object from a caller/model is discarded and replaced.

`hours_per_day` is a target, not a hard cap: questions are never dropped.

**Scheduler** (`buildSchedule`): exactly `days_available` days; integer minutes;
must-have questions earlier than nice-to-have; harder questions earlier than
easier; same input always yields the same schedule.

## Verifying Phase 1

1. **Backend health check**
   ```bash
   curl http://localhost:4000/health
   ```
   Expected: `{"success":true,"data":{"status":"ok","db":"connected|connecting|disconnected","uptimeSeconds":...,"timestamp":"..."}}`.
   `db` reflects the real Mongoose connection state — the server starts even
   if MongoDB is unreachable, and this field will simply read `disconnected`.

2. **Frontend loads**
   Open `http://localhost:3000`. The page shows a "Backend connectivity" card
   that calls `/health` client-side and displays the live status — confirming
   the frontend/backend/env wiring all work together.

3. **Type checking**
   ```bash
   npm run typecheck
   ```

4. **Backend tests**
   ```bash
   npm run test
   ```

5. **Production build**
   ```bash
   npm run build
   ```

## Verifying Phase 2

```bash
npm run test
npm run typecheck
```

Phase 2 tests cover: stable ids, Zod schema accept/reject, coverage pass/fail
(including ignoring a fake `passed: true`), scheduler determinism and
order-independence, full-question allocation, and `assembleKit` / `validateKit`.

There is no LLM call and no new HTTP route in this phase. The health endpoint
from Phase 1 is unchanged.

## What's deliberately NOT here yet

Flashcard generation, kit persistence, practice mode, and `npm run evaluate`.
LLM access is only through `generateWithLLM`.

## Phase 3 — Authentication

Session-based auth. Passwords are bcrypt hashes (never stored in plaintext).
The session cookie is HTTP-only, signed, and expires. Invalid or expired
sessions are rejected and the cookie is cleared.

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/api/auth/register` | public |
| POST | `/api/auth/login` | public |
| POST | `/api/auth/logout` | cookie optional |
| GET | `/api/auth/me` | session required |
| GET | `/api/kits` | session required (empty stub; no generation) |

`requireAuth` and `requireOwner` live in `backend/src/auth/`. Owner id is
never taken from the request body.

## Phase 4 — Secure HTTP client

Reusable retrieval for the later crawler. **Hostname checks are not enough:**
every hop resolves DNS and validates the destination IP. Redirects are
re-validated the same way. Private, loopback, and link-local addresses are
rejected. Localhost is never fetched.

Retries (exponential backoff + jitter, honors `Retry-After`): 429, 408, 5xx,
temporary network errors. Never retried: 400, 401, 403.

Also: request timeout, max response size, Content-Type allow-list, robots.txt
parser foundation, per-host rate limiting.

## Phase 5 — Dynamic company crawler

`createCompanyCrawler` fetches the homepage through the Phase 4 client,
respects robots.txt, extracts links with Cheerio, stays on the same domain,
and ranks URLs by keyword signals (hiring / careers / interview / about /
product) in the URL, title, anchor, and text. Failed pages are skipped;
research continues. Output: pages (url, title, cleaned text), discovered
topic URLs, and skipped sources.

## Phase 6 — LLM abstraction

All model calls go through `generateWithLLM({ stage, systemPrompt, input, schema })`.
Default provider is **Groq** (OpenAI-compatible, genuine free tier). Set
`LLM_PROVIDER=xai` or `ollama` if needed. Concurrency defaults to 1 with a
1.5s minimum interval.

Pipeline: LLM text → JSON parse → Zod validate → bounded repair/retry →
Zod again. Invalid after that is a structured `{ ok: false, error }` — the
model is never trusted as-is.

Retries: 429, 408, 5xx, network (honors Retry-After). Never: 400, 401, 403.

## Phase 7 — Requirement extraction

`extractRequirements(jd)` is independently callable. It uses `generateWithLLM`,
then assigns content-addressed `req_` ids and validates with Phase 2 Zod
(`ExtractedRequirementSchema`: `id`, `text`, `kind`, `priority`).

- kind: `technical` | `behavioural` | `domain`
- priority: `must` | `nice` (from JD wording only; no invented skills)

A two-line JD yields a thin list. Invalid kind/priority/JSON is a structured failure.

## Phase 8 — Company and interview research

`researchCompany(url)` crawls with Phase 5, then calls `generateWithLLM`.
Crawled HTML is wrapped in `<UNTRUSTED_WEB_CONTENT>` and never placed in the
system prompt. Appendix A `company_brief` is `{ summary, what_they_do, sources }`.
Missing hiring or interview material is recorded honestly (`found: false`).
Sources not seen in the crawl are dropped. Failed pages are skipped.

## Phase 9 — Question generation

Separate modules, one category each: `technical`, `behavioural`,
`system-design`, `company-fit`. Inputs: extracted requirements, company brief,
role, research context.

Every question: `id`, `requirement_ids`, `category`, `prompt`, `answer_outline`,
`difficulty` where difficulty is `1 | 2 | 3`. Ids must be real requirements.
Must technical requirements get extra questions when the JD supports it.
Invalid ids/category/difficulty fail Zod. Coverage loop is not in this phase.

## Known items to revisit in a later hardening pass

- `npm audit` on `frontend/` reports advisories against the Next.js 14.x line
  as a whole (see `next audit` output). We're pinned to `14.2.34`, the latest
  patched 14.x release, rather than jumping to Next 16 (a breaking change) for
  a foundation phase — worth revisiting before any real deployment.
#