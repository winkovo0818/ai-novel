# AI Novel Studio

AI-powered novel co-creation platform — from a single spark of inspiration to a fully structured manuscript, with an AI writing partner at every step.

[![CI](https://github.com/YunDanFengQing/ai-novel/actions/workflows/ci.yml/badge.svg)](https://github.com/YunDanFengQing/ai-novel/actions/workflows/ci.yml)
[![TypeScript Strict](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/tsconfig#strict)
[![Tests](https://img.shields.io/badge/tests-700%20passing-brightgreen)](https://github.com/YunDanFengQing/ai-novel)

---

## Features

### 5-Step Onboarding Wizard

Turn a one-line idea into a complete story bible in minutes:

1. **Genre & Title** — Pick a genre (web novel, literary fiction, screenplay, fanfic, short stories) and name your work
2. **Logline** — Write your own one-liner or let AI suggest 5 options
3. **Reverse Questions** — AI generates probing questions about your world and characters, with suggested answers
4. **Bible Generation** — SSE streaming builds your characters, world rules, geography, factions, and chapter outlines in real time
5. **Review & Edit** — Fine-tune any field, regenerate up to 3 times, then save or jump straight into writing

### Multi-Chapter Editor

- **Chapter switching** with unsaved-changes confirmation
- **Auto-save** (3s debounce) + manual Ctrl/Cmd+S
- **AI Draft → Candidate Mode** — AI no longer overwrites your text; drafts appear in a side panel with 4 actions: Replace / Append / Insert at Cursor / Discard
- **Critic Integration** — AI consistency warnings embedded as inline alerts in the candidate panel
- **Beat Sheet** — Generate and edit per-chapter beat outlines, then draft from beats
- **Retrieval Visualization** — See which memory chunks the AI referenced (source, similarity score, reason, snippet)
- **Version History + Diff** — Restore any past version with a side-by-side diff view; current text is auto-snapshotted before restore
- **Optimistic Locking** — 409 conflict detection prevents silent overwrites from another session
- **Target Word Count** with live progress ring and last-saved timestamp

### Project Workspace

- **Dashboard** — Recent edits, pending chapters, AI call stats, monthly usage, failed job alerts, smart "next step" suggestions
- **Novel Detail** — Progress stats, Bible status, recent chapters, 6 navigation cards
- **Character Editor** — Full-schema character cards with all fields
- **World Editor** — Background, rules, geography, factions in structured sections
- **Outline Editor** — Volume-grouped chapter outlines with draft status badges
- **Relationship Graph** — Interactive SVG character relationship diagram with editable relation cards
- **Chapter Management** — Filterable table with summary/index dirty status and batch refresh
- **AI History** — Last 100 AI calls with agent/status/price filters and detail drawer
- **Export Center** — Markdown, plain text, Word (.docx), EPUB with chapter range selection and Bible appendix option

### Admin & Security

- **DB-driven Role System** — `user_roles` table with env fallback for disaster recovery
- **User Management** — Grant/revoke admin roles from `/admin/users`
- **LLM Model Configuration** — Add, edit, enable/disable DeepSeek/OpenAI-compatible endpoints with encrypted API keys
- **Embedding Model Configuration** — Manage embedding providers (strict 1024-dim for pgvector compatibility)
- **Content Moderation** — Local keyword filter + LLM-based check with configurable failure mode (allow/block/review) and audit trail
- **Moderation Review Queue** — Human review for flagged content with status tracking and 90-day TTL cleanup
- **Rate Limiting** — In-memory or Upstash Redis backends
- **CSP with Nonce** — Per-request Content Security Policy
- **SSRF Protection** — URL/scheme/private-IP validation on model endpoints

### Observability

- **Prometheus Metrics** — `/api/metrics` with bearer token auth (10 metric families: LLM requests/tokens/cost/p95 latency, job status, novel/chapter counts, moderation decisions)
- **Sentry Integration** — Zero-SDK envelope sender for server-side error reporting
- **Structured Logging** — JSON logger with info/warn/error levels
- **LLM Usage Auditing** — Per-call token counts, cost, latency, model, route, and error tracking
- **Grafana Alert Rules** — Pre-configured rules for LLM failure rate, draft latency, daily cost, and background job failures

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 15](https://nextjs.org/) (App Router) + TypeScript (strict) |
| UI | [Tailwind CSS v4](https://tailwindcss.com/) with Ivory & Ink design tokens |
| State | [Zustand](https://zustand.docs.pmnd.rs/) (client) + React Server Components (server) |
| Database | [PostgreSQL 16](https://www.postgresql.org/) + [Prisma](https://www.prisma.io/) ORM + [pgvector](https://github.com/pgvector/pgvector) (HNSW) |
| LLM | DeepSeek-V3 (OpenAI-compatible protocol) with DB-configurable model routing |
| Auth | [Auth.js v5](https://authjs.dev/) (NextAuth) with Credentials provider |
| Validation | [Zod](https://zod.dev/) — single source of truth for all data shapes |
| Testing | [Vitest](https://vitest.dev/) (unit/API) + [Playwright](https://playwright.dev/) (E2E) |
| Observability | Prometheus metrics, Sentry (no-SDK), Grafana alerts |

---

## Quick Start

### Prerequisites

- **Node.js** 22+
- **PostgreSQL** 16+ (with pgvector extension)
- **DeepSeek API Key** (or set `LLM_MOCK=1` for local development)

### Installation

```bash
git clone https://github.com/YunDanFengQing/ai-novel.git
cd ai-novel
npm install
```

### Environment Setup

```bash
cp .env.example .env
```

Edit `.env` with your values. The required variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `DEEPSEEK_API_KEY` | DeepSeek API key |
| `AUTH_SECRET` | Session secret (generate with `openssl rand -base64 32`) |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` |

Optional but recommended:

| Variable | Description |
|----------|-------------|
| `LLM_MOCK=1` | Use mock LLM (no real API calls) |
| `ADMIN_USER_IDS` | Comma-separated user IDs for admin access |
| `ADMIN_EMAILS` | Comma-separated emails for admin access |
| `METRICS_TOKEN` | Bearer token for Prometheus `/api/metrics` endpoint |
| `SENTRY_DSN` | Sentry project DSN for error reporting |
| `RATE_LIMIT_STORE=redis` | Use Upstash Redis for rate limiting |

### Database

```bash
# Start local PostgreSQL (Docker, binds to 127.0.0.1 only)
npm run db:up

# Apply migrations
npm run db:migrate
```

For existing managed PostgreSQL, just set `DATABASE_URL` and run:

```bash
npm run db:deploy
```

### Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll see the landing page. Sign up, create your first novel, and start writing.

---

## Project Structure

```
ai-novel/
├── app/                          # Next.js App Router
│   ├── (app)/                    # Authenticated routes (sidebar layout)
│   │   ├── dashboard/            # Workspace dashboard
│   │   ├── novels/               # Novel management & Bible editors
│   │   ├── editor/[novelId]/     # Multi-chapter editor (8 sub-hooks)
│   │   ├── new/                  # 5-step onboarding wizard
│   │   ├── models/               # LLM & embedding config (admin)
│   │   ├── admin/                # User management & moderation (admin)
│   │   └── profile/              # Account settings
│   ├── api/                      # 46 API routes
│   │   ├── auth/                 # Signup, login, password reset
│   │   ├── novels/               # CRUD, draft, critic, export, jobs
│   │   ├── chapters/             # Update, versions, summarize, state-diff
│   │   ├── onboarding/           # Session management, Bible generation
│   │   ├── admin/                # Users, roles, moderation audits
│   │   ├── llm-models/           # Model configuration CRUD
│   │   ├── embedding-models/     # Embedding configuration CRUD
│   │   ├── healthz/              # Health checks (public + admin)
│   │   ├── metrics/              # Prometheus metrics
│   │   └── cron/                 # Scheduled cleanup jobs
│   ├── login/                    # Auth pages
│   ├── signup/
│   └── reset-password/
├── components/
│   ├── auth/                     # Shared auth form components
│   ├── layout/                   # Sidebar
│   └── ui/                       # Design system primitives
├── lib/
│   ├── agent/                    # AI writing pipeline agents
│   ├── auth/                     # Session, ownership, rate limiting
│   ├── bible/                    # Bible data helpers
│   ├── editor/                   # Chapter utility functions
│   ├── export/                   # 4-format export (md/txt/docx/epub)
│   ├── hooks/                    # Shared React hooks
│   ├── http/                     # API response helpers
│   ├── jobs/                     # Background job queue
│   ├── loaders/                  # Shared server-side data loaders
│   ├── llm/                      # LLM client, embeddings, prompts, usage
│   ├── metrics/                  # Prometheus collector & formatter
│   ├── moderation/               # Content moderation & stream guard
│   ├── observability/            # Logger & Sentry
│   ├── security/                 # CSP builder
│   ├── store/                    # Zustand stores
│   ├── stream/                   # SSE parser, encoder, JSON stream parser
│   └── validation/               # Zod schemas & merge logic
├── prisma/
│   ├── schema.prisma             # 20 models, 24 migrations
│   └── migrations/
├── tests/e2e/                    # Playwright E2E specs
├── observability/grafana/        # Alert rules
└── docs/                         # Status, roadmap, contracts, phases
```

---

## Database Schema

20 Prisma models across 24 migrations:

| Model | Purpose |
|-------|---------|
| `User` / `Account` / `Session` / `VerificationToken` | Auth.js local authentication |
| `OnboardingSession` | 5-step wizard state |
| `Novel` | Novel project (user-owned) |
| `BibleDraft` | Story bible content (1:1 with Novel) |
| `ChapterDraft` | Chapter content with optimistic locking |
| `ChapterVersion` | Version history snapshots |
| `ChapterSummary` / `VolumeSummary` / `NovelSummary` | Tiered summaries for RAG |
| `MemoryChunk` | Embedding storage (pgvector 1024-dim) |
| `LlmModel` / `EmbeddingModel` | DB-configured AI model endpoints |
| `LlmUsage` | Per-call audit log (tokens, cost, latency) |
| `UserRole` | DB-driven permission grants |
| `ModerationAudit` | Content moderation decisions + review status |
| `BackgroundJob` | Fire-and-forget job queue |
| `DraftSession` | Resumable SSE draft sessions |

---

## API Overview

All API routes follow a consistent envelope: `{ ok: true, data }` or `{ ok: false, error: { code, message, retryable } }`.

| Category | Endpoints |
|----------|-----------|
| Auth | `POST /signup`, `POST /password-reset`, `POST /password`, `POST /logout` |
| Novels | `GET /novels`, `GET /novels/:id`, `PATCH /novels/:id/bible` |
| Chapters | `POST /novels/:id/chapters`, `PATCH/DELETE /chapters/:id` |
| AI Writing | `POST /novels/:id/chapters/draft` (SSE), `POST /chapters/critic`, `POST /chapters/outline` |
| Versions | `GET /chapters/:id/versions`, `POST /chapters/:id/versions/:vid/restore` |
| Export | `GET /novels/:id/export?format=md\|txt\|docx\|epub` |
| Onboarding | `POST /onboarding/sessions`, `/loglines`, `/questions`, `/bible` (SSE), `/finalize` |
| Admin | `GET /admin/users`, `POST/DELETE /admin/users/:id/roles/:role` |
| Moderation | `GET /admin/moderation-audits`, `PATCH /admin/moderation-audits/:id` |
| Models | CRUD `/llm-models`, `/embedding-models` (admin-only) |
| Observability | `GET /healthz`, `GET /healthz/llm`, `GET /metrics` |
| Cron | `GET /cron/draft-sessions/cleanup`, `GET /cron/moderation-audits/cleanup` |

---

## Testing

```bash
# Full verification (lint + typecheck + test + build + docs check)
npm run verify

# Individual commands
npm run typecheck          # TypeScript strict mode check
npm run lint               # ESLint
npm run test               # Vitest unit/API tests (700 tests, 88 files)
npm run test:coverage      # With coverage thresholds (lines 68, functions 93, branches 83)
npm run build              # Production build

# E2E tests (requires LLM_MOCK=1)
$env:LLM_MOCK='1'; npm run test:e2e

# API smoke test
$env:LLM_MOCK='1'; npm run start          # Terminal 1
$env:LLM_MOCK='1'; npm run smoke:onboarding  # Terminal 2
```

---

## Deployment

### Docker

```bash
DOCKER_BUILD=1 npm run build
docker build -t ai-novel .
docker run -p 3000:3000 --env-file .env.production ai-novel
```

### Vercel

The project includes `vercel.json` with cron job configurations for draft session and moderation audit cleanup.

### Production Checklist

- [ ] Set `AUTH_SECRET` (generate with `openssl rand -base64 32`)
- [ ] Set `MODEL_KEY_ENCRYPTION_SECRET` (at least 32 characters)
- [ ] Configure `ADMIN_USER_IDS` or `ADMIN_EMAILS` for admin access
- [ ] Set `MODERATION_FAILURE_MODE=block` (production default)
- [ ] Set `QUOTA_FAILURE_MODE=block` (production default)
- [ ] Set `METRICS_TOKEN` for Prometheus endpoint auth
- [ ] Set `CRON_SECRET` for Vercel cron endpoint auth
- [ ] Run `npm run db:deploy` against production database
- [ ] Configure at least one LLM model via `/models` admin page

---

## Documentation

| Document | Description |
|----------|-------------|
| [`docs/STATUS.md`](docs/STATUS.md) | Current project status (single source of truth) |
| [`docs/HEALTH.md`](docs/HEALTH.md) | Project health report |
| [`docs/ROADMAP_2_4_8_WEEKS.md`](docs/ROADMAP_2_4_8_WEEKS.md) | 2/4/8-week strategic roadmap |
| [`docs/IMPLEMENTATION_TASKS.md`](docs/IMPLEMENTATION_TASKS.md) | Page/interface-level task breakdown |
| [`docs/contracts.md`](docs/contracts.md) | Frozen API/Schema contracts |
| [`docs/OBSERVABILITY.md`](docs/OBSERVABILITY.md) | Sentry/Grafana integration guide |
| [`docs/PROJECT_REVIEW_REPORT.md`](docs/PROJECT_REVIEW_REPORT.md) | Production-standard review |
| [`docs/phases/`](docs/phases/) | Phase decision records (A, B, P0-8) |

---

## License

Private — All rights reserved.
