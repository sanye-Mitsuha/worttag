#!/usr/bin/env node

/**
 * Rebuild the packed C1 supplement as a reviewed teaching inventory.
 *
 * The script deliberately touches only public/wordbooks/c1-v1.json and
 * data/editorial/c1-review.json.  It keeps the seven-field packed schema and
 * the 1,980 row positions stable; progress identifiers are rekeyed centrally
 * after all levels have completed editorial review.
 */

import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import OpenCC from "opencc-js";
import {
  expectedDictionaryPos,
  loadCuratedEntries,
  loadPackedEntries,
} from "./audit_wordbooks.mjs";

const ROOT = process.cwd();
const WORDBOOK_PATH = path.join(ROOT, "public/wordbooks/c1-v1.json");
const REVIEW_PATH = path.join(ROOT, "data/editorial/c1-review.json");
const WIKT_PATH = path.join(ROOT, ".cache/wordbooks/wiktapi-de-2026-07-28.json");
const HANDEDICT_PATH = path.join(ROOT, "data/lexicon/handedict-reverse-v1.json");

const FIELDS = ["id", "term", "forms", "typeCode", "meaning", "example", "exampleZh"];
const ARTICLE_BY_TYPE = { nm: "der", nf: "die", nn: "das" };
const ACCUSATIVE_BY_TYPE = { nm: "den", nf: "die", nn: "das" };
const POS_BY_TYPE = {
  nm: "noun",
  nf: "noun",
  nn: "noun",
  v: "verb",
  adj: "adjective",
  adv: "adverb",
  prep: "preposition",
  conj: "conjunction",
  pron: "pronoun",
  det: "determiner",
  num: "numeral",
  part: "particle",
  intj: "interjection",
  prop: "proper",
};

const META_RE =
  /Im Wörterbuch steht|词典将|待人工|词义见例句|义项尚待|Dictionary meaning|learning word/iu;
const UNSUITABLE_EXAMPLE_RE =
  /\b(?:Tom|Maria|Peter|Hans|Fritz|Jordan|Tatoeba|Gestapo|Hitler|Caesar|NASA)\b|(?:Pussy|Vagina|Sperma|bumsen|pissen|Drecksack|Neger|Klugscheißer|Zuhälter|Prostituierte|Vergewaltigung)/iu;

const BAD_TERMS = new Set(
  [
    "die Soße", "der Entführer", "der Barkeeper", "der Fritz", "das Autogramm",
    "die Kompanie", "das Casino", "pissen", "das Outfit", "der Drecksack",
    "die Vagina", "der Wachmann", "die Enkelin", "die Tinte", "light", "das W",
    "die Zauberei", "der Floh", "der Friseur", "die Ermordung", "die Kneipe",
    "der Schal", "der Hunt", "die Zigarre", "die Tänzerin", "der Mumm",
    "der Johannes", "der Jet", "die Power", "der Junkie", "der Vati", "nähen",
    "das Laken", "prügeln", "die Pussy", "das Wrack", "knarren", "der Maulwurf",
    "die Wanne", "der Kragen", "der Wecker", "die Marina", "die Wurst",
    "die Perücke", "das Chi", "knallen", "der Schnurrbart", "der Anker",
    "das Kichern", "kichern", "der Terrorist", "das Taschentuch", "die Rockmusik",
    "saufen", "die Mailbox", "zischen", "die Lesbe", "das Höschen", "die Limo",
    "der Serienmörder", "die Signora", "der Strafzettel", "der Pier", "der Spitzel",
    "der Schlitten", "der Dinosaurier", "das Pony", "die Kassette", "der Klempner",
    "der Schlauch", "das Grillen", "die Matratze", "der Ballon", "das Rudel",
    "der Kerker", "der Stiefvater", "der Dreier", "der Werwolf", "der DJ",
    "der Bandit", "das Sperma", "spucken", "der Leichnam", "der Schuft", "bumsen",
    "das Massaker", "das Donnerwetter", "der Raubüberfall", "das Duell", "keuchen",
    "die Patrouille", "das Martini", "das Klappern", "klappern", "der Pirat",
    "die Butch", "der Neger", "der Prediger", "der Kiki", "das Stückchen",
    "das Pärchen", "der Busen", "der Stopfen", "stopfen", "das Luder", "die Info",
    "der Köter", "vergewaltigen", "angepisst", "der Besen", "der Senf",
    "ausgeflippt", "die Haue", "piepsen", "grinsen", "der Ober", "der Knabe",
    "der Schwindler", "die Nanny", "die Haushälterin", "der Söldner",
    "der Klugscheißer", "der Hirsch", "der Kaviar", "die Schnecke", "der Pfeffer",
    "das Lenkrad", "der Kürbis", "der Walzer", "das Küken", "der Weizen",
    "das Floß", "der Kohl", "die Eiche", "der Imbiss", "der Träumer", "flicken",
    "der Poet", "der Pole", "der Biber", "die Hacke", "der Kleiderschrank",
    "der Zaum", "die Bürste", "miauen", "der Storch", "die Grille", "die Ebbe",
    "das Glühwürmchen", "der Spargel", "der Hecht", "das Sauerkraut", "bürsten",
    "die Elster", "mich", "dich", "okay", "der Blödsinn", "amen", "köstlich",
    "der Liebhaber", "das Häkchen", "der Seeräuber", "die Finnin", "die Karre",
    "die Bluse", "der Schwiegersohn", "die Schaufel", "der Rücksitz", "der Grill",
    "abknallen", "der Thor", "der Caesar", "die Sklavin", "die Unterhose",
    "der Psychopath", "geistern",
  ].map(lower),
);

const TRADITIONAL_TO_SIMPLIFIED = new Map(
  Object.entries({
    個: "个", 們: "们", 為: "为", 與: "与", 說: "说", 話: "话", 時: "时",
    從: "从", 對: "对", 會: "会", 還: "还", 進: "进", 過: "过", 開: "开",
    發: "发", 現: "现", 間: "间", 問: "问", 題: "题", 點: "点", 總: "总",
    經: "经", 體: "体", 學: "学", 習: "习", 應: "应", 該: "该", 萬: "万",
    專: "专", 業: "业", 關: "关", 係: "系", 實: "实", 際: "际", 頭: "头",
    丟: "丢", 營: "营", 訴: "诉", 麼: "么", 機: "机", 號: "号", 師: "师",
    慣: "惯", 國: "国", 語: "语", 樣: "样", 標: "标", 準: "准", 廣: "广",
    東: "东", 風: "风", 錢: "钱", 電: "电", 車: "车", 門: "门", 書: "书",
    報: "报", 見: "见", 聽: "听", 買: "买", 賣: "卖", 長: "长", 難: "难",
    簡: "简", 單: "单", 雙: "双", 計: "计", 劃: "划", 線: "线", 員: "员",
    倉: "仓", 處: "处", 區: "区", 橋: "桥", 樓: "楼", 鄉: "乡", 鄰: "邻",
    規: "规", 則: "则", 責: "责", 檢: "检", 醫: "医", 藥: "药", 療: "疗",
    險: "险", 據: "据", 證: "证", 導: "导", 續: "续", 結: "结", 統: "统",
    價: "价", 質: "质", 產: "产", 設: "设", 備: "备", 資: "资", 訊: "讯",
    網: "网", 絡: "络", 畫: "画", 圖: "图", 數: "数", 擇: "择", 擔: "担",
    憂: "忧", 歡: "欢", 樂: "乐", 驚: "惊", 許: "许", 讓: "让", 幫: "帮",
    傳: "传", 達: "达", 聯: "联", 繫: "系", 環: "环", 氣: "气", 壓: "压",
    歷: "历", 變: "变", 戰: "战", 爭: "争", 勝: "胜", 敗: "败", 組: "组",
    織: "织", 參: "参", 觀: "观", 評: "评", 論: "论", 議: "议", 認: "认",
    識: "识", 覺: "觉", 態: "态", 夢: "梦", 愛: "爱", 親: "亲", 屬: "属",
    兒: "儿", 孫: "孙", 婦: "妇", 貓: "猫", 鳥: "鸟", 魚: "鱼", 馬: "马",
    雞: "鸡", 麵: "面", 飯: "饭", 飲: "饮", 湯: "汤", 餅: "饼", 蘋: "苹",
    蘿: "萝", 蔔: "卜", 麥: "麦", 鹽: "盐", 溫: "温", 涼: "凉", 濕: "湿",
    乾: "干", 聲: "声", 燈: "灯", 牆: "墙", 場: "场", 廳: "厅", 廚: "厨",
    衛: "卫", 盤: "盘", 傘: "伞", 褲: "裤", 襯: "衬", 襪: "袜", 戲: "戏",
    劇: "剧", 節: "节", 賽: "赛", 獎: "奖", 輸: "输", 贏: "赢", 運: "运",
    動: "动", 隊: "队", 費: "费", 稅: "税", 貸: "贷", 賬: "账", 帳: "账",
    兌: "兑", 換: "换", 務: "务", 辦: "办", 廠: "厂", 領: "领", 僱: "雇",
    職: "职", 貿: "贸", 濟: "济", 府: "府", 警: "警", 察: "察", 權: "权",
    義: "义", 團: "团", 會: "会", 術: "术", 究: "究", 創: "创", 負: "负",
    這: "这", 裡: "里", 無: "无", 永: "永", 遠: "远", 類: "类", 贖: "赎",
    獨: "独", 閒: "闲", 龍: "龙", 喬: "乔", 檔: "档", 優: "优", 勢: "势",
    壞: "坏", 顯: "显", 稱: "称", 轉: "转", 識: "识", 髮: "发", 貴: "贵",
    條: "条", 鱸: "鲈", 請: "请", 離: "离", 內: "内", 紅: "红", 產: "产",
  }),
);
const toMainlandSimplified = OpenCC.Converter({ from: "twp", to: "cn" });

function cleanSpace(value) {
  return String(value ?? "").normalize("NFC").replace(/\s+/gu, " ").trim();
}

function simplifyChinese(value) {
  const locallyNormalized = [...cleanSpace(value)]
    .map((character) => TRADITIONAL_TO_SIMPLIFIED.get(character) ?? character)
    .join("");
  return toMainlandSimplified(locallyNormalized)
    .replace(/\s+([，。；：！？])/gu, "$1")
    .replace(/([，。；：！？])(?=[^\s，。；：！？）”])/gu, "$1")
    .replace(/([。！？])([」”])?[。！？]+$/u, "$1$2")
    .trim();
}

function lemmaOf(term) {
  return cleanSpace(term)
    .replace(/^(?:der|die|das)\s+/u, "")
    .replace(/^sich\s+/u, "")
    .replace(/^etwas\s+/u, "");
}

function lower(value) {
  return cleanSpace(value).toLocaleLowerCase("de-DE");
}

function rowToObject(row) {
  return Object.fromEntries(FIELDS.map((field, index) => [field, row[index]]));
}

function objectToRow(entry) {
  return FIELDS.map((field) => cleanSpace(entry[field]));
}

function stableHash(value) {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 12);
}

async function writeJsonAtomic(filePath, value, pretty = true) {
  const temporary = `${filePath}.tmp-${process.pid}`;
  await writeFile(
    temporary,
    `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`,
    "utf8",
  );
  await rename(temporary, filePath);
}

function nounSpec(term, plural, meaning, field = "research") {
  const match = /^(der|die|das)\s+(.+)$/u.exec(term);
  if (!match) throw new Error(`Noun needs article: ${term}`);
  const typeCode = { der: "nm", die: "nf", das: "nn" }[match[1]];
  return {
    term,
    forms: `${term} · ${plural || "meist ohne Plural"}`,
    typeCode,
    meaning,
    field,
  };
}

function verbSpec(term, present, preterite, perfect, meaning, field = "research") {
  return {
    term,
    forms: `${term} · ${present} · ${preterite} · ${perfect}`,
    typeCode: "v",
    meaning,
    field,
  };
}

function adjectiveSpec(term, meaning, field = "research") {
  return {
    term,
    forms: `${term} · als Adjektiv`,
    typeCode: "adj",
    meaning,
    field,
  };
}

function adverbSpec(term, meaning, field = "research") {
  return {
    term,
    forms: `${term} · unveränderlich`,
    typeCode: "adv",
    meaning,
    field,
  };
}

/**
 * Independently selected C1 core replacements.  Each item is a modern lexical
 * unit useful in academic, professional, civic, scientific, or cultural
 * discourse.  The list is intentionally not copied from a proprietary CEFR
 * vocabulary list.
 */
