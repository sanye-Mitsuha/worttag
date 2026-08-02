#!/usr/bin/env node

/**
 * Build the learner-facing example-quality index without rewriting examples.
 *
 * The four statuses are intentionally conservative:
 * - approved: an explicit curated/editorial record exists;
 * - pending: the example is not yet reviewed by an editor;
 * - template: the example exactly matches the deterministic fallback generator;
 * - disputed: the audit found a content risk or a manually recorded issue.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { buildAuditReport } from "./audit_wordbooks.mjs";

const LEVELS = ["A1", "A2", "B1", "B2", "C1"];
const SUBJECTS = [
  "Im Alltag",
  "Im Unterricht",
  "In einem Gespräch",
  "Bei der Arbeit",
  "In der Stadt",
  "Für viele Menschen",
  "In diesem Zusammenhang",
  "Am Morgen",
  "Während des Lernens",
];
const MANUAL_REVIEW_NOTES = {
  "core6000-a1-0005": ["inappropriate_beginner_content_corrected"],
};
const DISPUTED_AUDIT_FLAGS = new Set([
  "meaning_placeholder",
  "meaning_machine_prompt_residue",
  "meaning_latin_residue",
  "advanced_single_character_gloss",
  "chinese_traditional_residue",
  "chinese_corrupt_script",
  "chinese_known_garbage_phrase",
  "chinese_repeated_terminal_punctuation",
  "verb_perfect_auxiliary_unconjugated",
  "example_synthetic_placeholder",
  "example_known_unrelated",
  "example_translation_known_unrelated",
  "example_target_not_detected",
  "example_reused_three_plus",
  "noun_article_type_mismatch",
  "dictionary_not_found",
  "dictionary_no_senses",
  "dictionary_pos_mismatch",
  "dictionary_noun_article_mismatch",
  "phrase_headword_only",
  "cefr_evidence_missing",
  "provenance_missing",
]);

const STATUS_DEFINITIONS = {
  approved: { label: "已审核", description: "已有明确的编辑审核记录。" },
  pending: { label: "待审核", description: "尚未完成例句与中文译文的人工审核。" },
  template: { label: "模板例句", description: "例句命中通用生成模板，需优先替换为真实语境。" },
  disputed: { label: "存在争议", description: "发现乱码、译文风险、语义疑点或其他需要人工判断的问题。" },
};

function cleanSpace(value) {
  return String(value ?? "").normalize("NFC").replace(/\s+/gu, " ").trim();
}

function visibleTerm(term) {
  return cleanSpace(term).replace(/\s+·.*$/u, "").trim();
}

function nounHeadword(term) {
  return visibleTerm(term)
    .replace(/^(?:der|die|das)\s+/iu, "")
    .replace(/\(Pl\.\)\s*/iu, "")
    .trim();
}

function generatedFallback(entry, index) {
  const term = visibleTerm(entry.term);
  const noun = nounHeadword(term);
  const subject = SUBJECTS[index % SUBJECTS.length];
  switch (entry.typeCode) {
    case "nm":
      return { family: "noun-masculine-focus", example: `${subject} steht der ${noun} im Mittelpunkt.` };
    case "nf":
      if (/\(Pl\.\)/iu.test(entry.term)) {
        return { family: "noun-plural-focus", example: `${subject} stehen die ${noun} im Mittelpunkt.` };
      }
      return { family: "noun-feminine-role", example: `${subject} spielt die ${noun} eine wichtige Rolle.` };
    case "nn":
      return { family: "noun-neuter-topic", example: `${subject} bleibt das ${noun} ein wichtiges Thema.` };
    case "v":
      return { family: "verb-conversation-prompt", example: `Im Gespräch kann man „${term}“ passend verwenden.` };
    case "adj":
      return { family: "adjective-property-prompt", example: `Im Satz beschreibt „${term}“ eine Eigenschaft.` };
    case "adv":
      return { family: "adverb-grammar-prompt", example: `Im Satz zeigt „${term}“, wann, wo oder wie etwas geschieht.` };
    case "prep":
      return { family: "preposition-context-prompt", example: `Mit „${term}“ verbindet man im Deutschen eine Handlung mit ihrem Kontext.` };
    case "conj":
      return { family: "conjunction-grammar-prompt", example: `Mit „${term}“ verbindet man im Deutschen zwei Satzteile.` };
    case "pron":
      return { family: "pronoun-reference-prompt", example: `Mit „${term}“ verweist man im Satz auf eine Person oder eine Sache.` };
    case "det":
      return { family: "determiner-grammar-prompt", example: `Der Artikel „${term}“ steht vor einem Nomen.` };
    case "intj":
      return { family: "interjection-reaction-prompt", example: `„${term}“ zeigt im Gespräch eine unmittelbare Reaktion.` };
    default:
      return { family: "generic-context-prompt", example: `Im Gespräch passt das Wort „${term}“ gut in diesen Zusammenhang.` };
  }
}

