# CLI 指令系统

> 关联：`docs/DESIGN_CLI.md`（架构）、`docs/DESIGN_CLI_INTERACTIONS.md`（交互）
> 本文定义所有运行时指令和用户主动干预机制

---

## 一、设计理念

生成过程中，用户不是只能旁观——可以在任何时候 `Ctrl+K` 打开指令面板，输入指令改变故事走向、调整参数、查看信息。类似 Claude Code 的 `/command` 风格。

**默认热键**：`Ctrl+K` 打开指令输入框（类似 VS Code 的命令面板），输入指令后 Enter 执行。

## 二、指令列表

### 2.1 系统指令

| 指令 | 别名 | 说明 |
|---|---|---|
| `/help` | `/?` | 显示全部可用指令和当前快捷键 |
| `/status` | `/st` | 显示当前运行状态（进度/成本/模型/质量） |
| `/model` | `/m` | 切换 LLM 模型 |
| `/model list` | `/ml` | 列出 cli-config.toml 中所有配置的模型 |
| `/model switch <name>` | `/ms` | 切换到指定模型（如 `/ms deepseek-v3`） |
| `/config` | `/cfg` | 查看当前配置 |
| `/config set <key> <value>` | — | 运行时修改配置项（仅本次生效） |
| `/clear` | `/cls` | 清屏 |
| `/quit` | `/q` | 安全退出（等同于 q 键） |

### 2.2 叙事干预指令

| 指令 | 说明 | 示例 |
|---|---|---|
| `/ending <描述>` | 设置目标结局，AI 后续章节会朝此方向推进 | `/ending 沈言最终放弃复仇，选择守护柴门` |
| `/ending clear` | 清除之前设置的结局约束 | — |
| `/rewrite` | 丢弃当前章节，从头重写（清空已生成的 draft） | — |
| `/rewrite from <节拍>` | 保留前 N 个节拍，从指定位置重写 | `/rewrite from 3` |
| `/skip` | 跳过当前章节（标记为 done，不生成内容，继续下一章） | — |
| `/skip to <N>` | 跳过到第 N 章（中间章全部跳过） | `/skip to 15` |
| `/note <内容>` | 给 AI 注入一条叙事笔记，后续所有章节的 prompt 中都会附带 | `/note 林玥其实是天代宗宗主的私生女` |
| `/note list` | 查看当前所有活跃的叙事笔记 | — |
| `/note remove <N>` | 移除第 N 条笔记 | `/note remove 2` |
| `/plot <描述>` | 添加必须发生的情节节点 | `/plot 第20章:沈言在试炼中暴露剑魂` |
| `/plot list` | 查看所有待实现的情节节点 | — |

### 2.3 角色干预指令

| 指令 | 说明 | 示例 |
|---|---|---|
| `/character add` | 交互式添加新角色 | 弹出填写：姓名/角色定位/性格/目标 |
| `/character list` | 列出当前 bible 中所有角色 | — |
| `/character <name>` | 查看指定角色详情 | `/character 沈言` |
| `/character kill <name>` | 标记角色死亡（不会在后续章节中出场） | `/character kill 蒋阶` |
| `/character revive <name>` | 复活角色 | `/character revive 蒋阶` |

### 2.4 质量与流程指令

| 指令 | 说明 | 示例 |
|---|---|---|
| `/floor <N>` | 动态调整质量阈值 | `/floor 80` — 降低门槛；`/floor 90` — 提高门槛 |
| `/rounds <N>` | 调整自修轮数 | `/rounds 0` — 跳过自修，加速生成 |
| `/cost-cap <N>` | 调整成本上限 | `/cost-cap 10` |
| `/pace fast` | 加速模式：skip critic（不审校，直接落库） | — |
| `/pace normal` | 正常模式：draft → critic → revise(≤2轮) | — |
| `/pace strict` | 严格模式：critic 必过，修满 R 轮 | — |
| `/words <N>` | 临时调整每章目标字数 | `/words 2000` |

### 2.5 信息查看指令

| 指令 | 说明 |
|---|---|
| `/outline` | 查看完整大纲（同 `2` 键面板，但在指令模式中可搜索） |
| `/outline <关键词>` | 搜索大纲中包含关键词的章节 | `/outline 天代宗` |
| `/chapter <N>` | 查看第 N 章全文 | `/chapter 12` |
| `/log` | 查看最近 20 条 LLM 调用日志 |
| `/cost` | 查看当前累计成本和预估剩余 |
| `/quality` | 查看最近 5 章的质量评分趋势 |

## 三、指令面板 UI

### 3.1 按下 `Ctrl+K` 时

```
  ╔══════════════════════════════════════════════════════════════════╗
  ║  逆魂纪  ● 自动生成中                          ¥0.34 / ¥5.00    ║
  ╚══════════════════════════════════════════════════════════════════╝

  ████████████░░░░░░░░░░░░░░░░░░  12/40 章  (30%)

  ┌ 指令 ───────────────────────────────────────────────────────────┐
  │ > _                                                              │
  │                                                                  │
  │  常用: /ending  /rewrite  /skip  /note  /character  /model       │
  │  查看: /help  /status  /outline  /chapter  /log  /cost           │
  │  调整: /floor  /rounds  /pace  /words  /cost-cap                 │
  │                                                                  │
  │  输入 /help 查看全部  ·  Esc 关闭  ·  ↑↓ 历史命令               │
  └──────────────────────────────────────────────────────────────────┘
```

