# HanDeDict coverage of the Worttag 6,000-word corpus

## Result

The HanDeDict edition dated `2026-07-28T02:30:01Z` provides an exact German
gloss-segment match for **5,367 of 6,000 Worttag entries (89.45%)**. An explicit
part-of-speech tag agrees with Worttag for **4,947 entries (82.45%)**. Only
**1,727 entries (28.78%)** have at least one agreeing HanDeDict record whose
latest revision is marked `Stat-Verif`.

| Level | Entries | Exact match | Explicit POS match | `Stat-Verif` POS match | No match |
|---|---:|---:|---:|---:|---:|
| A1 | 650 | 607 (93.38%) | 444 (68.31%) | 223 (34.31%) | 43 |
| A2 | 650 | 588 (90.46%) | 533 (82.00%) | 241 (37.08%) | 62 |
| B1 | 1,100 | 977 (88.82%) | 914 (83.09%) | 323 (29.36%) | 123 |
| B2 | 1,600 | 1,438 (89.88%) | 1,375 (85.94%) | 454 (28.38%) | 162 |
| C1 | 2,000 | 1,757 (87.85%) | 1,681 (84.05%) | 486 (24.30%) | 243 |
| **Total** | **6,000** | **5,367 (89.45%)** | **4,947 (82.45%)** | **1,727 (28.78%)** | **633** |

## Method

- Parsed all **160,620** current, uncommented CEDICT records in the official
  export; no current record failed structural parsing.
- Ignored commented historical versions while retaining each current record's
  source ID, latest revision timestamp and revision status.
- Reversed only exact, normalised German gloss segments. The matcher does not
  use substring, fuzzy or embedding similarity.
- Preferred explicit compatible POS evidence and kept untyped or conflicting
  records in separate review categories.
- Accepted a Simplified Chinese headword only when it consists of 1–12 Han
  characters.
- Held same-POS corpus homographs and phrases for manual sense alignment.
- Marked every candidate `autoApply: false`.

## Interpretation

This is a **coverage measurement and editorial evidence cache**, not a finding
that 89.45% of Worttag's Chinese meanings are correct. HanDeDict is a
collaboratively edited dictionary; many current entries carry `Stat-New`
rather than `Stat-Verif`, and exact German homographs can still represent
different senses. A candidate should be accepted only after its POS, sense and
example are aligned with independent German lexicographic evidence.

The 633 unmatched Worttag entries require another bilingual source or manual
translation. The 258 POS-conflict-only entries are useful audit leads: they may
reflect a Worttag POS error, a different HanDeDict sense, or insufficient
HanDeDict tagging.

## Reproducibility and license

- Official export: <https://handedict.zydeo.net/api/export/download>
- Export SHA-256:
  `3eb3b82764ab950db0fd61a3a116d8dcafe889902fede2ab32fea904fe001b93`
- HanDeDict license: **CC BY-SA 3.0**
- Detailed attribution:
  [`data/lexicon/HANDEDICT_ATTRIBUTION.md`](../data/lexicon/HANDEDICT_ATTRIBUTION.md)
- Machine-readable report:
  [`handedict-coverage-v1.json`](handedict-coverage-v1.json)
- Evidence cache:
  [`data/lexicon/handedict-reverse-v1.json`](../data/lexicon/handedict-reverse-v1.json)

Rebuild command:

```sh
node scripts/build_handedict_reverse_index.mjs \
  --source /path/to/handedict.u8.gz
```
