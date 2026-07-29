#!/usr/bin/env node

import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const wordbookPath = path.join(root, "public", "wordbooks", "a1-v1.json");
const reviewPath = path.join(root, "data", "editorial", "a1-review.json");

const replacements = new Map([
  ["wb-a1-kein-57c1bfb", ["Guten Morgen", "Guten Morgen · feste Wendung", "phrase", "早上好", "Guten Morgen, Frau Weber!", "早上好，韦伯女士！"]],
  ["wb-a1-wuerde-1ebb093", ["Guten Tag", "Guten Tag · feste Wendung", "phrase", "您好；日安", "Guten Tag! Wie kann ich Ihnen helfen?", "您好！我能为您做什么？"]],
  ["wb-a1-zeit-b86c0fb", ["Guten Abend", "Guten Abend · feste Wendung", "phrase", "晚上好", "Guten Abend, Herr Bauer!", "晚上好，鲍尔先生！"]],
  ["wb-a1-nun-e4636e0", ["Gute Nacht", "Gute Nacht · feste Wendung", "phrase", "晚安", "Gute Nacht! Schlaf gut.", "晚安！睡个好觉。"]],
  ["wb-a1-bis-35964e1", ["Wie geht es dir?", "Wie geht es dir? · feste Wendung", "phrase", "你好吗；你最近怎么样", "Hallo, Anna! Wie geht es dir?", "你好，安娜！你最近怎么样？"]],
  ["wb-a1-ab-d023a1d", ["Herzlich willkommen", "Herzlich willkommen · feste Wendung", "phrase", "热烈欢迎", "Herzlich willkommen in unserem Kurs!", "热烈欢迎你参加我们的课程！"]],
  ["wb-a1-durch-cef087f", ["Vielen Dank", "Vielen Dank · feste Wendung", "phrase", "非常感谢", "Vielen Dank für deine Hilfe!", "非常感谢你的帮助！"]],
  ["wb-a1-ob-d015f16", ["bitte schön", "bitte schön · feste Wendung", "phrase", "不客气；给您", "Hier ist Ihr Kaffee. – Bitte schön!", "这是您的咖啡。——给您！"]],
  ["wb-a1-ob-5158eed", ["zum Beispiel", "zum Beispiel · feste Wendung", "phrase", "例如；比如", "Ich esse gern Obst, zum Beispiel Äpfel.", "我喜欢吃水果，比如苹果。"]],
  ["wb-a1-gemacht-c605047", ["zu Hause", "zu Hause · feste Wendung", "phrase", "在家", "Am Sonntag bleibe ich zu Hause.", "星期日我待在家里。"]],
  ["wb-a1-selbst-92ee777", ["nach Hause", "nach Hause · feste Wendung", "phrase", "回家；往家去", "Nach dem Kurs gehe ich nach Hause.", "下课后我回家。"]],
  ["wb-a1-getan-0571918", ["am Wochenende", "am Wochenende · feste Wendung", "phrase", "在周末", "Am Wochenende besuche ich meine Eltern.", "周末我去看望父母。"]],
  ["wb-a1-bringen-7e5cb56", ["im Moment", "im Moment · feste Wendung", "phrase", "目前；此刻", "Im Moment habe ich keine Zeit.", "我现在没有时间。"]],
  ["wb-a1-genug-ae0856a", ["ein bisschen", "ein bisschen · feste Wendung", "phrase", "一点儿；少量", "Ich spreche ein bisschen Deutsch.", "我会说一点儿德语。"]],
  ["wb-a1-jeder-9a65ad1", ["keine Ahnung", "keine Ahnung · feste Wendung", "phrase", "不知道；没头绪", "Ich habe keine Ahnung, wo der Schlüssel ist.", "我不知道钥匙在哪里。"]],
  ["wb-a1-fast-b9406e1", ["bis später", "bis später · feste Wendung", "phrase", "待会儿见", "Bis später! Wir treffen uns um drei.", "待会儿见！我们三点碰面。"]],
  ["wb-a1-treffen-6caf293", ["bis morgen", "bis morgen · feste Wendung", "phrase", "明天见", "Bis morgen, Lisa!", "明天见，莉萨！"]],
  ["wb-a1-wort-a79462a", ["wie viel", "wie viel · Frageausdruck", "phrase", "多少", "Wie viel kostet das Ticket?", "这张票多少钱？"]],
  ["wb-a1-sondern-b0dba9b", ["wie lange", "wie lange · Frageausdruck", "phrase", "多久；多长时间", "Wie lange dauert der Kurs?", "这门课持续多长时间？"]],
  ["wb-a1-bewegung-617e066", ["um wie viel Uhr", "um wie viel Uhr · Frageausdruck", "phrase", "几点", "Um wie viel Uhr beginnt der Film?", "电影几点开始？"]],
  ["wb-a1-ansehen-0e36a31", ["auf Wiedersehen", "auf Wiedersehen · feste Wendung", "phrase", "再见", "Auf Wiedersehen, Herr Klein!", "再见，克莱因先生！"]],
  ["wb-a1-abendessen-fcb3037", ["Es tut mir leid", "Es tut mir leid · feste Wendung", "phrase", "对不起；我很遗憾", "Es tut mir leid, ich bin zu spät.", "对不起，我迟到了。"]],
]);