**细节**：
- 指令面板覆盖在状态栏上方，不遮挡进度条
- 生成**不会暂停**——指令在后台执行，worker 继续跑
- 输入时实时联想（匹配已有指令名）
- `Esc` 关闭面板不执行
- `↑↓` 浏览历史指令
- 面板高度自适应（含提示行约 8 行）

### 3.2 指令执行反馈

```
  > /ending 沈言最终放弃复仇，选择守护柴门

  ✅ 结局已设定："沈言最终放弃复仇，选择守护柴门"
     后续章节 prompt 中将附带此约束。清除: /ending clear
     (3 秒后自动消失)
```

## 四、指令实现方式

### 4.1 结局指令 `/ending` 的工作原理

1. 用户输入 `/ending 沈言最终放弃复仇，选择守护柴门`
2. 写入 `progress.json` 的 `narrative_directives.ending` 字段
3. `generator.ts` 在每次构建 chapter prompt 时，检查是否有 `ending` 设定
4. 如果有，在 prompt 末尾追加：

```
[系统指令 · 结局约束]
作者已设定目标结局：{ending}。请在当前章节的叙事中自然地朝此方向推进。
不要让角色突然"想到"结局——应通过情节和人物选择逐步接近。
```

5. 如果剧情偏离太远（启发式检测：连续 3 章未出现结局相关的关键词/主题），在终端显示轻度提醒

### 4.2 笔记指令 `/note` 的工作原理

每一条 `/note` 写入 `progress.json` 的 `narrative_directives.notes[]` 数组。所有后续章节的 prompt 自动附带：

```
[作者笔记]
{note 1}
{note 2}
```

`/note list` 显示所有笔记，`/note remove <N>` 删除指定条。

### 4.3 人物指令 `/character add` 的交互

```
  > /character add

  ┌ 添加角色 ───────────────────────────────────────────────────────┐
  │ 姓名:   苏婉清                                                    │
  │ 定位:   ally                                                      │
  │        (protagonist / ally / mentor / antagonist / sidekick)     │
  │ 年龄:   22                                                        │
  │ 性格:   外表温婉，内心坚韧。精通医术，不善打斗但关键时刻总能       │
  │        救人。                                                     │
  │ 目标:   找到失踪的师父                                            │
  │ 能力:   医术、毒术、轻功                                          │
  │ 关联:   沈言·救命恩人                                             │
  │                                                                   │
  │ 按 Enter 确认  ·  Esc 取消                                       │
  └───────────────────────────────────────────────────────────────────┘

  ✅ 角色「苏婉清」已加入叙事圣经。她将在后续章节中可用。
```

**实现**：写入 `bible.json` 的 `characters` 数组，后续章节 prompt 自动包含新角色。

### 4.4 模型切换 `/model` 的交互

```
  > /model

  ┌ 切换模型 ───────────────────────────────────────────────────────┐
  │                                                                  │
  │  当前: deepseek-chat                                             │
  │                                                                  │
  │  可用模型:                                                        │
  │    1. deepseek-chat      (DeepSeek V3)                           │
  │    2. deepseek-reasoner  (DeepSeek R1)                           │
  │    3. mimo-v2.5-pro      (第三方代理)                             │
  │                                                                  │
  │  输入数字选择，或 /model switch <name> 直接切换                   │
  │  ⚠ 切换后下一章生效，当前章不受影响                               │
  └──────────────────────────────────────────────────────────────────┘
```

**实现**：`cli-config.toml` 支持多个模型配置块：

```toml
[llm.default]
provider = "deepseek"
model = "deepseek-chat"
base_url = "https://api.deepseek.com/v1"
api_key = "sk-xxx"

[llm.models.reasoner]
provider = "deepseek"
model = "deepseek-reasoner"
base_url = "https://api.deepseek.com/v1"
api_key = "sk-xxx"

[llm.models.fast]
provider = "custom"
model = "mimo-v2.5-pro"
base_url = "https://api.mimo.cn/v1"
api_key = "sk-yyy"
```

切换后写入 `progress.json` 的 `model` 字段，下一章用新模型。

---

## 五、快捷键总表（更新）

| 键 | 动作 | 上下文 |
|---|---|---|
| `1` `2` `3` `4` | 切换面板 | 任意时刻 |
| `p` | 暂停/恢复生成 | 生成中 |
| `c` | 取消生成 | 生成中/暂停 |
| `Ctrl+K` | 打开指令面板 | 任意时刻 |
| `Esc` | 关闭指令面板/当前弹窗 | 面板打开时 |
| `↑↓` | 滚动内容 / 历史指令 | 大纲面板 / 指令面板 |
| `Enter` | 在 needs_review 时默认重试 | needs_review 状态 |
| `q` / `Ctrl+C` | 退出 | 任意时刻 |

---

## 六、指令面板与热键的优先级

1. `Ctrl+K` → 打开指令面板（最高优先级，覆盖所有视图）
2. `Esc` → 关闭当前弹窗/面板
3. `1-4` → 切换面板
4. `p/c/q` → 仅在主视图（`1` 面板）生效，指令面板打开时无效
5. `↑↓` → 当前活跃的面板/指令面板内滚动

**冲突处理**：指令面板打开时，所有其他热键被禁用，只保留 `Esc` 和 `Enter`。关闭后面板恢复原热键。
