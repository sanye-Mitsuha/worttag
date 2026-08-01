import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const fields = ["id", "term", "forms", "typeCode", "meaning", "example", "exampleZh"];

test("A1 import contains 700 entries with learner-facing examples", async () => {
  const book = await readFile("public/wordbooks/a1-v1.json", "utf8").then(JSON.parse);
  assert.equal(book.level, "A1");
  assert.equal(book.count, 700);
  assert.deepEqual(book.fields, fields);
  assert.equal(book.words.length, 700);

  const ids = new Set();
  for (const row of book.words) {
    const [id, term, forms, typeCode, meaning, example, exampleZh] = row;
    assert.match(id, /^core6000-a1-\d{4}$/u);
    assert.ok(!ids.has(id), `duplicate A1 ID: ${id}`);
    ids.add(id);
    assert.ok(term.trim());
    assert.ok(forms.trim());
    assert.match(meaning, /[\u3400-\u9fff]/u);
    assert.ok(example.trim());
    assert.ok(exampleZh.trim());
    if (typeCode === "nm") assert.match(term, /^der(?:\/|\s)/u);
    if (typeCode === "nf") assert.match(term, /^die(?:\/|\s)/u);
    if (typeCode === "nn") assert.match(term, /^das(?:\/|\s)/u);
  }
});
