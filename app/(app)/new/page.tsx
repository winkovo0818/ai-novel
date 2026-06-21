"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import { ProgressDots } from "./_components/ProgressDots";
import { Step4Generating } from "./_components/Step4Generating";
import { Step5Review } from "./_components/Step5Review";
import { useWizardStore } from "@/lib/store/wizardStore";
import type { NovelProfile, Question } from "@/lib/validation/schemas";

const genres: Array<{
  value: NovelProfile["genre_main"];
  label: string;
  short: string;
  description: string;
  tags: string[];
}> = [
  {
    value: "web",
    label: "网文",
    short: "快节奏 · 强爽点",
    description: "适合升级、复仇、悬念和强情绪推进。",
    tags: ["玄幻", "升级流", "复仇"],
  },
  {
    value: "literary",
    label: "严肃文学",
    short: "人物 · 主题",
    description: "适合复杂人物、时代切面和克制的情绪回响。",
    tags: ["现实", "人物群像", "命运"],
  },
  {
    value: "script",
    label: "剧本",
    short: "场景 · 冲突",
    description: "适合强场面、对白推进和明确的戏剧转折。",
    tags: ["悬疑", "双人戏", "高概念"],
  },
  {
    value: "fanfic",
    label: "同人",
    short: "羁绊 · 延展",
    description: "适合在熟悉世界里延续人物关系和新命运线。",
    tags: ["平行线", "羁绊", "命运改写"],
  },
  {
    value: "shortstory",
    label: "短篇集",
    short: "精炼 · 高完成度",
    description: "适合一个强钩子、一次反转和清晰的余味。",
    tags: ["反转", "现实情感", "悬念"],
  },
];

const clampChapterCount = (value: number) => Math.max(8, Math.min(80, value));
const ASSISTANT_REQUEST_TIMEOUT_MS = 20_000;

type AssistantIdea = {
  label: string;
  badge: string;
  title: string;
  body: string;
  logline: string;
  description: string;
  tags: string[];
};

type AssistantQuestion = {
  id: string;
  question: string;
  type: "single" | "multi";
  options: Array<{ label: string; note: string; tag: string }>;
};

type AssistantPack = {
  tone: string;
  ideas: AssistantIdea[];
  questions: AssistantQuestion[];
};

type AssistantStatus = "idle" | "loading";
type AssistantSource = "ai" | "fallback" | null;

type DisplayIdea = {
  label: string;
  badge: string;
  title: string;
  body: string;
  logline: string;
  description?: string;
  tags: string[];
};

