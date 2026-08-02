#!/usr/bin/env node

/**
 * Run the reproducible full-corpus example review pass.
 *
 * This pass does two things:
 * 1. It writes a conclusion for every Core 6000 entry to a review ledger.
 * 2. It replaces only deterministic template examples when a unique,
 *    target-verified Tatoeba candidate passes conservative context checks.
 *
 * Corpus-backed replacements remain "pending" in the learner-facing quality
 * index until an editor confirms the German sense and Chinese tone. The
 * ledger makes that distinction explicit instead of presenting automation as
 * human approval.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import OpenCC from "opencc-js";

const LEVELS = ["a1", "a2", "b1", "b2", "c1"];
const TATOEBA_RELEASE = "v2026-07-08";
const SOURCE_FILE = "work/tatoeba-cmn-de-v2026-07-08.examples.json";
const QUALITY_FILE = "public/wordbooks/example-quality-v1.json";
const LEDGER_FILE = "reports/example-review-ledger-v1.json";
const LEDGER_MARKDOWN_FILE = "reports/example-review-ledger-v1.md";

const UNSUITABLE_CONTEXT =
  /\b(?:Bombe|töten|Unterwäsche|Wutanfall|Schießen|Gewehr|Pistole|Krieg|Mord|Vampir|Tannenbaum)\b|炸死|内衣|脾气|枪|战争|谋杀|吸血鬼/u;

const EXPLICIT_REPAIRS = new Set([
  "core6000-a1-0005",
  "core6000-c1-5972",
]);

const toMainlandSimplified = OpenCC.Converter({ from: "twp", to: "cn" });

function cleanSpace(value) {
  return String(value ?? "").normalize("NFC").replace(/\s+/gu, " ").trim();
}

function normalizeChinese(value) {
  const replacements = {
    個: "个", 們: "们", 為: "为", 與: "与", 說: "说", 話: "话",
    時: "时", 從: "从", 對: "对", 會: "会", 還: "还", 進: "进",
    過: "过", 開: "开", 發: "发", 現: "现", 間: "间", 問: "问",
    題: "题", 點: "点", 總: "总", 經: "经", 體: "体", 學: "学",
    習: "习", 應: "应", 該: "该", 萬: "万", 專: "专", 業: "业",
    關: "关", 係: "系", 實: "实", 際: "际", 頭: "头", 丟: "丢",
    營: "营", 訴: "诉", 麼: "么", 機: "机", 號: "号", 師: "师",
    慣: "惯", 臉: "脸", 樂: "乐", 隨: "随", 靈: "灵", 懼: "惧",
    選: "选", 凍: "冻", 僵: "僵", 別: "别", 無: "无", 細: "细",
    節: "节", 賺: "赚", 錢: "钱", 國: "国", 虛: "虚", 擬: "拟",
    驗: "验", 樹: "树", 葉: "叶", 笃: "笃", 摯: "挚", 門: "门",
    剛: "刚", 這: "这", 裡: "里", 頁: "页", 買: "买", 賣: "卖",
    開: "开", 關: "关", 讓: "让", 來: "来", 出門: "出门", 這裡: "这里",
  };
  let normalized = toMainlandSimplified(cleanSpace(value));
  normalized = Array.from(normalized, (character) => replacements[character] ?? character).join("");
  normalized = normalized
    .replace(/([什怎那这])幺/gu, "$1么")
    .replace(/,/gu, "，")
    .replace(/;/gu, "；")
    .replace(/\?/gu, "？")
    .replace(/!/gu, "！")
    .replace(/\s+([，。！？；：])/gu, "$1");
  if (!/[。！？…](?:[”」』"“])?$/u.test(normalized)) normalized += "。";
  return normalized;
}

function tokenizeSurface(value) {
  return [...cleanSpace(value).matchAll(/\p{L}+(?:['’\-]\p{L}+)?/gu)].map((match) => match[0]);
}

function isUppercaseSurface(value) {
  const first = String(value ?? "")[0];
  return Boolean(first) && first === first.toLocaleUpperCase("de-DE") && first !== first.toLocaleLowerCase("de-DE");
}

function candidateFormMatches(candidate) {
  const positions = candidate.match?.tokenPositions ?? [];
  const forms = candidate.match?.forms ?? [];
  if (!positions.length || !forms.length) return false;
  const sentenceTokens = tokenizeSurface(candidate.german);
  const formTokens = tokenizeSurface(forms[0]);
  if (formTokens.length !== positions.length) return false;
  return formTokens.every((form, index) => {
    const token = sentenceTokens[positions[index]];
    return token && token.toLocaleLowerCase("de-DE") === form.toLocaleLowerCase("de-DE");
  });
}

function candidateIsUsable(entry, candidate, usedPairIds, usedGerman) {
  if (!candidate?.pairId || usedPairIds.has(candidate.pairId)) return false;
  if (!candidate.match?.targetVerified || !candidateFormMatches(candidate)) return false;
  if (!candidate.german || !candidate.chinese) return false;
  if (usedGerman.has(cleanSpace(candidate.german).toLocaleLowerCase("de-DE"))) return false;
  if (UNSUITABLE_CONTEXT.test(`${candidate.german}\n${candidate.chinese}`)) return false;
  if (/[�鰌鰂]/u.test(`${candidate.german}\n${candidate.chinese}`)) return false;
  if (tokenizeSurface(candidate.german).length < 4 || cleanSpace(candidate.chinese).length < 3) return false;

  const positions = candidate.match.tokenPositions;
  const firstPosition = positions[0];
  const surface = tokenizeSurface(candidate.german)[firstPosition];
  if (firstPosition === 0 && candidate.match.sentenceInitialCapitalizationAmbiguous) return false;

  if (entry.partOfSpeech === "noun") {
    if (firstPosition === 0 || !isUppercaseSurface(surface)) return false;
  }
  if (["adjective", "adverb", "pronoun"].includes(entry.partOfSpeech) && firstPosition === 0) return false;

  if (
    entry.partOfSpeech === "adjective"
    && (entry.reviewReasons ?? []).includes("derived_adjective_form_can_be_homographic")
  ) {
    const nextToken = tokenizeSurface(candidate.german)[firstPosition + 1];
    if (!nextToken || !isUppercaseSurface(nextToken)) return false;
  }

  return true;
}

function candidatePool(evidence) {
  const seen = new Set();
  return [evidence.selected, ...(evidence.candidates ?? [])].filter((candidate) => {
    if (!candidate?.pairId || seen.has(candidate.pairId)) return false;
    seen.add(candidate.pairId);
    return true;
  });
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function writeJsonAtomic(file, value, pretty = false) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`, "utf8");
  await rename(temporary, file);
}

async function writeTextAtomic(file, body) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  await writeFile(temporary, body, "utf8");
  await rename(temporary, file);
}

function addCount(map, key) {
  map[key] = (map[key] ?? 0) + 1;
}

const root = process.cwd();
const source = await readJson(path.join(root, SOURCE_FILE));
const quality = await readJson(path.join(root, QUALITY_FILE));
let previousLedger = null;
try {
  previousLedger = await readJson(path.join(root, LEDGER_FILE));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
const qualityById = new Map(Object.entries(quality.entries));
const sourceById = new Map(source.entries.map((entry) => [entry.id, entry]));
const previousLedgerById = new Map((previousLedger?.entries ?? []).map((entry) => [entry.id, entry]));
const entries = [];
const wordbooks = [];

for (const level of LEVELS) {
  const file = path.join(root, "public", "wordbooks", `${level}-v1.json`);
  const document = await readJson(file);
  const field = Object.fromEntries(document.fields.map((name, index) => [name, index]));
  const rows = document.words.map((row, index) => ({
    level: level.toUpperCase(),
    index,
    id: row[field.id],
    term: row[field.term],
    typeCode: row[field.typeCode],
    example: row[field.example],
    exampleZh: row[field.exampleZh],
    row,
    field,
    document,
    file,
  }));
  wordbooks.push({ document, file });
  entries.push(...rows);
}

const usedPairIds = new Set();
const usedGerman = new Set(entries.map((entry) => cleanSpace(entry.example).toLocaleLowerCase("de-DE")));
const ledgerEntries = [];
const summary = {
  total: entries.length,
  byAction: {},
  byLevel: Object.fromEntries(LEVELS.map((level) => [level.toUpperCase(), { total: 0, byAction: {} }])),
  replacements: 0,
  replacementCandidatesWithoutManualApproval: 0,
  noSafeCandidate: 0,
};

for (const entry of entries) {
  const before = qualityById.get(entry.id) ?? { status: "pending", reasonCodes: [] };
  const evidence = sourceById.get(entry.id);
  const previous = previousLedgerById.get(entry.id);
  const oldExample = entry.example;
  const oldExampleZh = entry.exampleZh;
  let action = "retained_existing_example_pending_review";
  let candidate = null;

  if (previous?.action?.startsWith("replaced_")) {
    entry.row[entry.field.exampleZh] = normalizeChinese(entry.exampleZh);
    const previousCandidate = candidatePool(evidence ?? {}).find(
      (item) => item.pairId === previous.evidence?.pairId,
    );
    if (previousCandidate) {
      usedPairIds.add(previousCandidate.pairId);
      usedGerman.add(cleanSpace(previousCandidate.german).toLocaleLowerCase("de-DE"));
    }
    action = previous.action;
    candidate = previousCandidate ?? null;
    summary.replacements += 1;
    summary.replacementCandidatesWithoutManualApproval += 1;
  } else if (EXPLICIT_REPAIRS.has(entry.id)) {
    action = "retained_explicit_editorial_repair";
  } else if (before.status === "disputed") {
    action = "retained_disputed_for_manual_review";
  } else if (before.status === "template") {
    candidate = candidatePool(evidence ?? {}).find((item) => candidateIsUsable(
      { ...entry, partOfSpeech: evidence?.partOfSpeech, reviewReasons: evidence?.reviewReasons },
      item,
      usedPairIds,
      usedGerman,
    ));
    if (candidate) {
      entry.row[entry.field.example] = cleanSpace(candidate.german);
      entry.row[entry.field.exampleZh] = normalizeChinese(candidate.chinese);
      usedPairIds.add(candidate.pairId);
      usedGerman.add(cleanSpace(candidate.german).toLocaleLowerCase("de-DE"));
      action = "replaced_template_with_tatoeba_candidate_pending_editorial_confirmation";
      summary.replacements += 1;
      summary.replacementCandidatesWithoutManualApproval += 1;
    } else {
      action = "retained_template_without_safe_candidate";
      summary.noSafeCandidate += 1;
    }
  }

  addCount(summary.byAction, action);
  summary.byLevel[entry.level].total += 1;
  addCount(summary.byLevel[entry.level].byAction, action);
  ledgerEntries.push({
    id: entry.id,
    level: entry.level,
    index: entry.index,
    term: entry.term,
    qualityStatusBefore: before.status,
    action,
    oldExample,
    oldExampleZh,
    newExample: entry.row[entry.field.example],
    newExampleZh: entry.row[entry.field.exampleZh],
    evidence: candidate
      ? {
        source: "OPUS Tatoeba",
        release: TATOEBA_RELEASE,
        pairId: candidate.pairId,
        sourceLine: candidate.sourceLine,
        match: candidate.match,
        sourceReviewReasons: evidence?.reviewReasons ?? [],
        policy: "corpus_candidate_applied_but_left_pending_editorial_confirmation",
      }
      : {
        source: EXPLICIT_REPAIRS.has(entry.id) ? "Worttag editorial repair" : "Worttag quality audit",
        reasonCodes: before.reasonCodes ?? [],
        sourceReviewReasons: evidence?.reviewReasons ?? [],
      },
  });
}

if (ledgerEntries.length !== 6000) {
  throw new Error(`Expected 6000 ledger entries, got ${ledgerEntries.length}`);
}

for (const { document, file } of wordbooks) {
  await writeJsonAtomic(file, document);
}

const generatedAt = new Date().toISOString();
const ledger = {
  schemaVersion: 1,
  generatedAt,
  corpus: "Worttag Core 6000",
  source: {
    corpus: "OPUS Tatoeba",
    release: TATOEBA_RELEASE,
    languagePair: "cmn-de",
    cache: SOURCE_FILE,
  },
  policy: {
    scope: "all 6000 entries",
    templateReplacement: "only target-verified, unique, context-screened candidates",
    approval: "automated corpus evidence is not presented as human approval",
  },
  summary,
  entries: ledgerEntries,
};
await writeJsonAtomic(path.join(root, LEDGER_FILE), ledger, true);

const actionRows = Object.entries(summary.byAction)
  .sort(([, left], [, right]) => right - left)
  .map(([action, count]) => `| ${action} | ${count} |`)
  .join("\n");
const levelRows = LEVELS.map((level) => {
  const levelSummary = summary.byLevel[level.toUpperCase()];
  return `| ${level.toUpperCase()} | ${levelSummary.total} | ${Object.entries(levelSummary.byAction).map(([key, value]) => `${key}: ${value}`).join("; ")} |`;
}).join("\n");
const markdown = `# Worttag Core 6000 全量例句审核台账

生成时间：${generatedAt}

本轮覆盖全部 ${ledgerEntries.length} 条词条。自动替换只使用带来源的 OPUS Tatoeba 德中例句，并经过词形、词性、首字母歧义、重复复用和学习场景筛选。替换结果仍标记为“待审核”，不冒充人工终审。

## 结果

- 已建立逐条结论：${ledgerEntries.length} 条
- 替换模板例句：${summary.replacements} 条
- 没有安全候选而保留模板：${summary.noSafeCandidate} 条
- 明确争议项保留人工复核：${summary.byAction.retained_disputed_for_manual_review ?? 0} 条
- 版本号：保持 beta3.0 / package 2.0.0

## 按处理动作

| 处理动作 | 数量 |
| --- | ---: |
${actionRows}

## 按等级

| 等级 | 总数 | 处理分布 |
| --- | ---: | --- |
${levelRows}

## 替换规则

- 目标词必须被 Tatoeba 匹配器确认，并在例句中作为完整词形出现。
- 过滤句首大小写导致的词性歧义，以及德语词形/词性无法确认的候选。
- 名词要求在句中呈现德语名词大写形式；派生形容词要求有明确的名词搭配。
- 过滤重复使用、乱码、危险或不适合学习的语境，并规范中文标点与繁简体。
- 每条替换记录保留 pairId、来源行号、匹配模式和原始复核原因。

## 后续人工队列

未被安全替换的模板句、存在争议的词义/翻译、以及本轮替换后的 Tatoeba 候选，继续显示在质量审核队列中；它们不会被错误地标为“已审核”。
`;
await writeTextAtomic(path.join(root, LEDGER_MARKDOWN_FILE), markdown);
process.stdout.write(`${JSON.stringify({ ...summary, generatedAt }, null, 2)}\n`);
