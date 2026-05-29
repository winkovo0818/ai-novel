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

import type { BibleDraft, StoryStateV1, StateDiff, NovelProfile } from "@/lib/validation/schemas";
import type { ChapterContext } from "./chapterContext";

// ───────────────────────────────────────────────
// Agent route identifiers (used in LLM logging)
// ───────────────────────────────────────────────

export type AgentRoute =
  | "outline"
  | "retrieval"
  | "writer"
  | "critic"
  | "state_updater"
  | "summarizer"
  | "tiered_summarizer";

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

export type OutlineAgentOutput = BeatSheet;

// ───────────────────────────────────────────────
// Retrieval Agent
// ───────────────────────────────────────────────

export type RetrievalStatus = "success" | "empty" | "error";

export interface RetrievalExplanation {
  queryTexts: string[];
  keywordFilters: string[];
}

export interface RetrievedMemoryExplanation {
  chunkType?: string;
  similarity?: number;
  chapterDistance?: number;
  timeDecay?: number;
  importance?: number;
  matchedKeywords?: string[];
}

export interface RetrievedMemory {
  id?: string;
  source: string;
  text: string;
  reason: string;
  score: number;
  explanation?: RetrievedMemoryExplanation;
}

export interface RetrievalResult {
  status: RetrievalStatus;
  memories: RetrievedMemory[];
  errorMessage?: string;
  explanation?: RetrievalExplanation;
}

export interface RetrievalAgentInput {
  novelId: string;
  chapterIndex: number;
  bible: BibleDraft;
  topK?: number;
}

export type RetrievalAgentOutput = RetrievalResult;

// ───────────────────────────────────────────────
// Memory Library Preview
// ───────────────────────────────────────────────

export type MemoryLibraryChunkType =
  | "scene"
  | "dialogue"
  | "character_fact"
  | "world_rule"
  | "plot_thread"
  | "summary";

export type MemoryLibraryFilterType =
  | "all"
  | "chapter_summary"
  | "volume_summary"
  | "novel_summary"
  | "memory_chunk"
  | MemoryLibraryChunkType;

export type MemoryFreshness = "fresh" | "stale" | "missing";

export interface MemoryLibraryPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface MemoryLibraryChapterFreshness {
  chapterId: string;
  chapterIndex: number;
  title: string;
  status: string;
  updatedAt: string;
  summaryFreshness: MemoryFreshness;
  indexFreshness: MemoryFreshness;
  memoryChunkCount: number;
  summaryUpdatedAt?: string;
}

export interface MemoryLibraryChapterSummary {
  id: string;
  chapterId: string;
  chapterIndex: number;
  title: string;
  summary: string;
  updatedAt: string;
  freshness: MemoryFreshness;
}

export interface MemoryLibraryVolumeSummary {
  id: string;
  volumeIndex: number;
  summary: string;
  coveredChapters: string[];
  updatedAt: string;
}

export interface MemoryLibraryNovelSummary {
  id: string;
  summary: string;
  updatedAt: string;
}

export interface MemoryLibraryChunk {
  id: string;
  chapterId?: string;
  chapterIndex?: number;
  chapterTitle?: string;
  type: MemoryLibraryChunkType | string;
  sourceKind: string;
  importance: number;
  lastUsedAt?: string;
  text: string;
  metadata?: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryLibraryPreview {
  novelId: string;
  filters: {
    chapterIndex?: number;
    type: MemoryLibraryFilterType;
  };
  freshness: {
    chapters: MemoryLibraryChapterFreshness[];
    staleSummaryCount: number;
    staleIndexCount: number;
    missingSummaryCount: number;
    missingIndexCount: number;
  };
  chapterSummaries: MemoryLibraryChapterSummary[];
  volumeSummaries: MemoryLibraryVolumeSummary[];
  novelSummary: MemoryLibraryNovelSummary | null;
  memoryChunks: {
    items: MemoryLibraryChunk[];
    pagination: MemoryLibraryPagination;
  };
}

// ───────────────────────────────────────────────
// Writer Agent
// ───────────────────────────────────────────────

export interface WriterAgentInput {
  context: ChapterContext;
  profile: NovelProfile;
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
  type: "character" | "world_rule" | "plot_thread" | "timeline" | "tone" | "logic_chain" | "prose_quality";
  severity: "critical" | "major" | "minor";
  description: string;
  suggestion?: string;
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
