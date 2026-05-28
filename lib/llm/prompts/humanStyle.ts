export type AiWritingTraceCategory = "content" | "language" | "style" | "communication" | "filler";

export interface AiWritingTraceRule {
  id: string;
  category: AiWritingTraceCategory;
  label: string;
  promptHint: string;
  examples: string[];
  patterns: RegExp[];
  novelRelevant?: boolean;
}

export interface AiWritingTraceHit {
  id: string;
  category: AiWritingTraceCategory;
  label: string;
  count: number;
  examples: string[];
}

/**
 * Condensed, Chinese-fiction oriented version of the user's humanizer SKILL.
 * The original guide is based on Wikipedia "Signs of AI writing"; this table
 * keeps the 5-category / 29-pattern frame, but adapts detection examples to
 * generated novel prose instead of encyclopedic English articles.
 */
export const AI_WRITING_TRACE_RULES = [
  {
    id: "inflated_significance",
    category: "content",
    label: "空泛意义化/宏大化",
    promptHint: "删掉“标志着/象征着/真正的考验/命运齿轮”等大词，改成角色看得见、摸得着的后果。",
    examples: ["命运的齿轮", "真正的考验才刚刚开始", "这一刻"],
    patterns: [/命运的齿轮/g, /真正的(?:考验|战斗|风暴|秘密|真相)[，。]?才(?:刚刚)?开始/g, /这(?:一切|才)?只是(?:一个)?开始/g, /这一刻/g, /标志着|象征着|预示着|昭示着/g],
  },
  {
    id: "notability_padding",
    category: "content",
    label: "虚泛声量/众人皆知",
    promptHint: "不要用“所有人都知道/无数人传说”替代具体见闻；谁说的、在哪发生、造成什么动作要写清。",
    examples: ["无人知道", "世人皆知"],
    patterns: [/无人知道/g, /世人皆知|众所周知|无数人(?:都)?(?:知道|传说)/g],
  },
  {
    id: "superficial_analysis",
    category: "content",
    label: "表面分析腔",
    promptHint: "少写“映照/衬托/体现/彰显”；让物件和动作自己产生意味。",
    examples: ["映照着", "彰显了"],
    patterns: [/映照着|衬托出|体现了|彰显了|凸显了|升华了/g],
  },
  {
    id: "promotional_language",
    category: "content",
    label: "宣传腔形容词",
    promptHint: "少用宣传稿式夸饰；用温度、重量、声音、气味替代“恢弘/璀璨/传奇”。",
    examples: ["恢弘", "璀璨", "传奇"],
    patterns: [/恢弘|璀璨|壮阔|传奇|史诗般|震撼人心|波澜壮阔/g],
  },
  {
    id: "vague_attribution",
    category: "content",
    label: "模糊归因",
    promptHint: "“有人说/据说/传闻”如果不是剧情线索就删除；若是线索，给出说话人、场景或代价。",
    examples: ["据说", "有人说"],
    patterns: [/据说|传闻|有人说|听闻|坊间(?:传言|传闻)/g],
  },
  {
    id: "formulaic_challenge",
    category: "content",
    label: "模板化挑战/前路结尾",
    promptHint: "不用“更大的挑战还在后面”收尾；结尾落在新信息、新选择或具体危险上。",
    examples: ["更大的挑战", "风暴即将来临"],
    patterns: [/更大的(?:挑战|危机|风暴)/g, /风暴(?:即将|已经)?来临/g, /前路(?:依然|仍然)?(?:漫长|未知)/g],
  },
  {
    id: "ai_vocabulary",
    category: "language",
    label: "AI 高频词堆叠",
    promptHint: "限制“仿佛/似乎/缓缓/轻轻/不由得”等默认续写词；每个词必须有画面价值。",
    examples: ["仿佛", "缓缓", "不由得"],
    patterns: [/极其|几乎|仿佛|似乎|宛如|犹如|隐约|依稀|轻轻|缓缓|慢慢|悄悄|不约而同|不由得|与此同时|不知不觉|不禁|霎时|刹那|一时间/g],
  },
  {
    id: "copula_avoidance",
    category: "language",
    label: "绕开简单判断",
    promptHint: "少写“成为/作为/承载/代表”；中文小说里常常直接写“是/有/在”。",
    examples: ["承载着", "代表着"],
    patterns: [/承载着|代表着|成为了|作为一种|构成了/g],
  },
  {
    id: "negative_parallelism",
    category: "language",
    label: "不是 X 而是 Y",
    promptHint: "避免“不是...而是/不仅...更是”的工整鸡汤句，改成具体判断。",
    examples: ["不仅是", "更是"],
    patterns: [/不(?:仅|只)是.+?更是/g, /不是.+?而是/g, /不再是.+?而是/g],
  },
  {
    id: "rule_of_three",
    category: "language",
    label: "三连排比",
    promptHint: "不要把动作、情绪、意义硬凑三项；保留最有用的一两项，句式打散。",
    examples: ["既...又...还"],
    patterns: [/既.+?又.+?还/g, /不但.+?而且.+?还/g, /[，。；][^，。；]{1,16}、[^，。；]{1,16}、[^，。；]{1,16}/g],
  },
  {
    id: "synonym_cycling",
    category: "language",
    label: "同义词轮换",
    promptHint: "不要为了避重复频繁改称呼；主角该叫名字就叫名字，该省主语就省主语。",
    examples: ["少年/青年/主角/他"],
    patterns: [/少年.+?青年.+?主角/g, /主角.+?少年.+?青年/g],
  },
  {
    id: "false_range",
    category: "language",
    label: "虚假范围句",
    promptHint: "少写“从 X 到 Y”；除非 X/Y 真有时间、空间或程度递进。",
    examples: ["从...到..."],
    patterns: [/从[^。！？]{2,24}到[^。！？]{2,24}，?从[^。！？]{2,24}到/g],
  },
  {
    id: "passive_or_subjectless",
    category: "language",
    label: "无主体抽象句",
    promptHint: "少写“局势发生变化/事情开始展开”；让某个人做出动作。",
    examples: ["发生了变化", "展开了"],
    patterns: [/发生了变化|局势(?:开始)?变化|事情(?:开始)?展开|矛盾(?:逐渐)?升级/g],
  },
  {
    id: "dash_overuse",
    category: "style",
    label: "破折号痕迹",
    promptHint: "不要用破折号制造 AI 式解释和转折；改成句号、逗号、冒号或动作停顿。",
    examples: ["--", "—"],
    patterns: [/[—–]|--/g],
  },
  {
    id: "bold_markdown",
    category: "style",
    label: "Markdown 粗体",
    promptHint: "小说正文不得出现 Markdown 强调。",
    examples: ["**重点**"],
    patterns: [/\*\*[^*]+\*\*/g],
  },
  {
    id: "inline_header_list",
    category: "style",
    label: "列表/小标题腔",
    promptHint: "小说正文不要写成分点清单或“关键词：解释”。",
    examples: ["- **冲突：**"],
    patterns: [/^\s*[-*]\s*(?:\*\*)?[^：:]{1,18}(?:\*\*)?[：:]/gm],
  },
  {
    id: "title_case_heading",
    category: "style",
    label: "标题格式痕迹",
    promptHint: "整章正文只输出正文，不要 Markdown 标题或教程式小标题。",
    examples: ["## Next Steps"],
    patterns: [/^#{1,6}\s+\S+/gm],
  },
  {
    id: "emoji_decoration",
    category: "style",
    label: "emoji 装饰",
    promptHint: "小说正文不得用 emoji 装饰。",
    examples: ["✅", "🔥"],
    patterns: [/\p{Extended_Pictographic}/gu],
  },
  {
    id: "quote_style_false_positive",
    category: "style",
    label: "引号误判豁免",
    promptHint: "中文小说保留中文弯引号；不要照搬英文 straight quote 规则。",
    examples: ["“对白”"],
    patterns: [],
    novelRelevant: false,
  },
  {
    id: "chatbot_artifact",
    category: "communication",
    label: "聊天机器人话术",
    promptHint: "正文不得出现“当然/希望有帮助/下面是”等助手话术。",
    examples: ["希望这有帮助", "下面是"],
    patterns: [/希望这(?:对你)?有帮助|当然可以|下面是|以下是|如需|如果你愿意|让我们来/g],
  },
  {
    id: "knowledge_cutoff",
    category: "communication",
    label: "知识截止/信息不足免责声明",
    promptHint: "小说正文不写“截至/基于现有信息/作为 AI”；缺信息就用剧情动作补，不写免责声明。",
    examples: ["作为AI", "截至"],
    patterns: [/作为(?:一个)?AI|截至(?:目前|我所知)|基于现有信息|训练数据|公开资料有限/g],
  },
  {
    id: "sycophantic_tone",
    category: "communication",
    label: "迎合式开场",
    promptHint: "删掉“你说得对/好问题”这类聊天回应。",
    examples: ["你说得对", "好问题"],
    patterns: [/你说得对|好问题|很棒的问题|完全正确/g],
  },
  {
    id: "filler_phrase",
    category: "filler",
    label: "废话短语",
    promptHint: "删掉“值得一提/需要注意/毫无疑问”等垫话。",
    examples: ["值得一提的是", "需要注意的是"],
    patterns: [/值得一提的是|需要注意的是|毫无疑问|不可否认|在某种程度上|从某种意义上说/g],
  },
  {
    id: "excessive_hedging",
    category: "filler",
    label: "过度委婉",
    promptHint: "不要把判断写成“似乎可能也许”；保留角色不确定性，但别连环套。",
    examples: ["似乎可能", "也许大概"],
    patterns: [/(?:似乎|可能|也许|大概|仿佛).{0,8}(?:似乎|可能|也许|大概|仿佛)/g],
  },
  {
    id: "generic_positive_conclusion",
    category: "filler",
    label: "空洞正面结论",
    promptHint: "结尾不要总结光明未来；给读者一个具体未完成动作或危险。",
    examples: ["未来可期", "前途光明"],
    patterns: [/未来可期|前途光明|一切都会好起来|新的篇章(?:即将)?开启/g],
  },
  {
    id: "hyphen_pair_overuse",
    category: "filler",
    label: "英文复合词痕迹",
    promptHint: "中文小说正文避免 mixed-English 复合词堆叠。",
    examples: ["data-driven", "end-to-end"],
    patterns: [/\b(?:data-driven|end-to-end|long-term|real-time|high-quality|cross-functional)\b/gi],
  },
  {
    id: "authority_trope",
    category: "filler",
    label: "故作深刻框架句",
    promptHint: "删掉“真正的问题/本质上/归根结底”；直接写角色眼下的问题。",
    examples: ["真正的问题是", "本质上"],
    patterns: [/真正的问题是|本质上|归根结底|说到底|核心在于|关键在于/g],
  },
  {
    id: "signposting",
    category: "filler",
    label: "教程式路标",
    promptHint: "不宣布“接下来/让我们/现在开始”；直接进入场面。",
    examples: ["让我们", "接下来"],
    patterns: [/让我们|接下来(?:我们)?|现在(?:让我们)?开始|首先[，,：:]|其次[，,：:]|最后[，,：:](?:我们|来看|需要|总结|说明)/g],
  },
  {
    id: "fragmented_header",
    category: "filler",
    label: "标题后暖场废句",
    promptHint: "正文不要有标题加一句空泛暖场。",
    examples: ["## 冲突\n冲突很重要。"],
    patterns: [/^#{1,6}.+\n\n?.{2,18}[。.!]$/gm],
  },
] satisfies readonly AiWritingTraceRule[];

export const HUMANIZER_SKILL_TRACE_GUIDE = `去 AI 味检查清单（已按用户提供的 humanizer SKILL 接入，来源是 Wikipedia "Signs of AI writing" 的 5 类 29 种痕迹）：
- 内容模式：删空泛意义化、虚泛归因、宣传腔、模板化挑战和“命运的齿轮/风暴/真正开始”式悬念。
- 语言语法：草稿完成后二次替换 AI 高频词，尤其“慢慢/似乎/仿佛/缓缓/轻轻/不由得”；打散“不仅是更是”、三连排比、同义词轮换和“从 X 到 Y”假范围。
- 风格模式：正文不出现 Markdown 标题、粗体、列表、emoji、教程格式；旁白禁止用破折号，解释和转折改成句号、逗号、冒号或具体动作。
- 沟通模式：绝不出现“当然可以/下面是/希望有帮助/作为 AI/截至我所知”等聊天机器人痕迹。
- 填充兜底：删“值得一提/需要注意/本质上/归根结底/未来可期”等垫话，结尾落到具体动作、发现、危险或选择。
- 中文小说特例：中文弯引号是正常对白格式，不按英文引号规则扣分；不要为了去 AI 味把小说改成说明文。`;

export const HUMANIZE_OPERATION_GUIDE = `${HUMANIZER_SKILL_TRACE_GUIDE}

局部改写流程：先在内部找出命中的 AI 痕迹，再重写为更像作者手稿的片段。保留剧情事实、人物动作、视角、信息量和前后文衔接；只修掉 AI 痕迹和模式化表达。`;

/**
 * Anti-AI-signature directive injected into the writer / reviser system
 * prompts. Keep it compact: long rule dumps dilute the actual story brief.
 */
export const HUMAN_STYLE_DIRECTIVE = `人工写作质感要求：

${HUMANIZER_SKILL_TRACE_GUIDE}

小说正文执行标准：
1. 长短句交错，但不要机械地每段都塞短句；短句用于受惊、停顿、反应，长句用于动作连续或环境压迫。
2. 每个自然段尽量只有一个叙事重心。段落长度可以不均，一句一段可以有，七八句一段也可以有。
3. 情绪优先写身体反应、动作、物件和环境，不要频繁直写“他感到”“他心中涌起”。每 600 字至少给一次可感知细节：手、喉咙、汗、泥、水、气味、重量、声音、温度或疼痛。
4. 对话要贴角色身份：允许停顿、省略、重复、改口、打断、口头禅和不完整句。每章至少有一处对白推动局势，而不是只解释设定。
5. 中文承接句可以省主语，把“他走过去，他拉开门，他看见”改成“走过去，拉开门，看见”。
6. 禁止工整三段排比和鸡汤式结尾。不要用“命运的齿轮”“真正的考验才刚刚开始”“无人知道”“这一刻”收束章节。
7. 写完草稿后做一轮删词：把仿佛、似乎、宛如、犹如、隐约、依稀、轻轻、缓缓、慢慢、悄悄、不由得、与此同时、一时间尽量删掉或改成具体动作。全文合计不超过 3 次。
8. 心理活动可以直接成句或成段，不要总写“他想道”“他心想”。
9. 旁白禁止破折号。若角色被打断，对白里最多保留 1 处破折号；旁白解释、补充、转折全部改成短句或动作。
10. 保留一点手稿感：动作可以断，话可以没说完，人物可以误判，但因果必须清楚。
11. 正文里至少留下两处自然的因果/代价句，能让读者读懂“他为什么这么做”和“这么做换来了什么”。不要写成提纲句；写成角色当下的判断，例如“他没有扔掉木牌。扔掉太干净，孙奉会知道他已经看懂了。”
12. 结尾必须落在具体动作、物件变化、关系反应、位置变化或新危险上，不要抽象总结“局势改变/新的篇章/真正开始”。
13. 只输出小说正文，不输出检查过程。`;

export const WRITER_SELF_REVISION_DIRECTIVE = `输出前自检并改稿（内部执行，不要输出过程）：
1. 扫描全文，把旁白里的破折号全部改成句号、逗号、冒号或动作停顿；对白破折号最多留 1 处。
2. 扫描 AI 高频词：慢慢、似乎、仿佛、缓缓、轻轻、不由得、隐约、依稀、与此同时、一时间。能删就删，能换成动作就换成动作，全文合计不超过 3 次。
3. 扫描抽象情绪：他感到、心中涌起、难以言喻、无法形容。改成身体反应、触感、声音、气味、物件变化。
4. 扫描 Markdown 痕迹：删除 **粗体**、# 标题、列表符号和“接下来/下面是/以下是”等教程路标；小说正文不得出现这些格式或话术。
5. 扫描对白：每章至少留一处打断、改口、省略或短促回应，让对话像人在互相试探，不要全是完整解释句。
6. 扫描身体/物件动作：每 500 字至少有一次手、喉咙、汗、泥、水、伤口、衣角、兵器、木牌、门闩、灯火等可触物推动场面。
7. 扫描因果链：正文至少保留两处因为、为了、否则、于是、但、却、只要、既然、如果等因果/转折/代价句，解释关键行动和结果；不要堆“因为所以”，要落在具体选择上。
8. 扫描结尾：不得用“真正开始/风暴/命运/无人知道/这一刻”等空泛悬念；结尾必须留下一个具体可追踪变化。`;

export function collectAiWritingTraceHits(text: string): AiWritingTraceHit[] {
  return AI_WRITING_TRACE_RULES.map((rule) => {
    const examples: string[] = [];
    let count = 0;
    for (const pattern of rule.patterns) {
      const regex = cloneGlobal(pattern);
      for (const match of text.matchAll(regex)) {
        count += 1;
        if (examples.length < 3 && match[0]) {
          examples.push(compactTraceExample(match[0]));
        }
      }
    }
    return {
      id: rule.id,
      category: rule.category,
      label: rule.label,
      count,
      examples: [...new Set(examples)],
    };
  })
    .filter((hit) => hit.count > 0)
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function cloneGlobal(pattern: RegExp): RegExp {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return new RegExp(pattern.source, flags);
}

function compactTraceExample(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 24);
}
