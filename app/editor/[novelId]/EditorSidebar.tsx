import type { BibleDraft } from "@/lib/validation/schemas";
import type { ChapterDraftView } from "./EditorClient";

interface EditorSidebarProps {
  title: string;
  bible: BibleDraft;
  chapters: ChapterDraftView[];
  selectedIndex: number;
  isBusy: boolean;
  onSelectChapter(index: number): void;
}

export function EditorSidebar({
  title,
  bible,
  chapters,
  selectedIndex,
  isBusy,
  onSelectChapter,
}: EditorSidebarProps) {
  const totalChapters = bible.outline.volume_1.chapters.length;
  const savedCount = chapters.length;
  const doneCount = chapters.filter((chapter) => chapter.status === "done").length;
  const protagonist = bible.characters.find((character) => character.role === "protagonist");

  return (
    <aside className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <p className="text-sm text-neutral-400">Novel Bible</p>
      <h1 className="mt-2 text-2xl font-semibold">{title}</h1>
      <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs">
        <ProgressStat label="章节" value={`${totalChapters}`} />
        <ProgressStat label="已存" value={`${savedCount}`} />
        <ProgressStat label="完成" value={`${doneCount}`} />
      </div>
      <section className="mt-6 grid gap-4 text-sm text-neutral-300">
        <BibleSection title="主角">
          <p className="font-medium text-white">{protagonist?.name ?? "未命名"}</p>
          <p className="mt-1">{protagonist?.motivation}</p>
        </BibleSection>
        <BibleSection title="世界规则">
          <ul className="list-inside list-disc space-y-1">
            {bible.world.rules.map((rule) => <li key={rule}>{rule}</li>)}
          </ul>
        </BibleSection>
        <BibleSection title="第一章节拍">
          <ol className="list-inside list-decimal space-y-2">
            {bible.first_chapter_beats.map((beat) => (
              <li key={beat.beat}>
                <span className="text-white">{beat.scene}</span>
                <p className="ml-5 text-neutral-400">{beat.purpose}</p>
              </li>
            ))}
          </ol>
        </BibleSection>
        <BibleSection title="首卷章节">
          <div className="grid gap-2">
            {bible.outline.volume_1.chapters.map((chapter) => (
              <button
                key={chapter.index}
                className={chapter.index === selectedIndex
                  ? "rounded-xl border border-white/30 bg-white/15 p-3 text-left"
                  : "rounded-xl border border-transparent bg-white/5 p-3 text-left hover:bg-white/10"}
                disabled={isBusy}
                onClick={() => onSelectChapter(chapter.index)}
              >
                <p className="text-white">
                  {chapter.index}. {chapter.title}
                  {chapters.some((draft) => draft.chapter_index === chapter.index) ? (
                    <span className="ml-2 rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs text-emerald-200">已存</span>
                  ) : null}
                  {chapters.some((draft) => draft.chapter_index === chapter.index && draft.status === "done") ? (
                    <span className="ml-2 rounded-full bg-blue-400/15 px-2 py-0.5 text-xs text-blue-200">完成</span>
                  ) : null}
                </p>
                <p className="mt-1 text-xs text-neutral-400">{chapter.summary}</p>
              </button>
            ))}
          </div>
        </BibleSection>
      </section>
    </aside>
  );
}

function ProgressStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/5 px-3 py-2">
      <div className="text-lg font-semibold text-white">{value}</div>
      <div className="mt-0.5 text-neutral-500">{label}</div>
    </div>
  );
}

function BibleSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white/5 p-4">
      <h2 className="text-sm font-semibold text-neutral-400">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