const wordbook = JSON.parse(await readFile(wordbookPath, "utf8"));
const review = JSON.parse(await readFile(reviewPath, "utf8"));
const field = Object.fromEntries(wordbook.fields.map((name, index) => [name, index]));
const reviewById = new Map(review.entries.map((entry) => [entry.id, entry]));
let changed = 0;

for (const row of wordbook.words) {
  const replacement = replacements.get(row[field.id]);
  if (!replacement) continue;
  const [term, forms, typeCode, meaning, example, exampleZh] = replacement;
  row[field.term] = term;
  row[field.forms] = forms;
  row[field.typeCode] = typeCode;
  row[field.meaning] = meaning;
  row[field.example] = example;
  row[field.exampleZh] = exampleZh;

  const entry = reviewById.get(row[field.id]);
  if (!entry) throw new Error(`Missing A1 editorial record for ${row[field.id]}`);
  entry.after = {
    id: row[field.id],
    term,
    forms,
    typeCode,
    meaning,
    example,
    exampleZh,
  };
  entry.reason = [
    "The previous rebuilt row duplicated one of Worttag's 100 hand-edited cards.",
    "It was replaced with a distinct high-frequency A1 conversational expression.",
    "The expression, learner-facing sense, and bilingual example were reviewed together.",
  ];
  entry.evidence = [
    {
      source: "Worttag A1 editorial review",
      kind: "independent CEFR-aligned teaching classification",
      reviewedOn: "2026-07-28",
    },
    {
      source: "Worttag A1 curated-card duplicate audit",
      kind: "manually written expression, example, and Simplified-Chinese translation",
      reviewedOn: "2026-07-28",
    },
    {
      source: "Worttag A1 editorial review",
      kind: "manually written example and Simplified-Chinese translation",
      reviewedOn: "2026-07-28",
    },
    {
      source: "German Wiktionary via WiktAPI",
      status: "fixed_expression_requires_component_lookup",
      role: "headword corroboration only; not used as Chinese translation evidence",
    },
  ];
  entry.unresolved = false;
  entry.unresolvedReasons = [];
  changed += 1;
}

if (changed !== replacements.size) {
  throw new Error(`Expected ${replacements.size} replacements, changed ${changed}.`);
}

for (const [target, value, pretty] of [
  [wordbookPath, wordbook, false],
  [reviewPath, review, true],
]) {
  const temporary = `${target}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`, "utf8");
  await rename(temporary, target);
}

process.stdout.write(`${JSON.stringify({ changed }, null, 2)}\n`);
