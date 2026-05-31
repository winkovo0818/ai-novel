# CLI 设计方案：一键全自动生成 + 实时终端面板

> 状态：方案阶段（待确认后开工）
> 日期：2026-05-31
> 参考：Claude Code / Codex CLI 的终端交互体验

---

## 一、使用体验目标

用户一行命令启动后，终端变成一个**实时仪表盘**，展示生成全程的一切信息，直到跑完或挂起。

```
$ npm run auto:new -- --theme "玄幻" --logline "少年觉醒上古剑魂" --chapters 40

  逆魂纪 · 全自动生成引擎

  大纲规划中...                           0.003 元

  ┌ 目录 ───────────────────────────────┐
  │ ● 全部  ○ 大纲  ○ 角色  ○ 用量  ○ 日志 │
  └────────────────────────────────────┘

  ████████████░░░░░░░░  12/40 章 (30%)
  当前: 第 12 章《外宗来使》

  沈言站在柴门断剑的废墟前，望着远处天代宗使者的旗帜。
  他的手不自觉地握紧了剑柄。几残魂的声音在脑海回荡——
  "那不是我欠他们的，是他们欠我的。"
  …

  ─────────────────────────────────────────
  文笔 8/10  ·  连贯 9/10  ·  AI腔 8/10
  已花费 ¥0.34  ·  模型 mimo-v2.5-pro  ·  耗时 12m 34s
  ─────────────────────────────────────────

  按键: (p)暂停  (c)取消  (v)切换视图  (q)退出
```

## 二、视图系统（4 个面板，Tab 切换）

### 2.1 全部（默认主视图）

| 区域 | 内容 |
|---|---|
| 顶栏 | 书名 + 状态标签 + 总成本 |
| 进度条 | `████░░░░ 12/40 章 (30%)` |
| **实时输出** | 当前正在写的章节名 + 流式正文（每 2 秒刷新最近 300 字） |
| 质量栏 | 最近 3 章的滑动评分（折百 + 各维度） |
| 底栏 | 模型名 / 耗时 / 热键 |

### 2.2 大纲

滚动显示全部章节的大纲（从 bible.outline 读取），每章标注状态：
- ✅ done（已生成）
- 🔄 generating（正在写）
- ⏳ pending（排队中）

```
  📖 叙事大纲 · 40 章

  ✅ 01  雨夜火房          沈言在火房受罚，听见剑魂低语
  ✅ 02  黑牌入手           执事逼沈言参加考核
  ✅ 03  裂井剑鸣           沈言进入后山裂井，与残魂合作
  …
  🔄 12  外宗来使           天代宗使者到访，沈言面临抉择       ← 正在生成
  ⏳ 13  假意投诚           沈言表面归顺，暗中布局
  ⏳ 14  天代宗试炼         入门考核开始
  …
```

### 2.3 角色

从 bible.characters 读取，以卡片/列表展示：

```
  👤 角色图谱 · 8 位

  沈言 (主角)  — 20岁，柴门弟子，上古剑魂宿主
  几  (导师)   — 上古残魂，藏于裂井，本性未明
  蒋阶 (反派)  — 柴门门主，沈言灭门案的关键人物
  林玥 (配角)  — 天代宗内应，与沈言有旧缘
  …
```

### 2.4 用量

实时累计成本 + 每章明细：

```
  💰 用量明细

  累计: ¥0.34 / 上限 ¥5.00

  章节        起草      审校      修订      状态差分   小计
  ──────────────────────────────────────────────────
  01 雨夜    0.013     0.009     —         0.004     0.026
  02 黑牌    0.013     0.008     —         0.005     0.026
  …
  12 外宗    0.015     0.010     0.013     0.011     0.049 ← 当前

  日均: ¥0.34    预估剩余: ¥1.00
```

## 三、技术方案

### 3.1 选型：为什么用 Ink

| 方案 | 优缺点 |
|---|---|
| **Ink** (React for CLI) | ✅ 组件化、状态管理熟；✅ 社区活跃；✅ 内置 Flexbox 布局；❌ 需额外依赖 |
| Blessed | ❌ 年久失修、回调式 API |
| 纯 console.log + ansi | ❌ 无状态管理、难做复杂布局 |

**结论：Ink。** 与 React 生态无缝衔接，组件化开发终端 UI。依赖 `ink` + `ink-spinner`。