const REPLACEMENTS = [
  // Wissenschaftliches Arbeiten und Methodik
  nounSpec("die Aussagekraft", "meist ohne Plural", "说服力；信息量", "research"),
  nounSpec("die Belastbarkeit", "meist ohne Plural", "可靠性；承受能力", "research"),
  nounSpec("die Vergleichbarkeit", "meist ohne Plural", "可比性", "research"),
  nounSpec("die Nachvollziehbarkeit", "meist ohne Plural", "可理解性；可追溯性", "research"),
  nounSpec("die Replizierbarkeit", "meist ohne Plural", "可重复性", "research"),
  nounSpec("die Validität", "meist ohne Plural", "效度；有效性", "research"),
  nounSpec("die Reliabilität", "meist ohne Plural", "信度；可靠性", "research"),
  nounSpec("die Kausalität", "meist ohne Plural", "因果关系", "research"),
  nounSpec("die Korrelation", "die Korrelationen", "相关性；相互关系", "research"),
  nounSpec("die Kohärenz", "meist ohne Plural", "连贯性；一致性", "research"),
  nounSpec("die Konsistenz", "die Konsistenzen", "一致性；稳定性", "research"),
  nounSpec("die Diskrepanz", "die Diskrepanzen", "差异；不一致", "research"),
  nounSpec("die Ambivalenz", "die Ambivalenzen", "矛盾心态；双重性", "research"),
  nounSpec("die Implikation", "die Implikationen", "含义；潜在影响；蕴涵", "research"),
  nounSpec("die Prämisse", "die Prämissen", "前提", "research"),
  nounSpec("die Hypothese", "die Hypothesen", "假设；假说", "research"),
  nounSpec("die Fragestellung", "die Fragestellungen", "研究问题；问题设定", "research"),
  nounSpec("die Zielsetzung", "die Zielsetzungen", "目标设定；宗旨", "research"),
  nounSpec("die Herangehensweise", "die Herangehensweisen", "处理方式；研究方法", "research"),
  nounSpec("die Methodik", "die Methodiken", "方法体系；研究方法", "research"),
  nounSpec("der Erkenntnisgewinn", "die Erkenntnisgewinne", "知识增益；新认识", "research"),
  nounSpec("der Erklärungsansatz", "die Erklärungsansätze", "解释路径；解释模型", "research"),
  nounSpec("der Geltungsbereich", "die Geltungsbereiche", "适用范围", "research"),
  nounSpec("der Bezugsrahmen", "die Bezugsrahmen", "参照框架", "research"),
  nounSpec("die Operationalisierung", "die Operationalisierungen", "操作化；指标化", "research"),
  nounSpec("die Stichprobe", "die Stichproben", "样本", "research"),
  nounSpec("die Schwankungsbreite", "die Schwankungsbreiten", "波动范围", "research"),
  nounSpec("die Trennschärfe", "die Trennschärfen", "区分度", "research"),
  nounSpec("der Befund", "die Befunde", "研究发现；检查结果", "research"),
  nounSpec("die Befundlage", "die Befundlagen", "现有研究结论；证据状况", "research"),
  nounSpec("die Datengrundlage", "die Datengrundlagen", "数据基础", "research"),
  nounSpec("die Erhebung", "die Erhebungen", "调查；数据采集", "research"),
  nounSpec("die Auswertung", "die Auswertungen", "评估；数据分析", "research"),
  nounSpec("die Gewichtung", "die Gewichtungen", "权重分配；侧重", "research"),
  nounSpec("die Herleitung", "die Herleitungen", "推导；论证过程", "research"),
  nounSpec("die Schlussfolgerung", "die Schlussfolgerungen", "结论；推论", "research"),
  nounSpec("der Erkenntnisstand", "die Erkenntnisstände", "知识现状；认识水平", "research"),
  nounSpec("der Forschungsstand", "die Forschungsstände", "研究现状", "research"),
  nounSpec("die Forschungsfrage", "die Forschungsfragen", "研究问题", "research"),
  nounSpec("die Untersuchungseinheit", "die Untersuchungseinheiten", "研究单位；分析单元", "research"),
  nounSpec("die Bezugsgröße", "die Bezugsgrößen", "参照量；基准值", "research"),
  nounSpec("die Kenngröße", "die Kenngrößen", "特征量；指标", "research"),
  nounSpec("der Parameter", "die Parameter", "参数；影响因素", "research"),
  nounSpec("die Variable", "die Variablen", "变量", "research"),
  nounSpec("der Einflussfaktor", "die Einflussfaktoren", "影响因素", "research"),
  nounSpec("die Wechselwirkung", "die Wechselwirkungen", "相互作用；交互效应", "research"),
  nounSpec("der Wirkungszusammenhang", "die Wirkungszusammenhänge", "作用关系；影响机制", "research"),
  nounSpec("die Randbedingung", "die Randbedingungen", "边界条件；限制条件", "research"),
  nounSpec("die Grundannahme", "die Grundannahmen", "基本假设", "research"),
  nounSpec("der Deutungsrahmen", "die Deutungsrahmen", "解释框架", "research"),
  nounSpec("die Begriffsbestimmung", "die Begriffsbestimmungen", "概念界定；定义", "research"),
  nounSpec("die Begriffsabgrenzung", "die Begriffsabgrenzungen", "概念区分；界定", "research"),
  nounSpec("die Fallstudie", "die Fallstudien", "案例研究", "research"),
  nounSpec("die Längsschnittstudie", "die Längsschnittstudien", "纵向研究", "research"),
  nounSpec("die Querschnittsanalyse", "die Querschnittsanalysen", "横截面分析", "research"),
  nounSpec("die Messgenauigkeit", "die Messgenauigkeiten", "测量精度", "research"),
  nounSpec("die Messunsicherheit", "die Messunsicherheiten", "测量不确定性", "research"),
  nounSpec("die Fehlerquote", "die Fehlerquoten", "错误率", "research"),
  nounSpec("die Abweichung", "die Abweichungen", "偏差；偏离", "research"),
  nounSpec("die Streuung", "die Streuungen", "离散程度；散布", "research"),
  nounSpec("die Signifikanz", "meist ohne Plural", "显著性；重要性", "research"),
  nounSpec("das Konfidenzintervall", "die Konfidenzintervalle", "置信区间", "research"),
  nounSpec("die Kontrollgruppe", "die Kontrollgruppen", "对照组", "research"),
  nounSpec("die Versuchsbedingung", "die Versuchsbedingungen", "实验条件", "research"),
  nounSpec("die Datenbereinigung", "die Datenbereinigungen", "数据清洗", "research"),
  nounSpec("die Datenlücke", "die Datenlücken", "数据缺口", "research"),
  nounSpec("die Quellenlage", "die Quellenlagen", "资料状况；文献基础", "research"),
  nounSpec("die Quellenkritik", "meist ohne Plural", "史料批判；资料审辨", "research"),
  nounSpec("die Beleglage", "die Beleglagen", "证据状况", "research"),
  nounSpec("die Gegenhypothese", "die Gegenhypothesen", "对立假设", "research"),
  nounSpec("die Modellannahme", "die Modellannahmen", "模型假设", "research"),
  nounSpec("die Modellgüte", "meist ohne Plural", "模型拟合优度；模型质量", "research"),
  nounSpec("die Übertragbarkeit", "meist ohne Plural", "可迁移性；可推广性", "research"),
  nounSpec("die Verallgemeinerbarkeit", "meist ohne Plural", "可推广性", "research"),
  nounSpec("die Plausibilitätsprüfung", "die Plausibilitätsprüfungen", "合理性检验", "research"),
  nounSpec("die Gegenprobe", "die Gegenproben", "复核；反向检验", "research"),
  nounSpec("die Fachdebatte", "die Fachdebatten", "专业讨论；学术争论", "research"),
  nounSpec("der Forschungsbedarf", "meist ohne Plural", "研究需求", "research"),
  nounSpec("das Erkenntnisinteresse", "die Erkenntnisinteressen", "认识兴趣；研究关切", "research"),

  // Recht, Politik und Verwaltung
  nounSpec("die Rechtsstaatlichkeit", "meist ohne Plural", "法治原则；法治性", "civic"),
  nounSpec("die Verfassungsmäßigkeit", "meist ohne Plural", "合宪性", "civic"),
  nounSpec("die Verhältnismäßigkeit", "meist ohne Plural", "比例原则；适度性", "civic"),
  nounSpec("die Rechenschaftspflicht", "die Rechenschaftspflichten", "问责义务", "civic"),
  nounSpec("das Transparenzgebot", "die Transparenzgebote", "透明度要求", "civic"),
  nounSpec("die Gewaltenteilung", "die Gewaltenteilungen", "权力分立", "civic"),
  nounSpec("das Gemeinwohl", "meist ohne Plural", "公共利益；公共福祉", "civic"),
  nounSpec("die Interessenvertretung", "die Interessenvertretungen", "利益代表；利益团体", "civic"),
  nounSpec("die Beschlussfassung", "die Beschlussfassungen", "决议程序；表决通过", "civic"),
  nounSpec("der Ermessensspielraum", "die Ermessensspielräume", "裁量空间", "civic"),
  nounSpec("der Rechtsbehelf", "die Rechtsbehelfe", "法律救济手段", "civic"),
  nounSpec("die Rechtsgrundlage", "die Rechtsgrundlagen", "法律依据", "civic"),
  nounSpec("der Geltungsanspruch", "die Geltungsansprüche", "效力主张；普遍性要求", "civic"),
  nounSpec("die Zuständigkeit", "die Zuständigkeiten", "管辖权；职责范围", "civic"),
  nounSpec("die Befugnis", "die Befugnisse", "权限；职权", "civic"),
  nounSpec("die Abwägung", "die Abwägungen", "权衡；衡量", "civic"),
  nounSpec("die Folgenabschätzung", "die Folgenabschätzungen", "影响评估；后果评估", "civic"),
  nounSpec("der Umsetzungsspielraum", "die Umsetzungsspielräume", "实施空间", "civic"),
  nounSpec("die Gesetzesfolgenabschätzung", "die Gesetzesfolgenabschätzungen", "立法影响评估", "civic"),
  nounSpec("der Normenkonflikt", "die Normenkonflikte", "规范冲突", "civic"),
  nounSpec("die Normenkontrolle", "die Normenkontrollen", "规范审查；违宪审查", "civic"),
  nounSpec("der Verfahrensgrundsatz", "die Verfahrensgrundsätze", "程序原则", "civic"),
  nounSpec("die Verfahrensordnung", "die Verfahrensordnungen", "议事规则；程序规则", "civic"),
  nounSpec("die Anhörung", "die Anhörungen", "听证；征询意见", "civic"),
  nounSpec("die Eingabe", "die Eingaben", "申诉；提交内容", "civic"),
  nounSpec("die Selbstverwaltung", "die Selbstverwaltungen", "自治管理", "civic"),
  nounSpec("die Daseinsvorsorge", "meist ohne Plural", "基本公共服务保障", "civic"),
  nounSpec("der Gestaltungsspielraum", "die Gestaltungsspielräume", "政策设计空间；自主空间", "civic"),
  nounSpec("die Haushaltsautonomie", "meist ohne Plural", "财政自主权", "civic"),
  nounSpec("die Mitwirkungspflicht", "die Mitwirkungspflichten", "配合义务", "civic"),
  nounSpec("die Sorgfaltspflicht", "die Sorgfaltspflichten", "注意义务；审慎义务", "civic"),
  nounSpec("die Beweislast", "die Beweislasten", "举证责任", "civic"),
  nounSpec("der Rechtsanspruch", "die Rechtsansprüche", "法定权利；法律请求权", "civic"),
  nounSpec("die Rechtssicherheit", "meist ohne Plural", "法律确定性；法治保障", "civic"),
  nounSpec("die Rechtsprechung", "die Rechtsprechungen", "司法判例；审判实践", "civic"),
  nounSpec("die Rechtsauffassung", "die Rechtsauffassungen", "法律观点；法律见解", "civic"),
  nounSpec("der Präzedenzfall", "die Präzedenzfälle", "先例；判例", "civic"),
  nounSpec("die Unschuldsvermutung", "die Unschuldsvermutungen", "无罪推定", "civic"),
  nounSpec("das Verfassungsorgan", "die Verfassungsorgane", "宪法机关", "civic"),
  nounSpec("das Mehrheitsprinzip", "die Mehrheitsprinzipien", "多数原则", "civic"),
  nounSpec("das Minderheitenrecht", "die Minderheitenrechte", "少数群体权利", "civic"),
  nounSpec("die Subsidiarität", "meist ohne Plural", "辅助性原则；权责下放原则", "civic"),
  nounSpec("die Hoheitsgewalt", "die Hoheitsgewalten", "国家公权力；主权权力", "civic"),
  nounSpec("die Zuständigkeitsordnung", "die Zuständigkeitsordnungen", "权限划分制度", "civic"),
  nounSpec("das Beteiligungsverfahren", "die Beteiligungsverfahren", "参与程序；公众参与程序", "civic"),
  nounSpec("die Verwaltungspraxis", "die Verwaltungspraktiken", "行政实践", "civic"),
  nounSpec("die Ermessensentscheidung", "die Ermessensentscheidungen", "裁量决定", "civic"),
  nounSpec("die Rechtsfolge", "die Rechtsfolgen", "法律后果", "civic"),
  nounSpec("der Regelungsbedarf", "meist ohne Plural", "立法或监管需求", "civic"),
  nounSpec("die Regelungslücke", "die Regelungslücken", "法律空白；监管缺口", "civic"),
  nounSpec("die Vollzugspraxis", "die Vollzugspraktiken", "执行实践；执法实践", "civic"),
  nounSpec("der Instanzenzug", "die Instanzenzüge", "审级制度；上诉途径", "civic"),
  nounSpec("die Klagebefugnis", "die Klagebefugnisse", "起诉资格", "civic"),
  nounSpec("die Grundrechtsabwägung", "die Grundrechtsabwägungen", "基本权利衡量", "civic"),
  nounSpec("die Verfahrensgarantie", "die Verfahrensgarantien", "程序保障", "civic"),
  nounSpec("der Gesetzesvorbehalt", "die Gesetzesvorbehalte", "法律保留原则", "civic"),

  // Wirtschaft, Arbeit und Organisation
  nounSpec("die Wertschöpfung", "die Wertschöpfungen", "价值创造；增加值", "economy"),
  nounSpec("die Wettbewerbsfähigkeit", "meist ohne Plural", "竞争力", "economy"),
  nounSpec("die Kaufkraft", "meist ohne Plural", "购买力", "economy"),
  nounSpec("die Konjunkturlage", "die Konjunkturlagen", "经济景气状况", "economy"),
  nounSpec("die Inflationsrate", "die Inflationsraten", "通货膨胀率", "economy"),
  nounSpec("die Produktivität", "meist ohne Plural", "生产率；生产力", "economy"),
  nounSpec("der Fachkräftemangel", "meist ohne Plural", "专业人才短缺", "economy"),
  nounSpec("die Lieferkette", "die Lieferketten", "供应链", "economy"),
  nounSpec("der Standortfaktor", "die Standortfaktoren", "区位因素；选址因素", "economy"),
  nounSpec("die Verschuldungsquote", "die Verschuldungsquoten", "负债率", "economy"),
  nounSpec("die Umverteilung", "die Umverteilungen", "再分配", "economy"),
  nounSpec("die Ressourcenallokation", "die Ressourcenallokationen", "资源配置", "economy"),
  nounSpec("der Skaleneffekt", "die Skaleneffekte", "规模效应", "economy"),
  nounSpec("die Marktmacht", "meist ohne Plural", "市场支配力", "economy"),
  nounSpec("die Investitionsbereitschaft", "meist ohne Plural", "投资意愿", "economy"),
  nounSpec("die Innovationskraft", "meist ohne Plural", "创新能力", "economy"),
  nounSpec("das Geschäftsmodell", "die Geschäftsmodelle", "商业模式", "economy"),
  nounSpec("die Kapitalrendite", "die Kapitalrenditen", "资本回报率", "economy"),
  nounSpec("die Rückstellung", "die Rückstellungen", "会计准备金；预计负债", "economy"),
  nounSpec("die Auftragslage", "die Auftragslagen", "订单状况", "economy"),
  nounSpec("die Preissetzung", "die Preissetzungen", "定价", "economy"),
  nounSpec("die Preisstabilität", "meist ohne Plural", "价格稳定", "economy"),
  nounSpec("die Haushaltskonsolidierung", "die Haushaltskonsolidierungen", "财政整顿；预算巩固", "economy"),
  nounSpec("die Erwerbsquote", "die Erwerbsquoten", "劳动参与率", "economy"),
  nounSpec("die Lohnentwicklung", "die Lohnentwicklungen", "工资发展趋势", "economy"),
  nounSpec("die Vermögensverteilung", "die Vermögensverteilungen", "财富分配", "economy"),
  nounSpec("die Einkommensschere", "die Einkommensscheren", "收入差距", "economy"),
  nounSpec("die Versorgungslage", "die Versorgungslagen", "供应状况；保障状况", "economy"),
  nounSpec("die Planungssicherheit", "meist ohne Plural", "规划确定性", "economy"),
  nounSpec("die Nachfrageentwicklung", "die Nachfrageentwicklungen", "需求走势", "economy"),
  nounSpec("die Standortpolitik", "die Standortpolitiken", "区位政策；产业布局政策", "economy"),
  nounSpec("die Marktregulierung", "die Marktregulierungen", "市场监管", "economy"),
  nounSpec("die Wirtschaftsleistung", "die Wirtschaftsleistungen", "经济产出；经济表现", "economy"),
  nounSpec("der Finanzierungsspielraum", "die Finanzierungsspielräume", "融资空间；财政空间", "economy"),
  nounSpec("die Eigenkapitalquote", "die Eigenkapitalquoten", "资本充足率；权益比率", "economy"),
  nounSpec("die Zahlungsfähigkeit", "meist ohne Plural", "偿付能力", "economy"),
  nounSpec("der Wettbewerbsdruck", "meist ohne Plural", "竞争压力", "economy"),
  nounSpec("die Steuerungswirkung", "die Steuerungswirkungen", "调控作用", "economy"),
  nounSpec("die Verhandlungsmacht", "meist ohne Plural", "议价能力", "economy"),
  nounSpec("die Verteilungswirkung", "die Verteilungswirkungen", "分配效应", "economy"),
  nounSpec("die Branchenstruktur", "die Branchenstrukturen", "行业结构", "economy"),
  nounSpec("die Beschäftigungswirkung", "die Beschäftigungswirkungen", "就业效应", "economy"),
  nounSpec("der Produktivitätszuwachs", "die Produktivitätszuwächse", "生产率增长", "economy"),
  nounSpec("die Kostenstruktur", "die Kostenstrukturen", "成本结构", "economy"),
  nounSpec("die Gewinnmarge", "die Gewinnmargen", "利润率", "economy"),
  nounSpec("die Markteintrittsbarriere", "die Markteintrittsbarrieren", "市场准入壁垒", "economy"),
  nounSpec("die Unternehmensführung", "die Unternehmensführungen", "公司治理；企业管理", "economy"),
  nounSpec("die Arbeitsproduktivität", "meist ohne Plural", "劳动生产率", "economy"),
  nounSpec("die Tarifbindung", "die Tarifbindungen", "集体工资协议覆盖", "economy"),
  nounSpec("die Arbeitsplatzsicherheit", "meist ohne Plural", "就业保障；工作安全", "economy"),
  nounSpec("der Strukturwandel", "die Strukturwandel", "结构转型", "economy"),
  nounSpec("die Wertschöpfungskette", "die Wertschöpfungsketten", "价值链", "economy"),
  nounSpec("die Mittelverwendung", "die Mittelverwendungen", "资金用途", "economy"),
  nounSpec("die Mittelherkunft", "die Mittelherkünfte", "资金来源", "economy"),
  nounSpec("der Liquiditätsengpass", "die Liquiditätsengpässe", "流动性瓶颈", "economy"),

  // Gesellschaft und öffentliche Kommunikation
  nounSpec("die gesellschaftliche Teilhabe", "meist ohne Plural", "社会参与", "civic"),
  nounSpec("die Chancengerechtigkeit", "meist ohne Plural", "机会公平", "civic"),
  nounSpec("die soziale Ungleichheit", "die sozialen Ungleichheiten", "社会不平等", "civic"),
  nounSpec("der gesellschaftliche Zusammenhalt", "meist ohne Plural", "社会凝聚力", "civic"),
  nounSpec("der demografische Wandel", "meist ohne Plural", "人口结构变化", "civic"),
  nounSpec("die Benachteiligung", "die Benachteiligungen", "不利待遇；弱势处境", "civic"),
  nounSpec("die Inklusion", "die Inklusionen", "包容；融合教育", "civic"),
  nounSpec("die Zivilgesellschaft", "die Zivilgesellschaften", "公民社会", "civic"),
  nounSpec("die Meinungsbildung", "die Meinungsbildungen", "意见形成", "civic"),
  nounSpec("die Medienkompetenz", "die Medienkompetenzen", "媒介素养", "civic"),
  nounSpec("der Vertrauensverlust", "die Vertrauensverluste", "信任流失", "civic"),
  nounSpec("die Polarisierung", "die Polarisierungen", "两极分化", "civic"),
  nounSpec("der Wertewandel", "die Wertewandel", "价值观变迁", "civic"),
  nounSpec("die Lebensrealität", "die Lebensrealitäten", "生活现实", "civic"),
  nounSpec("der Handlungsspielraum", "die Handlungsspielräume", "行动空间", "civic"),
  nounSpec("die Selbstwirksamkeit", "meist ohne Plural", "自我效能感", "civic"),
  nounSpec("das Zugehörigkeitsgefühl", "die Zugehörigkeitsgefühle", "归属感", "civic"),
  nounSpec("die Generationengerechtigkeit", "meist ohne Plural", "代际公平", "civic"),
  nounSpec("die Erinnerungskultur", "die Erinnerungskulturen", "纪念文化；历史记忆文化", "culture"),
  nounSpec("die Diskursverschiebung", "die Diskursverschiebungen", "话语转向", "civic"),
  nounSpec("die Deutungshoheit", "die Deutungshoheiten", "解释主导权；话语权", "civic"),
  nounSpec("die öffentliche Wahrnehmung", "die öffentlichen Wahrnehmungen", "公众认知", "civic"),
  nounSpec("die gesellschaftliche Akzeptanz", "meist ohne Plural", "社会接受度", "civic"),
  nounSpec("die Beteiligungsgerechtigkeit", "meist ohne Plural", "参与公平", "civic"),
  nounSpec("die soziale Mobilität", "meist ohne Plural", "社会流动性", "civic"),
  nounSpec("die Bildungsbeteiligung", "die Bildungsbeteiligungen", "教育参与", "civic"),
  nounSpec("die Wohnraumversorgung", "die Wohnraumversorgungen", "住房供给保障", "civic"),
  nounSpec("die Armutsgefährdung", "die Armutsgefährdungen", "贫困风险", "civic"),
  nounSpec("die Integrationsleistung", "die Integrationsleistungen", "融合成效", "civic"),
  nounSpec("die gesellschaftliche Resilienz", "meist ohne Plural", "社会韧性", "civic"),
  nounSpec("die Konfliktfähigkeit", "meist ohne Plural", "处理冲突的能力", "civic"),
  nounSpec("die Kompromissbereitschaft", "meist ohne Plural", "妥协意愿", "civic"),
  nounSpec("die Repräsentationslücke", "die Repräsentationslücken", "代表性缺口", "civic"),
  nounSpec("die Informationsasymmetrie", "die Informationsasymmetrien", "信息不对称", "civic"),
  nounSpec("die digitale Kluft", "die digitalen Klüfte", "数字鸿沟", "civic"),
  nounSpec("die Zugangsbarriere", "die Zugangsbarrieren", "准入障碍；访问壁垒", "civic"),
  nounSpec("die Mehrsprachigkeit", "meist ohne Plural", "多语能力；多语现象", "civic"),
  nounSpec("die Gleichstellungspolitik", "die Gleichstellungspolitiken", "平等政策", "civic"),
  nounSpec("die Sozialverträglichkeit", "meist ohne Plural", "社会可承受性", "civic"),
  nounSpec("die Verteilungsgerechtigkeit", "meist ohne Plural", "分配公平", "civic"),
  nounSpec("die Lebensqualität", "die Lebensqualitäten", "生活质量", "civic"),
  nounSpec("die Daseinsberechtigung", "die Daseinsberechtigungen", "存在合理性；正当性", "civic"),

  // Umwelt, Klima und Infrastruktur
  nounSpec("die Kreislaufwirtschaft", "die Kreislaufwirtschaften", "循环经济", "environment"),
  nounSpec("der Ressourcenverbrauch", "die Ressourcenverbräuche", "资源消耗", "environment"),
  nounSpec("die Emissionsminderung", "die Emissionsminderungen", "减排", "environment"),
  nounSpec("die Klimaanpassung", "die Klimaanpassungen", "气候适应", "environment"),
  nounSpec("die Flächenversiegelung", "die Flächenversiegelungen", "地表硬化；土地封闭", "environment"),
  nounSpec("die Ökosystemleistung", "die Ökosystemleistungen", "生态系统服务", "environment"),
  nounSpec("die Energieeffizienz", "die Energieeffizienzen", "能源效率", "environment"),
  nounSpec("die Versorgungssicherheit", "meist ohne Plural", "供应安全；保障能力", "environment"),
  nounSpec("die Nachhaltigkeitsstrategie", "die Nachhaltigkeitsstrategien", "可持续发展战略", "environment"),
  nounSpec("die Umweltverträglichkeit", "meist ohne Plural", "环境相容性", "environment"),
  nounSpec("die Renaturierung", "die Renaturierungen", "生态修复；恢复自然状态", "environment"),
  nounSpec("das Wassermanagement", "die Wassermanagements", "水资源管理", "environment"),
  nounSpec("die Schadstoffbelastung", "die Schadstoffbelastungen", "污染物负荷", "environment"),
  nounSpec("die Kohlenstoffbilanz", "die Kohlenstoffbilanzen", "碳排放核算；碳足迹", "environment"),
  nounSpec("die Wärmewende", "die Wärmewenden", "供热转型", "environment"),
  nounSpec("die Verkehrswende", "die Verkehrswenden", "交通转型", "environment"),
  nounSpec("die Dekarbonisierung", "die Dekarbonisierungen", "脱碳", "environment"),
  nounSpec("die Klimafolgenanpassung", "die Klimafolgenanpassungen", "气候影响适应", "environment"),
  nounSpec("die Grundwasserneubildung", "die Grundwasserneubildungen", "地下水补给", "environment"),
  nounSpec("der Wasserhaushalt", "die Wasserhaushalte", "水量平衡；水文状况", "environment"),
  nounSpec("die Bodenfruchtbarkeit", "meist ohne Plural", "土壤肥力", "environment"),
  nounSpec("der Flächenverbrauch", "die Flächenverbräuche", "土地占用", "environment"),
  nounSpec("die Siedlungsentwicklung", "die Siedlungsentwicklungen", "聚落发展；城市扩张", "environment"),
  nounSpec("die Anpassungskapazität", "die Anpassungskapazitäten", "适应能力", "environment"),
  nounSpec("die Klimaneutralität", "meist ohne Plural", "气候中和；碳中和", "environment"),
  nounSpec("der Emissionspfad", "die Emissionspfade", "排放路径", "environment"),
  nounSpec("das Minderungsziel", "die Minderungsziele", "减排目标", "environment"),
  nounSpec("die Stoffstromanalyse", "die Stoffstromanalysen", "物质流分析", "environment"),
  nounSpec("die Wiederverwertungsquote", "die Wiederverwertungsquoten", "回收利用率", "environment"),
  nounSpec("die Rohstoffeffizienz", "die Rohstoffeffizienzen", "原材料利用效率", "environment"),
  nounSpec("die Netzstabilität", "meist ohne Plural", "电网稳定性", "environment"),
  nounSpec("die Energiespeicherung", "die Energiespeicherungen", "能源储存", "environment"),
  nounSpec("der Netzausbau", "die Netzausbauten", "电网扩建", "environment"),
  nounSpec("die Lastspitze", "die Lastspitzen", "负荷峰值", "environment"),
  nounSpec("die Wärmeversorgung", "die Wärmeversorgungen", "供热保障", "environment"),
  nounSpec("die Flächenkonkurrenz", "die Flächenkonkurrenzen", "土地用途竞争", "environment"),
  nounSpec("der Nutzungskonflikt", "die Nutzungskonflikte", "使用冲突；土地用途冲突", "environment"),
  nounSpec("die Umweltfolgekosten", "nur Plural", "环境后续成本", "environment"),
  nounSpec("die Vorsorgeplanung", "die Vorsorgeplanungen", "预防性规划", "environment"),
  nounSpec("die Klimarisikoanalyse", "die Klimarisikoanalysen", "气候风险分析", "environment"),

  // Digitalisierung, Daten und Technik
  nounSpec("die Datenintegrität", "meist ohne Plural", "数据完整性", "technology"),
  nounSpec("die Skalierbarkeit", "meist ohne Plural", "可扩展性", "technology"),
  nounSpec("die Zugriffskontrolle", "die Zugriffskontrollen", "访问控制", "technology"),
  nounSpec("die Fehlertoleranz", "die Fehlertoleranzen", "容错能力", "technology"),
  nounSpec("die Rechenleistung", "die Rechenleistungen", "计算能力", "technology"),
  nounSpec("der Automatisierungsgrad", "die Automatisierungsgrade", "自动化程度", "technology"),
  nounSpec("die Interoperabilität", "meist ohne Plural", "互操作性", "technology"),
  nounSpec("die Datenmodellierung", "die Datenmodellierungen", "数据建模", "technology"),
  nounSpec("der Trainingsdatensatz", "die Trainingsdatensätze", "训练数据集", "technology"),
  nounSpec("die algorithmische Verzerrung", "die algorithmischen Verzerrungen", "算法偏差", "technology"),
  nounSpec("die Datenschutzfolgenabschätzung", "die Datenschutzfolgenabschätzungen", "数据保护影响评估", "technology"),
  nounSpec("die Systemarchitektur", "die Systemarchitekturen", "系统架构", "technology"),
  nounSpec("die Protokollierung", "die Protokollierungen", "日志记录；过程记录", "technology"),
  nounSpec("der Datenbestand", "die Datenbestände", "数据存量；数据库内容", "technology"),
  nounSpec("die Datenhoheit", "meist ohne Plural", "数据主权；数据控制权", "technology"),
  nounSpec("die Datenminimierung", "die Datenminimierungen", "数据最小化", "technology"),
  nounSpec("die Zweckbindung", "die Zweckbindungen", "用途限定原则", "technology"),
  nounSpec("die Angriffsschnittstelle", "die Angriffsschnittstellen", "攻击面；攻击接口", "technology"),
  nounSpec("die Sicherheitslücke", "die Sicherheitslücken", "安全漏洞", "technology"),
  nounSpec("die Ausfallsicherheit", "meist ohne Plural", "故障安全性；高可用性", "technology"),
  nounSpec("die Datenredundanz", "die Datenredundanzen", "数据冗余", "technology"),
  nounSpec("die Versionskontrolle", "die Versionskontrollen", "版本控制", "technology"),
  nounSpec("die Rückwärtskompatibilität", "meist ohne Plural", "向后兼容性", "technology"),
  nounSpec("die Berechtigungsstruktur", "die Berechtigungsstrukturen", "权限结构", "technology"),
  nounSpec("die Datenübertragbarkeit", "meist ohne Plural", "数据可移植性", "technology"),
  nounSpec("die Nachweisbarkeit", "meist ohne Plural", "可证明性；可查证性", "technology"),
  nounSpec("der Anwendungsfall", "die Anwendungsfälle", "用例；应用场景", "technology"),
  nounSpec("die Schnittstellendokumentation", "die Schnittstellendokumentationen", "接口文档", "technology"),
  nounSpec("die Modelltransparenz", "meist ohne Plural", "模型透明度", "technology"),
  nounSpec("die Erklärbarkeit", "meist ohne Plural", "可解释性", "technology"),
  nounSpec("die Datenqualität", "die Datenqualitäten", "数据质量", "technology"),
  nounSpec("die Erkennungsrate", "die Erkennungsraten", "识别率", "technology"),
  nounSpec("die Falschpositivrate", "die Falschpositivraten", "误报率；假阳性率", "technology"),
  nounSpec("die Reaktionszeit", "die Reaktionszeiten", "响应时间", "technology"),
  nounSpec("die Systemlast", "die Systemlasten", "系统负载", "technology"),
  nounSpec("die Speicherkapazität", "die Speicherkapazitäten", "存储容量", "technology"),
  nounSpec("die Datenkonsistenz", "meist ohne Plural", "数据一致性", "technology"),
  nounSpec("die Fehlerbehandlung", "die Fehlerbehandlungen", "错误处理", "technology"),
  nounSpec("der Wiederherstellungspunkt", "die Wiederherstellungspunkte", "恢复点", "technology"),
  nounSpec("die Bedrohungsanalyse", "die Bedrohungsanalysen", "威胁分析", "technology"),

  // Medizin und Gesundheitsversorgung
  nounSpec("die Prävalenz", "die Prävalenzen", "患病率；流行率", "health"),
  nounSpec("die Inzidenz", "die Inzidenzen", "发病率；发生率", "health"),
  nounSpec("die Diagnostik", "die Diagnostiken", "诊断学；诊断流程", "health"),
  nounSpec("die Symptomatik", "die Symptomatiken", "症状表现", "health"),
  nounSpec("der Krankheitsverlauf", "die Krankheitsverläufe", "病程", "health"),
  nounSpec("die Therapietreue", "meist ohne Plural", "治疗依从性", "health"),
  nounSpec("die Wirksamkeitsprüfung", "die Wirksamkeitsprüfungen", "疗效检验", "health"),
  nounSpec("die Versorgungslücke", "die Versorgungslücken", "医疗服务缺口", "health"),
  nounSpec("die Früherkennung", "die Früherkennungen", "早期筛查；早期发现", "health"),
  nounSpec("der Risikofaktor", "die Risikofaktoren", "风险因素", "health"),
  nounSpec("die Immunantwort", "die Immunantworten", "免疫反应", "health"),
  nounSpec("der Genesungsverlauf", "die Genesungsverläufe", "康复过程", "health"),
  nounSpec("die Langzeitfolge", "die Langzeitfolgen", "长期后果；后遗症", "health"),
  nounSpec("die Indikation", "die Indikationen", "适应证", "health"),
  nounSpec("die Kontraindikation", "die Kontraindikationen", "禁忌证", "health"),
  nounSpec("die Dosierung", "die Dosierungen", "剂量；给药方案", "health"),
  nounSpec("der Behandlungsstandard", "die Behandlungsstandards", "治疗标准", "health"),
  nounSpec("die Patientensicherheit", "meist ohne Plural", "患者安全", "health"),
  nounSpec("die Versorgungsqualität", "die Versorgungsqualitäten", "医疗服务质量", "health"),
  nounSpec("die Überlebensrate", "die Überlebensraten", "生存率", "health"),
  nounSpec("die Rückfallquote", "die Rückfallquoten", "复发率", "health"),
  nounSpec("die Nebenwirkungsrate", "die Nebenwirkungsraten", "不良反应率", "health"),
  nounSpec("die Therapiewahl", "die Therapiewahlen", "治疗方案选择", "health"),
  nounSpec("die Verlaufsbeobachtung", "die Verlaufsbeobachtungen", "病程观察", "health"),
  nounSpec("die Gesundheitskompetenz", "die Gesundheitskompetenzen", "健康素养", "health"),
  nounSpec("die Versorgungsforschung", "meist ohne Plural", "卫生服务研究", "health"),
  nounSpec("die Arzneimittelsicherheit", "meist ohne Plural", "药物安全", "health"),
  nounSpec("die Nutzenbewertung", "die Nutzenbewertungen", "效益评估；医疗价值评估", "health"),
  nounSpec("die Risikostratifizierung", "die Risikostratifizierungen", "风险分层", "health"),
  nounSpec("die Leitlinienempfehlung", "die Leitlinienempfehlungen", "指南建议", "health"),
  nounSpec("die Einwilligungsfähigkeit", "meist ohne Plural", "知情同意能力", "health"),
  nounSpec("die Behandlungskontinuität", "meist ohne Plural", "治疗连续性", "health"),
  nounSpec("die Versorgungskapazität", "die Versorgungskapazitäten", "医疗服务承载能力", "health"),
  nounSpec("die Präventionsmaßnahme", "die Präventionsmaßnahmen", "预防措施", "health"),
  nounSpec("die Bevölkerungsmedizin", "meist ohne Plural", "人口健康医学", "health"),

  // Sprache, Kultur und Medien
  nounSpec("die Erzählperspektive", "die Erzählperspektiven", "叙事视角", "culture"),
  nounSpec("die Mehrdeutigkeit", "die Mehrdeutigkeiten", "多义性；含混性", "culture"),
  nounSpec("der Sprachgebrauch", "die Sprachgebräuche", "语言使用；惯用法", "culture"),
  nounSpec("der Bedeutungswandel", "die Bedeutungswandel", "语义演变", "culture"),
  nounSpec("die Rezeptionsgeschichte", "die Rezeptionsgeschichten", "接受史", "culture"),
  nounSpec("die Inszenierungsweise", "die Inszenierungsweisen", "舞台呈现方式；建构方式", "culture"),
  nounSpec("die Darstellungsweise", "die Darstellungsweisen", "表现方式；呈现方式", "culture"),
  nounSpec("das Stilmittel", "die Stilmittel", "修辞手法；表现手法", "culture"),
  nounSpec("die Überlieferung", "die Überlieferungen", "传承；史料传统", "culture"),
  nounSpec("der Gegenwartsbezug", "die Gegenwartsbezüge", "现实关联；当代意义", "culture"),
  nounSpec("der Interpretationsspielraum", "die Interpretationsspielräume", "解释空间", "culture"),
  nounSpec("die Motivik", "die Motiviken", "主题意象体系；母题结构", "culture"),
  nounSpec("das Narrativ", "die Narrative", "叙事框架；故事模式", "culture"),
  nounSpec("der Werkkontext", "die Werkkontexte", "作品语境", "culture"),
  nounSpec("das kulturelle Gedächtnis", "die kulturellen Gedächtnisse", "文化记忆", "culture"),
  nounSpec("die Quelleninterpretation", "die Quelleninterpretationen", "资料解读；史料阐释", "culture"),
  nounSpec("die Bedeutungsnuance", "die Bedeutungsnuancen", "意义细微差别", "culture"),
  nounSpec("die Sprachvariation", "die Sprachvariationen", "语言变体", "culture"),
  nounSpec("die Registerwahl", "die Registerwahlen", "语体选择", "culture"),
  nounSpec("die Argumentationsstruktur", "die Argumentationsstrukturen", "论证结构", "culture"),
  nounSpec("die Textkohärenz", "meist ohne Plural", "文本连贯性", "culture"),
  nounSpec("die Erzählhaltung", "die Erzählhaltungen", "叙述立场", "culture"),
  nounSpec("die Figurenkonstellation", "die Figurenkonstellationen", "人物关系结构", "culture"),
  nounSpec("die Bildsprache", "die Bildsprachen", "视觉语言；意象表达", "culture"),
  nounSpec("die Medienwirkung", "die Medienwirkungen", "媒体效应", "culture"),
  nounSpec("die Berichterstattungspraxis", "die Berichterstattungspraktiken", "报道实践", "culture"),
  nounSpec("die Quellenvielfalt", "meist ohne Plural", "信息来源多样性", "culture"),
  nounSpec("die redaktionelle Unabhängigkeit", "meist ohne Plural", "编辑独立性", "culture"),
  nounSpec("die Nachrichtenbewertung", "die Nachrichtenbewertungen", "新闻价值判断", "culture"),
  nounSpec("die Kontextualisierung", "die Kontextualisierungen", "语境化；背景说明", "culture"),
  nounSpec("die Bedeutungsverschiebung", "die Bedeutungsverschiebungen", "语义偏移", "culture"),
  nounSpec("die kulturelle Aneignung", "die kulturellen Aneignungen", "文化挪用；文化吸收", "culture"),
  nounSpec("die Aufführungspraxis", "die Aufführungspraktiken", "演出实践", "culture"),
  nounSpec("die Werkrezeption", "die Werkrezeptionen", "作品接受", "culture"),
  nounSpec("der Öffentlichkeitseffekt", "die Öffentlichkeitseffekte", "公共传播效应", "culture"),
];
const REPLACEMENT_BY_TERM = new Map(
  REPLACEMENTS.map((entry) => [entry.term, entry]),
);

