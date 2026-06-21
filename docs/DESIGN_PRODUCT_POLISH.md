# 产品化打磨方案

> 日期：2026-06-02
> 范围：错误体验人话化、编辑器细节、引导流程减负、快速开始通道
> 原则：低投入高影响优先，不做架构改动

---

## 一、错误体验人话化（P0 / 低投入）

### 现状
API 返回的错误码是技术性的（`LLM_TIMEOUT`、`EMPTY_REVISION`、`MODERATION_HIT`），前端直接透传 `error.message`，用户看到的是 "Model returned an empty revision" 这样的英文技术文本。

### 方案
加一个错误码 → 人话的映射层。不改 API 返回格式，只在前端消费时翻译。

**新增文件**：`lib/http/errorMessages.ts`
```typescript
const ERROR_MESSAGES: Record<string, string> = {
  LLM_TIMEOUT: "AI 生成超时，正在自动重试…",
  EMPTY_REVISION: "AI 暂时无法完成改写，请尝试换一种描述方式",
  MODERATION_HIT: "内容可能包含违规信息，已自动跳过，请修改后重试",
  RATE_LIMITED: "请求过于频繁，请稍等片刻再试",
  QUOTA_EXCEEDED: "本月用量已达上限",
  INVALID_INPUT: "请求参数有误，请刷新页面后重试",
  NOVEL_NOT_FOUND: "作品未找到，可能已被删除",
  UNAUTHORIZED: "登录已过期，请重新登录",
  INTERNAL: "服务器繁忙，请稍后重试",
};

export function humanizeError(error: { code?: string; message?: string }): string {
  if (error.code && ERROR_MESSAGES[error.code]) {
    return ERROR_MESSAGES[error.code];
  }
  return error.message || "操作失败，请重试";
}
```

**改动点**：
- `useChapterDrafting.ts`：catch 块里 `setMessage(...)` 改为 `setMessage(humanizeError(err))`
- `CandidatePanel.tsx`：错误展示区同样走 `humanizeError`
- `AIPanel.tsx`：status message 区域已用 `message` prop，自动受益
- `useChapterActions.ts`：consistency error 同样处理

**不改动**：API route 本身。错误码体系保持原样，只是前端消费时做了一层人话映射。

**估时**：0.5h。新增 1 个文件，改动 3-4 个文件的 catch 块。

---

## 二、编辑器细节打磨（P0 / 中投入）

### 2.1 空章节 placeholder

**现状**：空章节编辑器显示空白 `<textarea>`，没有引导。

**方案**：当 `content` 为空时，编辑器中间显示一个引导性 placeholder 文案，提示用户可以手动写或让 AI 起草。有内容后消失。

**改动**：`EditorClient.tsx` 的 `<textarea>` 区域加一个条件渲染的 overlay：
```tsx
{!editor.content.trim() && (
  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
    <p className="text-text-dim/40 text-lg font-serif italic">
      写下第一段，或让右侧写作助手帮你起草…
    </p>
  </div>
)}
```

CSS 确保 textarea 在 overlay 之上可交互。

**估时**：15 分钟。

### 2.2 候选稿操作按钮说明

**现状**：候选稿面板有 4 个按钮（覆盖/追加/插入/放弃），新用户不知道每个选项的后果。

**方案**：在按钮区域上方加一行小字说明，hover 各按钮时 tooltip 解释效果：
- "覆盖正文" → "用候选稿替换当前正文内容"
- "追加到末尾" → "将候选稿添加到当前正文之后"
- "插入光标处" → "将候选稿插入到光标所在位置"
- "放弃" → "丢弃候选稿，正文不变"

**改动**：`CandidatePanel.tsx`，加一个 `text-[10px]` 的提示行 + title 属性。

**估时**：20 分钟。

### 2.3 章节切换自动保存

**现状**：切换章节时如果当前章有未保存内容，依赖编辑器已有的 dirty 检测 + 手动保存。如果用户在候选稿面板打开时切章，候选稿会丢失。

