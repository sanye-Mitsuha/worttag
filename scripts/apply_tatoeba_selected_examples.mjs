#!/usr/bin/env node

import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const levels = ["b2", "c1"];
const sourcePath = path.join(
  process.cwd(),
  "work",
  "tatoeba-cmn-de-v2026-07-08.examples.json",
);
const source = JSON.parse(await readFile(sourcePath, "utf8"));
const sourceById = new Map(source.entries.map((entry) => [entry.id, entry]));
const metaPattern = /Im Wörterbuch steht|unser Lernwort|Heute üben wir/u;
const ambiguousReasons = new Set([
  "sentence_initial_capitalization_is_pos_ambiguous",
  "headword_shared_by_2_entries",
]);
const unsuitableContext =
  /\b(?:Bombe|töten|Unterwäsche|Wutanfall|Schießen|Gewehr|Pistole|Krieg|Mord|Vampir|Tannenbaum)\b|炸死|内衣|脾气|枪|战争|谋杀|吸血鬼/u;

function normalizeChinese(value) {
  const replacements = {
    個: "个", 們: "们", 為: "为", 與: "与", 說: "说", 話: "话",
    時: "时", 從: "从", 對: "对", 會: "会", 還: "还", 進: "进",
    過: "过", 開: "开", 發: "发", 現: "现", 間: "间", 問: "问",
    題: "题", 點: "点", 總: "总", 經: "经", 體: "体", 學: "学",
    習: "习", 應: "应", 該: "该", 萬: "万", 專: "专", 業: "业",
    關: "关", 係: "系", 實: "实", 際: "际", 頭: "头", 丟: "丢",
    營: "营", 訴: "诉", 麼: "么", 機: "机", 號: "号", 師: "师",
    慣: "惯", 臉: "脸", 樂: "乐", 隨: "随", 靈: "灵", 懼: "惧",
    選: "选", 凍: "冻", 僵: "僵", 別: "别", 無: "无", 細: "细",
    節: "节", 賺: "赚", 錢: "钱", 國: "国", 虛: "虚", 擬: "拟",
    驗: "验", 實: "实", 樹: "树", 葉: "叶", 篤: "笃", 摯: "挚",
    門: "门", 時: "时", 剛: "刚", 小: "小", 進: "进", 選: "选",
  };
  let normalized = Array.from(value, (character) => replacements[character] ?? character).join("");
  normalized = normalized
    .replace(/,/gu, "，")
    .replace(/;/gu, "；")
    .replace(/\?/gu, "？")
    .replace(/!/gu, "！");
  if (!/[。！？…](?:[”」』"“])?$/u.test(normalized)) normalized += "。";
  return normalized;
}

let changed = 0;
const byLevel = {};

for (const level of levels) {
  const wordbookPath = path.join(process.cwd(), "public", "wordbooks", `${level}-v1.json`);
  const wordbook = JSON.parse(await readFile(wordbookPath, "utf8"));
  const field = Object.fromEntries(wordbook.fields.map((name, index) => [name, index]));
  let levelChanged = 0;

  for (const row of wordbook.words) {
    if (!metaPattern.test(row[field.example])) continue;
    const evidence = sourceById.get(row[field.id]);
    const selected = evidence?.selected;
    if (
      !selected?.match?.targetVerified
      || (evidence.reviewReasons ?? []).some((reason) => ambiguousReasons.has(reason))
      || unsuitableContext.test(`${selected.german}\n${selected.chinese}`)
    ) {
      continue;
    }
    row[field.example] = selected.german.trim();
    row[field.exampleZh] = normalizeChinese(selected.chinese.trim());
    levelChanged += 1;
    changed += 1;
  }

  if (levelChanged) {
    const temporary = `${wordbookPath}.tmp-${process.pid}`;
    await writeFile(temporary, `${JSON.stringify(wordbook)}\n`, "utf8");
    await rename(temporary, wordbookPath);
  }
  byLevel[level.toUpperCase()] = levelChanged;
}

process.stdout.write(`${JSON.stringify({ changed, byLevel }, null, 2)}\n`);