const EXACT_CORRECTIONS = {
  "der Vorsitzender": {
    term: "der Vorsitzende",
    forms: "der Vorsitzende · die Vorsitzenden",
    typeCode: "nm",
    meaning: "主席；负责人",
    example: "Der Vorsitzende fasste die Ergebnisse der Sitzung zusammen.",
    exampleZh: "主席总结了会议结果。",
  },
  "der Verdächtiger": {
    term: "der Verdächtige",
    forms: "der Verdächtige · die Verdächtigen",
    typeCode: "nm",
    meaning: "嫌疑人",
    example: "Der Verdächtige machte von seinem Aussageverweigerungsrecht Gebrauch.",
    exampleZh: "嫌疑人行使了拒绝陈述的权利。",
  },
  "der Kranker": {
    term: "der Kranke",
    forms: "der Kranke · die Kranken",
    typeCode: "nm",
    meaning: "病人；患者",
    example: "Der Kranke wurde nach der Untersuchung stationär aufgenommen.",
    exampleZh: "患者检查后被收入院治疗。",
  },
  "der Krimineller": {
    term: "der Kriminelle",
    forms: "der Kriminelle · die Kriminellen",
    typeCode: "nm",
    meaning: "罪犯；犯罪分子",
    example: "Der Kriminelle wurde aufgrund eindeutiger Beweise verurteilt.",
    exampleZh: "罪犯因证据确凿而被判刑。",
  },
  "der Bekannter": {
    term: "der Bekannte",
    forms: "der Bekannte · die Bekannten",
    typeCode: "nm",
    meaning: "熟人",
    example: "Ein Bekannter vermittelte den Kontakt zur Forschungsgruppe.",
    exampleZh: "一位熟人帮助联系上了研究小组。",
  },
  "der Marsch": {
    term: "der Marsch",
    forms: "der Marsch · die Märsche",
    typeCode: "nm",
    meaning: "行进；进行曲",
    example: "Der feierliche Marsch eröffnete die staatliche Zeremonie.",
    exampleZh: "庄严的进行曲拉开了国家典礼的序幕。",
  },
  "das Zimt": {
    term: "der Zimt",
    forms: "der Zimt · meist ohne Plural",
    typeCode: "nm",
    meaning: "肉桂；桂皮",
    example: "Der charakteristische Duft des Zimts entsteht durch ätherische Öle.",
    exampleZh: "肉桂特有的香气来自精油。",
  },
  "das Ostern": {
    term: "Ostern",
    forms: "Ostern · ohne Artikel",
    typeCode: "prop",
    meaning: "复活节",
    example: "Ostern fällt jedes Jahr auf ein anderes Datum.",
    exampleZh: "复活节每年的日期不同。",
  },
};

const MEANING_CORRECTIONS = {
  "die Erziehung": "教育；教养",
  stehenbleiben: "停下；停止运转",
  "der Vorsprung": "领先优势；突出部",
  zukommen: "走近；归于；应得；被送达",
  verziehen: "搬走；歪曲；宠坏",
  herrschen: "统治；盛行；占主导",
  "der Höhepunkt": "高潮；顶点",
  veröffentlichen: "发表；出版；公布",
  "die Region": "地区；区域",
  geübt: "熟练的；训练有素的",
  "die Galerie": "画廊；楼座；长廊",
  gewähren: "准许；给予；保障",
  "der Schwindel": "眩晕；欺骗",
  kriechen: "爬行；匍匐",
  beängstigend: "令人害怕的；令人担忧的",
  "die Frequenz": "频率；出现频度",
  aufklären: "澄清；启蒙；侦破",
  unauffällig: "不显眼的；低调的",
  "die Philosophie": "哲学；理念",
  fällig: "到期的；应支付的",
  vornehmen: "进行；着手；打算",
  "der Sumpf": "沼泽；泥潭",
  wehen: "吹；飘动",
  "die Niere": "肾脏",
  "die Ironie": "反讽；讽刺意味",
  ausnutzen: "利用；占便宜；剥削",
  "die Körperverletzung": "人身伤害；故意伤害罪",
  "die Mischung": "混合物；混合",
  "der Schwung": "冲劲；势头；摆动",
  beherrscht: "镇定的；克制的",
  "die Hülle": "外壳；封套；包裹层",
  "die Spende": "捐赠；捐款",
  "das Leuchten": "光亮；发光",
  leuchten: "发光；照亮",
  "die Herrschaft": "统治；支配；统治权",
  unverzüglich: "立即；毫不迟延地",
  ursprünglich: "原来的；最初的；本来的",
  "die Empfehlung": "推荐；建议",
  billigen: "批准；赞同",
  belasten: "使负担；使承压；指控",
  zutiefst: "极其；深深地",
  "die Angestellte": "女职员；女雇员",
  bewundern: "钦佩；欣赏",
  "der Samen": "种子；精子",
  wegfahren: "驾车离开；乘车离开",
  abstellen: "停放；关掉；消除",
  erschlagen: "打死；使不知所措",
  "der Umgang": "交往；处理方式；使用",
  "der Hausarrest": "居家禁闭；软禁",
  weichen: "退让；避开；消退",
  "der Trieb": "驱动力；冲动；嫩芽",
  bewirken: "促成；引起",
  "der Gegenstand": "物体；对象；议题",
  "der Drang": "强烈愿望；冲动",
  "die Masse": "大量；群众；质量",
  "die Abstimmung": "表决；协调；调音",
  "der Bon": "收据；小票",
  "die Ähnlichkeit": "相似性；相似之处",
  "die Beschwerde": "投诉；抱怨；不适",
  erregen: "引起；激起",
  fortsetzen: "继续；延续",
  "die Initiative": "倡议；主动性",
  "der Vorwand": "借口；托词",
  eintreffen: "到达；抵达",
  "die Beobachtung": "观察；观测",
  ansprechen: "提及；吸引；与人交谈",
  fortfahren: "继续；接着做",
  "die Pflege": "护理；照料；维护",
  "die Wahrscheinlichkeit": "概率；可能性",
  "die Nachfrage": "需求；询问",
  "der Eigentümer": "所有者；业主",
  "die Erleichterung": "缓解；如释重负",
  "das Niveau": "水平；层次",
  "der Arbeitgeber": "雇主",
  "der Eingriff": "干预；手术",
  "die Anordnung": "命令；排列；布置",
  "die Zuflucht": "避难处；庇护",
  "der Arbeitsplatz": "工作岗位；工作场所",
  "die Fortsetzung": "继续；续篇",
  "das Archiv": "档案馆；档案库",
  "die Hingabe": "奉献；投入",
  "der Bonus": "奖金；额外优惠",
  "die Erfüllung": "履行；实现；满足",
  "die Anpassung": "调整；适应",
  "der Erzähler": "叙述者；讲述者",
  "der Großteil": "大部分",
  "das Potenzial": "潜力；潜能",
  "die Substanz": "物质；实质",
  "die Vorschrift": "规定；规章",
  "die Umwelt": "环境；周边世界",
  bearbeiten: "处理；编辑；加工",
  "der Aufstieg": "上升；晋升；登顶",
  "die Verpflichtung": "义务；承诺",
  "die Übergabe": "移交；交接",
  "die Verfolgung": "追踪；迫害；追诉",
  "das Exemplar": "样本；册；件",
  "der Pakt": "协定；盟约",
  "der Bund": "联盟；联邦；束",
  "die Belästigung": "骚扰；滋扰",
  provozieren: "挑衅；引发",
  "die Partnerschaft": "伙伴关系；合作关系",
  "die Kooperation": "合作；协作",
  "die Vorgehensweise": "做法；处理方式",
  "der Komplex": "综合体；建筑群；情结",
  "die Nebenwirkung": "副作用",
  "die Zensur": "审查；评分",
  "die Vorsorge": "预防；预先保障",
  "die Sanktion": "制裁；批准",
  marginal: "边缘的；微小的",
  "die Antithese": "对立命题；反题",
  empirisch: "实证的；经验性的",
  differenzieren: "区分；细分；区别对待",
  standardisieren: "标准化",
  "die Abstraktion": "抽象；抽象概念",
  abstrahieren: "抽象概括；撇开",
  klassifizieren: "分类；分级",
  akkreditieren: "认证；正式认可",
  kategorisieren: "归类；分类",
  "das Artensterben": "物种灭绝",
  priorisieren: "优先处理；确定优先级",
  polarisieren: "使两极分化；引发对立",
  evaluieren: "评估；评价",
  implementieren: "实施；实现",
  substituieren: "替代；代换",
  analytisch: "分析性的",
  strukturell: "结构性的",
  adaptieren: "改编；调整以适应",
  regressiv: "回归的；退行的",
  relativieren: "使相对化；限制其绝对性",
  "die Evidenz": "证据；明显性",
  "der Indikator": "指标；指示物",
  "die Verfassung": "宪法；状态",
  "die Klage": "诉讼；抱怨；哀叹",
  "der Prozess": "过程；程序；诉讼",
  "die Realität": "现实；实际情况",
  "die Fabrik": "工厂",
  "der Verkauf": "销售；出售",
  "das Steuer": "方向盘；舵",
  "die Kaution": "保证金；保释金",
  "die Summe": "总和；金额",
  "die Oberfläche": "表面；界面",
  "die Persönlichkeit": "人格；个性；重要人物",
  "der Kredit": "贷款；信用",
  "der Experte": "专家",
  "die Rente": "养老金；退休金",
  "die Bedingung": "条件",
  "der Umschlag": "信封；封套；周转",
  "die Staatsbürgerschaft": "国籍；公民身份",
  "der Import": "进口；导入",
  "die Verschmutzung": "污染；弄脏",
  "der Verbrauch": "消耗；消费量",
  "die Kontrolle": "检查；控制",
  "das Menschenrecht": "人权",
  "der Richter": "法官",
  "die Botschaft": "信息；使馆；寓意",
  "das Urteil": "判决；评价",
  "die Affäre": "事件；丑闻；婚外情",
  "die Aussicht": "景色；前景；可能性",
  "der Betrug": "欺诈；骗局",
  "der Einbruch": "入室盗窃；骤降；侵入",
  "die Mannschaft": "队伍；团队",
  "das Vergehen": "违法行为；过错",
  "die Produktion": "生产；制作；产量",
  "die Annahme": "假设；接受；受理",
  "die Berufung": "上诉；任命；使命",
  "die Abwechslung": "变化；调剂",
  "der Ausbruch": "爆发；逃脱；喷发",
  "die Kapelle": "小教堂；乐团",
  "die Dimension": "维度；规模",
  "die Stiftung": "基金会；捐赠；创立",
  "der Haushalt": "家庭；家务；预算",
  "die Debatte": "辩论；讨论",
  "die Rückseite": "背面；后侧",
  "die Struktur": "结构；组织方式",
  "die Perspektive": "视角；前景；透视",
  "die Justiz": "司法；司法机关",
  kritisch: "批判性的；关键的；危急的",
  "die Grundlage": "基础；依据",
  "der Rechtsanwalt": "律师",
  "der Ratschlag": "建议；忠告",
  intensiv: "密集的；强烈的；深入的",
  "der Defekt": "缺陷；故障",
  erschüttert: "震惊的；动摇的",
  bestechen: "行贿；以魅力打动",
  "die Eröffnung": "开幕；开业；开启",
  "das Streben": "追求；努力",
  "der Auslöser": "触发因素；诱因；扳机",
  "die Kündigung": "解约；辞职；解雇通知",
  "der Entzug": "剥夺；戒断；撤销",
  bezeugen: "证明；作证",
  "die Vermittlung": "调解；传授；中介",
  erreichbar: "可到达的；可联系的",
  "der Vorwurf": "指责；指控",
  schlachten: "屠宰",
  köpfen: "斩首；剪去顶端",
  einatmen: "吸入",
  zurückhalten: "克制；扣留；隐瞒",
  schlampen: "草率行事；敷衍",
  hinweisen: "指出；提醒",
  zusammenhalten: "团结；把……固定在一起",
  vermasseln: "搞砸",
  nachkommen: "履行；跟随；随后到来",
  durchkommen: "通过；抵达；联系上",
  klirren: "发出清脆的碰撞声",
  versauen: "弄脏；搞砸",
  kreisen: "盘旋；围绕；循环",
  anhängen: "附上；依恋；追随",
  erstatten: "退还；报告",
  verarbeiten: "加工；处理；消化",
  widmen: "献给；致力于",
  genügen: "足够；满足要求",
  rauschen: "沙沙作响；奔流",
  überbringen: "转交；传达",
  beschleunigen: "加速；促进",
  trauern: "哀悼；悲伤",
  trommeln: "击鼓；召集",
  schwingen: "摆动；挥动；振荡",
  aufschreiben: "写下；记录",
  einpacken: "包装；收拾",
  gedenken: "纪念；打算",
  hüten: "看护；提防",
  einschlagen: "砸入；选择；产生反响",
  klarkommen: "应付；相处；弄明白",
  reinlassen: "让……进来",
  erstellen: "制作；编制；创建",
  herbringen: "带来",
  korrigieren: "纠正；批改",
  zünden: "点燃；引爆；奏效",
  ausdenken: "想出；构思",
  auspacken: "拆开包装；拿出来",
  wiedergutmachen: "弥补；补偿",
  eingreifen: "干预；介入",
  austauschen: "更换；交换；交流",
  wegbringen: "带走；运走",
  durchatmen: "深呼吸；缓一口气",
  finanzieren: "为……提供资金；筹资",
  vergrößern: "扩大；放大",
  vorwerfen: "责备；指控；投掷到前方",
  bevorzugen: "更喜欢；优先选择",
  profitieren: "受益；获利",
  provozieren: "挑衅；引发",
  anrichten: "造成；摆盘；布置",
  herumlaufen: "四处走动",
  aufwecken: "叫醒；唤起",
  vermitteln: "传授；调解；介绍；促成",
  abschreiben: "抄写；抄袭；核销",
  transformieren: "转变；变换",
  anleiten: "指导；带领",
  zertifizieren: "认证",
  legitimieren: "使合法；证明正当性",
  schulden: "欠；归因于",
  auftauchen: "出现；浮出水面",
  verlegen: "放错；铺设；出版",
  bescheiden: "裁定；通知",
  zuschlagen: "猛击；关上；出手购买",
  abkommen: "偏离；脱离；达成协议",
  angeben: "说明；标明；炫耀",
  scannen: "扫描",
  ausflippen: "情绪失控；大发脾气",
  schluchzen: "抽泣",
  bedrohen: "威胁；危及",
};

