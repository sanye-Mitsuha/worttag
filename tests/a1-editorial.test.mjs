import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const fields = ["id", "term", "forms", "typeCode", "meaning", "example", "exampleZh"];

test("A1 editorial record covers and reproduces every packed row", async () => {
  const [book, review] = await Promise.all([
    readFile("public/wordbooks/a1-v1.json", "utf8").then(JSON.parse),
    readFile("data/editorial/a1-review.json", "utf8").then(JSON.parse),
  ]);

  assert.equal(book.level, "A1");
  assert.equal(book.count, 630);
  assert.deepEqual(book.fields, fields);
  assert.equal(book.words.length, 630);
  assert.equal(review.reviewedCount, 630);
  assert.equal(review.changedCount, 630);
  assert.equal(review.unresolvedCount, 0);
  assert.equal(review.entries.length, 630);

  const ids = new Set();
  const lexicalKeys = new Set();
  for (const [index, packed] of book.words.entries()) {
    const row = Object.fromEntries(fields.map((field, fieldIndex) => [field, packed[fieldIndex]]));
    const entry = review.entries[index];
    assert.deepEqual(row, entry.after);
    assert.equal(entry.id, row.id);
    assert.equal(entry.unresolved, false);
    const lexicalChanged = ["term", "forms", "typeCode", "meaning"].some(
      (field) => entry.before[field] !== entry.after[field],
    );
    assert.equal(
      entry.progressMigration,
      lexicalChanged ? "reset_changed_lexeme" : "preserve_unchanged_lexeme",
    );
    if (lexicalChanged) assert.notEqual(entry.before.id, row.id);
    else assert.equal(entry.before.id, row.id);
    assert.ok(entry.evidence.some((evidence) => evidence.source === "German Wiktionary via WiktAPI"));
    assert.ok(
      entry.evidence.some(
        (evidence) =>
          evidence.source === "Worttag A1 editorial review" &&
          evidence.kind === "manually written example and Simplified-Chinese translation",
      ),
    );

    assert.ok(!ids.has(row.id), `duplicate A1 ID: ${row.id}`);
    ids.add(row.id);
    const lexicalKey = `${row.term.toLocaleLowerCase("de-DE")}\0${row.typeCode}`;
    assert.ok(!lexicalKeys.has(lexicalKey), `duplicate A1 lexical unit: ${row.term}/${row.typeCode}`);
    lexicalKeys.add(lexicalKey);

    assert.match(row.meaning, /[\u3400-\u9fff]/u);
    assert.match(row.exampleZh, /[\u3400-\u9fff]/u);
    assert.doesNotMatch(
      `${row.forms}\n${row.meaning}\n${row.example}\n${row.exampleZh}`,
      /尚待人工|词义见例句|Im Wörterbuch steht|学习词|Sie haben recht|redaktionell festzulegen/iu,
    );
    if (row.typeCode === "nm") assert.match(row.term, /^der /u);
    if (row.typeCode === "nf") assert.match(row.term, /^die /u);
    if (row.typeCode === "nn") assert.match(row.term, /^das /u);
  }
});
