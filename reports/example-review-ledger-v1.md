# Worttag Core 6000 全量例句审核台账

生成时间：2026-08-02T03:22:14.076Z

本轮覆盖全部 6000 条词条。自动替换只使用带来源的 OPUS Tatoeba 德中例句，并经过词形、词性、首字母歧义、重复复用和学习场景筛选。替换结果仍标记为“待审核”，不冒充人工终审。

## 结果

- 已建立逐条结论：6000 条
- 替换模板例句：64 条
- 没有安全候选而保留模板：3334 条
- 明确争议项保留人工复核：169 条
- 版本号：保持 beta3.0 / package 2.0.0

## 按处理动作

| 处理动作 | 数量 |
| --- | ---: |
| retained_template_without_safe_candidate | 3334 |
| retained_existing_example_pending_review | 2431 |
| retained_disputed_for_manual_review | 169 |
| replaced_template_with_tatoeba_candidate_pending_editorial_confirmation | 64 |
| retained_explicit_editorial_repair | 2 |

## 按等级

| 等级 | 总数 | 处理分布 |
| --- | ---: | --- |
| A1 | 700 | retained_existing_example_pending_review: 537; retained_template_without_safe_candidate: 124; retained_explicit_editorial_repair: 1; retained_disputed_for_manual_review: 23; replaced_template_with_tatoeba_candidate_pending_editorial_confirmation: 15 |
| A2 | 700 | retained_existing_example_pending_review: 458; retained_template_without_safe_candidate: 204; replaced_template_with_tatoeba_candidate_pending_editorial_confirmation: 16; retained_disputed_for_manual_review: 22 |
| B1 | 1000 | retained_existing_example_pending_review: 573; retained_disputed_for_manual_review: 29; retained_template_without_safe_candidate: 382; replaced_template_with_tatoeba_candidate_pending_editorial_confirmation: 16 |
| B2 | 1600 | retained_template_without_safe_candidate: 1084; retained_existing_example_pending_review: 464; retained_disputed_for_manual_review: 40; replaced_template_with_tatoeba_candidate_pending_editorial_confirmation: 12 |
| C1 | 2000 | retained_template_without_safe_candidate: 1540; retained_existing_example_pending_review: 399; retained_disputed_for_manual_review: 55; replaced_template_with_tatoeba_candidate_pending_editorial_confirmation: 5; retained_explicit_editorial_repair: 1 |

## 替换规则

- 目标词必须被 Tatoeba 匹配器确认，并在例句中作为完整词形出现。
- 过滤句首大小写导致的词性歧义，以及德语词形/词性无法确认的候选。
- 名词要求在句中呈现德语名词大写形式；派生形容词要求有明确的名词搭配。
- 过滤重复使用、乱码、危险或不适合学习的语境，并规范中文标点与繁简体。
- 每条替换记录保留 pairId、来源行号、匹配模式和原始复核原因。

## 后续人工队列

未被安全替换的模板句、存在争议的词义/翻译、以及本轮替换后的 Tatoeba 候选，继续显示在质量审核队列中；它们不会被错误地标为“已审核”。
