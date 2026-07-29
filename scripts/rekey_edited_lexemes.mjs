#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const LEVELS = ["a1", "a2", "b1", "b2", "c1"];
const LEXICAL_FIELDS = ["term", "forms", "typeCode", "meaning"];

function lexicalChanged(entry) {
  return LEXICAL_FIELDS.some((field) => entry.before?.[field] !== entry.after?.[field]);
}

function slug(value) {
  const normalized = value
    .replace(/ß/gu, "ss")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("de-DE")
    .replace(/^(der|die|das)\s+/u, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return normalized.slice(0, 28) || "wort";
}

function editedId(level, after) {
  const digest = createHash("sha256")
    .update(`${level}|${after.term}|${after.typeCode}|${after.meaning}`)
    .digest("hex")
    .slice(0, 8);
  return `wb-${level}-${slug(after.term)}-${digest}`;
}

async function writeJsonAtomic(filePath, value, pretty) {
  const temporary = `${filePath}.tmp-${process.pid}`;
  const body = pretty
    ? `${JSON.stringify(value, null, 2)}\n`
    : `${JSON.stringify(value)}\n`;
  await writeFile(temporary, body, "utf8");
  await rename(temporary, filePath);
}

export async function rekeyEditedLexemes(root = process.cwd()) {
  const seenIds = new Set();
  const summary = {};

  for (const level of LEVELS) {
    const wordbookPath = path.join(root, "public", "wordbooks", `${level}-v1.json`);
    const reviewPath = path.join(root, "data", "editorial", `${level}-review.json`);
    const wordbook = JSON.parse(await readFile(wordbookPath, "utf8"));
    const review = JSON.parse(await readFile(reviewPath, "utf8"));
    if (review.entries.length !== wordbook.words.length) {
      throw new Error(
        `${level}: expected ${wordbook.words.length} review rows, found ${review.entries.length}.`,
      );
    }
    const rowsById = new Map(wordbook.words.map((row) => [row[0], row]));
    let rekeyed = 0;
    let preserved = 0;

    for (const entry of review.entries) {
      const oldId = entry.before?.id ?? entry.id;
      const row = rowsById.get(oldId) ?? rowsById.get(entry.after?.id) ?? rowsById.get(entry.id);
      if (!row) throw new Error(`${level}: review row ${oldId} is absent from the wordbook.`);
      const changed = lexicalChanged(entry);
      const newId = changed ? editedId(level, entry.after) : oldId;
      if (seenIds.has(newId)) throw new Error(`Duplicate edited ID: ${newId}`);
      seenIds.add(newId);
      row[0] = newId;
      entry.id = newId;
      entry.after.id = newId;
      entry.progressMigration = changed
        ? "reset_changed_lexeme"
        : "preserve_unchanged_lexeme";
      if (changed) rekeyed += 1;
      else preserved += 1;
    }

    summary[level.toUpperCase()] = { rekeyed, preserved, total: wordbook.words.length };
    await writeJsonAtomic(wordbookPath, wordbook, false);
    await writeJsonAtomic(reviewPath, review, true);
  }

  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const summary = await rekeyEditedLexemes();
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}
