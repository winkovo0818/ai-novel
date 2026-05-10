# Phase B: Embedding Config in UI — Context

**Gathered:** 2026-05-11
**Status:** Ready for planning
**Successor of:** Phase A (DB-Driven Roles)

## Phase Boundary

把 embedding 提供方与模型从环境变量硬编码（`EDGEFN_API_KEY` / `BAAI/bge-m3`）抬升到数据库 + admin UI，让管理员能在不改部署 env 的情况下切换 embedding 后端。

**包含：**
- 新 `EmbeddingModel` Prisma 表 + migration
- 改 `lib/llm/embeddings.ts` 让 `createEmbedding()` 先查 DB，env 作为永久 fallback
- 新增 `/(app)/models/embeddings/page.tsx`
- 新增 `/api/embedding-models` + `/api/embedding-models/[id]` 接口
- 复用 Phase A 的 `admin` role 做 gate（不引入 `embedding_admin`）

**不包含：**
- `/models` 页加 Tab 导航 — 等你的 UI 重构提交后自己加（避免与未提交改动冲突，见 B-D-05）
- 维度迁移脚本（非 1024 维模型支持） — backlog
- 切换 default 后的旧 chunk 重嵌入（决策已避免：所有配置都 1024 维，旧 chunk 仍可用）

---

## Implementation Decisions

### 数据模型与页面位置

- **B-D-01:** 新建 `EmbeddingModel` 表，独立于 `LlmModel`。字段集合与 `LlmModel` 平行（name / provider / base_url / api_key / model / is_default / is_enabled），新增 `dim Int` 字段记录维度。
- **B-D-05（落地补充）:** UI 暂时挂在独立路由 `/models/embeddings/page.tsx`，不动 `/models/page.tsx`。/models 页面 Tab 整合作为后续工作（你 UI 重构提交后由你自己加一行 Link 即可）。

  ```prisma
  model EmbeddingModel {
    id           String   @id @default(uuid())
    name         String
    provider     String   @default("edgefn")
    base_url     String
    api_key      String     // AES-256-GCM encrypted, mask on read
    model        String
    dim          Int      @default(1024)
    is_default   Boolean  @default(false)
    is_enabled   Boolean  @default(true)
    created_at   DateTime @default(now())
    updated_at   DateTime @updatedAt

    @@unique([provider, model])
  }
  ```

### 维度策略

- **B-D-02:** 严格只接受 1024 维。`dim` 字段允许写入但 zod 校验只允许 `dim === 1024`。提交其他维度返回 `INVALID_INPUT` + 提示 "暂只支持 1024 维（bge-m3 / Cohere v3 / Voyage 等），其他维度需要单独迁移脚本"。
- 后端运行时也额外校验：`createEmbeddings` 拿到响应后断言 `embeddings[0].length === 1024`，与 schema 的 `vector(1024)` 列对齐。
- 切换 default 时不会破坏老 chunk —— 因为所有配置都是 1024 维，旧 chunk 在新模型下虽然语义空间不一致（召回质量下降），但维度兼容能查。这是已知 trade-off。

### 默认 / 多配置机制

- **B-D-03:** 多条配置共存 + `is_default` + `is_enabled`，与 `LlmModel` 完全一致。
  - POST/PATCH 设 `is_default=true` 时，自动把同 provider 的其他行 unset（沿用 `LlmModel` 现有逻辑）— 实际上对 embedding 我们应该把所有其他行 unset（不分 provider），因为运行时只能选一个 embedding default。
  - **B-D-03a:** 切换 default 是 unset **所有** 其他行（不限 provider），区别于 LlmModel 的同 provider 内 unset。
- runtime: `createEmbedding()` 取 `is_default=true && is_enabled=true` 的行；找不到走 env fallback。

### env fallback + 权限粒度

- **B-D-04:** 完全镜像 Phase A admin 模式：
  - `createEmbedding()` 先查 DB（default + enabled）；未命中或 DB throw → fallback 到 `EDGEFN_BASE_URL` / `EDGEFN_API_KEY` env。
  - 权限沿用现有 `admin` role（**不**引入 `embedding_admin`）。原因：当前 schema 已经支持 multi-role，所以未来真要引入也不动 schema，只加路由 guard。
- env 永久兜底，DB 配置全失效（节点宕机 / api_key 泄漏被禁用 / 误删全部）时还能跑。

### Claude's Discretion

