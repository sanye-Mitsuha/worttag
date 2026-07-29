import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  buildMatchPatterns,
  loadParallelCorpus,
  matchSentence,
  selectUniqueCandidates,
  tokenizeGerman,
} from "../scripts/build_tatoeba_examples.mjs";

test("declared verb forms match the lexical form, never a bare auxiliary", () => {
  const entry = {
    term: "landen",
    forms: "landen · landet · landete · sein gelandet",
    localType: "v",
    typeCode: "v",
  };
  const patterns = buildMatchPatterns(entry);

  assert.equal(
    matchSentence(patterns, tokenizeGerman("Wir landen morgen in Berlin.")).mode,
    "headword_exact",
  );
  assert.equal(
    matchSentence(patterns, tokenizeGerman("Das Flugzeug ist sicher gelandet.")).mode,
    "declared_form",
  );
  assert.equal(matchSentence(patterns, tokenizeGerman("Sie haben recht.")), null);
  assert.ok(!patterns.some((pattern) => pattern.tokens.includes("sein")));
});

test("separable forms require both lexical pieces and a clause-final particle", () => {
  const entry = {
    term: "aufstehen",
    forms: "trennbar · steht auf · stand auf · ist aufgestanden",
    localType: "Verb",
    typeCode: null,
  };
  const patterns = buildMatchPatterns(entry);

  assert.equal(
    matchSentence(patterns, tokenizeGerman("Er steht jeden Morgen früh auf.")).mode,
    "declared_phrase",
  );
  assert.equal(
    matchSentence(patterns, tokenizeGerman("Er stand auf und ging zur Tür.")).mode,
    "declared_phrase",
  );
  assert.equal(
    matchSentence(patterns, tokenizeGerman("Das Glas stand auf dem Tisch.")),
    null,
  );
});

test("noun articles are not treated as evidence for the target noun", () => {
  const entry = {
    term: "die Familie",
    forms: "die Familie · die Familien",
    localType: "nf",
    typeCode: "nf",
  };
  const patterns = buildMatchPatterns(entry);
  assert.deepEqual(
    patterns.map((pattern) => pattern.tokens),
    [["familie"], ["familie"], ["familien"]],
  );
  assert.equal(
    matchSentence(patterns, tokenizeGerman("Meine Familie wohnt in Köln.")).mode,
    "headword_exact",
  );
  assert.equal(matchSentence(patterns, tokenizeGerman("Die Frau wohnt in Köln.")), null);
});

test("noun matches require the target surface to be capitalized", () => {
  const entry = {
    term: "die Mitte",
    forms: "die Mitte · die Mitten",
    localType: "nf",
    typeCode: "nf",
  };
  const patterns = buildMatchPatterns(entry);
  assert.equal(
    matchSentence(
      patterns,
      tokenizeGerman("Es ist mitten in der Nacht."),
      ["Es", "ist", "mitten", "in", "der", "Nacht"],
    ),
    null,
  );
  assert.equal(
    matchSentence(
      patterns,
      tokenizeGerman("Die Mitte ist markiert."),
      ["Die", "Mitte", "ist", "markiert"],
    ).mode,
    "headword_exact",
  );
});

test("parallel loader preserves exact one-based line alignment and filters invalid pairs", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "worttag-tatoeba-test-"));
  try {
    await writeFile(
      path.join(directory, "Tatoeba.cmn-de.de"),
      "Ich muss schlafen gehen.\nWir landen morgen in Berlin.\nhttps://example.test\n",
      "utf8",
    );
    await writeFile(
      path.join(directory, "Tatoeba.cmn-de.cmn"),
      "我该去睡觉了。\n我们明天在柏林降落。\n无效链接\n",
      "utf8",
    );
    const corpus = await loadParallelCorpus(directory);
    assert.equal(corpus.sourceLineCount, 3);
    assert.equal(corpus.pairs.length, 2);
    assert.equal(corpus.rejected, 1);
    assert.deepEqual(
      corpus.pairs.map((pair) => [pair.sourceLine, pair.german, pair.chinese]),
      [
        [1, "Ich muss schlafen gehen.", "我该去睡觉了。"],
        [2, "Wir landen morgen in Berlin.", "我们明天在柏林降落。"],
      ],
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("unique selection never assigns the same German sentence twice", () => {
  const shared = {
    pairId: "shared",
    sourceLine: 1,
    german: "Wir lernen heute Deutsch.",
    chinese: "我们今天学德语。",
    match: { mode: "headword_exact", forms: ["lernen"], targetVerified: true },
    score: 100,
  };
  const alternative = {
    ...shared,
    pairId: "alternative",
    sourceLine: 2,
    german: "Sie lernen jeden Abend.",
    chinese: "他们每天晚上学习。",
    score: 90,
  };
  const selections = selectUniqueCandidates([
    { entry: { id: "word-a" }, candidates: [shared] },
    { entry: { id: "word-b" }, candidates: [shared, alternative] },
  ]);
  assert.equal(selections.get("word-a").pairId, "shared");
  assert.equal(selections.get("word-b").pairId, "alternative");
  assert.equal(new Set([...selections.values()].map((value) => value.german)).size, 2);
});
