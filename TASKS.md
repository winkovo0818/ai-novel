# AI Novel — 待办任务清单

> 创建时间：2026-05-08
> 完成时间：2026-05-08
> 总计：21 项任务 — 全部完成 ✅

---

## 高优先级（影响安全上线）

| 状态 | # | 任务 | 说明 | 依赖 |
|------|---|------|------|------|
| ✅ | 1 | 实现登录/注册 UI | 新增 /login、/signup 页面；middleware 鉴权重定向；getRequiredUserId()；auth callback + logout API | — |
| ✅ | 2 | 替换内容审核 mock 为真实实现 | LLM 审核 + 本地关键词过滤双层实现，含单元测试 | — |
| ✅ | 3 | 修复匿名资源安全漏洞 | canAccessOwnerResource 现在要求已登录；未认证返回 401；API 路由改用 getRequiredUserId | — |
| ✅ | 4 | 实现数据库 RLS（行级安全） | SQL migration 启用 RLS + 策略；setRlsUser() 辅助函数 | ← #1 |
| ✅ | 5 | 实现密码重置功能 | 新增 /reset-password 和 /update-password 页面；登录页增加忘记密码链接 | ← #1 |

## 中优先级（影响产品完整性）

| 状态 | # | 任务 | 说明 | 依赖 |
|------|---|------|------|------|
| ✅ | 6 | 新增作品列表页 | 新增 /novels 页面和 GET /api/novels 列表接口，含导航栏和退出登录 | ← #1 |
| ✅ | 7 | 重新设计首页 | 首页为 server component，已登录自动跳转 /novels，未登录展示产品介绍+注册/登录 | ← #1 |
| ✅ | 8 | 实现章节删除功能 | DELETE /api/chapters/[id] + 编辑器工具栏删除按钮 + 确认弹窗 + 测试 | — |
| ✅ | 9 | 实现章节版本历史 | ChapterVersion model + migration；PATCH 保存自动创建版本快照；GET /api/chapters/[id]/versions | — |
| ✅ | 10 | 实现全文一致性校验 | POST /api/novels/[id]/consistency；LLM Critic Agent 检查角色/规则/情节矛盾 | — |
| ✅ | 11 | 实现长篇记忆/RAG | ChapterSummary model + 摘要 API + 起草时优先使用摘要而非截断原文 | — |
| ✅ | 12 | 将 Playwright E2E 测试集成到 CI | CI 新增 e2e job，PostgreSQL service container，Playwright chromium | — |
| ✅ | 13 | 拆分 EditorClient 组件 | 提取 useChapterEditor hook，EditorClient 仅 75 行 | — |
| ✅ | 14 | 实现 API 限流 | 内存限流器，通用 30/min、draft 10/min，含测试 | — |

## 低优先级（体验优化）

| 状态 | # | 任务 | 说明 | 依赖 |
|------|---|------|------|------|
| ✅ | 15 | 添加错误边界和加载状态页 | 新增 error.tsx、loading.tsx、not-found.tsx | — |
| ✅ | 16 | 优化移动端适配 | 编辑器移动端可折叠侧栏、工具栏自适应、textarea 高度自适应 | — |
| ✅ | 17 | 实现 i18n 国际化 | next-intl 集成；中英翻译文件；NextIntlClientProvider 接入 layout | — |
| ✅ | 18 | 新增用户 Profile 页 | 新增 /profile 页，显示邮箱、修改密码、退出登录 | ← #1 |
| ✅ | 19 | Step4 卡片动效优化 | globals.css 添加 fadeSlideIn 动画，StreamCard 使用 animate-in | — |
| ✅ | 20 | 实现正式部署配置 | Dockerfile (standalone)、.env.production、next.config standalone 模式 | — |
| ✅ | 21 | 清理 BibleDraft.version 死代码 | Schema 中删除 version 字段，新增 migration | ← #9 |

---

## 执行顺序建议

1. **#1 登录/注册 UI** — 解锁 #4 #5 #6 #7 #18
2. **#2 内容审核** — 独立，可与 #1 并行
3. **#3 匿名资源安全漏洞** — 独立，可与 #1 并行
4. #4 RLS / #5 密码重置 / #6 作品列表 / #7 首页 — 依赖 #1 完成后推进
5. #8–#14 中优先级独立任务
6. #15–#21 低优先级收尾
