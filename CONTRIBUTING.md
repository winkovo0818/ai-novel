# 贡献指南

感谢你考虑为 **墨境 · AI Novel Studio** 做贡献。本文档说明如何搭建开发环境、提交改动以及通过项目的质量门禁。

> 在开始之前，请先阅读项目根目录的 `CLAUDE.md`，其中包含本项目完整的工程规范（命名、错误处理、前后端约定、测试要求等）。所有贡献都应遵循该规范。

---

## 一、开发环境搭建

### 环境要求

- **Node.js** 22+
- **PostgreSQL** 16+（需 pgvector 扩展）
- **DeepSeek API Key**（本地开发可用 `LLM_MOCK=1` 跳过真实调用）

### 初始化

```bash
git clone https://github.com/YunDanFengQing/ai-novel.git
cd ai-novel
npm install

cp .env.example .env
# 至少配置 DATABASE_URL、AUTH_SECRET；本地开发建议设置 LLM_MOCK=1

npm run db:up        # 启动本地 PostgreSQL（Docker）
npm run db:migrate   # 执行迁移
npm run dev          # 启动开发服务器
```

打开 http://localhost:3000 即可。

---

## 二、提交改动的流程

1. **从 `main` 创建分支**，分支名建议体现意图，例如 `feat/beat-sheet-export`、`fix/version-restore-409`。
2. **保持小步修改**。一个 PR 聚焦一件事，不要把无关改动混在一起，也不要顺手格式化整个项目。
3. **新增功能补测试，修 bug 补回归测试**。核心逻辑必须有测试覆盖，且要覆盖异常路径与边界条件，而不仅是正常路径。
4. **本地跑通完整验证**（见下一节）后再提交。
5. **提交前确认没有引入** `any`、空 `catch`、硬编码配置或密钥。

---

## 三、质量门禁

提交前请在本地运行完整验证链路：

```bash
npm run verify
```

它会依次执行：

| 命令 | 作用 |
|------|------|
| `npm run lint` | ESLint 检查 |
| `npm run typecheck` | TypeScript strict 模式（含 noUnusedLocals / noUnusedParameters）|
| `npm run test` | Vitest 单元 / API 测试 |
| `npm run build` | 生产构建 |
| `npm run docs:check` | 文档数字一致性校验（防止 README/STATUS 中的统计漂移）|
| `npm run eval:check` | AI 生成质量基线回归 |

也可以单独运行其中任意一项。E2E 测试需要 `LLM_MOCK=1`：

```bash
LLM_MOCK=1 npm run test:e2e
```

CI（`.github/workflows/ci.yml`）会在每个 PR 上重跑 `verify` 与 `e2e`，并对测试覆盖率设有门禁（lines 68 / functions 93 / branches 83）。**请确保本地通过后再提交，避免 CI 反复失败。**

---

## 四、提交信息规范

采用 Conventional Commits 风格，使用中文描述：

```text
feat: 新增节拍表导出功能
fix: 修复版本恢复时的 409 冲突
refactor: 重构候选稿状态处理
docs: 更新部署说明
test: 补充自动生成断点续跑测试
chore: 调整构建配置
```

---

## 五、改动数据库 / API 时的额外要求

本项目的 API 与数据 Schema 在 `docs/contracts.md` 中有冻结合约。涉及以下改动时请格外谨慎，并在 PR 描述中说明影响：

- **数据库结构**：不要随意删除字段；新增字段要考虑默认值、历史数据 backfill、索引和迁移脚本。
- **公共 API 返回结构**：统一信封格式为 `{ ok: true, data }` / `{ ok: false, error }`，不要破坏现有字段。
- **认证、权限、安全逻辑**：所有需登录接口必须校验身份；涉及用户/项目数据的接口必须校验所有权，不要信任前端传入的用户 ID 或角色。

---

## 六、报告问题

- **功能缺陷 / 功能建议**：提交 GitHub Issue，附复现步骤、期望行为与实际行为。
- **安全漏洞**：请勿公开提交 Issue，参见 [SECURITY.md](SECURITY.md)。

期待你的贡献！
