import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLibrarySearchText,
  matchesLibrarySearch,
  tokenizeLibraryQuery,
} from "../app/library-search.ts";
import {
  expandedMeaning,
  expandedMeaningCount,
} from "../app/meaning-overrides.ts";
import {
  buildDictionaryLinks,
  dictionaryHeadword,
  dictionarySearchTerm,
} from "../app/dictionary-links.ts";
import {
  parseDictionaryEvidencePayload,
  parseDwdsSnippet,
  parseWiktApiDefinitions,
} from "../app/dictionary-evidence.ts";
import { A1_WORDS, A2_WORDS } from "../app/wordbooks-a1-a2.ts";
import {
  B1_ADDITIONS,
  B2_WORDS,
  C1_WORDS,
} from "../app/wordbooks-advanced.ts";

const word = {
  term: "die Straße",
  forms: "die Straßen",
  type: "名词 · 阴性",
  meaning: "街道；道路",
  example: "Die Straße ist heute sehr ruhig.",
  exampleZh: "这条街今天非常安静。",
  grammarTitle: "auf der Straße",
  grammar: "第三格表示静态位置。",
  memory: "与英语 street 联想记忆。",
};

test("finds German words without case, umlaut or eszett sensitivity", () => {
  const searchText = buildLibrarySearchText(word);

  assert.equal(matchesLibrarySearch(searchText, tokenizeLibraryQuery("STRASSE")), true);
  assert.equal(matchesLibrarySearch(searchText, tokenizeLibraryQuery("strassen")), true);
  assert.equal(matchesLibrarySearch(searchText, tokenizeLibraryQuery("ruhig")), false);
});

test("finds Chinese meanings, translated examples and grammar notes", () => {
  const searchText = buildLibrarySearchText(word);

  assert.equal(matchesLibrarySearch(searchText, tokenizeLibraryQuery("街道")), true);
  assert.equal(matchesLibrarySearch(searchText, tokenizeLibraryQuery("非常安静")), true);
  assert.equal(matchesLibrarySearch(searchText, tokenizeLibraryQuery("静态位置")), true);
});

test("does not match German query text found only inside example sentences", () => {
  const query = tokenizeLibraryQuery("zeigen");
  const makeWord = (term: string) => buildLibrarySearchText({
    ...word,
    term,
    forms: "",
    meaning: "占位释义",
    example: "Zeigen Sie mir bitte den Weg.",
    exampleZh: "请给我指路。",
    grammarTitle: "",
    grammar: "",
    memory: "",
  });

  assert.equal(matchesLibrarySearch(makeWord("anzeigen"), query), true);
  assert.equal(matchesLibrarySearch(makeWord("zeigen"), query), true);
  assert.equal(matchesLibrarySearch(makeWord("der"), query), false);
  assert.equal(matchesLibrarySearch(makeWord("sie"), query), false);
  assert.equal(matchesLibrarySearch(makeWord("Grad"), query), false);
  assert.equal(matchesLibrarySearch(makeWord("Karte"), query), false);
});

test("requires every token while allowing mixed Chinese and German queries", () => {
  const searchText = buildLibrarySearchText(word);

  assert.equal(matchesLibrarySearch(searchText, tokenizeLibraryQuery("strasse 街道")), true);
  assert.equal(matchesLibrarySearch(searchText, tokenizeLibraryQuery("strasse 火车站")), false);
  assert.equal(matchesLibrarySearch(searchText, tokenizeLibraryQuery("   ")), true);
});

test("expands common polysemous words without changing unlisted entries", () => {
  assert.ok(expandedMeaningCount >= 150);
  assert.equal(expandedMeaning("das Schloss", "锁"), "锁；城堡；宫殿");
  assert.equal(expandedMeaning("der Stock", "楼层"), "楼层；棍子；手杖");
  assert.equal(expandedMeaning("gehen", "走"), "走；去；运转；可行");
  assert.equal(expandedMeaning("die Karte", "卡片"), "卡片；地图；票；菜单");
  assert.equal(expandedMeaning("einstellen", "设置"), "设置；雇用；停止；调节");
  assert.equal(expandedMeaning("sein", "是", "v"), "是；在；存在");
  assert.equal(expandedMeaning("sein", "他的", "det"), "他的；它的");
  assert.equal(expandedMeaning("sein", "他的"), "他的");
  assert.equal(expandedMeaning("in", "在……里", "prep"), "在……里面；进入；在……期间");
  assert.equal(expandedMeaning("in", "时髦的"), "时髦的");
  assert.equal(
    expandedMeaning("ihr", "你们", "pron"),
    "你们（第二人称复数主格）；她（第三人称阴性第三格）",
  );
  assert.equal(expandedMeaning("ihr", "她的", "det"), "她的；他们/她们的");
  assert.equal(expandedMeaning("ihr", "她的"), "她的");
  assert.equal(
    expandedMeaning("der", "这个", "det"),
    "阳性单数第一格定冠词；也可作阴性单数的第三/第二格或复数的第二格形式",
  );
  assert.equal(expandedMeaning("der", "这位"), "这位");
  assert.equal(expandedMeaning("das Gericht", "判决"), "法院；法庭；菜肴");
  assert.equal(
    expandedMeaning("übersetzen", "翻译"),
    "翻译（不可分）；把……运到对岸（可分）",
  );
  assert.equal(expandedMeaning("der Vorsitzende", "主席"), "主席；负责人");
  assert.equal(expandedMeaning("der Vorsitzender", "主席"), "主席");
  assert.equal(expandedMeaning("unverändert", "不变的"), "不变的");
});

