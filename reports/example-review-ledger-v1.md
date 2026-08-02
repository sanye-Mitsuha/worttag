# Worttag 例句全量清理台账

生成时间：2026-08-02T04:37:00.366Z

本轮清理固定模板句、机械化原创句与低质量文学摘录，并对保留的文学短句逐条保留书名归属。清理后的例句继续进入待审核队列，不把自动处理冒充为人工终审。

## 结果

- 词条总数：6000
- 已替换或修复例句：2149
- 固定模板残留：由质量审计确认 0 条
- 精选文学短句：34 条
- 版本号：保持 beta3.0 / package 2.0.0

## 按处理动作

| 处理动作 | 数量 |
| --- | ---: |
| repaired_example_target_match_after_template_upgrade | 25 |
| repaired_generated_context_with_editorial_review | 13 |
| repaired_generated_context_with_normal_example | 2030 |
| replaced_literary_source_with_curated_short_source | 34 |
| replaced_literary_source_with_editorial_review_example | 5 |
| replaced_template_with_editorial_review_example | 41 |
| replaced_template_with_tatoeba_candidate | 1 |
| retained_existing_example | 3851 |

## 按等级

| 等级 | 总数 | 处理分布 |
| --- | ---: | --- |
| A1 | 700 | retained_existing_example: 646; repaired_generated_context_with_normal_example: 49; replaced_literary_source_with_curated_short_source: 1; repaired_generated_context_with_editorial_review: 1; replaced_template_with_editorial_review_example: 3 |
| A2 | 700 | retained_existing_example: 602; repaired_generated_context_with_normal_example: 84; replaced_template_with_editorial_review_example: 8; replaced_literary_source_with_curated_short_source: 3; repaired_generated_context_with_editorial_review: 2; repaired_example_target_match_after_template_upgrade: 1 |
| B1 | 1000 | retained_existing_example: 852; repaired_generated_context_with_normal_example: 126; replaced_template_with_editorial_review_example: 11; replaced_literary_source_with_curated_short_source: 2; repaired_generated_context_with_editorial_review: 6; replaced_literary_source_with_editorial_review_example: 2; repaired_example_target_match_after_template_upgrade: 1 |
| B2 | 1600 | retained_existing_example: 922; repaired_generated_context_with_normal_example: 630; replaced_template_with_editorial_review_example: 11; repaired_generated_context_with_editorial_review: 3; replaced_literary_source_with_curated_short_source: 15; repaired_example_target_match_after_template_upgrade: 15; replaced_template_with_tatoeba_candidate: 1; replaced_literary_source_with_editorial_review_example: 3 |
| C1 | 2000 | repaired_generated_context_with_normal_example: 1141; retained_existing_example: 829; replaced_literary_source_with_curated_short_source: 13; replaced_template_with_editorial_review_example: 8; repaired_generated_context_with_editorial_review: 1; repaired_example_target_match_after_template_upgrade: 8 |

## 归属规则

- 只有确实来自公开文本且通过短句筛选的文学来源才附加“——《书名》”。
- 原创学习例句不冒充文学引文，继续进入待审核队列。
- 乱码、危险语境、固定模板句和未命中目标词的例句不会写入结果。