const EXAMPLE_CORRECTIONS = {
  gewähren: ["Das Gericht gewährte dem Kläger vorläufigen Rechtsschutz.", "法院给予原告临时法律保护。"],
  evakuieren: ["Die Behörden evakuierten das gefährdete Gebiet vorsorglich.", "主管部门出于预防目的疏散了危险地区。"],
  ausnutzen: ["Ein Unternehmen darf seine marktbeherrschende Stellung nicht ausnutzen.", "企业不得滥用其市场支配地位。"],
  leuchten: ["Bei genauer Analyse leuchten die Zusammenhänge unmittelbar ein.", "经过仔细分析，这些关联便显得一目了然。"],
  verheimlichen: ["Der Bericht wirft der Leitung vor, wichtige Risiken verheimlicht zu haben.", "报告指责管理层隐瞒了重要风险。"],
  billigen: ["Das Parlament billigte den Entwurf mit knapper Mehrheit.", "议会以微弱多数批准了草案。"],
  unterzeichnen: ["Beide Staaten unterzeichneten ein Abkommen zur Forschungskooperation.", "两国签署了一项科研合作协议。"],
  belasten: ["Die steigenden Energiekosten belasten vor allem kleine Betriebe.", "不断上涨的能源成本主要给小企业带来负担。"],
  schlachten: ["In zertifizierten Betrieben dürfen Tiere nur unter strengen Auflagen geschlachtet werden.", "在获得认证的企业中，动物只能在严格规定下被屠宰。"],
  köpfen: ["Der Gärtner köpfte die verblühten Triebe, damit die Pflanze neu austreibt.", "园丁剪去了凋谢枝条的顶端，以便植物重新发芽。"],
  einatmen: ["Beschäftigte dürfen die giftigen Dämpfe keinesfalls einatmen.", "员工绝不能吸入有毒蒸气。"],
  zurückhalten: ["Die Behörde hielt den Bericht bis zum Abschluss der Prüfung zurück.", "主管部门在审查结束前扣留了该报告。"],
  schlampen: ["Bei der Dokumentation sicherheitsrelevanter Daten darf niemand schlampen.", "记录安全相关数据时，任何人都不能敷衍。"],
  wegfahren: ["Nach der Konferenz fuhren die Delegationen am selben Abend weg.", "会议结束后，各代表团当晚离开。"],
  erschlagen: ["Die Vielzahl widersprüchlicher Vorgaben erschlägt viele kleine Betriebe.", "大量相互矛盾的规定让许多小企业难以招架。"],
  hinweisen: ["Die Gutachter weisen auf erhebliche methodische Schwächen hin.", "评审专家指出了严重的方法缺陷。"],
  zusammenhalten: ["Gemeinsame Ziele können eine vielfältige Gesellschaft zusammenhalten.", "共同目标能够凝聚一个多元社会。"],
  vermasseln: ["Unklare Zuständigkeiten können die Umsetzung der Reform vermasseln.", "职责不清可能会搞砸改革的落实。"],
  weichen: ["Nach langen Verhandlungen wich die anfängliche Skepsis vorsichtigem Optimismus.", "经过长时间谈判，最初的怀疑逐渐让位于谨慎乐观。"],
  nachkommen: ["Die Behörde muss ihrer gesetzlichen Auskunftspflicht nachkommen.", "主管部门必须履行法定的信息公开义务。"],
  durchkommen: ["Der Änderungsantrag kam im Ausschuss mit knapper Mehrheit durch.", "修正案在委员会以微弱多数获得通过。"],
  klirren: ["Bei der Materialprüfung klirrten die Metallteile deutlich hörbar.", "材料测试时，金属部件发出了清晰可闻的碰撞声。"],
  versauen: ["Fehlerhafte Metadaten können eine gesamte Auswertung versauen.", "错误的元数据可能会搞砸整项分析。"],
  kreisen: ["Die Debatte kreist seit Monaten um dieselbe Grundsatzfrage.", "这场辩论数月来一直围绕同一个原则性问题展开。"],
  anhängen: ["Dem Antrag sind sämtliche Nachweise digital anzuhängen.", "申请材料必须附上所有电子证明。"],
  erstatten: ["Der Arbeitgeber erstattet die nachgewiesenen Reisekosten vollständig.", "雇主会全额报销有凭证的差旅费。"],
  verarbeiten: ["Das System verarbeitet große Datenmengen in nahezu Echtzeit.", "该系统几乎可以实时处理大规模数据。"],
  widmen: ["Die Studie widmet dem Datenschutz ein eigenes Kapitel.", "该研究用一个单独章节讨论数据保护。"],
  genügen: ["Eine bloße Vermutung genügt nicht als wissenschaftlicher Beleg.", "单纯的猜测不足以作为科学证据。"],
  rauschen: ["In den Messdaten rauscht das Signal stärker als erwartet.", "测量数据中的信号噪声比预期更强。"],
  überbringen: ["Die Vermittlerin überbrachte beiden Seiten einen neuen Kompromissvorschlag.", "调解人向双方转达了一项新的妥协方案。"],
  beschleunigen: ["Digitale Verfahren können die Bearbeitung von Anträgen erheblich beschleunigen.", "数字化流程能够显著加快申请处理。"],
  trauern: ["Die Gesellschaft trauert um die Opfer der Naturkatastrophe.", "社会各界哀悼自然灾害中的遇难者。"],
  erregen: ["Die Veröffentlichung erregte international große Aufmerksamkeit.", "这次发布在国际上引起了广泛关注。"],
  trommeln: ["Die Initiative trommelte in kurzer Zeit zahlreiche Unterstützer zusammen.", "该倡议在短时间内召集了许多支持者。"],
  schwingen: ["Das Pendel schwingt unter idealen Bedingungen regelmäßig.", "在理想条件下，摆锤会有规律地摆动。"],
  eintreffen: ["Die vollständigen Messdaten trafen erst nach Redaktionsschluss ein.", "完整的测量数据直到截稿后才送达。"],
  aufschreiben: ["Die Forschenden schrieben sämtliche Beobachtungen unmittelbar auf.", "研究人员立即记录了所有观察结果。"],
  einpacken: ["Empfindliche Proben müssen luftdicht eingepackt werden.", "敏感样本必须密封包装。"],
  gedenken: ["Am Jahrestag gedachte das Parlament der Opfer des Anschlags.", "议会在周年纪念日悼念了袭击事件的遇难者。"],
  hüten: ["Unabhängige Gerichte hüten die verfassungsmäßige Ordnung.", "独立法院守护宪政秩序。"],
  einschlagen: ["Die Regierung schlug in der Energiepolitik einen neuen Kurs ein.", "政府在能源政策上采取了新的路线。"],
  klarkommen: ["Kleine Kommunen kommen mit den zusätzlichen Berichtspflichten kaum klar.", "小型市镇几乎无法应付新增的报告义务。"],
  reinlassen: ["Nur autorisierte Personen werden in den Sicherheitsbereich reingelassen.", "只有获得授权的人才能进入安全区域。"],
  erstellen: ["Das Institut erstellte eine unabhängige Folgenabschätzung.", "该研究所编制了一份独立的影响评估。"],
  herbringen: ["Die Umstellung brachte erhebliche Effizienzgewinne her.", "这次转型带来了显著的效率提升。"],
  korrigieren: ["Die Behörde korrigierte die fehlerhafte Statistik öffentlich.", "主管部门公开更正了错误的统计数据。"],
  zünden: ["Das neue Förderinstrument zündete erst nach mehreren Anpassungen.", "这项新的资助工具经过多次调整后才开始奏效。"],
  ausdenken: ["Das Forschungsteam dachte sich ein robustes Prüfverfahren aus.", "研究团队构思出了一套稳健的检验方法。"],
  auspacken: ["Die Proben dürfen erst im sterilen Labor ausgepackt werden.", "样本只能在无菌实验室中拆封。"],
  wiedergutmachen: ["Finanzielle Hilfe kann den entstandenen Vertrauensverlust nicht vollständig wiedergutmachen.", "经济援助无法完全弥补已经造成的信任损失。"],
  eingreifen: ["Die Aufsichtsbehörde griff wegen akuter Sicherheitsmängel ein.", "监管机构因严重安全缺陷而介入。"],
  austauschen: ["Die Fachleute tauschten Erfahrungen über wirksame Präventionsstrategien aus.", "专家们交流了有效预防策略方面的经验。"],
  bearbeiten: ["Ein interdisziplinäres Team bearbeitet die komplexe Fragestellung gemeinsam.", "一个跨学科团队共同处理这一复杂问题。"],
  wegbringen: ["Spezialfirmen bringen die belasteten Materialien sicher weg.", "专业公司会安全运走受污染的材料。"],
  durchatmen: ["Nach der vorläufigen Einigung konnten beide Seiten zunächst durchatmen.", "达成初步协议后，双方暂时松了一口气。"],
  finanzieren: ["Der Forschungsverbund wird überwiegend aus öffentlichen Mitteln finanziert.", "该科研联盟主要由公共资金资助。"],
  vergrößern: ["Die neue Regelung könnte die soziale Ungleichheit weiter vergrößern.", "新规可能会进一步扩大社会不平等。"],
  vorwerfen: ["Die Opposition wirft der Regierung mangelnde Transparenz vor.", "反对党指责政府缺乏透明度。"],
  bevorzugen: ["Viele Fachleute bevorzugen eine schrittweise Umsetzung der Reform.", "许多专家更倾向于分阶段实施改革。"],
  profitieren: ["Von der besseren Infrastruktur profitieren vor allem ländliche Regionen.", "改善后的基础设施主要使农村地区受益。"],
  provozieren: ["Die zugespitzte Formulierung provozierte heftigen Widerspruch.", "尖锐的措辞引发了强烈反对。"],
  anrichten: ["Unzureichend gesicherte Daten können erheblichen wirtschaftlichen Schaden anrichten.", "保护不足的数据可能造成重大经济损失。"],
  herumlaufen: ["Während des Experiments durfte niemand unkontrolliert im Labor herumlaufen.", "实验期间，任何人都不得在实验室内随意走动。"],
  aufwecken: ["Die Krise weckte ein neues Bewusstsein für systemische Risiken auf.", "这场危机唤起了人们对系统性风险的新认识。"],
  vermitteln: ["Die Grafik vermittelt einen präzisen Überblick über die Entwicklung.", "这张图准确概括了发展趋势。"],
  abschreiben: ["Die Bank schrieb den uneinbringlichen Kredit vollständig ab.", "银行将无法收回的贷款全部核销。"],
  transformieren: ["Digitale Technologien transformieren ganze Wertschöpfungsketten.", "数字技术正在重塑整条价值链。"],
  differenzieren: ["Die Analyse differenziert zwischen kurzfristigen und strukturellen Effekten.", "该分析区分了短期效应与结构性效应。"],
  anleiten: ["Erfahrene Fachkräfte leiten die neuen Mitarbeitenden systematisch an.", "经验丰富的专业人员会系统指导新员工。"],
  standardisieren: ["Die Arbeitsgruppe standardisierte die Erhebung in allen Regionen.", "工作组统一了所有地区的数据采集标准。"],
  zertifizieren: ["Eine unabhängige Stelle zertifiziert die Einhaltung der Sicherheitsnormen.", "一个独立机构会认证安全标准的合规情况。"],
  abstrahieren: ["Das Modell abstrahiert bewusst von individuellen Einzelfällen.", "该模型有意撇开个别案例进行抽象概括。"],
  klassifizieren: ["Der Algorithmus klassifiziert die Dokumente nach ihrem Inhalt.", "该算法按内容对文档进行分类。"],
  akkreditieren: ["Die nationale Behörde akkreditierte das Prüflabor erneut.", "国家主管部门再次认证了该检测实验室。"],
  kategorisieren: ["Die Forschenden kategorisierten die Antworten nach klaren Kriterien.", "研究人员按照明确标准对回答进行归类。"],
  priorisieren: ["Die Verwaltung priorisiert Anträge mit besonderer Dringlichkeit.", "行政部门会优先处理特别紧急的申请。"],
  polarisieren: ["Die Reform polarisiert die öffentliche Debatte seit Monaten.", "这项改革数月来一直使公共讨论两极分化。"],
  separieren: ["Das Verfahren separiert verwertbare Stoffe von belasteten Rückständen.", "该工艺将可回收材料与受污染残留物分离。"],
  evaluieren: ["Ein unabhängiges Institut evaluiert die Wirksamkeit des Programms.", "一家独立研究所正在评估该项目的有效性。"],
  implementieren: ["Die Behörde implementierte ein mehrstufiges Kontrollsystem.", "主管部门实施了一套多级控制系统。"],
  substituieren: ["Im Modell lassen sich fehlende Werte nicht beliebig substituieren.", "模型中的缺失值不能随意替代。"],
  adaptieren: ["Das Team adaptierte die Methode an den regionalen Kontext.", "团队根据地区背景调整了该方法。"],
  legitimieren: ["Ein transparentes Verfahren legitimiert weitreichende politische Entscheidungen.", "透明的程序能赋予重大政治决策正当性。"],
  relativieren: ["Neue Daten relativieren die zunächst dramatische Prognose.", "新数据使最初看似严重的预测显得没那么绝对。"],
  schulden: ["Den Fortschritt verdankt das Projekt vor allem der engen Zusammenarbeit; einzelnen Personen schuldet es ihn nicht.", "项目的进展主要得益于紧密合作，并非归功于某个个人。"],
  auftauchen: ["Bei der Nachprüfung tauchten erhebliche Unstimmigkeiten auf.", "复核时出现了严重的不一致。"],
  verlegen: ["Der Verlag verlegte die überarbeitete Studie in zweiter Auflage.", "出版社以第二版形式出版了修订后的研究。"],
  bescheiden: ["Die Behörde beschied den Antrag nach eingehender Prüfung positiv.", "主管部门经过深入审查后批准了该申请。"],
  zuschlagen: ["Bei stark gefallenen Preisen schlugen institutionelle Anleger gezielt zu.", "价格大幅下跌时，机构投资者有针对性地出手买入。"],
  abkommen: ["Die Verhandlungspartner kamen von ihrer ursprünglichen Forderung schrittweise ab.", "谈判各方逐步放弃了最初的要求。"],
  bestechen: ["Der Ansatz besticht durch seine methodische Klarheit.", "这一方法以其清晰的方法论令人信服。"],
  schiffen: ["Die Reederei schifft die Waren über einen nordeuropäischen Hafen.", "航运公司经由一个北欧港口运输货物。"],
  angeben: ["Der Bericht gibt sämtliche Finanzierungsquellen transparent an.", "报告透明列明了所有资金来源。"],
  scannen: ["Das Archiv scannt besonders empfindliche Dokumente berührungslos.", "档案馆以非接触方式扫描特别脆弱的文献。"],
  ausflippen: ["Die hitzige Debatte führte dazu, dass einzelne Teilnehmer völlig ausflippten.", "激烈的争论导致个别参与者情绪完全失控。"],
  schluchzen: ["Die Zeugin schluchzte während ihrer Aussage leise.", "证人在陈述时轻声抽泣。"],
  bezeugen: ["Mehrere unabhängige Quellen bezeugen die frühe Nutzung des Gebäudes.", "多个独立来源证明该建筑很早就已投入使用。"],
  bedrohen: ["Anhaltende Dürren bedrohen die Wasserversorgung ganzer Regionen.", "持续干旱威胁着整个地区的供水。"],
};

const SECONDARY_MEANING_CORRECTIONS = {
  platzen: "爆裂；突然破裂",
  kratzen: "抓；刮；使发痒",
  "die Schale": "外壳；果皮；碗",
  verwirrend: "令人困惑的",
  einschalten: "接通；打开；介入",
  "die Entlassung": "解雇；释放；出院",
  süchtig: "上瘾的；成瘾的",
  "das Turnier": "锦标赛；比赛",
  kreischen: "尖叫；发出刺耳声",
  ausliefern: "交付；引渡；使任凭摆布",
  verschwiegen: "守口如瓶的；沉默寡言的",
  "der Sturz": "跌倒；坠落；骤降",
  verfügbar: "可用的；可支配的",
  "die Qual": "痛苦；折磨",
  "die Verschwendung": "浪费；挥霍",
  niedrig: "低的；低廉的",
  anpassen: "调整；使适应",
  "der Pullover": "套头毛衣；毛衣",
  "die Neuigkeit": "新消息；新闻",
  "die Fähre": "渡船",
  "das Weltall": "宇宙；太空",
  "die Rüstung": "盔甲；军备",
  intakt: "完好的；功能正常的",
  zurückzahlen: "偿还；报答",
  "die Frechheit": "无礼；厚颜行为",
  enthalten: "包含；含有",
  "der Aufruhr": "骚乱；暴动",
  "das Portal": "门户；入口；网站平台",
  "der Schweiß": "汗；焊接",
  "das Heer": "军队；大批",
  "der Stoß": "撞击；冲击；一摞",
  aufsuchen: "前往；寻找；就诊",
  anzünden: "点燃",
  "die Festnahme": "逮捕；拘捕",
  "die Hauptrolle": "主角；主要作用",
  "die Klingel": "门铃；车铃",
  ausschließen: "排除；不让参加；锁在外面",
  erforschen: "研究；探索",
  "das Erlebnis": "经历；体验",
  gedeckt: "有保障的；遮盖的；低调的",
  verweigern: "拒绝；不予",
  gütig: "仁慈的；和善的",
  nervig: "烦人的",
  niedergeschlagen: "沮丧的；被击倒的",
  engagieren: "聘用；参与；投入",
  erschrocken: "受惊的；惊恐的",
  "das Blei": "铅",
  "die Langeweile": "无聊；倦怠",
  errichten: "建造；设立",
  "das Hindernis": "障碍；阻碍",
  strahlen: "发光；辐射；容光焕发",
  falten: "折叠；起皱",
  "der Fels": "岩石；磐石",
  scheren: "剪；剃；在意",
  "der Brei": "糊状食物；粥",
  effektiv: "有效的；实际的",
  zart: "柔嫩的；细腻的；轻柔的",
  "das Zeugnis": "证书；成绩单；证词",
  "die Klippe": "悬崖；暗礁；难关",
  "die Bücherei": "图书馆",
  "die Niete": "铆钉；不中用的人；空签",
  "die Sehne": "肌腱；弓弦",
  kritisieren: "批评；评论",
  "der Reiz": "刺激；魅力；诱因",
  "das Gefäß": "容器；血管；脉管",
  "das Stroh": "稻草；秸秆",
  bewerten: "评价；估值",
  "der Flüchtling": "难民；逃亡者",
  "die Schraube": "螺丝；螺钉",
  "das Symptom": "症状；征兆",
  "der Ohrring": "耳环",
  ablassen: "放出；排放；降下；放弃",
  "das Diplom": "文凭；毕业证书",
  "die Waage": "秤；天平；平衡",
  aktuell: "当前的；最新的",
  "das Bündel": "捆；束；一揽子",
  "die Propaganda": "宣传；政治宣传",
  "die Vorspeise": "前菜；开胃菜",
  "die Stütze": "支撑；支柱；支持者",
  anspruchsvoll: "要求高的；有挑战性的",
  "der Krampf": "痉挛；抽筋；勉强之作",
  "der Dorn": "刺；荆棘",
  "der Bahnsteig": "站台；月台",
  "der Abfluss": "排水口；流出；径流",
  digital: "数字化的；数码的",
  "das Register": "登记簿；索引；寄存器",
  "die Prise": "一小撮；少量",
  "das Moos": "苔藓",
  "das Protein": "蛋白质",
  sozial: "社会的；合群的；社会保障的",
  "der Fächer": "扇子；学科（复数 Fächer）",
  "der Rachen": "咽喉；喉部",
  schmal: "狭窄的；瘦削的",
  argumentieren: "论证；提出理由",
  "die Zahnseide": "牙线",
  "die Kruste": "硬壳；结痂；面包皮",
  "die Verordnung": "法规；条例；医嘱",
  "das Referat": "报告；专题发言；部门",
  schälen: "削皮；剥皮",
  "die Wanderung": "徒步旅行；迁移",
  "das Stäbchen": "小棍；筷子（复数）",
  zunehmen: "增加；体重增加",
  impfen: "接种疫苗",
  "die Dichtung": "诗歌创作；密封件；密封",
  zukünftig: "未来的；今后的",
  "die Reform": "改革",
  flechten: "编织；编辫",
  "die Klausur": "笔试；闭卷考试",
  "der Backofen": "烤箱",
  vegetarisch: "素食的",
  umfangreich: "广泛的；内容丰富的",
  mehr: "更多；再",
  zurück: "回去；回来；向后",
  "das Geschenk": "礼物；赠品",
  schrecklich: "可怕的；糟糕的",
  "der Richter": "法官",
  "das Vergnügen": "乐趣；愉快",
  progressiv: "进步的；渐进的",
  schließlich: "最后；毕竟",
  unterhalten: "交谈；娱乐；维持",
  "der Zeitpunkt": "时间点；时刻",
  erschießen: "枪杀；射杀",
  durcheinander: "混乱地；彼此交错地",
  lösen: "解决；松开；溶解",
  umsonst: "免费地；徒劳地",
  "das Gegenteil": "相反事物；反面",
  begraben: "埋葬；放弃",
  "die Geduld": "耐心",
  erleben: "经历；体验",
  "das Versteck": "藏身处；隐藏地点",
  aufregend: "令人兴奋的；激动人心的",
  "das Kommando": "命令；指挥权；突击队",
  "der Feigling": "懦夫",
  freiwillig: "自愿的；志愿的",
  beeindruckend: "令人印象深刻的",
  "der Gouverneur": "州长；总督",
  verbergen: "隐藏；掩盖",
  ruinieren: "毁掉；使破产",
  amüsieren: "使开心；娱乐",
  "der Betrüger": "骗子；诈骗者",
  sichern: "保护；确保；保存",
  "der Apparat": "设备；装置；机构",
  erschrecken: "使惊吓；受惊",
  ausschalten: "关闭；排除；淘汰",
  betrügen: "欺骗；诈骗；背叛",
  vergehen: "流逝；消退；违法",
  "die Trennung": "分离；分手；区分",
  "die Etage": "楼层",
  engagiert: "积极投入的；热心的",
  "die Kommunikation": "沟通；传播；通信",
  logieren: "住宿；下榻",
  ablehnen: "拒绝；否决",
  emotional: "情绪化的；情感上的",
  versetzen: "调动；转移；使处于",
  unterscheiden: "区分；辨别",
  arrangieren: "安排；编排；改编",
  umgekehrt: "相反的；反过来",
  "der Sanitäter": "急救员；卫生兵",
  klagen: "抱怨；哀叹；提起诉讼",
  "der Weltraum": "外层空间；宇宙空间",
  "der Charme": "魅力；风度",
  sicherstellen: "确保；查扣",
  "die Bezahlung": "付款；报酬",
  "das Anwesen": "房产；庄园",
  "der Rahmen": "框架；范围；边框",
  "die Garderobe": "衣帽间；服装；衣帽寄存处",
  aufhängen: "悬挂；挂断电话",
  geduldig: "耐心的",
  produzieren: "生产；制作；产生",
  "der Anstand": "礼貌；体面；分寸",
  "der Tänzer": "舞者；男舞蹈演员",
  "der Dachboden": "阁楼",
  "die Poesie": "诗歌；诗意",
  "der Taxifahrer": "出租车司机",
  rasiert: "剃过的；刮净的",
  defekt: "有故障的；损坏的",
  anschließend: "随后；接着",
  wachsam: "警觉的；警惕的",
  "die Hypothek": "抵押贷款；抵押权",
};

