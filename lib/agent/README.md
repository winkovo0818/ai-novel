# Agent Orchestration Layer

This directory contains the lightweight agent orchestration for the AI novel writing system. There is **no LangChain/CrewAI framework** — each agent is a typed function or service boundary, and the orchestration is explicit in API route handlers.

## Design Principles

1. **Pure functions where possible** — agents don't mutate global state.
2. **Explicit inputs/outputs** — every agent has a TypeScript contract in `contracts.ts`.
3. **Fail-open for retrieval** — if RAG fails, the Writer still proceeds.
4. **Human-in-the-loop for state changes** — `StateDiff` requires user confirmation before Bible update.
5. **No agent-to-agent direct calls** — routes orchestrate; agents are stateless.

## Agent Inventory

| Agent | File | Input | Output | Status |
|---|---|---|---|---|
| **Outline Agent** | *(onboarding only)* | `OutlineAgentInput` | `BeatSheet` | Partial — beats generated during onboarding, not yet dynamically per-chapter |
| **Retrieval Agent** | `retrieval.ts` | `RetrievalAgentInput` | `RetrievedMemory[]` | v1 — keyword + cosine similarity |
| **Writer Agent** | `draft/route.ts` | `WriterAgentInput` | `string` (SSE stream) | Live — uses `buildChapterContext()` + `buildChapterPrompt()` |
| **Critic Agent** | `critic/route.ts` | `CriticAgentInput` | `CriticAgentOutput` | v1 — blocks critical/major silent overwrites |
| **State Updater** | `state-diff/route.ts` | `StateUpdaterInput` | `StateDiff` | v1 — human confirmation required |
| **Summarizer** | `summarize/route.ts` | `SummarizerAgentInput` | `string` | Live — per-chapter summary |
| **Tiered Summarizer** | `summaries.ts` | `TieredSummarizerInput` | `TieredSummarizerOutput` | v1 — volume + novel summaries |

## Orchestration Flow

```
User clicks "AI 起草"
        │
        ▼
┌───────────────┐
│  Writer Agent │◄── ChapterContext (Bible + story_state + summaries + retrievedMemories)
└───────────────┘
        │
        ▼ SSE stream
┌───────────────┐
│  Critic Agent │◄── generated text + ChapterContext
└───────────────┘
        │
   ┌────┴────┐
   ▼         ▼
consistent  critical/major
   │            │
   ▼            ▼
 save        CriticPanel (user decides: save / regenerate / dismiss)
   │
   ▼
User clicks "状态追踪"
        │
        ▼
┌───────────────┐
│ State Updater │◄── chapter text + old story_state
└───────────────┘
        │
        ▼ StateDiffPanel
   user confirms
        │
        ▼
  PATCH /api/novels/:id/bible
```

## Context Builder

`buildChapterContext()` in `chapterContext.ts` is the central orchestration helper. It assembles:

1. **Bible** — full novel bible.
2. **Story State** — optional `story_state` from Bible.
3. **Outline** — current chapter title/summary.
4. **Novel Summary** — high-level plot recap.
5. **Volume Summary** — current arc summary.
6. **Recent Chapters** — last 5 chapter summaries (or 900-char excerpts).
7. **Retrieved Memories** — top-K relevant chunks from RAG.

## Adding a New Agent

1. Define `YourAgentInput` and `YourAgentOutput` in `contracts.ts`.
2. Create a pure function or route handler that accepts the input and returns the output.
3. Add a prompt builder in `lib/llm/prompts/` with a corresponding `.test.ts`.
4. Wire the agent into the orchestration flow (usually `buildChapterContext()` or a route).
5. Update this README.

## Prompt Testing

Every agent prompt should have a Vitest file in `lib/llm/prompts/*.test.ts` that asserts:
- The prompt contains expected sections/keywords.
- The prompt does not exceed a reasonable token budget (optional).
- Edge cases (missing story_state, empty previous chapters) are handled.