const assistantPacks: Record<NovelProfile["genre_main"], AssistantPack> = {
  web: {
    tone: "强钩子 · 快推进",
    ideas: [
      {
        label: "推荐方向 01",
        badge: "更强钩子",
        title: "把秘密提前压到第一幕",
        body: "让禁忌或真相在开场就触碰主角的日常，读者会更快进入冲突。",
        logline: "少年在火房中觉醒上古剑魂，却发现十二仙门供奉的神像都刻着自己母亲的名字。他必须在拜师大典前偷出禁卷，查清灭门真相。",
        description: "主角从底层火房少年起步，在宗门审判和上古剑魂的夹缝里追查母亲真名。第一卷聚焦拜师大典、禁卷失窃与十二仙门的旧案。",
        tags: ["玄幻", "复仇", "师门背叛"],
      },
      {
        label: "推荐方向 02",
        badge: "人物压力",
        title: "让仇人的女儿变成唯一钥匙",
        body: "主角必须与最不该信任的人合作，外部冒险和内部拉扯会同时成立。",
        logline: "落魄少年想偷出禁阁古卷，却必须带上仇人的女儿，因为只有她知道活门的开启方式。两人越接近真相，越发现仇恨本身也是一场骗局。",
        description: "故事以禁阁潜入为起点，主角在复仇与合作之间摇摆，逐步揭开师门旧案和上一代人的隐瞒。",
        tags: ["禁阁", "宿敌合作", "古卷谜案"],
      },
      {
        label: "推荐方向 03",
        badge: "世界规则",
        title: "把宗门换成会移动的审判城",
        body: "一个异常规则能让世界观立住，也方便后续章节不断制造新关卡。",
        logline: "十二仙门不是宗门，而是十二座会移动的审判城。主角在城门闭合前觉醒剑魂，发现每座城都藏着母亲死亡的一部分证词。",
        description: "主角追逐十二座审判城，每到一城都会得到一份互相矛盾的证词。升级线、真相线和城市规则交替推进。",
        tags: ["审判城", "移动世界", "证词谜题"],
      },
    ],
    questions: [
      {
        id: "loss",
        question: "主角最不能失去什么？",
        type: "single",
        options: [
          { label: "母亲遗物", note: "主角的底线来自母亲遗物，一旦遗失就会逼他越界。", tag: "遗物线索" },
          { label: "同门信任", note: "主角需要在背叛疑云里保住同门信任，让关系线更有拉扯。", tag: "同门信任" },
          { label: "剑魂控制权", note: "剑魂会反噬主角，胜利越大，失控代价越明显。", tag: "力量代价" },
        ],
      },
      {
        id: "expectation",
        question: "首卷要优先强化哪种阅读期待？",
        type: "multi",
        options: [
          { label: "复仇推进", note: "每三到五章给一次复仇线索回报。", tag: "复仇推进" },
          { label: "师门悬疑", note: "让长老、禁阁和旧案证词互相矛盾。", tag: "师门悬疑" },
          { label: "升级爽点", note: "把剑魂能力拆成阶段性觉醒，形成清晰成长台阶。", tag: "升级爽点" },
        ],
      },
    ],
  },
  literary: {
    tone: "克制 · 人物回声",
    ideas: [
      {
        label: "推荐方向 01",
        badge: "人物伤口",
        title: "把宏大议题落到一件小物",
        body: "用一件能反复出现的物品承载关系变化，比直接讲主题更有力量。",
        logline: "一个退休女工在旧厂拆迁前寻找丢失的搪瓷杯，杯底刻着她从未说出口的名字。每一次寻找，都把她和子女之间的沉默重新翻开。",
        description: "故事围绕旧厂拆迁、家庭沉默和个人记忆展开，通过一件搪瓷杯连接三代人的选择。",
        tags: ["现实", "家庭", "旧厂记忆"],
      },
      {
        label: "推荐方向 02",
        badge: "关系转折",
        title: "让人物在误会中保护彼此",
        body: "人物不说真相，但每个行动都在泄露情感，适合更细腻的张力。",
        logline: "母亲始终阻止女儿回乡卖房，女儿以为那是控制，直到拆墙时发现父亲留下的整面日记砖。",
        description: "母女关系从对抗到理解，乡镇房屋和父亲日记成为两代人重新靠近的入口。",
        tags: ["母女", "秘密", "乡镇"],
      },
      {
        label: "推荐方向 03",
        badge: "时代切面",
        title: "让个人命运碰上城市更新",
        body: "外部变化给人物选择施压，能自然带出主题。",
        logline: "老照相馆搬迁前夜，老板必须销毁一批没人来取的底片，却在其中看见了自己失踪二十年的哥哥。",
        description: "故事用老照相馆的最后一夜串联城市变迁、家庭失散和被保存下来的普通人生。",
        tags: ["城市更新", "照相馆", "失散"],
      },
    ],
    questions: [
      {
        id: "silence",
        question: "人物最想隐瞒的真相是什么？",
        type: "single",
        options: [
          { label: "曾经逃走", note: "核心人物曾经逃离家庭，归来后一直被自责牵引。", tag: "逃离与归来" },
          { label: "替人背锅", note: "人物守住一个替别人承担的秘密，关系张力更强。", tag: "沉默牺牲" },
          { label: "错过告别", note: "人物最大的遗憾是没有完成一次告别。", tag: "迟来的告别" },
        ],
      },
      {
        id: "texture",
        question: "叙事更适合保留哪种质感？",
        type: "multi",
        options: [
          { label: "旧物细节", note: "反复出现旧物，让情绪有可触摸的载体。", tag: "旧物意象" },
          { label: "方言对白", note: "少量方言对白能强化生活气。", tag: "生活对白" },
          { label: "时间跳切", note: "用过去和现在互相照亮人物选择。", tag: "双时间线" },
        ],
      },
    ],
  },
  script: {
    tone: "场面 · 对抗",
    ideas: [
      {
        label: "推荐方向 01",
        badge: "开场抓人",
        title: "用一次审讯打开全片",
        body: "单场景高压开局能快速建立人物、目标和反转。",
        logline: "暴雨夜，年轻编剧被带进审讯室，被要求复述一部还没写完的电影。警察越听越发现，现实案件正在按剧本发生。",
        description: "故事以审讯室为中心，通过剧本复述和现实案件互相嵌套，逐步揭开谁才是真正作者。",
        tags: ["审讯室", "元叙事", "犯罪悬疑"],
      },
      {
        label: "推荐方向 02",
        badge: "双人冲突",
        title: "让两个人困在同一个房间",
        body: "限制空间会放大对白和权力变化，很适合剧本结构。",
        logline: "停电的电梯里，离婚律师和她明天要起诉的企业家被困八小时。每一次求救失败，都会暴露一层共同秘密。",
        description: "电梯密闭空间推动双人对峙，外部救援倒计时和内部秘密揭露同步升级。",
        tags: ["密闭空间", "双人戏", "倒计时"],
      },
      {
        label: "推荐方向 03",
        badge: "商业钩子",
        title: "给主角一个无法拒绝的任务",
        body: "明确任务和时间限制能让每一场戏更有方向。",
        logline: "过气替身演员接到最后一单：在颁奖礼当天假扮失踪影帝领奖。他只有三小时学会一个人的全部人生。",
        description: "故事围绕身份扮演、娱乐圈旧案和颁奖礼倒计时展开，主角在替身任务中找回自我。",
        tags: ["替身", "娱乐圈", "倒计时"],
      },
    ],
    questions: [
      {
        id: "scene_engine",
        question: "最核心的场景引擎是什么？",
        type: "single",
        options: [
          { label: "密闭空间", note: "核心戏集中在受限空间，压力来自逃不出去。", tag: "密闭空间" },
          { label: "公开场合", note: "冲突发生在众目睽睽下，人物不能说破真相。", tag: "公开对峙" },
          { label: "倒计时任务", note: "每一幕都被时间限制推动。", tag: "任务倒计时" },
        ],
      },
      {
        id: "turning",
        question: "中段反转更适合从哪里来？",
        type: "multi",
        options: [
          { label: "身份反转", note: "某个角色的真实身份改变观众判断。", tag: "身份反转" },
          { label: "证据反转", note: "关键证据被重新解释，案件方向翻转。", tag: "证据反转" },
          { label: "情感反转", note: "对抗关系变成互相保护。", tag: "情感反转" },
        ],
      },
    ],
  },
  fanfic: {
    tone: "羁绊 · 命运改写",
    ideas: [
      {
        label: "推荐方向 01",
        badge: "关系修复",
        title: "让遗憾事件重新发生一次",
        body: "同人读者往往被未完成关系吸引，重来一次能自然给情绪出口。",
        logline: "主角意外回到命运分岔的前一天，必须在不改变大结局的前提下，救下曾经背叛自己的同伴。",
        description: "故事聚焦命运修正、关系重建和代价选择，保留原作核心事件，但给角色新的行动空间。",
        tags: ["命运分岔", "关系修复", "时间回环"],
      },
      {
        label: "推荐方向 02",
        badge: "新视角",
        title: "用边缘角色看主线",
        body: "让小人物靠近主线事件，可以保持熟悉感又开出新路径。",
        logline: "一个从未被主角团记住的医馆学徒，发现自己每救下一人，原本的主线记忆就会从世界上消失一点。",
        description: "边缘人物被迫参与主线，用救人与记忆消失的规则制造代价感。",
        tags: ["边缘角色", "记忆消失", "主线改写"],
      },
      {
        label: "推荐方向 03",
        badge: "平行宇宙",
        title: "把熟悉关系放进陌生职业",
        body: "关系不变，场景改变，容易产生新鲜感。",
        logline: "原本宿敌的两人，在平行世界成了共同经营深夜电台的搭档。他们每接通一通电话，都会听见原世界的求救声。",
        description: "平行职业设定保留角色张力，通过深夜电台连接原世界危机。",
        tags: ["平行世界", "深夜电台", "宿敌搭档"],
      },
    ],
    questions: [
      {
        id: "canon",
        question: "这次最想修复哪一种原作遗憾？",
        type: "single",
        options: [
          { label: "没说出口的话", note: "核心情绪是迟到的坦白和重新理解。", tag: "未竟告白" },
          { label: "无法挽回的死亡", note: "救人与代价是故事的主要拉力。", tag: "逆转死亡" },
          { label: "被误解的背叛", note: "让背叛背后的保护被逐步看见。", tag: "背叛真相" },
        ],
      },
      {
        id: "distance",
        question: "同人和原作的距离要多远？",
        type: "multi",
        options: [
          { label: "贴近主线", note: "重点补足原作事件间隙。", tag: "主线补完" },
          { label: "平行设定", note: "换场景但保留人物关系。", tag: "平行设定" },
          { label: "原创角色切入", note: "用新角色观察熟悉人物。", tag: "原创视角" },
        ],
      },
    ],
  },
  shortstory: {
    tone: "强反转 · 短闭环",
    ideas: [
      {
        label: "推荐方向 01",
        badge: "结尾回刺",
        title: "让第一句话在结尾变含义",
        body: "短篇最适合把一个意象反复打磨，最后让读者重新理解开头。",
        logline: "丈夫每天给失忆的妻子读同一本日记，直到她发现日记里每一页的日期，都是明天。",
        description: "故事围绕失忆、日记和婚姻秘密展开，结尾重新解释丈夫的照料和妻子的选择。",
        tags: ["反转", "婚姻秘密", "时间错位"],
      },
      {
        label: "推荐方向 02",
        badge: "现实刺点",
        title: "从一个生活困境切入",
        body: "现实情绪越具体，短篇越容易迅速成立。",
        logline: "女儿为了给母亲凑手术费，卖掉父亲留下的老房子，却发现买房人每晚都会给父亲的旧号码发消息。",
        description: "故事以卖房筹款为引子，牵出父亲旧事、母女关系和一个迟来的道歉。",
        tags: ["现实情感", "老房子", "迟来的道歉"],
      },
      {
        label: "推荐方向 03",
        badge: "悬念闭环",
        title: "用一条规则支撑全篇",
        body: "短篇规则越清楚，反转越干净。",
        logline: "小镇上每个人一生只能说一次谎。新来的法医发现，所有死者临终前都说过同一句真话。",
        description: "故事用说谎规则和死亡真话构成悬念，在小镇关系网中完成一次短闭环推理。",
        tags: ["规则悬疑", "小镇", "法医"],
      },
    ],
    questions: [
      {
        id: "ending",
        question: "短篇结尾更想留下什么感觉？",
        type: "single",
        options: [
          { label: "背后一凉", note: "最后一段重写读者对前文的理解。", tag: "冷感反转" },
          { label: "心里一沉", note: "真相不炸裂，但情感后劲强。", tag: "情绪后劲" },
          { label: "豁然开朗", note: "所有线索在最后自然合拢。", tag: "线索闭环" },
        ],
      },
      {
        id: "seed",
        question: "故事应优先保留哪类线索？",
        type: "multi",
        options: [
          { label: "旧物", note: "旧物承担记忆和真相入口。", tag: "旧物线索" },
          { label: "通话记录", note: "用消息和通话制造现实质感。", tag: "通话记录" },
          { label: "重复台词", note: "一句话反复出现，结尾改写含义。", tag: "重复台词" },
        ],
      },
    ],
  },
};

