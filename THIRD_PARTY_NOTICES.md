# Third-party data notices

The MIT License in the repository root applies to Worttag's application code.
It does not replace the licenses of vocabulary, example-sentence, lexical or
frequency data under `public/wordbooks/`.

The supplemental wordbooks contain material derived from or validated against
the following open resources:

- German Language Community, including Wiktionary-derived vocabulary under
  CC BY-SA 4.0 and Tatoeba-derived examples under CC BY 2.0 FR.
- OPUS Tatoeba German–Mandarin aligned corpus, release 2026-07-08, used for
  reproducible bilingual example selection under CC BY 2.0 FR.
- `german-nouns`, derived from German Wiktionary, under CC BY-SA 4.0.
- OdeNet 1.4 under CC BY-SA 4.0.
- Open English WordNet 2024 under CC BY 4.0.
- Chinese Open Wordnet 1.4 under its WordNet license.
- FrequencyWords German frequency data under CC BY-SA 4.0.
- HanDeDict edition 2026-07-28 under CC BY-SA 3.0. Worttag's reverse
  lookup cache remains separately attributed under
  [`data/lexicon/HANDEDICT_ATTRIBUTION.md`](data/lexicon/HANDEDICT_ATTRIBUTION.md).
- OpenCC data through `opencc-js` 1.4.1, used only by release tooling to
  normalize and verify learner-facing Simplified Chinese. The package declares
  `MIT AND Apache-2.0`; its bundled dictionary notices remain in the package.
- German Wiktionary definitions shown in the in-app dictionary remain under
  CC BY-SA 4.0 and are requested as structured data through WiktApi. Each
  result links back to its Wiktionary entry and keeps the license notice.
- DWDS is queried only for limited headword, word-class and collection
  evidence. Full DWDS dictionary and corpus content remains on the DWDS site.
- Duden, PONS and Langenscheidt content is not copied into the repository.
  Worttag provides query links to the publishers' original pages. PONS API
  content is not embedded without a project-specific API licence.

Dictionary service references:

- https://de.wiktionary.org/
- https://wiktapi.dev/
- https://www.dwds.de/
- https://www.duden.de/woerterbuch
- https://de.pons.com/
- https://de.langenscheidt.com/deutsch-chinesisch/

Worttag filtered, normalised, deduplicated and reclassified the source
material; corrected noun gender and inflection; selected senses against
examples; generated additional examples where needed; and added Simplified
Chinese translations.

Except where an example sentence retains its CC BY 2.0 FR terms or another
source-specific license applies, the supplemental lexical resources are
distributed under CC BY-SA 4.0. The CEFR bands are Worttag course
classifications and are not official Goethe word lists.

For source URLs, pinned versions and the authoritative attribution text, see
[`public/wordbooks/ATTRIBUTION.txt`](public/wordbooks/ATTRIBUTION.txt).
