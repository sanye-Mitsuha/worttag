#!/usr/bin/env node

import { access, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import OpenCC from "opencc-js";

const levels = ["a1", "a2", "b1", "b2", "c1"];
const toMainlandSimplified = OpenCC.Converter({ from: "twp", to: "cn" });
const toSimplified = (value) => (
  toMainlandSimplified(value).replace(/([什怎那这])幺/gu, "$1么")
);
const traditionalToSimplified = new Map(Object.entries({
  個: "个",
  們: "们",
  為: "为",
  與: "与",
  說: "说",
  話: "话",
  時: "时",
  從: "从",
  對: "对",
  會: "会",
  還: "还",
  進: "进",
  過: "过",
  開: "开",
  發: "发",
  現: "现",
  間: "间",
  問: "问",
  題: "题",
  點: "点",
  總: "总",
  經: "经",
  體: "体",
  學: "学",
  習: "习",
  應: "应",
  該: "该",
  萬: "万",
  專: "专",
  業: "业",
  關: "关",
  係: "系",
  實: "实",
  際: "际",
  頭: "头",
  丟: "丢",
  營: "营",
  訴: "诉",
  麼: "么",
  機: "机",
  號: "号",
  師: "师",
  慣: "惯",
  國: "国",
  語: "语",
  樣: "样",
  標: "标",
  準: "准",
  廣: "广",
  東: "东",
  風: "风",
  錢: "钱",
  電: "电",
  車: "车",
  門: "门",
  書: "书",
  報: "报",
  見: "见",
  聽: "听",
  買: "买",
  賣: "卖",
  長: "长",
  難: "难",
  簡: "简",
  單: "单",
  雙: "双",
  計: "计",
  劃: "划",
  線: "线",
  員: "员",
  倉: "仓",
  處: "处",
  區: "区",
  橋: "桥",
  樓: "楼",
  鄉: "乡",
  鄰: "邻",
  規: "规",
  則: "则",
  責: "责",
  任: "任",
  檢: "检",
  查: "查",
  醫: "医",
  藥: "药",
  療: "疗",
  險: "险",
  據: "据",
  證: "证",
  導: "导",
  續: "续",
  結: "结",
  統: "统",
  價: "价",
  質: "质",
  產: "产",
  設: "设",
  備: "备",
  資: "资",
  訊: "讯",
  網: "网",
  絡: "络",
  畫: "画",
  圖: "图",
  數: "数",
  擇: "择",
  擔: "担",
  憂: "忧",
  歡: "欢",
  樂: "乐",
  驚: "惊",
  許: "许",
  讓: "让",
  幫: "帮",
  傳: "传",
  達: "达",
  聯: "联",
  繫: "系",
  環: "环",
  境: "境",
  氣: "气",
  壓: "压",
  歷: "历",
  史: "史",
  變: "变",
  化: "化",
  戰: "战",
  爭: "争",
  勝: "胜",
  敗: "败",
  組: "组",
  織: "织",
  參: "参",
  觀: "观",
  點: "点",
  評: "评",
  論: "论",
  議: "议",
  認: "认",
  識: "识",
  覺: "觉",
  態: "态",
  度: "度",
  夢: "梦",
  愛: "爱",
  親: "亲",
  屬: "属",
  兒: "儿",
  孫: "孙",
  婦: "妇",
  貓: "猫",
  鳥: "鸟",
  魚: "鱼",
  馬: "马",
  羊: "羊",
  雞: "鸡",
  麵: "面",
  飯: "饭",
  飲: "饮",
  餐: "餐",
  湯: "汤",
  餅: "饼",
  蘋: "苹",
  蘿: "萝",
  蔔: "卜",
  菜: "菜",
  麥: "麦",
  糖: "糖",
  鹽: "盐",
  溫: "温",
  暖: "暖",
  涼: "凉",
  濕: "湿",
  乾: "干",
  聲: "声",
  音: "音",
  燈: "灯",
  牆: "墙",
  場: "场",
  廳: "厅",
  室: "室",
  廚: "厨",
  衛: "卫",
  間: "间",
  盤: "盘",
  碗: "碗",
  杯: "杯",
  傘: "伞",
  鞋: "鞋",
  褲: "裤",
  襯: "衬",
  衫: "衫",
  襪: "袜",
  戲: "戏",
  劇: "剧",
  節: "节",
  目: "目",
  賽: "赛",
  獎: "奖",
  輸: "输",
  贏: "赢",
  運: "运",
  動: "动",
  隊: "队",
  球: "球",
  費: "费",
  稅: "税",
  貸: "贷",
  賬: "账",
  帳: "账",
  兌: "兑",
  換: "换",
  業: "业",
  務: "务",
  辦: "办",
  公: "公",
  司: "司",
  廠: "厂",
  領: "领",
  導: "导",
  管: "管",
  理: "理",
  僱: "雇",
  職: "职",
  位: "位",
  薪: "薪",
  資: "资",
  貿: "贸",
  易: "易",
  經: "经",
  濟: "济",
  政: "政",
  府: "府",
  警: "警",
  察: "察",
  法: "法",
  律: "律",
  權: "权",
  益: "益",
  義: "义",
  務: "务",
  團: "团",
  體: "体",
  社: "社",
  會: "会",
  科: "科",
  學: "学",
  技: "技",
  術: "术",
  研: "研",
  究: "究",
  發: "发",
  展: "展",
  創: "创",
  新: "新",
}));

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeJsonAtomic(filePath, value, pretty = false) {
  const temporary = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`, "utf8");
  await rename(temporary, filePath);
}

function normalizeChinese(value, sentence = false) {
  let normalized = toSimplified(value);
  normalized = Array.from(normalized, (character) => (
    traditionalToSimplified.get(character) ?? character
  )).join("");
  normalized = normalized
    .replace(/,/gu, "，")
    .replace(/;/gu, "；")
    .replace(/\?/gu, "？")
    .replace(/!/gu, "！");
  if (
    sentence
    && normalized
    && !/[。！？…](?:[”」』"“])?$/u.test(normalized)
  ) {
    normalized += "。";
  }
  return normalized;
}

let changedRows = 0;
const byLevel = {};

for (const level of levels) {
  const wordbookPath = path.join(process.cwd(), "public", "wordbooks", `${level}-v1.json`);
  const reviewPath = path.join(process.cwd(), "data", "editorial", `${level}-review.json`);
  const wordbook = JSON.parse(await readFile(wordbookPath, "utf8"));
  const field = Object.fromEntries(wordbook.fields.map((name, index) => [name, index]));
  const review = await exists(reviewPath)
    ? JSON.parse(await readFile(reviewPath, "utf8"))
    : null;
  const reviewById = new Map((review?.entries ?? []).map((entry) => [entry.after?.id ?? entry.id, entry]));
  let levelChanged = 0;

  for (const row of wordbook.words) {
    const meaning = normalizeChinese(row[field.meaning]);
    const exampleZh = normalizeChinese(row[field.exampleZh], true);
    if (meaning === row[field.meaning] && exampleZh === row[field.exampleZh]) continue;
    row[field.meaning] = meaning;
    row[field.exampleZh] = exampleZh;
    const editorial = reviewById.get(row[field.id]);
    if (editorial) {
      editorial.after.meaning = meaning;
      editorial.after.exampleZh = exampleZh;
      editorial.reason = Array.from(new Set([
        ...(editorial.reason ?? []),
        "Learner-facing Chinese was normalized to modern Simplified Chinese punctuation and characters.",
      ]));
    }
    levelChanged += 1;
    changedRows += 1;
  }

  if (levelChanged) {
    await writeJsonAtomic(wordbookPath, wordbook);
    if (review) await writeJsonAtomic(reviewPath, review, true);
  }
  byLevel[level.toUpperCase()] = levelChanged;
}

process.stdout.write(`${JSON.stringify({ changedRows, byLevel }, null, 2)}\n`);
