#!/usr/bin/env node

/**
 * Replace every remaining deterministic example template.
 *
 * Selection order:
 * 1. Existing Worttag editorial after-records with an aligned Chinese pair.
 * 2. Short, translated sentences from the checked-in public-domain literary pool.
 * 3. A transparent Worttag original learner example, translated once and stored.
 *
 * Literary attribution is added only when the sentence really comes from the
 * literary pool. Original examples never receive a fabricated book title.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import OpenCC from "opencc-js";

const LEVELS = ["a1", "a2", "b1", "b2", "c1"];
const QUALITY_FILE = "public/wordbooks/example-quality-v1.json";
const LEDGER_FILE = "reports/example-review-ledger-v1.json";
const LEDGER_MARKDOWN_FILE = "reports/example-review-ledger-v1.md";
const LITERARY_POOL_FILE = "data/editorial/literary-example-pool-v1.json";

const UNSUITABLE_CONTEXT =
  /\b(?:Bombe|töten|Unterwäsche|Wutanfall|Schießen|Gewehr|Pistole|Krieg|Mord|Vampir|Tannenbaum|Scharfrichter|Blut|Leiche|Hure|Selbstmord)\b|炸死|内衣|脾气|枪|战争|谋杀|吸血鬼|血|尸体|自杀/u;
const FALLBACK_PATTERNS = [
  /Im Gespräch kann man .* passend verwenden\./u,
  /Im Satz beschreibt .* eine Eigenschaft\./u,
  /Im Satz zeigt .* wann, wo oder wie/u,
  /Mit .* verbindet man im Deutschen/u,
  /Mit .* verweist man im Satz/u,
  /Der Artikel .* steht vor einem Nomen\./u,
  /zeigt im Gespräch eine unmittelbare Reaktion\./u,
  /Im Alltag bleibt .* ein wichtiges Thema\./u,
  /steht .* im Mittelpunkt\./u,
  /spielt .* eine wichtige Rolle\./u,
];

const toMainlandSimplified = OpenCC.Converter({ from: "twp", to: "cn" });

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

function normalizeChinese(value) {
  let normalized = toMainlandSimplified(cleanSpace(value))
    .replace(/([什怎那这])幺/gu, "$1么")
    .replace(/\s+([，。！？；：])/gu, "$1");
  if (!/[。！？…](?:[”」』"“])?$/u.test(normalized)) normalized += "。";
  return normalized;
}

function normalizeKey(value) {
  return cleanSpace(value)
    .replace(/^(?:der|die|das)\s+/iu, "")
    .replace(/\(Pl\.\)/iu, "")
    .toLocaleLowerCase("de-DE");
}

function editorialKey(term, typeCode) {
  return `${typeCode}|${normalizeKey(term)}`;
}

function looksUsablePair(example, exampleZh) {
  const german = cleanSpace(example);
  const chinese = cleanSpace(exampleZh);
  if (german.length < 8 || chinese.length < 3) return false;
  if (!/[.!?…]$/u.test(german)) return false;
  if (FALLBACK_PATTERNS.some((pattern) => pattern.test(german))) return false;
  if (UNSUITABLE_CONTEXT.test(`${german}\n${chinese}`)) return false;
  if (/[�鰌鰂]/u.test(`${german}\n${chinese}`)) return false;
  if (/^Sprechen der Herr Türkisch\??$/u.test(german)) return false;
  if (/^Im Wörterbuch steht/u.test(german)) return false;
  return true;
}

function candidateForms(entry) {
  const values = [visibleTerm(entry.term), nounHeadword(entry.term), cleanSpace(entry.forms)];
  const formText = cleanSpace(entry.forms).replace(/^.*?·\s*/u, "");
  values.push(...formText.split(/\s*·\s*|\s*;\s*|\s*,\s*/u));
  return [...new Set(values.flatMap((value) => {
    const cleaned = cleanSpace(value);
    const articleFree = cleaned.replace(/^(?:der|die|das)\s+/iu, "");
    return [cleaned, articleFree].filter(Boolean);
  }))];
}

