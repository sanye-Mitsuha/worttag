#!/usr/bin/env python3
"""Build a small German-to-English lookup index from the supplied English-German MDX export."""

from __future__ import annotations

import argparse
import html
import json
import re
from html.parser import HTMLParser
from pathlib import Path


ARTICLE_RE = re.compile(r"^(?:der|die|das)\s+", re.IGNORECASE)
KEY_RE = re.compile(r"^[A-Za-zÄÖÜäöüẞß][A-Za-zÄÖÜäöüẞß'’-]*$")
WORD_CHAR = r"A-Za-zÄÖÜäöüẞßÀ-ÖØ-öø-ÿ"
TOKEN_RE = re.compile(rf"[{WORD_CHAR}][{WORD_CHAR}'’\-]*")
CROSS_REFERENCE_RE = re.compile(r"^(?:see|vgl\.)\b", re.IGNORECASE)

# The English-German source contains many useful context hits, but a few very
# common German words also occur inside unrelated phrases or cross-references.
# These priorities only reorder candidates that were actually found in the
# supplied dictionary; they never invent a translation.
DIRECT_ENGLISH_PRIORITIES: dict[str, tuple[str, ...]] = {
    "sein": ("be",),
    "haben": ("have",),
    "zeigen": ("show", "demonstrate", "display"),
    "anzeigen": ("indicate", "announce", "show"),
    "see": ("sea", "lake"),
    "dorf": ("village",),
    "parlament": ("parliament", "European Parliament"),
}


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def lexical_term(term: str) -> str:
    value = normalize_space(term)
    value = ARTICLE_RE.sub("", value)
    if " " in value:
        words = [word for word in value.split() if word.casefold() not in {"sich", "etwas", "jemand", "jemanden", "jemandem"}]
        if words:
            value = words[-1]
    return value.strip(".,;:!?()[]{}")


class GermanTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip_navy = 0
        self.skip_key = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_map = dict(attrs)
        color = (attrs_map.get("c") or "").casefold()
        if self.skip_navy:
            self.skip_navy += 1
        elif self.skip_key:
            self.skip_key += 1
        elif tag.casefold() == "c" and color == "navy":
            self.skip_navy = 1
        elif tag.casefold() == "k":
            self.skip_key = 1
        elif tag.casefold() in {"br", "p", "div", "li"}:
            self.parts.append(" ")

    def handle_endtag(self, tag: str) -> None:
        if self.skip_navy:
            self.skip_navy -= 1
        elif self.skip_key:
            self.skip_key -= 1
        elif tag.casefold() in {"br", "p", "div", "li"}:
            self.parts.append(" ")

    def handle_data(self, data: str) -> None:
        if not self.skip_navy and not self.skip_key:
            self.parts.append(data)


def german_text(body: str) -> str:
    parser = GermanTextParser()
    parser.feed(body.replace("\\n", " ").replace("`1`", " ").replace("`4`", " "))
    return normalize_space(html.unescape("".join(parser.parts)))


def excerpt(text: str, start: int, length: int = 220) -> str:
    left = max(0, start - 80)
    right = min(len(text), start + length - 80)
    value = text[left:right].strip(" ;,.:()[]")
    if left > 0:
        value = "…" + value
    if right < len(text):
        value += "…"
    return value


def read_wordbook_terms(wordbooks_dir: Path) -> list[str]:
    terms: list[str] = []
    for path in sorted(wordbooks_dir.glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict) or not isinstance(payload.get("words"), list):
            continue
        for row in payload["words"]:
            if isinstance(row, list) and len(row) > 1 and isinstance(row[1], str):
                terms.append(row[1])
    return terms


def read_entries(source: Path) -> list[tuple[str, str]]:
    entries: list[tuple[str, str]] = []
    with source.open(encoding="utf-8") as handle:
        for line in handle:
            if line.startswith("#") or "\t" not in line:
                continue
            headword, body = line.rstrip("\n").split("\t", 1)
            headword = normalize_space(headword)
            if KEY_RE.match(headword) or " " in headword:
                entries.append((headword, german_text(body)))
    return entries


def build_token_index(entries: list[tuple[str, str]]) -> tuple[dict[str, list[tuple[str, str, int, str]]], dict[str, list[tuple[str, str, int, str]]]]:
    exact: dict[str, list[tuple[str, str, int, str]]] = {}
    suffix: dict[str, list[tuple[str, str, int, str]]] = {}
    for headword, text in entries:
        for match in TOKEN_RE.finditer(text):
            token = match.group(0)
            key = token.casefold()
            row = (headword, text, match.start(), token)
            exact.setdefault(key, []).append(row)
            if len(key) >= 4:
                suffix.setdefault(key[-4:], []).append(row)
    return exact, suffix


def candidate_rows(target: str, exact_index: dict[str, list[tuple[str, str, int, str]]], suffix_index: dict[str, list[tuple[str, str, int, str]]]) -> list[dict[str, str | int]]:
    if not target:
        return []
    candidates: list[tuple[tuple[int, int, int, int, int, str], dict[str, str | int]]] = []

    rows = exact_index.get(target.casefold(), [])
    match_kind = "exact"
    if not rows and len(target) >= 4:
        rows = [row for row in suffix_index.get(target.casefold()[-4:], []) if target.casefold() in row[3].casefold()]
        match_kind = "compound"

    priorities = {
        value.casefold(): rank
        for rank, value in enumerate(DIRECT_ENGLISH_PRIORITIES.get(target.casefold(), ()))
    }

    for headword, text, position, token in rows:
        if target.casefold() == "see" and CROSS_REFERENCE_RE.match(text.lstrip()):
            continue
        kind_rank = 0 if match_kind == "exact" else 1
        priority_rank = priorities.get(headword.casefold(), len(priorities) + 1)
        case_rank = 0 if token == target else 1
        position_rank = min(position, 2000)
        head_rank = 0 if KEY_RE.match(headword) else 1
        row = {
            "english": headword,
            "german": excerpt(text, position),
            "match": match_kind,
        }
        candidates.append(((kind_rank, priority_rank, case_rank, head_rank, position_rank, headword.casefold()), row))

    candidates.sort(key=lambda item: item[0])
    seen: set[str] = set()
    result: list[dict[str, str | int]] = []
    for _, row in candidates:
        key = str(row["english"]).casefold()
        if key in seen:
            continue
        seen.add(key)
        result.append(row)
        if len(result) >= 6:
            break
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--wordbooks", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    terms = read_wordbook_terms(args.wordbooks)
    entries = read_entries(args.source)
    exact_index, suffix_index = build_token_index(entries)
    records: dict[str, dict[str, object]] = {}
    for term in sorted(set(terms), key=lambda value: value.casefold()):
        target = lexical_term(term)
        matches = candidate_rows(target, exact_index, suffix_index)
        records[target.casefold()] = {
            "headword": target,
            "matches": matches,
        }

    payload = {
        "schemaVersion": 1,
        "title": "杜登—牛津英德大词典",
        "direction": "German → English reverse lookup",
        "source": "User-provided MDX dictionary export",
        "records": records,
        "stats": {
            "wordbookTerms": len(terms),
            "uniqueLookupTerms": len(records),
            "matchedTerms": sum(bool(item["matches"]) for item in records.values()),
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps(payload["stats"], ensure_ascii=False))


if __name__ == "__main__":
    main()
