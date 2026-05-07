"use client";

import { useState } from "react";

import { ProgressDots } from "./_components/ProgressDots";
import { Step4Generating } from "./_components/Step4Generating";
import { Step5Review } from "./_components/Step5Review";
import { StepShell } from "./_components/StepShell";
import { useWizardStore } from "@/lib/store/wizardStore";
import type { NovelProfile, Question } from "@/lib/validation/schemas";

const genres: Array<{ value: NovelProfile["genre_main"]; label: string }> = [
  { value: "web", label: "网文" },
  { value: "literary", label: "严肃文学" },
  { value: "script", label: "剧本" },
  { value: "fanfic", label: "同人" },
  { value: "shortstory", label: "短篇集" },
];

export default function NewPage() {
  const store = useWizardStore();

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-8 text-neutral-950">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <header className="flex flex-col gap-4 rounded-3xl bg-neutral-950 p-6 text-white">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-neutral-400">AI Novel Onboarding</p>
              <h2 className="mt-1 text-2xl font-semibold">3 分钟生成小说 Bible 草稿</h2>
            </div>
            <button className="rounded-full border border-white/20 px-4 py-2 text-sm" onClick={store.reset}>
              重新开始
            </button>
          </div>
          <ProgressDots step={store.step} />
        </header>

        {store.error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {store.error.message}
          </div>
        ) : null}

        {store.step === 1 ? <Step1 /> : null}
        {store.step === 2 ? <Step2 /> : null}
        {store.step === 3 ? <Step3 /> : null}
        {store.step === 4 ? <Step4Generating /> : null}
        {store.step === 5 ? <Step5Review /> : null}
      </div>
    </main>
  );
}

function Step1() {
  const store = useWizardStore();
  const [title, setTitle] = useState(store.inputs.title ?? "");
  const [genreMain, setGenreMain] = useState<NovelProfile["genre_main"]>(
    store.inputs.genre_main ?? "web",
  );
  const [genreSub, setGenreSub] = useState(store.inputs.genre_sub ?? "玄幻");

  async function submit() {
    if (!genreSub.trim()) return store.setError({ step: 1, message: "请填写子类型", retryable: false });
    store.setStatus("loading");
    store.setError(undefined);
    const res = await fetch("/api/onboarding/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, genre_main: genreMain, genre_sub: genreSub }),
    });
    const json = await res.json();
    if (!json.ok) return store.setError({ step: 1, message: json.error.message, retryable: json.error.retryable });
    store.patchInputs({ title, genre_main: genreMain, genre_sub: genreSub });
    store.setSession(json.data.session_id, json.data.default_profile);
    store.setStep(2);
  }

  return (
    <StepShell eyebrow="Step 1" title="先给故事一个方向" description="书名可以先空着，MVP 阶段只需要类型大类和子类型。">
      <div className="grid gap-5">
        <input className="rounded-2xl border border-neutral-300 px-4 py-3" placeholder="书名（可选）" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {genres.map((genre) => (
            <button key={genre.value} className={`rounded-2xl border px-4 py-3 ${genreMain === genre.value ? "border-neutral-950 bg-neutral-950 text-white" : "border-neutral-300"}`} onClick={() => setGenreMain(genre.value)}>
              {genre.label}
            </button>
          ))}
        </div>
        <input className="rounded-2xl border border-neutral-300 px-4 py-3" placeholder="子类型，例如：玄幻、都市、悬疑" value={genreSub} onChange={(e) => setGenreSub(e.target.value)} />
        <PrimaryButton busy={store.status === "loading"} onClick={submit}>下一步</PrimaryButton>
      </div>
    </StepShell>
  );
}

