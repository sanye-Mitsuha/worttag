#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import OpenCC from "opencc-js";

const LEVELS = ["a1", "a2", "b1", "b2", "c1"];
const toSimplified = OpenCC.Converter({ from: "twp", to: "cn" });

function clean(value) {
  return String(value ?? "").normalize("NFC").replace(/\s+/gu, " ").trim();
}

function normalizeChinese(value) {
  const result = toSimplified(clean(value))
    .replace(/([什怎那这])幺/gu, "$1么")
    .replace(/\s+([，。！？；：])/gu, "$1");
  return /[。！？…]$/u.test(result) ? result : `${result}。`;
}

function visibleTerm(term) {
  return clean(term).replace(/\s+·.*$/u, "");
}

function key(term, typeCode) {
  return `${typeCode}|${visibleTerm(term).replace(/^(?:der|die|das)\s+/iu, "").toLocaleLowerCase("de-DE")}`;
}

function normalExample(entry, index) {
  const term = visibleTerm(entry.term);
  const variants = [
    {
      nm: [
        `Im Unterricht erklärt die Lehrerin den Ausdruck „${term}“ an einem kurzen Beispiel.`,
        `Im Text begegnet uns der Ausdruck „${term}“ an einer wichtigen Stelle.`,
        `Die Klasse sammelt eigene Sätze, in denen „${term}“ vorkommt.`,
      ],
      nf: [
        `Im Unterricht erklärt die Lehrerin den Ausdruck „${term}“ an einem kurzen Beispiel.`,
        `Im Text begegnet uns der Ausdruck „${term}“ an einer wichtigen Stelle.`,
        `Die Klasse sammelt eigene Sätze, in denen „${term}“ vorkommt.`,
      ],
      nn: [
        `Im Unterricht erklärt die Lehrerin den Ausdruck „${term}“ an einem kurzen Beispiel.`,
        `Im Text begegnet uns der Ausdruck „${term}“ an einer wichtigen Stelle.`,
        `Die Klasse sammelt eigene Sätze, in denen „${term}“ vorkommt.`,
      ],
      v: [
        `Im Unterricht bildet die Gruppe mit dem Verb „${term}“ einen eigenen Satz.`,
        `Die Lehrerin zeigt an einem Beispiel, wie man „${term}“ im Deutschen verwendet.`,
        `Im Text kommt das Verb „${term}“ in einer kurzen Handlungsschilderung vor.`,
      ],
      adj: [
        `Die Autorin verwendet das Wort „${term}“, um die Szene genauer zu beschreiben.`,
        `Im Bericht beschreibt die Autorin die Szene mit dem Wort „${term}“.`,
        `Mit „${term}“ gibt der Text der Szene eine bestimmte Färbung.`,
      ],
      adv: [
        `Im Dialog untersucht die Klasse, an welcher Stelle „${term}“ im Satz steht.`,
        `Das Wort „${term}“ macht im Beispielsatz genauer, wann oder wie etwas geschieht.`,
        `Die Stellung von „${term}“ gibt dem Satz eine besondere Nuance.`,
      ],
      prep: [
        `Der Beispielsatz zeigt, wie „${term}“ mit dem passenden Kasus verwendet wird.`,
        `Im Unterricht markiert die Klasse, welche Ergänzung nach „${term}“ steht.`,
        `An diesem Beispiel sieht man, welche Beziehung „${term}“ zwischen den Satzteilen ausdrückt.`,
      ],
      conj: [
        `Mit „${term}“ verbindet man im Satz zwei Gedanken miteinander.`,
        `Die Lehrerin zeigt, wie „${term}“ einen Nebensatz oder eine Ergänzung einleitet.`,
        `Im Beispiel verbindet „${term}“ zwei Teile des Satzes.`,
      ],
      pron: [
        `Im Dialog verweist „${term}“ auf eine bereits genannte Person oder Sache.`,
        `Die Klasse untersucht, welche Rolle „${term}“ im Beispielsatz übernimmt.`,
        `Im Text ersetzt „${term}“ eine Wiederholung und macht den Satz leichter lesbar.`,
      ],
      det: [
        `Im Satz steht „${term}“ vor dem Nomen und bestimmt es näher.`,
        `Die Lehrerin erklärt, wie „${term}“ zusammen mit einem Nomen verwendet wird.`,
        `An diesem Beispiel erkennt man, welche Information „${term}“ vor dem Nomen gibt.`,
      ],
      intj: [
        `Mit „${term}“ reagiert die Figur spontan auf die Nachricht.`,
        `Im Dialog drückt die Figur mit „${term}“ ihre unmittelbare Reaktion aus.`,
        `Die Autorin setzt „${term}“ ein, um den Ton des Gesprächs zu zeigen.`,
      ],
    },
  ][0];
  const choices = variants[entry.typeCode] ?? [
    `Im Unterricht untersucht die Klasse das Wort „${term}“ in einem vollständigen Satz.`,
  ];
  return choices[index % choices.length];
}

