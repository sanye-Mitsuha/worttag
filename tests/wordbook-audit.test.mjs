import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  buildAuditReport,
  loadCuratedEntries,
  loadPackedEntries,
  normalizeLookupLemmas,
} from "../scripts/audit_wordbooks.mjs";

const root = process.cwd();

test("loads all packed and curated learning entries", async () => {
  const [packed, curated] = await Promise.all([
    loadPackedEntries(root),
    loadCuratedEntries(root),
  ]);
  assert.equal(packed.length, 5900);
  assert.equal(curated.length, 100);
  assert.equal(new Set([...packed, ...curated].map((entry) => entry.id)).size, 6000);
});

test("normalizes dictionary headwords without losing phrase fallbacks", () => {
  assert.deepEqual(normalizeLookupLemmas("die Familie", "nf"), ["Familie"]);
  assert.deepEqual(
    normalizeLookupLemmas("sich an etwas gewöhnen", "Reflexives Verb"),
    ["gewöhnen", "sich an etwas gewöhnen", "an gewöhnen"],
  );
  assert.deepEqual(
    normalizeLookupLemmas("Rücksicht nehmen", "固定搭配"),
    ["Rücksicht nehmen", "nehmen", "Rücksicht"],
  );
});

test("consumes WiktAPI cache records and emits coverage and error flags", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "worttag-audit-"));
  const cachePath = path.join(directory, "wiktapi.json");
  await writeFile(
    cachePath,
    JSON.stringify({
      schemaVersion: 1,
      provider: "WiktAPI",
      edition: "de",
      language: "de",
      entries: {
        aufstehen: {
          status: 200,
          response: {
            word: "aufstehen",
            edition: "de",
            definitions: [
              {
                pos: "verb",
                lang_code: "de",
                senses: [{ glosses: ["sich aus einer sitzenden oder liegenden Position erheben"] }],
              },
            ],
          },
        },
        ich: {
          status: 200,
          response: {
            word: "ich",
            edition: "de",
            definitions: [{
              pos: "pron",
              lang_code: "de",
              senses: [{ glosses: ["Personalpronomen der ersten Person Singular"] }],
            }],
          },
        },
        Ich: {
          status: 200,
          response: {
            word: "Ich",
            edition: "de",
            definitions: [{
              pos: "noun",
              lang_code: "de",
              senses: [{ glosses: ["die eigene Person"] }],
            }],
          },
        },
        "this-is-not-used": {
          status: 404,
          response: null,
        },
      },
    }),
    "utf8",
  );

  const report = await buildAuditReport({
    root,
    cachePath,
    generatedAt: "2026-07-28T00:00:00.000Z",
  });
  assert.equal(report.summary.total, 6000);
  assert.equal(report.dictionaryCache.records, 4);
  const aufstehen = report.entries.find((entry) => entry.id === "a1-aufstehen");
  assert.equal(aufstehen.dictionary.status, "found");
  assert.equal(aufstehen.dictionary.selectedLemma, "aufstehen");
  assert.equal(aufstehen.dictionary.senseCount, 1);
  assert.ok(!aufstehen.flags.includes("dictionary_pos_mismatch"));
  const lowerCaseIch = report.entries.find(
    (entry) => entry.sourceKind === "packed" && entry.term === "ich",
  );
  assert.equal(lowerCaseIch.dictionary.cacheKey, "ich");
  assert.deepEqual(lowerCaseIch.dictionary.positions, ["pron"]);
  assert.ok(!lowerCaseIch.flags.includes("dictionary_pos_mismatch"));

  const generatedFallback = report.entries.find(
    (entry) => entry.sourceKind === "packed" && entry.example === "Sie haben recht.",
  );
  assert.equal(generatedFallback, undefined);
  assert.equal(report.summary.flags.example_known_unrelated ?? 0, 0);
  assert.equal(report.summary.flags.example_synthetic_placeholder ?? 0, 0);
  assert.equal(report.summary.flags.provenance_missing ?? 0, 0);
  assert.equal(report.summary.flags.cefr_evidence_missing ?? 0, 0);
});
