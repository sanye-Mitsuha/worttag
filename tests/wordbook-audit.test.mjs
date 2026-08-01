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

test("auditor loads the complete imported Core 6000 corpus without legacy cards", async () => {
  const [packed, curated] = await Promise.all([loadPackedEntries(root), loadCuratedEntries(root)]);
  assert.equal(packed.length, 6000);
  assert.equal(curated.length, 0);
  assert.equal(new Set(packed.map((entry) => entry.id)).size, 6000);
});

test("normalizes dictionary headwords without losing phrase fallbacks", () => {
  assert.deepEqual(normalizeLookupLemmas("die Familie", "nf"), ["Familie"]);
  assert.deepEqual(
    normalizeLookupLemmas("sich an etwas gewöhnen", "v"),
    ["gewöhnen", "sich an etwas gewöhnen", "an gewöhnen"],
  );
});

test("uses cached dictionary evidence for the imported source without inventing examples", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "worttag-audit-"));
  const cachePath = path.join(directory, "wiktapi.json");
  await writeFile(cachePath, JSON.stringify({
    schemaVersion: 1,
    provider: "WiktAPI",
    edition: "de",
    language: "de",
    entries: {
      sein: {
        status: 200,
        response: {
          word: "sein",
          edition: "de",
          definitions: [{
            pos: "verb",
            lang_code: "de",
            senses: [{ glosses: ["existieren"] }],
          }],
        },
      },
    },
  }), "utf8");

  const report = await buildAuditReport({ root, cachePath, generatedAt: "2026-08-01T00:00:00.000Z" });
  const sein = report.entries.find((entry) => entry.id === "core6000-a1-0002");
  assert.equal(report.summary.total, 6000);
  assert.equal(report.summary.packed, 6000);
  assert.equal(report.summary.curated, 0);
  assert.equal(sein.dictionary.status, "found");
  assert.equal(sein.dictionary.selectedLemma, "sein");
  assert.equal(sein.editorial.status, "imported_source");
  assert.ok(!sein.flags.includes("example_target_not_detected"));
});