- **API 路由形态:** `/api/embedding-models` 完全镜像 `/api/llm-models`（GET/POST + [id] PATCH/DELETE）。复用 `encryptApiKey` / `maskApiKey` / `validateModelUrl` 等 helper。
- **页面交互:** 镜像 `/models/page.tsx` 现有交互（部署/编辑/启停/删除），不引入新模式。
- **provider 默认值:** 表单里 provider 默认 `edgefn`，URL 默认 `https://api.edgefn.net/v1`，model 默认 `BAAI/bge-m3`。
- **测试覆盖:** 复用 `app/api/llm-models/route.test.ts` 的 401/403/admin/SSRF 模式 — 同样的负向场景覆盖。
- **runtime fallback 顺序:** DB → env → throw。中间任何一层 throw 不该让 chunking job 直接挂掉（job queue 已有重试），用 try/catch 把 DB 错误吞了 fallback。

---

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 现有 embedding 调用面
- `lib/llm/embeddings.ts` — 主要重构目标。新增 DB 查询逻辑，保留 env 路径作为 fallback。
- `lib/agent/chunking.ts` — embedding 写入方（`createEmbeddings` 批量）。无需改逻辑，只要 `createEmbeddings` 签名不变。
- `lib/agent/retrieval.ts` — embedding 读取方（`createEmbedding` 单条）。无需改。

### 维度约束
- `prisma/schema.prisma:178` — `MemoryChunk.embedding` 是 `vector(1024)`，写死。换其他维度需要 ALTER 这列 + 重嵌入所有 chunk。
- `prisma/migrations/20260510010000_pgvector_upgrade/migration.sql` — 当时升级 vector 列的迁移，可作为未来维度迁移的参考模板。

### 复用基础设施
- `app/api/llm-models/route.ts` + `app/api/llm-models/[id]/route.ts` — admin guard / encrypt / mask / 校验模式
- `app/api/llm-models/route.test.ts` — 测试模式参考（401/403/admin/SSRF）
- `lib/llm/encryption.ts` — `encryptApiKey` / `maskApiKey`（与 LlmModel 共享）
- `lib/validation/llmModel.ts` — `validateModelUrl` SSRF 防护（拒绝 private IP / 非 HTTPS）— embedding 同样需要
- `app/(app)/models/page.tsx` — UI 交互模式参考（403 网关、编辑表单、启停按钮）

### Phase A 决策
- `docs/phases/PHASE-A-PERMISSIONS-CONTEXT.md` — 复用 admin role 与 env fallback 模式
- `lib/auth/admin.ts` — `adminGuardResponse` 直接复用，不改

---

## Existing Code Insights

### Reusable Assets
- `encryptApiKey` / `maskApiKey` — 直接 import，不复制
- `validateModelUrl` 或等价 SSRF helper（在 `lib/validation/llmModel.ts`）— 可以提取到 `lib/validation/url.ts` 让 embedding 复用，或直接 inline 一份相同逻辑
- `adminGuardResponse` — 沿用
- 模型卡片 / 表单 UI 在 `/models/page.tsx` 里 — 拷过来减字段（embedding 不需要 provider enum 限制？dim 字段固定 1024 不让用户改？）

### Established Patterns
- Prisma snake_case + UUID 主键 + `created_at` / `updated_at`
- API 响应 `jsonOk` / `jsonError`
- Route group `(app)` 自动挂 sidebar
- 测试 mock `@/lib/db` + `@/utils/supabase/server` + 用 ADMIN_USER_IDS env 走 admin

### Integration Points
- `lib/llm/embeddings.ts` 是 single point of change。两个 caller 不动。
- `prisma.embeddingModel` — 新表，不与现有表关联。
- 不动 sidebar（同 Phase A，Sidebar.tsx 你有未提交改动）。

---

## Specific Ideas

- 用户痛点起源：`createEmbedding` 现在写死 EdgeFn + bge-m3。换 provider（比如 SiliconFlow / Cohere）必须改代码 + 部署。Phase B 完成后可以纯运行时切换。
- env fallback 与 Phase A 同样定位：生产应急通道，不是技术债。
- B-D-02 的 1024-only 是 explicit trade-off — 用最简的 UI 校验把"换维度"这个噩梦推到 backlog。

---

## Deferred Ideas

- **Tab 导航整合到 /models** — 等你的 UI 重构提交后自己加（一个 `<Link href="/models/embeddings">` 即可）。
- **非 1024 维支持** — 需要：迁移脚本（ALTER vector 列）、所有 chunk 重嵌入（call pgvector update）、UI dim 字段开放。整套至少 1 个 phase 的工作。
- **embedding 健康检查 `/api/healthz/embedding`** — 类比 `/api/healthz/llm`，确认 default embedding 配置可用。
- **embedding_admin role** — schema 已支持，未来路由 guard 改一行即可。
- **每个 chunk 记录使用的 embedding 模型** — 多模型并存场景才需要，当前严格 1024 维不需要。
- **chunk 重嵌入命令 / job** — 切换 default 后想重新嵌入旧数据时用。
- **批量 embedding 用量统计** — `LlmUsage` 表当前只追 chat，embedding 调用没记。

---

*Phase: B-embeddings*
*Context gathered: 2026-05-11*
