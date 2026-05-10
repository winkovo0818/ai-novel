# Phase A: DB-Driven Roles — Context

**Gathered:** 2026-05-10
**Status:** Ready for planning
**Predecessor of:** Phase B (Embedding 配置入 UI)

## Phase Boundary

把当前基于环境变量的 admin allowlist (`ADMIN_USER_IDS` / `ADMIN_EMAILS`) 替换为数据库支撑的角色系统，并补一个 admin 页用于授权 / 收回。

**包含：**
- 新增 `user_roles` Prisma 表 + migration
- 改 `lib/auth/admin.ts` 让 `checkAdmin()` 同时支持 DB + env fallback
- 新增 `/admin/users` 页面（route group `(app)`）
- 新增 `/api/admin/users` 接口（list / grant / revoke）

**不包含（→ Phase B）：**
- Embedding 模型配置 UI / 表
- `embedding_admin` 这个 role 的实际使用（schema 预留即可，本期不写代码消费它）
- 现有 `/models` 页面的视觉重构

---

## Implementation Decisions

### 角色数据模型

- **D-01:** 多对多 `user_roles` 表，复合主键 `(user_id, role)`，`role` 为字符串字段。
  Phase A 只填 `'admin'`。Phase B 加 `'embedding_admin'` 不动 schema，只新增一行。
  避免 Postgres enum 后续加值的迁移成本。

  ```prisma
  model UserRole {
    user_id    String
    role       String
    granted_by String?
    created_at DateTime @default(now())

    @@id([user_id, role])
    @@index([role])
  }
  ```
  *字段最终以 planner 设计为准；这里仅示意。*

### Bootstrap & 锁死防护

- **D-02:** `checkAdmin()` 先查 `user_roles`，未命中再查 env allowlist (`ADMIN_USER_IDS` / `ADMIN_EMAILS`)。
  env 永久作为逃生口 — DB 删空、最后一个 admin 被误删都能恢复访问。
  代价：env 与 DB 两处管理；接受。
- **隐含：** 不做 migration 自动导入 env-listed admins。env 上的人本身就是 admin（fallback 命中），DB 留空也无妨。

### 用户列表数据源

- **D-03:** 用 Supabase admin API（`supabase.auth.admin.listUsers()` / `getUserById()`）。
  - 服务端独占（在 admin guarded route 内调用）。
  - **新增 env：** `SUPABASE_SERVICE_ROLE_KEY`（当前仓库未使用，Phase A 必须新增）。
  - 不镜像 `auth.users` 到 Prisma — 避免同步钩子和 drift。
  - 列表分页用 Supabase 原生 `page` / `perPage`。

### Admin UI 范围与护栏

- **D-04:** 零自我保护护栏。admin 可以移除自己、可以删到 0 个 admin。锁死场景靠 D-02 的 env fallback 兑底。
- **D-05:** 不加 `role_changes` 审计表。需要追溯时靠 git + db backup。

### Claude's Discretion

以下交给 planner / executor 自行决定，无需再问用户：

- Admin 页路由：建议 `app/(app)/admin/users/page.tsx`（与 `/models` 同 route group，复用 sidebar shell）。
- 列表行渲染：email + 创建时间 + 当前 roles 列表 + grant/revoke 按钮即可，不做搜索 / 过滤。
- 接口形态：`GET /api/admin/users`（含 roles）、`POST /api/admin/users/:id/roles`（grant）、`DELETE /api/admin/users/:id/roles/:role`（revoke）。具体 RESTful 风格 planner 决定。
- Sidebar 入口：在 `/models` 旁边加一个"用户与权限"，仅 admin 可见。
- 失败模式：grant/revoke 失败时提示 + 不重定向（与 `/models` 现有交互一致）。
- 测试：复用 `app/api/llm-models/route.test.ts` 的 401/403/200 模式覆盖新接口。

