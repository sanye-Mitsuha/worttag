#!/usr/bin/env node

/**
 * Build a small, checked-in pool of short German literary sentences.
 *
 * The source texts are public-domain editions published by Project Gutenberg.
 * Only short sentence candidates and their Chinese translations are stored;
 * the full source texts are never committed to the application bundle.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const LEVELS = ["a1", "a2", "b1", "b2", "c1"];
const POOL_FILE = "data/editorial/literary-example-pool-v1.json";
const SOURCES = [
  {
    title: "Faust: Der Tragödie erster Teil",
    author: "Johann Wolfgang von Goethe",
    localFile: "work/literary-sources/pg2229.txt",
    url: "https://www.gutenberg.org/cache/epub/2229/pg2229.txt",
    licenseUrl: "https://www.gutenberg.org/ebooks/2229",
  },
  {
    title: "Die Leiden des jungen Werther",
    author: "Johann Wolfgang von Goethe",
    localFile: "work/literary-sources/pg19794.txt",
    url: "https://www.gutenberg.org/cache/epub/19794/pg19794.txt",
    licenseUrl: "https://www.gutenberg.org/ebooks/19794",
  },
  {
    title: "Die Räuber: Ein Schauspiel",
    author: "Friedrich Schiller",
    localFile: "work/literary-sources/pg47804.txt",
    url: "https://www.gutenberg.org/cache/epub/47804/pg47804.txt",
    licenseUrl: "https://www.gutenberg.org/ebooks/47804",
  },
];

const UNSUITABLE_CONTEXT =
  /\b(?:Bombe|töten|Unterwäsche|Wutanfall|Schießen|Gewehr|Pistole|Krieg|Mord|Vampir|Tannenbaum|Scharfrichter|Blut|Leiche|Hure|Selbstmord)\b|炸死|内衣|脾气|枪|战争|谋杀|吸血鬼|血|尸体|自杀/u;
const LITERARY_REVIEW_ALLOWLIST = new Set([
  "core6000-b2-3302", "core6000-c1-5925", "core6000-c1-4277", "core6000-b2-3848",
  "core6000-a1-0176", "core6000-a2-1333", "core6000-a2-0952", "core6000-c1-4807",
  "core6000-c1-4026", "core6000-b2-3782", "core6000-b2-3164", "core6000-c1-5503",
  "core6000-b2-3160", "core6000-a2-1341", "core6000-c1-4752", "core6000-c1-5188",
  "core6000-b1-2347", "core6000-c1-5743", "core6000-b2-3823", "core6000-b2-2555",
  "core6000-c1-4085", "core6000-c1-5052", "core6000-c1-4625", "core6000-b2-2719",
  "core6000-b2-3005", "core6000-b2-3037", "core6000-b1-1720", "core6000-b2-3028",
  "core6000-c1-4496", "core6000-b2-2654", "core6000-b2-3077", "core6000-b2-3029",
  "core6000-c1-5144", "core6000-b2-3722",
]);

function cleanSpace(value) {
  return String(value ?? "").normalize("NFC").replace(/\s+/gu, " ").trim();
}

function visibleTerm(term) {
  return cleanSpace(term).replace(/\s+·.*$/u, "").trim();
}

function surfaceTokens(value) {
  return [...cleanSpace(value).matchAll(/[\p{L}\d]+(?:['’\-][\p{L}\d]+)?/gu)].map((match) => match[0]);
}

function lower(value) {
  return cleanSpace(value).toLocaleLowerCase("de-DE");
}

function nounHeadword(term) {
  return visibleTerm(term).replace(/^(?:der|die|das)\s+/iu, "").trim();
}

function parseForms(entry) {
  const term = visibleTerm(entry.term);
  const noun = nounHeadword(term);
  const forms = cleanSpace(entry.forms)
    .replace(/^.*?·\s*/u, "")
    .split(/\s*·\s*|\s*;\s*|\s*,\s*/u)
    .map((value) => cleanSpace(value))
    .filter((value) => value && !/^(?:unveränderlich|meist ohne Plural|als Adjektiv)$/iu.test(value));
  return [...new Set([
    term,
    noun,
    ...forms,
  ].flatMap((value) => {
    const withoutArticle = cleanSpace(value).replace(/^(?:der|die|das)\s+/iu, "");
    return [value, withoutArticle].filter(Boolean);
  }))];
}

