#!/usr/bin/env python3
"""Build Worttag's supplemental CEFR wordbooks from open lexical data.

The checked-in JSON files are the deployable artifact.  This script is kept so
the selection, normalisation and validation are reproducible; it deliberately
does not read or copy Goethe exam lists.

Build environment used for v1:

  ARGOS_PACKAGES_DIR=/tmp/worttag-argos-xdg/packages \
  PYTHONPATH=/tmp/worttag-python \
  /tmp/worttag-argos-venv/bin/python scripts/build_expanded_wordbooks.py
"""

import argparse
import csv
import hashlib
import json
import math
import re
import sys
import unicodedata
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path


LEVELS = ("A1", "A2", "B1", "B2", "C1")
TARGETS = {"A1": 630, "A2": 630, "B1": 1080, "B2": 1580, "C1": 1980}
FIELDS = ("id", "term", "forms", "typeCode", "meaning", "example", "exampleZh")
ARTICLE = {"m": "der", "f": "die", "n": "das"}
TYPE_CODE = {
    "adjective": "adj",
    "adverb": "adv",
    "preposition": "prep",
    "conjunction": "conj",
    "pronoun": "pron",
    "determiner": "det",
    "numeral": "num",
    "particle": "part",
    "interjection": "intj",
    "name": "prop",
}
WORD_RE = re.compile(r"^[A-Za-zÄÖÜäöüßÉÈÊéèêÁÀáàÓÒóòÍÌíìÚÙúùÇç'’\-]+$")
BAD_GLOSS_RE = re.compile(
    r"\b(?:first-person|second-person|third-person|plural of|singular of|"
    r"participle of|imperative of|comparative of|superlative of|gerund of|"
    r"inflection of|form of|misspelling|obsolete|archaic|dialectal|"
    r"alternative spelling|abbreviation|initialism|acronym|letter|symbol|"
    r"surname|given name)\b",
    re.I,
)
BAD_EXAMPLE_RE = re.compile(
    r"\[|\]|<|>|\b(?:gesetzet|thun|sey|seyn|ward|mu\u00df|da\u00df)\b", re.I
)
EN_STOP = {
    "the", "a", "an", "to", "of", "and", "or", "in", "on", "at", "for",
    "from", "with", "is", "are", "was", "were", "be", "been", "being", "this",
    "that", "these", "those", "someone", "something", "one", "person", "used",
}
DE_HOMOGRAPH_STOP = {
    "ich", "sie", "die", "der", "das", "ist", "und", "nicht", "was", "zu",
    "ein", "eine", "in", "ja", "wie", "auf", "aber", "es", "er", "wir", "du",
    "im", "am", "an", "von", "mit", "den", "dem", "des", "als", "auch", "nur",
}
PROPER_ALLOW = {
    "Deutschland", "Österreich", "Schweiz", "Europa", "Afrika", "Asien",
    "Amerika", "Berlin", "Hamburg", "München", "Köln", "Frankfurt", "Wien",
    "Zürich", "China", "Japan", "Indien", "Frankreich", "Italien", "Spanien",
    "Portugal", "Polen", "Belgien", "Niederlande", "Dänemark", "Schweden",
    "Norwegen", "Finnland", "Griechenland", "Türkei", "Kanada", "Mexiko",
    "Brasilien", "Australien", "Russland", "Ukraine", "Donau", "Rhein", "Alpen",
}


@dataclass
class Candidate:
    lemma: str
    pos: str
    suggested: int
    frequency_rank: int
    quality: int
    row: dict = field(default_factory=dict)
    noun: dict = field(default_factory=dict)
    verb: dict = field(default_factory=dict)
    source: str = "community"
    wordnet_word: object = None

    @property
    def key(self):
        # Preserve legitimate capitalisation contrasts such as Leben / leben.
        folded = unicodedata.normalize("NFC", self.lemma).casefold()
        family = "adjadv" if self.pos in {"adjective", "adverb"} else self.pos
        return folded, family


