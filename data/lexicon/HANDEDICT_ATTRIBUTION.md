# HanDeDict evidence cache attribution

`handedict-reverse-v1.json` is a mechanically filtered reverse lookup cache
derived from **HanDeDict**, the collaborative Chinese–German dictionary
published by Gábor L Ugray.

- Source export: <https://handedict.zydeo.net/api/export/download>
- Project and source code: <https://github.com/gugray/HanDeDict>
- Online dictionary: <https://handedict.zydeo.net/>
- Data edition: `2026-07-28T02:30:01Z`
- Export SHA-256: `3eb3b82764ab950db0fd61a3a116d8dcafe889902fede2ab32fea904fe001b93`
- License declared by the source export: **CC BY-SA 3.0**
- License text: <https://creativecommons.org/licenses/by-sa/3.0/deed.de>

Worttag's changes are limited to parsing the current CEDICT records, splitting
German gloss segments, normalising exact German headwords, filtering Chinese
headwords, aligning explicit parts of speech, and attaching matches to Worttag
corpus IDs. The cache deliberately marks every candidate `autoApply: false`;
the original HanDeDict record ID, revision, pinyin and gloss are retained so
that an editor can inspect the evidence before accepting a translation.

The checked-in cache and coverage report can be regenerated from the official
export with:

```sh
node scripts/build_handedict_reverse_index.mjs \
  --source /path/to/handedict.u8.gz
```

HanDeDict is a collaborative dictionary. Its matches are useful bilingual
evidence but are not, by themselves, proof that a Worttag sense is correct.
