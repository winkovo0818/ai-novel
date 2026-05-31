# CLI 项目管理与进度恢复

> 关联：`docs/DESIGN_CLI.md`、`docs/DESIGN_CLI_INTERACTIONS.md`
> 本文定义多项目管理和断点恢复的完整流程

---

## 一、项目索引

CLI 维护一个全局索引文件 `~/.ai-novel/projects.json`（或项目目录下的 `.cli-projects.json`），记录所有创建/运行过的小说项目。

```json
{
  "version": 1,
  "projects": {
    "./output/逆魂纪": {
      "title": "逆魂纪",
      "theme": "玄幻",
      "logline": "少年觉醒上古剑魂",
      "created_at": "2026-05-31T10:00:00Z",
      "last_opened_at": "2026-06-01T14:30:00Z",
      "status": "running",
      "current_chapter": 24,
      "total_chapters": 40,
      "cost_cny": 0.85,
      "model": "deepseek-chat"
    },
    "./output/剑魂歌": {
      "title": "剑魂歌",
      "theme": "玄幻",
      "logline": "废柴少年逆天改命",
      "created_at": "2026-05-30T08:00:00Z",
      "last_opened_at": "2026-05-30T22:00:00Z",
      "status": "completed",
      "current_chapter": 40,
      "total_chapters": 40,
      "cost_cny": 1.43,
      "model": "deepseek-chat"
    },
    "./output/都市暗流": {
      "title": "都市暗流",
      "theme": "都市悬疑",
      "logline": "退休刑警卷入连环案",
      "created_at": "2026-05-29T12:00:00Z",
      "last_opened_at": "2026-05-29T15:00:00Z",
      "status": "paused",
      "current_chapter": 8,
      "total_chapters": 30,
      "cost_cny": 0.21,
      "model": "deepseek-chat"
    }
  }
}
```

**存储位置**：优先项目根目录 `./.cli-projects.json`（随项目走），fallback `~/.ai-novel/projects.json`（全局）。

**更新时机**：每次启动、退出、章完成时自动写入。

## 二、首页：无参数启动

### 2.1 `npm run auto:new`（无参数）

```
  ╔══════════════════════════════════════════════════════════════════╗
  ║            🖋  全自动小说生成 CLI                                ║
  ╚══════════════════════════════════════════════════════════════════╝

  ── 进行中的项目 ──────────────────────────────────────────────────

    1. 逆魂纪        玄幻  ████████████░░░░  24/40 章  60%  ¥0.85
       最后: 2026-06-01 14:30  ·  模型: deepseek-chat
       → 按 1 继续生成

    2. 都市暗流      悬疑  ████░░░░░░░░░░░░   8/30 章  27%  ¥0.21
       已暂停 (2026-05-29)
       → 按 2 继续生成

  ── 已完成的项目 ──────────────────────────────────────────────────

    3. 剑魂歌        玄幻  ✅ 40/40 章  ¥1.43
       完成于 2026-05-30  ·  已导出 ./output/剑魂歌/
       → 按 3 查看详情

  ── 新建 ──────────────────────────────────────────────────────────

    n. 开始新项目

  输入数字选择，或直接运行 npm run auto:new -- -t <主题> -l <灵感> -c <章数>
```

**细节**：
- 进行中的项目按 `last_opened_at` 倒序排列
- 已完成的项目折叠在下方
- 直接输入数字进入对应项目（等同于 `--resume`）
- 每个项目显示进度条和关键统计
- 如果没有进行中的项目，直接跳到新建流程

### 2.2 键盘操作

| 键 | 动作 |
|---|---|
| `1-9` | 选择对应项目，进入生成面板 |
| `n` | 新建项目 |
| `r` | 刷新列表（重新扫描 output 目录） |
| `d <数字>` | 删除项目索引记录（不删文件） |
| `q` | 退出 |

---

## 三、恢复流程

### 3.1 自动恢复

```
$ npm run auto:new -- --resume ./output/逆魂纪

  正在加载 ./output/逆魂纪/ …

  📁 已找到项目: 逆魂纪
     进度: 24/40 章 (60%)
     状态: 已暂停 (保存于 2026-06-01 14:30)
     累计: ¥0.85

  ── 文件完整性检查 ────────────────────────────────────────────────

  ✅ bible.json         — 8 位角色，世界观完整
  ✅ outline.json       — 40 章大纲就绪
  ✅ progress.json      — 进度记录完整
  ✅ chapters/01-24.md  — 24 个章节文件完整
  ⚠  chapters/24.md     — 仅 127 字（上次异常退出，将重新生成）

  ── 恢复策略 ──────────────────────────────────────────────────────

  第 24 章内容不完整（< 500 字），将重新生成此章。
  第 25 章起正常继续。

  按 Enter 继续  ·  Ctrl+C 退出
```

**恢复时的完整性检查规则**：