**方案**：
- 切章前检查 `hasUnsavedChanges` 或 `candidateOpen`，如果有未保存内容或打开的候选稿，弹出 toast 提示"自动保存中…"并异步保存
- 候选稿切章时自动丢弃（已有 `clearCandidate` 逻辑），但加一个 toast 确认

**改动**：`useChapterSelection.ts` 的 `selectChapter` 函数，切前调用 `saveChapter`（如果 dirty），然后 `clearCandidate`（如果有候选稿）。

**估时**：30 分钟。

---

## 三、引导流程减负（P1 / 中投入）

### 现状
5 步 wizard：题材 → 灵感 → 反向追问 → Bible SSE 生成（等待 30-60s）→ Review。

### 痛点
- 步骤太多，3-5 分钟才能见到正文
- Step 4（Bible 生成）是纯等待，用户干瞪眼
- Step 3（反向追问）对只想快速开始的用户是负担

### 方案：压缩为 2.5 步

**新流程**：
```
Step 1: 题材 + 灵感（合并原 Step 1+2，一页搞定）
    ↓ 用户点击"开始创作"
Step 2: AI 并行生成 Bible + Outline（合并原 Step 3+4，一步完成）
    ↓ 展示生成进度动画，完成后直接跳转
Step 3: 进入第一章编辑器（原 Step 5 Review 变为编辑器内可随时打开的项目设置）
```

**具体改动**：

1. **Step 1 改造**：合并题材选择 + 灵感输入到同一页。左侧题材卡片（点击选择），右侧灵感输入框 + 目标章数。一个"开始创作"按钮提交。

2. **Step 2 改造**：触发后端 API（`POST /api/novels`），一次性生成 Bible + Outline。移除反向追问（Question 环节），改为在 Step 1 的灵感框下方加一行小字"更详细的描述会让 AI 生成更精准的设定"。

3. **Review 后置**：不再作为独立步骤。改为：进入编辑器后，右上角显示一个"查看项目设定"入口，点击打开 Bible + Outline 的预览面板（复用已有的 Bible 编辑页逻辑）。

**动文件**：
- `app/(app)/new/page.tsx` — 改 3 步（原 5 步）
- `app/(app)/new/_components/StepShell.tsx` — 可能需要调整
- `app/store/wizardStore.ts` — 简化为 3 步状态
- API：可能需要一个合并的 `POST /api/novels` endpoint（一次性创建 novel + bible + outline）

**估时**：2h。

---

## 四、快速开始通道（P1 / 低投入）

### 现状
注册成功 → 提示"前往登录" → 用户手动登录 → 到 dashboard → 看到空状态 → 点"新建文学作品" → 进 5 步 wizard。

### 方案
**注册后直接登录 + 跳转 `/new` 页面**，跳过 dashboard。

**改动**：`app/signup/page.tsx`，注册成功的回调里：
```typescript
// 原：setSuccess(true); → 显示"前往登录"
// 改：注册成功后调用 signIn("credentials", { email, password, redirect: false })
// 然后 router.push("/new")
```

需要引入 `signIn` from `next-auth/react` 和 `useRouter`。

**估时**：20 分钟。

---

## 五、执行顺序与影响矩阵

| # | 改动 | 投入 | 影响 | 风险 |
|---|---|---|---|---|
| 1 | 错误人话化 | 0.5h | 全站 | 低（纯前端映射） |
| 2 | 编辑器细节 | 1h | 编辑器 | 低（局部 UI） |
| 3 | 引导减负 | 2h | 新用户 | 中（改 wizard store + API） |
| 4 | 快速开始 | 0.5h | 新用户 | 低（只改注册页） |

```
Day 1: #1 + #2（3 个小改动，立竿见影）
Day 2: #3（核心体验重构）
Day 2b: #4（收尾，注册 → 直通新建）
```

**总计 ~4h，4 个文件新增，改动面可控。**
