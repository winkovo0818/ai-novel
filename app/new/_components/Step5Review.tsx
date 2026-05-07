"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { useWizardStore } from "@/lib/store/wizardStore";
import { BibleDraftSchema, type BibleDraft } from "@/lib/validation/schemas";
import { StepShell } from "./StepShell";

export function Step5Review() {
  const router = useRouter();
  const store = useWizardStore();

  async function finalize(action: "save_only" | "start_writing") {
    if (!store.session_id || !store.default_profile) {
      store.setError({ step: 5, message: "缺少保存所需的会话或档案信息", retryable: false });
      return;
    }

    const validation = BibleDraftSchema.safeParse(store.bible_draft);
    if (!validation.success) {
      const first = validation.error.errors[0];
      store.setError({
        step: 5,
        message: `Bible 草稿还不满足保存要求：${first?.path.join(".") || "root"} ${first?.message ?? "invalid"}`,
        retryable: false,
      });
      return;
    }

    store.setStatus("loading");
    const response = await fetch(`/api/onboarding/sessions/${store.session_id}/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bible_draft: validation.data,
        profile: store.default_profile,
        action,
      }),
    });
    const json = await response.json();
    if (!json.ok) {
      store.setError({ step: 5, message: json.error.message, retryable: json.error.retryable });
      return;
    }

    store.setStatus("done");
    if (action === "start_writing") router.push(json.data.editor_url);
  }

  function regenerate() {
    if (store.regeneration_count >= 3) {
      store.setError({ step: 5, message: "重摆次数已达 3 次。请先保存当前草稿，或返回修改 logline 后再继续。", retryable: false });
      return;
    }

    store.setBibleDraft(undefined);
    store.setStep(4);
  }

  return (
    <StepShell eyebrow="Step 5" title="审阅并保存 Bible" description="快速检查标题、人物、世界观、大纲和第一章节拍；不满意可以重摆。">
      <div className="grid gap-5">
        {store.bible_draft ? (
          <BibleReviewCards draft={store.bible_draft} onChange={store.setBibleDraft} />
        ) : (
          <FallbackNotice />
        )}
        <div className="flex flex-wrap gap-3">
          <button className="rounded-2xl border border-neutral-300 px-5 py-3 font-medium" onClick={regenerate}>
            重摆一版（{store.regeneration_count}/3）
          </button>
          <button className="rounded-2xl border border-neutral-300 px-5 py-3 font-medium disabled:opacity-50" disabled={store.status === "loading"} onClick={() => finalize("save_only")}>
            保存草稿
          </button>
          <button className="rounded-2xl bg-neutral-950 px-5 py-3 font-medium text-white disabled:opacity-50" disabled={store.status === "loading"} onClick={() => finalize("start_writing")}>
            开始写作
          </button>
        </div>
      </div>
    </StepShell>
  );
}

function BibleReviewCards({
  draft,
  onChange,
}: {
  draft: Partial<BibleDraft>;
  onChange: (draft: Partial<BibleDraft>) => void;
}) {
  function updateMeta(next: Partial<BibleDraft>["meta"]) {
    onChange({ ...draft, meta: next });
  }

  function updateCharacter(index: number, patch: Partial<BibleDraft["characters"][number]>) {
    const characters = [...(draft.characters ?? [])];
    const current = characters[index];
    if (!current) return;
    characters[index] = { ...current, ...patch };
    onChange({ ...draft, characters });
  }

  function addCharacter() {
    const characters = draft.characters ?? [];
    if (characters.length >= 5) return;
    onChange({
      ...draft,
      characters: [
        ...characters,
        {
          role: "hidden",
          name: "新角色",
          age: "待定",
          appearance: "外貌待补",
          personality: "性格待补",
          catchphrase: "我会记住这件事。",
          abilities: ["待补能力"],
          goals: "短期目标待补，长期目标待补。",
          motivation: "动机待补，需要与主线冲突有关。",
          secrets: ["待揭示秘密"],
          relations: [],
        },
      ],
    });
  }

  function removeCharacter(index: number) {
    const characters = draft.characters ?? [];
    if (characters.length <= 3) return;
    onChange({ ...draft, characters: characters.filter((_, i) => i !== index) });
  }

  function updateWorld(patch: Partial<BibleDraft["world"]>) {
    if (!draft.world) return;
    onChange({ ...draft, world: { ...draft.world, ...patch } });
  }

  function updateChapter(index: number, patch: Partial<BibleDraft["outline"]["volume_1"]["chapters"][number]>) {
    const volume = draft.outline?.volume_1;
    if (!volume) return;
    const chapters = [...volume.chapters];
    const current = chapters[index];
    if (!current) return;
    chapters[index] = { ...current, ...patch };
    onChange({ ...draft, outline: { volume_1: { ...volume, chapters } } });
  }

  function addChapter() {
    const volume = draft.outline?.volume_1;
    if (!volume || volume.chapters.length >= 12) return;
    const nextIndex = volume.chapters.length + 1;
    onChange({
      ...draft,
      outline: {
        volume_1: {
          ...volume,
          chapters: [
            ...volume.chapters,
            {
              index: nextIndex,
              title: `第${nextIndex}章`,
              summary: "新增章节梗概，补充冲突推进、人物选择和后续伏笔，保存前可继续细化。",
            },
          ],
        },
      },
    });
  }

  function removeChapter(index: number) {
    const volume = draft.outline?.volume_1;
    if (!volume || volume.chapters.length <= 8) return;
    const chapters = volume.chapters
      .filter((_, i) => i !== index)
      .map((chapter, i) => ({ ...chapter, index: i + 1 }));
    onChange({ ...draft, outline: { volume_1: { ...volume, chapters } } });
  }

  function updateBeat(index: number, patch: Partial<BibleDraft["first_chapter_beats"][number]>) {
    const beats = [...(draft.first_chapter_beats ?? [])];
    const current = beats[index];
    if (!current) return;
    beats[index] = { ...current, ...patch };
    onChange({ ...draft, first_chapter_beats: beats });
  }

  function addBeat() {
    const beats = draft.first_chapter_beats ?? [];
    if (beats.length >= 8) return;
    const nextBeat = beats.length + 1;
    onChange({
      ...draft,
      first_chapter_beats: [
        ...beats,
        {
          beat: nextBeat,
          scene: "新增场景",
          purpose: "新增节拍目的，补充本章情绪、信息或冲突推进。",
        },
      ],
    });
  }

  function removeBeat(index: number) {
    const beats = draft.first_chapter_beats ?? [];
    if (beats.length <= 5) return;
    onChange({
      ...draft,
      first_chapter_beats: beats
        .filter((_, i) => i !== index)
        .map((beat, i) => ({ ...beat, beat: i + 1 })),
    });
  }

  return (
    <div className="grid gap-4">
      <section className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
        <p className="text-sm font-medium text-neutral-500">推荐书名</p>
        <TextField
          className="mt-2 text-2xl font-semibold"
          value={draft.meta?.suggested_title ?? ""}
          placeholder="推荐书名"
          onChange={(value) => updateMeta({
            suggested_title: value,
            alternative_titles: draft.meta?.alternative_titles ?? ["备选一", "备选二", "备选三"],
          })}
        />
        <TextField
          className="mt-3 text-sm"
          value={(draft.meta?.alternative_titles ?? []).join(" / ")}
          placeholder="备选标题，用 / 分隔"
          onChange={(value) => updateMeta({
            suggested_title: draft.meta?.suggested_title ?? "新书稿",
            alternative_titles: normalizeList(value, "/", 3),
          })}
        />
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {(draft.characters ?? []).map((character, index) => (
          <article key={`${character.name}-${index}`} className="rounded-2xl border border-neutral-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{character.role}</p>
              <SmallButton disabled={(draft.characters ?? []).length <= 3} onClick={() => removeCharacter(index)}>删除</SmallButton>
            </div>
            <TextField className="mt-2 text-lg font-semibold" value={character.name} onChange={(value) => updateCharacter(index, { name: value })} />
            <TextArea className="mt-3" value={character.personality} onChange={(value) => updateCharacter(index, { personality: value })} />
            <TextField className="mt-3" value={character.catchphrase} onChange={(value) => updateCharacter(index, { catchphrase: value })} />
            <TextArea className="mt-3" value={character.motivation} onChange={(value) => updateCharacter(index, { motivation: value })} />
          </article>
        ))}
        <button className="rounded-2xl border border-dashed border-neutral-300 p-5 text-sm font-medium text-neutral-500 hover:border-neutral-950 hover:text-neutral-950 disabled:opacity-40" disabled={(draft.characters ?? []).length >= 5} onClick={addCharacter}>
          + 新增角色（{draft.characters?.length ?? 0}/5）
        </button>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5">
        <p className="text-sm font-medium text-neutral-500">世界观</p>
        <TextArea className="mt-3" value={draft.world?.setting_summary ?? ""} onChange={(value) => updateWorld({ setting_summary: value })} />
        <TextArea className="mt-3" value={(draft.world?.rules ?? []).join("\n")} onChange={(value) => updateWorld({ rules: normalizeList(value, "\n", 2) })} />
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-neutral-500">首卷大纲</p>
            <h4 className="mt-2 text-lg font-semibold">{draft.outline?.volume_1?.name ?? "未命名卷"}</h4>
          </div>
          <SmallButton disabled={(draft.outline?.volume_1?.chapters.length ?? 0) >= 12} onClick={addChapter}>新增章节</SmallButton>
        </div>
        <div className="mt-4 grid gap-3">
          {(draft.outline?.volume_1?.chapters ?? []).map((chapter, index) => (
            <div key={chapter.index} className="rounded-xl bg-neutral-50 p-4">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-neutral-500">{chapter.index}</span>
                <TextField value={chapter.title} onChange={(value) => updateChapter(index, { title: value })} />
                <SmallButton disabled={(draft.outline?.volume_1?.chapters.length ?? 0) <= 8} onClick={() => removeChapter(index)}>删除</SmallButton>
              </div>
              <TextArea className="mt-2" value={chapter.summary} onChange={(value) => updateChapter(index, { summary: value })} />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-neutral-500">第一章节拍</p>
          <SmallButton disabled={(draft.first_chapter_beats?.length ?? 0) >= 8} onClick={addBeat}>新增节拍</SmallButton>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(draft.first_chapter_beats ?? []).map((beat, index) => (
            <div key={beat.beat} className="rounded-xl bg-neutral-50 p-4">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-neutral-500">{beat.beat}</span>
                <TextField value={beat.scene} onChange={(value) => updateBeat(index, { scene: value })} />
                <SmallButton disabled={(draft.first_chapter_beats?.length ?? 0) <= 5} onClick={() => removeBeat(index)}>删除</SmallButton>
              </div>
              <TextArea className="mt-2" value={beat.purpose} onChange={(value) => updateBeat(index, { purpose: value })} />
            </div>
          ))}
        </div>
      </section>

      <details className="rounded-2xl border border-neutral-200 bg-neutral-950 p-4 text-white">
        <summary className="cursor-pointer text-sm font-medium">查看原始 JSON</summary>
        <pre className="mt-4 max-h-96 overflow-auto text-xs">{JSON.stringify(draft, null, 2)}</pre>
      </details>
    </div>
  );
}

function SmallButton({
  disabled,
  onClick,
  children,
}: {
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className="shrink-0 rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-600 hover:border-neutral-950 hover:text-neutral-950 disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function TextField({
  value,
  placeholder,
  className = "",
  onChange,
}: {
  value: string;
  placeholder?: string;
  className?: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      className={`w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-neutral-900 outline-none focus:border-neutral-950 ${className}`}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function TextArea({
  value,
  className = "",
  onChange,
}: {
  value: string;
  className?: string;
  onChange: (value: string) => void;
}) {
  return (
    <textarea
      className={`min-h-20 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none focus:border-neutral-950 ${className}`}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function normalizeList(value: string, delimiter: string, minLength: number): string[] {
  const items = value
    .split(delimiter)
    .map((item) => item.trim())
    .filter(Boolean);

  while (items.length < minLength) {
    items.push(`待补 ${items.length + 1}`);
  }

  return items;
}

function FallbackNotice() {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-300 p-6 text-neutral-600">
      前端暂无完整草稿。保存时会使用服务端已落库的 Bible 草稿；如果没有落库，接口会返回可重试错误。
    </div>
  );
}
