import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  buildCorpusCache,
  extractGermanCandidates,
  normalizeGermanHeadword,
  parseHanDeDictEntryLine,
  readHanDeDict,
} from "../scripts/build_handedict_reverse_index.mjs";

test("HanDeDict CEDICT lines expose simplified Chinese and current German senses", () => {
  const parsed = parseHanDeDictEntryLine(
    "克服 克服 [ke4 fu2] /aushalten, ertragen (V)/überwinden (V)/",
    {
      sourceId: "ID-example",
      revisionAt: "2026-07-28T02:30:01Z",
      revisionStatus: "Verif",
    },
  );
  assert.equal(parsed.simplified, "克服");
  assert.equal(parsed.definitions.length, 2);
  assert.deepEqual(
    parsed.definitions[0].candidates.map((candidate) => ({
      normalized: candidate.normalized,
      positions: candidate.positions,
    })),
    [
      { normalized: "aushalten", positions: ["verb"] },
      { normalized: "ertragen", positions: ["verb"] },
    ],
  );
});

test("POS tags propagate within comma groups but remain separated across senses", () => {
  assert.deepEqual(
    extractGermanCandidates("aber, doch (Konj); dennoch (Adv)").map((candidate) => [
      candidate.normalized,
      candidate.positions,
    ]),
    [
      ["aber", ["conjunction"]],
      ["doch", ["conjunction"]],
      ["dennoch", ["adverb"]],
    ],
  );
});

test("German lookup normalization removes only articles and valency markers", () => {
  assert.equal(normalizeGermanHeadword("der Abfall"), "abfall");
  assert.equal(normalizeGermanHeadword("sich anpassen"), "anpassen");
  assert.equal(normalizeGermanHeadword("etw. in Frage stellen"), "in frage stellen");
  assert.equal(normalizeGermanHeadword("Bank (Sitzmöbel)"), "bank (sitzmöbel)");
});

test("corpus matching prefers explicit POS evidence and never auto-applies it", () => {
  const sourceEntries = [
    parseHanDeDictEntryLine("銀行 银行 [yin2 hang2] /Bank (S)/", {
      sourceId: "ID-bank-noun",
      revisionStatus: "Verif",
    }),
    parseHanDeDictEntryLine("傾斜 倾斜 [qing1 xie2] /bank (V)/", {
      sourceId: "ID-bank-verb",
      revisionStatus: "New",
    }),
  ];
  const [result] = buildCorpusCache([
    {
      id: "bank",
      level: "A1",
      term: "die Bank",
      typeCode: "nf",
      localType: "nf",
    },
  ], sourceEntries);
  assert.equal(result.status, "pos_matched");
  assert.equal(result.autoApply, false);
  assert.deepEqual(result.chineseHeadwords, ["银行"]);
  assert.deepEqual(result.verifiedChineseHeadwords, ["银行"]);
  assert.equal(result.matchCounts.posMatched, 1);
  assert.equal(result.matchCounts.posConflicting, 1);
  assert.deepEqual(result.reviewReasons, ["source_has_other_parts_of_speech"]);
});

test("same-POS corpus homographs are held for sense review", () => {
  const sourceEntries = [
    parseHanDeDictEntryLine("銀行 银行 [yin2 hang2] /Bank (S)/", {
      sourceId: "ID-bank",
      revisionStatus: "Verif",
    }),
  ];
  const results = buildCorpusCache([
    { id: "bank-1", level: "A1", term: "die Bank", typeCode: "nf", localType: "nf" },
    { id: "bank-2", level: "B1", term: "die Bank", typeCode: "nf", localType: "nf" },
  ], sourceEntries);
  assert.ok(results.every((result) => result.status === "same_pos_homograph_review"));
  assert.ok(results.every((result) => result.autoApply === false));
});

test("the streaming reader ignores history and records the declared edition", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "worttag-handedict-"));
  const sourcePath = path.join(temporary, "handedict.u8");
  try {
    await writeFile(sourcePath, [
      "\uFEFF# HanDeDict",
      "# Datenstand: 2026-07-28T02:30:01Z",
      "# Lizenz: CC-BY-SA 3.0",
      "# https://creativecommons.org/licenses/by-sa/3.0/deed.de",
      "# ID-example",
      "# Ver 2020-01-01T00:00:00Z editor Stat-New >old",
      "# 银行 银行 [yin2 hang2] /Geldinstitut (S)/",
      "# Ver 2026-07-28T02:30:01Z editor Stat-Verif >current",
      "銀行 银行 [yin2 hang2] /Bank, Geldinstitut (S)/",
      "",
    ].join("\n"), "utf8");
    const result = await readHanDeDict(sourcePath);
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].sourceId, "ID-example");
    assert.equal(result.entries[0].revisionStatus, "Verif");
    assert.equal(result.source.dataDate, "2026-07-28T02:30:01Z");
    assert.equal(result.stats.currentLines, 1);
    assert.equal(result.stats.malformedCurrentLines, 0);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