function extractText(raw) {
  const start = raw.search(/\*\*\* START OF THE PROJECT GUTENBERG EBOOK/iu);
  const end = raw.search(/\*\*\* END OF THE PROJECT GUTENBERG EBOOK/iu);
  const body = raw.slice(start >= 0 ? start : 0, end >= 0 ? end : raw.length);
  return body
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => cleanSpace(line))
    .filter((line) => line && !/^\*+\s*(?:START|END) OF THE PROJECT GUTENBERG EBOOK/iu.test(line))
    .join(" ");
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?…])\s+(?=[A-ZÄÖÜ„“»—])/gu)
    .map((sentence) => cleanSpace(sentence.replace(/^[„“»]+|[”』」]+$/gu, "")))
    .filter((sentence) => {
      const tokens = surfaceTokens(sentence);
      if (tokens.length < 5 || tokens.length > 18) return false;
      if (UNSUITABLE_CONTEXT.test(sentence)) return false;
      if (!/[.!?…]$/u.test(sentence)) return false;
      if (/[\d_=~()[\]{}]/u.test(sentence)) return false;
      if ((sentence.match(/[,;]/gu) ?? []).length > 1) return false;
      if ((sentence.match(/[.!?…]/gu) ?? []).length > 1) return false;
      if (/^[A-ZÄÖÜ]{3,}(?:\s+[A-ZÄÖÜ]{2,})*\.?$/u.test(sentence)) return false;
      if (/^(?:ER|SIE|FRANZ|KARL|MAX|WALLENSTEIN|DER|DIE|DAS)\s*:/u.test(sentence)) return false;
      if (/^(?:Vorspiel|Prolog|Chor|Akt|Szene|Auftritt|Personen|Zimmer|Vorzimmer|Eintritt|Abgang)\b/iu.test(sentence)) return false;
      if (/^(?:Kerker|Copyright laws)\b/iu.test(sentence)) return false;
      if (/\b(?:Akt|Szene|Auftritt|Personen|Zimmer|Vorzimmer|Eintritt|Abgang)\b/iu.test(sentence)) return false;
      if (/^Weh!\s+/u.test(sentence)) return false;
      const tokensWithCase = surfaceTokens(sentence);
      const hasLowercaseVerb = tokensWithCase.some((token, index) => {
        const normalized = lower(token);
        if (index === 0 && token[0] === token[0].toLocaleUpperCase("de-DE")) {
          return /(?:t|st|te|test|tet)$/u.test(normalized) && !/(?:e|en|er|ung|heit|keit|schaft)$/u.test(normalized);
        }
        if (token[0] !== token[0].toLocaleLowerCase("de-DE")) return false;
        return /(?:en|ern|eln|st|t|te|test|ten|tet)$/u.test(normalized);
      });
      if (!hasLowercaseVerb) return false;
      return true;
    });
}

function findMatches(sentence, variants) {
  const tokens = surfaceTokens(sentence);
  const normalizedTokens = tokens.map(lower);
  const results = [];
  for (const variant of variants) {
    const formTokens = surfaceTokens(variant);
    if (!formTokens.length) continue;
    const normalizedForm = formTokens.map(lower);
    for (let index = 0; index <= normalizedTokens.length - normalizedForm.length; index += 1) {
      if (normalizedForm.every((token, offset) => normalizedTokens[index + offset] === token)) {
        results.push({ variant, tokenIndex: index, tokenLength: normalizedForm.length });
      }
    }
  }
  return results.sort((left, right) => right.tokenLength - left.tokenLength);
}