---

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 现有权限机制
- `lib/auth/admin.ts` — 唯一 choke point，5 个调用者全部要继续走 `adminGuardResponse()`
- `lib/auth/ownership.ts` — 资源归属层，与角色权限正交，不动
- `utils/supabase/auth.ts` — `getOptionalUserId` / `getRequiredUserId`，需要可复用
- `utils/supabase/middleware.ts` — 顶层未登录拦截，本期不动
- `utils/supabase/server.ts` — 普通 server client；service-role client 是新增的

### 现有 admin-only 路由（4 个 + 1 healthz）
- `app/api/llm-models/route.ts` — GET/POST
- `app/api/llm-models/[id]/route.ts` — PATCH/DELETE
- `app/api/healthz/llm/route.ts` — GET

这 5 处不需要改逻辑，只要 `checkAdmin()` 内部支持 DB lookup 即可透明升级。

### 数据模型
- `prisma/schema.prisma` — 加 `UserRole` 模型，无关联其他表（user_id 不做 FK 因为 `auth.users` 不在 prisma 里）

### 现有页面参考（UI 一致性）
- `app/(app)/models/page.tsx` — 模型配置页，403 处理 / 列表 / 表单交互的参考实现
- `components/ui/PageHeader.tsx` / `LoadingState` / `EmptyState` / `ConfirmDialog` — 复用的 UI 原语

### 测试风格参考
- `app/api/llm-models/route.test.ts` — admin guard 401/403/200 测试模式
- `app/api/healthz/llm/route.test.ts` — 同上

---

## Existing Code Insights

### Reusable Assets
- `adminGuardResponse()` — 不改外层签名，只升级内部实现，5 个调用点零改动。
- `PageHeader` / `EmptyState` / `LoadingState` / `ConfirmDialog` — `/admin/users` 直接复用。
- `useConfirm` hook — revoke admin 弹确认对话框直接用。
- `getRequiredUserId()` — 接口里取当前 user 用。

### Established Patterns
- API 响应统一 `lib/http/json.ts`（见 STATUS.md §五），新接口必须 `jsonOk` / `jsonError`。
- Prisma snake_case 字段 + UUID 主键 + `created_at` / `updated_at` 时间戳。
- Route group `(app)` 自动挂 sidebar / 顶部布局 → 新页放在 `app/(app)/admin/users/`。
- 危险操作走 `useConfirm`，不用 `window.confirm`（M1.4 已清零）。

### Integration Points
- Sidebar (`components/layout/Sidebar.tsx`) — 加入"用户与权限"条目，仅 admin 可见（需要客户端拿 admin 状态，可暴露 `GET /api/auth/me`）。
- `lib/auth/admin.ts` — 主要修改点。
- 新建 `lib/supabase/admin.ts` — 封装 service-role client，避免在路由里手动构造。

---

## Specific Ideas

- 用户痛点起源：当前自己账号都没法配 LLM，env 改起来麻烦。Phase A 完成后**临时解决方案**（`.env.local` 加 `ADMIN_EMAILS`）就可以撤掉。
- env fallback 不是技术债，是**生产应急通道**。文档里要明确这个定位。

---

## Deferred Ideas

- **Embedding 模型配置 UI（Phase B 主体）** — 需要新增 `EmbeddingModel` 表 / `/(app)/models` 加 tab / 限制只接受 1024 维模型 / 维度约束的 UI 校验。维度变化所需的 schema 迁移与 chunk 重嵌入流程在 Phase B 单独决定。
- **角色细分** — `embedding_admin` / `user_admin` 等。schema 已经支持，等真有诉求时再加路由级 guard。
- **用户列表的搜索 / 过滤** — 当前用户量小，Supabase admin API 默认列表足够。需要时再加搜索框，不影响 schema。
- **role_changes 审计表** — 单人 / 小团队不需要；多人 / 合规场景再加。
- **Sidebar 显示当前 admin 状态** — 客户端组件需要 admin 状态做条件渲染，做不做条件菜单是 UX 决定，可放后续 polish。
- **`/api/auth/me` 返回 admin 标记** — 如果 sidebar 要做 admin-only 菜单需要这个；首版可以全员都看到入口，点进去再 403。

---

*Phase: A-permissions*
*Context gathered: 2026-05-10*
