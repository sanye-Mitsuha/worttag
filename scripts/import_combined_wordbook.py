#!/usr/bin/env python3
"""Import the structured CEFR sections from the combined Worttag HTML book.

The source page contains two kinds of entries:

* 10,000 structured entries grouped into A1-C1;
* 151 ungrouped special entries (numbers, dates, countries, etc.).

The five CEFR sections form the learning corpus. The special entries are
also imported as a separate library-only wordbook. The importer copies source
examples when present and deliberately leaves both example fields empty when
the source entry has no example.
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path

from bs4 import BeautifulSoup


LEVELS = ("A1", "A2", "B1", "B2", "C1")
NOUN_TYPES = {"nm", "nf", "nn"}
FIELDS = [
    "id",
    "term",
    "forms",
    "typeCode",
    "meaning",
    "example",
    "exampleZh",
    "grammarTitle",
    "grammar",
]
TYPE_CODES = {
    "nm",
    "nf",
    "nn",
    "v",
    "adj",
    "adv",
    "prep",
    "conj",
    "pron",
    "det",
    "num",
    "part",
    "intj",
    "prop",
    "phrase",
}


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def tag_text(tag) -> str:
    return clean_text(tag.get_text(" ", strip=True)) if tag else ""


def normalize_term(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).casefold()
    value = re.sub(r"\s+", " ", value).strip()
    return value


def term_keys(value: str) -> list[str]:
    normalized = normalize_term(value)
    keys = [normalized]
    article_match = re.match(r"^(der|die|das)\s+(.+)$", normalized)
    if article_match:
        keys.append(article_match.group(2))
    return keys


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, separators=(",", ":"), indent=2) + "\n",
        encoding="utf-8",
    )


def load_legacy_ids(output_root: Path) -> dict[tuple[str, str], str | None]:
    """Reuse IDs for matching old terms so existing progress can carry over."""

    index: dict[tuple[str, str], str | None] = {}
    for level in LEVELS:
        path = output_root / f"{level.lower()}-v1.json"
        if not path.exists():
            continue
        document = json.loads(path.read_text(encoding="utf-8"))
        for row in document.get("words", []):
            if len(row) < 2:
                continue
            key_terms = term_keys(str(row[1]))
            for key_term in key_terms:
                key = (level, key_term)
                previous = index.get(key)
                if previous is None and key in index:
                    continue
                if previous is not None:
                    index[key] = None
                else:
                    index[key] = str(row[0])
    return index


def pos_tokens(pos: str) -> list[str]:
    return [token.strip().lower().rstrip(".") for token in pos.split("/") if token.strip()]


def type_code(entry, raw_term: str) -> str:
    pos = tag_text(entry.select_one(".a1-pos-heading")) or tag_text(entry.select_one(".pos-badge"))
    tokens = pos_tokens(pos)
    article = tag_text(entry.select_one(".article-badge")).lower()
    if article in {"der", "die", "das"}:
        return {"der": "nm", "die": "nf", "das": "nn"}.get(article, "phrase")
    for token in tokens:
        if token in {"v", "vt", "vi", "vr", "refl", "v.i"} or token.startswith("v"):
            return "v"
        if token == "adj":
            return "adj"
        if token == "adv":
            return "adv"
        if token in {"prä", "präposition", "prep", "praep"}:
            return "prep"
        if token == "konj":
            return "conj"
        if token == "pron":
            return "pron"
        if token in {"art", "det"}:
            return "det"
        if token == "num":
            return "num"
        if token == "part":
            return "part"
        if token in {"interj", "interjektion"}:
            return "intj"
        if token in {"prop", "name", "eigenname"}:
            return "prop"
        if token in {"n", "noun", "subst"}:
            return "phrase"
    if " " in raw_term.strip():
        return "phrase"
    return "phrase"


def noun_term(raw_term: str, entry, code: str) -> str:
    if code not in NOUN_TYPES:
        return raw_term
    if re.match(r"^(der|die|das)(?:/|\s)", raw_term, flags=re.IGNORECASE):
        return raw_term
    article = tag_text(entry.select_one(".article-badge")).lower()
    return f"{article} {raw_term}" if article in {"der", "die", "das"} else raw_term


def plural_form(entry) -> str:
    note = tag_text(entry.select_one(".a1-grammar-note"))
    if not note:
        return "Plural: 未标注"
    remainder = re.sub(r"^复数\s*[:：]?\s*", "", note)
    remainder = re.sub(r"^词尾\s*[:：]?\s*", "", remainder)
    if not remainder:
        remainder = "未标注"
    return f"Plural: {remainder}"


def verb_forms(entry) -> str:
    groups: list[str] = []
    for conjugation in entry.select(".a1-conjugation"):
        parts: list[str] = []
        for row in conjugation.select("tbody tr"):
            cells = [tag_text(cell) for cell in row.select("th, td")]
            if len(cells) >= 2 and cells[0] and cells[1]:
                parts.append(f"{cells[0]} {cells[1]}")
        for row in conjugation.select("tfoot tr"):
            cells = [tag_text(cell) for cell in row.select("th, td")]
            if len(cells) >= 2 and cells[0] and cells[1]:
                parts.append(f"{cells[0]} {cells[1]}")
        origin = tag_text(conjugation.select_one("small"))
        if origin:
            parts.append(origin)
        group = " · ".join(parts)
        if group and group not in groups:
            groups.append(group)
    return " / ".join(groups) or "词形未标注"


def forms_for(entry, code: str) -> str:
    if code in NOUN_TYPES:
        return plural_form(entry)
    if code == "v":
        return verb_forms(entry)
    notes = [tag_text(note) for note in entry.select(".a1-grammar-note")]
    return " · ".join(dict.fromkeys(note for note in notes if note)) or "词形未标注"


def meaning_for(entry) -> str:
    meanings: list[str] = []
    groups = entry.select(".a1-pos-group") or [entry]
    for group_index, group in enumerate(groups):
        group_meanings: list[str] = []
        for gloss in group.select(".a1-gloss"):
            for level in gloss.select(".sense-level"):
                level.extract()
            value = tag_text(gloss)
            if value:
                group_meanings.append(value)
        if group_index and group_meanings:
            pos = tag_text(group.select_one(".a1-pos-heading")) or "其他词性"
            group_meanings[0] = f"【{pos}】{group_meanings[0]}"
        meanings.extend(group_meanings)
    if not meanings:
        meanings = [tag_text(exp) for exp in entry.select(".exp") if tag_text(exp)]
    if meanings:
        return "；".join(dict.fromkeys(meanings))
    return "释义未标注"


def examples_for(entry) -> tuple[str, str]:
    example = entry.select_one(".a1-example")
    if not example:
        return "", ""
    german = tag_text(example.select_one("i"))
    if not german:
        return "", ""
    chinese = tag_text(example.select_one(".a1-example-zh"))
    return german, chinese


def grammar_for(entry, code: str) -> tuple[str, str]:
    headings = [tag_text(heading) for heading in entry.select(".a1-pos-heading")]
    pos = " / ".join(dict.fromkeys(value for value in headings if value))
    pos = pos or tag_text(entry.select_one(".pos-badge")) or "词典词条"
    notes = [tag_text(note) for note in entry.select(".a1-grammar-note")]
    phrases: list[str] = []
    for phrase in entry.select(".a1-phrase"):
        value = tag_text(phrase)
        value = re.sub(r"^搭配\s*[:：]?\s*", "", value)
        if value:
            phrases.append(f"搭配：{value}")
    details = list(dict.fromkeys(value for value in notes + phrases if value))
    return pos, "；".join(details)


def import_level(section, level: str, legacy_ids: dict[tuple[str, str], str | None]) -> tuple[dict, Counter]:
    rows = []
    used_ids: set[str] = set()
    stats: Counter = Counter()
    for index, entry in enumerate(section.select("details.entry"), start=1):
        raw_term = clean_text(entry.get("data-term", ""))
        if level == "SPECIAL":
            raw_term = tag_text(entry.select_one("summary .term")) or raw_term
        if not raw_term or (level != "SPECIAL" and raw_term.lower() == "null"):
            raise ValueError(f"{level} entry {index} has no usable term")
        code = type_code(entry, raw_term)
        if code not in TYPE_CODES:
            raise ValueError(f"Unsupported type {code!r} for {level} {raw_term}")
        term = noun_term(raw_term, entry, code)
        legacy_id = None
        for key_term in term_keys(term):
            candidate = legacy_ids.get((level, key_term))
            if candidate and candidate not in used_ids:
                legacy_id = candidate
                break
        prefix = "special" if level == "SPECIAL" else f"cefr10k-{level.lower()}"
        word_id = legacy_id or f"{prefix}-{index:05d}"
        if word_id in used_ids:
            raise ValueError(f"duplicate ID {word_id}")
        used_ids.add(word_id)
        example, example_zh = examples_for(entry)
        grammar_title, grammar = grammar_for(entry, code)
        rows.append([
            word_id,
            term,
            forms_for(entry, code),
            code,
            meaning_for(entry),
            example,
            example_zh,
            grammar_title,
            grammar,
        ])
        stats["entries"] += 1
        stats["examples"] += bool(example)
        stats["exampleZh"] += bool(example_zh)
        stats[f"type:{code}"] += 1
        stats["legacyIds"] += bool(legacy_id)
    return {
        "schemaVersion": 2,
        "level": level,
        "count": len(rows),
        "fields": FIELDS,
        "words": rows,
    }, stats


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="combined-15000-cefr-groups.html")
    parser.add_argument("--output-root", type=Path, default=Path("public/wordbooks"))
    args = parser.parse_args()

    soup = BeautifulSoup(args.source.read_text(encoding="utf-8"), "lxml")
    legacy_ids = load_legacy_ids(args.output_root)
    documents = {}
    level_stats = {}
    for level in LEVELS:
        section = soup.select_one(f'section.level-section[data-level="{level}"]')
        if section is None:
            raise ValueError(f"Missing CEFR section {level}")
        document, stats = import_level(section, level, legacy_ids)
        documents[level] = document
        level_stats[level] = stats
        write_json(args.output_root / f"{level.lower()}-v2.json", document)

    special_section = soup.select_one('section.level-section[data-level="专项"]')
    if special_section is None:
        raise ValueError("Missing 专项 section")
    special_document, special_stats = import_level(special_section, "SPECIAL", legacy_ids)
    write_json(args.output_root / "special-v2.json", special_document)
    special_count = special_document["count"]
    counts = {level: documents[level]["count"] for level in LEVELS}
    cumulative = {}
    running = 0
    for level in LEVELS:
        running += counts[level]
        cumulative[level] = running
    total = sum(counts.values())
    manifest = {
        "schemaVersion": 2,
        "corpus": "combined-cefr-10000",
        "source": args.source.name,
        "importNote": "按来源 HTML 的 A1-C1 主分组导入学习词库；专项内容另存为独立词书，仅在词库中浏览，不进入主学习与复习队列。缺少例句的词条保持空白，不补写例句。",
        "wordCounts": counts,
        "cumulativeCourseCounts": cumulative,
        "total": total,
        "specialIncluded": special_count,
        "specialLearningExcluded": special_count,
        "specialWordbook": "special-v2.json",
        "specialExampleCount": special_stats["examples"],
        "specialExampleTranslationCount": special_stats["exampleZh"],
        "exampleCounts": {level: level_stats[level]["examples"] for level in LEVELS},
        "exampleTranslationCounts": {level: level_stats[level]["exampleZh"] for level in LEVELS},
        "legacyIdsReused": sum(level_stats[level]["legacyIds"] for level in LEVELS),
    }
    write_json(args.output_root / "manifest-v2.json", manifest)

    print(json.dumps({
        "counts": counts,
        "total": total,
        "specialIncluded": special_count,
        "exampleCounts": manifest["exampleCounts"],
        "exampleTranslationCounts": manifest["exampleTranslationCounts"],
        "legacyIdsReused": manifest["legacyIdsReused"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
