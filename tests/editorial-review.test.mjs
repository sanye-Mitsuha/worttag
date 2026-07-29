import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import OpenCC from "opencc-js";

import {
  expectedDictionaryPos,
  loadCuratedEntries,
  loadPackedEntries,
} from "../scripts/audit_wordbooks.mjs";

const root = process.cwd();
const levels = ["a1", "a2", "b1", "b2", "c1"];
const lexicalFields = ["term", "forms", "typeCode", "meaning"];
const toMainlandSimplified = OpenCC.Converter({ from: "twp", to: "cn" });
const toSimplified = (value) => (
  toMainlandSimplified(value).replace(/([什怎那这])幺/gu, "$1么")
);
const disallowedLowValueTerms = new Set([
  "der Bastard",
  "die Hure",
  "das Sperma",
  "die Lesbe",
  "die Butch",
  "das Kokain",
  "der Abschaum",
  "das Massaker",
  "das Luder",
  "der Dummkopf",
  "der Freak",
  "der Herrgott",
  "der Johannes",
  "die NASA",
  "die DNS",
  "das K",
  "das F",
  "das W",
]);

test("every packed row has a resolved editorial record matching the released data", async () => {
  for (const level of levels) {
    const wordbook = JSON.parse(
      await readFile(path.join(root, "public", "wordbooks", `${level}-v1.json`), "utf8"),
    );
    const review = JSON.parse(
      await readFile(path.join(root, "data", "editorial", `${level}-review.json`), "utf8"),
    );
    assert.equal(review.schemaVersion, 1);
    assert.equal(review.level, level.toUpperCase());
    assert.equal(review.entries.length, wordbook.words.length);
    const rows = new Map(wordbook.words.map((row) => [row[0], row]));

    for (const entry of review.entries) {
      assert.equal(entry.unresolved, false, `${entry.id} remains unresolved`);
      assert.deepEqual(entry.unresolvedReasons ?? [], []);
      const row = rows.get(entry.after.id);
      assert.ok(row, `${entry.after.id} is missing from ${level}`);
      assert.deepEqual(row, [
        entry.after.id,
        entry.after.term,
        entry.after.forms,
        entry.after.typeCode,
        entry.after.meaning,
        entry.after.example,
        entry.after.exampleZh,
      ]);
      const changed = lexicalFields.some(
        (field) => entry.before[field] !== entry.after[field],
      );
      assert.equal(
        entry.progressMigration,
        changed ? "reset_changed_lexeme" : "preserve_unchanged_lexeme",
      );
      if (changed) assert.notEqual(entry.after.id, entry.before.id);
    }
  }
});

