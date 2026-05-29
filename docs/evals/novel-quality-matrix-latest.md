# 小说质量矩阵测评报告

- 生成时间：2026-05-29T15:22:30.041Z
- 模式：fixture fallback
- 题材样例：xuanhuan-seed、urban-suspense、scifi-hard、history-conservative
- 模型：fixture-baseline
- 每个样例章节数：3
- 修订轮数：1

## 总览

- 样例组合：4
- 草稿平均分：89.6/100
- 修订后平均分：87.5/100
- 平均变化：-2.1 分
- 有提升的组合：0/4
- 最好组合：玄幻/fixture-baseline
- 最弱组合：历史权谋/fixture-baseline

## 对比表

| 题材 | 模型 | 草稿 | 修订后 | 变化 | 逻辑 | AI 味 | 修订变更 | 主要风险 |
|---|---|---:|---:|---:|---:|---:|---:|---|
| 玄幻 | fixture-baseline | 94.3 | 94.3 | 0 | 10/10 | 10/10 | 3/3 | 3 章样本文字少于 800 字，真实质量判断置信度有限 |
| 都市悬疑 | fixture-baseline | 91.4 | 88.6 | -2.9 | 10/10 | 8/10 | 3/3 | 连续性低于 70%<br>3 章样本文字少于 800 字，真实质量判断置信度有限 |
| 硬科幻 | fixture-baseline | 87.1 | 84.3 | -2.9 | 10/10 | 8/10 | 3/3 | 连续性低于 70%<br>剧情推进低于 70% |
| 历史权谋 | fixture-baseline | 85.7 | 82.9 | -2.9 | 10/10 | 8/10 | 3/3 | 连续性低于 70%<br>3 章样本文字少于 800 字，真实质量判断置信度有限 |

## AI 痕迹 Top

| 题材 | 模型 | 草稿 Top | 修订后 Top |
|---|---|---|---|
| 玄幻 | fixture-baseline | 不是 X 而是 Y 3 | 无 |
| 都市悬疑 | fixture-baseline | 不是 X 而是 Y 3 | 无 |
| 硬科幻 | fixture-baseline | 不是 X 而是 Y 3 | 无 |
| 历史权谋 | fixture-baseline | 不是 X 而是 Y 3 | 无 |

## 清洗前 AI 签名命中（原始输出 Top）

> Writer 原始输出在 `cleanupWriterOutput` 清洗**前**触发的 AI 签名规则。命中越多 = 提示侧 AI 味越重；仅真实生成有数据，fixture fallback 为空。

| 题材 | 模型 | 草稿原始命中 Top |
|---|---|---|
| 玄幻 | fixture-baseline | 无 |
| 都市悬疑 | fixture-baseline | 无 |
| 硬科幻 | fixture-baseline | 无 |
| 历史权谋 | fixture-baseline | 无 |

## 说明

- 草稿分表示 Writer 直接生成后的质量；修订后分表示经过配置轮数 Critic/Reviser 或本地清洗后的质量。
- 默认命令不调用真实模型，只跑 fixture fallback，用于验证矩阵管线。真实多模型评估需显式设置 `EVAL_NOVEL_MATRIX_REAL=1`。