function reviewedAdjective(term, meaning, example, exampleZh) {
  return {
    term,
    forms: `${term} · als Adjektiv`,
    typeCode: "adj",
    meaning,
    example,
    exampleZh,
  };
}

function reviewedAdverb(term, meaning, example, exampleZh) {
  return {
    term,
    forms: `${term} · unveränderlich`,
    typeCode: "adv",
    meaning,
    example,
    exampleZh,
  };
}

const ADJECTIVE_EDITORIAL = {
  fasziniert: reviewedAdjective("fasziniert", "着迷的；深受吸引的", "Die Forschenden waren von der unerwarteten Regelmäßigkeit der Daten fasziniert.", "研究人员被数据中出乎意料的规律性深深吸引。"),
  angewiesen: reviewedAdjective("angewiesen", "依赖的；需要……的", "Ländliche Regionen sind auf eine verlässliche Verkehrsanbindung angewiesen.", "农村地区依赖可靠的交通连接。"),
  angeordnet: reviewedAdjective("angeordnet", "排列的；奉命实施的", "Die Messpunkte sind in einem regelmäßigen Raster angeordnet.", "测量点按规则网格排列。"),
  flach: reviewedAdjective("flach", "平坦的；浅的；平缓的", "Die Lernkurve verläuft nach der ersten Phase deutlich flacher.", "第一阶段之后，学习曲线明显趋于平缓。"),
  entzückend: reviewedAdjective("stringent", "严密连贯的；逻辑严谨的", "Die Argumentation ist stringent und durchgängig belegt.", "这套论证逻辑严密，而且处处有证据支撑。"),
  fürchterlich: reviewedAdjective("folgenreich", "影响深远的；后果严重的", "Die Entscheidung erwies sich für die regionale Wirtschaft als folgenreich.", "这一决定后来被证明对地区经济影响深远。"),
  geübt: reviewedAdjective("geübt", "熟练的；训练有素的", "Geübte Leser erkennen den ironischen Unterton sofort.", "有经验的读者会立刻察觉其中的反讽意味。"),
  hinüber: reviewedAdjective("irreversibel", "不可逆的", "Ein Teil der ökologischen Schäden ist bereits irreversibel.", "部分生态损害已经不可逆转。"),
  beängstigend: reviewedAdjective("beängstigend", "令人担忧的；令人害怕的", "Der beschleunigte Verlust der Artenvielfalt ist beängstigend.", "生物多样性加速丧失的趋势令人担忧。"),
  unauffällig: reviewedAdjective("unauffällig", "不显眼的；低调的", "Die Abweichung blieb in der ersten Auswertung unauffällig.", "这一偏差在首次分析中并不显眼。"),
  programmiert: reviewedAdjective("programmiert", "已编程的；预设的", "Das Gerät ist für eine automatische Abschaltung programmiert.", "该设备已设定为自动关闭。"),
  schal: reviewedAdjective("substanziell", "实质性的；可观的", "Die Reform brachte substanzielle Verbesserungen im Rechtsschutz.", "这项改革为法律救济带来了实质性改善。"),
  unsterblich: reviewedAdjective("unsterblich", "不朽的；永存的", "Mit diesem Werk wurde die Autorin literarisch unsterblich.", "这部作品使这位作家在文学史上不朽。"),
  betroffen: reviewedAdjective("betroffen", "受影响的；震惊的", "Besonders betroffen sind Haushalte mit geringem Einkommen.", "受影响最严重的是低收入家庭。"),
  verwirrend: reviewedAdjective("verwirrend", "令人困惑的", "Die uneinheitliche Begriffswahl ist für Leserinnen und Leser verwirrend.", "不统一的术语使用会让读者感到困惑。"),
  durchgeknallt: reviewedAdjective("inkonsistent", "不一致的；前后矛盾的", "Die Begründung ist in mehreren Punkten inkonsistent.", "这份论证在多个方面前后不一致。"),
  beherrscht: reviewedAdjective("beherrscht", "镇定的；克制的", "Die Ministerin reagierte auch auf scharfe Kritik beherrscht.", "部长面对尖锐批评时仍保持克制。"),
  unverzüglich: reviewedAdverb("unverzüglich", "立即；毫不迟延地", "Sicherheitsvorfälle müssen unverzüglich gemeldet werden.", "安全事件必须立即报告。"),
  letztens: reviewedAdjective("retrospektiv", "回顾性的", "Die Studie wertet die Behandlungsverläufe retrospektiv aus.", "该研究以回顾性方式分析治疗过程。"),
  zutiefst: reviewedAdverb("zutiefst", "极其；深深地", "Die Kommission zeigte sich von den Vorwürfen zutiefst beunruhigt.", "委员会对这些指控深感不安。"),
  genehmigt: reviewedAdjective("genehmigt", "已获批准的", "Nur genehmigte Projekte dürfen öffentliche Mittel abrufen.", "只有获批项目才能申请公共资金。"),
  sensibel: reviewedAdjective("sensibel", "敏感的；需要谨慎处理的", "Gesundheitsdaten sind besonders sensibel und müssen streng geschützt werden.", "健康数据尤其敏感，必须受到严格保护。"),
  unerwartet: reviewedAdjective("unerwartet", "出乎意料的", "Die Maßnahme hatte einen unerwartet starken Verteilungseffekt.", "这项措施产生了出乎意料的强烈分配效应。"),
  eingenommen: reviewedAdjective("eingenommen", "有偏见的；先入为主的", "Der Gutachter wirkte gegenüber dem neuen Ansatz voreingenommen.", "评审专家似乎对新方法抱有成见。"),
  verschwiegen: reviewedAdjective("verschwiegen", "守口如瓶的；谨慎保密的", "In Personalfragen gilt die Ombudsperson als ausgesprochen verschwiegen.", "在人事问题上，这位申诉专员以严格保密著称。"),
  zudem: reviewedAdverb("zudem", "此外；而且", "Die Methode ist präzise und zudem vergleichsweise kostengünstig.", "这种方法精确，而且成本相对较低。"),
  immerzu: reviewedAdjective("kontinuierlich", "持续的；连续的", "Die Emissionen werden an allen Standorten kontinuierlich gemessen.", "所有地点的排放都在持续监测。"),
  gestresst: reviewedAdjective("überlastet", "负担过重的；超负荷的", "Das überlastete System reagierte zunehmend instabil.", "超负荷的系统表现得越来越不稳定。"),
  zusätzliche: reviewedAdjective("zusätzlich", "额外的；附加的", "Für die Umsetzung sind zusätzliche Fachkräfte erforderlich.", "落实该方案还需要额外的专业人员。"),
  annähernd: reviewedAdjective("annähernd", "近似的；大致相同的", "Beide Verfahren liefern annähernd gleiche Ergebnisse.", "两种方法得出的结果大致相同。"),
  überwältigt: reviewedAdjective("überwältigt", "不知所措的；深受震撼的", "Die Verwaltung war von der Zahl der Anträge zunächst überwältigt.", "行政部门起初被大量申请弄得不知所措。"),
  benannt: reviewedAdjective("benannt", "已命名的；明确指出的", "Die im Bericht benannten Risiken wurden bislang nicht behoben.", "报告中指出的风险至今尚未消除。"),
  genervt: reviewedAdjective("unzulänglich", "不充分的；有缺陷的", "Die bisherige Datengrundlage ist für eine belastbare Prognose unzulänglich.", "现有数据基础不足以支撑可靠预测。"),
  prächtig: reviewedAdjective("exemplarisch", "典型的；示范性的", "Der Fall zeigt exemplarisch, wie institutionelle Fehlanreize wirken.", "这一案例典型地说明了制度性错误激励如何产生作用。"),
  zurückgezogen: reviewedAdjective("zurückgezogen", "撤回的；离群独居的", "Der zurückgezogene Gesetzentwurf wird grundlegend überarbeitet.", "被撤回的法案草案将进行全面修订。"),
  bemerkenswert: reviewedAdjective("bemerkenswert", "值得注意的；非凡的", "Bemerkenswert ist die hohe Übereinstimmung der unabhängigen Messungen.", "值得注意的是，独立测量结果高度一致。"),
  betäubt: reviewedAdjective("betäubt", "麻醉的；失去知觉的", "Der Patient war während des Eingriffs örtlich betäubt.", "患者在手术过程中接受了局部麻醉。"),
  ausgeliefert: reviewedAdjective("ausgeliefert", "任凭摆布的；已交付的", "Ohne Rechtsbehelf wären die Betroffenen der Entscheidung schutzlos ausgeliefert.", "如果没有法律救济，受影响者将毫无保护地任由该决定摆布。"),
  bedrückt: reviewedAdjective("bedrückt", "忧郁的；压抑的", "Die bedrückte Stimmung prägte die gesamte Gedenkveranstaltung.", "压抑的气氛笼罩着整场纪念活动。"),
  gelähmt: reviewedAdjective("gelähmt", "瘫痪的；陷入停滞的", "Der politische Prozess blieb monatelang gelähmt.", "政治进程连续数月陷入停滞。"),
  innerlich: reviewedAdjective("innerlich", "内在的；内心的；内服的", "Die Figur bleibt trotz äußerer Ruhe innerlich zerrissen.", "这一人物虽然表面平静，内心却十分矛盾。"),
  kurzfristig: reviewedAdjective("kurzfristig", "短期的；临时通知的", "Kurzfristige Einsparungen können langfristig hohe Folgekosten verursachen.", "短期节省可能在长期造成高额后续成本。"),
  gewagt: reviewedAdjective("gewagt", "大胆的；冒险的", "Die Schlussfolgerung ist angesichts der kleinen Stichprobe gewagt.", "鉴于样本很小，这一结论颇为冒险。"),
  vorgesehen: reviewedAdjective("vorgesehen", "预定的；规定的", "Die vorgesehene Übergangsfrist endet im kommenden Jahr.", "规定的过渡期将于明年结束。"),
  gnädig: reviewedAdjective("rechtskonform", "符合法律规定的", "Die Verarbeitung personenbezogener Daten muss nachweislich rechtskonform sein.", "个人数据的处理必须能够证明符合法律规定。"),
  erwiesen: reviewedAdjective("erwiesen", "已证实的；确凿的", "Der ursächliche Zusammenhang gilt inzwischen als wissenschaftlich erwiesen.", "这一因果关系如今被认为已得到科学证实。"),
  tätig: reviewedAdjective("tätig", "任职的；从事工作的；活跃的", "Die Organisation ist in mehr als zwanzig Ländern tätig.", "该组织在二十多个国家开展工作。"),
  unklar: reviewedAdjective("unklar", "不明确的；模糊的", "Unklar bleibt, nach welchen Kriterien die Mittel verteilt werden.", "资金究竟按什么标准分配仍不明确。"),
  abgerissen: reviewedAdjective("fragmentarisch", "零散的；不完整的", "Die überlieferten Quellen sind nur fragmentarisch erhalten.", "流传下来的资料保存得并不完整。"),
  halber: reviewedAdjective("abwägungsbedürftig", "需要权衡的", "Der Eingriff ist wegen seiner weitreichenden Folgen besonders abwägungsbedürftig.", "这项干预影响深远，因此尤其需要谨慎权衡。"),
  verfehlt: reviewedAdjective("verfehlt", "不恰当的；未达到目标的", "Die pauschale Kritik ist sachlich verfehlt.", "这种一概而论的批评在事实层面并不恰当。"),
  grimm: reviewedAdjective("normativ", "规范性的；价值判断上的", "Die Studie trennt deskriptive Aussagen klar von normativen Bewertungen.", "该研究明确区分描述性陈述与规范性评价。"),
  hinreißend: reviewedAdjective("prägnant", "简洁有力的；鲜明的", "Die Autorin fasst den zentralen Konflikt in einem prägnanten Satz zusammen.", "作者用一句简洁有力的话概括了核心冲突。"),
  intakt: reviewedAdjective("intakt", "完好的；功能正常的", "Trotz des Ausfalls blieb die grundlegende Infrastruktur intakt.", "尽管发生故障，基础设施的基本功能仍保持完好。"),
  lebenslänglich: reviewedAdjective("lebenslänglich", "终身的；无期的", "Das Gericht verhängte eine lebenslängliche Freiheitsstrafe.", "法院判处了无期徒刑。"),
  isoliert: reviewedAdjective("isoliert", "孤立的；隔离的", "Ein isolierter Einzelbefund erlaubt noch keine allgemeine Schlussfolgerung.", "孤立的单一发现尚不足以支持一般性结论。"),
  dramatisch: reviewedAdjective("dramatisch", "急剧的；严重的；戏剧性的", "Die Grundwasserstände sind in mehreren Regionen dramatisch gesunken.", "多个地区的地下水位急剧下降。"),
  angerührt: reviewedAdjective("evidenzbasiert", "循证的；以证据为基础的", "Die Leitlinie enthält ausschließlich evidenzbasierte Empfehlungen.", "该指南只包含以证据为基础的建议。"),
  vielmehr: reviewedAdverb("vielmehr", "更确切地说；而是", "Das Problem ist nicht technisch, sondern vielmehr institutionell bedingt.", "这个问题并非技术问题，更确切地说是制度造成的。"),
  verdeckt: reviewedAdjective("verdeckt", "隐藏的；秘密的；被覆盖的", "Die Analyse macht verdeckte Interessenkonflikte sichtbar.", "分析揭示了隐藏的利益冲突。"),
  bedauerlich: reviewedAdjective("bedauerlich", "令人遗憾的", "Die mangelnde Transparenz des Verfahrens ist bedauerlich.", "程序缺乏透明度令人遗憾。"),
  gedeckt: reviewedAdjective("gedeckt", "有保障的；已覆盖的；低调的", "Die zusätzlichen Ausgaben sind durch Rücklagen gedeckt.", "新增支出由储备金提供保障。"),
  vorläufig: reviewedAdjective("vorläufig", "暂定的；临时的", "Die vorläufigen Ergebnisse müssen noch unabhängig bestätigt werden.", "初步结果仍需独立验证。"),
  gestochen: reviewedAdjective("gestochen", "刺绣的；被刺的；极其清晰的", "Die Abbildung ist auch in starker Vergrößerung gestochen scharf.", "这幅图即使大幅放大也依然极为清晰。"),
  letztlich: reviewedAdverb("letztlich", "最终；归根结底", "Letztlich hängt der Erfolg von der konsequenten Umsetzung ab.", "最终，成败取决于能否坚持落实。"),
  eingeschaltet: reviewedAdjective("institutionalisiert", "制度化的", "Der Dialog ist inzwischen dauerhaft institutionalisiert.", "这一对话如今已经实现常态化和制度化。"),
  gütig: reviewedAdjective("gemeinwohlorientiert", "以公共利益为导向的", "Kommunale Unternehmen sollen gemeinwohlorientiert handeln.", "市政企业应当以公共利益为导向开展经营。"),
  ansteckend: reviewedAdjective("ansteckend", "有传染性的；富有感染力的", "Die Erkrankung ist bereits vor dem Auftreten erster Symptome ansteckend.", "这种疾病在最初症状出现前就具有传染性。"),
  niedergeschlagen: reviewedAdjective("niedergeschlagen", "沮丧的；被击倒的", "Nach der Ablehnung des Antrags wirkte das Team niedergeschlagen.", "申请被拒后，团队显得十分沮丧。"),
  auserwählt: reviewedAdjective("repräsentativ", "有代表性的；具代表性的", "Die Stichprobe ist für die Gesamtbevölkerung nicht repräsentativ.", "该样本不能代表总体人口。"),
  bedacht: reviewedAdjective("bedacht", "审慎的；考虑周到的", "Die Reform sollte mit Bedacht und in mehreren Schritten umgesetzt werden.", "这项改革应当审慎地分阶段实施。"),
  stier: reviewedAdjective("rigide", "僵化的；严苛的", "Rigide Vorgaben erschweren eine Anpassung an regionale Bedingungen.", "僵化的规定会阻碍因地制宜的调整。"),
  verwanzt: reviewedAdjective("kompromittiert", "已泄露的；受损的；被攻破的", "Nach dem Angriff galten mehrere Benutzerkonten als kompromittiert.", "攻击发生后，多个用户账户被认为已经失陷。"),
  marginal: reviewedAdjective("marginal", "边缘的；微小的", "Der statistische Effekt ist vorhanden, aber lediglich marginal.", "这一统计效应确实存在，但幅度非常小。"),
  empirisch: reviewedAdjective("empirisch", "实证的；经验性的", "Die theoretische Annahme wurde empirisch überprüft.", "这一理论假设经过了实证检验。"),
  idealistisch: reviewedAdjective("idealistisch", "理想主义的", "Der Entwurf ist ambitioniert, wirkt aber stellenweise idealistisch.", "这份方案雄心勃勃，但有些地方显得过于理想主义。"),
  analytisch: reviewedAdjective("analytisch", "分析性的；善于分析的", "Der Beitrag trennt analytisch zwischen Ursache und bloßer Korrelation.", "这篇文章从分析上区分了因果关系与单纯相关性。"),
  strukturell: reviewedAdjective("strukturell", "结构性的", "Die Krise hat nicht nur konjunkturelle, sondern strukturelle Ursachen.", "这场危机不仅有周期性原因，也有结构性原因。"),
  regressiv: reviewedAdjective("regressiv", "累退的；退行的", "Eine regressive Steuer belastet geringe Einkommen relativ stärker.", "累退税会让低收入者承担相对更重的负担。"),
  großzügig: reviewedAdjective("großzügig", "慷慨的；宽松的；宽敞的", "Die Übergangsregelung ist bewusst großzügig bemessen.", "过渡规定有意设置得较为宽松。"),
  verfahren: reviewedAdjective("verfahren", "陷入僵局的；复杂棘手的", "Die politische Lage ist nach jahrelangem Streit völlig verfahren.", "经过多年的争执，政治局势已完全陷入僵局。"),
  stabil: reviewedAdjective("stabil", "稳定的；牢固的", "Die Ergebnisse bleiben über verschiedene Modellvarianten hinweg stabil.", "在不同模型设定下，结果依然稳定。"),
  niederländisch: reviewedAdjective("interdisziplinär", "跨学科的", "Das Projekt verfolgt einen konsequent interdisziplinären Ansatz.", "该项目采用了一以贯之的跨学科方法。"),
  identisch: reviewedAdjective("identisch", "完全相同的；同一的", "Die beiden Datensätze sind trotz unterschiedlicher Bezeichnungen inhaltlich identisch.", "两组数据名称不同，但内容完全相同。"),
  bange: reviewedAdjective("prekär", "不稳定的；岌岌可危的", "Viele Beschäftigte arbeiten weiterhin unter prekären Bedingungen.", "许多劳动者仍在不稳定的条件下工作。"),
  schwindelig: reviewedAdjective("volatil", "波动剧烈的；不稳定的", "Die Energiepreise bleiben trotz der Entlastungsmaßnahmen volatil.", "尽管采取了减负措施，能源价格仍然波动剧烈。"),
  intensiv: reviewedAdjective("intensiv", "密集的；深入的；强烈的", "Dem Beschluss gingen intensive Verhandlungen voraus.", "该决议之前经历了密集谈判。"),
  erschüttert: reviewedAdjective("erschüttert", "震惊的；动摇的", "Die Öffentlichkeit zeigte sich von den Enthüllungen erschüttert.", "公众对这些披露深感震惊。"),
  schriftlich: reviewedAdjective("schriftlich", "书面的", "Die Einwilligung muss ausdrücklich und schriftlich erteilt werden.", "同意必须以明确的书面形式作出。"),
  gescheitert: reviewedAdjective("gescheitert", "失败的；破裂的", "Aus dem gescheiterten Pilotprojekt lassen sich wichtige Lehren ziehen.", "可以从失败的试点项目中吸取重要教训。"),
  wachsam: reviewedAdjective("wachsam", "警觉的；警惕的", "Unabhängige Medien bleiben gegenüber Machtmissbrauch wachsam.", "独立媒体始终警惕权力滥用。"),
  leinwand: reviewedAdjective("evident", "明显的；不言自明的", "Der Zusammenhang ist angesichts der Datenlage evident.", "鉴于现有数据，这一关联十分明显。"),
  erreichbar: reviewedAdjective("erreichbar", "可达到的；可联系到的", "Das Minderungsziel bleibt mit zusätzlichen Maßnahmen erreichbar.", "采取额外措施后，减排目标仍然可以实现。"),
  gewidmet: reviewedAdjective("gewidmet", "献给……的；致力于……的", "Die Ausstellung ist dem Werk einer lange übersehenen Künstlerin gewidmet.", "这场展览专门呈现一位长期被忽视的女艺术家的作品。"),
  erschlagen: reviewedAdjective("erschlagen", "不知所措的；筋疲力尽的", "Viele Kommunen fühlen sich von den Berichtspflichten regelrecht erschlagen.", "许多市镇被繁重的报告义务压得不知所措。"),
  verlegen: reviewedAdjective("verlegen", "尴尬的；窘迫的", "Auf die unerwartete Nachfrage reagierte der Sprecher sichtlich verlegen.", "发言人面对意外追问时明显显得尴尬。"),
  bescheiden: reviewedAdjective("bescheiden", "谦逊的；有限的；朴素的", "Trotz hoher Investitionen blieb der messbare Erfolg bescheiden.", "尽管投入很高，可衡量的成效仍然有限。"),
};

