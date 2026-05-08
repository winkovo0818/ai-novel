"use client";

import { useState } from "react";

import { ProgressDots } from "./_components/ProgressDots";
import { Step4Generating } from "./_components/Step4Generating";
import { Step5Review } from "./_components/Step5Review";
import { StepShell } from "./_components/StepShell";
import { useWizardStore } from "@/lib/store/wizardStore";
import type { NovelProfile, Question } from "@/lib/validation/schemas";
import { PageHeader } from "@/components/ui/PageHeader";

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
    <div className="flex-1 overflow-y-auto bg-secondary/20 custom-scrollbar">
      <div className="p-6 md:p-10 lg:p-12 max-w-5xl mx-auto min-h-full">
        <PageHeader 
          title="叙事圣经生成" 
          description="将灵感合成为严谨的作品圣经（Bible）及创作基础设施。"
          actions={
            <button className="btn-secondary h-10 px-6 shadow-sm" onClick={store.reset}>
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                重置协议
              </div>
            </button>
          }
        />

        <div className="mt-4 mb-8 p-6 bg-white border border-border-strong rounded-2xl shadow-sm">
          <ProgressDots step={store.step} />
        </div>

        {store.error ? (
          <div className="border border-red-200 bg-red-50 p-5 mb-8 rounded-xl animate-fade-in-up">
            <p className="text-sm font-bold text-red-600 uppercase tracking-widest flex items-center gap-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              协议执行故障: {store.error.message}
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-8">
          {store.step === 1 ? <Step1 /> : null}
          {store.step === 2 ? <Step2 /> : null}
          {store.step === 3 ? <Step3 /> : null}
          {store.step === 4 ? <Step4Generating /> : null}
          {store.step === 5 ? <Step5Review /> : null}
        </div>
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
    <StepShell eyebrow="Step 01" title="锚定叙事原点" description="每一篇伟大的作品都始于一个名字和它所属的领域。您可以随时在后期修改这些设定。">
      <div className="grid gap-10">
        <div className="grid gap-4">
          <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted flex items-center gap-2">
            <div className="w-1 h-1 rounded-full bg-primary" />
            作品暂定标题
          </label>
          <input className="input-base text-xl font-serif font-bold py-4" placeholder="例如：云端的最后一名诗人" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        
        <div className="grid gap-4">
          <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted flex items-center gap-2">
            <div className="w-1 h-1 rounded-full bg-primary" />
            文学领域划分
          </label>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {genres.map((genre) => (
              <button 
                key={genre.value} 
                className={`group relative py-4 px-3 rounded-xl transition-all duration-300 border-2 ${
                  genreMain === genre.value 
                    ? "border-primary bg-primary/5 text-primary shadow-lg shadow-primary/10" 
                    : "border-border-subtle bg-white text-text-secondary hover:border-primary/30"
                }`} 
                onClick={() => setGenreMain(genre.value)}
              >
                <span className="relative z-10 text-[13px] font-bold">{genre.label}</span>
                {genreMain === genre.value && (
                   <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4">
          <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted flex items-center gap-2">
            <div className="w-1 h-1 rounded-full bg-primary" />
            细分题材 / 风格标签
          </label>
          <input className="input-base" placeholder="例如：东方玄幻、硬核科幻、赛博朋克..." value={genreSub} onChange={(e) => setGenreSub(e.target.value)} />
        </div>

        <div className="pt-8">
          <PrimaryButton busy={store.status === "loading"} onClick={submit}>
            下一步：捕捉灵感碎片
          </PrimaryButton>
        </div>
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
    <StepShell eyebrow="Step 02" title="灵感火花捕捉" description="请描述您故事的核心冲突或世界观雏形。AI 可以基于您的领域偏好提供一系列叙事向量。">
      <div className="grid gap-10">
        <div className="grid gap-4">
          <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted flex items-center gap-2">
             <div className="w-1 h-1 rounded-full bg-primary" />
             核心创意描述 (Logline)
          </label>
          <div className="relative group">
            <div className="absolute inset-0 bg-primary/5 blur-xl group-focus-within:bg-primary/10 transition-colors pointer-events-none rounded-xl" />
            <textarea 
              className="relative z-10 input-base min-h-[160px] py-5 text-lg font-serif font-medium leading-relaxed bg-white/80 backdrop-blur-sm" 
              value={logline} 
              onChange={(e) => setLogline(e.target.value)} 
              placeholder="描述一个令你激动的场景或矛盾，例如：一个被废柴宗门收留的少年，意外觉醒了上古剑魂..." 
            />
          </div>
        </div>
        
        <div className="flex flex-col md:flex-row gap-4">
          <SecondaryButton busy={store.status === "loading"} onClick={recommend}>
            <span className="flex items-center gap-2.5">
              <div className="h-5 w-5 rounded bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                </svg>
              </div>
              生成 5 组叙事建议
            </span>
          </SecondaryButton>
          <PrimaryButton onClick={next}>继续：定义叙事细节</PrimaryButton>
        </div>

        {store.inputs.logline_suggestions && (
          <div className="grid gap-4 pt-10 border-t border-border-strong animate-fade-in-up">
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted">AI 推荐的灵感向量</label>
            <div className="grid gap-3">
              {store.inputs.logline_suggestions.map((item) => (
                <button 
                  key={item} 
                  className="p-5 text-left text-[13px] font-medium text-text-secondary border-2 border-border-subtle bg-white rounded-xl hover:border-primary/40 hover:bg-primary/5 transition-all duration-300 group flex items-start gap-4" 
                  onClick={() => setLogline(item)}
                >
                  <div className="mt-1 h-1.5 w-1.5 rounded-full bg-border-strong group-hover:bg-primary transition-colors" />
                  <span className="group-hover:text-text-primary transition-colors flex-1">{item}</span>
                </button>
              ))}
            </div>
          </div>
        )}
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
    <StepShell eyebrow="Step 03" title="叙事逻辑推演" description="为了让 AI 深度理解您的创作意图，我们需要解决几个关键的叙事分支。">
      <div className="grid gap-12">
        {!store.inputs.questions ? (
          <div className="flex flex-col items-center justify-center py-24 gap-6 border-2 border-dashed border-border-strong rounded-2xl bg-secondary/30">
            <div className="h-16 w-16 rounded-full bg-white flex items-center justify-center shadow-lg">
               <svg className="w-8 h-8 text-primary opacity-30 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
               </svg>
            </div>
            <p className="text-sm font-bold text-text-secondary">AI 正在扫描您的叙事向量以寻找逻辑空隙...</p>
            <PrimaryButton busy={store.status === "loading"} onClick={loadQuestions}>
              启动逻辑审计并生成追问
            </PrimaryButton>
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            <div className="grid gap-6">
              {store.inputs.questions.map((question, i) => (
                <div key={question.key} className={`animate-fade-in-up delay-${(i % 3) * 100}`}>
                   <QuestionBlock question={question} />
                </div>
              ))}
            </div>
            <div className="pt-10 border-t border-border-strong flex justify-end">
              <PrimaryButton onClick={() => store.setStep(4)}>
                <span className="flex items-center gap-3">
                  开始叙事圣经合成
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </span>
              </PrimaryButton>
            </div>
          </div>
        )}
      </div>
    </StepShell>
  );
}

function QuestionBlock({ question }: { question: Question }) {
  const store = useWizardStore();
  const answer = store.inputs.answers?.[question.key];
  return (
    <div className="p-8 bg-white border border-border-subtle rounded-2xl shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 mb-6">
         <div className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center text-primary font-bold text-[10px]">Q</div>
         <h3 className="text-base font-serif font-bold text-text-primary leading-tight">{question.question}</h3>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {question.options.map((option) => {
          const selected = Array.isArray(answer) ? answer.includes(option) : answer === option;
          return (
            <button 
              key={option} 
              className={`p-4 text-left rounded-xl transition-all duration-300 border-2 flex items-center justify-between group ${
                selected 
                  ? "border-primary bg-primary/5 text-text-primary shadow-inner" 
                  : "border-border-subtle bg-white text-text-secondary hover:border-primary/20 hover:text-text-primary"
              }`} 
              onClick={() => store.setAnswer(question.key, toggleAnswer(question, answer, option))}
            >
              <span className={`text-[13px] font-semibold tracking-tight ${selected ? 'text-primary' : ''}`}>{option}</span>
              {selected ? (
                <div className="h-5 w-5 bg-primary rounded-full flex items-center justify-center text-white scale-110 shadow-lg shadow-primary/20 transition-transform">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              ) : (
                <div className="h-5 w-5 border-2 border-border-subtle rounded-full group-hover:border-primary/30 transition-colors" />
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

function PrimaryButton({ busy, onClick, children }: { busy?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button 
      disabled={busy} 
      className="btn-primary min-w-[280px] h-14 text-base shadow-xl shadow-text-primary/10 flex items-center justify-center gap-3" 
      onClick={onClick}
    >
      {busy ? (
        <>
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          正在执行协议...
        </>
      ) : children}
    </button>
  );
}

function SecondaryButton({ busy, onClick, children }: { busy?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button 
      disabled={busy} 
      className="btn-secondary min-w-[240px] h-14 text-base hover:bg-white group" 
      onClick={onClick}
    >
      {busy ? "处理中..." : children}
    </button>
  );
}
