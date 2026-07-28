import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import path from "node:path";

const root = process.cwd();
const levels = ["A1", "A2", "B1", "B2", "C1"];
const targets = { A1: 630, A2: 630, B1: 1080, B2: 1580, C1: 1980 };
const fields = ["id", "term", "forms", "typeCode", "meaning", "example", "exampleZh"];

async function legacyIds() {
  const files = ["app/page.tsx", "app/wordbooks-a1-a2.ts", "app/wordbooks-advanced.ts"];
  const ids = new Set();
  for (const file of files) {
    const source = await readFile(path.join(root, file), "utf8");
    for (const match of source.matchAll(/\bid:\s*"([^"]+)"/g)) ids.add(match[1]);
  }
  return ids;
}

test("expanded wordbooks have exact counts, schema, and unique stable IDs", async () => {
  const ids = await legacyIds();
  assert.equal(ids.size, 100, "the curated legacy set must stay at 100 entries");
  const lexicalEntries = new Set();
  let supplemental = 0;

  for (const level of levels) {
    const file = path.join(root, "public", "wordbooks", `${level.toLowerCase()}-v1.json`);
    const document = JSON.parse(await readFile(file, "utf8"));
    assert.equal(document.schemaVersion, 1);
    assert.equal(document.level, level);
    assert.equal(document.count, targets[level]);
    assert.deepEqual(document.fields, fields);
    assert.equal(document.words.length, targets[level]);

    for (const row of document.words) {
      assert.equal(row.length, fields.length);
      assert.ok(row.every((value) => typeof value === "string" && value.trim().length > 0));
      const [id, term, , typeCode, meaning, example, exampleZh] = row;
      assert.match(id, new RegExp(`^wb-${level.toLowerCase()}-[a-z0-9-]+-[a-f0-9]{7}$`));
      assert.ok(!ids.has(id), `duplicate ID: ${id}`);
      ids.add(id);
      const lexicalKey = `${term.toLocaleLowerCase("de-DE")}\0${typeCode}`;
      assert.ok(!lexicalEntries.has(lexicalKey), `duplicate lexical entry: ${term}/${typeCode}`);
      lexicalEntries.add(lexicalKey);
      assert.match(meaning, /[\u3400-\u9fff]/);
      assert.match(exampleZh, /[\u3400-\u9fff]/);
      assert.doesNotMatch(example, /\[\.\.\.|\[=/);
      if (typeCode === "nm") assert.match(term, /^der /);
      if (typeCode === "nf") assert.match(term, /^die /);
      if (typeCode === "nn") assert.match(term, /^das /);
    }
    supplemental += document.words.length;
  }

  assert.equal(supplemental, 5900);
  assert.equal(ids.size, 6000);
});

test("wordbook manifest exposes the intended cumulative course sizes", async () => {
  const manifest = JSON.parse(
    await readFile(path.join(root, "public", "wordbooks", "manifest-v1.json"), "utf8"),
  );
  assert.deepEqual(manifest.supplementalCounts, targets);
  assert.deepEqual(manifest.legacyCounts, { A1: 20, A2: 20, B1: 20, B2: 20, C1: 20 });
  assert.deepEqual(manifest.cumulativeCourseCounts, {
    A1: 650,
    A2: 1300,
    B1: 2400,
    B2: 4000,
    C1: 6000,
  });
});
