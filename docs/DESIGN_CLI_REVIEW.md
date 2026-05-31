# CLI 设计文档交叉审查

> 审查范围：`DESIGN_CLI.md` / `DESIGN_CLI_INTERACTIONS.md` / `DESIGN_CLI_COMMANDS.md` / `DESIGN_CLI_PROJECTS.md`
> 日期：2026-05-31

---

## 发现的 20 个问题

### 🔴 矛盾（必须修）

| # | 问题 | 位置 | 修复 |
|---|---|---|---|
| 1 | **热键不一致**：主 mockup `o 大纲  r 角色  u 用量`，但 COMMANDS 和 CLI 正文说 `1-4` | INTERACTIONS:113 vs COMMANDS:221 vs CLI:37 | 统一为数字键 `1-4`，修正 INTERACTIONS mockup |
| 2 | **主 mockup 有 5 个面板但实际只定义 4 个**：`○ 日志` 面板不存在 | CLI:21 | 删除"日志"，或改为第 4 面板"用量" |
| 3 | **`narrative_directives` 放哪里矛盾**：COMMANDS 说放 `progress.json`，PROJECTS 说放独立 `notes.json` | COMMANDS:124 vs PROJECTS | 统一：独立 `notes.json`，progress.json 保持整洁 |
| 4 | **`cli-config.toml` 多模型格式不一致**：CLI 只写了单模型 `[llm]`，COMMANDS 写了多模型 `[llm.default]` + `[llm.models.*]` | CLI:192-196 vs COMMANDS:193-210 | CLI 文档更新为多模型格式 |
| 5 | **novel.json vs progress.json 字段重叠**：`title` 在两处都出现 | CLI:125,128 vs INTERACTIONS:308 | `title` 只放 `novel.json`，`progress.json` 不加 title |
| 6 | **started_at 缺失**：`--resume` 流程需要知道何时开始以计算耗时 | PROGRESS 文件缺少 | 补到 `progress.json`（已完成） |

### 🟡 遗漏（补上即可）

| # | 问题 | 修复 |
|---|---|---|
| 7 | **generate 期间 `q` 退出无确认**：直接退出会丢进度 | 加确认："生成中，退出前会自动保存。确认退出? (y/n)" |
| 8 | **首个章节的 Bible 首次生成状态**：`progress.json` 的 status 在 bible 生成阶段应该是 `planning` | 增加 `planning` 状态，或明确 bible 生成属于"启动阶段"不计入 progress |
| 9 | **跳过章节的质量门怎么算**：如果 `/skip` 跳过 ch13-15，ch16 质量门的末 3 章窗口应该用 ch12+ch16 还是只算 ch16？ | 明确：质量门窗口只取最近 3 个**已生成**的章节（跳过不计） |
| 10 | **大纲面板缺"已跳过"状态**：只有 ✅🔄⏳，缺 ⏭ | 加 `⏭ skipped` |
| 11 | **`/skip to 15` 中间章标记**：跳过 ch13-15 后，它们的 `.md` 文件生成什么？ | 生成占位文件：`# 第13章 · (已跳过)`，内容为空 |
| 12 | **首页列表的交互**：无参数启动到首页后，键盘操作 `n/d/r` 未在 INTERACTIONS 中描述 | 补首页交互规格到 INTERACTIONS |
| 13 | **`--model` 参数优先级**：命令行 `-m` 和 cli-config.toml 中的 model 谁优先？ | 明确：CLI 参数 > toml > 默认值 |
| 14 | **`/pace fast` 时质量栏显示**：跳过 critic 时无评分，面板显示什么？ | 显示 `跳过审校` |

### 🟢 优化（建议但不阻塞）

