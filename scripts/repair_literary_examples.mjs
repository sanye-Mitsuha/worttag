#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import OpenCC from "opencc-js";

const LEVELS = ["a1", "a2", "b1", "b2", "c1"];
const toSimplified = OpenCC.Converter({ from: "twp", to: "cn" });

function clean(value) {
  return String(value ?? "").normalize("NFC").replace(/\s+/gu, " ").trim();
}

function visibleTerm(term) {
  return clean(term).replace(/\s+·.*$/u, "").trim();
}

function nounHeadword(term) {
  return visibleTerm(term).replace(/^(?:der|die|das)\s+/iu, "").replace(/\(Pl\.\)\s*/iu, "");
}

function key(term, typeCode) {
  return `${typeCode}|${visibleTerm(term).replace(/^(?:der|die|das)\s+/iu, "").toLocaleLowerCase("de-DE")}`;
}

function normalizeChinese(value) {
  const result = toSimplified(clean(value)).replace(/([什怎那这])幺/gu, "$1么").replace(/\s+([，。！？；：])/gu, "$1");
  return /[。！？…]$/u.test(result) ? result : `${result}。`;
}

function originalExample(entry, index) {
  const term = visibleTerm(entry.term);
  const noun = nounHeadword(term);
  const names = ["Anna", "Ben", "Clara", "David", "Mina", "Jonas"];
  const name = names[index % names.length];
  if (["nm", "nf", "nn"].includes(entry.typeCode)) {
    const article = entry.typeCode === "nm" ? "den" : entry.typeCode === "nf" ? "die" : "das";
    return `Heute sprechen wir über ${article} ${noun} im Museum.`;
  }
  if (entry.typeCode === "v") {
    if (/^sein$/iu.test(term)) return `${name} versucht, auch in schwierigen Situationen ruhig zu sein.`;
    if (/^haben$/iu.test(term)) return `${name} möchte am Wochenende genug Zeit haben.`;
    if (/^werden$/iu.test(term)) return `Die Situation kann morgen noch anders werden.`;
    return `Im Alltag ist es hilfreich, wenn man ${term} kann.`;
  }
  if (entry.typeCode === "adj") return `Die Stimmung im Raum war heute ${term}.`;
  if (entry.typeCode === "adv") return `${name} trifft sich heute am Bahnhof und spricht ${term} über den Plan.`;
  if (entry.typeCode === "prep") {
    if (/^mit$/iu.test(term)) return `${name} fährt mit dem Bus zur Arbeit.`;
    if (/^für$/iu.test(term)) return `${name} kauft für seine Schwester ein Geschenk.`;
    if (/^in$/iu.test(term)) return `${name} wartet in der Bibliothek.`;
    if (/^von$/iu.test(term)) return `Der Brief von ${name} liegt auf dem Tisch.`;
    return `${name} spricht mit dem Team über den Plan.`;
  }
  if (entry.typeCode === "conj") return `${name} liest den Text, und ${term} verbindet den Satz mit dem nächsten Gedanken.`;
  if (entry.typeCode === "pron") return `${name} sagt, dass ${term} heute selbst entscheiden darf.`;
  if (entry.typeCode === "det") return `Ein Kind liest am Fenster ein Buch, während ${name} wartet.`;
  return `Im Museum erklärt ${name}, warum das Wort „${term}“ in diesem Zusammenhang wichtig ist.`;
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
  const result = Array.isArray(payload?.[0]) ? payload[0].map((part) => part?.[0] ?? "").join("") : "";
  if (!result) throw new Error("empty translation");
  return normalizeChinese(result);
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

async function concurrent(items, limit, mapper) {
  const result = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      result[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return result;
}

const pool = JSON.parse(await readFile("data/editorial/literary-example-pool-v1.json", "utf8"));
const poolById = new Map(pool.entries.map((entry) => [entry.id, entry]));
const ledger = JSON.parse(await readFile("reports/example-review-ledger-v1.json", "utf8"));
const ledgerById = new Map(ledger.entries.map((entry) => [entry.id, entry]));
const reviews = [];
for (const level of LEVELS) {
  const review = JSON.parse(await readFile(`data/editorial/${level}-review.json`, "utf8"));
  for (const record of review.entries ?? []) {
    const after = record.after ?? record.afterEntry;
    if (!after || record.unresolved === true || !after.example || !after.exampleZh) continue;
    reviews.push(after);
  }
}
const editorialByKey = new Map();
for (const entry of reviews) {
  const candidate = { example: clean(entry.example), exampleZh: normalizeChinese(entry.exampleZh) };
  if (!editorialByKey.has(key(entry.term, entry.typeCode))) editorialByKey.set(key(entry.term, entry.typeCode), candidate);
}

const pending = [];
const books = [];
for (const level of LEVELS) {
  const file = `public/wordbooks/${level}-v1.json`;
  const document = JSON.parse(await readFile(file, "utf8"));
  const field = Object.fromEntries(document.fields.map((name, index) => [name, index]));
  for (const row of document.words) {
    if (!/——《[^》]+》$/u.test(row[field.example])) continue;
    const cleanLiterary = poolById.get(row[field.id]);
    if (cleanLiterary) {
      row[field.example] = `${clean(cleanLiterary.german)}——《${cleanLiterary.source.title}》`;
      row[field.exampleZh] = normalizeChinese(cleanLiterary.chinese);
      const ledgerEntry = ledgerById.get(row[field.id]);
      if (ledgerEntry) {
        ledgerEntry.action = "replaced_literary_source_with_curated_short_source";
        ledgerEntry.newExample = row[field.example];
        ledgerEntry.newExampleZh = row[field.exampleZh];
        ledgerEntry.evidence = {
          source: "Project Gutenberg public-domain literary edition",
          title: cleanLiterary.source.title,
          author: cleanLiterary.source.author,
          url: cleanLiterary.source.url,
          policy: "curated short sentence allowlist; source attribution retained",
        };
      }
      continue;
    }
    const editorial = editorialByKey.get(key(row[field.term], row[field.typeCode]));
    if (editorial) {
      row[field.example] = editorial.example;
      row[field.exampleZh] = editorial.exampleZh;
      const ledgerEntry = ledgerById.get(row[field.id]);
      if (ledgerEntry) {
        ledgerEntry.action = "replaced_literary_source_with_editorial_review_example";
        ledgerEntry.newExample = editorial.example;
        ledgerEntry.newExampleZh = editorial.exampleZh;
        ledgerEntry.evidence = { source: "Worttag editorial review", policy: "removed a low-quality literary extraction" };
      }
      continue;
    }
    const example = originalExample({ term: row[field.term], typeCode: row[field.typeCode] }, pending.length);
    pending.push({ id: row[field.id], row, field, document, example });
  }
  books.push({ file, document });
}

const translations = await concurrent(pending, 8, async (item) => ({
  ...item,
  exampleZh: await translateWithRetry(item.example),
}));
for (const item of translations) {
  item.row[item.field.example] = item.example;
  item.row[item.field.exampleZh] = item.exampleZh;
  const ledgerEntry = ledgerById.get(item.id);
  if (ledgerEntry) {
    ledgerEntry.action = "replaced_literary_source_with_original_context";
    ledgerEntry.newExample = item.example;
    ledgerEntry.newExampleZh = item.exampleZh;
    ledgerEntry.evidence = { source: "Worttag original learner example", policy: "removed a low-quality literary extraction; no fictional attribution" };
  }
}

for (const { file, document } of books) await writeFile(file, `${JSON.stringify(document)}\n`, "utf8");
ledger.generatedAt = new Date().toISOString();
ledger.summary = { ...(ledger.summary ?? {}), literarySourceCurated: pool.entries.length, literarySourceDowngraded: pending.length };
await writeFile("reports/example-review-ledger-v1.json", `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ curated: pool.entries.length, downgraded: pending.length }, null, 2)}\n`);
