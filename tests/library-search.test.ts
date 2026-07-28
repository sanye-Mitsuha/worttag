import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLibrarySearchText,
  matchesLibrarySearch,
  tokenizeLibraryQuery,
} from "../app/library-search.ts";

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
  assert.equal(matchesLibrarySearch(searchText, tokenizeLibraryQuery("ruhig")), true);
});

test("finds Chinese meanings, examples and grammar notes", () => {
  const searchText = buildLibrarySearchText(word);

  assert.equal(matchesLibrarySearch(searchText, tokenizeLibraryQuery("街道")), true);
  assert.equal(matchesLibrarySearch(searchText, tokenizeLibraryQuery("非常安静")), true);
  assert.equal(matchesLibrarySearch(searchText, tokenizeLibraryQuery("静态位置")), true);
});

test("requires every token while allowing mixed Chinese and German queries", () => {
  const searchText = buildLibrarySearchText(word);

  assert.equal(matchesLibrarySearch(searchText, tokenizeLibraryQuery("strasse 街道")), true);
  assert.equal(matchesLibrarySearch(searchText, tokenizeLibraryQuery("strasse 火车站")), false);
  assert.equal(matchesLibrarySearch(searchText, tokenizeLibraryQuery("   ")), true);
});
