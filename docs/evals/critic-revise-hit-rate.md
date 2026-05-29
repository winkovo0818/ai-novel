# Critic → Revise 命中率

- 生成时间：2026-05-29T14:58:14.068Z
- 模式：real_llm

## 两个核心指标

- **Critic recall（漏报率的反面）**：人类预期的 3 个问题类型里，critic 实际报出 3 个 = **100%**
- **Revise 命中率**：critic 报出的可验证问题 3 个里，revise measurably 解决 3 个 = **100%**

> Critic recall 低 = critic 看不见问题（Day 9 改 critic 提示）。
> Revise 命中率低 = critic 看见了但 revise 没改对（Day 9 改 revise 提示）。

## 逐章结果

| 章节 | 预期问题 | critic 报出 | 漏报 | 已改写 | AI痕迹 | 因果词 |
|---|---|---|---|:---:|---|---|
| urban-suspense 第2章 | prose_quality | logic_chain,prose_quality | 无 | 是 | 7→4 | 0→10 |
| urban-suspense 第3章 | logic_chain | logic_chain | 无 | 是 | 0→9 | 0→5 |
| xuanhuan-seed 第2章 | world_rule | world_rule | 无 | 是 | 0→0 | 0→0 |

## 逐问题判定

| 章节 | 类型 | 严重度 | 可验证 | 已解决 | 信号 |
|---|---|---|:---:|:---:|---|
| urban-suspense 第2章 | logic_chain | major | 是 | 是 | 因果连接词 0 -> 10 |
| urban-suspense 第2章 | prose_quality | major | 是 | 是 | AI 痕迹 7 -> 4 |
| urban-suspense 第3章 | logic_chain | major | 是 | 是 | 因果连接词 0 -> 5 |
| xuanhuan-seed 第2章 | world_rule | critical | 否 | 否 | 语义类问题，离线无法自动验证（仅记录是否发生改写） |