export default function NewPage() {
  const store = useWizardStore();

  return (
    <div className="wizard-workspace-bg flex-1 min-h-0 overflow-y-auto custom-scrollbar">
      <div className="min-h-full px-4 py-5 sm:px-6 lg:px-8 xl:px-9 pb-16">
        <header className="mx-auto mb-4 flex max-w-[1320px] flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.22em] text-text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_0_6px_rgba(99,102,241,0.10)]" />
              AI Novel Studio / 新作品向导
            </div>
            <h1 className="text-4xl font-serif leading-none tracking-normal text-text-primary sm:text-5xl">
              创作向导
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-border-strong bg-white/70 px-4 text-[12px] font-black text-text-secondary shadow-sm transition hover:border-text-primary hover:text-text-primary"
              onClick={store.reset}
            >
              <IconReset />
              重置
            </button>
          </div>
        </header>

        <div className="mx-auto mb-5 max-w-[1320px]">
          <ProgressDots step={store.step} />
        </div>

        {store.error ? (
          <div className="mx-auto mb-5 max-w-[1320px] animate-shake">
            <div className="flex items-start gap-4 rounded-lg border border-red-100 bg-red-50/80 p-5 shadow-sm">
              <span className="font-serif text-4xl leading-none text-red-300">!</span>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-red-800">生成遇到问题</p>
                <p className="mt-1 text-sm leading-relaxed text-red-950/70">{store.error.message}</p>
              </div>
            </div>
          </div>
        ) : null}

        <main className="mx-auto max-w-[1320px]">
          {store.step === 1 ? <Step1 /> : null}
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
  const [tags, setTags] = useState<string[]>(() => {
    const parsed = (store.inputs.genre_sub ?? "玄幻").split(/[\s#]+/).filter(Boolean);
    return parsed.length > 0 ? parsed : ["玄幻"];
  });
  const [tagInput, setTagInput] = useState("");
  const [description, setDescription] = useState(store.inputs.description ?? "");
  const [logline, setLogline] = useState(store.inputs.logline ?? "");
  const [chapters, setChapters] = useState(clampChapterCount(store.inputs.chapters ?? 40));
  const [assistantTab, setAssistantTab] = useState<"ideas" | "questions">("ideas");
  const [loglineSuggestions, setLoglineSuggestions] = useState<string[]>(store.inputs.logline_suggestions ?? []);
  const [generatedQuestions, setGeneratedQuestions] = useState<Question[]>(store.inputs.questions ?? []);
  const [answers, setAnswers] = useState<Record<string, string[]>>(() => normalizeStoredAnswers(store.inputs.answers));
  const [ideaStatus, setIdeaStatus] = useState<AssistantStatus>("idle");
  const [questionStatus, setQuestionStatus] = useState<AssistantStatus>("idle");
  const [ideasSource, setIdeasSource] = useState<AssistantSource>(
    store.inputs.logline_suggestions?.length ? "ai" : null,
  );
  const [questionsSource, setQuestionsSource] = useState<AssistantSource>(
    store.inputs.questions?.length ? "ai" : null,
  );
  const [assistantError, setAssistantError] = useState<string>();
  const [sessionSignature, setSessionSignature] = useState("");
  const autoIdeaSignatureRef = useRef("");
  const autoQuestionSignatureRef = useRef("");

  const pack = assistantPacks[genreMain];
  const currentGenre = genres.find((genre) => genre.value === genreMain) ?? genres[0];
  const genreSub = tags.join(" ");
  const cleanLogline = logline.trim();
  const titleReady = title.trim().length >= 2;
  const loglineReady = cleanLogline.length >= 8;
  const canGenerateIdeas = titleReady && tags.length > 0 && loglineReady;
  const questionAutoSignature = `${genreMain}|${genreSub}|${cleanLogline}`;
  const currentSessionSignature = useMemo(
    () => JSON.stringify({
      title: title.trim(),
      genreMain,
      genreSub,
      logline: cleanLogline,
      description: description.trim(),
    }),
    [cleanLogline, description, genreMain, genreSub, title],
  );
  const displayedIdeas = useMemo(
    () => (canGenerateIdeas ? buildIdeaCards(loglineSuggestions, pack.ideas, ideasSource) : []),
    [canGenerateIdeas, ideasSource, loglineSuggestions, pack.ideas],
  );
  const displayedQuestions = useMemo(
    () => (canGenerateIdeas ? generatedQuestions : []),
    [canGenerateIdeas, generatedQuestions],
  );
  const selectedAnswerDetails = useMemo(() => {
    return displayedQuestions.flatMap((question) =>
      (answers[question.key] ?? []).map((label) => ({
        key: question.key,
        question: question.question,
        option: label,
      })),
    );
  }, [answers, displayedQuestions]);

  const readinessItems = [
    { label: "题材", ready: tags.length > 0 },
    { label: "灵感", ready: cleanLogline.length >= 12 },
    { label: "简介", ready: description.trim().length >= 20 },
    { label: "追问", ready: selectedAnswerDetails.length > 0 },
  ];
  const readiness = Math.round(
    (readinessItems.filter((item) => item.ready).length / readinessItems.length) * 100,
  );

  useEffect(() => {
    if (!canGenerateIdeas || displayedIdeas.length > 0 || ideaStatus !== "idle") {
      return;
    }
    if (autoIdeaSignatureRef.current === currentSessionSignature) {
      return;
    }

    const timer = window.setTimeout(() => {
      autoIdeaSignatureRef.current = currentSessionSignature;
      void generateLoglines({ auto: true });
    }, 700);

    return () => window.clearTimeout(timer);
    // generateLoglines intentionally stays out of the dependency list so the
    // debounced request keys off the stable input signature, not render identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canGenerateIdeas, cleanLogline, currentSessionSignature, displayedIdeas.length, ideaStatus]);

  useEffect(() => {
    if (!canGenerateIdeas || generatedQuestions.length > 0 || questionStatus !== "idle") {
      return;
    }
    if (autoQuestionSignatureRef.current === questionAutoSignature) {
      return;
    }

    const timer = window.setTimeout(() => {
      autoQuestionSignatureRef.current = questionAutoSignature;
      void generateQuestions({ activateTab: false });
    }, 900);

    return () => window.clearTimeout(timer);
    // generateQuestions intentionally stays out of the dependency list so the
    // debounced request keys off the stable logline signature.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canGenerateIdeas, generatedQuestions.length, questionAutoSignature, questionStatus]);

  function addTag(value: string) {
    const trimmed = value.trim().replace(/^#+/, "");
    if (!trimmed) {
      setTagInput("");
      return;
    }
    setTags((current) => mergeUnique(current, [trimmed]));
    setTagInput("");
    clearGeneratedAssistant();
  }

  function removeTag(index: number) {
    setTags((current) => current.filter((_, i) => i !== index));
    clearGeneratedAssistant();
  }

  function handleTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === "Backspace" && !tagInput && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  }

  function selectGenre(value: NovelProfile["genre_main"]) {
    setGenreMain(value);
    const nextGenre = genres.find((genre) => genre.value === value);
    if (!nextGenre) return;
    setTags(nextGenre.tags);
    setTagInput("");
    setAnswers({});
    clearGeneratedAssistant();
  }

  function updateTitle(value: string) {
    setTitle(value);
    clearGeneratedAssistant();
  }

  function updateLogline(value: string) {
    setLogline(value);
    setLoglineSuggestions([]);
    setGeneratedQuestions([]);
    setAnswers({});
    setIdeasSource(null);
    setQuestionsSource(null);
    setAssistantError(undefined);
    setSessionSignature("");
    autoIdeaSignatureRef.current = "";
    autoQuestionSignatureRef.current = "";
  }

  function applyIdea(idea: DisplayIdea) {
    setLogline(idea.logline);
    const ideaDescription = idea.description;
    if (ideaDescription) {
      setDescription((current) => current.trim() || ideaDescription);
    }
    if (idea.tags.length > 0) {
      setTags((current) => mergeUnique(current, idea.tags));
    }
    setGeneratedQuestions([]);
    setQuestionsSource(null);
    setAnswers({});
    setAssistantTab("questions");
  }

  function toggleAnswer(question: Question, label: string) {
    setAnswers((current) => {
      const existing = current[question.key] ?? [];
      if (question.type === "single") return { ...current, [question.key]: [label] };
      return {
        ...current,
        [question.key]: existing.includes(label)
          ? existing.filter((item) => item !== label)
          : [...existing, label],
      };
    });
  }

  function writeAnswersToBrief() {
    if (selectedAnswerDetails.length === 0) return;
    const nextNotes = selectedAnswerDetails.map((item) => `${item.question}：${item.option}`);
    setDescription((current) => appendNotes(current, [`追问选择：${nextNotes.join("；")}`]).slice(0, 500));
  }

  function updateChapters(value: string) {
    setChapters(clampChapterCount(Number.parseInt(value, 10) || 40));
  }

  function adjustChapters(delta: number) {
    setChapters((current) => clampChapterCount(current + delta));
  }

  function clearGeneratedAssistant() {
    setLoglineSuggestions([]);
    setGeneratedQuestions([]);
    setAnswers({});
    setIdeasSource(null);
    setQuestionsSource(null);
    setAssistantError(undefined);
    setSessionSignature("");
    autoIdeaSignatureRef.current = "";
    autoQuestionSignatureRef.current = "";
  }

  async function createSessionSnapshot() {
    if (tags.length === 0) {
      throw new Error("请至少添加一个风格标签");
    }

    const { json } = await fetchJsonWithTimeout("/api/onboarding/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        genre_main: genreMain,
        genre_sub: genreSub,
        description,
      }),
    }, "创建向导会话超时，请稍后重试。");
    if (!json.ok) {
      throw new Error(json.error?.message ?? "创建向导会话失败");
    }
    const sessionId = typeof json.data?.session_id === "string" ? json.data.session_id : "";
    const defaultProfile = json.data?.default_profile as NovelProfile | undefined;
    if (!sessionId || !defaultProfile) {
      throw new Error("创建向导会话失败：返回数据不完整");
    }

    store.setSession(sessionId, defaultProfile);
    setSessionSignature(currentSessionSignature);
    return sessionId;
  }

  async function ensureFreshSession() {
    if (store.session_id && sessionSignature === currentSessionSignature) {
      return store.session_id;
    }
    return createSessionSnapshot();
  }

  async function generateLoglines({ auto = false } = {}) {
    if (!canGenerateIdeas) {
      if (!auto) {
        setAssistantError("先输入标题、作品类型 / 题材和一句话灵感后再生成。");
      }
      return;
    }

    setIdeaStatus("loading");
    setAssistantError(undefined);
    try {
      const sessionId = await ensureFreshSession();
      const { json } = await fetchJsonWithTimeout(`/api/onboarding/sessions/${sessionId}/loglines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate: !auto && loglineSuggestions.length > 0, logline: cleanLogline }),
      }, "灵感生成超时，请稍后再试。");
      if (!json.ok) {
        throw new Error(json.error?.message ?? "生成灵感失败");
      }
      const nextLoglines = Array.isArray(json.data?.loglines)
        ? json.data.loglines.filter((item): item is string => typeof item === "string")
        : [];
      setLoglineSuggestions(nextLoglines);
      setGeneratedQuestions([]);
      setAnswers({});
      setIdeasSource("ai");
      setQuestionsSource(null);
      store.patchInputs({ logline_suggestions: nextLoglines, questions: undefined, answers: undefined });
      setAssistantTab("ideas");
    } catch (err) {
      setLoglineSuggestions(pack.ideas.map((idea) => idea.logline));
      setGeneratedQuestions([]);
      setAnswers({});
      setIdeasSource("fallback");
      setQuestionsSource(null);
      setAssistantError(`${errorMessage(err)}，已显示示例兜底。`);
    } finally {
      setIdeaStatus("idle");
    }
  }

  async function generateQuestions({ activateTab = true } = {}) {
    if (!canGenerateIdeas) {
      setAssistantError("先输入标题、作品类型 / 题材和一句话灵感后再生成追问。");
      setAssistantTab("questions");
      return;
    }

    setQuestionStatus("loading");
    setAssistantError(undefined);
    try {
      const sessionId = await ensureFreshSession();
      const { json } = await fetchJsonWithTimeout(`/api/onboarding/sessions/${sessionId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logline: cleanLogline }),
      }, "追问生成超时，请稍后再试。");
      if (!json.ok) {
        throw new Error(json.error?.message ?? "生成追问失败");
      }
      const nextQuestions = Array.isArray(json.data?.questions)
        ? (json.data.questions as Question[])
        : [];
      setGeneratedQuestions(nextQuestions);
      setAnswers({});
      setQuestionsSource("ai");
      store.patchInputs({ questions: nextQuestions });
      if (activateTab) {
        setAssistantTab("questions");
      }
    } catch (err) {
      const fallbackQuestions = buildFallbackQuestions(pack.questions);
      setGeneratedQuestions(fallbackQuestions);
      setAnswers({});
      setQuestionsSource("fallback");
      setAssistantError(`${errorMessage(err)}，已显示示例兜底。`);
      if (activateTab) {
        setAssistantTab("questions");
      }
    } finally {
      setQuestionStatus("idle");
    }
  }

  async function submit() {
    if (tags.length === 0) {
      store.setError({ step: 1, message: "请至少添加一个风格标签", retryable: false });
      return;
    }
    if (cleanLogline.length < 8) {
      store.setError({ step: 1, message: "请先写一句话灵感，或从右侧采纳一条灵感建议", retryable: false });
      return;
    }

    const safeChapters = clampChapterCount(chapters);
    store.setStatus("loading");
    store.setError(undefined);
    try {
      await ensureFreshSession();
      store.patchInputs({
        title,
        genre_main: genreMain,
        genre_sub: genreSub,
        description,
        logline: cleanLogline,
        chapters: safeChapters,
        logline_suggestions: loglineSuggestions,
        questions: generatedQuestions,
        answers: buildQuestionAnswers(generatedQuestions, answers),
      });
      store.setStep(4);
    } catch (err) {
      store.setError({
        step: 1,
        message: errorMessage(err),
        retryable: true,
      });
    }
  }

  return (
    <section className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <article className="wizard-paper-surface relative min-w-0 overflow-hidden rounded-xl border border-border-subtle bg-white shadow-[0_18px_54px_rgba(36,31,24,0.06),0_6px_18px_rgba(36,31,24,0.04)]">
        <div className="relative grid gap-6 p-5 sm:p-7 lg:p-8">
          <header className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
            <div>
              <div className="mb-2 flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] text-accent">
                <span className="h-px w-6 bg-accent/70" />
                Manuscript 01
              </div>
              <h2 className="font-serif text-3xl leading-tight tracking-normal text-text-primary sm:text-4xl lg:text-[44px]">
                故事方向
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-text-muted">
                把标题、类型、题材和一句话灵感先落下来；右侧助手只提供可采纳的建议与追问。
              </p>
            </div>

            <div className="hidden items-center gap-3 rounded-lg border border-border-subtle bg-secondary/60 px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-text-muted xl:flex">
              <span>当前阶段</span>
              <span className="font-serif text-3xl font-normal tracking-normal text-text-primary">01</span>
            </div>
          </header>

          <div className="grid gap-5">
            <section className="grid gap-2.5">
              <FieldLabel label="作品暂定标题" hint="可稍后修改" htmlFor="wizard-title" />
              <input
                id="wizard-title"
                name="title"
                autoComplete="off"
                spellCheck={false}
                className="w-full border-0 border-b border-border-strong bg-transparent px-0 py-2.5 font-serif text-3xl leading-tight tracking-normal text-text-primary transition placeholder:text-text-dim/35 focus:border-accent focus:outline-none sm:text-4xl"
                placeholder="云端的最后一名诗人"
                value={title}
                onChange={(e) => updateTitle(e.target.value)}
              />
            </section>

            <section className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-secondary/45 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">基础参数</p>
                <p className="mt-1 text-xs leading-5 text-text-dim">生成大纲时会按这个篇幅控制节奏。</p>
              </div>

              <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                <label htmlFor="wizard-chapters" className="text-[11px] font-black uppercase tracking-[0.16em] text-text-muted">
                  目标章数
                </label>
                <div className="grid h-9 grid-cols-[34px_72px_34px] overflow-hidden rounded-lg border border-border-subtle bg-white shadow-inner">
                  <button
                    type="button"
                    aria-label="减少目标章数"
                    className="grid place-items-center text-text-dim transition hover:bg-secondary hover:text-text-primary disabled:opacity-30"
                    disabled={chapters <= 8}
                    onClick={() => adjustChapters(-1)}
                  >
                    <IconMinus />
                  </button>
                  <input
                    id="wizard-chapters"
                    type="number"
                    min={8}
                    max={80}
                    className="min-w-0 border-x border-border-subtle bg-transparent text-center font-serif text-xl leading-none tracking-normal text-text-primary focus:outline-none"
                    value={chapters}
                    onChange={(e) => updateChapters(e.target.value)}
                  />
                  <button
                    type="button"
                    aria-label="增加目标章数"
                    className="grid place-items-center text-text-dim transition hover:bg-secondary hover:text-text-primary disabled:opacity-30"
                    disabled={chapters >= 80}
                    onClick={() => adjustChapters(1)}
                  >
                    <IconPlus />
                  </button>
                </div>
              </div>
            </section>

            <section className="grid gap-3">
              <FieldLabel label="作品类型" />
              <div className="rounded-xl border border-border-subtle bg-secondary/55 p-1.5 shadow-inner">
                <div className="grid grid-cols-2 gap-1.5 md:grid-cols-5">
                  {genres.map((genre) => {
                    const selected = genreMain === genre.value;
                    return (
                      <button
                        key={genre.value}
                        type="button"
                        className={`min-h-12 rounded-lg px-3 py-2 text-left transition duration-300 ${
                          selected
                            ? "bg-white text-text-primary shadow-sm ring-1 ring-accent/20"
                            : "text-text-muted hover:bg-white/70 hover:text-text-primary"
                        }`}
                        onClick={() => selectGenre(genre.value)}
                      >
                        <span className="block truncate text-sm font-black">{genre.label}</span>
                        <span className="mt-0.5 block truncate text-[10px] font-bold tracking-[0.06em] opacity-60">
                          {genre.short}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-white/70 px-4 py-3 md:flex-row md:items-center md:justify-between">
                <p className="text-sm leading-6 text-text-secondary">{currentGenre.description}</p>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  {currentGenre.tags.map((tag) => (
                    <button
                      key={`genre-hint-${tag}`}
                      type="button"
                      className="inline-flex h-7 items-center rounded-full border border-accent/15 bg-accent-soft px-2.5 text-[11px] font-black text-accent transition hover:border-accent/35"
                      onClick={() => addTag(tag)}
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid gap-3">
              <FieldLabel label="细分题材 / 风格标签" hint="点击删除，回车添加" />
              <div className="rounded-xl border border-border-subtle bg-white/70 p-3">
                <div className="flex min-h-9 flex-wrap content-start gap-2">
                  {tags.map((tag, index) => (
                    <button
                      key={`${tag}-${index}`}
                      type="button"
                      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border-subtle bg-secondary/65 px-3 text-xs font-black text-text-secondary transition hover:border-red-200 hover:bg-red-50 hover:text-red-500"
                      onClick={() => removeTag(index)}
                    >
                      <span className="text-accent/45">#</span>
                      {tag}
                      <IconX />
                    </button>
                  ))}
                </div>
                <input
                  id="wizard-genre-sub"
                  autoComplete="off"
                  className="mt-3 h-10 w-full rounded-lg border border-border-subtle bg-secondary/45 px-3 text-sm font-semibold text-text-primary transition placeholder:text-text-dim/45 focus:border-accent/35 focus:bg-white focus:outline-none"
                  placeholder="自定义题材，例如：古卷谜案"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                />
              </div>
            </section>

            <section className="grid gap-2.5">
              <FieldLabel label="一句话灵感" hint="建议 60-120 字" htmlFor="wizard-logline" />
              <textarea
                id="wizard-logline"
                name="logline"
                maxLength={200}
                className="min-h-28 w-full resize-y rounded-lg border border-border-subtle bg-white/75 px-4 py-3 font-serif text-[17px] leading-8 tracking-normal text-text-primary shadow-inner transition placeholder:text-text-dim/35 focus:border-accent/40 focus:bg-white focus:outline-none"
                placeholder="例如：少年在火房中觉醒上古剑魂，发现十二仙门都藏着母亲死亡的证词。"
                value={logline}
                onChange={(e) => updateLogline(e.target.value)}
              />
              <p className="text-right text-[11px] font-bold text-text-dim">{logline.length}/200</p>
            </section>

            <section className="grid gap-2.5">
              <FieldLabel label="作品简介" hint="可由追问补齐" htmlFor="wizard-description" />
              <textarea
                id="wizard-description"
                name="description"
                maxLength={500}
                className="min-h-32 w-full resize-y rounded-lg border border-border-subtle bg-white/75 px-4 py-3 font-serif text-base leading-8 tracking-normal text-text-primary shadow-inner transition placeholder:text-text-dim/35 focus:border-accent/40 focus:bg-white focus:outline-none"
                placeholder="简要介绍主角、主要冲突与阅读期待。"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <p className="text-right text-[11px] font-bold text-text-dim">{description.length}/500</p>
            </section>
          </div>

          <footer className="flex flex-col gap-4 border-t border-border-subtle pt-5 md:flex-row md:items-center md:justify-between">
            <p className="max-w-xl text-sm leading-7 text-text-muted">
              <strong className="text-text-primary">下一步：</strong>
              采纳灵感或完成追问后，进入设定与大纲生成。
            </p>
            <PrimaryButton busy={store.status === "loading"} onClick={submit}>
              使用灵感并继续
              <IconArrow />
            </PrimaryButton>
          </footer>
        </div>
      </article>

      <aside className="min-w-0 lg:sticky lg:top-5">
        <div className="flex max-h-none flex-col overflow-hidden rounded-xl border border-border-subtle bg-white/85 shadow-[0_14px_40px_rgba(36,31,24,0.055)] backdrop-blur lg:max-h-[calc(100vh-7rem)]">
          <header className="border-b border-border-subtle bg-secondary/55 p-4">
            <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] text-accent">
              <span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_0_6px_rgba(99,102,241,0.12)]" />
              AI 灵感助手
            </div>
            <h2 className="mt-2 font-serif text-xl font-normal tracking-normal text-text-primary">
              建议与追问
            </h2>
            <p className="mt-1 text-xs leading-6 text-text-muted">{pack.tone}</p>
          </header>

          <div className="grid grid-cols-2 gap-2 border-b border-border-subtle bg-secondary/50 p-2.5">
            <TabButton active={assistantTab === "ideas"} onClick={() => setAssistantTab("ideas")}>
              灵感建议
            </TabButton>
            <TabButton active={assistantTab === "questions"} onClick={() => setAssistantTab("questions")}>
              AI 追问
            </TabButton>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3.5 custom-scrollbar">
            {assistantTab === "ideas" ? (
              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-secondary/45 px-3 py-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-text-muted">
                      {!canGenerateIdeas ? "等待输入" : ideasSource === "fallback" ? "示例兜底" : "AI 实时灵感"}
                    </p>
                    <p className="mt-1 truncate text-xs font-bold text-text-dim">
                      {!canGenerateIdeas ? "等待标题、题材和灵感" : ideasSource === "ai" ? "已生成 5 条" : "基于当前灵感生成"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-text-primary bg-text-primary px-3 text-[11px] font-black text-white transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={ideaStatus === "loading" || !canGenerateIdeas}
                    onClick={() => generateLoglines()}
                  >
                    {ideaStatus === "loading" ? "生成中" : displayedIdeas.length > 0 ? "换一批" : "生成"}
                  </button>
                </div>

                {assistantError ? (
                  <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-900">
                    {assistantError}
                  </p>
                ) : null}

                {ideaStatus === "loading" ? (
                  <LoadingStack />
                ) : displayedIdeas.length > 0 ? (
                  displayedIdeas.map((idea, index) => (
                    <button
                      key={`${idea.logline}-${index}`}
                      type="button"
                      className={`grid gap-2.5 rounded-lg border p-3.5 text-left transition duration-300 ${
                        index === 0
                          ? "border-accent/25 bg-accent-soft"
                          : "border-border-subtle bg-secondary/45 hover:border-accent/30 hover:bg-white"
                      }`}
                      onClick={() => applyIdea(idea)}
                    >
                      <span className="flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-[0.14em] text-text-muted">
                        {idea.label}
                        <span className="text-accent">{idea.badge}</span>
                      </span>
                      <strong className="font-serif text-lg font-normal tracking-normal text-text-primary">
                        {idea.title}
                      </strong>
                      <span className="font-serif text-sm leading-7 tracking-normal text-text-secondary">
                        {idea.body}
                      </span>
                      <span className="inline-flex items-center gap-2 text-[11px] font-black text-accent">
                        采纳这条
                        <IconArrow />
                      </span>
                    </button>
                  ))
                ) : (
                  <EmptyAssistantState
                    title={canGenerateIdeas ? "正在准备灵感" : "先补齐标题、题材和一句话灵感"}
                    action={canGenerateIdeas ? "立即生成" : "等待输入"}
                    disabled={!canGenerateIdeas}
                    onClick={() => generateLoglines()}
                  />
                )}
              </div>
            ) : (
              <div className="grid gap-4">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-secondary/45 px-3 py-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-text-muted">
                      {!canGenerateIdeas ? "等待输入" : questionsSource === "fallback" ? "示例追问" : "AI 反向追问"}
                    </p>
                    <p className="mt-1 truncate text-xs font-bold text-text-dim">
                      {!canGenerateIdeas ? "等待标题、题材和灵感" : displayedQuestions.length > 0 ? `${displayedQuestions.length} 个问题` : "根据灵感生成"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-text-primary bg-text-primary px-3 text-[11px] font-black text-white transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-35"
                    disabled={questionStatus === "loading" || !canGenerateIdeas}
                    onClick={() => generateQuestions()}
                  >
                    {questionStatus === "loading" ? "生成中" : displayedQuestions.length > 0 ? "重生成" : "生成追问"}
                  </button>
                </div>

                {assistantError ? (
                  <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-900">
                    {assistantError}
                  </p>
                ) : null}

                {questionStatus === "loading" ? (
                  <LoadingStack />
                ) : displayedQuestions.length > 0 ? (
                  displayedQuestions.map((question, index) => (
                    <section key={question.key} className="border-b border-border-subtle pb-4 last:border-b-0">
                      <div className="mb-3 flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-[0.14em] text-text-muted">
                        <span>追问 {String(index + 1).padStart(2, "0")}</span>
                        <span>{question.type === "single" ? "单选" : "多选"}</span>
                      </div>
                      <p className="font-serif text-base leading-7 tracking-normal text-text-primary">
                        {question.question}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {question.options.map((option, optionIndex) => {
                          const selected = (answers[question.key] ?? []).includes(option);
                          const recommended = optionIndex === question.recommended_index;
                          return (
                            <button
                              key={option}
                              type="button"
                              className={`min-h-8 rounded-full border px-3 text-[12px] font-black transition ${
                                selected
                                  ? "border-[#6f8f7a]/40 bg-[#edf4ec] text-[#436147]"
                                  : recommended
                                    ? "border-accent/25 bg-accent-soft text-accent"
                                    : "border-border-subtle bg-white text-text-secondary hover:border-accent/30 hover:text-accent"
                              }`}
                              onClick={() => toggleAnswer(question, option)}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ))
                ) : (
                  <EmptyAssistantState
                    title={canGenerateIdeas ? "尚未生成追问" : "先补齐标题、题材和一句话灵感"}
                    action={canGenerateIdeas ? "立即生成" : "等待输入"}
                    disabled={!canGenerateIdeas}
                    onClick={() => generateQuestions()}
                  />
                )}

                <button
                  type="button"
                  className="mt-1 h-11 rounded-lg border border-text-primary bg-text-primary px-4 text-[12px] font-black text-white shadow-sm transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-35"
                  disabled={selectedAnswerDetails.length === 0}
                  onClick={writeAnswersToBrief}
                >
                  写入简介
                </button>
              </div>
            )}
          </div>

          <footer className="border-t border-border-subtle bg-secondary/55 p-4">
            <div className="mb-2 flex items-center justify-between text-[11px] font-black uppercase tracking-[0.12em] text-text-muted">
              <span>设定准备度</span>
              <span>{readiness}%</span>
            </div>
            <progress
              aria-label="设定准备度"
              className="wizard-readiness-progress"
              value={readiness}
              max={100}
            />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {readinessItems.map((item) => (
                <span
                  key={item.label}
                  className={`rounded-full border px-2 py-1 text-[10px] font-black ${
                    item.ready
                      ? "border-[#6f8f7a]/30 bg-[#edf4ec] text-[#436147]"
                      : "border-border-subtle bg-white/75 text-text-dim"
                  }`}
                >
                  {item.label}
                </span>
              ))}
            </div>
          </footer>
        </div>
      </aside>
    </section>
  );
}

function FieldLabel({
  label,
  hint,
  htmlFor,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="flex items-center justify-between gap-3 text-[11px] font-black uppercase tracking-[0.18em] text-text-muted">
      <span>{label}</span>
      {hint ? <small className="text-[10px] font-bold tracking-[0.08em] text-text-dim">{hint}</small> : null}
    </label>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`h-9 rounded-lg text-[12px] font-black transition ${
        active ? "bg-white text-text-primary shadow-sm" : "text-text-muted hover:bg-white/65 hover:text-text-primary"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function PrimaryButton({
  busy,
  onClick,
  children,
}: {
  busy?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-text-primary px-6 text-[12px] font-black text-white shadow-[0_12px_34px_rgba(17,17,15,0.14)] transition hover:bg-accent active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 md:w-auto"
      onClick={onClick}
    >
      {busy ? (
        <>
          <span className="h-4 w-4 rounded-full border-2 border-white/25 border-t-white animate-spin" />
          正在处理
        </>
      ) : (
        children
      )}
    </button>
  );
}

function LoadingStack() {
  return (
    <div className="grid gap-3">
      {[0, 1, 2].map((item) => (
        <div key={item} className="rounded-lg border border-border-subtle bg-white/65 p-3.5">
          <div className="h-3 w-24 animate-pulse rounded-full bg-border-subtle" />
          <div className="mt-4 h-5 w-4/5 animate-pulse rounded-full bg-border-subtle" />
          <div className="mt-3 h-3 w-full animate-pulse rounded-full bg-border-subtle" />
        </div>
      ))}
    </div>
  );
}

function EmptyAssistantState({
  title,
  action,
  disabled,
  onClick,
}: {
  title: string;
  action: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="grid place-items-center gap-3 rounded-lg border border-dashed border-border-strong bg-secondary/35 px-4 py-8 text-center">
      <p className="font-serif text-lg leading-7 tracking-normal text-text-secondary">{title}</p>
      <button
        type="button"
        className="inline-flex h-9 items-center justify-center rounded-lg border border-text-primary bg-white px-3 text-[11px] font-black text-text-primary transition hover:bg-text-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
        disabled={disabled}
        onClick={() => onClick()}
      >
        {action}
      </button>
    </div>
  );
}

function mergeUnique(current: string[], additions: string[]) {
  const seen = new Set(current);
  const next = [...current];
  for (const item of additions) {
    const clean = item.trim().replace(/^#+/, "");
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    next.push(clean);
  }
  return next;
}

function appendNotes(current: string, notes: string[]) {
  const clean = notes.filter((note) => note && !current.includes(note));
  if (clean.length === 0) return current;
  const prefix = current.trim() ? `${current.trim()}\n\n` : "";
  return `${prefix}${clean.join(" ")}`;
}

function buildIdeaCards(
  loglines: string[],
  fallbackIdeas: AssistantIdea[],
  source: AssistantSource,
): DisplayIdea[] {
  return loglines.map((logline, index) => {
    const fallbackIdea = source === "fallback" ? fallbackIdeas[index] : undefined;
    return {
      label: source === "fallback" ? `示例 ${String(index + 1).padStart(2, "0")}` : `AI 推荐 ${String(index + 1).padStart(2, "0")}`,
      badge: source === "fallback" ? "兜底" : "实时生成",
      title: fallbackIdea?.title ?? ideaTitle(logline, index),
      body: source === "fallback" && fallbackIdea ? fallbackIdea.body : logline,
      logline,
      description: fallbackIdea?.description,
      tags: fallbackIdea?.tags ?? [],
    };
  });
}

function ideaTitle(logline: string, index: number) {
  const head = logline.trim().split(/[，。！？,.!?]/)[0] ?? "";
  if (!head) return `方向 ${String(index + 1).padStart(2, "0")}`;
  return head.length > 16 ? `${head.slice(0, 16)}...` : head;
}

function buildFallbackQuestions(questions: AssistantQuestion[]): Question[] {
  return questions.map((question, index) => ({
    key: question.id,
    question: question.question,
    type: question.type,
    options: normalizeQuestionOptions(question.options.map((option) => option.label)),
    recommended_index: Math.min(index, 3),
  }));
}

function normalizeQuestionOptions(options: string[]) {
  const next = mergeUnique([], options);
  for (const option of ["暂不确定", "冲突更强", "情感更重", "节奏更快"]) {
    if (next.length >= 4) break;
    if (!next.includes(option)) next.push(option);
  }
  return next.slice(0, 4);
}

function buildQuestionAnswers(questions: Question[], answers: Record<string, string[]>) {
  return questions.reduce<Record<string, string | string[]>>((acc, question) => {
    const selected = answers[question.key]?.filter(Boolean) ?? [];
    if (selected.length === 0) return acc;
    acc[question.key] = question.type === "single" ? selected[0] : selected;
    return acc;
  }, {});
}

function normalizeStoredAnswers(answers?: Record<string, string | string[]>) {
  return Object.entries(answers ?? {}).reduce<Record<string, string[]>>((acc, [key, value]) => {
    acc[key] = Array.isArray(value) ? value : [value];
    return acc;
  }, {});
}

async function fetchJsonWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMessage: string,
): Promise<{ response: Response; json: { ok?: boolean; data?: Record<string, unknown>; error?: { message?: string } } }> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ASSISTANT_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const json = await response.json().catch(() => ({}));
    return { response, json };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(timeoutMessage);
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : "发生未知错误";
}

function IconReset() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M5.6 16A7.5 7.5 0 0 0 18.4 8M18.4 8A7.5 7.5 0 0 0 5.6 8" />
    </svg>
  );
}

function IconArrow() {
  return (
    <svg aria-hidden="true" className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0-4 4m4-4H3" />
    </svg>
  );
}

function IconX() {
  return (
    <svg aria-hidden="true" className="h-3 w-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function IconMinus() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeWidth={3} d="M5 12h14" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeWidth={3} d="M12 5v14M5 12h14" />
    </svg>
  );
}
