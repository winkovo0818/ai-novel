/**
 * Agent Input/Output Contracts
 *
 * This file defines the TypeScript interfaces for every agent in the writing
 * pipeline. Each agent is a pure function or async service with explicit
 * inputs and outputs. No agent framework (LangChain/CrewAI) is used;
 * orchestration is handled by `buildChapterContext()` and route handlers.
 *
 * ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
 * │  Outline Agent  │────→│ Retrieval Agent │────→│  Writer Agent   │
 * └─────────────────┘     └─────────────────┘     └─────────────────┘
 *                                                        │
 *                                                        ▼
 *                                                 ┌─────────────────┐
 *                                                 │  Critic Agent   │
 *                                                 └─────────────────┘
 *                                                        │
 *                                                        ▼
 *                                                 ┌─────────────────┐
 *                                                 │ State Updater   │
 *                                                 └─────────────────┘
 */

import type { BibleDraft, StoryStateV1, StateDiff } from "@/lib/validation/schemas";
import type { ChapterContext } from "./chapterContext";

// ───────────────────────────────────────────────
// Outline Agent
// ───────────────────────────────────────────────

export interface OutlineAgentInput {
  bible: BibleDraft;
  storyState?: StoryStateV1;
  chapterIndex: number;
  chapterGoal?: string;
}

export interface BeatSheet {
  beats: Array<{
    index: number;
    description: string;
  }>;
}

/** Not yet implemented as a standalone agent; beats are generated during onboarding. */
export type OutlineAgentOutput = BeatSheet;

// ───────────────────────────────────────────────
// Retrieval Agent
// ───────────────────────────────────────────────

export interface RetrievalAgentInput {
  novelId: string;
  chapterIndex: number;
  bible: BibleDraft;
  topK?: number;
}

export interface RetrievedMemory {
  source: string;
  text: string;
  reason: string;
  score: number;
}

export type RetrievalAgentOutput = RetrievedMemory[];

// ───────────────────────────────────────────────
// Writer Agent
// ───────────────────────────────────────────────

export interface WriterAgentInput {
  context: ChapterContext;
  profile: {
    genre_main?: string;
    genre_sub?: string;
    tone?: string;
    chapter_word_count?: number;
    ai_freedom?: string;
  };
  existingContent?: string;
}

/** Writer output is a text stream; the route handler emits SSE deltas. */
export type WriterAgentOutput = string;

// ───────────────────────────────────────────────
// Critic Agent
// ───────────────────────────────────────────────

export interface CriticAgentInput {
  context: ChapterContext;
  chapterContent: string;
  chapterIndex: number;
}

export interface CriticIssue {
  dimension: "character" | "world_rule" | "plot_thread" | "timeline" | "tone";
  severity: "critical" | "major" | "minor";
  description: string;
}

export interface CriticAgentOutput {
  consistent: boolean;
  issues: CriticIssue[];
}

// ───────────────────────────────────────────────
// State Updater
// ───────────────────────────────────────────────

export interface StateUpdaterInput {
  bible: BibleDraft;
  storyState?: StoryStateV1;
  chapterIndex: number;
  chapterTitle: string;
  chapterContent: string;
}

export type StateUpdaterOutput = StateDiff;

// ───────────────────────────────────────────────
// Summarizer Agent
// ───────────────────────────────────────────────

export interface SummarizerAgentInput {
  chapterIndex: number;
  title: string;
  content: string;
}

export type SummarizerAgentOutput = string;

// ───────────────────────────────────────────────
// Tiered Summarizer
// ───────────────────────────────────────────────

export interface TieredSummarizerInput {
  novelId: string;
}

export interface TieredSummarizerOutput {
  refreshedVolumes: number[];
  novelSummaryUpdated: boolean;
}