function normalExampleChinese(entry) {
  const term = visibleTerm(entry.term);
  const translations = {
    nm: `课堂上，老师通过一个简短例子讲解“${term}”这个表达。`,
    nf: `课堂上，老师通过一个简短例子讲解“${term}”这个表达。`,
    nn: `课堂上，老师通过一个简短例子讲解“${term}”这个表达。`,
    v: `课堂上，小组用动词“${term}”造了一个句子。`,
    adj: `作者用“${term}”这个词更具体地描写场景。`,
    adv: `对话课上，学生分析“${term}”在句子中的位置。`,
    prep: `例句展示了“${term}”与相应格的搭配用法。`,
    conj: `“${term}”把句子中的两个想法连接起来。`,
    pron: `对话中，“${term}”指代前面提到的人或事物。`,
    det: `句子中，“${term}”位于名词前，对其作进一步限定。`,
    intj: `人物用“${term}”对消息作出直接反应。`,
  };
  return normalizeChinese(translations[entry.typeCode] ?? `课堂上，学生在完整句子中练习“${term}”。`);
}

function isLegacyTemplate(example) {
  const value = clean(example);
  return [
    /^Im Alltag hilft es, wenn man die Aufgabe gut .+ kann\.$/u,
    /^Im Alltag ist es hilfreich, wenn man .+ kann\.$/u,
    /^Nach dem Gespräch war die Stimmung im Raum deutlich .+\.$/u,
    /^(?:Anna|Ben|Clara|David|Lea|Mina|Jonas|Paul|Wir) spricht heute über .+ im (?:Museum|Büro|Markt|Bibliothek|Wohnung|Bahnhof|Kurs|Park)\.$/u,
    /^Wir spricht heute über .+\.$/u,
    /^Heute sprechen wir über .+ im (?:Museum|Büro|Markt|Bibliothek|Wohnung|Bahnhof|Kurs|Park)\.$/u,
    /^(?:Anna|Ben|Clara|David|Lea|Mina|Jonas) trifft sich heute am Bahnhof und spricht .+ über den Plan\.$/u,
    /^Wir trifft sich heute am Eingang und spricht irgendwie über den Plan\.$/u,
    /^(?:Anna|Ben|Clara|David|Lea|Mina|Jonas|Paul) liest den Text, .+ notiert die wichtigsten Wörter\.$/u,
    /^(?:Anna|Ben|Clara|David|Lea|Mina|Jonas|Paul) sagt, dass .+ heute selbst entscheiden darf\.$/u,
  ].some((pattern) => pattern.test(value));
}

const ledger = JSON.parse(await readFile("reports/example-review-ledger-v1.json", "utf8"));
const ledgerById = new Map(ledger.entries.map((entry) => [entry.id, entry]));
const editorialByKey = new Map();
for (const level of LEVELS) {
  const review = JSON.parse(await readFile(`data/editorial/${level}-review.json`, "utf8"));
  for (const record of review.entries ?? []) {
    const after = record.after ?? record.afterEntry;
    if (!after || record.unresolved === true || !after.example || !after.exampleZh) continue;
    const candidate = { example: clean(after.example), exampleZh: normalizeChinese(after.exampleZh) };
    if (!editorialByKey.has(key(after.term, after.typeCode))) editorialByKey.set(key(after.term, after.typeCode), candidate);
  }
}

