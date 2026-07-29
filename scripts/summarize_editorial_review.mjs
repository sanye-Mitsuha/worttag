#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import OpenCC from "opencc-js";

import {
  buildAuditReport,
  expectedDictionaryPos,
  loadCuratedEntries,
  loadPackedEntries,
} from "./audit_wordbooks.mjs";

const root = process.cwd();
const levels = ["a1", "a2", "b1", "b2", "c1"];
const outputJson = path.join(root, "reports", "editorial-review-summary-v1.json");
const outputMarkdown = path.join(root, "reports", "editorial-review-summary-v1.md");
const cachePath = path.join(root, ".cache", "wordbooks", "wiktapi-de-2026-07-28.json");
const placeholderPattern =
  /尚待人工|待人工核定|词义见例句|Im Wörterbuch steht|unser Lernwort|Heute üben wir|Heute geht es um|Wir können das heute|Das wirkt wirklich/u;
const knownGarbageChinesePattern =
  /具乐部|股票农场|发觉者|强烈的词性|摄影师的模型|帧在其中|立前提|好行尸|皮尔和切柳叶|我叫建筑冷冻音乐|新奇的东西已经磨损|线路已经订婚|[什怎那这]幺/u;
const toMainlandSimplified = OpenCC.Converter({ from: "twp", to: "cn" });
const toSimplified = (value) => (
  toMainlandSimplified(value).replace(/([什怎那这])幺/gu, "$1么")
);

async function writeAtomic(filePath, body) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporary, body, "utf8");
  await rename(temporary, filePath);
}

const [packed, curated] = await Promise.all([
  loadPackedEntries(root),
  loadCuratedEntries(root),
]);
const audit = await buildAuditReport({
  root,
  cachePath,
  generatedAt: new Date().toISOString(),
});
const rows = {};
let reviewed = 0;
let resetChanged = 0;
let preservedUnchanged = 0;

for (const level of levels) {
  const review = JSON.parse(
    await readFile(path.join(root, "data", "editorial", `${level}-review.json`), "utf8"),
  );
  const entries = packed.filter((entry) => entry.level === level.toUpperCase());
  const reviewEntries = review.entries ?? [];
  const unresolved = reviewEntries.filter((entry) => (
    entry.unresolved !== false || (entry.unresolvedReasons ?? []).length > 0
  )).length;
  const reset = reviewEntries.filter(
    (entry) => entry.progressMigration === "reset_changed_lexeme",
  ).length;
  const preserved = reviewEntries.filter(
    (entry) => entry.progressMigration === "preserve_unchanged_lexeme",
  ).length;
  const placeholders = entries.filter((entry) => (
    placeholderPattern.test(`${entry.meaning}\n${entry.example}\n${entry.exampleZh}`)
  )).length;
  const traditional = entries.filter((entry) => {
    const learnerChinese = `${entry.meaning}\n${entry.exampleZh}`;
    return toSimplified(learnerChinese) !== learnerChinese;
  }).length;
  const corruptChinese = entries.filter((entry) => (
    /[\uE000-\uF8FF\uFFFD\[\]]|\p{Script=Cyrillic}/u.test(
      `${entry.meaning}\n${entry.exampleZh}`,
    )
  )).length;
  const knownGarbageChinese = entries.filter((entry) => (
    knownGarbageChinesePattern.test(`${entry.meaning}\n${entry.exampleZh}`)
  )).length;
  const mixedMorphology = entries.filter((entry) => (
    /\p{Script=Han}/u.test(entry.forms)
  )).length;

  rows[level.toUpperCase()] = {
    packedCards: entries.length,
    curatedCards: curated.filter((entry) => entry.level === level.toUpperCase()).length,
    reviewedRows: reviewEntries.length,
    unresolvedRows: unresolved,
    progressResetRows: reset,
    progressPreservedRows: preserved,
    placeholderRows: placeholders,
    traditionalChineseRows: traditional,
    corruptChineseRows: corruptChinese,
    knownGarbageChineseRows: knownGarbageChinese,
    mixedMorphologyRows: mixedMorphology,
    dictionaryFound: audit.summary.byLevel[level.toUpperCase()]?.dictionary?.found ?? 0,
  };
  reviewed += reviewEntries.length;
  resetChanged += reset;
  preservedUnchanged += preserved;
}

