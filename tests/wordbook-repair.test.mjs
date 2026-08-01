import assert from "node:assert/strict";
import { test } from "node:test";

import { buildAuditReport } from "../scripts/audit_wordbooks.mjs";

const root = process.cwd();

test("the source audit marks imported provenance and skips absent source examples", async () => {
  const report = await buildAuditReport({
    root,
    generatedAt: "2026-08-01T00:00:00.000Z",
  });
  assert.equal(report.summary.total, 6000);
  assert.equal(report.summary.editorial.imported_source, 6000);
  for (const flag of [
    "example_synthetic_placeholder",
    "example_known_unrelated",
    "example_translation_known_unrelated",
    "example_target_not_detected",
    "example_reused_three_plus",
  ]) {
    assert.equal(report.summary.flags[flag] ?? 0, 0, `${flag} must be zero`);
  }
});