| # | 问题 | 修复 |
|---|---|---|
| 15 | **usage.json 的 `state_diff_cost` 字段**：CLI 不调 Prisma，state-diff 走 pipeline 内的 LLM 调用而非 DB 写操作，成本已在 draft/critic/revise 中 | 确认 pipeline 确实会产生 state-diff LLM 调用成本，保留此字段 |
| 16 | **`/rewrite` 和 needs_review 的 `r` 键功能重叠** | needs_review 时 `r` 等同于 `/rewrite`，统一为 `/rewrite` |
| 17 | **成本上限触发时机**：应在本章开始前检查，而非本章完成后 | 明确：每章生成前检查 `cost + 预估本章成本 > cost_cap`，是则暂停 |
| 18 | **无法导入已有 bible**：如果用户已有角色和世界观设定，无指令导入 | 加 `/bible import <路径>` |
| 19 | **`~/.ai-novel/projects.json` 在不同机器上会丢失**：如果用户换电脑，项目索引没了 | 在 `./output/` 下也存一份 `.cli-projects.json`，优先读本地 |
| 20 | **章节文件名的非法字符处理**：只提了 `/` `:` 替换为 `-`，但 Windows 还有 `<>"|?*` | 补全非法字符列表，统一 `sanitizeFilename()` 函数 |

---

## 修复后的文件结构（统一版）

```
./output/逆魂纪/
├── novel.json              # { title, theme, logline, created_at }
├── bible.json              # { meta, characters, world }
├── outline.json            # [{ index, title, summary }]
├── progress.json           # { total, current, status, cost, cost_cap, model, started_at, last_chapter_at }
├── quality.json            # [{ chapter, score, dimensions }]
├── usage.json              # [{ chapter, title, draft_cost, critic_cost, revise_cost, state_diff_cost, total_cost }]
├── notes.json              # { ending?, plots: [], notes: [] }
├── chapters/
│   ├── 01-雨夜火房.md
│   └── ...
├── exports/                # 完成后生成
└── .run.lock

~/.ai-novel/
├── projects.json           # 全局索引（换机器可重建）
└── history                 # 指令历史
```

## 修复后的 `cli-config.toml` 格式

```toml
[llm]
provider = "deepseek"
model = "deepseek-chat"
base_url = "https://api.deepseek.com/v1"
api_key = "sk-xxx"
max_tokens = 4096
temperature = 0.8

# 可选：额外模型（/model switch 切换）
[llm.extra.reasoner]
provider = "deepseek"
model = "deepseek-reasoner"
base_url = "https://api.deepseek.com/v1"
api_key = "sk-xxx"

[llm.extra.fast]
provider = "custom"
model = "mimo-v2.5-pro"
base_url = "https://api.mimo.cn/v1"
api_key = "sk-yyy"

[generation]
default_chapters = 40
quality_floor = 85
revision_rounds = 2
cost_cap_cny = 5.0
target_words_per_chapter = 3000

[output]
export_dir = "./output"
auto_export = true
```

## 修复后的热键总表

| 键 | 动作 | 上下文 |
|---|---|---|
| `1` | 全部（主面板）| 任意 |
| `2` | 大纲 | 任意 |
| `3` | 角色 | 任意 |
| `4` | 用量 | 任意 |
| `Ctrl+K` | 指令面板 | 任意 |
| `Esc` | 关闭面板/弹窗 | 面板打开时 |
| `p` | 暂停/恢复 | running |
| `c` | 取消（确认后保存）| running/paused |
| `Enter` | needs_review 默认重试 | needs_review |
| `↑↓` | 滚动 / 历史指令 | 面板内 |
| `q` | 退出（生成中先确认保存）| 任意 |

## 修复后的状态枚举

`progress.json` status: `planning | running | paused | needs_review | completed | cancelled`

- `planning` — bible + outline 生成中（启动阶段）
- `running` — 逐章生成中
- `paused` — 用户暂停或成本超限
- `needs_review` — 质量门挂起
- `completed` — 全部完成
- `cancelled` — 用户取消

## 修复后的章节状态（大纲面板）

| 图标 | 状态 | 含义 |
|---|---|---|
| ✅ | done | 已生成，文件完整 |
| 🔄 | generating | 正在生成 |
| ⏳ | pending | 排队中 |
| ⏭ | skipped | 用户跳过（`/skip`） |

## 修复后的 `q` 退出行为

```
# 生成中按 q:
  生成中，退出前会自动保存当前进度。
  确认退出? (y/n) _

# 非生成中按 q 或已完成状态:
  直接退出（无需确认）
```

## 修复后的成本检查时机

每章生成**前**预估成本：
```
estimated = avg_chapter_cost * 1.2  # 加 20% 缓冲
if (cost + estimated > cost_cap) → pause
```

而非生成后累计超标再暂停。
