import { assembleChapterContext } from "@/lib/agent/chapterContextAssembly";
import type { ChapterDraftView } from "@/lib/agent/chapterContext";
import type { CriticIssue } from "@/lib/agent/contracts";
import { chatCompletionWithRetry } from "@/lib/llm/client";
import { parseFirstJsonObject, stripCodeFence } from "@/lib/llm/extractJson";
import { getGenerationPolicy } from "@/lib/llm/generationPolicy";
import { buildChapterPrompt } from "@/lib/llm/prompts/chapter";
import { buildChapterRevisionPrompt } from "@/lib/llm/prompts/chapterRevision";
import { buildCriticPrompt, type CriticResult } from "@/lib/llm/prompts/critic";
import { cleanupWriterOutputWithReport, type CleanupHit } from "@/lib/llm/writerOutputCleanup";
import { logWarn } from "@/lib/observability/logger";
import type { BibleDraft, NovelProfile } from "@/lib/validation/schemas";

const ROUTE_BASE = "/agent/chapter-pipeline";
const DEFAULT_REVISION_ROUNDS = 2;
// Cap writer output so one chapter stays inside the generate_chapter job timeout.
const MAX_TARGET_WORDS = 3000;
// Draft and revise each generate a full chapter, so they share the same budget.
// Slow models (e.g. mimo-v2.5-pro) take ~150-180s per pass; the old 120s revise
// cap timed out on every revision which — combined with the job-level timeout —
// left zombie handlers re-persisting chapters. Keep these above observed latency.
const WRITER_TIMEOUT_MS = 240_000;
const CRITIC_TIMEOUT_MS = 120_000;
const REVISE_TIMEOUT_MS = 240_000;

export interface RunChapterPipelineInput {
  novelId: string;
  bible: BibleDraft;
  profile: NovelProfile;
  chapters: Array<ChapterDraftView & { summary?: { summary: string } | null }>;
  chapterIndex: number;
  /** Max self-revision passes when the critic flags major/critical issues. Default 2. */
  revisionRounds?: number;
  novelSummary?: string;
  volumeSummaries?: ReadonlyArray<{ volume_index: number; summary: string }>;
  /** Skip RAG retrieval (headless eval without pgvector). Default false. */
  skipRetrieval?: boolean;
}

export interface ChapterPipelineResult {
  chapterIndex: number;
  title: string;
  content: string;
  /** Issues from the final critic pass (empty if the chapter passed clean). */
  criticIssues: CriticIssue[];
  /** Revise passes actually executed (0 = draft passed the first critic). */
  revisedRounds: number;
  /** AI-signature rules that fired on the *raw* writer draft (pre-cleanup). */
  rawCleanupHits: CleanupHit[];
  cost: { cny: number; tokenIn: number; tokenOut: number };
  model: string;
}

interface CostAccumulator {
  cny: number;
  tokenIn: number;
  tokenOut: number;
  model: string;
}

/**
 * Parse the critic's JSON verdict. Returns `null` when the payload is not
 * parseable JSON — callers must treat that as "review outcome unknown"
 * (fail-closed), NOT as "no issues". The previous fail-open behavior
 * (returning empty issues) let unreviewed chapters slip past the quality
 * gate whenever the critic model drifted out of JSON mode.
 */
function parseCriticResult(raw: string): CriticResult | null {
  const parsed = parseFirstJsonObject<Partial<CriticResult>>(raw);
  if (!parsed) return null;
  return {
    consistent: Boolean(parsed.consistent),
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
  };
}

/**
 * Synthetic issue injected when the critic output is unparseable twice in a
 * row. Severity `major` so it surfaces in `criticIssues` → quality gate /
 * needs_review, without auto-failing the whole run (tunable via CriticFloor).
 */
function buildCriticUnparseableIssue(chapterIndex: number): CriticIssue {
  return {
    type: "logic_chain",
    severity: "major",
    description: `第 ${chapterIndex} 章的 Critic 审校输出连续两次无法解析，本章未经一致性审校。`,
    suggestion: "人工复核本章与前文的一致性后再定稿。",
  };
}

/** Only major/critical issues force another revise pass; minor notes don't. */
function hasBlockingIssue(issues: CriticIssue[]): boolean {
  return issues.some((issue) => issue.severity === "major" || issue.severity === "critical");
}

/**
 * Headless single-chapter pipeline: assemble context → writer draft → cleanup →
 * critic → revise (≤ revisionRounds) → cleanup. Pure of DB/SSE so the auto-pilot
 * job and the eval harness run the exact same generation path. Does NOT persist
 * or score quality — that's the job handler (落库) and quality gate (T11).
 */
