export type LibrarySearchWord = {
  term: string;
  forms: string;
  type: string;
  meaning: string;
  example: string;
  exampleZh: string;
  grammarTitle: string;
  grammar: string;
  memory: string;
};

export function normalizeLibrarySearch(value: string) {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("de-DE")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeLibraryQuery(query: string) {
  const normalized = normalizeLibrarySearch(query);
  return normalized ? normalized.split(" ") : [];
}

export function buildLibrarySearchText(word: LibrarySearchWord) {
  return normalizeLibrarySearch([
    word.term,
    word.forms,
    word.type,
    word.meaning,
    word.example,
    word.exampleZh,
    word.grammarTitle,
    word.grammar,
    word.memory,
  ].join(" "));
}

export function matchesLibrarySearch(
  searchText: string,
  queryTokens: string[],
) {
  return queryTokens.every((token) => searchText.includes(token));
}