function likelyUsableForEntry(entry, sentence, match) {
  if (!match) return false;
  if (entry.typeCode.startsWith("n")) {
    const token = surfaceTokens(sentence)[match.tokenIndex];
    if (!token || token[0] !== token[0].toLocaleUpperCase("de-DE")) return false;
  }
  if (["adj", "adv", "pron"].includes(entry.typeCode) && match.tokenIndex === 0) return false;
  if (/^[—–-]/u.test(sentence) || /\b(?:Gott|Teufel)\b/iu.test(sentence) && entry.level === "A1") return false;
  return true;
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
  const translated = Array.isArray(payload?.[0])
    ? payload[0].map((part) => part?.[0] ?? "").join("")
    : "";
  return cleanSpace(translated).replace(/([什怎那这])幺/gu, "$1么").replace(/\s+([，。！？；：])/gu, "$1");
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

const root = process.cwd();
const entries = [];
for (const level of LEVELS) {
  const document = JSON.parse(await readFile(path.join(root, "public", "wordbooks", `${level}-v1.json`), "utf8"));
  const field = Object.fromEntries(document.fields.map((name, index) => [name, index]));
  document.words.forEach((row, index) => {
    entries.push({
      level: level.toUpperCase(),
      index,
      id: row[field.id],
      term: row[field.term],
      forms: row[field.forms],
      typeCode: row[field.typeCode],
      example: row[field.example],
    });
  });
}

const quality = JSON.parse(await readFile(path.join(root, "public", "wordbooks", "example-quality-v1.json"), "utf8"));
const templateIds = new Set(Object.entries(quality.entries).filter(([, value]) => value.status === "template").map(([id]) => id));
for (const entry of entries) {
  if (/——《[^》]+》$/u.test(entry.example)) templateIds.add(entry.id);
}
const targets = entries.filter((entry) => templateIds.has(entry.id));
const candidates = [];
for (const source of SOURCES) {
  const raw = await readFile(path.join(root, source.localFile), "utf8");
  const text = extractText(raw);
  const sentences = splitSentences(text);
  for (const sentence of sentences) {
    const matches = targets
      .map((entry) => ({ entry, match: findMatches(sentence, parseForms(entry))[0] }))
      .filter(({ entry, match }) => LITERARY_REVIEW_ALLOWLIST.has(entry.id) && likelyUsableForEntry(entry, sentence, match));
    for (const { entry, match } of matches) {
      candidates.push({
        id: entry.id,
        level: entry.level,
        term: entry.term,
        source: {
          title: source.title,
          author: source.author,
          url: source.licenseUrl,
        },
        german: sentence,
        match,
      });
    }
  }
}

const selected = [];
const usedIds = new Set();
const usedSentences = new Set();
for (const candidate of candidates.sort((left, right) => {
  const leftLength = surfaceTokens(left.german).length;
  const rightLength = surfaceTokens(right.german).length;
  return leftLength - rightLength;
})) {
  const sentenceKey = lower(candidate.german);
  if (usedIds.has(candidate.id) || usedSentences.has(sentenceKey)) continue;
  usedIds.add(candidate.id);
  usedSentences.add(sentenceKey);
  selected.push(candidate);
}

const translated = await mapConcurrent(selected, 8, async (candidate, index) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const chinese = await translate(candidate.german);
      if (chinese && chinese.length >= 3 && !/[�鰌鰂]/u.test(chinese)) return { ...candidate, chinese };
    } catch (error) {
      if (attempt === 2) process.stderr.write(`translation skipped ${index}: ${error.message}\n`);
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  return null;
});

const pool = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  policy: "Only short, sentence-level candidates from the listed public-domain editions are retained; source attribution is shown in the learner-facing German example.",
  sources: SOURCES,
  count: translated.filter(Boolean).length,
  entries: translated.filter(Boolean),
};
await mkdir(path.join(root, path.dirname(POOL_FILE)), { recursive: true });
await writeFile(path.join(root, POOL_FILE), `${JSON.stringify(pool, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ targets: targets.length, candidates: candidates.length, selected: selected.length, translated: pool.count }, null, 2)}\n`);
