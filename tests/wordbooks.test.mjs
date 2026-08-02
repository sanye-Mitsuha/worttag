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

test("example-quality index covers all rows and keeps explicit risks visible", async () => {
  const quality = JSON.parse(
    await readFile(path.join(root, "public", "wordbooks", "example-quality-v1.json"), "utf8"),
  );
  assert.equal(quality.schemaVersion, 1);
  assert.equal(quality.count, 6000);
  assert.equal(Object.keys(quality.entries).length, 6000);
  assert.equal(quality.summary.byStatus.approved, 6000);
  assert.equal(quality.summary.byStatus.pending, 0);
  assert.equal(quality.summary.byStatus.template, 0);
  assert.equal(quality.summary.byStatus.disputed, 0);
  assert.equal(quality.summary.priorityReviewCount, 0);
  assert.equal(quality.fullReview.fullCorpusReviewApproved, true);
  assert.equal(quality.entries["core6000-a1-0005"].status, "approved");
  assert.ok(quality.entries["core6000-a1-0005"].reviewNotes.includes("inappropriate_beginner_content_corrected"));
  assert.equal(quality.entries["core6000-c1-5972"].status, "approved");
  assert.ok(quality.entries["core6000-c1-5972"].reasonCodes.includes("meaning_latin_residue"));
});

test("explicit content repairs remove the reported beginner and mojibake examples", async () => {
  const a1 = JSON.parse(await readFile(path.join(root, "public", "wordbooks", "a1-v1.json"), "utf8"));
  const c1 = JSON.parse(await readFile(path.join(root, "public", "wordbooks", "c1-v1.json"), "utf8"));
  const ein = a1.words.find((row) => row[0] === "core6000-a1-0005");
  const schoepfen = c1.words.find((row) => row[0] === "core6000-c1-5972");
  assert.deepEqual(ein?.slice(5), ["Ich habe ein Buch.", "我有一本书。"]);
  assert.doesNotMatch(schoepfen?.[4] ?? "", /鰌|鰂|�/u);
});

test("full example review ledger covers every Core 6000 row", async () => {
  const ledger = JSON.parse(
    await readFile(path.join(root, "reports", "example-review-ledger-v1.json"), "utf8"),
  );
  assert.equal(ledger.schemaVersion, 2);
  assert.equal(ledger.summary.total, 6000);
  assert.equal(ledger.summary.fullCorpusReviewApproved, true);
  assert.equal(ledger.entries.length, 6000);
  assert.equal(new Set(ledger.entries.map((entry) => entry.id)).size, 6000);
  assert.ok(ledger.summary.replaced >= 2000);
  assert.ok(ledger.entries.filter((entry) => entry.action.startsWith("replaced_")).length >= 80);
  assert.ok(ledger.entries.every((entry) => entry.action && entry.qualityStatusBefore));
  assert.ok(ledger.entries.every((entry) => entry.qualityStatusAfter === "approved"));
  assert.ok(
    ledger.entries.some((entry) =>
      ["replaced_template_with_literary_source", "replaced_literary_source_with_curated_short_source"].includes(entry.action),
    ),
  );
});

test("corpus-backed replacements are not still deterministic fallback examples", async () => {
  const ledger = JSON.parse(
    await readFile(path.join(root, "reports", "example-review-ledger-v1.json"), "utf8"),
  );
  const replacements = ledger.entries.filter((entry) => entry.action.startsWith("replaced_"));
  assert.ok(replacements.length > 0);
  for (const entry of replacements) {
    const germanExample = entry.newExample.replace(/——《[^》]+》$/u, "");
    assert.match(germanExample, /[.!?。！？…]["“”「」『』']?$/u);
    assert.match(entry.newExampleZh, /[。！？…]["“”「」『』']?$/u);
    assert.doesNotMatch(entry.newExample, /Im Gespräch kann man|Im Satz beschreibt|Mit „/u);
    assert.doesNotMatch(`${entry.newExample}\n${entry.newExampleZh}`, /�|鰌|鰂/u);
  }
});
