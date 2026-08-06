import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const levels = ["A1", "A2", "B1", "B2", "C1"];
const targets = { A1: 750, A2: 1000, B1: 1200, B2: 3000, C1: 4050 };
const fields = ["id", "term", "forms", "typeCode", "meaning", "example", "exampleZh", "grammarTitle", "grammar", "examples", "conjugations"];
const types = new Set(["nm", "nf", "nn", "v", "adj", "adv", "prep", "conj", "pron", "det", "num", "part", "intj", "prop", "phrase"]);

test("combined CEFR import keeps the source split and empty source examples", async () => {
  const ids = new Set();
  let total = 0;

  for (const level of levels) {
    const book = JSON.parse(await readFile(`public/wordbooks/${level.toLowerCase()}-v2.json`, "utf8"));
    assert.equal(book.schemaVersion, 3);
    assert.equal(book.level, level);
    assert.equal(book.count, targets[level]);
    assert.deepEqual(book.fields, fields);
    assert.equal(book.words.length, targets[level]);

    for (const row of book.words) {
      assert.equal(row.length, fields.length);
      const [id, term, forms, typeCode, meaning, example, exampleZh, grammarTitle, grammar, examples, conjugations] = row;
      assert.ok(!ids.has(id), `duplicate ID: ${id}`);
      ids.add(id);
      assert.match(id, /^(?:core6000|cefr10k)-/u);
      assert.ok(term.trim());
      assert.ok(forms.trim());
      assert.ok(types.has(typeCode), `unsupported type: ${typeCode}`);
      assert.ok(meaning.trim());
      assert.equal(typeof example, "string");
      assert.equal(typeof exampleZh, "string");
      assert.equal(typeof grammarTitle, "string");
      assert.equal(typeof grammar, "string");
      assert.ok(Array.isArray(examples));
      assert.ok(examples.every((item) => Array.isArray(item) && item.length === 3 && item.every((field) => typeof field === "string")));
      assert.ok(Array.isArray(conjugations));
      assert.ok(conjugations.every((table) =>
        typeof table?.pos === "string" &&
        typeof table?.past === "string" &&
        typeof table?.participle === "string" &&
        typeof table?.infinitive === "string" &&
        Array.isArray(table?.rows),
      ));
      if (typeCode === "nm") assert.match(term, /^der(?:\/|\s)/u);
      if (typeCode === "nf") assert.match(term, /^die(?:\/|\s)/u);
      if (typeCode === "nn") assert.match(term, /^das(?:\/|\s)/u);
    }
    total += book.words.length;
  }

  assert.equal(total, 10000);
  assert.equal(ids.size, 10000);
});

test("combined manifest records the CEFR totals and separate special book", async () => {
  const manifest = JSON.parse(await readFile("public/wordbooks/manifest-v2.json", "utf8"));
  assert.equal(manifest.corpus, "combined-cefr-10000");
  assert.deepEqual(manifest.wordCounts, targets);
  assert.deepEqual(manifest.cumulativeCourseCounts, {
    A1: 750,
    A2: 1750,
    B1: 2950,
    B2: 5950,
    C1: 10000,
  });
  assert.equal(manifest.total, 10000);
  assert.equal(manifest.specialIncluded, 151);
  assert.equal(manifest.specialLearningExcluded, 151);
  assert.equal(manifest.specialWordbook, "special-v2.json");
});

test("special entries are available as a separate library-only wordbook", async () => {
  const book = JSON.parse(await readFile("public/wordbooks/special-v2.json", "utf8"));
  assert.equal(book.schemaVersion, 3);
  assert.equal(book.level, "SPECIAL");
  assert.equal(book.count, 151);
  assert.equal(book.words.length, 151);
  assert.match(book.words[0][0], /^special-/u);
  assert.equal(book.words[0][1], "null");
  assert.equal(book.words[0][3], "num");
  assert.ok(book.words.every((row) => typeof row[4] === "string" && row[4].trim()));
});

test("multi-part-of-speech entries mark later source groups", async () => {
  const book = JSON.parse(await readFile("public/wordbooks/a2-v2.json", "utf8"));
  const modern = book.words.find((row) => row[1] === "modern");
  assert.match(modern?.[4] ?? "", /【Vi\.】/u);
  assert.match(modern?.[7] ?? "", /Adj\. \/ Vi\./u);
});

test("source examples stay matched to their meanings and verb tables are preserved", async () => {
  const a1 = JSON.parse(await readFile("public/wordbooks/a1-v2.json", "utf8"));
  const immer = a1.words.find((row) => row[1] === "immer");
  assert.equal(immer?.[9].length, 5);
  assert.equal(immer?.[9][0][0], "① 始终,经常,总是,老是");
  assert.equal(immer?.[9][4][0], "⑤ 〈用来加强语气、程度或用于命令中〉");

  const sollen = a1.words.find((row) => row[1] === "sollen");
  assert.equal(sollen?.[9].length, 8);
  assert.equal(sollen?.[9][7][0], "【V.】① 应该,可以");
  assert.equal(sollen?.[10][0].rows[0][0], "ich");
  assert.equal(sollen?.[10][0].rows[0][1], "soll");
  assert.equal(sollen?.[10][0].past, "sollte");
  assert.equal(sollen?.[10][0].participle, "gesollt");
});

test("combined import does not invent an example for an empty source entry", async () => {
  const book = JSON.parse(await readFile("public/wordbooks/c1-v2.json", "utf8"));
  const abstecken = book.words.find((row) => row[1] === "abstecken");
  assert.deepEqual(abstecken?.slice(5, 7), ["", ""]);
});
