import assert from "node:assert/strict";
import { test } from "node:test";

import { buildAuditReport } from "../scripts/audit_wordbooks.mjs";

const root = process.cwd();

test("packed wordbooks have no known hard lexical residue or placeholder examples", async () => {
  const report = await buildAuditReport({
    root,
    generatedAt: "2026-07-28T00:00:00.000Z",
  });
  const hardFlags = [
    "meaning_placeholder",
    "meaning_machine_prompt_residue",
    "advanced_single_character_gloss",
    "chinese_traditional_residue",
    "chinese_corrupt_script",
    "chinese_known_garbage_phrase",
    "chinese_repeated_terminal_punctuation",
    "example_synthetic_placeholder",
    "example_known_unrelated",
    "example_translation_known_unrelated",
  ];
  for (const flag of hardFlags) {
    assert.equal(report.summary.flags[flag] ?? 0, 0, `${flag} must be zero`);
  }
});
