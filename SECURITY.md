# 安全策略

我们非常重视 **墨境 · AI Novel Studio** 的安全。本文档说明如何报告漏洞，以及部署时的安全注意事项。

---

## 报告漏洞

**请不要通过公开的 GitHub Issue 报告安全漏洞。**

如果你发现了安全问题，请通过以下方式私下联系维护者：

- 使用 GitHub 的 [私密漏洞报告](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) 功能（仓库 Security 标签页 → Report a vulnerability）。

报告时请尽量包含：

- 漏洞类型与影响范围
- 复现步骤或概念验证（PoC）
- 受影响的版本 / 提交
- 可能的修复建议（如有）

我们会在确认后尽快响应，并在修复发布后与你协调披露时间。

---

## 支持的版本

本项目目前处于活跃开发阶段，安全修复仅针对 `main` 分支的最新代码。建议部署者跟随 `main` 更新。

---

## 部署方的安全注意事项

本项目内置了多项安全机制，但**正确部署是安全的前提**。上线前请务必完成以下配置（README 的「上线检查清单」有完整列表）：

- **`AUTH_SECRET`**：会话密钥，用 `openssl rand -base64 32` 生成，切勿使用示例值。
- **`MODEL_KEY_ENCRYPTION_SECRET`**：LLM 模型 API Key 的加密密钥，至少 32 字符。LLM Key 在数据库中以加密形式存储，此密钥泄露会导致密文可被解密。
- **`MODERATION_FAILURE_MODE=block`**：内容审核失败时的兜底策略，生产环境应设为 `block`。
- **`METRICS_TOKEN`**：保护 `/api/metrics` 端点的 Bearer Token。
- **`CRON_SECRET`**：保护定时清理任务端点。
- **数据库**：生产环境不要使用 `.env.example` 中的默认 `postgres/postgres` 凭据。

### 已内置的防护

- **认证与授权**：基于 Auth.js v5，所有受保护接口校验身份与资源所有权。
- **限流**：内存 / Upstash Redis 双后端速率限制。
- **CSP Nonce**：每请求生成 Content Security Policy nonce。
- **SSRF 防护**：对外部 URL 做协议、私网 IP 校验。
- **内容审核**：本地关键词 + LLM 双重检查，带完整审计链。
- **敏感信息**：日志中不打印 token、密码、密钥等敏感字段。

---

## 请勿

- 不要将真实的 `.env` 提交到仓库（`.gitignore` 已忽略，但请自行确认）。
- 不要在 Issue、PR 或讨论中粘贴真实的 API Key、数据库连接串或会话密钥。

感谢你帮助保障本项目及其使用者的安全。