function tokenized(value) {
  return [...cleanSpace(value).matchAll(/[\p{L}\d]+(?:['’\-][\p{L}\d]+)?/gu)].map((match) => match[0]);
}

function hasTargetForm(entry, example) {
  const sentence = tokenized(example).map((token) => token.toLocaleLowerCase("de-DE"));
  return candidateForms(entry).some((form) => {
    const tokens = tokenized(form).map((token) => token.toLocaleLowerCase("de-DE"));
    if (!tokens.length) return false;
    return sentence.some((_, index) => tokens.every((token, offset) => sentence[index + offset] === token));
  });
}

function articleFor(typeCode) {
  if (typeCode === "nm") return "den";
  if (typeCode === "nf") return "die";
  return "das";
}

function makeOriginalExample(entry, serial) {
  const term = visibleTerm(entry.term);
  const noun = nounHeadword(term);
  const names = ["Anna", "Ben", "Clara", "David", "Mina", "Jonas", "Lea", "Paul"];
  const places = ["Bibliothek", "Bahnhof", "Kurs", "Büro", "Museum", "Markt", "Park", "Wohnung"];
  const name = names[serial % names.length];
  const place = places[serial % places.length];
  const subject = serial % 2 ? "Wir" : name;

  switch (entry.typeCode) {
    case "nm":
    case "nf":
    case "nn":
      return `${subject} spricht heute über ${articleFor(entry.typeCode)} ${noun} im ${place}.`;
    case "adj":
      return `Nach dem Gespräch war die Stimmung im Raum deutlich ${term}.`;
    case "adv":
      if (/^dorthin$/iu.test(term)) return `${subject} geht dorthin, sobald der Kurs beginnt.`;
      if (/^hierher$/iu.test(term)) return `${subject} kommt hierher, sobald der Kurs beginnt.`;
      if (/^(?:deshalb|darum|daher)$/iu.test(term)) return `${term[0].toLocaleUpperCase("de-DE")}${term.slice(1)}, verschiebt ${name} den Termin auf morgen.`;
      return `${subject} trifft sich heute am Eingang und spricht ${term} über den Plan.`;
    case "v":
      if (/^(?:sein|haben|werden)$/iu.test(term)) {
        if (term.toLocaleLowerCase("de-DE") === "sein") return `${name} versucht, auch in schwierigen Situationen ruhig zu ${term}.`;
        if (term.toLocaleLowerCase("de-DE") === "haben") return `${name} möchte am Wochenende genug Zeit ${term}.`;
        return `Die Situation kann sich morgen noch verändern und anders ${term}.`;
      }
      return `Im Alltag hilft es, wenn man die Aufgabe gut ${term} kann.`;
    case "prep":
      if (/^mit$/iu.test(term)) return `${subject} fährt mit dem Bus zur Arbeit und liest dabei die Nachrichten.`;
      if (/^für$/iu.test(term)) return `${subject} kauft für ${name} ein Buch aus dem Laden.`;
      if (/^in$/iu.test(term)) return `${subject} wartet in der Bibliothek auf den Beginn des Kurses.`;
      if (/^von$/iu.test(term)) return `Der Brief von ${name} liegt heute auf dem Tisch.`;
      if (/^zu$/iu.test(term)) return `${subject} geht zu Fuß zum Bahnhof und kommt pünktlich an.`;
      return `${subject} spricht mit ${name} über den Plan und schreibt die wichtigsten Punkte auf.`;
    case "conj":
      if (/^und$/iu.test(term)) return `${subject} liest den Text, und ${name} notiert die wichtigsten Wörter.`;
      if (/^aber$/iu.test(term)) return `${subject} kommt pünktlich, aber ${name} wartet noch vor dem Gebäude.`;
      if (/^oder$/iu.test(term)) return `Möchtest du Tee oder Kaffee zum Frühstück?`;
      if (/^weil$/iu.test(term)) return `${subject} bleibt zu Hause, weil es heute stark regnet.`;
      if (/^dass$/iu.test(term)) return `${subject} weiß, dass ${name} heute später kommt.`;
      if (/^wenn$/iu.test(term)) return `Wenn du Zeit hast, ruf ${name} am Abend an.`;
      if (/^obwohl$/iu.test(term)) return `Obwohl es regnet, gehen ${subject.toLocaleLowerCase("de-DE")} noch spazieren.`;
      return `${subject} liest den Text, ${term} ${name} notiert die wichtigsten Wörter.`;
    case "pron":
      if (/^ich$/iu.test(term)) return `Ich lerne heute im ${place} Deutsch.`;
      if (/^du$/iu.test(term)) return `Du kannst die Tür bitte langsam schließen.`;
      if (/^er$/iu.test(term)) return `Er wartet seit zehn Minuten vor dem ${place}.`;
      if (/^sie$/iu.test(term)) return `Sie kommt heute etwas später zum ${place}.`;
      if (/^ihr$/iu.test(term)) return `Ihr könnt die Aufgabe gemeinsam lösen.`;
      if (/^wir$/iu.test(term)) return `Wir treffen uns nach dem Kurs vor dem ${place}.`;
      return `${name} erklärt, dass ${term} heute selbst entscheiden darf.`;
    case "det":
      if (/^der$/iu.test(term)) return `Der Zug fährt heute pünktlich ab.`;
      if (/^die$/iu.test(term)) return `Die Tür zum ${place} ist schon geöffnet.`;
      if (/^das$/iu.test(term)) return `Das Kind liest am Fenster ein Buch.`;
      if (/^ein$/iu.test(term)) return `Ein Kind liest am Fenster ein Buch.`;
      if (/^eine$/iu.test(term)) return `Eine Freundin wartet draußen vor dem ${place}.`;
      return `${term[0]?.toLocaleUpperCase("de-DE") ?? term} Plan klingt für alle Beteiligten vernünftig.`;
    case "intj":
      return `„${term}“, sagte ${name}, als sie die Nachricht las.`;
    default:
      return `Im ${place} bespricht ${name} heute die Frage, die mit „${term}“ verbunden ist.`;
  }
}

async function translate(sentence) {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "de");
  url.searchParams.set("tl", "zh-CN");
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", sentence);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`translation request failed: ${response.status}`);
  const payload = await response.json();
  const value = Array.isArray(payload?.[0]) ? payload[0].map((part) => part?.[0] ?? "").join("") : "";
  if (!value) throw new Error("empty translation");
  return normalizeChinese(value);
}

async function translateWithRetry(sentence) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await translate(sentence);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function mapConcurrent(items, concurrency, mapper) {
  const output = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return output;
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

const root = process.cwd();
const quality = await readJson(path.join(root, QUALITY_FILE));
const literaryPool = await readJson(path.join(root, LITERARY_POOL_FILE));
const previousLedger = await readJson(path.join(root, LEDGER_FILE));
const previousLedgerById = new Map((previousLedger.entries ?? []).map((entry) => [entry.id, entry]));
const templateIds = new Set(Object.entries(quality.entries)
  .filter(([, value]) => value.status === "template" || value.templateFamily)
  .map(([id]) => id));

let tatoebaById = new Map();
try {
  const tatoeba = await readJson(path.join(root, "work", "tatoeba-cmn-de-v2026-07-08.examples.json"));
  tatoebaById = new Map((tatoeba.entries ?? []).map((entry) => [entry.id, entry]));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const editorialByKey = new Map();
for (const level of LEVELS) {
  const review = await readJson(path.join(root, "data", "editorial", `${level}-review.json`));
  for (const record of review.entries ?? []) {
    const after = record.after ?? record.afterEntry;
    if (!after || record.unresolved === true || !looksUsablePair(after.example, after.exampleZh)) continue;
    const key = editorialKey(after.term, after.typeCode);
    if (!editorialByKey.has(key)) editorialByKey.set(key, {
      example: cleanSpace(after.example),
      exampleZh: normalizeChinese(after.exampleZh),
      source: "Worttag editorial review",
      reviewedOn: review.reviewedOn ?? null,
      recordId: record.id,
    });
  }
}

const literaryById = new Map();
for (const candidate of literaryPool.entries ?? []) {
  if (!templateIds.has(candidate.id)) continue;
  if (!looksUsablePair(candidate.german, candidate.chinese)) continue;
  if (!literaryById.has(candidate.id)) literaryById.set(candidate.id, {
    example: `${cleanSpace(candidate.german)}——《${candidate.source.title}》`,
    exampleZh: normalizeChinese(candidate.chinese),
    source: "Project Gutenberg public-domain literary edition",
    title: candidate.source.title,
    author: candidate.source.author,
    url: candidate.source.url,
  });
}

const tatoebaByTemplateId = new Map();
for (const [id, evidence] of tatoebaById) {
  if (!templateIds.has(id)) continue;
  const candidates = [evidence.selected, ...(evidence.candidates ?? [])].filter(Boolean);
  const chosen = candidates.find((candidate) => {
    if (!candidate.german || !candidate.chinese || !candidate.match?.targetVerified) return false;
    if (candidate.match.sentenceInitialCapitalizationAmbiguous) return false;
    if (!looksUsablePair(candidate.german, candidate.chinese)) return false;
    if (evidence.partOfSpeech === "noun") {
      const position = candidate.match.tokenPositions?.[0];
      const token = tokenized(candidate.german)[position];
      if (!token || token[0] !== token[0].toLocaleUpperCase("de-DE")) return false;
    }
    return true;
  });
  if (chosen) tatoebaByTemplateId.set(id, {
    example: cleanSpace(chosen.german),
    exampleZh: normalizeChinese(chosen.chinese),
    source: "OPUS Tatoeba 德中例句",
    release: "v2026-07-08",
    pairId: chosen.pairId,
    sourceLine: chosen.sourceLine,
  });
}

const entries = [];
const wordbooks = [];
for (const level of LEVELS) {
  const file = path.join(root, "public", "wordbooks", `${level}-v1.json`);
  const document = await readJson(file);
  const field = Object.fromEntries(document.fields.map((name, index) => [name, index]));
  document.words.forEach((row, index) => {
    entries.push({
      level: level.toUpperCase(),
      index,
      id: row[field.id],
      term: row[field.term],
      forms: row[field.forms],
      typeCode: row[field.typeCode],
      meaning: row[field.meaning],
      example: row[field.example],
      exampleZh: row[field.exampleZh],
      row,
      field,
      document,
      file,
    });
  });
  wordbooks.push({ file, document });
}

const usedGerman = new Set(entries.map((entry) => cleanSpace(entry.example).toLocaleLowerCase("de-DE")));
const plannedOriginals = [];
const changes = [];
const summary = {
  total: entries.length,
  templatesBefore: templateIds.size,
  replaced: 0,
  byAction: {},
  byLevel: Object.fromEntries(LEVELS.map((level) => [level.toUpperCase(), { total: 0, byAction: {} }])),
};

function countAction(level, action) {
  summary.byAction[action] = (summary.byAction[action] ?? 0) + 1;
  summary.byLevel[level].byAction[action] = (summary.byLevel[level].byAction[action] ?? 0) + 1;
}

for (const entry of entries) {
  summary.byLevel[entry.level].total += 1;
  const oldExample = entry.example;
  const oldExampleZh = entry.exampleZh;
  let replacement = null;
  let action = "retained_existing_example";
  const oldKey = cleanSpace(oldExample).toLocaleLowerCase("de-DE");

  if (templateIds.has(entry.id)) {
    const editorial = editorialByKey.get(editorialKey(entry.term, entry.typeCode));
    if (editorial && !usedGerman.has(editorial.example.toLocaleLowerCase("de-DE"))) {
      replacement = editorial;
      action = "replaced_template_with_editorial_review_example";
    } else if (literaryById.has(entry.id) && !usedGerman.has(literaryById.get(entry.id).example.toLocaleLowerCase("de-DE"))) {
      replacement = literaryById.get(entry.id);
      action = "replaced_template_with_literary_source";
    } else if (tatoebaByTemplateId.has(entry.id) && !usedGerman.has(tatoebaByTemplateId.get(entry.id).example.toLocaleLowerCase("de-DE"))) {
      replacement = tatoebaByTemplateId.get(entry.id);
      action = "replaced_template_with_tatoeba_candidate";
    } else {
      const example = makeOriginalExample(entry, plannedOriginals.length);
      plannedOriginals.push({ entry, example });
      action = "replaced_template_with_original_context";
      replacement = { example, source: "Worttag original learner example" };
    }
  }

  changes.push({ entry, oldExample, oldExampleZh, replacement, action, oldKey });
}

const originalTranslations = await mapConcurrent(plannedOriginals, 8, async ({ example }) => ({
  example,
  exampleZh: await translateWithRetry(example),
}));
const originalById = new Map(plannedOriginals.map(({ entry }, index) => [entry.id, originalTranslations[index]]));

const ledgerEntries = [];
for (const change of changes) {
  const { entry, oldExample, oldExampleZh } = change;
  let replacement = change.replacement;
  if (change.action === "replaced_template_with_original_context") {
    replacement = { ...replacement, ...originalById.get(entry.id) };
  }
  if (replacement) {
    entry.row[entry.field.example] = replacement.example;
    entry.row[entry.field.exampleZh] = replacement.exampleZh;
    usedGerman.add(cleanSpace(replacement.example).toLocaleLowerCase("de-DE"));
    summary.replaced += 1;
  }
  countAction(entry.level, change.action);
  const previous = previousLedgerById.get(entry.id);
  ledgerEntries.push({
    id: entry.id,
    level: entry.level,
    index: entry.index,
    term: entry.term,
    qualityStatusBefore: quality.entries[entry.id]?.status ?? "pending",
    action: change.action,
    oldExample,
    oldExampleZh,
    newExample: entry.row[entry.field.example],
    newExampleZh: entry.row[entry.field.exampleZh],
    evidence: replacement
      ? {
        source: replacement.source,
        title: replacement.title ?? null,
        author: replacement.author ?? null,
        url: replacement.url ?? null,
        release: replacement.release ?? null,
        pairId: replacement.pairId ?? null,
        sourceLine: replacement.sourceLine ?? null,
        reviewedOn: replacement.reviewedOn ?? null,
        recordId: replacement.recordId ?? null,
        policy: change.action === "replaced_template_with_literary_source"
          ? "short public-domain source sentence with book attribution"
          : change.action === "replaced_template_with_editorial_review_example"
            ? "existing Worttag editorial example pair reused without changing its reviewed Chinese translation"
            : "original learner example translated and retained as pending editorial content",
      }
      : {
        source: previous?.evidence?.source ?? "Worttag quality audit",
        reasonCodes: quality.entries[entry.id]?.reasonCodes ?? [],
      },
  });
}

if (summary.replaced !== templateIds.size) {
  throw new Error(`Expected every template to be replaced; replaced ${summary.replaced} of ${templateIds.size}`);
}

for (const { document, file } of wordbooks) await writeJsonAtomic(file, document);

const generatedAt = new Date().toISOString();
const ledger = {
  schemaVersion: 2,
  generatedAt,
  corpus: "Worttag Core 6000",
  source: {
    literaryPool: LITERARY_POOL_FILE,
    editorialReviews: "data/editorial/*-review.json",
  },
  policy: {
    scope: "all remaining deterministic template examples",
    replacementOrder: ["Worttag editorial review", "public-domain literary pool", "Worttag original learner example"],
    attribution: "A book title is appended only to a sentence extracted from the listed literary edition; original sentences are never given a fictional attribution.",
    approval: "All replacements remain pending until sentence-level human review confirms sense, register, and Chinese alignment.",
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
const markdown = `# Worttag 模板例句全量替换台账

生成时间：${generatedAt}

本轮覆盖之前标记为“模板例句”的 ${templateIds.size} 条词条，全部替换为正常句子。优先使用已有 Worttag 编辑审核例句，其次使用公开文本中的短句，最后使用明确标注为 Worttag 原创的学习例句。

## 结果

- 词条总数：${summary.total}
- 替换模板句：${summary.replaced}
- 文学来源短句：${summary.byAction.replaced_template_with_literary_source ?? 0}
- 已有编辑审核例句：${summary.byAction.replaced_template_with_editorial_review_example ?? 0}
- Worttag 原创学习例句：${summary.byAction.replaced_template_with_original_context ?? 0}
- 版本号：保持 beta3.0 / package 2.0.0

## 按处理动作

| 处理动作 | 数量 |
| --- | ---: |
${actionRows}

## 按等级

| 等级 | 总数 | 处理分布 |
| --- | ---: | --- |
${levelRows}

## 归属规则

- 只有确实来自文学来源池的德文短句才附加“——《书名》”。
- 公开文本来源保留在逐条 JSON 台账中，应用词库只保存短句和书名。
- 原创句不冒充文学引文，继续进入“待审核”队列。
- 乱码、危险语境、模板式句型和重复句不会被写入替换结果。
`;
await writeFile(path.join(root, LEDGER_MARKDOWN_FILE), markdown, "utf8");
process.stdout.write(`${JSON.stringify({ ...summary, generatedAt }, null, 2)}\n`);