test("released cards contain natural examples and no editorial placeholders", async () => {
  const packed = await loadPackedEntries(root);
  for (const entry of packed) {
    assert.equal(
      disallowedLowValueTerms.has(entry.term),
      false,
      `${entry.id} is not a core modern teaching item`,
    );
    assert.doesNotMatch(
      entry.term,
      /^(?:der|die|das)\s+\p{L}$/u,
      `${entry.id} is an isolated-letter filler`,
    );
    assert.doesNotMatch(
      entry.meaning,
      /尚待人工|待人工核定|义项尚待人工核定|词义见例句|词典(?:意义|含义)/u,
    );
    assert.doesNotMatch(
      entry.example,
      /Im Wörterbuch steht|unser Lernwort|Heute üben wir|Heute geht es um|Wir können das heute|Das wirkt wirklich|als (?:Nomen|Verb|Adjektiv)\.$/u,
    );
    assert.doesNotMatch(entry.exampleZh, /^词典将/u);
    assert.equal(entry.meaning, entry.meaning.trim());
    if (["B1", "B2", "C1"].includes(entry.level)) {
      assert.doesNotMatch(
        entry.meaning,
        /^\p{Script=Han}$/u,
        `${entry.id} uses an ambiguous one-character advanced-level gloss`,
      );
    }
    assert.doesNotMatch(
      entry.forms,
      /\p{Script=Han}/u,
      `${entry.id} mixes Chinese glosses into the German morphology field`,
    );
    assert.equal(entry.example, entry.example.trim());
    assert.equal(entry.exampleZh, entry.exampleZh.trim());
    assert.doesNotMatch(
      `${entry.meaning}${entry.exampleZh}`,
      /[\uE000-\uF8FF\uFFFD\[\]]|\p{Script=Cyrillic}/u,
      `${entry.id} contains corrupted or wrong-script Chinese text`,
    );
    assert.doesNotMatch(
      `${entry.meaning}${entry.exampleZh}`,
      /具乐部|股票农场|发觉者|强烈的词性|摄影师的模型|帧在其中|立前提|好行尸|皮尔和切柳叶|我叫建筑冷冻音乐|新奇的东西已经磨损|线路已经订婚|[什怎那这]幺/u,
      `${entry.id} contains a known malformed or mistranslated Chinese phrase`,
    );
    assert.equal(
      toSimplified(`${entry.meaning}${entry.exampleZh}`),
      `${entry.meaning}${entry.exampleZh}`,
      `${entry.id} contains Traditional-Chinese residue`,
    );
    assert.doesNotMatch(
      entry.exampleZh,
      /[\p{Script=Han}],[\p{Script=Han}]/u,
      `${entry.id} uses an ASCII comma inside Chinese prose`,
    );
    assert.doesNotMatch(
      entry.exampleZh,
      /[。！？][”」』"']。$/u,
      `${entry.id} repeats sentence-final Chinese punctuation`,
    );
    assert.match(
      entry.example,
      /[.!?…](?:[”„“"])?$/u,
      `${entry.id} needs German sentence punctuation`,
    );
    assert.match(
      entry.exampleZh,
      /[。！？…](?:[”」』"“])?$/u,
      `${entry.id} needs Chinese sentence punctuation`,
    );

    if (entry.typeCode === "v" && !/^(?:haben|sein)\b/u.test(entry.forms)) {
      const finalForm = entry.forms.split("·").at(-1)?.trim() ?? "";
      assert.doesNotMatch(
        finalForm,
        /^(?:haben|sein)\b/u,
        `${entry.id} uses an unconjugated perfect auxiliary`,
      );
    }
  }
});

test("teaching translations preserve explicit numbers and plural addressees", async () => {
  const packed = await loadPackedEntries(root);
  const halfHourPairs = [
    [/\bhalb zwei\b/iu, /[一1]/u, "half past one"],
    [/\bhalb drei\b/iu, /[二两兩2]/u, "half past two"],
    [/\bhalb vier\b/iu, /[三3]/u, "half past three"],
    [/\bhalb fünf\b/iu, /[四4]/u, "half past four"],
    [/\bhalb sechs\b/iu, /[五5]/u, "half past five"],
    [/\bhalb sieben\b/iu, /[六6]/u, "half past six"],
    [/\bhalb acht\b/iu, /[七7]/u, "half past seven"],
    [/\bhalb neun\b/iu, /[八8]/u, "half past eight"],
    [/\bhalb zehn\b/iu, /[九9]/u, "half past nine"],
    [/\bhalb elf\b/iu, /(?:十|10)/u, "half past ten"],
    [/\bhalb zwölf\b/iu, /(?:十一|11)/u, "half past eleven"],
  ];
  const numberPairs = [
    [/\bzwe(?:i|ite\w*)\b/iu, /[二两兩2]/u, "two"],
    [/\bdrei(?:te\w*)?\b/iu, /[三3]/u, "three"],
    [/\bvier(?!tel)(?:te\w*)?\b/iu, /[四4]/u, "four"],
    [/\bfünf(?:te\w*)?\b/iu, /[五5]/u, "five"],
    [/\bsechs(?:te\w*)?\b/iu, /[六6]/u, "six"],
    [/\bsieben(?:te\w*)?\b/iu, /[七7]/u, "seven"],
    [/\bacht(?:e\w*)?\b/iu, /[八8]/u, "eight"],
    [/\bneun(?:te\w*)?\b/iu, /[九9]/u, "nine"],
    [/\bzehn(?:te\w*)?\b/iu, /[十10]/u, "ten"],
    [/\belf(?:te\w*)?\b/iu, /(?:十一|11)/u, "eleven"],
    [/\bzwölf(?:te\w*)?\b/iu, /(?:十二|12)/u, "twelve"],
  ];

  for (const entry of packed) {
    const halfHour = halfHourPairs.find(([germanPattern]) => (
      germanPattern.test(entry.example)
    ));
    if (halfHour) {
      assert.match(
        entry.exampleZh,
        halfHour[1],
        `${entry.id} mistranslates German clock time ${halfHour[2]}`,
      );
      continue;
    }
    for (const [germanPattern, chinesePattern, label] of numberPairs) {
      if (!germanPattern.test(entry.example)) continue;
      assert.match(
        entry.exampleZh,
        chinesePattern,
        `${entry.id} drops or changes the explicit number ${label}`,
      );
    }
    if (/\bIhr seid\b/u.test(entry.example)) {
      assert.match(
        entry.exampleZh,
        /你们|各位/u,
        `${entry.id} mistranslates plural Ihr seid`,
      );
    }
  }
});

test("cumulative A1-C1 books do not repeat the same surface lexeme and part of speech", async () => {
  const [packed, curated] = await Promise.all([
    loadPackedEntries(root),
    loadCuratedEntries(root),
  ]);
  const seen = new Map();
  for (const entry of [...curated, ...packed]) {
    const key = `${entry.term.normalize("NFC")}|${expectedDictionaryPos(entry)}`;
    const previous = seen.get(key);
    assert.equal(
      previous,
      undefined,
      `${entry.id} duplicates ${previous?.id ?? "another row"} as ${key}`,
    );
    seen.set(key, entry);
  }
  assert.equal(seen.size, 6000);
});
