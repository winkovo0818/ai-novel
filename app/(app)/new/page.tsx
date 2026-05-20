"use client";

import { useState } from "react";

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

  return (
    <div className="flex-1 overflow-y-auto bg-background custom-scrollbar">
      <div className="p-6 md:p-10 lg:p-12 max-w-6xl mx-auto min-h-full pb-32">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 border-b border-border-subtle pb-6">
          <div className="flex flex-col gap-3">
             <div className="flex items-center gap-2">
               <div className="h-1.5 w-1.5 rounded-full bg-accent" />
               <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-text-muted">创意工作室核心 / STUDIO CORE</span>
             </div>
             <h1 className="text-5xl md:text-6xl font-serif font-normal text-text-primary tracking-tighter">
               创作向导<span className="text-accent">.</span>
             </h1>
             <p className="text-lg text-text-secondary max-w-lg opacity-60">
               从一粒灵感的种子，到一部宏大的叙事圣经。
             </p>
          </div>
          <button
            className="group flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.2em] text-text-dim hover:text-red-500 transition duration-500"
            onClick={store.reset}
            aria-label="重置向导协议"
          >
            <div className="h-9 w-9 rounded-full border border-border-strong flex items-center justify-center group-hover:border-red-200 group-hover:bg-red-50 transition" aria-hidden="true">
              <svg aria-hidden="true" className="w-3.5 h-3.5 transition-transform duration-300 group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            重置向导协议
          </button>
        </header>

        <div className="mb-6 animate-fade-in delay-200">
          <ProgressDots step={store.step} />
        </div>

        {store.error ? (
          <div className="mb-12 animate-shake">
            <div className="card bg-red-50/30 border-red-100 flex items-start gap-6 p-8 shadow-none">
              <span className="font-serif text-5xl text-red-200 leading-none">!</span>
              <div className="flex flex-col gap-1">
                <p className="text-[10px] font-bold text-red-800 uppercase tracking-[0.3em]">引擎逻辑故障 / ENGINE FAULT</p>
                <p className="text-lg text-red-900/70">{store.error.message}</p>
              </div>
            </div>
          </div>
        ) : null}

        <main className="max-w-4xl">
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
  const [description, setDescription] = useState(store.inputs.description ?? "");

  async function submit() {
    if (!genreSub.trim()) return store.setError({ step: 1, message: "请填写细分题材", retryable: false });
    store.setStatus("loading");
    store.setError(undefined);
    const res = await fetch("/api/onboarding/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, genre_main: genreMain, genre_sub: genreSub, description }),
    });
    const json = await res.json();
    if (!json.ok) return store.setError({ step: 1, message: json.error.message, retryable: json.error.retryable });
    store.patchInputs({ title, genre_main: genreMain, genre_sub: genreSub, description });
    store.setSession(json.data.session_id, json.data.default_profile);
    store.setStep(2);
  }

  return (
    <StepShell eyebrow="分册 01" title="锚定叙事原点" description="每一篇伟大的作品都始于一个名字和它所属的领域。">
      <div className="grid gap-6">
        <section className="grid gap-4">
          <FolioLabel index="01" label="作品暂定标题 / THE TITLE" htmlFor="wizard-title" />
          <input
            id="wizard-title"
            name="title"
            autoComplete="off"
            spellCheck={false}
            className="w-full text-3xl md:text-5xl font-serif font-normal py-4 px-0 bg-transparent border-b border-border-strong rounded-none focus:border-accent transition placeholder:text-text-dim/20 focus:outline-none"
            placeholder="云端的最后一名诗人…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </section>

        <section className="grid gap-8">
          <FolioLabel index="02" label="文学领域划分 / GENRE SELECTION" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {genres.map((genre) => (
              <button 
                key={genre.value} 
                className={`group relative p-6 rounded-[2rem] transition duration-300 text-left flex flex-col gap-2 border ${
                  genreMain === genre.value 
                    ? "border-text-primary bg-text-primary text-white shadow-premium scale-[1.01] z-10" 
                    : "border-border-subtle bg-white text-text-secondary hover:border-accent/40 hover:-translate-y-1"
                }`} 
                onClick={() => setGenreMain(genre.value)}
              >
                <div className="flex items-center justify-between">
                   <span className={`text-[10px] font-bold uppercase tracking-[0.2em] ${genreMain === genre.value ? 'text-accent' : 'text-text-muted group-hover:text-accent'}`}>
                     选项 {genre.value}
                   </span>
                   {genreMain === genre.value && (
                     <div className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                   )}
                </div>
                <h3 className={`text-2xl font-serif leading-none ${genreMain === genre.value ? 'text-white' : 'text-text-primary'}`}>
                   {genre.label.split(' / ')[0]}
                   <span className="block text-[12px] font-sans font-bold uppercase tracking-widest mt-1.5 opacity-40">
                     {genre.label.split(' / ')[1]}
                   </span>
                </h3>
                <p className={`text-[13px] leading-relaxed mt-1 ${genreMain === genre.value ? 'text-white/60' : 'text-text-muted'}`}>
                   {genre.description}
                </p>
              </button>
            ))}
          </div>
        </section>

        <section className="grid gap-4">
          <FolioLabel index="03" label="细分题材 / 风格标签 / THE VIBE" htmlFor="wizard-genre-sub" />
          <div className="relative group">
            <input
              id="wizard-genre-sub"
              name="genre_sub"
              autoComplete="off"
              className="w-full text-lg font-serif font-normal py-4 px-6 bg-secondary/50 border border-transparent rounded-xl focus:bg-white focus:border-accent/30 transition shadow-inner"
              placeholder="例如：东方玄幻、硬核科幻、赛博朋克…"
              value={genreSub}
              onChange={(e) => setGenreSub(e.target.value)}
            />
          </div>
        </section>

        <section className="grid gap-4">
          <FolioLabel index="04" label="作品简介 / STORY DESCRIPTION" htmlFor="wizard-description" />
          <textarea
            id="wizard-description"
            name="description"
            maxLength={500}
            className="w-full min-h-32 text-base font-serif font-normal py-4 px-6 bg-secondary/50 border border-transparent rounded-xl focus:bg-white focus:border-accent/30 transition shadow-inner resize-y"
            placeholder="简要介绍作品的主角、核心冲突与阅读期待，可留空后续补充…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <p className="text-[11px] text-text-dim text-right">{description.length}/500</p>
        </section>

        <footer className="pt-6 flex justify-end">
          <PrimaryButton busy={store.status === "loading"} onClick={submit}>
            继续：捕捉灵感碎片
            <svg aria-hidden="true" className="w-5 h-5 ml-3 group-hover:translate-x-1.5 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
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
      <div className="grid gap-6">
        <section className="grid gap-4">
          <FolioLabel index="01" label="核心创意描述 / THE LOGLINE" htmlFor="wizard-logline" />
          <div className="relative group">
            <div className="absolute -inset-4 bg-accent/5 rounded-[3rem] blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <textarea
              id="wizard-logline"
              name="logline"
              autoComplete="off"
              className="relative z-10 w-full min-h-[200px] p-8 text-2xl md:text-3xl font-serif font-normal leading-[1.6] bg-white border border-border-subtle rounded-[2.5rem] shadow-premium focus:border-accent/40 focus:outline-none transition placeholder:text-text-dim/10 selection:bg-accent/10"
              value={logline}
              onChange={(e) => setLogline(e.target.value)}
              placeholder="描述一个令你激动的场景、矛盾，或者核心人物的命运转折…"
            />
            <div className="absolute bottom-6 right-6 w-10 h-10 border-b-2 border-r-2 border-accent/20 rounded-br-[1.5rem] pointer-events-none" />
          </div>
        </section>
        
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 border-t border-border-subtle pt-8">
          <button 
            disabled={store.status === "loading"} 
            className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.3em] text-accent hover:text-text-primary transition duration-500 group" 
            onClick={recommend}
          >
            <div className="h-10 w-10 rounded-full border border-accent/20 flex items-center justify-center group-hover:bg-accent group-hover:text-white transition duration-300">
               <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.628.283a2 2 0 01-1.186.128l-2.094-.31a2 2 0 00-1.226.226l-1.314.876a2 2 0 01-.813.294l-1.606.16a2 2 0 00-1.225.565l-1.141.913a2 2 0 01-1.127.38H2" />
               </svg>
            </div>
            {store.status === "loading" ? "正在调取叙事建议…" : "AI 推荐灵感向量"}
          </button>
          
          <PrimaryButton onClick={next}>
            下一步：定义叙事细节
            <svg aria-hidden="true" className="w-5 h-5 ml-3 group-hover:translate-x-1.5 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </PrimaryButton>
        </div>

        {store.inputs.logline_suggestions && (
          <section className="grid gap-8 pt-12 border-t border-border-strong animate-fade-in">
            <FolioLabel index="02" label="叙事灵感锚点 / AI FRAGMENTS" />
            <div className="grid gap-4">
              {store.inputs.logline_suggestions.map((item, i) => (
                <button 
                  key={item} 
                  className="group p-6 text-left rounded-[2rem] bg-white border border-border-subtle hover:border-accent/30 hover:shadow-premium transition duration-300 flex gap-6 items-start relative overflow-hidden" 
                  onClick={() => setLogline(item)}
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-accent/5 rounded-bl-full translate-x-12 -translate-y-12 group-hover:translate-x-0 group-hover:translate-y-0 transition-transform duration-500" />
                  <span className="font-serif text-3xl text-accent/20 group-hover:text-accent transition-colors duration-300 shrink-0">
                    {String(i+1).padStart(2, '0')}
                  </span>
                  <p className="text-lg font-serif font-normal leading-relaxed text-text-secondary group-hover:text-text-primary transition-colors">
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
      <div className="grid gap-6">
        {!store.inputs.questions ? (
          <div className="flex flex-col items-center justify-center py-16 gap-8 border-2 border-dashed border-border-strong rounded-[2.5rem] bg-secondary/10 relative overflow-hidden group shadow-inner">
            <div className="h-20 w-20 rounded-full bg-white flex items-center justify-center shadow-premium relative z-10 group-hover:scale-110 transition-transform duration-500">
               <div className="absolute inset-0 bg-accent/10 animate-ping rounded-full" />
               <svg aria-hidden="true" className="w-10 h-10 text-accent relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
               </svg>
            </div>
            <div className="flex flex-col items-center gap-3 text-center px-10 relative z-10">
              <p className="text-[11px] font-bold text-text-primary uppercase tracking-[0.3em]">待命执行：叙事逻辑审计</p>
              <p className="text-lg text-text-dim max-w-md">AI 将基于您的灵感，生成一组深度叙事追问。</p>
            </div>
            <PrimaryButton busy={store.status === "loading"} onClick={loadQuestions}>
              启动逻辑扫描协议
            </PrimaryButton>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="grid gap-8">
              {store.inputs.questions.map((question, i) => (
                <div key={question.key} className="animate-fade-in-up" style={{ animationDelay: `${i * 100}ms` }}>
                   <QuestionBlock question={question} index={i+1} />
                </div>
              ))}
            </div>
            <footer className="pt-8 border-t border-border-subtle flex justify-end">
              <PrimaryButton onClick={() => store.setStep(4)}>
                开启叙事圣经合成
                <svg aria-hidden="true" className="w-5 h-5 ml-3 group-hover:translate-x-1.5 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

function QuestionBlock({ question, index }: { question: Question; index: number }) {
  const store = useWizardStore();
  const answer = store.inputs.answers?.[question.key];
  return (
    <div className="group relative">
      <div className="flex items-start gap-6 mb-6">
         <span className="font-serif text-4xl text-accent/20 group-hover:text-accent transition-colors duration-500 mt-[-4px]">
           {String(index).padStart(2, '0')}
         </span>
         <div className="flex flex-col gap-2">
            <span className="text-[9px] font-bold text-accent uppercase tracking-[0.3em]">{question.type === 'single' ? '单选决策 / DISCRETE' : '多重决策 / MULTI-VECTOR'}</span>
            <h3 className="text-2xl font-serif font-normal text-text-primary leading-tight">{question.question}</h3>
         </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 ml-14">
        {question.options.map((option) => {
          const selected = Array.isArray(answer) ? answer.includes(option) : answer === option;
          return (
            <button 
              key={option} 
              className={`p-4 text-left rounded-xl transition duration-500 border flex items-center justify-between group/opt ${
                selected 
                  ? "border-text-primary bg-text-primary text-white shadow-premium scale-[1.01] z-10" 
                  : "border-border-subtle bg-white text-text-secondary hover:border-accent/30 hover:bg-secondary/50 hover:scale-[1.005]"
              }`} 
              onClick={() => store.setAnswer(question.key, toggleAnswer(question, answer, option))}
            >
              <span className={`text-[14px] font-bold tracking-tight leading-snug ${selected ? 'text-white' : ''}`}>{option}</span>
              {selected ? (
                <div className="h-5 w-5 bg-white/20 rounded-full flex items-center justify-center text-white ring-1 ring-white/30 animate-reveal">
                  <svg aria-hidden="true" className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              ) : (
                <div className="h-1.5 w-1.5 rounded-full bg-accent/20 group-hover/opt:bg-accent transition-colors" />
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
    <div className="flex items-center gap-4 group">
      <span className="font-serif text-2xl text-accent/40 group-hover:text-accent transition-colors duration-300" aria-hidden="true">{index}</span>
      <label htmlFor={htmlFor} className="text-[10px] font-bold uppercase tracking-[0.3em] text-text-muted">
        {label}
      </label>
    </div>
  );
}

function PrimaryButton({ busy, onClick, children }: { busy?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button 
      disabled={busy} 
      className="group btn-primary min-w-[280px] h-14 shadow-premium relative overflow-hidden" 
      onClick={onClick}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-shimmer pointer-events-none" />
      {busy ? (
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          <span className="tracking-wide">协议执行中…</span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {children}
        </div>
      )}
    </button>
  );
}

