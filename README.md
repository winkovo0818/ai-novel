<p align="center">
  <img src="https://img.shields.io/badge/Next.js-15-black?logo=next.js" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript" alt="TypeScript strict" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169e1?logo=postgresql" alt="PostgreSQL 16" />
  <img src="https://img.shields.io/badge/Prisma-ORM-2d3748?logo=prisma" alt="Prisma" />
  <img src="https://img.shields.io/badge/Tailwind-v4-06b6d4?logo=tailwindcss" alt="Tailwind v4" />
  <img src="https://img.shields.io/badge/tests-700%2F702%20passing-brightgreen" alt="Tests" />
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT" />
</p>

<h1 align="center">AI Novel</h1>
<p align="center"><strong>AI-powered long-form fiction writing studio</strong></p>
<p align="center">Bible synthesis &middot; multi-chapter editor &middot; RAG memory &middot; parallel generation &middot; version history &middot; multi-format export</p>

---

## Why AI Novel

Writing a novel is hard. Keeping dozens of characters, world rules, and plot threads consistent across hundreds of pages is harder. AI Novel is a writing studio that combines a structured Story Bible with LLM-powered drafting, RAG-based memory retrieval, and a full-featured editor -- so you focus on creative decisions while the machine handles continuity.

**What makes it different from a generic LLM chat:**

- **Structured Bible** -- characters, world rules, and chapter outlines live in typed schemas, not in prompt context
- **RAG memory** -- vector search across all written chapters with time decay and query expansion, so the AI remembers what happened 20 chapters ago
- **Multi-candidate generation** -- get two parallel drafts (standard + creative) and pick the best one
- **Memory preview** -- see exactly what context the AI will use *before* generating
- **Version history + diff** -- every manual save creates a snapshot; compare and restore any version

---

## Features

### Onboarding Wizard
5-step guided Bible creation: genre selection, logline generation, Socratic questions, streaming Bible synthesis, field-level editing with up to 3 retries.

### Story Bible
| Section | Contents |
|---------|----------|
| Characters | Name, role, personality, motivation, arc, relations |
| World | Setting summary, rules, geography, factions |
| Outline | Volume-grouped chapters with summaries and beats |
| Story State | Runtime tracking of character locations, goals, emotions, active plot threads, timeline |

### Editor
- Chapter switching with unsaved-change detection
- Auto-save (3s idle) + Ctrl/Cmd+S
- Optimistic locking with 409 conflict resolution
- Word count target with SVG ring progress (red to amber to green to orange)
- Chapter version history with inline diff and restore

### AI Writing Pipeline
`
Outline Agent -> Retrieval Agent -> Writer Agent -> Critic Agent -> State Updater
`

- **Memory preview** -- review retrieved chunks before drafting
- **Multi-candidate** -- 2 parallel generations at different temperatures
- **Candidate panel** -- accept (overwrite/append/insert) or discard; per-candidate critic
- **Beat sheet** -- generate 5-8 beats per chapter for guided writing
- **Chapter revision** -- AI rewrites based on critic feedback
- **Consistency check** -- cross-chapter plot/world/character audit
- **Auto-summarize** -- mark a chapter as done, summary runs in background

### RAG Memory System
- **Chunking** -- paragraph-aware splitting (80-800 chars) with heuristic classification
- **Embedding** -- BGE-M3 via EdgeFn (1024-dim pgvector)
- **Retrieval** -- 3-query expansion, time-decay re-ranking, keyword pre-filter
- **Auto-index** -- manual save or mark-done triggers background indexing

### Export Center
Markdown, plain text, Word (docx), EPUB -- chapter range selection, optional Bible appendix.

### Admin & Security
- LLM/embedding model management via UI (keys encrypted at rest)
- Content moderation (keyword + LLM + streaming guard)
- Rate limiting (memory or Upstash Redis)
- Usage quotas (daily/monthly cost + call limits)
- Prometheus metrics + Sentry error reporting

---

## Quick Start

### Prerequisites
- Node.js 22+
- PostgreSQL 16
- LLM API key (DeepSeek or Anthropic protocol)

### Setup
`ash
git clone https://github.com/winkovo0818/ai-novel.git
cd ai-novel
npm install
cp .env.example .env
`

Edit .env:

| Variable | Required | Default |
|----------|----------|---------|
| DATABASE_URL | Yes | -- |
| DIRECT_URL | Yes | -- |
| DEEPSEEK_API_KEY | Yes | -- |
| DEEPSEEK_BASE_URL | Yes | https://api.deepseek.com/v1 |
| AUTH_SECRET | Yes | -- |
| LLM_MOCK | -- | off |

### Database
`ash
npm run db:up        # Docker PostgreSQL on 127.0.0.1:5432
npm run db:migrate   # Apply migrations
`
Or for hosted Postgres: 
pm run db:deploy

### Run
`ash
npm run dev          # http://localhost:3000
npm run verify       # typecheck + test + build
`

### Admin
Set ADMIN_USER_IDS or ADMIN_EMAILS in .env to unlock /models for provider configuration.

---

## Usage

1. **Sign up** at /signup, log in
2. **Create a novel** -- follow the 5-step wizard
3. **Write** -- open /editor/[novelId], click "Preview Memories" then "Confirm and Generate"
4. **Review** -- accept (overwrite/append/insert) or discard the AI candidate
5. **Mark done** -- auto-summarization runs in background
6. **Manage** -- /novels/[novelId]/chapters for batch refresh, filtering, summaries
7. **Export** -- Export Center for markdown, txt, docx, epub

---

## Architecture

`
app/                          # Next.js App Router
  (app)/                      # Authenticated routes
    editor/[novelId]/         # Chapter editor (8 composed hooks)
    novels/[id]/              # Project shell + sub-pages
  api/                        # 50+ REST endpoints

lib/
  agent/      # AI pipeline (retrieval, chunking, summarization)
  auth/       # Ownership, rate-limit, session, routeGuard
  jobs/       # Background queue (summarize, index, tiered summaries)
  llm/        # Client, embeddings, prompts, Anthropic adapter
  moderation/ # Content moderation pipeline
  validation/ # Zod schemas (domain + API)
`

**Agent pipeline:**
`
Bible + Summaries + Retrieved Memories
        |
        v
buildChapterPrompt()     # System + user messages
        |
        v
streamChatCompletion()   # SSE to client (2 parallel candidates)
`

**Background jobs:**
`
Chapter PATCH (save / mark-done)
        |
        v
summary_dirty = true, index_dirty = true
        |
        v
runPendingJobsForNovel()     # fire-and-forget
    summarize_chapter         # LLM summary
    index_chapter             # chunk -> embed -> MemoryChunk
    refresh_summaries         # volume + novel tiered
`

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 15 (App Router, SSE) |
| Language | TypeScript 5 (strict) |
| Styling | Tailwind CSS v4 |
| Database | PostgreSQL 16 + pgvector |
| ORM | Prisma |
| LLM | DeepSeek / Anthropic (pluggable via UI) |
| Embeddings | BGE-M3 (1024-dim) |
| Auth | Auth.js / NextAuth v5 |
| Validation | Zod |
| Testing | Vitest + Playwright |
| Monitoring | Prometheus + Sentry + Grafana |

---

## Testing

`ash
npm run verify       # typecheck + vitest + build
npm run test         # vitest (700/702 passing)
npm run test:e2e     # Playwright (LLM_MOCK=1)
`

---

## Deployment

`ash
npm run build
docker build -t ai-novel .
docker run -p 3000:3000 --env-file .env.production ai-novel
`

Also works on Vercel with a managed Postgres -- run 
pm run db:deploy first.

---

## License

MIT