async function readWordbook(root, level) {
  const file = path.join(root, "public", "wordbooks", `${level.toLowerCase()}-v1.json`);
  const document = JSON.parse(await readFile(file, "utf8"));
  return document.words.map((row, index) => ({
    level,
    index,
    id: row[0],
    term: row[1],
    forms: row[2],
    typeCode: row[3],
    meaning: row[4],
    example: row[5],
    exampleZh: row[6],
  }));
}

async function writeJsonAtomic(file, value, pretty = false) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  const body = `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`;
  await writeFile(temporary, body, "utf8");
  await rename(temporary, file);
}

async function writeTextAtomic(file, body) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  await writeFile(temporary, body, "utf8");
  await rename(temporary, file);
}

const root = process.cwd();
const generatedAt = new Date().toISOString();
const entries = (await Promise.all(LEVELS.map((level) => readWordbook(root, level)))).flat();
const audit = await buildAuditReport({ root, cachePath: null, generatedAt });
const auditById = new Map(audit.entries.map((entry) => [entry.id, entry]));
let reviewLedger = null;
try {
  reviewLedger = JSON.parse(await readFile(path.join(root, "reports", "example-review-ledger-v1.json"), "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
const reviewLedgerById = new Map((reviewLedger?.entries ?? []).map((entry) => [entry.id, entry]));
const qualityEntries = {};
const summary = {
  total: entries.length,
  byStatus: Object.fromEntries(Object.keys(STATUS_DEFINITIONS).map((status) => [status, 0])),
  byLevel: Object.fromEntries(LEVELS.map((level) => [level, {
    total: 0,
    byStatus: Object.fromEntries(Object.keys(STATUS_DEFINITIONS).map((status) => [status, 0])),
  }])),
  templateFamilies: {},
  priorityReviewCount: 0,
};

for (const entry of entries) {
  const auditEntry = auditById.get(entry.id);
  const fallback = generatedFallback(entry, entry.index);
  const isTemplate = fallback.example === entry.example;
  const flagged = (auditEntry?.flags ?? []).filter((flag) => DISPUTED_AUDIT_FLAGS.has(flag));
  const reasons = flagged;
  const ledgerEntry = reviewLedgerById.get(entry.id);
  const reviewNotes = [...(MANUAL_REVIEW_NOTES[entry.id] ?? [])];
  if (ledgerEntry?.action?.startsWith("replaced_")) {
    reviewNotes.push("tatoeba_candidate_applied_pending_editorial_confirmation");
  }
  if (ledgerEntry?.action === "retained_template_without_safe_candidate") {
    reviewNotes.push("full_corpus_review_no_safe_candidate");
  }
  let status = "pending";
  if (reasons.length) status = "disputed";
  else if (isTemplate) status = "template";
  else if (auditEntry?.sourceKind === "curated" || auditEntry?.editorial?.status === "curated") status = "approved";

  qualityEntries[entry.id] = {
    status,
    reasonCodes: reasons,
    templateFamily: isTemplate ? fallback.family : null,
    reviewNotes,
    reviewEvidence: ledgerEntry?.evidence?.source
      ? {
        action: ledgerEntry.action,
        source: ledgerEntry.evidence.source,
        release: ledgerEntry.evidence.release ?? null,
        pairId: ledgerEntry.evidence.pairId ?? null,
        sourceLine: ledgerEntry.evidence.sourceLine ?? null,
      }
      : null,
  };
  summary.byStatus[status] += 1;
  summary.byLevel[entry.level].total += 1;
  summary.byLevel[entry.level].byStatus[status] += 1;
  if (isTemplate) summary.templateFamilies[fallback.family] = (summary.templateFamilies[fallback.family] ?? 0) + 1;
  if (status === "template" || status === "disputed") summary.priorityReviewCount += 1;
}

const resource = {
  schemaVersion: 1,
  generatedAt,
  count: entries.length,
  statusDefinitions: STATUS_DEFINITIONS,
  summary,
  fullReview: reviewLedger?.summary ?? null,
  entries: qualityEntries,
};
await writeJsonAtomic(path.join(root, "public", "wordbooks", "example-quality-v1.json"), resource);
await writeJsonAtomic(path.join(root, "reports", "example-quality-audit-v1.json"), {
  ...resource,
  auditSource: {
    corpus: "public/wordbooks/*-v1.json",
    structuralAudit: "scripts/audit_wordbooks.mjs",
    policy: "模板句与风险项自动标记，已审核只接受明确编辑记录。",
    fullReviewLedger: reviewLedger ? "reports/example-review-ledger-v1.json" : null,
  },
}, true);
const levelTable = LEVELS.map((level) => {
  const counts = summary.byLevel[level].byStatus;
  return `| ${level} | ${counts.approved} | ${counts.pending} | ${counts.template} | ${counts.disputed} |`;
}).join("\n");
const familyTable = Object.entries(summary.templateFamilies)
  .sort(([, left], [, right]) => right - left)
  .map(([family, count]) => `| ${family} | ${count} |`)
  .join("\n");
const markdown = `# Worttag 例句质量审计\n\n生成时间：${generatedAt}\n\n本报告把自动识别结果和人工审核状态分开：自动识别到的模板句不会被标为已审核；“已审核”只有在存在明确编辑记录时才使用。\n\n## 总体\n\n- 词条总数：${summary.total}\n- 已审核：${summary.byStatus.approved}\n- 待审核：${summary.byStatus.pending}\n- 模板例句：${summary.byStatus.template}\n- 存在争议：${summary.byStatus.disputed}\n- 优先复核队列：${summary.priorityReviewCount}\n\n## 按等级\n\n| 等级 | 已审核 | 待审核 | 模板例句 | 存在争议 |\n| --- | ---: | ---: | ---: | ---: |\n${levelTable}\n\n## 模板句族\n\n| 模板句族 | 数量 |\n| --- | ---: |\n${familyTable}\n\n## 已处理的明确问题\n\n- A1 ein：替换为“Ich habe ein Buch.” / 我有一本书。，去除不适合入门学习的身体评论。\n- C1 schöpfen：修复释义中的乱码，并保留“Luft schöpfen”的德语搭配用于后续人工核验。\n\n## 使用方式\n\n- 词库卡片和词典详情会显示四种质量等级。\n- 模板句与争议项进入优先复核队列。\n- 批量替换真实例句前，应逐条完成德语语境、词义对应和中文语气审核。\n\n## 全量审核台账\n\n本次已为全部 ${summary.total} 条词条建立逐条处理结论。另有 ${reviewLedger?.summary?.replacements ?? 0} 条模板句替换为带 Tatoeba 来源的候选，但仍保留在待审核队列，详见 reports/example-review-ledger-v1.md。\n`;
await writeTextAtomic(
  path.join(root, "reports", "example-quality-audit-v1.md"),
  markdown.replace("我有一本书。，", "我有一本书，"),
);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