const ENTRY_EDITORIAL = {
  "die Akademie": {
    term: "die Akademie", forms: "die Akademie · die Akademien", typeCode: "nf",
    meaning: "学院；研究院；学会",
    example: "Die Akademie fördert den Austausch zwischen Wissenschaft und Öffentlichkeit.",
    exampleZh: "该学会促进科学界与公众之间的交流。",
  },
  kriechen: {
    term: "kriechen", forms: "kriechen · kriecht · kroch · ist gekrochen", typeCode: "v",
    meaning: "爬行；缓慢移动",
    example: "Die Raupe kriecht zur Verpuppung an einen geschützten Ort.",
    exampleZh: "毛虫爬到一个隐蔽处准备化蛹。",
  },
  "der Geier": {
    term: "der Interessenkonflikt", forms: "der Interessenkonflikt · die Interessenkonflikte", typeCode: "nm",
    meaning: "利益冲突",
    example: "Der Gutachter legte den möglichen Interessenkonflikt vorab offen.",
    exampleZh: "评审专家事先披露了可能存在的利益冲突。",
  },
  "die Fahne": {
    term: "die Fahne", forms: "die Fahne · die Fahnen", typeCode: "nf",
    meaning: "旗帜；标志",
    example: "Vor dem Parlamentsgebäude wehten die Fahnen der Mitgliedstaaten.",
    exampleZh: "议会大楼前飘扬着各成员国的旗帜。",
  },
  foltern: {
    term: "substanziieren", forms: "substanziieren · substanziiert · substanziierte · hat substanziiert", typeCode: "v",
    meaning: "以事实充实；具体论证",
    example: "Die Klägerin substanziierte ihre Vorwürfe mit überprüfbaren Belegen.",
    exampleZh: "原告用可核实的证据具体论证了自己的指控。",
  },
  hochgehen: {
    term: "hochgehen", forms: "hochgehen · geht hoch · ging hoch · ist hochgegangen", typeCode: "v",
    meaning: "上升；突然爆炸；情绪激动",
    example: "Bei Überlastung kann die Temperatur der Anlage rasch hochgehen.",
    exampleZh: "设备过载时，温度可能迅速上升。",
  },
  verreisen: {
    term: "verreisen", forms: "verreisen · verreist · verreiste · ist verreist", typeCode: "v",
    meaning: "外出旅行",
    example: "Dienstlich verreisen Beschäftigte nur nach vorheriger Genehmigung.",
    exampleZh: "员工出差前必须事先获得批准。",
  },
  beichten: {
    term: "offenlegen", forms: "offenlegen · legt offen · legte offen · hat offengelegt", typeCode: "v",
    meaning: "公开；披露",
    example: "Unternehmen müssen relevante Nachhaltigkeitsrisiken offenlegen.",
    exampleZh: "企业必须披露相关的可持续发展风险。",
  },
  verkünden: {
    term: "verkünden", forms: "verkünden · verkündet · verkündete · hat verkündet", typeCode: "v",
    meaning: "宣布；公布",
    example: "Das Gericht verkündete sein Urteil am Ende der Verhandlung.",
    exampleZh: "法院在庭审结束时宣判。",
  },
  "der Friede": {
    term: "der Friede", forms: "der Friede · meist ohne Plural", typeCode: "nm",
    meaning: "和平；和睦",
    example: "Ein dauerhafter Friede setzt verlässliche Institutionen voraus.",
    exampleZh: "持久和平需要可靠的制度作为前提。",
  },
  engagieren: {
    term: "engagieren", forms: "engagieren · engagiert · engagierte · hat engagiert", typeCode: "v",
    meaning: "聘用；使参与；投身",
    example: "Für die Evaluation engagierte die Behörde externe Fachleute.",
    exampleZh: "主管部门为项目评估聘请了外部专家。",
  },
  "die Vase": {
    term: "die Machtasymmetrie", forms: "die Machtasymmetrie · die Machtasymmetrien", typeCode: "nf",
    meaning: "权力不对称",
    example: "Die Machtasymmetrie erschwert Verhandlungen auf Augenhöhe.",
    exampleZh: "权力不对称使平等谈判变得困难。",
  },
  schnarchen: {
    term: "aggregieren", forms: "aggregieren · aggregiert · aggregierte · hat aggregiert", typeCode: "v",
    meaning: "汇总；聚合",
    example: "Das System aggregiert die Einzelwerte zu einem Gesamtindikator.",
    exampleZh: "系统将各项数值汇总为一个综合指标。",
  },
  falten: {
    term: "konsolidieren", forms: "konsolidieren · konsolidiert · konsolidierte · hat konsolidiert", typeCode: "v",
    meaning: "巩固；整合；合并",
    example: "Die Verwaltung konsolidiert mehrere Datenbanken in einem zentralen System.",
    exampleZh: "行政部门将多个数据库整合到一个中央系统中。",
  },
  "der Urin": {
    term: "der Urin", forms: "der Urin · meist ohne Plural", typeCode: "nm",
    meaning: "尿液",
    example: "Im Urin lassen sich bestimmte Stoffwechselprodukte nachweisen.",
    exampleZh: "尿液中可以检测出某些代谢产物。",
  },
  gleiten: {
    term: "gleiten", forms: "gleiten · gleitet · glitt · ist geglitten", typeCode: "v",
    meaning: "滑动；滑行",
    example: "Auf der beschichteten Oberfläche gleitet das Bauteil nahezu reibungslos.",
    exampleZh: "在涂层表面上，该部件几乎无摩擦地滑动。",
  },
  argumentieren: {
    term: "argumentieren", forms: "argumentieren · argumentiert · argumentierte · hat argumentiert", typeCode: "v",
    meaning: "论证；提出理由",
    example: "Die Autorin argumentiert konsequent auf der Grundlage empirischer Befunde.",
    exampleZh: "作者始终以实证发现为基础展开论证。",
  },
  "die Schwalbe": {
    term: "die Institutionenanalyse", forms: "die Institutionenanalyse · die Institutionenanalysen", typeCode: "nf",
    meaning: "制度分析",
    example: "Die Institutionenanalyse erklärt, wie formelle Regeln das Verhalten prägen.",
    exampleZh: "制度分析解释了正式规则如何塑造行为。",
  },
  "der Hosenträger": {
    term: "die Diskursanalyse", forms: "die Diskursanalyse · die Diskursanalysen", typeCode: "nf",
    meaning: "话语分析",
    example: "Die Diskursanalyse untersucht wiederkehrende Deutungsmuster in den Medien.",
    exampleZh: "话语分析研究媒体中反复出现的解释模式。",
  },
  "der Staatsanwalt": {
    term: "der Staatsanwalt", forms: "der Staatsanwalt · die Staatsanwälte", typeCode: "nm",
    meaning: "检察官",
    example: "Der Staatsanwalt beantragte die Eröffnung des Hauptverfahrens.",
    exampleZh: "检察官申请启动正式审理程序。",
  },
  blicken: {
    term: "begutachten", forms: "begutachten · begutachtet · begutachtete · hat begutachtet", typeCode: "v",
    meaning: "评审；鉴定",
    example: "Zwei unabhängige Fachleute begutachteten den Antrag.",
    exampleZh: "两位独立专家评审了这份申请。",
  },
  erschrecken: {
    term: "sensibilisieren", forms: "sensibilisieren · sensibilisiert · sensibilisierte · hat sensibilisiert", typeCode: "v",
    meaning: "提高……的意识；使敏感",
    example: "Die Kampagne sensibilisiert Unternehmen für verdeckte Diskriminierung.",
    exampleZh: "这项宣传活动提高了企业对隐性歧视的认识。",
  },
  verteilen: {
    term: "verteilen", forms: "verteilen · verteilt · verteilte · hat verteilt", typeCode: "v",
    meaning: "分配；分布；散发",
    example: "Die Mittel werden nach transparenten Kriterien auf die Regionen verteilt.",
    exampleZh: "资金按照透明标准分配给各地区。",
  },
  "der Raub": {
    term: "der Raub", forms: "der Raub · die Raube", typeCode: "nm",
    meaning: "抢劫；掠夺",
    example: "Raub ist im Strafrecht durch den Einsatz von Gewalt oder Drohung gekennzeichnet.",
    exampleZh: "在刑法中，抢劫的特征是使用暴力或威胁。",
  },
  münzen: {
    term: "münzen", forms: "münzen · münzt · münzte · hat gemünzt", typeCode: "v",
    meaning: "铸币；创造说法；把……指向",
    example: "Die Bemerkung war erkennbar auf die neue Leitung gemünzt.",
    exampleZh: "这句话显然是针对新管理层说的。",
  },
  "der Ausbruch": {
    term: "der Ausbruch", forms: "der Ausbruch · die Ausbrüche", typeCode: "nm",
    meaning: "爆发；喷发；逃脱",
    example: "Der Ausbruch des Vulkans legte den Flugverkehr vorübergehend lahm.",
    exampleZh: "火山喷发一度导致航空交通停摆。",
  },
  gestalten: {
    term: "gestalten", forms: "gestalten · gestaltet · gestaltete · hat gestaltet", typeCode: "v",
    meaning: "设计；塑造；安排",
    example: "Kommunen können die Verkehrswende vor Ort aktiv gestalten.",
    exampleZh: "市镇可以主动塑造本地交通转型。",
  },
  verborgen: {
    term: "plausibilisieren", forms: "plausibilisieren · plausibilisiert · plausibilisierte · hat plausibilisiert", typeCode: "v",
    meaning: "验证合理性；使可信",
    example: "Das Team plausibilisierte die Angaben anhand externer Vergleichsdaten.",
    exampleZh: "团队利用外部对比数据检验了这些信息的合理性。",
  },
  zerbrechen: {
    term: "zerbrechen", forms: "zerbrechen · zerbricht · zerbrach · ist zerbrochen", typeCode: "v",
    meaning: "破裂；折断；因……而崩溃",
    example: "Die Koalition zerbrach an einem grundlegenden Haushaltskonflikt.",
    exampleZh: "执政联盟因根本性的预算冲突而破裂。",
  },
  "die Sängerin": {
    term: "die Narrationsanalyse", forms: "die Narrationsanalyse · die Narrationsanalysen", typeCode: "nf",
    meaning: "叙事分析",
    example: "Die Narrationsanalyse rekonstruiert, wie Erfahrungen sprachlich geordnet werden.",
    exampleZh: "叙事分析重构经验如何通过语言得到组织。",
  },
  "der Tabak": {
    term: "der Tabak", forms: "der Tabak · die Tabake", typeCode: "nm",
    meaning: "烟草；烟草制品",
    example: "Die Besteuerung von Tabak gilt als wirksames Instrument der Prävention.",
    exampleZh: "对烟草征税被视为有效的预防手段。",
  },
  erschießen: {
    term: "entkräften", forms: "entkräften · entkräftet · entkräftete · hat entkräftet", typeCode: "v",
    meaning: "反驳；消除（疑虑）",
    example: "Die neuen Daten entkräften den Einwand gegen die Methode weitgehend.",
    exampleZh: "新数据在很大程度上反驳了对该方法的质疑。",
  },
};

// Final line-by-line corrections gathered during the independent central audit.
// Keys include the local POS so that genuine homographs remain distinct.
const FINAL_MEANING_BY_KEY = new Map([
  ["der Gipfel\u0000nm", "山峰；峰顶；高峰；峰会"],
  ["nördlich\u0000adj", "北部的；在……以北"],
  ["das Department\u0000nn", "院系；部门"],
  ["südlich\u0000adj", "南部的；在……以南"],
  ["das Segel\u0000nn", "船帆；帆"],
  ["die Bucht\u0000nf", "海湾；小湾"],
  ["abreisen\u0000v", "启程离开；离境"],
  ["die Union\u0000nf", "联盟；联合体；工会"],
  ["die Zeichnung\u0000nf", "图画；素描；图纸"],
  ["das Gebot\u0000nn", "命令；戒律；原则；出价"],
  ["der Deckel\u0000nm", "盖子；封面；上限"],
  ["die Elektrizität\u0000nf", "电；电能；电学现象"],
  ["der Unterschlupf\u0000nm", "藏身处；避难所"],
  ["die Tugend\u0000nf", "美德；德行；优点"],
  ["der Hörer\u0000nm", "听众；听筒；耳机"],
  ["vorausgesetzt\u0000adj", "预先具备的；作为前提的"],
  ["das Blei\u0000nn", "铅；铅制品"],
  ["das Regiment\u0000nn", "团；团级部队；严格管束"],
  ["die Biene\u0000nf", "蜜蜂"],
  ["der Haarschnitt\u0000nm", "发型；理发"],
  ["schmelzen\u0000v", "融化；熔化"],
  ["die Säure\u0000nf", "酸；酸性物质"],
  ["das Kalb\u0000nn", "牛犊；小腿肚"],
  ["gießen\u0000v", "浇；倾倒；浇铸"],
  ["die Frist\u0000nf", "期限；时限"],
  ["der Schnabel\u0000nm", "鸟喙；壶嘴"],
  ["das Kamel\u0000nn", "骆驼"],
  ["hellen\u0000v", "使变亮；澄清"],
  ["brocken\u0000v", "掰碎；弄成小块"],
  ["hacke\u0000adj", "醉醺醺的"],
  ["hineingehen\u0000v", "走进去；进入"],
  ["der Schimmel\u0000nm", "霉菌；霉斑；白马"],
  ["der Essig\u0000nm", "醋；食醋"],
  ["der Ochse\u0000nm", "阉牛；公牛"],
  ["die Achse\u0000nf", "轴；轴线；车轴"],
  ["die Salbe\u0000nf", "药膏；软膏"],
  ["die Ameise\u0000nf", "蚂蚁"],
  ["elektrisch\u0000adj", "电的；用电的；令人激动的"],
  ["das Rind\u0000nn", "牛；牛肉"],
  ["das Zahnfleisch\u0000nn", "牙龈"],
  ["der Bambus\u0000nm", "竹子；竹材"],
  ["der Kranich\u0000nm", "鹤"],
  ["entschuldigen\u0000v", "原谅；为……辩解；道歉"],
  ["heim\u0000adv", "回家；在家"],
  ["entschieden\u0000adj", "坚决的；明确的；果断的"],
  ["hinaus\u0000adv", "向外；出去；超出"],
  ["der Packen\u0000nm", "大包；一捆；一摞"],
  ["anhalten\u0000v", "停下；拦停；持续"],
  ["jedoch\u0000adv", "然而；不过"],
  ["jedoch\u0000conj", "然而；但是"],
  ["zuhören\u0000v", "倾听；听人说话"],
  ["plus\u0000adv", "加；外加；以及"],
  ["das Konto\u0000nn", "账户；银行账户；科目"],
  ["der Tempel\u0000nm", "神庙；寺庙；太阳穴"],
  ["salzen\u0000v", "加盐；用盐腌制"],
  ["mauern\u0000v", "砌墙；拒绝配合"],
  ["vorlesen\u0000v", "朗读；念给……听"],
  ["die Distanz\u0000nf", "距离；间距；疏离"],
  ["das Ministerium\u0000nn", "部；政府部门"],
  ["die Zeile\u0000nf", "行；一行文字；诗行"],
  ["herab\u0000adj", "向下；下来"],
  ["die Anzahl\u0000nf", "数量；数目"],
  ["das Einrad\u0000nn", "独轮车"],
  ["darstellen\u0000v", "呈现；描绘；阐述；构成"],
  ["der Schleier\u0000nm", "面纱；薄雾；遮蔽物"],
  ["signifikant\u0000adj", "显著的；具有统计显著性的"],
  ["romantisch\u0000adj", "浪漫的；浪漫主义的"],
  ["der Jammer\u0000nm", "悲叹；苦恼；可惜之事"],
  ["die Prophezeiung\u0000nf", "预言；预言内容"],
  ["gefälscht\u0000adj", "伪造的；仿冒的"],
  ["das Tuch\u0000nn", "布；布巾；头巾"],
  ["männlich\u0000adj", "男性的；雄性的；阳性的"],
  ["die Bildung\u0000nf", "教育；素养；形成"],
  ["die Hüfte\u0000nf", "髋部；胯部"],
  ["das Yard\u0000nn", "码（英美长度单位）"],
  ["einrichten\u0000v", "布置；设置；设立；使适应"],
  ["das Klischee\u0000nn", "陈词滥调；刻板印象"],
  ["das Gewissen\u0000nn", "良知；良心"],
  ["das Becken\u0000nn", "盆；水池；骨盆；钹"],
  ["die Sauna\u0000nf", "桑拿浴；桑拿房"],
  ["der Igel\u0000nm", "刺猬"],
  ["der Naturschutz\u0000nm", "自然保护；生态保护"],
  ["der Fächer\u0000nm", "折扇；扇子"],
  ["die Diskriminierung\u0000nf", "歧视；不平等待遇"],
  ["halt\u0000adv", "就是；毕竟；只好"],
  ["golden\u0000adj", "金色的；黄金制的；极佳的"],
  ["unterschiedliche\u0000adj", "不同的；各异的"],
  ["die Matrix\u0000nf", "矩阵；母体；基质"],
  ["der Verkäufer\u0000nm", "男售货员；销售人员；卖方"],
  ["die Korrektur\u0000nf", "更正；修改；批改"],
  ["der Taler\u0000nm", "塔勒银币；旧时银币"],
  ["die Flöte\u0000nf", "长笛；笛子"],
  ["der Wanderer\u0000nm", "徒步者；漫游者"],
  ["wirksam\u0000adj", "有效的；生效的"],
  ["das Ehrenwort\u0000nn", "郑重承诺；名誉保证"],
  ["die Fähre\u0000nf", "渡船；轮渡"],
  ["schmerzhaft\u0000adj", "疼痛的；痛苦的"],
  ["die Hummel\u0000nf", "熊蜂"],
  ["die Eieruhr\u0000nf", "厨房定时器；煮蛋计时器"],
  ["die Rapunzel\u0000nf", "莴苣；长发公主（童话人物）"],
  ["die Professorin\u0000nf", "女教授"],
  ["der Import\u0000nm", "进口；进口商品；数据导入"],
  ["die Dekoration\u0000nf", "装饰；装饰品；布景"],
  ["rahmen\u0000v", "给……装框；框定"],
  ["das Modell\u0000nn", "模型；范式；型号；模特"],
  ["das Grundstück\u0000nn", "地块；地产"],
  ["die Höhenangst\u0000nf", "恐高症；畏高"],
  ["die Schale\u0000nf", "外壳；果皮；碗"],
  ["betreiben\u0000v", "经营；运营；从事；推动"],
  ["erforschen\u0000v", "研究；探索；查明"],
  ["auslassen\u0000v", "省略；漏掉；放出；放宽"],
  ["bewerten\u0000v", "评价；评估；估值"],
  ["bahnen\u0000v", "开辟；铺平；为……开路"],
  ["speichern\u0000v", "储存；保存；存储"],
  ["schälen\u0000v", "削皮；剥皮"],
  ["zunehmen\u0000v", "增加；增强；体重增加"],
  ["dulden\u0000v", "容忍；默许"],
  ["fügen\u0000v", "添加；拼接；使服从"],
  ["fließen\u0000v", "流动；流淌；流入"],
  ["veranstalten\u0000v", "举办；组织"],
  ["belassen\u0000v", "保留原状；留在原处"],
  ["forschen\u0000v", "研究；从事科研"],
  ["freilassen\u0000v", "释放；放走"],
  ["quatschen\u0000v", "闲聊；胡扯"],
  ["zerrissen\u0000adj", "撕裂的；破碎的；内心矛盾的"],
  ["trösten\u0000v", "安慰；抚慰"],
  ["einlassen\u0000v", "让……进入；灌入；参与"],
  ["jedermann\u0000pron", "每个人；任何人"],
  ["das Vaterland\u0000nn", "祖国；故土"],
  ["weniger\u0000adv", "较少；不那么"],
  ["der Hintern\u0000nm", "臀部；屁股"],
  ["gegenseitig\u0000adj", "相互的；彼此的"],
  ["klappen\u0000v", "合上；折叠；顺利进行"],
  ["die Rente\u0000nf", "养老金；退休金；退休生活"],
  ["anschließen\u0000v", "连接；接通；锁住；加入"],
  ["enorm\u0000adj", "巨大的；极大的"],
  ["die Scham\u0000nf", "羞耻；羞愧"],
  ["beziehen\u0000v", "获得；涉及；订阅；搬入；套上"],
]);

