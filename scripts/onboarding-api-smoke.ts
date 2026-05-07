/**
 * End-to-end smoke test for the Onboarding API against a running app server.
 *
 * Prerequisites:
 *   1. npm run db:up && npm run db:migrate
 *   2. DEEPSEEK_API_KEY is configured in .env.local
 *   3. npm run dev (or npm run build && npm run start)
 *
 * Run:
 *   npm run smoke:onboarding
 */

import { config as loadEnv } from "dotenv";

import type { BibleDraft } from "../lib/validation/schemas";

loadEnv({ path: ".env.local" });
loadEnv();

const BASE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; retryable: boolean };
}

interface StreamEvent {
  event: string;
  data: unknown;
}

async function main() {
  console.log(`[smoke] base=${BASE_URL}`);

  const session = await postJson<{ session_id: string; default_profile: unknown }>(
    "/api/onboarding/sessions",
    { title: "", genre_main: "web", genre_sub: "玄幻" },
  );
  console.log(`[smoke] session=${session.session_id}`);

  const loglines = await postJson<{ loglines: string[] }>(
    `/api/onboarding/sessions/${session.session_id}/loglines`,
    {},
  );
  assert(loglines.loglines.length === 5, "loglines length should be 5");
  const logline = loglines.loglines[0]!;
  console.log(`[smoke] logline=${logline}`);

  const questions = await postJson<{
    questions: Array<{ key: string; options: string[]; recommended_index: number }>;
  }>(`/api/onboarding/sessions/${session.session_id}/questions`, { logline });
  assert(questions.questions.length >= 3, "questions length should be >= 3");
  const answers = Object.fromEntries(
    questions.questions.map((question) => [
      question.key,
      question.options[question.recommended_index] ?? question.options[0] ?? "默认选项",
    ]),
  );
  console.log(`[smoke] questions=${questions.questions.length}`);

  const bible = await streamBible(session.session_id, {
    logline,
    answers,
    profile: session.default_profile,
  });
  assert(Boolean(bible.meta?.suggested_title), "bible meta should be present");
  console.log(`[smoke] bible=${bible.meta?.suggested_title}`);

  const finalized = await postJson<{ novel_id: string; editor_url: string }>(
    `/api/onboarding/sessions/${session.session_id}/finalize`,
    { bible_draft: bible, profile: session.default_profile, action: "start_writing" },
  );
  assert(Boolean(finalized.novel_id), "novel_id should be returned");
  console.log(`[smoke] finalized=${finalized.editor_url}`);
  console.log("[smoke] ok");
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !json.ok || !json.data) {
    throw new Error(`${path} failed: ${response.status} ${json.error?.code ?? "UNKNOWN"} ${json.error?.message ?? ""}`);
  }
  return json.data;
}

async function streamBible(sessionId: string, body: unknown): Promise<Partial<BibleDraft>> {
  const response = await fetch(`${BASE_URL}/api/onboarding/sessions/${sessionId}/bible`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok || !response.body) {
    throw new Error(`bible stream failed: HTTP ${response.status}`);
  }

  const draft: Partial<BibleDraft> = {};
  let done = false;
  await readSse(response.body, (event) => {
    if (event.event === "error") {
      const data = event.data as { code?: string; message?: string; fallback?: boolean };
      if (!data.fallback) {
        throw new Error(`bible stream error: ${data.code ?? "UNKNOWN"} ${data.message ?? ""}`);
      }
      console.log(`[smoke] bible fallback=${data.message ?? "true"}`);
      return;
    }
    if (event.event === "done") {
      done = true;
      return;
    }
    mergeBibleEvent(draft, event);
  });

  assert(done, "bible stream should emit done");
  return draft;
}

async function readSse(body: ReadableStream<Uint8Array>, onEvent: (event: StreamEvent) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const event = parseSseBlock(block);
      if (event) onEvent(event);
    }
  }
}

function parseSseBlock(block: string): StreamEvent | null {
  if (block.startsWith(":")) return null;
  const event = block.match(/^event: (.+)$/m)?.[1];
  const data = block.match(/^data: (.+)$/m)?.[1];
  if (!event || !data) return null;
  return { event, data: JSON.parse(data) };
}

function mergeBibleEvent(draft: Partial<BibleDraft>, item: StreamEvent) {
  if (item.event === "meta") draft.meta = item.data as BibleDraft["meta"];
  if (item.event === "world") draft.world = item.data as BibleDraft["world"];
  if (item.event === "character") draft.characters = upsertIndexed(draft.characters, item.data);
  if (item.event === "outline_chapter") {
    draft.outline = {
      volume_1: {
        ...(draft.outline?.volume_1 ?? { name: "开篇卷", theme: "待定", chapter_count_estimate: 8 }),
        chapters: upsertIndexed(draft.outline?.volume_1?.chapters, item.data),
      },
    };
  }
  if (item.event === "first_chapter_beat") {
    draft.first_chapter_beats = upsertIndexed(draft.first_chapter_beats, item.data);
  }
}

function upsertIndexed<T>(current: T[] | undefined, raw: unknown): T[] {
  const { index, ...value } = raw as T & { index: number };
  const next = [...(current ?? [])];
  next[index] = value as T;
  return next.filter(Boolean);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

main().catch((err) => {
  console.error("[smoke] failed", err);
  process.exit(1);
});