### 3.2 存储：纯文件，零数据库

**零依赖启动**：不需要 Docker、PostgreSQL、Prisma。所有数据存为本地文件。

```
./output/逆魂纪/
├── novel.json              # { title, theme, logline, created_at, status }
├── bible.json              # { characters, world, story_state }
├── outline.json            # [{ index, title, summary }] — 大纲
├── progress.json           # { current, total, cost, status } — 实时进度
├── quality.json            # [{ chapter, score, dimensions }] — 质量轨迹
├── usage.json              # [{ chapter, draftCost, criticCost, ... }] — 用量明细
├── chapters/
│   ├── 01-雨夜火房.md
│   ├── 02-黑牌入手.md
│   └── ...
└── .run.lock               # 防止同目录并发跑
```

**为什么跳过 DB？**
- CLI 是单用户单进程，文件系统天然串行，无竞争
- 生成的小说是 Markdown，用户可以直接打开阅读/编辑
- 文件夹就是一个完整的项目，zip 即可分享
- Prisma + PostgreSQL + Docker 对 CLI 场景是过度工程

### 3.3 架构：复用核心流水线，绕过 Prisma

Web 应用的 `lib/agent/chapterPipeline.ts` 本身**不依赖 DB**——它只做 LLM 调用（起草→审校→修订）+ 清洗。DB 操作都在外层的 handler 里。

CLI 绕过 handler，直接调用流水线，然后写文件：

```
cli-config.toml ──→ LLM 配置
       │
       ▼
  ┌──────────────────────────────────────────┐
  │  auto:new CLI                             │
  │                                            │
  │  ① 读配置 + 用户参数                       │
  │  ② LLM 生成 bible.json + outline.json     │
  │  ③ 循环逐章:                               │
  │     pipeline(上下文, bible, 章号)           │
  │     → 写 chapters/NN-标题.md               │
  │     → 更新 progress.json                   │
  │     → 跑质量门（纯启发式，零 token）        │
  │     → 更新 quality.json                    │
  │  ④ 完成后自动导出（可选）                   │
  │                                            │
  │  Ink 面板 ← 每 2s 读文件刷新               │
  └──────────────────────────────────────────┘
```

**复用清单**（不改 Web 应用代码，只 import）：

| 复用 | 来源 |
|---|---|
| `runChapterPipeline` (起草→审校→修订) | `lib/agent/chapterPipeline.ts` |
| `cleanupWriterOutputWithReport` | `lib/llm/writerOutputCleanup.ts` |
| `chatCompletionWithRetry` | `lib/llm/client.ts` |
| `buildChapterPrompt` / `buildCriticPrompt` / `buildRevisionPrompt` | `lib/llm/prompts/` |
| `evaluateNovelQuality` (质量门，零 token) | `lib/evals/novelQuality.ts` |
| `extractFirstJsonObject` | `lib/llm/extractJson.ts` |
| `NovelProfileSchema` / `BibleDraftSchema` | `lib/validation/schemas.ts` |

**不复用的**（Web 应用专用，CLI 不需要）：
- Prisma ORM（`lib/db.ts`）
- BackgroundJob / job queue（`lib/jobs/`）
- GenerationRun 状态机（`lib/agent/generationRun.ts`）— 用 `progress.json` 替代
- RAG retrieval（`lib/agent/retrieval.ts`）— CLI 不检索历史记忆
- API routes / Next.js — CLI 是纯 Node 脚本 无需浏览器、无需远程服务器、无需手动配置 `.env`。

### 3.4 cli-config.toml 格式

```toml
[llm]
provider = "deepseek"           # deepseek | openai | custom
model = "deepseek-chat"         # 或 mimo-v2.5-pro 等
base_url = "https://api.deepseek.com/v1"
api_key = "sk-xxxxxxxxxxxxxxxx"
max_tokens = 4096
temperature = 0.8

[generation]
default_chapters = 40
quality_floor = 85
revision_rounds = 2
cost_cap_cny = 5.0
target_words_per_chapter = 3000   # 可选

[output]
export_dir = "./output"           # 完成后自动导出 markdown
auto_export = true
```

首次运行如无此文件，CLI 交互式引导填写（类似 `npm init`）。

### 3.5 新增文件清单

