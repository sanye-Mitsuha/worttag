# Worttag 例句质量审计

生成时间：2026-08-02T03:01:38.582Z

本报告把自动识别结果和人工审核状态分开：自动识别到的模板句不会被标为已审核；“已审核”只有在存在明确编辑记录时才使用。

## 总体

- 词条总数：6000
- 已审核：0
- 待审核：2432
- 模板例句：3398
- 存在争议：170
- 优先复核队列：3568

## 按等级

| 等级 | 已审核 | 待审核 | 模板例句 | 存在争议 |
| --- | ---: | ---: | ---: | ---: |
| A1 | 0 | 538 | 139 | 23 |
| A2 | 0 | 458 | 220 | 22 |
| B1 | 0 | 573 | 398 | 29 |
| B2 | 0 | 464 | 1096 | 40 |
| C1 | 0 | 399 | 1545 | 56 |

## 模板句族

| 模板句族 | 数量 |
| --- | ---: |
| verb-conversation-prompt | 967 |
| noun-feminine-role | 771 |
| noun-masculine-focus | 664 |
| adjective-property-prompt | 620 |
| noun-neuter-topic | 265 |
| adverb-grammar-prompt | 146 |
| preposition-context-prompt | 31 |
| pronoun-reference-prompt | 16 |
| conjunction-grammar-prompt | 14 |
| noun-plural-focus | 5 |
| interjection-reaction-prompt | 4 |

## 已处理的明确问题

- A1 ein：替换为“Ich habe ein Buch.” / 我有一本书，去除不适合入门学习的身体评论。
- C1 schöpfen：修复释义中的乱码，并保留“Luft schöpfen”的德语搭配用于后续人工核验。

## 使用方式

- 词库卡片和词典详情会显示四种质量等级。
- 模板句与争议项进入优先复核队列。
- 批量替换真实例句前，应逐条完成德语语境、词义对应和中文语气审核。