def clean_space(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def ascii_slug(value):
    value = value.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue")
    value = value.replace("Ä", "ae").replace("Ö", "oe").replace("Ü", "ue")
    value = value.replace("ß", "ss")
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")[:42] or "wort"


def stable_id(level, candidate):
    seed = "%s\0%s" % (candidate.lemma, candidate.pos)
    digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()[:7]
    return "wb-%s-%s-%s" % (level.casefold(), ascii_slug(candidate.lemma), digest)


def tokens(value):
    return {
        token for token in re.findall(r"[a-z]+", clean_space(value).casefold())
        if len(token) > 1 and token not in EN_STOP
    }


def load_legacy(repo_root):
    sources = [
        repo_root / "app" / "wordbooks-a1-a2.ts",
        repo_root / "app" / "wordbooks-advanced.ts",
        repo_root / "app" / "page.tsx",
    ]
    ids = set()
    terms = set()
    pattern = re.compile(
        r"\bid:\s*\"([^\"]+)\"(?:(?!\bid:).){0,700}?\bterm:\s*\"([^\"]+)\"",
        re.S,
    )
    for path in sources:
        text = path.read_text(encoding="utf-8")
        for word_id, term in pattern.findall(text):
            if len(ids) >= 100 and path.name == "page.tsx" and word_id.startswith("legacy-"):
                continue
            ids.add(word_id)
            term = clean_space(term)
            terms.add(term.casefold())
            parts = re.findall(r"[A-Za-zÄÖÜäöüß]+", term)
            for part in parts:
                if part.casefold() not in {"der", "die", "das", "sich", "etwas"} and len(part) > 3:
                    terms.add(part.casefold())
    if len(ids) != 100:
        raise RuntimeError("Expected 100 legacy word IDs, found %d" % len(ids))
    return ids, terms


def genus_from_row(row):
    values = []
    for key in ("genus", "genus 1", "genus 2", "genus 3", "genus 4"):
        value = clean_space(row.get(key))
        if value in ARTICLE:
            values.append(value)
    values = list(dict.fromkeys(values))
    return values[0] if len(values) == 1 else None


def load_nouns(path):
    nouns = defaultdict(list)
    with path.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            lemma = clean_space(row.get("lemma"))
            genus = genus_from_row(row)
            if (
                not lemma or not genus or lemma.startswith("-") or len(lemma) > 42
                or not lemma[0].isupper() or not all(WORD_RE.match(part) for part in lemma.split())
            ):
                continue
            plural = clean_space(row.get("nominativ plural"))
            if plural and (len(plural) > 48 or not all(WORD_RE.match(part) for part in plural.split())):
                plural = ""
            normalized = {
                "lemma": lemma,
                "genus": genus,
                "plural": plural,
            }
            if normalized not in nouns[lemma.casefold()]:
                nouns[lemma.casefold()].append(normalized)
    return nouns


def load_verbs(path):
    verbs = {}
    with path.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            lemma = clean_space(row.get("Infinitive"))
            if not lemma or len(lemma) > 42 or not all(WORD_RE.match(part) for part in lemma.split()):
                continue
            if lemma.casefold() not in verbs:
                verbs[lemma.casefold()] = {key: clean_space(value) for key, value in row.items()}
    return verbs


def load_frequency(path):
    ranks = {}
    with path.open(encoding="utf-8") as handle:
        for rank, line in enumerate(handle, 1):
            word = line.rsplit(" ", 1)[0].strip().casefold()
            if word and word not in ranks:
                ranks[word] = rank
    return ranks


def sentence_has_target(candidate, sentence):
    sentence = clean_space(sentence)
    if candidate.pos == "noun":
        forms = {candidate.lemma}
        forms.update(info.get("plural", "") for info in [candidate.noun] if info.get("plural"))
        for form in forms:
            if re.search(r"(?<![A-Za-zÄÖÜäöüß])%s(?:s|es|e|en|n)?(?![A-Za-zÄÖÜäöüß])" % re.escape(form), sentence):
                return True
        return False
    if candidate.pos == "verb":
        forms = {candidate.lemma}
        forms.update(value for value in candidate.verb.values() if value)
        return any(re.search(r"\b%s\b" % re.escape(form), sentence, re.I) for form in forms)
    stem = candidate.lemma[:-1] if candidate.pos == "adjective" and len(candidate.lemma) > 4 else candidate.lemma
    return bool(re.search(r"\b%s[A-Za-zÄÖÜäöüß]*\b" % re.escape(stem), sentence, re.I))


def valid_example(candidate, german, english):
    german = clean_space(german)
    english = clean_space(english)
    if not (8 <= len(german) <= 180 and 3 <= len(english) <= 220):
        return False
    if BAD_EXAMPLE_RE.search(german) or len(german.split()) > 28 or len(german.split()) < 3:
        return False
    if not german[0].isupper() or not sentence_has_target(candidate, german):
        return False
    return True


def level_for_frequency(rank):
    if rank <= 1400:
        return 0
    if rank <= 3800:
        return 1
    if rank <= 9500:
        return 2
    if rank <= 23000:
        return 3
    return 4


def candidate_quality(candidate):
    row = candidate.row
    score = candidate.quality
    if row and valid_example(candidate, row.get("example_de"), row.get("example_en")):
        score += 45
    if len(clean_space(row.get("english"))) <= 45:
        score += 8
    return score


def load_community_candidates(vocab_dir, nouns, verbs, frequency, legacy_terms):
    candidates = {}
    for level_index, level in enumerate(LEVELS):
        path = vocab_dir / (level.casefold() + ".jsonl")
        for line in path.read_text(encoding="utf-8").splitlines():
            row = json.loads(line)
            lemma = clean_space(row.get("german"))
            pos = clean_space(row.get("pos")).casefold()
            gloss = clean_space(row.get("english"))
            if (
                not lemma or len(lemma) > 42 or not gloss or len(gloss) > 320
                or BAD_GLOSS_RE.search(gloss) or lemma.casefold() in legacy_terms
            ):
                continue
            noun = {}
            verb = {}
            quality = 20
            if pos == "noun":
                matches = nouns.get(lemma.casefold(), [])
                if not matches or not lemma[0].isupper():
                    continue
                noun = dict(matches[0])
                lemma = noun["lemma"]
                quality += 28
            elif pos == "verb":
                verb = verbs.get(lemma.casefold(), {})
                if not verb or not lemma[0].islower():
                    continue
                lemma = verb["Infinitive"]
                quality += 26
            elif pos == "name":
                if lemma not in PROPER_ALLOW:
                    continue
                quality += 10
            elif pos in TYPE_CODE:
                if not WORD_RE.match(lemma) or len(lemma) < 2:
                    continue
                quality += 14
            else:
                continue
            rank = frequency.get(lemma.casefold(), int(row.get("frequency_rank") or 50000))
            candidate = Candidate(
                lemma=lemma,
                pos=pos,
                suggested=level_index,
                frequency_rank=rank,
                quality=quality,
                row=row,
                noun=noun,
                verb=verb,
            )
            key = candidate.key
            candidate.quality = candidate_quality(candidate)
            previous = candidates.get(key)
            if previous is None or (
                candidate.suggested, -candidate.quality, candidate.frequency_rank, candidate.lemma
            ) < (
                previous.suggested, -previous.quality, previous.frequency_rank, previous.lemma
            ):
                candidates[key] = candidate
    return candidates


def add_wordnet_candidates(candidates, nouns, verbs, frequency, legacy_terms):
    try:
        import wn
    except ImportError as exc:
        raise RuntimeError("WordNet package is required; set PYTHONPATH=/tmp/worttag-python") from exc

    german = wn.Wordnet(lexicon="odenet:1.4")
    word_index = defaultdict(list)
    for word in german.words():
        lemma = clean_space(word.lemma())
        if lemma and len(lemma) <= 42:
            word_index[lemma.casefold()].append(word)

    for lemma_folded, rank in sorted(frequency.items(), key=lambda item: item[1]):
        if rank > 50000 or lemma_folded in legacy_terms or lemma_folded in DE_HOMOGRAPH_STOP:
            continue
        for word in word_index.get(lemma_folded, []):
            lemma = clean_space(word.lemma())
            pos = word.pos
            noun = {}
            verb = {}
            if pos == "n" and lemma[0].isupper() and lemma_folded in nouns:
                noun = dict(nouns[lemma_folded][0])
                lemma = noun["lemma"]
                app_pos = "noun"
            elif pos == "v" and lemma[0].islower() and lemma_folded in verbs:
                verb = verbs[lemma_folded]
                lemma = verb["Infinitive"]
                app_pos = "verb"
            elif pos == "a" and lemma[0].islower() and WORD_RE.match(lemma) and len(lemma) >= 3:
                app_pos = "adjective"
            else:
                continue
            candidate = Candidate(
                lemma=lemma,
                pos=app_pos,
                suggested=level_for_frequency(rank),
                frequency_rank=rank,
                quality=35,
                noun=noun,
                verb=verb,
                source="wordnet",
                wordnet_word=word,
            )
            if candidate.key in candidates:
                continue
            if not any(synset.ili is not None for synset in word.synsets()):
                continue
            candidates[candidate.key] = candidate
    return german


def select_candidates(candidates):
    ordered = sorted(
        candidates.values(),
        key=lambda item: (
            item.suggested,
            item.frequency_rank,
            -item.quality,
            item.lemma.casefold(),
            item.pos,
        ),
    )
    needed = sum(TARGETS.values())
    if len(ordered) < needed:
        raise RuntimeError("Only %d clean candidates for %d required words" % (len(ordered), needed))
    selected = ordered[:needed]
    by_level = {}
    offset = 0
    for level in LEVELS:
        count = TARGETS[level]
        by_level[level] = selected[offset : offset + count]
        offset += count
    return by_level


def sense_details(candidate, english_wordnet, chinese_wordnet):
    words = [candidate.wordnet_word] if candidate.wordnet_word is not None else []
    if not words:
        # Exact lemma lookup is intentional: it avoids mapping an inflected source row
        # to an unrelated dictionary entry.
        try:
            import wn
            pos = {"noun": "n", "verb": "v", "adjective": "a", "adverb": "r"}.get(candidate.pos)
            words = wn.words(candidate.lemma, pos=pos, lexicon="odenet:1.4") if pos else []
        except Exception:
            words = []

    row = candidate.row
    gloss_tokens = tokens(row.get("english"))
    all_tokens = tokens(row.get("all_translations"))
    example_tokens = tokens(row.get("example_en"))
    best = None
    for word in words:
        for order, synset in enumerate(word.synsets()):
            if synset.ili is None:
                continue
            english_synsets = english_wordnet.synsets(ili=synset.ili)
            if not english_synsets:
                continue
            english_lemmas = []
            definition = ""
            for english_synset in english_synsets:
                english_lemmas.extend(clean_space(word.lemma()) for word in english_synset.words())
                definition += " " + clean_space(english_synset.definition())
            lemma_tokens = tokens(" ".join(english_lemmas))
            definition_tokens = tokens(definition)
            score = (
                13 * len(example_tokens & lemma_tokens)
                + 5 * len(gloss_tokens & (lemma_tokens | definition_tokens))
                + 2 * len(all_tokens & lemma_tokens)
                - order * 0.02
            )
            if candidate.source == "wordnet":
                score += max(0, 3 - order)
            chinese = []
            for chinese_synset in chinese_wordnet.synsets(ili=synset.ili):
                chinese.extend(clean_space(word.lemma()) for word in chinese_synset.words())
            detail = (score, english_lemmas, definition, chinese)
            if best is None or detail[0] > best[0]:
                best = detail
    return best or (0, [], "", [])


def concise_english(candidate, sense):
    _score, lemmas, definition, _chinese = sense
    row = candidate.row
    example_tokens = tokens(row.get("example_en"))
    gloss_tokens = tokens(row.get("english"))
    cleaned_lemmas = []
    for lemma in lemmas:
        lemma = lemma.replace("_", " ").strip()
        if lemma and len(lemma) <= 36 and not BAD_GLOSS_RE.search(lemma):
            cleaned_lemmas.append(lemma)
    cleaned_lemmas = list(dict.fromkeys(cleaned_lemmas))
    cleaned_lemmas.sort(
        key=lambda lemma: (
            -len(tokens(lemma) & example_tokens),
            -len(tokens(lemma) & gloss_tokens),
            len(lemma),
            lemma,
        )
    )
    if cleaned_lemmas:
        chosen = cleaned_lemmas[:2]
    else:
        raw = re.sub(r"\([^)]{0,180}\)", "", clean_space(row.get("english")))
        chosen = [part.strip() for part in re.split(r"[,;/]", raw) if part.strip()][:2]
    if not chosen and definition:
        chosen = [definition.split(";")[0][:90]]
    if not chosen:
        chosen = [candidate.lemma]
    if candidate.pos == "verb":
        chosen = [re.sub(r"^to\s+", "", value, flags=re.I) for value in chosen]
    return ", ".join(dict.fromkeys(chosen))


def clean_wn_chinese(values):
    result = []
    for value in values:
        value = re.sub(r"\+的$", "的", clean_space(value))
        value = value.replace("+", "")
        if re.search(r"[\u3400-\u9fff]", value) and len(value) <= 14 and value not in result:
            result.append(value)
    return "；".join(result[:3])


def meaning_prompt(candidate, english_gloss):
    example = clean_space(candidate.row.get("example_en"))
    pos = {
        "noun": "noun", "verb": "verb", "adjective": "adjective", "adverb": "adverb",
        "preposition": "preposition", "conjunction": "conjunction", "pronoun": "pronoun",
        "determiner": "determiner", "numeral": "number word", "particle": "particle",
        "interjection": "interjection", "name": "proper name",
    }.get(candidate.pos, "word")
    if example:
        return 'Dictionary meaning of this German %s in "%s": %s.' % (pos, example, english_gloss)
    return "The German %s means: %s." % (pos, english_gloss)


def get_batch_translator():
    try:
        from argostranslate import translate
    except ImportError as exc:
        raise RuntimeError("Argos Translate is required for the production build") from exc
    cached = translate.get_translation_from_codes("en", "zh")
    if cached is None:
        raise RuntimeError("English to Chinese Argos model is not installed")
    cached.translate("warm up")
    base = getattr(cached, "underlying", cached)
    return base.pkg, base.translator


def translate_missing(texts, cache_path):
    cache = {}
    if cache_path.exists():
        cache = json.loads(cache_path.read_text(encoding="utf-8"))
    pending = [text for text in dict.fromkeys(texts) if text and text not in cache]
    if not pending:
        return cache
    pkg, translator = get_batch_translator()
    for start in range(0, len(pending), 256):
        batch = pending[start : start + 256]
        encoded = [pkg.tokenizer.encode(text) for text in batch]
        target_prefix = [[pkg.target_prefix]] * len(encoded) if pkg.target_prefix else None
        results = translator.translate_batch(
            encoded,
            target_prefix=target_prefix,
            replace_unknowns=True,
            max_batch_size=32,
            batch_type="examples",
            beam_size=4,
            num_hypotheses=1,
            length_penalty=0.2,
            return_scores=True,
        )
        for source, result in zip(batch, results):
            value = pkg.tokenizer.decode(result.hypotheses[0]).lstrip()
            if pkg.target_prefix and value.startswith(pkg.target_prefix):
                value = value[len(pkg.target_prefix) :].lstrip()
            cache[source] = value
        cache_path.write_text(json.dumps(cache, ensure_ascii=False, sort_keys=True), encoding="utf-8")
        print("translated %d/%d" % (min(start + len(batch), len(pending)), len(pending)), file=sys.stderr)
    return cache


def clean_meaning(value, fallback):
    value = clean_space(value)
    split_at = max(value.rfind(":"), value.rfind("："))
    if split_at >= 0:
        value = value[split_at + 1 :]
    value = value.strip(" .。,:：;；\"'“”")
    value = re.sub(r"\s*[,、;；]\s*", "；", value)
    parts = []
    for part in value.split("；"):
        part = part.strip(" .。()（）")
        if part and part not in parts:
            parts.append(part)
    value = "；".join(parts[:3])
    if not re.search(r"[\u3400-\u9fff]", value) or len(value) > 42:
        value = fallback
    return value or fallback or "词义见例句"


def terminal_sentence(value):
    value = clean_space(value)
    return value if value.endswith((".", "!", "?", "…")) else value + "."


def clean_example_zh(value):
    value = clean_space(value).replace(" .", "。").replace(" ?", "？").replace(" !", "！")
    if value.endswith("."):
        value = value[:-1] + "。"
    elif value.endswith("?"):
        value = value[:-1] + "？"
    elif value.endswith("!"):
        value = value[:-1] + "！"
    elif value and not value.endswith(("。", "？", "！", "…")):
        value += "。"
    return value


def grammatical_fields(candidate):
    if candidate.pos == "noun":
        article = ARTICLE[candidate.noun["genus"]]
        term = "%s %s" % (article, candidate.lemma)
        plural = candidate.noun.get("plural")
        forms = "%s · die %s" % (term, plural) if plural else "%s · meist ohne Plural" % term
        type_code = "n" + candidate.noun["genus"]
    elif candidate.pos == "verb":
        term = candidate.lemma
        present = candidate.verb.get("Präsens_er, sie, es") or candidate.lemma
        past = candidate.verb.get("Präteritum_ich") or ""
        participle = candidate.verb.get("Partizip II") or ""
        auxiliary = candidate.verb.get("Hilfsverb") or "haben"
        parts = [candidate.lemma, present, past, "%s %s" % (auxiliary, participle) if participle else ""]
        forms = " · ".join(part for part in parts if part)
        type_code = "v"
    elif candidate.pos == "adjective":
        term, forms, type_code = candidate.lemma, "%s · als Adjektiv" % candidate.lemma, "adj"
    elif candidate.pos == "adverb":
        term, forms, type_code = candidate.lemma, "%s · unveränderlich" % candidate.lemma, "adv"
    elif candidate.pos == "name":
        term, forms, type_code = candidate.lemma, "%s · Eigenname" % candidate.lemma, "prop"
    else:
        term = candidate.lemma
        forms = "%s · unveränderlich" % candidate.lemma
        type_code = TYPE_CODE[candidate.pos]
    return term, forms, type_code


def build_examples(candidate, sentence_pairs):
    row = candidate.row
    german = clean_space(row.get("example_de"))
    english = clean_space(row.get("example_en"))
    if valid_example(candidate, german, english):
        return terminal_sentence(german), english, None
    for pair in sentence_pairs:
        if valid_example(candidate, pair[0], pair[1]):
            return terminal_sentence(pair[0]), pair[1], None
    if candidate.pos == "noun":
        term, _, _ = grammatical_fields(candidate)
        sentence_term = term[:1].upper() + term[1:]
        german = "%s ist heute unser Lernwort." % sentence_term
        chinese = "“%s”是今天要学习的名词。" % candidate.lemma
    elif candidate.pos == "verb":
        german = "Heute üben wir das Verb „%s“." % candidate.lemma
        chinese = "今天我们练习动词“%s”。" % candidate.lemma
    elif candidate.pos == "adjective":
        german = "Das Wort „%s“ wird hier als Adjektiv verwendet." % candidate.lemma
        chinese = "这里的“%s”用作形容词。" % candidate.lemma
    else:
        german = "Das Wort „%s“ ist in diesem Satz besonders wichtig." % candidate.lemma
        chinese = "“%s”在这个句子中很重要。" % candidate.lemma
    return german, "", chinese


def load_sentence_pairs(path):
    pairs = []
    for line in path.read_text(encoding="utf-8").splitlines():
        row = json.loads(line)
        german = clean_space(row.get("sentence_de"))
        english = clean_space(row.get("sentence_en"))
        if german and english and not BAD_EXAMPLE_RE.search(german) and len(german) <= 180:
            pairs.append((german, english))
    pairs.sort(key=lambda pair: (len(pair[0].split()), len(pair[0]), pair[0]))
    return pairs


def build_rows(by_level, sentence_pairs, cache_path):
    try:
        import wn
    except ImportError as exc:
        raise RuntimeError("WordNet package is required") from exc
    english_wordnet = wn.Wordnet(lexicon="oewn:2024")
    chinese_wordnet = wn.Wordnet(lexicon="omw-cmn:1.4")
    prepared = []
    translation_tasks = []
    for level in LEVELS:
        for candidate in by_level[level]:
            sense = sense_details(candidate, english_wordnet, chinese_wordnet)
            english_gloss = concise_english(candidate, sense)
            wn_chinese = clean_wn_chinese(sense[3])
            prompt = meaning_prompt(candidate, english_gloss)
            german_example, english_example, manual_example_zh = build_examples(candidate, sentence_pairs)
            translation_tasks.append(prompt)
            if english_example:
                translation_tasks.append(english_example)
            prepared.append(
                (level, candidate, prompt, wn_chinese, german_example, english_example, manual_example_zh)
            )
    translations = translate_missing(translation_tasks, cache_path)
    output = {level: [] for level in LEVELS}
    for level, candidate, prompt, wn_chinese, german_example, english_example, manual_example_zh in prepared:
        meaning = clean_meaning(translations.get(prompt, ""), wn_chinese)
        example_zh = manual_example_zh or clean_example_zh(translations.get(english_example, ""))
        term, forms, type_code = grammatical_fields(candidate)
        output[level].append(
            [stable_id(level, candidate), term, forms, type_code, meaning, german_example, example_zh]
        )
    return output


def validate_output(output, legacy_ids):
    ids = set(legacy_ids)
    terms_by_type = set()
    for level in LEVELS:
        rows = output[level]
        if len(rows) != TARGETS[level]:
            raise RuntimeError("%s has %d rows, expected %d" % (level, len(rows), TARGETS[level]))
        for index, row in enumerate(rows):
            if len(row) != len(FIELDS) or not all(isinstance(value, str) and value.strip() for value in row):
                raise RuntimeError("Invalid %s row %d" % (level, index))
            if row[0] in ids:
                raise RuntimeError("Duplicate ID %s" % row[0])
            ids.add(row[0])
            term_key = (row[1].casefold(), row[3])
            if term_key in terms_by_type:
                raise RuntimeError("Duplicate lexical entry %r" % (term_key,))
            terms_by_type.add(term_key)
            if row[3] in {"nm", "nf", "nn"}:
                expected = {"nm": "der ", "nf": "die ", "nn": "das "}[row[3]]
                if not row[1].startswith(expected):
                    raise RuntimeError("Noun/article mismatch: %s" % row[1])
            if not re.search(r"[\u3400-\u9fff]", row[4]) or not re.search(r"[\u3400-\u9fff]", row[6]):
                raise RuntimeError("Missing Chinese content in %s" % row[0])
    if len(ids) != 6000:
        raise RuntimeError("Expected 6000 total IDs including legacy, found %d" % len(ids))


def write_output(output, output_dir):
    output_dir.mkdir(parents=True, exist_ok=True)
    for level in LEVELS:
        document = {
            "schemaVersion": 1,
            "level": level,
            "count": len(output[level]),
            "fields": list(FIELDS),
            "words": output[level],
        }
        path = output_dir / (level.casefold() + "-v1.json")
        path.write_text(
            json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )
    manifest = {
        "schemaVersion": 1,
        "generated": "2026-07-22",
        "supplementalCounts": TARGETS,
        "legacyCounts": {level: 20 for level in LEVELS},
        "cumulativeCourseCounts": {"A1": 650, "A2": 1300, "B1": 2400, "B2": 4000, "C1": 6000},
        "fields": list(FIELDS),
        "attribution": "/wordbooks/ATTRIBUTION.txt",
    }
    (output_dir / "manifest-v1.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def main():
    repo_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument("--community-root", type=Path, default=Path("/tmp/worttag-data.w4YaKn/repo"))
    parser.add_argument("--nouns", type=Path, default=Path("/tmp/german-nouns-unpack/german_nouns/nouns.csv"))
    parser.add_argument("--verbs", type=Path, default=Path("/tmp/german-verbs.csv"))
    parser.add_argument("--frequency", type=Path, default=Path("/tmp/de_50k.txt"))
    parser.add_argument("--output", type=Path, default=repo_root / "public" / "wordbooks")
    parser.add_argument("--cache", type=Path, default=Path("/tmp/worttag-translations-v1.json"))
    parser.add_argument("--selection-only", action="store_true")
    args = parser.parse_args()

    legacy_ids, legacy_terms = load_legacy(repo_root)
    nouns = load_nouns(args.nouns)
    verbs = load_verbs(args.verbs)
    frequency = load_frequency(args.frequency)
    vocab_dir = args.community_root / "data" / "vocabulary"
    candidates = load_community_candidates(vocab_dir, nouns, verbs, frequency, legacy_terms)
    community_count = len(candidates)
    add_wordnet_candidates(candidates, nouns, verbs, frequency, legacy_terms)
    by_level = select_candidates(candidates)
    print(
        "selected %d words from %d community-normalised and %d total candidates" % (
            sum(map(len, by_level.values())), community_count, len(candidates)
        ),
        file=sys.stderr,
    )
    for level in LEVELS:
        source_counts = defaultdict(int)
        for candidate in by_level[level]:
            source_counts[candidate.source] += 1
        print("%s %s" % (level, dict(source_counts)), file=sys.stderr)
    if args.selection_only:
        return
    sentence_pairs = load_sentence_pairs(args.community_root / "data" / "sentences.jsonl")
    output = build_rows(by_level, sentence_pairs, args.cache)
    validate_output(output, legacy_ids)
    write_output(output, args.output)
    print("wrote %s" % args.output, file=sys.stderr)


if __name__ == "__main__":
    main()