| 文件 | 说明 | 行数估 |
|---|---|---|
| `cli-config.toml` | 模型 + 生成参数配置模板 | ~15 |
| `scripts/auto-new.ts` | CLI 入口：参数解析 → 启动流程 → 渲染面板 | ~80 |
| `scripts/cli/config.ts` | 读取/校验 cli-config.toml | ~30 |
| `scripts/cli/storage.ts` | 文件读写：novel/bible/outline/progress/chapters 的 load/save | ~80 |
| `scripts/cli/generator.ts` | 核心循环：逐章调 pipeline → 写文件 → 质量评分 → 更新进度 | ~100 |
| `scripts/cli/bootstrap.ts` | 启动流程：LLM 生成 bible + outline（首次），或从已有文件加载 | ~50 |
| `scripts/cli/panels/MainPanel.tsx` | 默认视图：进度 + 实时正文 + 质量 + 热键 | ~120 |
| `scripts/cli/panels/OutlinePanel.tsx` | 大纲视图：章节列表 + 状态标记 | ~50 |
| `scripts/cli/panels/CharactersPanel.tsx` | 角色视图：角色卡片 | ~30 |
| `scripts/cli/panels/UsagePanel.tsx` | 用量视图：累计成本 + 每章明细 | ~50 |
| `scripts/cli/Poller.ts` | 轮询器：每 2s 读文件刷新面板数据 | ~40 |
| `scripts/cli/hotkeys.ts` | 热键处理：p/c/v/q + 退出确认 | ~30 |
| `scripts/cli/types.ts` | 共享类型 | ~15 |
| **新增依赖** | `ink` `ink-spinner` `@iarna/toml` | 3 个（均 < 100KB） |

**总计 ~690 行新代码 + 3 个轻量依赖。零数据库、零 Docker。**

### 3.7 存储文件结构

```
./output/逆魂纪/
├── novel.json              # { title, theme, logline, created_at, status }
├── bible.json              # { characters, world, story_state }
├── outline.json            # [{ index, title, summary }]
├── progress.json           # { current, total, cost, status }
├── quality.json            # [{ chapter, score, dimensions }]
├── usage.json              # [{ chapter, draftCost, criticCost, ... }]
├── chapters/
│   ├── 01-雨夜火房.md
│   ├── 02-黑牌入手.md
│   └── ...
└── .run.lock               # 防止同目录并发跑
```

### 3.8 与 Web 应用的关系

| | Web 应用 | CLI `auto:new` |
|---|---|---|
| 存储 | PostgreSQL + Prisma | 本地 JSON + Markdown 文件 |
| 依赖 | 远程 DB + Docker | **零基础设施** |
| 流水线 | `runChapterPipeline` | 同左，直接 import |
| 大纲/角色/用量 | DB 表 | JSON 文件 |
| 实时面板 | Web UI（Next.js） | Ink 终端面板 |
| 可分享性 | 需导出 | 文件夹即项目，zip 即分享 |

---

## 四、分阶段交付

| 阶段 | 内容 | 工时估 |
|---|---|---|
| 1 | `cli-config.toml` + config loader + storage 文件读写层 | 1h |
| 2 | `bootstrap.ts`：LLM 生成 bible + outline → 写入文件 | 0.5h |
| 3 | `generator.ts`：逐章循环 → pipeline → 写 chapters/ → 更新 progress/quality/usage | 1h |
| 4 | Ink 框架搭建 + Poller + 4 面板（主/大纲/角色/用量）+ 热键 | 1.5h |
| 5 | 串联 + `--attach` + 边界状态（暂停/恢复/挂起）+ polish | 1h |

**总估 ~5h。零数据库、零 Docker、零 Prisma。**

---

## 五、命令速查

```bash
# 全新小说
npm run auto:new -- --theme "玄幻" --logline "少年觉醒上古剑魂" --chapters 40

# 简写
npm run auto:new -- -t 玄幻 -l "少年觉醒上古剑魂" -c 40

# 续写已有项目（从断点继续）
npm run auto:new -- --resume ./output/逆魂纪

# 首次运行：引导创建 cli-config.toml
npm run auto:new -- --setup
```

**输出位置**：默认 `./output/<书名>/`，可通过 `cli-config.toml` 的 `output.export_dir` 修改。完成后直接打开文件夹阅读，或 zip 分享。