function Step2() {
  const store = useWizardStore();
  const [logline, setLogline] = useState(store.inputs.logline ?? "");

  async function recommend() {
    if (!store.session_id) return store.setStep(1);
    store.setStatus("loading");
    const res = await fetch(`/api/onboarding/sessions/${store.session_id}/loglines`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const json = await res.json();
    if (!json.ok) return store.setError({ step: 2, message: json.error.message, retryable: json.error.retryable });
    store.patchInputs({ logline_suggestions: json.data.loglines });
    store.setStatus("idle");
  }

  async function next() {
    const value = logline.trim() || store.inputs.logline_suggestions?.[0];
    if (!value) return store.setError({ step: 2, message: "请填写灵感，或先让 AI 推荐一条", retryable: false });
    store.patchInputs({ logline: value });
    store.setStep(3);
  }

  return (
    <StepShell eyebrow="Step 2" title="写 1-2 句话灵感" description="没想好可以让 AI 先给 5 个方向，再选一个继续。">
      <div className="grid gap-5">
        <textarea className="min-h-36 rounded-2xl border border-neutral-300 px-4 py-3" value={logline} onChange={(e) => setLogline(e.target.value)} placeholder="例如：一个被废柴宗门收留的少年，意外觉醒了上古剑魂。" />
        <div className="flex flex-wrap gap-3">
          <SecondaryButton busy={store.status === "loading"} onClick={recommend}>AI 推荐 5 条</SecondaryButton>
          <PrimaryButton onClick={next}>下一步</PrimaryButton>
        </div>
        {store.inputs.logline_suggestions?.map((item) => (
          <button key={item} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-left hover:border-neutral-950" onClick={() => setLogline(item)}>
            {item}
          </button>
        ))}
      </div>
    </StepShell>
  );
}

function Step3() {
  const store = useWizardStore();

  async function loadQuestions() {
    if (!store.session_id || !store.inputs.logline) return;
    store.setStatus("loading");
    const res = await fetch(`/api/onboarding/sessions/${store.session_id}/questions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logline: store.inputs.logline }) });
    const json = await res.json();
    if (!json.ok) return store.setError({ step: 3, message: json.error.message, retryable: json.error.retryable });
    store.patchInputs({ questions: json.data.questions });
    for (const question of json.data.questions as Question[]) {
      store.setAnswer(question.key, question.options[question.recommended_index] ?? question.options[0]);
    }
    store.setStatus("idle");
  }

  return (
    <StepShell eyebrow="Step 3" title="回答几个关键选择" description="默认会选中 AI 推荐项，你也可以改掉。">
      <div className="grid gap-5">
        {!store.inputs.questions ? <PrimaryButton busy={store.status === "loading"} onClick={loadQuestions}>生成反向追问</PrimaryButton> : null}
        {store.inputs.questions?.map((question) => <QuestionBlock key={question.key} question={question} />)}
        {store.inputs.questions ? <PrimaryButton onClick={() => store.setStep(4)}>生成 Bible</PrimaryButton> : null}
      </div>
    </StepShell>
  );
}

function QuestionBlock({ question }: { question: Question }) {
  const store = useWizardStore();
  const answer = store.inputs.answers?.[question.key];
  return (
    <div className="rounded-2xl border border-neutral-200 p-5">
      <h3 className="font-medium">{question.question}</h3>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {question.options.map((option) => {
          const selected = Array.isArray(answer) ? answer.includes(option) : answer === option;
          return <button key={option} className={`rounded-xl border px-4 py-3 text-left ${selected ? "border-neutral-950 bg-neutral-950 text-white" : "border-neutral-300"}`} onClick={() => store.setAnswer(question.key, toggleAnswer(question, answer, option))}>{option}</button>;
        })}
      </div>
    </div>
  );
}

function toggleAnswer(question: Question, answer: string | string[] | undefined, option: string) {
  if (question.type === "single") return option;
  const current = Array.isArray(answer) ? answer : [];
  return current.includes(option) ? current.filter((item) => item !== option) : [...current, option];
}

function PrimaryButton({ busy, onClick, children }: { busy?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button disabled={busy} className="rounded-2xl bg-neutral-950 px-5 py-3 font-medium text-white disabled:opacity-50" onClick={onClick}>{busy ? "处理中..." : children}</button>;
}

function SecondaryButton({ busy, onClick, children }: { busy?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button disabled={busy} className="rounded-2xl border border-neutral-300 px-5 py-3 font-medium disabled:opacity-50" onClick={onClick}>{busy ? "处理中..." : children}</button>;
}
