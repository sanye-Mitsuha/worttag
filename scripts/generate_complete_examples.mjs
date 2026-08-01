#!/usr/bin/env node

/**
 * Fill every Core 6000 row with a learner-facing German example and Chinese
 * translation. Conservative Tatoeba matches are preferred; the remaining
 * rows receive deterministic, part-of-speech-aware teaching sentences.
 */

import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import OpenCC from "opencc-js";

const LEVELS = ["a1", "a2", "b1", "b2", "c1"];
const toMainlandSimplified = OpenCC.Converter({ from: "twp", to: "cn" });

const UNSUITABLE_CONTEXT = /\b(?:Bombe|töten|Unterwäsche|Wutanfall|Schießen|Gewehr|Pistole|Krieg|Mord|Vampir|Tannenbaum)\b|炸死|内衣|脾气|枪|战争|谋杀|吸血鬼/iu;
const EXCLUDED_REVIEW_REASONS = new Set([
  "headword_shared_by_2_entries",
  "headword_shared_by_3_entries",
  "headword_shared_by_4_entries",
  "sentence_initial_capitalization_is_pos_ambiguous",
]);

const nounSubjects = [
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

const meaningStopWords = new Set([
  "的", "地", "了", "着", "和", "与", "及", "或", "；", "、", "（", "）", "(", ")",
]);

function cleanSpace(value) {
  return String(value ?? "").normalize("NFC").replace(/\s+/gu, " ").trim();
}

function normalizeChinese(value, sentence = true) {
  let normalized = toMainlandSimplified(cleanSpace(value));
  normalized = normalized
    .replace(/([什怎那这])幺/gu, "$1么")
    .replace(/,/gu, "，")
    .replace(/;/gu, "；")
    .replace(/\?/gu, "？")
    .replace(/!/gu, "！");
  if (sentence && normalized && !/[。！？…](?:[”」』"“])?$/u.test(normalized)) {
    normalized += "。";
  }
  return normalized;
}

function firstMeaning(meaning) {
  const value = cleanSpace(meaning)
    .replace(/^[（(][^）)]*[）)]\s*/u, "")
    .split(/[；;]/u)[0]
    .replace(/[（(][^）)]*[）)]/gu, "")
    .trim();
  return value || "这个意思";
}

function nounHeadword(term) {
  return cleanSpace(term)
    .replace(/^(?:der|die|das)\s+/iu, "")
    .replace(/\(Pl\.\)\s*/iu, "")
    .trim();
}

function visibleTerm(term) {
  return cleanSpace(term).replace(/\s+·.*$/u, "").trim();
}

function fallbackExample(row, index) {
  const meaning = firstMeaning(row.meaning);
  const term = visibleTerm(row.term);
  const noun = nounHeadword(term);
  const subject = nounSubjects[index % nounSubjects.length];

  switch (row.typeCode) {
    case "nm":
      return {
        example: `${subject} steht der ${noun} im Mittelpunkt.`,
        exampleZh: `在这个场景中，“${meaning}”是重点。`,
      };
    case "nf":
      if (/\(Pl\.\)/iu.test(row.term)) {
        return {
          example: `${subject} stehen die ${noun} im Mittelpunkt.`,
          exampleZh: `在这个场景中，“${meaning}”是重点。`,
        };
      }
      return {
        example: `${subject} spielt die ${noun} eine wichtige Rolle.`,
        exampleZh: `在这个场景中，“${meaning}”发挥着重要作用。`,
      };
    case "nn":
      return {
        example: `${subject} bleibt das ${noun} ein wichtiges Thema.`,
        exampleZh: `在这个场景中，“${meaning}”仍然是重要主题。`,
      };
    case "v":
      return {
        example: `Im Gespräch kann man „${term}“ passend verwenden.`,
        exampleZh: `在对话中，可以恰当地使用“${meaning}”。`,
      };
    case "adj":
      return {
        example: `Im Satz beschreibt „${term}“ eine Eigenschaft.`,
        exampleZh: `句中的“${meaning}”用来描述一种特征。`,
      };
    case "adv":
      return {
        example: `Im Satz zeigt „${term}“, wann, wo oder wie etwas geschieht.`,
        exampleZh: `句中的“${meaning}”说明事情发生的时间、地点或方式。`,
      };
    case "prep":
      return {
        example: `Mit „${term}“ verbindet man im Deutschen eine Handlung mit ihrem Kontext.`,
        exampleZh: `在德语中，“${meaning}”可以把动作和语境联系起来。`,
      };
    case "conj":
      return {
        example: `Mit „${term}“ verbindet man im Deutschen zwei Satzteile.`,
        exampleZh: `在德语中，“${meaning}”可以连接两个句子成分。`,
      };
    case "pron":
      return {
        example: `Mit „${term}“ verweist man im Satz auf eine Person oder eine Sache.`,
        exampleZh: `在句子中，“${meaning}”用来指代一个人或一件事。`,
      };
    case "det":
      return {
        example: `Der Artikel „${term}“ steht vor einem Nomen.`,
        exampleZh: `冠词“${meaning}”放在名词前面。`,
      };
    case "intj":
      return {
        example: `„${term}“ zeigt im Gespräch eine unmittelbare Reaktion.`,
        exampleZh: `对话中的“${meaning}”表达了直接反应。`,
      };
    default:
      return {
        example: `Im Gespräch passt das Wort „${term}“ gut in diesen Zusammenhang.`,
        exampleZh: `在对话中，“${meaning}”很适合这个语境。`,
      };
  }
}

function toEntry(document, row) {
  const field = Object.fromEntries(document.fields.map((name, index) => [name, index]));
  return {
    id: row[field.id],
    term: row[field.term],
    meaning: row[field.meaning],
    typeCode: row[field.typeCode],
  };
}

function isUsableSourceEntry(record) {
  if (!record?.selected?.german || !record?.selected?.chinese) return false;
  if (!record.lowRiskSurfaceMatch && (record.reviewReasons ?? []).some((reason) => EXCLUDED_REVIEW_REASONS.has(reason))) {
    return false;
  }
  return !UNSUITABLE_CONTEXT.test(`${record.selected.german}\n${record.selected.chinese}`);
}

async function writeJsonAtomic(filePath, value) {
  const temporary = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, "utf8");
  await rename(temporary, filePath);
}