test("only applies reviewed meaning expansions to the imported legacy cards", () => {
  const importedLegacyWords = [
    ...A1_WORDS,
    ...A2_WORDS,
    ...B1_ADDITIONS,
    ...B2_WORDS,
    ...C1_WORDS,
  ];
  const changed = Object.fromEntries(
    importedLegacyWords
      .map((word) => [
        word.id,
        expandedMeaning(word.term, word.meaning),
        word.meaning,
      ] as const)
      .filter(([, expanded, fallback]) => expanded !== fallback)
      .map(([id, expanded]) => [id, expanded]),
  );

  assert.deepEqual(changed, {
    "a1-fahren": "行驶；乘车；驾驶",
    "a1-lernen": "学习；学会；得知",
    "a1-sprechen": "说话；讲话；交谈；会说某种语言",
    "a2-erfahrung": "经验；经历；体验",
    "b1-richtung": "方向；路线；倾向；流派",
  });
});

test("builds safe authoritative dictionary lookups from the lexical headword", () => {
  assert.equal(dictionaryHeadword("die Straße"), "Straße");
  assert.equal(dictionaryHeadword("etwas"), "etwas");
  assert.equal(dictionaryHeadword("etwas vermeiden"), "vermeiden");
  assert.equal(dictionaryHeadword("sich an etwas gewöhnen"), "gewöhnen");
  assert.equal(dictionaryHeadword("jemanden zu etwas zwingen"), "zwingen");
  assert.equal(dictionarySearchTerm("sich an etwas gewöhnen"), "sich an etwas gewöhnen");

  const links = buildDictionaryLinks("die Straße");
  assert.deepEqual(
    links.map(({ id }) => id),
    ["duden", "dwds", "pons", "langenscheidt"],
  );
  links.forEach(({ url }) => {
    assert.doesNotThrow(() => new URL(url));
    assert.match(url, /Stra%C3%9Fe$/);
  });
  assert.match(
    links.at(-1)?.url ?? "",
    /^https:\/\/de\.langenscheidt\.com\/deutsch-chinesisch\//,
  );
  buildDictionaryLinks("sich an etwas gewöhnen").forEach(({ url }) => {
    assert.match(url, /sich%20an%20etwas%20gew%C3%B6hnen$/);
  });
});

test("parses and sanitizes open dictionary and DWDS evidence", () => {
  const openDictionary = parseWiktApiDefinitions({
    definitions: [
      {
        pos: "Verb",
        senses: [
          {
            glosses: ["sprechen", "sich mit Worten ausdrücken"],
            examples: [{ text: "Wir sprechen heute Deutsch." }],
          },
        ],
      },
    ],
  });
  assert.equal(openDictionary.found, true);
  assert.deepEqual(openDictionary.partsOfSpeech, ["Verb"]);
  assert.deepEqual(openDictionary.senses, [{
    gloss: "sich mit Worten ausdrücken",
    example: "Wir sprechen heute Deutsch.",
  }]);

  const dwds = parseDwdsSnippet([{
    lemma: "sprechen",
    wortart: "Verb",
    url: "/wb/sprechen",
  }]);
  assert.equal(dwds.found, true);
  assert.equal(dwds.sourceUrl, "https://www.dwds.de/wb/sprechen");

  const evidencePayload = {
    headword: "sprechen",
    reviewedAt: "2026-07-28T10:00:00.000Z",
    openDictionary: {
      ...openDictionary,
      sourceUrl: "https://de.wiktionary.org/wiki/sprechen",
    },
    dwds: {
      ...dwds,
      wordClass: dwds.wordClass,
      sourceUrl: dwds.sourceUrl,
    },
  };
  const evidence = parseDictionaryEvidencePayload(evidencePayload);
  assert.equal(evidence?.openDictionary.senses.length, 1);
  assert.equal(evidence?.dwds.lemma, "sprechen");

  assert.equal(parseDictionaryEvidencePayload({
    ...evidencePayload,
    dwds: { ...evidencePayload.dwds, sourceUrl: "https://example.com/phishing" },
  }), null);
});