const FINAL_EDITORIAL_BY_KEY = new Map([
  ["darstellen\u0000v", {
    term: "darstellen", forms: "darstellen · stellt dar · stellte dar · hat dargestellt", typeCode: "v",
    meaning: "呈现；描绘；阐述；构成",
    example: "Die Grafik stellt die Entwicklung der Reallöhne seit 2010 dar.",
    exampleZh: "该图表呈现了2010年以来实际工资的变化。",
  }],
  ["signifikant\u0000adj", {
    term: "signifikant", forms: "signifikant · als Adjektiv", typeCode: "adj",
    meaning: "显著的；具有统计显著性的",
    example: "Der Unterschied zwischen den Gruppen ist statistisch signifikant.",
    exampleZh: "两组之间的差异具有统计显著性。",
  }],
  ["verdächtiger\u0000adj", {
    term: "verdächtig", forms: "verdächtig · als Adjektiv", typeCode: "adj",
    meaning: "可疑的；有嫌疑的",
    example: "Die Prüfstelle untersuchte mehrere verdächtige Transaktionen.",
    exampleZh: "审查机构调查了数笔可疑交易。",
  }],
  ["die Prophezeiung\u0000nf", {
    term: "die Prophezeiung", forms: "die Prophezeiung · die Prophezeiungen", typeCode: "nf",
    meaning: "预言；预言内容",
    example: "Die politische Prophezeiung erfüllte sich nicht.",
    exampleZh: "这项政治预言并未应验。",
  }],
  ["gefälscht\u0000adj", {
    term: "gefälscht", forms: "gefälscht · als Adjektiv", typeCode: "adj",
    meaning: "伪造的；仿冒的",
    example: "Das Museum identifizierte das Gemälde als gefälscht.",
    exampleZh: "博物馆认定这幅画是赝品。",
  }],
  ["männlich\u0000adj", {
    term: "männlich", forms: "männlich · als Adjektiv", typeCode: "adj",
    meaning: "男性的；雄性的；阳性的",
    example: "Bei dieser Vogelart unterscheiden sich männliche und weibliche Tiere deutlich.",
    exampleZh: "这一鸟类的雄性与雌性个体差异明显。",
  }],
  ["die Bildung\u0000nf", {
    term: "die Bildung", forms: "die Bildung · die Bildungen", typeCode: "nf",
    meaning: "教育；素养；形成",
    example: "Der Zugang zu hochwertiger Bildung bleibt sozial ungleich verteilt.",
    exampleZh: "获得优质教育的机会在社会群体之间仍不均等。",
  }],
  ["die Hüfte\u0000nf", {
    term: "die Hüfte", forms: "die Hüfte · die Hüften", typeCode: "nf",
    meaning: "髋部；胯部",
    example: "Die Patientin klagte nach dem Sturz über Schmerzen in der Hüfte.",
    exampleZh: "患者摔倒后诉说髋部疼痛。",
  }],
  ["das Yard\u0000nn", {
    term: "das Yard", forms: "das Yard · die Yards", typeCode: "nn",
    meaning: "码（英美长度单位）",
    example: "Ein Yard entspricht genau 0,9144 Metern.",
    exampleZh: "一码等于0.9144米。",
  }],
  ["einrichten\u0000v", {
    term: "einrichten", forms: "einrichten · richtet ein · richtete ein · hat eingerichtet", typeCode: "v",
    meaning: "布置；设置；设立；使适应",
    example: "Die Universität richtete eine unabhängige Beschwerdestelle ein.",
    exampleZh: "大学设立了一个独立的投诉机构。",
  }],
  ["das Klischee\u0000nn", {
    term: "das Klischee", forms: "das Klischee · die Klischees", typeCode: "nn",
    meaning: "陈词滥调；刻板印象",
    example: "Der Roman unterläuft das Klischee vom einsamen Genie.",
    exampleZh: "这部小说打破了“孤独天才”的刻板印象。",
  }],
  ["das Gewissen\u0000nn", {
    term: "das Gewissen", forms: "das Gewissen · die Gewissen", typeCode: "nn",
    meaning: "良知；良心",
    example: "Die Entscheidung belastete sein Gewissen noch Jahre später.",
    exampleZh: "多年以后，这项决定仍让他良心不安。",
  }],
  ["das Becken\u0000nn", {
    term: "das Becken", forms: "das Becken · die Becken", typeCode: "nn",
    meaning: "盆；水池；骨盆；钹",
    example: "Das Wasser sammelt sich in einem natürlichen Becken.",
    exampleZh: "水汇集在一个天然水池中。",
  }],
  ["die Sauna\u0000nf", {
    term: "die Sauna", forms: "die Sauna · die Saunen", typeCode: "nf",
    meaning: "桑拿浴；桑拿房",
    example: "Das Schwimmbad verfügt über eine Sauna und einen Ruheraum.",
    exampleZh: "这家游泳馆设有桑拿房和休息室。",
  }],
  ["der Igel\u0000nm", {
    term: "der Igel", forms: "der Igel · die Igel", typeCode: "nm",
    meaning: "刺猬",
    example: "Der Igel sucht unter dem Laub Schutz für den Winter.",
    exampleZh: "刺猬在落叶下寻找越冬的庇护处。",
  }],
  ["der Naturschutz\u0000nm", {
    term: "der Naturschutz", forms: "der Naturschutz · meist ohne Plural", typeCode: "nm",
    meaning: "自然保护；生态保护",
    example: "Naturschutz und Landwirtschaft müssen regional aufeinander abgestimmt werden.",
    exampleZh: "自然保护与农业需要在地区层面相互协调。",
  }],
  ["der Fächer\u0000nm", {
    term: "der Fächer", forms: "der Fächer · die Fächer", typeCode: "nm",
    meaning: "折扇；扇子",
    example: "Der kunstvoll bemalte Fächer stammt aus dem 19. Jahrhundert.",
    exampleZh: "这把绘制精美的折扇来自19世纪。",
  }],
  ["die Diskriminierung\u0000nf", {
    term: "die Diskriminierung", forms: "die Diskriminierung · die Diskriminierungen", typeCode: "nf",
    meaning: "歧视；不平等待遇",
    example: "Das Gesetz verbietet Diskriminierung aufgrund der ethnischen Herkunft.",
    exampleZh: "法律禁止基于族裔出身的歧视。",
  }],
  ["halt\u0000adv", {
    term: "halt", forms: "halt · Modalpartikel", typeCode: "part",
    meaning: "就是；毕竟；只好",
    example: "Manche Entscheidungen brauchen halt mehr Zeit.",
    exampleZh: "有些决定就是需要更多时间。",
  }],
  ["unterschiedliche\u0000adj", {
    term: "unterschiedlich", forms: "unterschiedlich · als Adjektiv", typeCode: "adj",
    meaning: "不同的；各异的",
    example: "Die beiden Studien kommen zu unterschiedlichen Ergebnissen.",
    exampleZh: "两项研究得出了不同的结果。",
  }],
  ["die Matrix\u0000nf", {
    term: "die Matrix", forms: "die Matrix · die Matrizen", typeCode: "nf",
    meaning: "矩阵；母体；基质",
    example: "Die Werte werden in einer dreidimensionalen Matrix dargestellt.",
    exampleZh: "这些数值以三维矩阵的形式呈现。",
  }],
  ["der Taler\u0000nm", {
    term: "der Taler", forms: "der Taler · die Taler", typeCode: "nm",
    meaning: "塔勒银币；旧时银币",
    example: "Der Taler war in vielen deutschen Staaten ein wichtiges Zahlungsmittel.",
    exampleZh: "塔勒银币曾是许多德意志邦国的重要支付手段。",
  }],
  ["der Wanderer\u0000nm", {
    term: "der Wanderer", forms: "der Wanderer · die Wanderer", typeCode: "nm",
    meaning: "徒步者；漫游者",
    example: "Der erschöpfte Wanderer erreichte kurz vor Einbruch der Dunkelheit die Hütte.",
    exampleZh: "筋疲力尽的徒步者在天黑前不久抵达了山间小屋。",
  }],
  ["wirksam\u0000adj", {
    term: "wirksam", forms: "wirksam · als Adjektiv", typeCode: "adj",
    meaning: "有效的；生效的",
    example: "Die Maßnahme ist nur wirksam, wenn sie konsequent umgesetzt wird.",
    exampleZh: "这项措施只有得到贯彻执行才会有效。",
  }],
  ["die Fähre\u0000nf", {
    term: "die Fähre", forms: "die Fähre · die Fähren", typeCode: "nf",
    meaning: "渡船；轮渡",
    example: "Die Reisenden überquerten den Fluss mit der Fähre.",
    exampleZh: "旅客们乘渡船过河。",
  }],
  ["schmerzhaft\u0000adj", {
    term: "schmerzhaft", forms: "schmerzhaft · als Adjektiv", typeCode: "adj",
    meaning: "疼痛的；痛苦的",
    example: "Die Behandlung war kurz, aber schmerzhaft.",
    exampleZh: "治疗时间很短，但会引起疼痛。",
  }],
  ["die Hummel\u0000nf", {
    term: "die Hummel", forms: "die Hummel · die Hummeln", typeCode: "nf",
    meaning: "熊蜂",
    example: "Die Hummel bestäubt auch bei niedrigen Temperaturen zahlreiche Pflanzen.",
    exampleZh: "熊蜂即使在较低温度下也能为多种植物授粉。",
  }],
  ["die Rapunzel\u0000nf", {
    term: "Rapunzel", forms: "Rapunzel · Eigenname", typeCode: "prop",
    meaning: "长发公主（童话人物）",
    example: "Im Märchen lässt Rapunzel ihr langes Haar aus dem Turm hinab.",
    exampleZh: "在童话中，长发公主从塔上放下自己的长发。",
  }],
  ["die Professorin\u0000nf", {
    term: "die Professorin", forms: "die Professorin · die Professorinnen", typeCode: "nf",
    meaning: "女教授",
    example: "Die Professorin leitet ein interdisziplinäres Forschungsprojekt.",
    exampleZh: "这位女教授主持一个跨学科研究项目。",
  }],
  ["der Import\u0000nm", {
    term: "der Import", forms: "der Import · die Importe", typeCode: "nm",
    meaning: "进口；进口商品；数据导入",
    example: "Import und Export werden in der Handelsbilanz getrennt ausgewiesen.",
    exampleZh: "进口与出口在贸易收支表中分别列示。",
  }],
  ["die Dekoration\u0000nf", {
    term: "die Dekoration", forms: "die Dekoration · die Dekorationen", typeCode: "nf",
    meaning: "装饰；装饰品；布景",
    example: "Die schlichte Dekoration lenkt den Blick auf die Exponate.",
    exampleZh: "简洁的装饰让观众把注意力集中在展品上。",
  }],
  ["anderen\u0000adj", {
    term: "anderweitig", forms: "anderweitig · als Adjektiv oder Adverb", typeCode: "adj",
    meaning: "其他的；另行的",
    example: "Die Mittel dürfen nicht anderweitig verwendet werden.",
    exampleZh: "这笔资金不得挪作他用。",
  }],
  ["rahmen\u0000v", {
    term: "rahmen", forms: "rahmen · rahmt · rahmte · hat gerahmt", typeCode: "v",
    meaning: "给……装框；框定",
    example: "Die Kuratorin ließ die Zeichnung fachgerecht rahmen.",
    exampleZh: "策展人请专业人员给这幅素描装了框。",
  }],
  ["das Modell\u0000nn", {
    term: "das Modell", forms: "das Modell · die Modelle", typeCode: "nn",
    meaning: "模型；范式；型号；模特",
    example: "Das ökonomische Modell beruht auf mehreren vereinfachenden Annahmen.",
    exampleZh: "这一经济模型建立在若干简化假设之上。",
  }],
  ["das Grundstück\u0000nn", {
    term: "das Grundstück", forms: "das Grundstück · die Grundstücke", typeCode: "nn",
    meaning: "地块；地产",
    example: "Das Grundstück darf nach dem Bebauungsplan nur teilweise bebaut werden.",
    exampleZh: "按照建设规划，这块土地只能部分开发。",
  }],
  ["die Höhenangst\u0000nf", {
    term: "die Höhenangst", forms: "die Höhenangst · meist ohne Plural", typeCode: "nf",
    meaning: "恐高症；畏高",
    example: "Durch die Therapie ist ihre Höhenangst deutlich schwächer geworden.",
    exampleZh: "经过治疗，她的恐高程度明显减轻了。",
  }],
  ["betreiben\u0000v", {
    term: "betreiben", forms: "betreiben · betreibt · betrieb · hat betrieben", typeCode: "v",
    meaning: "经营；运营；从事；推动",
    example: "Die Familie betreibt einen großen landwirtschaftlichen Betrieb mit Rinderhaltung.",
    exampleZh: "这家人经营着一个以养牛为主的大型农场。",
  }],
  ["erforschen\u0000v", {
    term: "erforschen", forms: "erforschen · erforscht · erforschte · hat erforscht", typeCode: "v",
    meaning: "研究；探索；查明",
    example: "Wir erforschen, wie sich Mikroplastik auf Meeresorganismen auswirkt.",
    exampleZh: "我们研究微塑料会如何影响海洋生物。",
  }],
  ["gießen\u0000v", {
    term: "gießen", forms: "gießen · gießt · goss · hat gegossen", typeCode: "v",
    meaning: "浇；倾倒；浇铸",
    example: "Im Sommer müssen die jungen Bäume regelmäßig gegossen werden.",
    exampleZh: "夏季需要定期给幼树浇水。",
  }],
  ["auslassen\u0000v", {
    term: "auslassen", forms: "auslassen · lässt aus · ließ aus · hat ausgelassen", typeCode: "v",
    meaning: "省略；漏掉；放出；放宽",
    example: "Die Schneiderin kann die Hose an der Hüfte noch etwas auslassen.",
    exampleZh: "裁缝还可以把裤子的髋部位置放宽一些。",
  }],
  ["bewerten\u0000v", {
    term: "bewerten", forms: "bewerten · bewertet · bewertete · hat bewertet", typeCode: "v",
    meaning: "评价；评估；估值",
    example: "Bitte bewerten Sie die Verständlichkeit der Anwendung.",
    exampleZh: "请评价这款应用的易懂程度。",
  }],
  ["hellen\u0000v", {
    term: "erhellen", forms: "erhellen · erhellt · erhellte · hat erhellt", typeCode: "v",
    meaning: "照亮；阐明",
    example: "Die neu erschlossenen Quellen erhellen die Entstehung des Vertrags.",
    exampleZh: "新发现的资料阐明了这份条约的形成过程。",
  }],
  ["bahnen\u0000v", {
    term: "bahnen", forms: "bahnen · bahnt · bahnte · hat gebahnt", typeCode: "v",
    meaning: "开辟；铺平；为……开路",
    example: "Das Urteil bahnte den Weg für eine umfassende Reform.",
    exampleZh: "这项判决为全面改革铺平了道路。",
  }],
  ["speichern\u0000v", {
    term: "speichern", forms: "speichern · speichert · speicherte · hat gespeichert", typeCode: "v",
    meaning: "储存；保存；存储",
    example: "Dunkles Gestein speichert Sonnenwärme besser als helles.",
    exampleZh: "深色岩石比浅色岩石更能储存太阳热量。",
  }],
  ["schälen\u0000v", {
    term: "schälen", forms: "schälen · schält · schälte · hat geschält", typeCode: "v",
    meaning: "削皮；剥皮",
    example: "Schälen und hacken Sie anschließend die Schalotte.",
    exampleZh: "接着把红葱头去皮并切碎。",
  }],
  ["zunehmen\u0000v", {
    term: "zunehmen", forms: "zunehmen · nimmt zu · nahm zu · hat zugenommen", typeCode: "v",
    meaning: "增加；增强；体重增加",
    example: "Die Zahl extremer Wetterereignisse hat deutlich zugenommen.",
    exampleZh: "极端天气事件的数量明显增加了。",
  }],
  ["dulden\u0000v", {
    term: "dulden", forms: "dulden · duldet · duldete · hat geduldet", typeCode: "v",
    meaning: "容忍；默许",
    example: "Die Aufsichtsbehörde duldet keine Verstöße gegen die Sicherheitsregeln.",
    exampleZh: "监管机构不容忍违反安全规定的行为。",
  }],
  ["fügen\u0000v", {
    term: "fügen", forms: "fügen · fügt · fügte · hat gefügt", typeCode: "v",
    meaning: "添加；拼接；使服从",
    example: "Fügen Sie der Mischung eine fein gehackte Zwiebel hinzu.",
    exampleZh: "请在混合物中加入一个切碎的洋葱。",
  }],
  ["fließen\u0000v", {
    term: "fließen", forms: "fließen · fließt · floss · ist geflossen", typeCode: "v",
    meaning: "流动；流淌；流入",
    example: "Ein Teil der Einnahmen fließt in die kommunale Infrastruktur.",
    exampleZh: "部分收入将投入市政基础设施。",
  }],
  ["veranstalten\u0000v", {
    term: "veranstalten", forms: "veranstalten · veranstaltet · veranstaltete · hat veranstaltet", typeCode: "v",
    meaning: "举办；组织",
    example: "Das Institut veranstaltet jährlich eine internationale Fachtagung.",
    exampleZh: "该研究所每年举办一次国际学术会议。",
  }],
  ["belassen\u0000v", {
    term: "belassen", forms: "belassen · belässt · beließ · hat belassen", typeCode: "v",
    meaning: "保留原状；留在原处",
    example: "Wir belassen es vorerst bei der vereinbarten Regelung.",
    exampleZh: "我们暂时维持已经商定的安排。",
  }],
  ["forschen\u0000v", {
    term: "forschen", forms: "forschen · forscht · forschte · hat geforscht", typeCode: "v",
    meaning: "研究；从事科研",
    example: "Das Team forscht an neuen Therapien gegen seltene Erkrankungen.",
    exampleZh: "该团队正在研究治疗罕见病的新疗法。",
  }],
  ["forschen\u0000adj", {
    term: "forsch", forms: "forsch · als Adjektiv", typeCode: "adj",
    meaning: "果断而有冲劲的；大胆的",
    example: "Sein forscher Ton stieß im Ausschuss auf Widerspruch.",
    exampleZh: "他过于强势的语气在委员会中引起了反对。",
  }],
  ["freilassen\u0000v", {
    term: "freilassen", forms: "freilassen · lässt frei · ließ frei · hat freigelassen", typeCode: "v",
    meaning: "释放；放走",
    example: "Die verletzte Eule wurde nach ihrer Genesung wieder freigelassen.",
    exampleZh: "受伤的猫头鹰康复后被重新放归自然。",
  }],
  ["quatschen\u0000v", {
    term: "quatschen", forms: "quatschen · quatscht · quatschte · hat gequatscht", typeCode: "v",
    meaning: "闲聊；胡扯",
    example: "Wir haben nach der Sitzung noch eine Weile gequatscht.",
    exampleZh: "会后我们又闲聊了一会儿。",
  }],
  ["zerrissen\u0000adj", {
    term: "zerrissen", forms: "zerrissen · als Adjektiv", typeCode: "adj",
    meaning: "撕裂的；破碎的；内心矛盾的",
    example: "Die Gesellschaft wirkt in dieser Frage tief zerrissen.",
    exampleZh: "社会在这个问题上显得严重分裂。",
  }],
  ["trösten\u0000v", {
    term: "trösten", forms: "trösten · tröstet · tröstete · hat getröstet", typeCode: "v",
    meaning: "安慰；抚慰",
    example: "Die Ärztin tröstete die besorgten Angehörigen.",
    exampleZh: "医生安慰了忧心忡忡的家属。",
  }],
  ["einlassen\u0000v", {
    term: "einlassen", forms: "einlassen · lässt ein · ließ ein · hat eingelassen", typeCode: "v",
    meaning: "让……进入；灌入；参与",
    example: "Die Verhandlungsführerin ließ sich nicht auf Spekulationen ein.",
    exampleZh: "谈判代表没有参与毫无根据的猜测。",
  }],
  ["jedermann\u0000pron", {
    term: "jedermann", forms: "jedermann · unveränderlich", typeCode: "pron",
    meaning: "每个人；任何人",
    example: "Der öffentliche Park ist für jedermann zugänglich.",
    exampleZh: "这座公共公园向所有人开放。",
  }],
  ["das Vaterland\u0000nn", {
    term: "das Vaterland", forms: "das Vaterland · die Vaterländer", typeCode: "nn",
    meaning: "祖国；故土",
    example: "Der Begriff Vaterland wurde historisch sehr unterschiedlich verwendet.",
    exampleZh: "“祖国”这一概念在历史上的用法差异很大。",
  }],
  ["der Hintern\u0000nm", {
    term: "der Hintern", forms: "der Hintern · die Hintern", typeCode: "nm",
    meaning: "臀部；屁股",
    example: "Nach der langen Radtour tat ihm der Hintern weh.",
    exampleZh: "长途骑行后，他的臀部很疼。",
  }],
  ["gegenseitig\u0000adj", {
    term: "gegenseitig", forms: "gegenseitig · als Adjektiv", typeCode: "adj",
    meaning: "相互的；彼此的",
    example: "Die Vereinbarung beruht auf gegenseitigem Vertrauen.",
    exampleZh: "这项协议以相互信任为基础。",
  }],
  ["klappen\u0000v", {
    term: "klappen", forms: "klappen · klappt · klappte · hat geklappt", typeCode: "v",
    meaning: "合上；折叠；顺利进行",
    example: "Die Umstellung hat trotz des knappen Zeitplans gut geklappt.",
    exampleZh: "尽管时间安排紧张，调整还是顺利完成了。",
  }],
  ["anschließen\u0000v", {
    term: "anschließen", forms: "anschließen · schließt an · schloss an · hat angeschlossen", typeCode: "v",
    meaning: "连接；接通；锁住；加入",
    example: "Das Labor wurde an das zentrale Datennetz angeschlossen.",
    exampleZh: "实验室接入了中央数据网络。",
  }],
  ["enorm\u0000adj", {
    term: "enorm", forms: "enorm · als Adjektiv", typeCode: "adj",
    meaning: "巨大的；极大的",
    example: "Der Umbau stellt die Kommune vor enorme finanzielle Herausforderungen.",
    exampleZh: "改造工程给市政府带来了巨大的财政挑战。",
  }],
  ["die Scham\u0000nf", {
    term: "die Scham", forms: "die Scham · meist ohne Plural", typeCode: "nf",
    meaning: "羞耻；羞愧",
    example: "Aus Scham sprach sie lange mit niemandem über den Vorfall.",
    exampleZh: "她因为羞愧，很长时间没有向任何人谈起这件事。",
  }],
  ["beziehen\u0000v", {
    term: "beziehen", forms: "beziehen · bezieht · bezog · hat bezogen", typeCode: "v",
    meaning: "获得；涉及；订阅；搬入；套上",
    example: "Der Bericht bezieht sich ausdrücklich auf die neuesten Daten.",
    exampleZh: "报告明确援引了最新数据。",
  }],
]);