export async function runChapterPipeline(input: RunChapterPipelineInput): Promise<ChapterPipelineResult> {
  const rounds = input.revisionRounds ?? DEFAULT_REVISION_ROUNDS;
  const { context } = await assembleChapterContext({
    novelId: input.novelId,
    bible: input.bible,
    chapters: input.chapters,
    chapterIndex: input.chapterIndex,
    novelSummary: input.novelSummary,
    volumeSummaries: input.volumeSummaries,
    skipRetrieval: input.skipRetrieval,
  });

  const policy = getGenerationPolicy(input.profile);
  const cost: CostAccumulator = { cny: 0, tokenIn: 0, tokenOut: 0, model: "unknown" };
  const accrue = (r: { costCny: number; tokenIn: number; tokenOut: number; model: string }) => {
    cost.cny += r.costCny;
    cost.tokenIn += r.tokenIn;
    cost.tokenOut += r.tokenOut;
    cost.model = r.model;
  };

  // 1. Writer draft (non-streaming — the auto-pilot is a background job, not SSE).
  const draft = await chatCompletionWithRetry({
    route: `${ROUTE_BASE}/draft`,
    agent: "writer",
    novelId: input.novelId,
    messages: buildChapterPrompt({
      context,
      profile: input.profile,
      generationPolicy: { ...policy, targetWordCount: Math.min(policy.targetWordCount, MAX_TARGET_WORDS) },
    }),
    temperature: policy.temperature,
    topP: policy.topP,
    frequencyPenalty: policy.frequencyPenalty,
    presencePenalty: policy.presencePenalty,
    timeoutMs: WRITER_TIMEOUT_MS,
  });
  accrue(draft);

  const draftCleanup = cleanupWriterOutputWithReport(stripCodeFence(draft.content));
  const rawCleanupHits = draftCleanup.hits;
  let text = draftCleanup.text;
  let criticIssues: CriticIssue[] = [];
  let revisedRounds = 0;

  // 2. Critic → revise loop. Stop as soon as no major/critical issues remain.
  for (let round = 0; round < rounds; round += 1) {
    const runCritic = async () => {
      const resp = await chatCompletionWithRetry({
        route: `${ROUTE_BASE}/critic`,
        agent: "critic",
        novelId: input.novelId,
        messages: buildCriticPrompt({
          context,
          chapterContent: text,
          chapterIndex: input.chapterIndex,
          isRevision: round > 0,
          isMystery: policy.isMystery,
        }),
        responseFormat: "json_object",
        temperature: 0,
        timeoutMs: CRITIC_TIMEOUT_MS,
      });
      accrue(resp);
      return parseCriticResult(resp.content);
    };

    // Fail-closed: unparseable critic output gets ONE immediate retry; if it
    // still can't be parsed we record a synthetic major issue and stop —
    // revising is pointless without a concrete issue to fix, but the chapter
    // must NOT silently pass as "reviewed clean".
    let critic = await runCritic();
    if (critic === null) {
      logWarn("chapter_pipeline.critic_unparseable_retry", {
        novel_id: input.novelId,
        chapter_index: input.chapterIndex,
        round,
      });
      critic = await runCritic();
    }
    if (critic === null) {
      logWarn("chapter_pipeline.critic_unparseable_final", {
        novel_id: input.novelId,
        chapter_index: input.chapterIndex,
        round,
      });
      criticIssues = [buildCriticUnparseableIssue(input.chapterIndex)];
      break;
    }

    criticIssues = critic.issues;
    if (critic.consistent || !hasBlockingIssue(critic.issues)) break;

    const revised = await chatCompletionWithRetry({
      route: `${ROUTE_BASE}/revise`,
      agent: "writer",
      novelId: input.novelId,
      messages: buildChapterRevisionPrompt({ context, chapterContent: text, issues: critic.issues }),
      temperature: 0.5,
      timeoutMs: REVISE_TIMEOUT_MS,
    });
    accrue(revised);
    text = cleanupWriterOutputWithReport(stripCodeFence(revised.content)).text;
    revisedRounds += 1;
  }

  return {
    chapterIndex: input.chapterIndex,
    title: context.outline.title,
    content: text,
    criticIssues,
    revisedRounds,
    rawCleanupHits,
    cost: { cny: cost.cny, tokenIn: cost.tokenIn, tokenOut: cost.tokenOut },
    model: cost.model,
  };
}