const root = process.cwd();
const sourcePath = path.join(root, "work", "tatoeba-cmn-de-v2026-07-08.examples.json");
const source = JSON.parse(await readFile(sourcePath, "utf8"));
const sourceById = new Map(source.entries.map((entry) => [entry.id, entry]));

let total = 0;
let corpusExamples = 0;
let generatedExamples = 0;
const byLevel = {};

for (const level of LEVELS) {
  const filePath = path.join(root, "public", "wordbooks", `${level}-v1.json`);
  const document = JSON.parse(await readFile(filePath, "utf8"));
  const field = Object.fromEntries(document.fields.map((name, index) => [name, index]));
  let levelCorpus = 0;
  let levelGenerated = 0;

  for (let index = 0; index < document.words.length; index += 1) {
    const row = document.words[index];
    const entry = toEntry(document, row);
    const evidence = sourceById.get(entry.id);
    const candidate = isUsableSourceEntry(evidence)
      ? { example: evidence.selected.german.trim(), exampleZh: normalizeChinese(evidence.selected.chinese) }
      : fallbackExample(entry, index);
    row[field.example] = candidate.example;
    row[field.exampleZh] = normalizeChinese(candidate.exampleZh);
    total += 1;
    if (evidence?.selected?.german && candidate.example === evidence.selected.german.trim()) {
      corpusExamples += 1;
      levelCorpus += 1;
    } else {
      generatedExamples += 1;
      levelGenerated += 1;
    }
  }

  await writeJsonAtomic(filePath, document);
  byLevel[level.toUpperCase()] = { corpus: levelCorpus, generated: levelGenerated };
}

const meaningCharacters = new Set(
  [...source.entries].flatMap((entry) => [...String(entry.term ?? "")].filter((char) => !meaningStopWords.has(char))),
);

process.stdout.write(`${JSON.stringify({
  total,
  corpusExamples,
  generatedExamples,
  sourceSelected: source.summary?.selectedUniqueEntries ?? null,
  meaningCharacters: meaningCharacters.size,
  byLevel,
}, null, 2)}\n`);
