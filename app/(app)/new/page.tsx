"use client";

import { useEffect, useState } from "react";

import { ProgressDots } from "./_components/ProgressDots";
import { Step4Generating } from "./_components/Step4Generating";
import { Step5Review } from "./_components/Step5Review";
import { StepShell } from "./_components/StepShell";
import { useWizardStore } from "@/lib/store/wizardStore";
import type { NovelProfile, Question } from "@/lib/validation/schemas";

const genres: Array<{ value: NovelProfile["genre_main"]; label: string; description: string }> = [
  { value: "web", label: "网文 / WEB NOVEL", description: "快节奏、高爽点，为千万读者呈现奇幻想象。" },
  { value: "literary", label: "严肃文学 / LITERARY", description: "深度叙事，探讨人性和社会的复杂内核。" },
  { value: "script", label: "剧本 / SCRIPT", description: "结构为王，为影视或舞台创作蓝图。" },
  { value: "fanfic", label: "同人 / FANFIC", description: "在经典时空中延续新的可能与羁绊。" },
  { value: "shortstory", label: "短篇集 / SHORT STORY", description: "精炼有力，捕捉瞬间的叙事灵光。" },
];

export default function NewPage() {
  const store = useWizardStore();

  useEffect(() => {
    if (store.status === "streaming") {
      store.setStatus("idle");
    }
  }, []);

  return (
    <div className="flex-1 overflow-y-auto bg-background custom-scrollbar">
      <div className="px-5 md:px-8 py-6 md:py-8 max-w-4xl mx-auto pb-16">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6 border-b border-border-subtle pb-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-accent" aria-hidden="true" />
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-text-muted">创意工作室 / STUDIO</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-serif font-normal text-text-primary tracking-tight leading-tight">
              创作向导<span className="text-accent">.</span>
            </h1>
            <p className="text-sm text-text-muted">
              从一粒灵感的种子，到一部宏大的叙事圣经。
            </p>
          </div>
          <button
            className="group flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-text-dim hover:text-red-500 transition-colors duration-300 self-start md:self-auto"
            onClick={store.reset}
            aria-label="重置向导协议"
          >
            <div className="h-7 w-7 rounded-full border border-border-strong flex items-center justify-center group-hover:border-red-200 group-hover:bg-red-50 transition-colors" aria-hidden="true">
              <svg aria-hidden="true" className="w-3 h-3 transition-transform duration-300 group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            重置向导
          </button>
        </header>

        <div className="mb-6">
          <ProgressDots step={store.step} />
        </div>

        {store.error ? (
          <div className="mb-5 animate-shake" aria-live="polite">
            <div className="bg-red-50/40 border border-red-100 rounded-xl flex items-start gap-3 p-4">
              <span className="font-serif text-2xl text-red-300 leading-none mt-0.5" aria-hidden="true">!</span>
              <div className="flex flex-col gap-0.5">
                <p className="text-[10px] font-bold text-red-800 uppercase tracking-[0.25em]">引擎故障 / ENGINE FAULT</p>
                <p className="text-sm text-red-900/70">{store.error.message}</p>
              </div>
            </div>
          </div>
        ) : null}

        <main>
          {store.step === 1 ? <Step1 /> : null}
          {store.step === 2 ? <Step2 /> : null}
          {store.step === 3 ? <Step3 /> : null}
          {store.step === 4 ? <Step4Generating /> : null}
          {store.step === 5 ? <Step5Review /> : null}
        </main>
      </div>
    </div>
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
    if (!genreSub.trim()) return store.setError({ step: 1, message: "请填写细分题材", retryable: false });
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
    <StepShell eyebrow="分册 01" title="锚定叙事原点" description="每一篇伟大的作品都始于一个名字和它所属的领域。">
      <div className="grid gap-5">
        <section className="grid gap-2">
          <FolioLabel index="01" label="作品暂定标题 / TITLE" htmlFor="wizard-title" />
          <input
            id="wizard-title"
            name="title"
            autoComplete="off"
            spellCheck={false}
            className="w-full text-lg md:text-xl font-serif font-normal py-2 px-0 bg-transparent border-b border-border-strong rounded-none focus:border-accent transition-colors placeholder:text-text-dim/30 focus:outline-none"
            placeholder="云端的最后一名诗人…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </section>

        <section className="grid gap-3">
          <FolioLabel index="02" label="文学领域 / GENRE" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {genres.map((genre) => {
              const isSelected = genreMain === genre.value;
              return (
                <button
                  key={genre.value}
                  type="button"
                  className={`group relative px-4 py-3 rounded-xl transition-[background-color,border-color,transform] duration-200 text-left flex flex-col gap-1 border ${
                    isSelected
                      ? "border-text-primary bg-text-primary text-white shadow-md"
                      : "border-border-subtle bg-white text-text-secondary hover:border-accent/40 hover:-translate-y-0.5"
                  }`}
                  onClick={() => setGenreMain(genre.value)}
                  aria-pressed={isSelected}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[9px] font-bold uppercase tracking-[0.2em] ${isSelected ? "text-accent" : "text-text-muted group-hover:text-accent"}`}>
                      选项 {genre.value}
                    </span>
                    {isSelected && <div className="h-1 w-1 rounded-full bg-accent animate-pulse" aria-hidden="true" />}
                  </div>
                  <h3 className={`text-base font-serif leading-tight ${isSelected ? "text-white" : "text-text-primary"}`}>
                    {genre.label.split(" / ")[0]}
                    <span className="block text-[9px] font-sans font-bold uppercase tracking-widest mt-0.5 opacity-50">
                      {genre.label.split(" / ")[1]}
                    </span>
                  </h3>
                  <p className={`text-[12px] leading-snug ${isSelected ? "text-white/60" : "text-text-muted"}`}>
                    {genre.description}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="grid gap-2">
          <FolioLabel index="03" label="细分题材 / VIBE" htmlFor="wizard-genre-sub" />
          <input
            id="wizard-genre-sub"
            name="genre_sub"
            autoComplete="off"
            className="w-full text-sm font-serif font-normal py-2.5 px-3.5 bg-secondary/60 border border-transparent rounded-lg focus:bg-white focus:border-accent/30 transition-[background-color,border-color] outline-none"
            placeholder="例如：东方玄幻、硬核科幻、赛博朋克…"
            value={genreSub}
            onChange={(e) => setGenreSub(e.target.value)}
          />
        </section>

        <footer className="pt-2 flex justify-end">
          <PrimaryButton busy={store.status === "loading"} onClick={submit}>
            继续：捕捉灵感
            <ArrowRight />
          </PrimaryButton>
        </footer>
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
    <StepShell eyebrow="分册 02" title="灵感火花捕捉" description="请描述您故事的核心冲突。AI 可以提供叙事向量建议。">
      <div className="grid gap-5">
        <section className="grid gap-2">
          <FolioLabel index="01" label="核心创意 / LOGLINE" htmlFor="wizard-logline" />
          <textarea
            id="wizard-logline"
            name="logline"
            autoComplete="off"
            className="w-full min-h-[110px] p-4 text-base font-serif font-normal leading-relaxed bg-white border border-border-subtle rounded-xl shadow-sm focus:border-accent/40 focus:outline-none transition-colors placeholder:text-text-dim/30 selection:bg-accent/10"
            value={logline}
            onChange={(e) => setLogline(e.target.value)}
            placeholder="描述一个令你激动的场景、矛盾，或者核心人物的命运转折…"
          />
        </section>

        <div className="flex flex-col md:flex-row items-center justify-between gap-3 border-t border-border-subtle pt-4">
          <button
            disabled={store.status === "loading"}
            type="button"
            className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-accent hover:text-text-primary transition-colors duration-300 group disabled:opacity-40"
            onClick={recommend}
          >
            <div className="h-7 w-7 rounded-full border border-accent/20 flex items-center justify-center group-hover:bg-accent group-hover:text-white group-hover:border-accent transition-colors duration-200" aria-hidden="true">
              <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.628.283a2 2 0 01-1.186.128l-2.094-.31a2 2 0 00-1.226.226l-1.314.876a2 2 0 01-.813.294l-1.606.16a2 2 0 00-1.225.565l-1.141.913a2 2 0 01-1.127.38H2" />
              </svg>
            </div>
            {store.status === "loading" ? "正在调取建议…" : "AI 推荐灵感"}
          </button>

          <PrimaryButton onClick={next}>
            下一步：定义细节
            <ArrowRight />
          </PrimaryButton>
        </div>

        {store.inputs.logline_suggestions && (
          <section className="grid gap-3 pt-4 border-t border-border-subtle animate-fade-in">
            <FolioLabel index="02" label="叙事灵感 / AI FRAGMENTS" />
            <div className="grid gap-2">
              {store.inputs.logline_suggestions.map((item, i) => (
                <button
                  key={item}
                  type="button"
                  className="group p-3.5 text-left rounded-xl bg-white border border-border-subtle hover:border-accent/30 hover:shadow-sm transition-[border-color,box-shadow] flex gap-3 items-start"
                  onClick={() => setLogline(item)}
                >
                  <span className="font-serif text-lg text-accent/30 group-hover:text-accent transition-colors duration-200 shrink-0 leading-none mt-0.5">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="text-sm font-serif font-normal leading-relaxed text-text-secondary group-hover:text-text-primary transition-colors">
                    {item}
                  </p>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </StepShell>
  );
}

function Step3() {
  const store = useWizardStore();
  const isThinking = store.status === "loading";

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
    <StepShell eyebrow="分册 03" title="叙事逻辑推演" description="为了让 AI 深度理解您的创作意图，我们需要解决几个关键的分支。">
      <div className="grid gap-5">
        {!store.inputs.questions ? (
          isThinking ? <ThinkingPanel /> : <IdlePanel onStart={loadQuestions} />
        ) : (
          <div className="flex flex-col gap-5">
            <div className="grid gap-5">
              {store.inputs.questions.map((question, i) => (
                <div key={question.key} className="animate-fade-in-up">
                  <QuestionBlock question={question} index={i + 1} />
                </div>
              ))}
            </div>
            <footer className="pt-3 border-t border-border-subtle flex justify-end">
              <PrimaryButton onClick={() => store.setStep(4)}>
                开启叙事圣经合成
                <svg aria-hidden="true" className="w-3.5 h-3.5 ml-1.5 group-hover:translate-x-1 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </PrimaryButton>
            </footer>
          </div>
        )}
      </div>
    </StepShell>
  );
}

function IdlePanel({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-4 border border-dashed border-border-strong rounded-xl bg-secondary/20">
      <div className="h-12 w-12 rounded-full bg-white flex items-center justify-center shadow-sm relative">
        <div className="absolute inset-0 bg-accent/10 animate-ping rounded-full" aria-hidden="true" />
        <svg aria-hidden="true" className="w-5 h-5 text-accent relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div className="flex flex-col items-center gap-1 text-center px-4">
        <p className="text-[10px] font-bold text-text-primary uppercase tracking-[0.25em]">待命：叙事逻辑审计</p>
        <p className="text-[13px] text-text-muted max-w-sm">AI 将基于您的灵感，生成一组深度叙事追问。</p>
      </div>
      <PrimaryButton onClick={onStart}>启动逻辑扫描</PrimaryButton>
    </div>
  );
}

const THINKING_PHASES = [
  "解构灵感的核心张力…",
  "扫描叙事可能性分支…",
  "锚定关键决策节点…",
  "校准追问的深度与节奏…",
  "编织选项之间的反差…",
];

function ThinkingPanel() {
  const [phaseIndex, setPhaseIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setPhaseIndex((i) => (i + 1) % THINKING_PHASES.length);
    }, 1800);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="flex flex-col items-center justify-center py-10 gap-5 border border-accent/20 rounded-xl bg-accent/[0.03] relative overflow-hidden"
      role="status"
      aria-live="polite"
      aria-label="AI 正在生成追问"
    >
      <div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-accent/[0.05] to-transparent pointer-events-none animate-shimmer-fast"
        aria-hidden="true"
      />

      <div className="relative h-14 w-14 z-10" aria-hidden="true">
        <div className="absolute inset-0 rounded-full border-2 border-accent/10" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent border-r-accent/40 animate-spin-slow" />
        <div className="absolute inset-2.5 rounded-full border border-accent/15" />
        <div className="absolute inset-[18px] rounded-full bg-accent/15 animate-pulse" />
        <div className="absolute inset-[22px] rounded-full bg-accent" />
      </div>

      <div className="flex flex-col items-center gap-2 text-center px-6 z-10 min-h-[3.5rem]">
        <p className="text-[10px] font-bold text-accent uppercase tracking-[0.3em] flex items-center gap-2">
          <span className="h-1 w-1 rounded-full bg-accent animate-pulse" aria-hidden="true" />
          AI 正在思考
          <span className="h-1 w-1 rounded-full bg-accent animate-pulse delay-300" aria-hidden="true" />
        </p>
        <p
          key={phaseIndex}
          className="text-[14px] text-text-primary max-w-sm animate-fade-in"
        >
          {THINKING_PHASES[phaseIndex]}
        </p>
      </div>

      <div className="flex gap-1.5 z-10" aria-hidden="true">
        <span className="h-1.5 w-1.5 rounded-full bg-accent/40 animate-pulse" />
        <span className="h-1.5 w-1.5 rounded-full bg-accent/60 animate-pulse delay-200" />
        <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse delay-400" />
      </div>

      <p className="text-[11px] text-text-dim font-sans tracking-wide z-10">通常 5-15 秒</p>
    </div>
  );
}

function QuestionBlock({ question, index }: { question: Question; index: number }) {
  const store = useWizardStore();
  const answer = store.inputs.answers?.[question.key];
  return (
    <div className="group">
      <div className="flex items-start gap-2.5 mb-3">
        <span className="font-serif text-lg text-accent/30 group-hover:text-accent transition-colors duration-300 leading-none mt-1 shrink-0">
          {String(index).padStart(2, "0")}
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] font-bold text-accent uppercase tracking-[0.25em]">
            {question.type === "single" ? "单选 / DISCRETE" : "多选 / MULTI-VECTOR"}
          </span>
          <h3 className="text-base font-serif font-normal text-text-primary leading-snug">{question.question}</h3>
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-2 ml-7">
        {question.options.map((option) => {
          const selected = Array.isArray(answer) ? answer.includes(option) : answer === option;
          return (
            <button
              key={option}
              type="button"
              className={`p-3 text-left rounded-lg transition-[background-color,border-color] duration-200 border flex items-center justify-between ${
                selected
                  ? "border-text-primary bg-text-primary text-white"
                  : "border-border-subtle bg-white text-text-secondary hover:border-accent/30 hover:bg-secondary/40"
              }`}
              onClick={() => store.setAnswer(question.key, toggleAnswer(question, answer, option))}
              aria-pressed={selected}
            >
              <span className={`text-[12px] font-medium leading-snug ${selected ? "text-white" : ""}`}>{option}</span>
              {selected ? (
                <div className="h-4 w-4 bg-white/20 rounded-full flex items-center justify-center text-white ring-1 ring-white/30 shrink-0 ml-2" aria-hidden="true">
                  <svg aria-hidden="true" className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              ) : (
                <div className="h-1 w-1 rounded-full bg-accent/30 shrink-0 ml-2" aria-hidden="true" />
              )}
            </button>
          );
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

function FolioLabel({ index, label, htmlFor }: { index: string; label: string; htmlFor?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-serif text-sm text-accent/50" aria-hidden="true">{index}</span>
      <label htmlFor={htmlFor} className="text-[10px] font-bold uppercase tracking-[0.25em] text-text-muted">
        {label}
      </label>
    </div>
  );
}

function ArrowRight() {
  return (
    <svg aria-hidden="true" className="w-3.5 h-3.5 ml-1.5 group-hover:translate-x-1 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
    </svg>
  );
}

function PrimaryButton({ busy, onClick, children }: { busy?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={busy}
      className="group inline-flex items-center justify-center font-bold rounded-full text-sm bg-text-primary text-white px-6 h-10 hover:bg-accent shadow-sm hover:shadow-md transition-[background-color,box-shadow,transform] duration-200 active:scale-95 disabled:opacity-40"
      onClick={onClick}
    >
      {busy ? (
        <span className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
          <span className="tracking-wide text-[13px]">执行中…</span>
        </span>
      ) : (
        <span className="flex items-center text-[13px]">{children}</span>
      )}
    </button>
  );
}
