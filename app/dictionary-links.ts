export type DictionaryLink = {
  id: "duden" | "dwds" | "pons" | "langenscheidt";
  name: string;
  kind: string;
  description: string;
  url: string;
};

export function dictionarySearchTerm(term: string) {
  const normalized = term.trim().replace(/\s+/g, " ");
  return normalized.replace(/^(der|die|das)\s+/i, "") || normalized;
}

export function dictionaryHeadword(term: string) {
  const normalized = term.trim().replace(/\s+/g, " ");
  const withoutArticle = dictionarySearchTerm(normalized);
  const withoutPlaceholder = withoutArticle.replace(/^etwas\s+/i, "");

  if (/^(?:sich|jemand(?:en|em|es)?)\s+/i.test(withoutPlaceholder)) {
    const words = withoutPlaceholder.split(" ");
    return words.at(-1) ?? withoutPlaceholder;
  }

  return withoutPlaceholder || withoutArticle || normalized;
}

export function buildDictionaryLinks(term: string): DictionaryLink[] {
  const query = encodeURIComponent(dictionarySearchTerm(term));

  return [
    {
      id: "duden",
      name: "Duden",
      kind: "德语规范",
      description: "核对词性、拼写、变格与德语释义",
      url: `https://www.duden.de/suchen/dudenonline/${query}`,
    },
    {
      id: "dwds",
      name: "DWDS",
      kind: "学术语料",
      description: "查看词义、词源、搭配与真实语料",
      url: `https://www.dwds.de/wb/${query}`,
    },
    {
      id: "pons",
      name: "PONS",
      kind: "中德双语",
      description: "查看德汉对译、例句与常用搭配",
      url: `https://de.pons.com/%C3%BCbersetzung/deutsch-chinesisch/${query}`,
    },
    {
      id: "langenscheidt",
      name: "Langenscheidt",
      kind: "中德双语",
      description: "补充核对常用义项与语境",
      url: `https://de.langenscheidt.com/deutsch-chinesisch/${query}`,
    },
  ];
}
