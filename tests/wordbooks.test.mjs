import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const root = process.cwd();
const levels = ["A1", "A2", "B1", "B2", "C1"];
const targets = { A1: 700, A2: 700, B1: 1000, B2: 1600, C1: 2000 };
const fields = ["id", "term", "forms", "typeCode", "meaning", "example", "exampleZh"];
const typeCodes = new Set(["nm", "nf", "nn", "v", "adj", "adv", "prep", "conj", "pron", "det", "intj"]);

test("Core 6000 import keeps the supplied CEFR split and core lexical fields", async () => {
  const ids = new Set();
  const lexicalEntries = new Set();
  let total = 0;

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
      const [id, term, forms, typeCode, meaning, example, exampleZh] = row;
      assert.match(id, new RegExp(`^core6000-${level.toLowerCase()}-\\d{4}$`));
      assert.ok(!ids.has(id), `duplicate ID: ${id}`);
      ids.add(id);
      assert.equal(typeof term, "string");
      assert.ok(term.trim());
      assert.equal(typeof forms, "string");
      assert.ok(forms.trim());
      assert.ok(typeCodes.has(typeCode), `unsupported type: ${typeCode}`);
      assert.match(meaning, /[\u3400-\u9fff]/);
      assert.ok(example.trim(), "the wordbook row is missing a German example");
      assert.ok(exampleZh.trim(), "the wordbook row is missing a Chinese example");
      const lexicalKey = `${term.toLocaleLowerCase("de-DE")}\0${typeCode}`;
      assert.ok(!lexicalEntries.has(lexicalKey), `duplicate lexical entry: ${term}/${typeCode}`);
      lexicalEntries.add(lexicalKey);
      if (typeCode === "nm") assert.match(term, /^der(?:\/|\s)/u);
      if (typeCode === "nf") assert.match(term, /^die(?:\/|\s)/u);
      if (typeCode === "nn") assert.match(term, /^das(?:\/|\s)/u);
    }
    total += document.words.length;
  }

  assert.equal(total, 6000);
  assert.equal(ids.size, 6000);
});

test("wordbook manifest records the source and cumulative course sizes", async () => {
  const manifest = JSON.parse(
    await readFile(path.join(root, "public", "wordbooks", "manifest-v1.json"), "utf8"),
  );
  assert.equal(manifest.source, "德语核心6000词_A1-C1 2.xlsx");
  assert.deepEqual(manifest.wordCounts, targets);
  assert.deepEqual(manifest.cumulativeCourseCounts, {
    A1: 700,
    A2: 1400,
    B1: 2400,
    B2: 4000,
    C1: 6000,
  });
});
