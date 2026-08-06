#!/usr/bin/env node

/**
 * Build a checked-in translation map for source examples whose Chinese
 * translation is absent from the supplied CEFR HTML corpus.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const LEVELS = ["a1", "a2", "b1", "b2", "c1", "special"];
const WORD_BOOK_ROOT = "public/wordbooks";
const TRANSLATION_FILE = "data/editorial/source-example-translations-v1.json";

function clean(value) {
  return String(value ?? "").normalize("NFC").replace(/\s+/gu, " ").trim();
}

function normalizeChinese(value) {
  return clean(value)
    .replace(/([什怎那这])幺/gu, "$1么")
    .replace(/\s+([，。！？；：])/gu, "$1")
    .replace(/([。！？…])(?:[。！？…])+/gu, "$1");
}

function translationKey(id, german) {
  return `${id}\u0000${german}`;
}

async function translate(german) {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "de");
  url.searchParams.set("tl", "zh-CN");
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", german);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`translation request failed: ${response.status}`);
  const payload = await response.json();
  const translated = Array.isArray(payload?.[0])
    ? payload[0].map((part) => part?.[0] ?? "").join("")
    : "";
  const result = normalizeChinese(translated);
  if (!result) throw new Error("empty translation");
  return result;
}

async function translateWithRetry(german) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await translate(german);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function mapConcurrent(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

const root = process.cwd();
const existingPath = path.join(root, TRANSLATION_FILE);
let existing = { entries: {} };
try {
  existing = JSON.parse(await readFile(existingPath, "utf8"));
} catch {
  // The first run creates the translation map.
}
const translations = { ...(existing.entries ?? {}) };
const targets = [];
const seen = new Set();

for (const level of LEVELS) {
  const file = path.join(root, WORD_BOOK_ROOT, `${level}-v2.json`);
  const book = JSON.parse(await readFile(file, "utf8"));
  for (const row of book.words) {
    const id = row[0];
    const example = clean(row[5]);
    if (example && !clean(row[6])) {
      const key = translationKey(id, example);
      if (!translations[key] && !seen.has(key)) {
        seen.add(key);
        targets.push({ id, german: example });
      }
    }
    for (const item of row[9] ?? []) {
      const german = clean(item[1]);
      if (!german || clean(item[2])) continue;
      const key = translationKey(id, german);
      if (!translations[key] && !seen.has(key)) {
        seen.add(key);
        targets.push({ id, german });
      }
    }
  }
}

console.error(`Translating ${targets.length} missing source example(s)...`);
const results = await mapConcurrent(targets, 6, async (target, index) => {
  const chinese = await translateWithRetry(target.german);
  if ((index + 1) % 50 === 0 || index + 1 === targets.length) {
    console.error(`Translated ${index + 1}/${targets.length}`);
  }
  return { ...target, chinese };
});

for (const result of results) translations[translationKey(result.id, result.german)] = result.chinese;
await mkdir(path.dirname(existingPath), { recursive: true });
await writeFile(existingPath, `${JSON.stringify({
  schemaVersion: 1,
  sourceLanguage: "de",
  targetLanguage: "zh-CN",
  entries: translations,
}, null, 2)}\n`, "utf8");

console.log(JSON.stringify({ translated: results.length, total: Object.keys(translations).length }, null, 2));
