import assert from "node:assert/strict";
import { test } from "node:test";

import { expectedDictionaryPos, loadPackedEntries } from "../scripts/audit_wordbooks.mjs";

const root = process.cwd();

test("imported entries preserve the provided Chinese senses and include example pairs", async () => {
  const packed = await loadPackedEntries(root);
  assert.equal(packed.length, 6000);

  for (const entry of packed) {
    assert.ok(entry.term.trim(), `${entry.id} is missing a headword`);
    assert.ok(entry.forms.trim(), `${entry.id} is missing morphology`);
    assert.ok(entry.meaning.trim(), `${entry.id} is missing a Chinese sense`);
    assert.ok(entry.example.trim(), `${entry.id} is missing a German example`);
    assert.ok(entry.exampleZh.trim(), `${entry.id} is missing a Chinese example`);
    assert.doesNotMatch(entry.meaning, /尚待人工|待人工核定|义项尚待人工核定|词义见例句/u);
    assert.doesNotMatch(entry.meaning, /[\uE000-\uF8FF\uFFFD]|\p{Script=Cyrillic}/u);
  }
});

test("the imported corpus has no repeated surface lexeme within the same dictionary part of speech", async () => {
  const packed = await loadPackedEntries(root);
  const seen = new Map();
  for (const entry of packed) {
    const key = `${entry.term.normalize("NFC")}|${expectedDictionaryPos(entry)}`;
    const previous = seen.get(key);
    assert.equal(previous, undefined, `${entry.id} duplicates ${previous?.id ?? "another row"} as ${key}`);
    seen.set(key, entry);
  }
  assert.equal(seen.size, 6000);
});
