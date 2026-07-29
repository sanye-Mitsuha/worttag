#!/usr/bin/env node

import { access, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const allLevels = ["a1", "a2", "b1", "b2", "c1"];
const requested = process.argv.slice(2);
const levels = requested.length ? requested : allLevels;
for (const level of levels) {
  if (!allLevels.includes(level)) throw new Error(`Unknown level: ${level}`);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeJsonAtomic(filePath, value, pretty = false) {
  const temporary = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`, "utf8");
  await rename(temporary, filePath);
}

function normalizePerfectAuxiliary(forms, typeCode) {
  if (typeCode !== "v") return forms;
  const parts = forms.split("·").map((part) => part.trim());
  if (parts.length < 2) return forms;
  const last = parts.at(-1);
  if (/^haben\b/u.test(last)) parts[parts.length - 1] = last.replace(/^haben\b/u, "hat");
  else if (/^sein\b/u.test(last)) parts[parts.length - 1] = last.replace(/^sein\b/u, "ist");
  return parts.join(" · ");
}

let changed = 0;
const byLevel = {};

for (const level of levels) {
  const wordbookPath = path.join(process.cwd(), "public", "wordbooks", `${level}-v1.json`);
  const reviewPath = path.join(process.cwd(), "data", "editorial", `${level}-review.json`);
  const wordbook = JSON.parse(await readFile(wordbookPath, "utf8"));
  const field = Object.fromEntries(wordbook.fields.map((name, index) => [name, index]));
  const review = await exists(reviewPath)
    ? JSON.parse(await readFile(reviewPath, "utf8"))
    : null;
  const reviewById = new Map((review?.entries ?? []).map((entry) => [entry.after?.id ?? entry.id, entry]));
  let levelChanged = 0;

  for (const row of wordbook.words) {
    const previous = row[field.forms];
    const next = normalizePerfectAuxiliary(previous, row[field.typeCode]);
    if (next === previous) continue;
    row[field.forms] = next;
    const editorial = reviewById.get(row[field.id]);
    if (editorial) {
      editorial.after.forms = next;
      editorial.reason = Array.from(new Set([
        ...(editorial.reason ?? []),
        "The perfect auxiliary was normalized to the third-person teaching form hat/ist.",
      ]));
    }
    levelChanged += 1;
    changed += 1;
  }

  if (levelChanged) {
    await writeJsonAtomic(wordbookPath, wordbook);
    if (review) await writeJsonAtomic(reviewPath, review, true);
  }
  byLevel[level.toUpperCase()] = levelChanged;
}

process.stdout.write(`${JSON.stringify({ changed, byLevel }, null, 2)}\n`);