| 条件 | 动作 |
|---|---|
| 最新章 `.md` 不存在 | 重新生成当前章 |
| 最新章 `.md` 字数 < 500 | 删除并重新生成（异常退出残留） |
| 最新章 `.md` 字数 >= 500 | 标记为 done，继续下一章 |
| `progress.json` 缺失 | 从 chapters/ 目录重建（扫描已有文件推断进度） |
| `progress.json` status=completed | 提示已完成，询问是否重跑最后一章或退出 |
| `progress.json` status=running | 上次异常退出，检查完整性后恢复 |

### 3.2 手动恢复

如果用户从首页选择项目（输入数字），等效于 `--resume`。

### 3.3 重建索引

如果 `~/.ai-novel/projects.json` 丢失或损坏：

```bash
$ npm run auto:new -- --scan
```

扫描 `cli-config.toml` 中 `output.export_dir` 下的所有目录，检查是否有合法的项目文件（含 `progress.json`），重建索引。

```
  正在扫描 ./output/ …

  找到 3 个项目:
    ✅ 逆魂纪 (24/40 章, running)
    ✅ 剑魂歌 (40/40 章, completed)
    ✅ 都市暗流 (8/30 章, paused)

  索引已重建。
```

---

## 四、快速启动（无交互）

如果用户明确知道要做什么，可以跳过首页：

```bash
# 继续上次未完成的项目
$ npm run auto:new -- --continue

# 继续特定项目
$ npm run auto:new -- --resume ./output/逆魂纪

# 新建（不显示首页，直接进入生成）
$ npm run auto:new -- -t 玄幻 -l "少年觉醒上古剑魂" -c 40
```

`--continue` 的逻辑：查 `~/.ai-novel/projects.json`，找 `status != completed` 且 `last_opened_at` 最近的项目，自动 resume。如果有多个进行中的项目，显示列表让用户选（等同于无参数启动）。

---

## 五、项目文件结构（完整）

```
./output/逆魂纪/
├── novel.json              # { title, theme, logline, created_at }
├── bible.json              # { characters, world }
├── outline.json            # [{ index, title, summary }]
├── progress.json           # { current, total, cost, status, model }
├── quality.json            # [{ chapter, score, dimensions }]
├── usage.json              # [{ chapter, draftCost, ... }]
├── chapters/
│   ├── 01-雨夜火房.md
│   ├── 02-黑牌入手.md
│   └── ...
├── notes.json              # 用户叙事笔记 [{ text, created_at }]
├── .run.lock               # 运行时锁，防止并发
└── exports/                # 自动导出目录（完成后生成）
    ├── 逆魂纪.txt
    ├── 逆魂纪.md
    └── 逆魂纪.epub

~/.ai-novel/
├── projects.json           # 全局项目索引
└── history                 # 指令历史
```

---

## 六、指令追加

新增指令：

| 指令 | 说明 |
|---|---|
| `/projects` | 查看所有项目（等效于首页列表，但不退出当前面板） |
| `/save` | 手动保存当前进度（通常自动保存，但可手动触发） |
| `/export` | 手动触发完整导出（markdown + epub） |
| `/rename <新名>` | 重命名当前项目 |

---

## 七、完整命令参考

```bash
npm run auto:new                           # 首页（项目列表）
npm run auto:new -- -t <主题> -l <灵感>    # 快捷新建
npm run auto:new -- -t <主题> -l <灵感> -c 40 -f 85 -r 2   # 完整参数
npm run auto:new -- --resume <路径>         # 恢复指定项目
npm run auto:new -- --continue              # 继续最近未完成的项目
npm run auto:new -- --scan                  # 重建项目索引
npm run auto:new -- --setup                 # 重新运行配置向导
npm run auto:new -- --export <路径>         # 导出项目（不进生成面板）
npm run auto:new -- --delete <路径>         # 删除项目（确认后删文件+索引）
```

### 参数速查

| 参数 | 简写 | 默认值 | 说明 |
|---|---|---|---|
| `--theme` | `-t` | 必填 | 题材（玄幻/都市/科幻/历史…） |
| `--logline` | `-l` | 必填 | 一句话核心冲突 |
| `--chapters` | `-c` | cli-config 默认值 | 目标章数 (1-80) |
| `--floor` | `-f` | 85 | 质量阈值 (%) |
| `--rounds` | `-r` | 2 | 自修轮数 (0-5) |
| `--cost-cap` | — | 5 | 成本上限 (元) |
| `--model` | `-m` | cli-config 默认值 | 指定模型 |
| `--words` | `-w` | 3000 | 每章目标字数 |
| `--output` | `-o` | ./output | 输出目录 |
| `--resume` | — | — | 恢复项目路径 |
| `--continue` | — | — | 继续最近未完成项目 |
| `--scan` | — | — | 重建项目索引 |
| `--setup` | — | — | 重新运行配置向导 |
