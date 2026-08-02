#!/usr/bin/env node

/** Apply only the two explicitly identified, unambiguous content repairs. */

import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const corrections = new Map([
  ["core6000-a1-0005", {
    file: "a1-v1.json",
    example: "Ich habe ein Buch.",
    exampleZh: "我有一本书。",
  }],
  ["core6000-c1-5972", {
    file: "c1-v1.json",
    meaning: "汲、掏、舀；汲取、获得；创造；深呼吸（Luft schöpfen）",
  }],
]);

const changed = [];
for (const [id, correction] of corrections) {
  const file = path.join(root, "public", "wordbooks", correction.file);
  const document = JSON.parse(await readFile(file, "utf8"));
  const row = document.words.find((candidate) => candidate[0] === id);
  if (!row) throw new Error(`Could not find ${id} in ${correction.file}.`);
  const before = [...row];
  if (correction.meaning) row[4] = correction.meaning;
  if (correction.example) row[5] = correction.example;
  if (correction.exampleZh) row[6] = correction.exampleZh;
  const temporary = `${file}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(document)}\n`, "utf8");
  await rename(temporary, file);
  changed.push({ id, before, after: row });
}

process.stdout.write(`${JSON.stringify({ changed }, null, 2)}\n`);