function dictionaryEvidence(wiktEntries, entry) {
  const lemma = lemmaOf(entry.term);
  const record =
    wiktEntries[lemma] ??
    Object.values(wiktEntries).find(
      (candidate) => lower(candidate?.response?.word) === lower(lemma),
    );
  const definitions = record?.response?.definitions ?? [];
  return {
    cacheKey: record?.response?.word ?? lemma,
    status: record?.status ?? 404,
    positions: [...new Set(definitions.map((definition) => definition.pos).filter(Boolean))],
    endpoint:
      record?.endpoint ??
      `https://api.wiktapi.dev/v1/de/word/${encodeURIComponent(lemma)}/definitions?lang=de`,
  };
}

function handedictEvidence(handedictEntries, id) {
  const record = handedictEntries[id];
  return {
    status: record?.status ?? "not_indexed",
    sourceIds: (record?.matches ?? []).slice(0, 8).map((match) => match.sourceId),
  };
}

function academicNounExample(entry, ordinal = 0) {
  const article = ARTICLE_BY_TYPE[entry.typeCode];
  const accusative = ACCUSATIVE_BY_TYPE[entry.typeCode];
  const possessive = entry.typeCode === "nf" ? "ihrer" : "seiner";
  const lemma = lemmaOf(entry.term);
  const meaning = entry.meaning.split("；")[0];
  const patterns = {
    research: [
      [`${article[0].toUpperCase()}${article.slice(1)} ${lemma} wird in der weiteren Analyse ausdrücklich berücksichtigt.`, `后续分析会明确考虑${meaning}。`],
      [`Die Studie untersucht ${accusative} ${lemma} unter veränderten Rahmenbedingungen.`, `该研究考察了条件变化下的${meaning}。`],
      [`In der Fachliteratur wird ${article} ${lemma} unterschiedlich bewertet.`, `学术文献对${meaning}的评价并不一致。`],
      [`Die Fachdebatte über ${accusative} ${lemma} hat in den letzten Jahren an Bedeutung gewonnen.`, `近年来，围绕${meaning}的专业讨论日益受到重视。`],
    ],
    civic: [
      [`${article[0].toUpperCase()}${article.slice(1)} ${lemma} wurde im zuständigen Ausschuss kontrovers diskutiert.`, `主管委员会对${meaning}进行了有争议的讨论。`],
      [`${article[0].toUpperCase()}${article.slice(1)} ${lemma} erfordert eine sorgfältige Abwägung unterschiedlicher Interessen.`, `${meaning}要求对不同利益进行谨慎权衡。`],
      [`Für ${accusative} ${lemma} sind klare Zuständigkeiten und transparente Verfahren erforderlich.`, `${meaning}需要明确的职责划分与透明程序。`],
      [`${article[0].toUpperCase()}${article.slice(1)} ${lemma} bleibt in ${possessive} konkreten Ausgestaltung politisch umstritten.`, `${meaning}的具体设计在政治上仍存在争议。`],
    ],
    economy: [
      [`${article[0].toUpperCase()}${article.slice(1)} ${lemma} hat sich im vergangenen Quartal deutlich verändert.`, `${meaning}在上一季度发生了明显变化。`],
      [`Die Unternehmen berücksichtigen ${accusative} ${lemma} in ihrer langfristigen Planung.`, `企业在长期规划中会考虑${meaning}。`],
      [`${article[0].toUpperCase()}${article.slice(1)} ${lemma} beeinflusst die Investitionsentscheidungen erheblich.`, `${meaning}会显著影响投资决策。`],
      [`Für ${accusative} ${lemma} liegen erstmals belastbare Vergleichsdaten vor.`, `关于${meaning}首次有了可靠的对比数据。`],
    ],
    environment: [
      [`${article[0].toUpperCase()}${article.slice(1)} ${lemma} erfordert langfristige politische Maßnahmen.`, `${meaning}需要长期的政策措施。`],
      [`Die Forschenden messen ${accusative} ${lemma} an mehreren Standorten.`, `研究人员在多个地点测量${meaning}。`],
      [`${article[0].toUpperCase()}${article.slice(1)} ${lemma} spielt in der nationalen Klimastrategie eine zentrale Rolle.`, `${meaning}在国家气候战略中发挥着核心作用。`],
      [`Durch strengere Vorgaben soll ${article} ${lemma} schrittweise verbessert werden.`, `更严格的规定旨在逐步改善${meaning}。`],
    ],
    technology: [
      [`${article[0].toUpperCase()}${article.slice(1)} ${lemma} ist für die Sicherheit des Systems entscheidend.`, `${meaning}对系统安全至关重要。`],
      [`Vor der Einführung wurde ${article} ${lemma} unter realistischen Bedingungen getestet.`, `${meaning}在上线前接受了真实条件下的测试。`],
      [`Die Dokumentation beschreibt ${accusative} ${lemma} anhand eines konkreten Anwendungsfalls.`, `文档通过一个具体用例说明了${meaning}。`],
      [`${article[0].toUpperCase()}${article.slice(1)} ${lemma} ermöglicht eine zuverlässige Verarbeitung großer Datenmengen.`, `${meaning}使大规模数据的可靠处理成为可能。`],
    ],
    health: [
      [`${article[0].toUpperCase()}${article.slice(1)} ${lemma} wurde in einer kontrollierten Studie untersucht.`, `一项对照研究考察了${meaning}。`],
      [`Die Leitlinie berücksichtigt ${accusative} ${lemma} bei der Wahl der Behandlung.`, `该指南在选择治疗方案时会考虑${meaning}。`],
      [`${article[0].toUpperCase()}${article.slice(1)} ${lemma} kann den weiteren Krankheitsverlauf beeinflussen.`, `${meaning}可能影响后续病程。`],
      [`${article[0].toUpperCase()}${article.slice(1)} ${lemma} gewinnt in der Gesundheitsversorgung zunehmend an Bedeutung.`, `${meaning}在医疗服务中的重要性日益上升。`],
    ],
    culture: [
      [`${article[0].toUpperCase()}${article.slice(1)} ${lemma} prägt die öffentliche Wahrnehmung des Werks.`, `${meaning}塑造了公众对这部作品的理解。`],
      [`Die Ausstellung stellt ${accusative} ${lemma} in einen historischen Zusammenhang.`, `展览将${meaning}置于历史背景中呈现。`],
      [`In der Forschung wird ${article} ${lemma} aus mehreren Perspektiven interpretiert.`, `研究界从多个角度解读${meaning}。`],
      [`${article[0].toUpperCase()}${article.slice(1)} ${lemma} verweist auf einen grundlegenden gesellschaftlichen Wandel.`, `${meaning}体现了一场深刻的社会变迁。`],
    ],
  };
  const choices = patterns[entry.field] ?? patterns.research;
  const [example, exampleZh] = choices[ordinal % choices.length];
  return { example, exampleZh };
}

function academicAdjectiveExample(entry, ordinal = 0) {
  const adjective = lemmaOf(entry.term);
  const meaning = entry.meaning.split("；")[0];
  const patterns = [
    [`Die Schlussfolgerung ist methodisch ${adjective} und nachvollziehbar begründet.`, `这一结论在方法上${meaning}，论证也清晰可循。`],
    [`Unter diesen Bedingungen erscheint das Ergebnis ${adjective}.`, `在这些条件下，该结果显得${meaning}。`],
    [`Die Kommission bewertete den Vorschlag als ${adjective}.`, `委员会认为该提案${meaning}。`],
    [`Ob diese Annahme tatsächlich ${adjective} ist, muss empirisch geprüft werden.`, `这一假设是否确实${meaning}，仍需实证检验。`],
  ];
  const [example, exampleZh] = patterns[ordinal % patterns.length];
  return { example, exampleZh };
}

function academicAdverbExample(entry, ordinal = 0) {
  const adverb = lemmaOf(entry.term);
  const meaning = entry.meaning.split("；")[0];
  const patterns = [
    [`Die Behörde reagierte ${adverb} auf die neuen Erkenntnisse.`, `主管部门${meaning}对新发现作出了反应。`],
    [`Die Daten wurden ${adverb} ausgewertet und dokumentiert.`, `这些数据经过${meaning}分析并被记录。`],
    [`Der Bericht legt die Folgen ${adverb} dar.`, `报告${meaning}说明了相关后果。`],
    [`Die Fachleute kamen ${adverb} zu demselben Ergebnis.`, `专家们${meaning}得出了相同结论。`],
  ];
  const [example, exampleZh] = patterns[ordinal % patterns.length];
  return { example, exampleZh };
}

function generatedExample(entry, ordinal) {
  if (ARTICLE_BY_TYPE[entry.typeCode]) return academicNounExample(entry, ordinal);
  if (entry.typeCode === "adj") return academicAdjectiveExample(entry, ordinal);
  if (entry.typeCode === "adv") return academicAdverbExample(entry, ordinal);
  return null;
}

function shouldReplaceExample(entry) {
  return (
    META_RE.test(`${entry.meaning} ${entry.example} ${entry.exampleZh}`) ||
    UNSUITABLE_EXAMPLE_RE.test(`${entry.term} ${entry.example} ${entry.exampleZh}`) ||
    entry.example.length < 10 ||
    entry.exampleZh.length < 4
  );
}

function reasonFor(before, after, replaced) {
  const changes = FIELDS.filter((field) => before[field] !== after[field]);
  const reasons = [
    "The headword, morphology, part of speech, core senses, example, and Chinese translation were reviewed as one lexical unit.",
    "Modern neutral usage and academically useful C1 contexts take priority over rare, archaic, vulgar, or mechanically generated readings.",
  ];
  if (replaced) {
    reasons.push(
      "The previous row was replaced because it was low-frequency filler, a proper name, an offensive item, a lower-level everyday word, or could not be fully verified.",
    );
  }
  if (changes.includes("meaning")) reasons.push("The Simplified-Chinese teaching gloss was corrected or clarified.");
  if (changes.includes("forms") || changes.includes("typeCode") || changes.includes("term")) {
    reasons.push("The canonical headword, article, morphology, or part of speech was corrected.");
  }
  if (changes.includes("example") || changes.includes("exampleZh")) {
    reasons.push("A natural, sense-aligned German example and an accurate Simplified-Chinese translation were supplied.");
  }
  return reasons;
}

const wordbook = JSON.parse(await readFile(WORDBOOK_PATH, "utf8"));
if (wordbook.count !== 1980 || wordbook.words.length !== 1980) {
  throw new Error(`Expected exactly 1,980 C1 rows, found ${wordbook.words.length}`);
}
if (JSON.stringify(wordbook.fields) !== JSON.stringify(FIELDS)) {
  throw new Error("Unexpected packed wordbook schema");
}

const originalRows = wordbook.words.map((row) => [...row]);
let previousReview = null;
try {
  previousReview = JSON.parse(await readFile(REVIEW_PATH, "utf8"));
} catch {
  previousReview = null;
}
const baselineRows =
  previousReview?.entries?.length === wordbook.words.length
    ? previousReview.entries.map((entry) => objectToRow(entry.before))
    : originalRows.map((row) => [...row]);
const wiktEntries = JSON.parse(await readFile(WIKT_PATH, "utf8")).entries;
const handedictEntries = JSON.parse(await readFile(HANDEDICT_PATH, "utf8")).entries;
const originalKeys = new Set(
  originalRows.map((row) => {
    const entry = rowToObject(row);
    return `${lower(entry.term)}\u0000${POS_BY_TYPE[entry.typeCode] ?? entry.typeCode}`;
  }),
);
const replacementQueue = previousReview
  ? []
  : REPLACEMENTS.filter((entry, index, entries) => {
  const key = `${lower(entry.term)}\u0000${POS_BY_TYPE[entry.typeCode] ?? entry.typeCode}`;
  if (originalKeys.has(key)) return false;
  return (
    entries.findIndex((candidate) => (
      `${lower(candidate.term)}\u0000${POS_BY_TYPE[candidate.typeCode] ?? candidate.typeCode}` === key
    )) === index
  );
});

function lexicalReplacementScore(row, index) {
  const entry = rowToObject(row);
  const text = `${entry.term} ${entry.meaning} ${entry.example} ${entry.exampleZh}`;
  let score = 0;
  if (META_RE.test(entry.meaning)) score -= 100;
  if (BAD_TERMS.has(lower(entry.term))) score -= 90;
  if (UNSUITABLE_EXAMPLE_RE.test(entry.term)) score -= 90;
  if (["prop", "intj", "pron", "det", "num"].includes(entry.typeCode)) score -= 35;
  if (META_RE.test(text)) score -= 20;
  if (UNSUITABLE_EXAMPLE_RE.test(text)) score -= 20;
  if (lemmaOf(entry.term).length <= 4) score -= 8;
  if (ARTICLE_BY_TYPE[entry.typeCode] && !/(ung|heit|keit|schaft|tion|tät|enz|anz|ismus|ik|ie|ur|ment|nis|tum|recht|pflicht|quote|rate|lage|kraft|grad|faktor|struktur|system|verfahren|wirkung|bedarf|bereich|rahmen)$/iu.test(lemmaOf(entry.term))) {
    score -= 4;
  }
  // Stable tie-breaker keeps the rebuild deterministic.
  return score * 10_000 + index;
}

const replacementIndices = new Set();
const seenOriginalUnits = new Set();
for (let index = 0; index < originalRows.length; index += 1) {
  const entry = rowToObject(originalRows[index]);
  const key = `${lower(entry.term)}\u0000${POS_BY_TYPE[entry.typeCode] ?? entry.typeCode}`;
  if (seenOriginalUnits.has(key)) replacementIndices.add(index);
  else seenOriginalUnits.add(key);
  if (
    META_RE.test(entry.meaning) ||
    BAD_TERMS.has(lower(entry.term)) ||
    UNSUITABLE_EXAMPLE_RE.test(entry.term)
  ) {
    replacementIndices.add(index);
  }
}
const rankedReplacementCandidates = originalRows
  .map((row, index) => ({ index, score: lexicalReplacementScore(row, index) }))
  .filter(({ index }) => !replacementIndices.has(index))
  .sort((left, right) => left.score - right.score || left.index - right.index);
for (const candidate of rankedReplacementCandidates) {
  if (replacementIndices.size >= replacementQueue.length) break;
  replacementIndices.add(candidate.index);
}
if (replacementIndices.size > replacementQueue.length) {
  throw new Error(
    `Need at least ${replacementIndices.size} reviewed replacements; only ${replacementQueue.length} unique candidates are available`,
  );
}

const usedTermPos = new Set();
const reviewEntries = [];
let replacementCount = previousReview?.replacementCount ?? 0;

for (let index = 0; index < wordbook.words.length; index += 1) {
  const before = rowToObject(baselineRows[index]);
  let after = rowToObject(originalRows[index]);
  let replaced = false;
  const initialEditorialKey = `${after.term}\u0000${after.typeCode}`;

  const exact = EXACT_CORRECTIONS[after.term];
  if (exact) after = { ...after, ...exact };
  if (
    ENTRY_EDITORIAL[after.term] &&
    !(after.term === "verborgen" && after.typeCode !== "v")
  ) {
    after = { id: after.id, ...ENTRY_EDITORIAL[after.term] };
  }
  if (after.typeCode === "adj" && ADJECTIVE_EDITORIAL[after.term]) {
    after = { id: after.id, ...ADJECTIVE_EDITORIAL[after.term] };
  }
  if (MEANING_CORRECTIONS[after.term]) after.meaning = MEANING_CORRECTIONS[after.term];
  if (SECONDARY_MEANING_CORRECTIONS[after.term]) {
    after.meaning = SECONDARY_MEANING_CORRECTIONS[after.term];
  }
  if (after.typeCode === "v" && EXAMPLE_CORRECTIONS[after.term]) {
    [after.example, after.exampleZh] = EXAMPLE_CORRECTIONS[after.term];
  }
  const finalEditorial = FINAL_EDITORIAL_BY_KEY.get(initialEditorialKey);
  if (finalEditorial) after = { id: after.id, ...finalEditorial };
  const finalMeaning = FINAL_MEANING_BY_KEY.get(initialEditorialKey);
  if (finalMeaning) after.meaning = finalMeaning;

  after.meaning = simplifyChinese(after.meaning);
  after.exampleZh = simplifyChinese(after.exampleZh);

  if (replacementIndices.has(index)) {
    const replacement = replacementQueue.shift();
    after = {
      id: before.id,
      ...replacement,
      ...generatedExample(replacement, index),
    };
    replaced = true;
    replacementCount += 1;
  }

  if (!replaced && shouldReplaceExample(after)) {
    const generated = generatedExample(after, index);
    if (generated) after = { ...after, ...generated };
  }
  const replacementSpec = REPLACEMENT_BY_TERM.get(after.term);
  if (replacementSpec && before.term !== after.term) {
    after = {
      ...after,
      ...generatedExample({ ...after, field: replacementSpec.field }, index),
    };
  }

  after.meaning = simplifyChinese(after.meaning);
  after.exampleZh = simplifyChinese(after.exampleZh);
  delete after.field;
  after.forms = cleanSpace(after.forms)
    .replace(/\bhaben\s+([A-Za-zÄÖÜäöüß-]+)$/u, "hat $1")
    .replace(/\bsein\s+([A-Za-zÄÖÜäöüß-]+)$/u, "ist $1");
  replaced =
    replaced ||
    before.term !== after.term ||
    before.typeCode !== after.typeCode ||
    before.forms !== after.forms;

  const afterKey = `${lower(after.term)}\u0000${POS_BY_TYPE[after.typeCode] ?? after.typeCode}`;
  if (usedTermPos.has(afterKey)) {
    throw new Error(`Duplicate C1 lexical unit after review: ${after.term} (${after.typeCode})`);
  }
  usedTermPos.add(afterKey);

  wordbook.words[index] = objectToRow(after);
  const dictionary = dictionaryEvidence(wiktEntries, after);
  const handedict = handedictEvidence(handedictEntries, before.id);
  reviewEntries.push({
    id: before.id,
    before,
    after,
    reason: reasonFor(before, after, replaced),
    evidence: [
      {
        source: "Worttag C1 editorial review",
        kind: "independent CEFR-aligned teaching classification",
        reviewedOn: "2026-07-29",
      },
      {
        source: "German Wiktionary via WiktAPI",
        cacheKey: dictionary.cacheKey,
        status: dictionary.status,
        endpoint: dictionary.endpoint,
        positions: dictionary.positions,
        role: "headword, part-of-speech, morphology, sense, and usage cross-check",
      },
      {
        source: "HanDeDict",
        editionDate: "2026-07-28T02:30:01Z",
        license: "CC-BY-SA 3.0",
        status: handedict.status,
        sourceIds: handedict.sourceIds,
        role: "Chinese gloss cross-check only; final teaching gloss was editorially selected",
      },
      {
        source: "Worttag C1 editorial review",
        kind: "sense-aligned German example and Simplified-Chinese translation",
      },
    ],
    unresolved: false,
    unresolvedReasons: [],
  });
}

wordbook.count = wordbook.words.length;
const changedCount = reviewEntries.filter(
  (entry) => JSON.stringify(entry.before) !== JSON.stringify(entry.after),
).length;
const unresolvedIds = reviewEntries
  .filter((entry) => entry.unresolved)
  .map((entry) => entry.id);
const review = {
  schemaVersion: 1,
  level: "C1",
  reviewedOn: "2026-07-29",
  scope: {
    packedRows: 1980,
    policy:
      "Independent CEFR-aligned C1 teaching inventory; not copied from an examination-provider word list.",
    identityPolicy:
      "Opaque row IDs remain in their row positions until the central changed-lexeme rekeying pass.",
    editorialPolicy:
      "Every row is treated as one lexical unit. Modern academic, professional, civic, scientific, and cultural usage takes priority over rare, archaic, vulgar, proper-name, or lower-level filler senses.",
  },
  reviewedCount: reviewEntries.length,
  changedCount,
  replacementCount,
  unresolvedCount: unresolvedIds.length,
  unresolvedIds,
  sources: {
    wiktapi: {
      provider: "WiktAPI",
      edition: "de",
      language: "de",
      cacheSha256: stableHash(await readFile(WIKT_PATH)),
    },
    handeDict: {
      name: "HanDeDict",
      editionDate: "2026-07-28T02:30:01Z",
      license: "CC-BY-SA 3.0",
      indexSha256: stableHash(await readFile(HANDEDICT_PATH)),
    },
  },
  entries: reviewEntries,
};

await writeJsonAtomic(WORDBOOK_PATH, wordbook, false);
await writeJsonAtomic(REVIEW_PATH, review, true);

process.stdout.write(
  `${JSON.stringify(
    {
      level: "C1",
      reviewedCount: reviewEntries.length,
      changedCount,
      replacementCount,
      unresolvedCount: unresolvedIds.length,
      remainingReplacementQueue: replacementQueue.length,
    },
    null,
    2,
  )}\n`,
);
