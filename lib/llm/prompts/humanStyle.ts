/**
 * Anti-AI-signature directive injected into the writer / reviser system
 * prompts.
 *
 * Detectors like 朱雀 score text on statistical surface features:
 * - uniform sentence length / low burstiness
 * - high frequency of AI-favored connectives & adverbs
 * - balanced parallel structures
 * - generic abstract emotion labels instead of concrete body / scene cues
 * - polished, never-broken dialogue
 *
 * Vague instructions ("写自然点") don't move the needle. The model needs
 * specific, checkable rules. This directive lists banned tokens and gives
 * worked substitutions so the model can self-correct mid-generation.
 *
 * Keep this tight (~400 字). Bloated prompts dilute attention to the rules.
 */
export const HUMAN_STYLE_DIRECTIVE = `人工痕迹要求（朱雀等 AI 检测器扫描的就是这些，违反 = 任务失败）：

1. 长短句对撞。每个段落内必须出现 6 字以内的短句（"他没动。""不对。""够了。"）。禁止段内句子长度都在 15-25 字区间。

2. AI 高频词清单——全文每个最多 2 次：极其、几乎、仿佛、似乎、宛如、犹如、隐约、依稀、轻轻、缓缓、慢慢、悄悄、不约而同、不由得、与此同时、说时迟那时快、不知不觉、不禁、霎时、刹那、一时间。能删就删。

3. 情绪写身体反应或环境，不要直接贴标签。
   - 愤怒 → 攥紧的拳头、青筋、咬到腮帮
   - 紧张 → 手心汗、舌尖发苦、咽口水
   - 震惊 → 耳朵嗡的一下、视野缩成一点
   禁止"他感到 X""他心中 Y"这类直陈。

4. 对话允许：打断（"我以为——"）、重复（"你你你"）、口头禅、不完整句、口语缩略（"咋办""完了"）、方言。不要每个角色都说书面语。

5. 承接句省主语。"他走过去，他拉开门，他看见" 改成 "走过去，拉开门，看见"。中文允许且应该这么做。

6. 禁三段排比。不写"X 而 Y，Y 而 Z，Z 而 W"。改成不对称："X 还行，Y 就是 Z 那点事，至于 W，根本顾不上。"

7. 段落长度不均。允许一段只有一句话，下一段七八句。段段相似长度 = AI 标记。

8. 删"他想道""他心想"。心理活动直接成段，或用破折号 / 独立短段呈现。

9. 贴角色身份的口语。市井、打架、骂街场景允许粗话和俚语。文人书生场景允许半文半白。不要全篇统一调性。

10. 不要工整、不要对仗、不要文绉绉。可以有一两处不工整的标点、半句话、口头禅式的语气词（"嗯。""那个……"）。`;
