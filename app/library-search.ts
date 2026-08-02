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

export type LibrarySearchText = {
  lexical: string;
  content: string;
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
  const lexical = normalizeLibrarySearch([
    word.term,
    word.forms,
  ].join(" "));
  const content = normalizeLibrarySearch([
    lexical,
    word.type,
    word.meaning,
    word.example,
    word.exampleZh,
    word.grammarTitle,
    word.grammar,
    word.memory,
  ].join(" "));
  return { lexical, content };
}

export function matchesLibrarySearch(
  searchText: LibrarySearchText,
  queryTokens: string[],
) {
  return queryTokens.every((token) => {
    // German queries should match the headword or its forms only. Searching
    // example prose caused words such as "der" and "sie" to appear merely
    // because an example sentence happened to contain them.
    const isGermanToken = /^[a-z0-9]+$/.test(token);
    return (isGermanToken ? searchText.lexical : searchText.content).includes(token);
  });
}
