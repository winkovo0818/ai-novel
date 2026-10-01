# 小说质量矩阵测评报告

- 生成时间：2026-10-01T17:21:03.461Z
- 模式：fixture fallback
- 题材样例：xuanhuan-seed、urban-suspense、scifi-hard、history-conservative
- 模型：fixture-baseline
- 每个样例章节数：3
- 修订轮数：1

## 总览

- 样例组合：4
- 草稿平均分：92.5/100
- 修订后平均分：92.5/100
- 平均变化：0 分
- 有提升的组合：0/4
- 最好组合：玄幻/fixture-baseline
- 最弱组合：硬科幻/fixture-baseline

## 对比表

| 题材 | 模型 | 草稿 | 修订后 | 变化 | 逻辑 | AI 味 | 修订变更 | 主要风险 |
|---|---|---:|---:|---:|---:|---:|---:|---|
| 玄幻 | fixture-baseline | 94.3 | 94.3 | 0 | 10/10 | 10/10 | 0/3 | 3 章样本文字少于 800 字，真实质量判断置信度有限 |
| 都市悬疑 | fixture-baseline | 94.3 | 94.3 | 0 | 10/10 | 10/10 | 0/3 | 3 章样本文字少于 800 字，真实质量判断置信度有限 |
| 硬科幻 | fixture-baseline | 90 | 90 | 0 | 10/10 | 10/10 | 0/3 | 剧情推进低于 70%<br>3 章样本文字少于 800 字，真实质量判断置信度有限 |
| 历史权谋 | fixture-baseline | 91.4 | 91.4 | 0 | 10/10 | 10/10 | 0/3 | 3 章样本文字少于 800 字，真实质量判断置信度有限 |

## AI 痕迹 Top

| 题材 | 模型 | 草稿 Top | 修订后 Top |
|---|---|---|---|
| 玄幻 | fixture-baseline | 不是 X 而是 Y 3 | 不是 X 而是 Y 3 |
| 都市悬疑 | fixture-baseline | 不是 X 而是 Y 3 | 不是 X 而是 Y 3 |
| 硬科幻 | fixture-baseline | 不是 X 而是 Y 3 | 不是 X 而是 Y 3 |
| 历史权谋 | fixture-baseline | 不是 X 而是 Y 3 | 不是 X 而是 Y 3 |

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