const duplicateKeys = new Map();
for (const entry of [...curated, ...packed]) {
  const key = `${entry.term.normalize("NFC")}|${expectedDictionaryPos(entry)}`;
  const values = duplicateKeys.get(key) ?? [];
  values.push(entry.id);
  duplicateKeys.set(key, values);
}
const duplicates = Array.from(duplicateKeys.entries())
  .filter(([, ids]) => ids.length > 1)
  .map(([key, ids]) => ({ key, ids }));

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  scope: {
    totalCards: packed.length + curated.length,
    packedCards: packed.length,
    curatedCards: curated.length,
    reviewedPackedRows: reviewed,
    policy:
      "Every packed row must have a resolved editorial record. Dictionary and corpus matches are evidence, not automatic proof of bilingual sense accuracy.",
  },
  progressMigration: {
    resetChangedLexeme: resetChanged,
    preserveUnchangedLexeme: preservedUnchanged,
  },
  releaseGates: {
    duplicateTermAndPartOfSpeechGroups: duplicates.length,
    unresolvedEditorialRows: Object.values(rows).reduce(
      (sum, level) => sum + level.unresolvedRows,
      0,
    ),
    placeholderRows: Object.values(rows).reduce(
      (sum, level) => sum + level.placeholderRows,
      0,
    ),
    traditionalChineseRows: Object.values(rows).reduce(
      (sum, level) => sum + level.traditionalChineseRows,
      0,
    ),
    corruptChineseRows: Object.values(rows).reduce(
      (sum, level) => sum + level.corruptChineseRows,
      0,
    ),
    knownGarbageChineseRows: Object.values(rows).reduce(
      (sum, level) => sum + level.knownGarbageChineseRows,
      0,
    ),
    mixedMorphologyRows: Object.values(rows).reduce(
      (sum, level) => sum + level.mixedMorphologyRows,
      0,
    ),
  },
  levels: rows,
  references: [
    {
      name: "Council of Europe CEFR Reference Level Descriptions",
      url: "https://www.coe.int/en/web/common-european-framework-reference-languages/reference-level-descriptions",
      role: "competency framework",
    },
    {
      name: "Goethe-Zertifikat A2 vocabulary material",
      url: "https://www.goethe.de/de/m/spr/prf/ueb/pa2.html",
      role: "A2 boundary reference; not redistributed",
    },
    {
      name: "Goethe-Zertifikat B1 vocabulary material",
      url: "https://www.goethe.de/de/m/spr/prf/ueb/pb1.html",
      role: "B1 boundary reference; not redistributed",
    },
  ],
};

const markdown = `# Worttag editorial review summary

Generated: ${report.generatedAt}

This report covers all ${report.scope.totalCards} released cards. The ${report.scope.packedCards}
packed rows have row-level editorial records; the ${report.scope.curatedCards} hand-edited cards
remain covered by the release tests.

| Level | Packed | Curated | Reviewed | Unresolved | Reset changed | Preserve unchanged | Dictionary found |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${Object.entries(rows).map(([level, row]) => (
  `| ${level} | ${row.packedCards} | ${row.curatedCards} | ${row.reviewedRows} | ${row.unresolvedRows} | ${row.progressResetRows} | ${row.progressPreservedRows} | ${row.dictionaryFound} |`
)).join("\n")}

## Release gates

- Duplicate term and part-of-speech groups: ${report.releaseGates.duplicateTermAndPartOfSpeechGroups}
- Unresolved editorial rows: ${report.releaseGates.unresolvedEditorialRows}
- Placeholder rows: ${report.releaseGates.placeholderRows}
- Traditional-Chinese residue rows: ${report.releaseGates.traditionalChineseRows}
- Corrupted Chinese rows: ${report.releaseGates.corruptChineseRows}
- Known malformed or mistranslated Chinese rows: ${report.releaseGates.knownGarbageChineseRows}
- Chinese glosses mixed into German morphology rows: ${report.releaseGates.mixedMorphologyRows}

Dictionary coverage is corroborating evidence only. It does not automatically validate a
Chinese sense, CEFR band, or example translation.
`;

await Promise.all([
  writeAtomic(outputJson, `${JSON.stringify(report, null, 2)}\n`),
  writeAtomic(outputMarkdown, markdown),
]);

process.stdout.write(`${JSON.stringify(report.releaseGates, null, 2)}\n`);