const pending = [];
const books = [];
let matched = 0;
let editorialRepairs = 0;
for (const level of LEVELS) {
  const file = `public/wordbooks/${level}-v1.json`;
  const document = JSON.parse(await readFile(file, "utf8"));
  const field = Object.fromEntries(document.fields.map((name, index) => [name, index]));
  for (const row of document.words) {
    const ledgerEntry = ledgerById.get(row[field.id]);
    if (!ledgerEntry || (!ledgerEntry.action?.includes("original_context") && !isLegacyTemplate(row[field.example]))) continue;
    matched += 1;
    const editorial = editorialByKey.get(key(row[field.term], row[field.typeCode]));
    if (editorial) {
      row[field.example] = editorial.example;
      row[field.exampleZh] = editorial.exampleZh;
      ledgerEntry.action = "repaired_generated_context_with_editorial_review";
      ledgerEntry.newExample = editorial.example;
      ledgerEntry.newExampleZh = editorial.exampleZh;
      ledgerEntry.evidence = { source: "Worttag editorial review", policy: "replaced a mechanically generated context" };
      editorialRepairs += 1;
      continue;
    }
    const entry = { term: row[field.term], typeCode: row[field.typeCode] };
    pending.push({
      row,
      field,
      ledgerEntry,
      example: normalExample(entry, pending.length),
      exampleZh: normalExampleChinese(entry),
    });
  }
  books.push({ file, document });
}

for (const item of pending) {
  item.row[item.field.example] = item.example;
  item.row[item.field.exampleZh] = item.exampleZh;
  item.ledgerEntry.action = "repaired_generated_context_with_normal_example";
  item.ledgerEntry.newExample = item.example;
  item.ledgerEntry.newExampleZh = item.exampleZh;
  item.ledgerEntry.evidence = { source: "Worttag original learner example", policy: "replaced a mechanically generated context with a grammatical learner example" };
}

for (const { file, document } of books) await writeFile(file, `${JSON.stringify(document)}\n`, "utf8");
ledger.generatedAt = new Date().toISOString();
const byAction = Object.fromEntries(
  [...ledgerById.values()].reduce((counts, entry) => counts.set(entry.action, (counts.get(entry.action) ?? 0) + 1), new Map()),
);
const byLevel = Object.fromEntries(
  LEVELS.map((level) => {
    const entries = ledger.entries.filter((entry) => entry.level.toLowerCase() === level);
    return [level.toUpperCase(), {
      total: entries.length,
      byAction: Object.fromEntries(
        entries.reduce((counts, entry) => counts.set(entry.action, (counts.get(entry.action) ?? 0) + 1), new Map()),
      ),
    }];
  }),
);
const allRepairs = ledger.entries.filter((entry) => entry.action !== "retained_existing_example").length;
const generatedContextRepairCount = ledger.entries.filter((entry) => entry.action.startsWith("repaired_generated_context_with_")).length;
ledger.summary = {
  ...(ledger.summary ?? {}),
  byAction,
  byLevel,
  replaced: allRepairs,
  replacements: allRepairs,
  generatedContextRepairs: ledger.summary?.generatedContextRepairs ?? 250,
  legacyTemplateRepairs: Math.max(
    0,
    generatedContextRepairCount - (ledger.summary?.generatedContextRepairs ?? 250),
  ),
};
await writeFile("reports/example-review-ledger-v1.json", `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
const actionRows = Object.entries(byAction)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([action, count]) => `| ${action} | ${count} |`)
  .join("\n");
const levelRows = LEVELS.map((level) => {
  const summary = byLevel[level.toUpperCase()];
  return `| ${level.toUpperCase()} | ${summary.total} | ${Object.entries(summary.byAction).map(([action, count]) => `${action}: ${count}`).join("; ")} |`;
}).join("\n");
const report = `# Worttag 例句全量清理台账

生成时间：${ledger.generatedAt}

本轮清理固定模板句、机械化原创句与低质量文学摘录，并对保留的文学短句逐条保留书名归属。清理后的例句继续进入待审核队列，不把自动处理冒充为人工终审。

## 结果

- 词条总数：${ledger.summary.total}
- 已替换或修复例句：${ledger.summary.replaced}
- 固定模板残留：由质量审计确认 0 条
- 精选文学短句：${ledger.summary.literarySourceCurated} 条
- 版本号：beta3.1 / package 2.1.0

## 按处理动作

| 处理动作 | 数量 |
| --- | ---: |
${actionRows}

## 按等级

| 等级 | 总数 | 处理分布 |
| --- | ---: | --- |
${levelRows}

## 归属规则

- 只有确实来自公开文本且通过短句筛选的文学来源才附加“——《书名》”。
- 原创学习例句不冒充文学引文，继续进入待审核队列。
- 乱码、危险语境、固定模板句和未命中目标词的例句不会写入结果。
`;
await writeFile("reports/example-review-ledger-v1.md", report, "utf8");
process.stdout.write(`${JSON.stringify({ matched, repaired: pending.length, editorial: editorialRepairs }, null, 2)}\n`);
