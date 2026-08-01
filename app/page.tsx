"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { packCloudPayload, unpackCloudPayload } from "./cloud-payload";
import {
  buildLibrarySearchText,
  matchesLibrarySearch,
  tokenizeLibraryQuery,
} from "./library-search";
import { buildDictionaryLinks } from "./dictionary-links";
import {
  parseDictionaryEvidencePayload,
  type DictionaryEvidence,
} from "./dictionary-evidence";

type RecallStatus = "unknown" | "fuzzy" | "known";
type View = "learn" | "review" | "library" | "story" | "settings";
type ThemeMode = "light" | "dark" | "system";
type SkinMode = "parchment" | "mist" | "forest" | "wine" | "graphite";
type CEFRLevel = "A1" | "A2" | "B1" | "B2" | "C1";
type WordOrder = "sequential" | "random";
type SpeechSpeed = "slow" | "standard" | "natural";
type DictionaryEvidenceStatus = "idle" | "loading" | "success" | "error";

type WordCard = {
  id: string;
  level: CEFRLevel;
  term: string;
  forms: string;
  type: string;
  meaning: string;
  example: string;
  exampleZh: string;
  grammarTitle: string;
  grammar: string;
  memory: string;
  storyDe: string;
  storyZh: string;
};

type PackedWordType =
  | "nm"
  | "nf"
  | "nn"
  | "v"
  | "adj"
  | "adv"
  | "prep"
  | "conj"
  | "pron"
  | "det"
  | "num"
  | "part"
  | "intj"
  | "prop"
  | "phrase";

type PackedWordRow = [
  id: string,
  term: string,
  forms: string,
  typeCode: PackedWordType,
  meaning: string,
  example: string,
  exampleZh: string,
];

type PackedWordbook = {
  schemaVersion: 1;
  level: CEFRLevel;
  count: number;
  fields: ["id", "term", "forms", "typeCode", "meaning", "example", "exampleZh"];
  words: PackedWordRow[];
};

type MemoryRecord = {
  status: RecallStatus;
  stage: number;
  dueAt: number;
  intervalDays: number;
  knownStreak: number;
  lapseCount: number;
  lastReviewedAt: number | null;
  sameDayLapses: number;
  lapseDayKey: string | null;
  updatedAt: number;
};

type LearningState = {
  records: Record<string, MemoryRecord>;
  todayKey: string;
  todayReviewed: number;
  todayWordIds: string[];
  todayReviewEventIds: string[];
  streakDays: number;
  sessionComplete: boolean;
  todayQueuesCompleted: number;
  todayQueueCompletionIds: string[];
  todayQueueLevel: CEFRLevel | null;
  todayQueueGoal: number | null;
  updatedAt: number;
  resetAt: number;
};

type AppSettings = {
  theme: ThemeMode;
  skin: SkinMode;
  wordsPerQueue: number;
  queuesPerDay: number;
  level: CEFRLevel;
  order: WordOrder;
  autoPronounce: boolean;
  showTranslation: boolean;
  dueFirst: boolean;
  speechSpeed: SpeechSpeed;
};

type SyncedSettings = Pick<
  AppSettings,
  "wordsPerQueue" | "queuesPerDay" | "level" | "order" | "dueFirst"
>;
type CloudSyncStatus = "connecting" | "saving" | "synced" | "offline" | "signed-out" | "error";

type CloudPayload = {
  schemaVersion: 1;
  learning: LearningState;
  settings: SyncedSettings;
  settingsUpdatedAt: number;
};

type CloudSnapshot = {
  payload: unknown;
  revision: number;
  resetAt: number;
  clientUpdatedAt: number;
  serverUpdatedAt: string;
};

const STORAGE_KEY = "worttag-learning-state-v1";
const SETTINGS_KEY = "worttag-settings-v1";
const SETTINGS_UPDATED_AT_KEY = "worttag-settings-updated-at-v1";
const CLOUD_META_KEY = "worttag-cloud-meta-v1";
const SYNCED_SETTING_KEYS: (keyof SyncedSettings)[] = [
  "wordsPerQueue",
  "queuesPerDay",
  "level",
  "order",
  "dueFirst",
];
const MINUTE = 60_000;
const DAY = 86_400_000;
const INTERVAL_DAYS = [0, 1, 3, 7, 14, 30, 60, 120, 180] as const;
const CEFR_LEVELS: CEFRLevel[] = ["A1", "A2", "B1", "B2", "C1"];
const LEVEL_RANK: Record<CEFRLevel, number> = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4 };
const COURSE_WORD_COUNTS: Record<CEFRLevel, number> = {
  A1: 700,
  A2: 700,
  B1: 1000,
  B2: 1600,
  C1: 2000,
};
const PACKED_WORD_FIELDS: PackedWordbook["fields"] = [
  "id",
  "term",
  "forms",
  "typeCode",
  "meaning",
  "example",
  "exampleZh",
];
const PACKED_WORD_TYPES = new Set<PackedWordType>([
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
]);
const LIBRARY_PAGE_SIZE = 96;
const REVIEW_PAGE_SIZE = 100;

const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  skin: "parchment",
  wordsPerQueue: 10,
  queuesPerDay: 2,
  level: "A1",
  order: "sequential",
  autoPronounce: false,
  showTranslation: true,
  dueFirst: true,
  speechSpeed: "standard",
};

const LEVEL_META: Record<CEFRLevel, { title: string; description: string; story: string; storyZh: string; topic: string }> = {
  A1: { title: "入门", description: "自我介绍、家庭与日常动作", story: "Ein ganz normaler Tag", storyZh: "平常的一天", topic: "Alltag" },
  A2: { title: "基础", description: "住房、工作、旅行与简单经历", story: "Ein neuer Anfang", storyZh: "新的开始", topic: "Neuanfang" },
  B1: { title: "独立", description: "叙述经历、处理问题与表达看法", story: "Ein kleiner Umweg", storyZh: "一个小小的绕路", topic: "Alltag" },
  B2: { title: "进阶", description: "复杂讨论、因果关系与抽象主题", story: "Ein Bahnhof für alle", storyZh: "属于大家的车站", topic: "Stadtleben" },
  C1: { title: "熟练", description: "精确表达、学术与专业语境", story: "Eine Frage der Tragweite", storyZh: "影响深远的问题", topic: "Bildung" },
};

const SPEECH_RATES: Record<SpeechSpeed, number> = {
  slow: 0.68,
  standard: 0.82,
  natural: 0.98,
};

function currentTimestamp() {
  return Date.now();
}

function mutationTimestamp(previous = 0) {
  return Math.max(currentTimestamp(), previous + 1);
}

function uniqueId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${currentTimestamp()}-${Math.random().toString(36).slice(2)}`;
}

const B1_BASE_WORDS: WordCard[] = [
  {
    id: "gewohnheit",
    level: "B1",
    term: "die Gewohnheit",
    forms: "die Gewohnheiten",
    type: "名词 · 阴性",
    meaning: "习惯；惯例",
    example: "Jeden Morgen trinkt sie aus Gewohnheit eine Tasse Kaffee.",
    exampleZh: "每天早晨，她习惯性地喝一杯咖啡。",
    grammarTitle: "aus Gewohnheit",
    grammar: "表示“出于习惯”，通常不加冠词。以 -heit 结尾的名词几乎总是阴性。",
    memory: "Gewohnheit 是已经形成的“习惯”；sich gewöhnen 是“逐渐习惯”。",
    storyDe: "Mara verlässt jeden Morgen aus Gewohnheit um sieben Uhr das Haus.",
    storyZh: "玛拉每天早晨都习惯在七点出门。",
  },
  {
    id: "verspaetung",
    level: "B1",
    term: "die Verspätung",
    forms: "die Verspätungen",
    type: "名词 · 阴性",
    meaning: "迟到；延误",
    example: "Der Zug hatte zwanzig Minuten Verspätung.",
    exampleZh: "火车晚点了二十分钟。",
    grammarTitle: "Verspätung haben",
    grammar: "交通工具晚点常说 Verspätung haben，也可以说 mit Verspätung ankommen。",
    memory: "来自 sich verspäten；-ung 结尾的名词通常为阴性。",
    storyDe: "Heute hat ihr Bus jedoch Verspätung.",
    storyZh: "但今天她乘坐的公交车晚点了。",
  },
  {
    id: "entscheiden",
    level: "B1",
    term: "sich entscheiden",
    forms: "entscheidet sich · entschied sich · hat sich entschieden",
    type: "反身动词",
    meaning: "决定；作出选择",
    example: "Nach langem Überlegen entschied sie sich für die kleinere Wohnung.",
    exampleZh: "仔细考虑之后，她选择了那套较小的公寓。",
    grammarTitle: "sich für + Akk. entscheiden",
    grammar: "选择某项事物用 für + 第四格；表示放弃某项选择时可用 gegen + 第四格。",
    memory: "把 für 理解成“决定站到这个选择的一边”。",
    storyDe: "Deshalb entscheidet sie sich, zu Fuß zur Arbeit zu gehen.",
    storyZh: "因此，她决定步行去上班。",
  },
  {
    id: "umweg",
    level: "B1",
    term: "der Umweg",
    forms: "die Umwege",
    type: "名词 · 阳性",
    meaning: "绕路；迂回路线",
    example: "Wegen der Baustelle müssen wir einen Umweg machen.",
    exampleZh: "因为施工，我们必须绕路。",
    grammarTitle: "einen Umweg machen",
    grammar: "常与 machen 或 nehmen 搭配。wegen 后面在正式书面语中通常接第二格。",
    memory: "um 是“绕着”，Weg 是“路”，合起来就是“绕路”。",
    storyDe: "Wegen einer Baustelle muss sie einen kleinen Umweg machen.",
    storyZh: "因为道路施工，她不得不稍微绕路。",
  },
  {
    id: "ruecksicht",
    level: "B1",
    term: "Rücksicht nehmen",
    forms: "nimmt Rücksicht · nahm Rücksicht · hat Rücksicht genommen",
    type: "固定搭配",
    meaning: "顾及；体谅",
    example: "Bitte nimm beim Telefonieren Rücksicht auf die anderen Fahrgäste.",
    exampleZh: "打电话时请顾及其他乘客。",
    grammarTitle: "Rücksicht nehmen auf + Akk.",
    grammar: "auf 后面固定接第四格。Rücksicht 本身通常不加冠词。",
    memory: "先“回头看”一下别人再行动，就是 Rücksicht nehmen。",
    storyDe: "Unterwegs nimmt sie Rücksicht auf ihren älteren Nachbarn Herrn Wolf und trägt eine seiner Einkaufstaschen.",
    storyZh: "途中，她体谅年长的邻居沃尔夫先生，还帮他提了一个购物袋。",
  },
  {
    id: "zuverlaessig",
    level: "B1",
    term: "zuverlässig",
    forms: "zuverlässiger · am zuverlässigsten",
    type: "形容词",
    meaning: "可靠的；守信的",
    example: "Unser Nachbar ist sehr zuverlässig und gießt im Urlaub unsere Pflanzen.",
    exampleZh: "我们的邻居很可靠，会在我们度假时帮忙浇花。",
    grammarTitle: "zuverlässig sein / arbeiten",
    grammar: "既可作表语，也可在名词前变格，例如 ein zuverlässiger Kollege。",
    memory: "可靠的人值得让你 auf ihn zählen——可以指望他。",
    storyDe: "Er ist sehr zuverlässig und gießt im Urlaub immer Maras Pflanzen.",
    storyZh: "他很可靠，玛拉度假时总会帮她浇花。",
  },
  {
    id: "gelegenheit",
    level: "B1",
    term: "die Gelegenheit",
    forms: "die Gelegenheiten",
    type: "名词 · 阴性",
    meaning: "机会；时机",
    example: "Ich nutze jede Gelegenheit, um mein Deutsch zu üben.",
    exampleZh: "我利用每一个机会练习德语。",
    grammarTitle: "die Gelegenheit nutzen, … zu",
    grammar: "后面可接带 zu 的不定式，也常用 um … zu 表示目的。",
    memory: "把 gute Gelegenheit 当作一个整体来记：一个好机会。",
    storyDe: "Mara nutzt die Gelegenheit, sich für seine Hilfe zu bedanken.",
    storyZh: "玛拉借这个机会感谢他的帮助。",
  },
  {
    id: "erledigen",
    level: "B1",
    term: "etwas erledigen",
    forms: "erledigt · erledigte · hat erledigt",
    type: "及物动词",
    meaning: "处理完；办妥",
    example: "Ich muss nach der Arbeit noch einige Besorgungen erledigen.",
    exampleZh: "下班后我还得办几件事。",
    grammarTitle: "etwas erledigen + Akk.",
    grammar: "直接接第四格宾语，常见宾语有 Aufgaben、Arbeit、Einkäufe 和 Besorgungen。",
    memory: "看到 erledigt，可以联想到待办事项被划掉——“搞定了”。",
    storyDe: "Gemeinsam erledigen sie noch eine Besorgung in der Apotheke.",
    storyZh: "两人还一起去药店办了一件事。",
  },
  {
    id: "gewoehnen",
    level: "B1",
    term: "sich an etwas gewöhnen",
    forms: "gewöhnt sich · gewöhnte sich · hat sich gewöhnt",
    type: "反身动词",
    meaning: "习惯于某事",
    example: "Ich habe mich schnell an den neuen Arbeitsweg gewöhnt.",
    exampleZh: "我很快就习惯了新的通勤路线。",
    grammarTitle: "sich an + Akk. gewöhnen",
    grammar: "an 后面固定接第四格，例如 an den Lärm、an das Wetter。",
    memory: "Gewohnheit 是结果，sich gewöhnen 是形成这个结果的过程。",
    storyDe: "Herr Wolf erzählt, dass er sich noch nicht an sein neues Handy gewöhnt hat.",
    storyZh: "沃尔夫先生说，自己还没习惯使用新手机。",
  },
  {
    id: "vereinbaren",
    level: "B1",
    term: "etwas vereinbaren",
    forms: "vereinbart · vereinbarte · hat vereinbart",
    type: "及物动词",
    meaning: "约定；商定",
    example: "Wir haben für Freitag einen Termin bei der Bank vereinbart.",
    exampleZh: "我们约好了周五去银行的时间。",
    grammarTitle: "einen Termin vereinbaren",
    grammar: "与某人商定用 mit + 第三格，例如 einen Termin mit der Ärztin vereinbaren。",
    memory: "把双方的安排“统一起来”，就是 vereinbaren。",
    storyDe: "Sie vereinbaren, sich am Abend noch einmal zu treffen.",
    storyZh: "他们约好晚上再见一次。",
  },
  {
    id: "kuemmern",
    level: "B1",
    term: "sich um etwas kümmern",
    forms: "kümmert sich · kümmerte sich · hat sich gekümmert",
    type: "反身动词",
    meaning: "照顾；处理；关心",
    example: "Kannst du dich während meiner Reise um die Katze kümmern?",
    exampleZh: "我旅行期间你能照顾一下猫吗？",
    grammarTitle: "sich kümmern um + Akk.",
    grammar: "um 后面固定接第四格；人和事情都可以作宾语。",
    memory: "对某人或某事“围绕着操心”，介词固定使用 um。",
    storyDe: "Dann will Mara sich um die wichtigsten Einstellungen kümmern.",
    storyZh: "玛拉打算帮他处理最重要的手机设置。",
  },
  {
    id: "vermeiden",
    level: "B1",
    term: "etwas vermeiden",
    forms: "vermeidet · vermied · hat vermieden",
    type: "及物动词",
    meaning: "避免",
    example: "Ich fahre früher los, um unnötigen Stress zu vermeiden.",
    exampleZh: "我会早点出发，以避免不必要的压力。",
    grammarTitle: "vermeiden, etwas zu tun",
    grammar: "可接名词，也可接带 zu 的不定式，例如 vermeiden, zu spät zu kommen。",
    memory: "这是不可分动词，过去分词为 vermieden，没有 ge-。",
    storyDe: "So kann sie ihm helfen, zukünftigen Ärger mit dem Gerät zu vermeiden.",
    storyZh: "这样她可以帮助他避免以后再为这台设备烦恼。",
  },
];

// The active corpus is loaded exclusively from the imported Core 6000 books.
// Older in-source cards remain in the repository only as reversible history.
let WORDS: WordCard[] = [];
let WORD_BY_ID = new Map<string, WordCard>();
let expandedWordbooksPromise: Promise<void> | null = null;

function isWordInBook(word: WordCard, level: CEFRLevel) {
  return LEVEL_RANK[word.level] <= LEVEL_RANK[level];
}

function packedWordDetails(typeCode: PackedWordType, term: string, forms: string) {
  const noun = term.replace(/^(der|die|das)\s+/i, "");
  switch (typeCode) {
    case "nm":
      return {
        type: "名词 · 阳性",
        grammarTitle: forms,
        grammar: "阳性名词单数通常与 der 连用；复数名词使用 die。请把冠词、单数和复数形式作为一个整体记忆。",
        memory: `先记住 der，再用例句固定 ${noun} 的含义。`,
      };
    case "nf":
      return {
        type: "名词 · 阴性",
        grammarTitle: forms,
        grammar: "阴性名词单数通常与 die 连用；复数名词同样使用 die。请把冠词、单数和复数形式作为一个整体记忆。",
        memory: `先记住 die，再用例句固定 ${noun} 的含义。`,
      };
    case "nn":
      return {
        type: "名词 · 中性",
        grammarTitle: forms,
        grammar: "中性名词单数通常与 das 连用；复数名词使用 die。请把冠词、单数和复数形式作为一个整体记忆。",
        memory: `先记住 das，再用例句固定 ${noun} 的含义。`,
      };
    case "v":
      return {
        type: "动词",
        grammarTitle: forms,
        grammar: "请把动词和例句中的宾语或介词搭配一起记忆；词形栏帮助你识别现在时、过去时和完成时。",
        memory: `先读完整例句，再用 ${term} 复述同一个动作。`,
      };
    case "adj":
      return {
        type: "形容词",
        grammarTitle: `${term} sein / ${term} + Nomen`,
        grammar: "形容词可作表语，也可放在名词前；放在名词前时，词尾会随冠词、性、数和格发生变化。",
        memory: `把 ${term} 和例句里描述的对象一起记。`,
      };
    case "adv":
      return {
        type: "副词",
        grammarTitle: `例句中的 ${term}`,
        grammar: "副词通常不变格，用来补充动作发生的时间、地点、方式或程度；注意它在例句中的位置。",
        memory: `用例句的语境记住 ${term}，比单独背译义更牢。`,
      };
    case "prep":
      return {
        type: "介词",
        grammarTitle: `${term} + 名词短语`,
        grammar: "介词要和它支配的格及完整搭配一起记忆；请特别观察例句中冠词和名词的形式。",
        memory: `把 ${term} 连同例句后的名词短语一起朗读。`,
      };
    case "conj":
      return {
        type: "连词",
        grammarTitle: `${term} + 句子`,
        grammar: "连词用来连接词组或句子。请观察例句中谓语的位置，并把整个句型作为一个结构记忆。",
        memory: `先找出 ${term} 连接的两部分，再复述整句。`,
      };
    case "pron":
      return {
        type: "代词",
        grammarTitle: `例句中的 ${term}`,
        grammar: "代词代替已经明确的人或事物；它的形式可能随人称、性、数和格变化，请结合例句判断作用。",
        memory: `想清楚例句中的 ${term} 指代谁或什么。`,
      };
    case "det":
      return {
        type: "限定词",
        grammarTitle: `${term} + Nomen`,
        grammar: "限定词通常放在名词前，其词尾会受到名词的性、数和格影响；请连同后面的名词一起记忆。",
        memory: `把 ${term} 和例句中的名词组合成一个整体。`,
      };
    case "num":
      return {
        type: "数词",
        grammarTitle: `例句中的 ${term}`,
        grammar: "数词用来表示数量或顺序。注意基数词和序数词在句子中的不同形式与位置。",
        memory: `把 ${term} 放回例句的数量情境中记忆。`,
      };
    case "part":
      return {
        type: "小品词",
        grammarTitle: `例句中的 ${term}`,
        grammar: "小品词通常不变形，但会改变语气、重点或表达方向；它的准确含义需要结合上下文理解。",
        memory: `对比有无 ${term} 时整句话的语气。`,
      };
    case "intj":
      return {
        type: "感叹词",
        grammarTitle: `${term}!`,
        grammar: "感叹词常独立出现，用来表达反应、情绪或呼唤；真实语气和使用场景比逐字翻译更重要。",
        memory: `想象例句的场景和语气，再说出 ${term}。`,
      };
    case "prop":
      return {
        type: "专有名词",
        grammarTitle: `例句中的 ${term}`,
        grammar: "德语专有名词通常首字母大写；是否使用冠词取决于名称类别和具体语境。",
        memory: `把 ${term} 与例句中的地点、人物或机构联系起来。`,
      };
    case "phrase":
      return {
        type: "固定表达",
        grammarTitle: term,
        grammar: "固定表达适合整块记忆。请保留原有词序，并留意例句中可能发生的人称、时态或格变化。",
        memory: `不要拆开翻译，直接把 ${term} 当成一个表达来使用。`,
      };
  }
}

function isPackedWordRow(value: unknown): value is PackedWordRow {
  return Array.isArray(value) &&
    value.length === PACKED_WORD_FIELDS.length &&
    value.every((field, index) =>
      typeof field === "string" && (index >= 5 || field.trim().length > 0),
    ) &&
    PACKED_WORD_TYPES.has(value[3] as PackedWordType);
}

function parsePackedWordbook(value: unknown, expectedLevel: CEFRLevel): PackedWordbook {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${expectedLevel} wordbook is not an object.`);
  }
  const candidate = value as Partial<PackedWordbook>;
  const validFields = Array.isArray(candidate.fields) &&
    candidate.fields.length === PACKED_WORD_FIELDS.length &&
    PACKED_WORD_FIELDS.every((field, index) => candidate.fields?.[index] === field);
  if (
    candidate.schemaVersion !== 1 ||
    candidate.level !== expectedLevel ||
    candidate.count !== COURSE_WORD_COUNTS[expectedLevel] ||
    !validFields ||
    !Array.isArray(candidate.words) ||
    candidate.words.length !== candidate.count ||
    !candidate.words.every(isPackedWordRow)
  ) {
    throw new Error(`${expectedLevel} wordbook failed schema validation.`);
  }
  return candidate as PackedWordbook;
}

function expandPackedWordbook(resource: PackedWordbook): WordCard[] {
  return resource.words.map(([id, term, forms, typeCode, meaning, example, exampleZh]) => {
    const details = packedWordDetails(typeCode, term, forms);
    return {
      id,
      level: resource.level,
      term,
      forms,
      type: details.type,
      // Imported meanings are preserved exactly as supplied by the word list.
      meaning,
      example,
      exampleZh,
      grammarTitle: details.grammarTitle,
      grammar: details.grammar,
      memory: details.memory,
      storyDe: example,
      storyZh: exampleZh,
    };
  });
}

function loadExpandedWordbooks() {
  if (expandedWordbooksPromise) return expandedWordbooksPromise;
  expandedWordbooksPromise = Promise.all(
    CEFR_LEVELS.map(async (level) => {
      // Include the corpus revision so a browser that still has the previous
      // 630-entry response cannot make the imported 700/1000/1600/2000 books
      // appear empty after a release.
      const response = await fetch(`/wordbooks/${level.toLowerCase()}-v1.json?corpus=core6000`, { cache: "no-store" });
      if (!response.ok) throw new Error(`${level} wordbook could not be loaded.`);
      return parsePackedWordbook(await response.json(), level);
    }),
  ).then((resources) => {
    const wordbookByLevel = new Map(
      resources.map((resource) => [resource.level, expandPackedWordbook(resource)]),
    );
    const ids = new Set<string>();
    const expanded = CEFR_LEVELS.flatMap((level) => wordbookByLevel.get(level) ?? []);
    expanded.forEach((word) => {
      if (ids.has(word.id)) throw new Error(`Duplicate word id: ${word.id}`);
      ids.add(word.id);
    });
    WORDS = expanded;
    WORD_BY_ID = new Map(expanded.map((word) => [word.id, word]));
  }).catch((error) => {
    expandedWordbooksPromise = null;
    throw error;
  });
  return expandedWordbooksPromise;
}

const STATUS_META: Record<RecallStatus, { label: string; short: string }> = {
  unknown: { label: "未知", short: "10 分钟后" },
  fuzzy: { label: "模糊", short: "明天" },
  known: { label: "已知", short: "进入下一阶段" },
};

const CLOUD_STATUS_META: Record<CloudSyncStatus, { label: string; detail: string }> = {
  connecting: { label: "正在连接", detail: "正在读取这台设备与云端的最新进度" },
  saving: { label: "正在保存", detail: "学习变化正在上传，请稍候" },
  synced: { label: "云端已同步", detail: "同一 ChatGPT 账户的设备会自动保持一致" },
  offline: { label: "离线使用中", detail: "进度已保存在本机，联网后会自动补传" },
  "signed-out": { label: "需要登录", detail: "登录 ChatGPT 后才能启用跨设备同步" },
  error: { label: "等待重试", detail: "本机进度安全，Worttag 稍后会再次连接" },
};

function dayKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function afterCalendarDays(timestamp: number, days: number) {
  const date = new Date(timestamp);
  date.setDate(date.getDate() + days);
  date.setHours(4, 0, 0, 0);
  return date.getTime();
}

function dayDifference(fromKey: string, toKey: string) {
  const from = new Date(`${fromKey}T12:00:00`);
  const to = new Date(`${toKey}T12:00:00`);
  return Math.round((to.getTime() - from.getTime()) / DAY);
}

function createInitialState(now = Date.now()): LearningState {
  return {
    records: {},
    todayKey: dayKey(now),
    todayReviewed: 0,
    todayWordIds: [],
    todayReviewEventIds: [],
    streakDays: 1,
    sessionComplete: false,
    todayQueuesCompleted: 0,
    todayQueueCompletionIds: [],
    todayQueueLevel: null,
    todayQueueGoal: null,
    updatedAt: 0,
    resetAt: 0,
  };
}

function prepareSavedState(
  saved: Partial<LearningState>,
  now = Date.now(),
  rollIntoCurrentDay = true,
): LearningState {
  const currentDay = dayKey(now);
  const savedRecords = saved.records && typeof saved.records === "object" && !Array.isArray(saved.records)
    ? Object.fromEntries(
      Object.entries(saved.records).filter(([id]) => WORD_BY_ID.has(id)),
    )
    : {};
  const savedTodayWordIds = Array.isArray(saved.todayWordIds)
    ? saved.todayWordIds.filter(
      (id): id is string => typeof id === "string" && WORD_BY_ID.has(id),
    )
    : [];
  const savedQueueGoal: number | null =
    typeof saved.todayQueueGoal === "number" && [1, 2, 3, 4, 5].includes(saved.todayQueueGoal)
      ? saved.todayQueueGoal
      : null;
  const recordUpdatedAt = Object.values(savedRecords).reduce(
    (latest, record) => Math.max(latest, record?.updatedAt ?? record?.lastReviewedAt ?? 0),
    0,
  );
  const legacyReviewEvents = Array.from(
    { length: Math.max(0, saved.todayReviewed ?? 0) },
    (_, index) => `legacy-review-${saved.todayKey ?? currentDay}-${index + 1}`,
  );
  const legacyQueueEvents = Array.from(
    { length: Math.max(0, saved.todayQueuesCompleted ?? (saved.sessionComplete ? 1 : 0)) },
    (_, index) => `legacy-queue-${saved.todayKey ?? currentDay}-${index + 1}`,
  );
  const normalizedReviewEvents = Array.isArray(saved.todayReviewEventIds)
    ? saved.todayReviewEventIds.filter((id): id is string => typeof id === "string")
    : legacyReviewEvents;
  const normalizedQueueEvents = Array.isArray(saved.todayQueueCompletionIds)
    ? saved.todayQueueCompletionIds.filter((id): id is string => typeof id === "string")
    : legacyQueueEvents;
  const normalized: LearningState = {
    records: savedRecords,
    todayKey: saved.todayKey ?? currentDay,
    todayReviewed: normalizedReviewEvents.length,
    todayWordIds: savedTodayWordIds,
    todayReviewEventIds: normalizedReviewEvents,
    streakDays: saved.streakDays ?? 1,
    sessionComplete: saved.sessionComplete ?? false,
    todayQueuesCompleted: normalizedQueueEvents.length,
    todayQueueCompletionIds: normalizedQueueEvents,
    todayQueueLevel:
      saved.todayQueueLevel ??
      savedTodayWordIds.map((id) => WORD_BY_ID.get(id)).find((word) => word !== undefined)?.level ??
      null,
    todayQueueGoal: savedQueueGoal,
    updatedAt: Math.max(saved.updatedAt ?? 0, recordUpdatedAt),
    resetAt: saved.resetAt ?? 0,
  };
  if (
    normalized.todayKey === currentDay ||
    !rollIntoCurrentDay ||
    normalized.todayKey > currentDay
  ) return normalized;
  const gap = dayDifference(normalized.todayKey, currentDay);
  return {
    ...normalized,
    todayKey: currentDay,
    todayReviewed: 0,
    todayWordIds: [],
    todayReviewEventIds: [],
    streakDays: gap === 1 ? normalized.streakDays + 1 : 1,
    sessionComplete: false,
    todayQueuesCompleted: 0,
    todayQueueCompletionIds: [],
    todayQueueLevel: null,
    todayQueueGoal: null,
    updatedAt: mutationTimestamp(normalized.updatedAt),
  };
}

function touchLearning(state: LearningState, timestamp = mutationTimestamp(state.updatedAt)): LearningState {
  return { ...state, updatedAt: timestamp };
}

function freshMemory(): MemoryRecord {
  return {
    status: "unknown",
    stage: 0,
    dueAt: 0,
    intervalDays: 0,
    knownStreak: 0,
    lapseCount: 0,
    lastReviewedAt: null,
    sameDayLapses: 0,
    lapseDayKey: null,
    updatedAt: 0,
  };
}

function gradeMemory(
  previous: MemoryRecord | undefined,
  rating: RecallStatus,
  now = Date.now(),
) {
  const state = previous ?? freshMemory();
  const today = dayKey(now);
  const sameDayLapses = state.lapseDayKey === today ? state.sameDayLapses : 0;
  const updatedAt = Math.max(now, (state.updatedAt ?? state.lastReviewedAt ?? 0) + 1);

  if (rating === "unknown") {
    const failures = sameDayLapses + 1;
    const dueAt =
      failures === 1
        ? now + 10 * MINUTE
        : failures === 2
          ? now + 30 * MINUTE
          : afterCalendarDays(now, 1);
    return {
      next: {
        ...state,
        status: rating,
        stage: 0,
        dueAt,
        intervalDays: 0,
        knownStreak: 0,
        lapseCount: state.lapseCount + 1,
        lastReviewedAt: now,
        sameDayLapses: failures,
        lapseDayKey: today,
        updatedAt,
      },
      dueLabel: failures === 1 ? "10 分钟后" : failures === 2 ? "30 分钟后" : "明天",
    };
  }

  if (rating === "fuzzy") {
    const stage = Math.max(0, state.stage - 1);
    const days = INTERVAL_DAYS[Math.max(1, stage)];
    return {
      next: {
        ...state,
        status: rating,
        stage,
        dueAt: afterCalendarDays(now, days),
        intervalDays: days,
        knownStreak: 0,
        lastReviewedAt: now,
        sameDayLapses,
        lapseDayKey: sameDayLapses > 0 ? today : null,
        updatedAt,
      },
      dueLabel: days === 1 ? "明天" : `${days} 天后`,
    };
  }

  const stage = Math.min(INTERVAL_DAYS.length - 1, state.stage + 1);
  const days = INTERVAL_DAYS[Math.max(1, stage)];
  return {
    next: {
      ...state,
      status: rating,
      stage,
      dueAt: afterCalendarDays(now, days),
      intervalDays: days,
      knownStreak: state.knownStreak + 1,
      lastReviewedAt: now,
      sameDayLapses: 0,
      lapseDayKey: null,
      updatedAt,
    },
    dueLabel: days === 1 ? "明天" : `${days} 天后`,
  };
}

function previewDue(record: MemoryRecord | undefined, rating: RecallStatus, now: number) {
  return gradeMemory(record, rating, now).dueLabel;
}

function seededShuffle<T>(items: T[], seedText: string) {
  let seed = 2166136261;
  for (let index = 0; index < seedText.length; index += 1) {
    seed = Math.imul(seed ^ seedText.charCodeAt(index), 16777619);
  }
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    const random = ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    const swapIndex = Math.floor(random * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function buildMeaningChoices(word: WordCard, bookWords: WordCard[]) {
  const sameType = bookWords.filter(
    (candidate) => candidate.id !== word.id && candidate.type === word.type,
  );
  const sameLevel = bookWords.filter(
    (candidate) => candidate.id !== word.id && candidate.type !== word.type,
  );
  const candidates = [
    ...seededShuffle(sameType, `${word.id}-same-type-distractors`),
    ...seededShuffle(sameLevel, `${word.id}-fallback-distractors`),
  ];
  const meanings = new Set([word.meaning]);
  const distractors: WordCard[] = [];
  for (const candidate of candidates) {
    if (meanings.has(candidate.meaning)) continue;
    meanings.add(candidate.meaning);
    distractors.push(candidate);
    if (distractors.length === 3) break;
  }
  return seededShuffle([word, ...distractors], `${word.id}-meaning-options`);
}

function normalizeSpelling(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("de-DE")
    .replace(/ß/g, "ss")
    .replace(/\s+/g, " ");
}

function addPluralUmlaut(value: string) {
  const umlauts: Record<string, string> = { a: "ä", o: "ö", u: "ü", A: "Ä", O: "Ö", U: "Ü" };
  for (let index = value.length - 1; index >= 0; index -= 1) {
    const replacement = umlauts[value[index]];
    if (replacement) return `${value.slice(0, index)}${replacement}${value.slice(index + 1)}`;
  }
  return value;
}

function wordFormsForDisplay(word: WordCard) {
  if (!word.type.startsWith("名词")) return "（词形待补充）";
  const singular = word.term.trim().replace(/^(der|die|das)\s+/i, "");
  const pluralMarker = /Plural:\s*(.+)$/i.exec(word.forms.trim())?.[1]?.trim();
  if (!pluralMarker) return "（复数待补充）";
  if (pluralMarker === "-" || pluralMarker === "—") return `die ${singular}`;
  if (pluralMarker === "¨") return `die ${addPluralUmlaut(singular)}`;
  if (pluralMarker.startsWith("¨-")) {
    return `die ${addPluralUmlaut(singular)}${pluralMarker.slice(2)}`;
  }
  if (pluralMarker.startsWith("-")) {
    const endings = pluralMarker.slice(1).split("/");
    return endings.map((ending) => `die ${singular}${ending}`).join(" / ");
  }
  return `die ${pluralMarker}`;
}

function buildDailyQueue(state: LearningState, settings: AppSettings, now = Date.now()) {
  const book = WORDS.filter((word) => isWordInBook(word, settings.level));
  const bookIds = new Set(book.map((word) => word.id));
  const due = Object.entries(state.records)
    .filter(([id, record]) => bookIds.has(id) && record.lastReviewedAt !== null && record.dueAt <= now)
    .sort(([, a], [, b]) => {
      const bucketA = a.stage === 0 ? 0 : 1;
      const bucketB = b.stage === 0 ? 0 : 1;
      return bucketA - bucketB || a.dueAt - b.dueAt || b.lapseCount - a.lapseCount;
    })
    .map(([id]) => id);

  let fresh = book.filter((word) => !state.records[word.id]).map((word) => word.id);
  if (settings.order === "random") {
    fresh = seededShuffle(fresh, `${state.todayKey}-${state.todayQueuesCompleted}-${settings.level}`);
  }

  if (settings.dueFirst) {
    return [...due, ...fresh].slice(0, settings.wordsPerQueue);
  }

  const queue: string[] = [];
  while (due.length || fresh.length) {
    for (let index = 0; index < 3 && due.length; index += 1) {
      queue.push(due.shift()!);
    }
    if (fresh.length) queue.push(fresh.shift()!);
  }
  return queue.slice(0, settings.wordsPerQueue);
}

function formatDate(timestamp: number) {
  if (timestamp <= Date.now()) return "现在到期";
  const date = new Date(timestamp);
  const diff = dayDifference(dayKey(), dayKey(timestamp));
  if (diff === 0) {
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  if (diff === 1) return "明天";
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

function prepareSavedSettings(value: unknown): AppSettings {
  if (!value || typeof value !== "object") return DEFAULT_SETTINGS;
  const saved = value as Partial<AppSettings>;
  const themes: ThemeMode[] = ["light", "dark", "system"];
  const skins: SkinMode[] = ["parchment", "mist", "forest", "wine", "graphite"];
  const levels: CEFRLevel[] = ["A1", "A2", "B1", "B2", "C1"];
  const orders: WordOrder[] = ["sequential", "random"];
  const speeds: SpeechSpeed[] = ["slow", "standard", "natural"];
  const queueSizes = [5, 10, 15, 20];
  const dailyQueues = [1, 2, 3, 4, 5];
  return {
    theme: themes.includes(saved.theme as ThemeMode) ? saved.theme! : DEFAULT_SETTINGS.theme,
    skin: skins.includes(saved.skin as SkinMode) ? saved.skin! : DEFAULT_SETTINGS.skin,
    wordsPerQueue: queueSizes.includes(saved.wordsPerQueue ?? -1)
      ? saved.wordsPerQueue!
      : DEFAULT_SETTINGS.wordsPerQueue,
    queuesPerDay: dailyQueues.includes(saved.queuesPerDay ?? -1)
      ? saved.queuesPerDay!
      : DEFAULT_SETTINGS.queuesPerDay,
    level: levels.includes(saved.level as CEFRLevel) ? saved.level! : DEFAULT_SETTINGS.level,
    order: orders.includes(saved.order as WordOrder) ? saved.order! : DEFAULT_SETTINGS.order,
    autoPronounce: typeof saved.autoPronounce === "boolean" ? saved.autoPronounce : DEFAULT_SETTINGS.autoPronounce,
    showTranslation: typeof saved.showTranslation === "boolean" ? saved.showTranslation : DEFAULT_SETTINGS.showTranslation,
    dueFirst: typeof saved.dueFirst === "boolean" ? saved.dueFirst : DEFAULT_SETTINGS.dueFirst,
    speechSpeed: speeds.includes(saved.speechSpeed as SpeechSpeed)
      ? saved.speechSpeed!
      : DEFAULT_SETTINGS.speechSpeed,
  };
}

function syncedSettings(settings: AppSettings): SyncedSettings {
  return {
    wordsPerQueue: settings.wordsPerQueue,
    queuesPerDay: settings.queuesPerDay,
    level: settings.level,
    order: settings.order,
    dueFirst: settings.dueFirst,
  };
}

function buildCloudPayload(
  learning: LearningState,
  settings: AppSettings,
  settingsUpdatedAt: number,
): CloudPayload {
  return {
    schemaVersion: 1,
    learning,
    settings: syncedSettings(settings),
    settingsUpdatedAt,
  };
}

function normalizeCloudPayload(value: unknown): CloudPayload | null {
  const unpacked = unpackCloudPayload(value);
  if (!unpacked) return null;
  const payload = unpacked as unknown as Partial<CloudPayload>;
  if (!payload.learning || typeof payload.learning !== "object") return null;
  const preparedSettings = prepareSavedSettings({
    ...(payload.settings && typeof payload.settings === "object" ? payload.settings : {}),
    theme: "system",
  });
  return {
    schemaVersion: 1,
    learning: prepareSavedState(payload.learning, Date.now(), false),
    settings: syncedSettings(preparedSettings),
    settingsUpdatedAt: Number.isSafeInteger(payload.settingsUpdatedAt)
      ? Math.max(0, payload.settingsUpdatedAt!)
      : 0,
  };
}

function mergeLearningStates(local: LearningState, remote: LearningState): LearningState {
  if (local.resetAt !== remote.resetAt) {
    return local.resetAt > remote.resetAt ? local : remote;
  }

  const localIsNewer = local.updatedAt > remote.updatedAt;
  const newer = localIsNewer ? local : remote;
  const older = localIsNewer ? remote : local;
  const records: Record<string, MemoryRecord> = { ...older.records };
  const statusPriority: Record<RecallStatus, number> = { known: 0, fuzzy: 1, unknown: 2 };

  Object.entries(newer.records).forEach(([id, candidate]) => {
    const existing = records[id];
    if (!existing) {
      records[id] = candidate;
      return;
    }
    const candidateTime = candidate.updatedAt ?? candidate.lastReviewedAt ?? candidate.dueAt ?? 0;
    const existingTime = existing.updatedAt ?? existing.lastReviewedAt ?? existing.dueAt ?? 0;
    if (
      candidateTime > existingTime ||
      (candidateTime === existingTime && statusPriority[candidate.status] >= statusPriority[existing.status])
    ) {
      records[id] = candidate;
    }
  });

  const sameDay = local.todayKey === remote.todayKey;
  if (!sameDay) {
    const currentDayState = local.todayKey > remote.todayKey ? local : remote;
    return {
      ...currentDayState,
      records,
      resetAt: local.resetAt,
      updatedAt: Math.max(local.updatedAt, remote.updatedAt),
    };
  }

  const reviewEvents = Array.from(new Set([
    ...local.todayReviewEventIds,
    ...remote.todayReviewEventIds,
  ]));
  const sameQueuePlan = local.todayQueueLevel === remote.todayQueueLevel &&
    local.todayQueueGoal === remote.todayQueueGoal;
  const queueEvents = sameQueuePlan
    ? Array.from(new Set([
      ...local.todayQueueCompletionIds,
      ...remote.todayQueueCompletionIds,
    ]))
    : [...newer.todayQueueCompletionIds];

  return {
    ...newer,
    records,
    todayReviewed: reviewEvents.length,
    todayWordIds: Array.from(new Set([...local.todayWordIds, ...remote.todayWordIds])),
    todayReviewEventIds: reviewEvents,
    streakDays: Math.max(local.streakDays, remote.streakDays),
    sessionComplete: sameQueuePlan
      ? local.sessionComplete || remote.sessionComplete
      : newer.sessionComplete,
    todayQueuesCompleted: queueEvents.length,
    todayQueueCompletionIds: queueEvents,
    resetAt: local.resetAt,
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
  };
}

function mergeCloudPayloads(local: CloudPayload, remote: CloudPayload): CloudPayload {
  const useLocalSettings = local.settingsUpdatedAt > remote.settingsUpdatedAt;
  return {
    schemaVersion: 1,
    learning: mergeLearningStates(local.learning, remote.learning),
    settings: useLocalSettings ? local.settings : remote.settings,
    settingsUpdatedAt: Math.max(local.settingsUpdatedAt, remote.settingsUpdatedAt),
  };
}

function payloadSignature(payload: CloudPayload) {
  return JSON.stringify(payload);
}

function ownerStorageKey(base: string, ownerId: string) {
  return `${base}:${ownerId}`;
}

function ArticleTerm({ term }: { term: string }) {
  const match = /^((?:der|die|das)(?:\/(?:der|die|das))?)\s+(.+)$/i.exec(term.trim());
  if (!match) return <>{term}</>;
  const articles = match[1].split("/");
  return (
    <span className="article-term" lang="de">
      {articles.map((article, index) => (
        <span key={article} className={`noun-article article-${article.toLowerCase()}`}>
          {index ? "/" : ""}{article}
        </span>
      ))}{" "}
      <span>{match[2]}</span>
    </span>
  );
}

export default function Home() {
  const [ready, setReady] = useState(false);
  const [wordbookRevision, setWordbookRevision] = useState(0);
  const [view, setView] = useState<View>("learn");
  const [settings, setSettingsValue] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsUpdatedAt, setSettingsUpdatedAtValue] = useState(0);
  const [learning, setLearningValue] = useState<LearningState>(() => createInitialState());
  const [sessionQueue, setSessionQueue] = useState<string[]>([]);
  const [sessionWordIds, setSessionWordIds] = useState<string[]>([]);
  const [sessionRatings, setSessionRatings] = useState<(RecallStatus | null)[]>([]);
  const [sessionMasteryPoints, setSessionMasteryPoints] = useState<Record<string, number>>({});
  const [sessionLastRatings, setSessionLastRatings] = useState<Record<string, RecallStatus>>({});
  const [sessionRound, setSessionRound] = useState(1);
  const [queueSource, setQueueSource] = useState<"daily" | "review" | "manual">("daily");
  const [returnView, setReturnView] = useState<View>("learn");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [sessionPhase, setSessionPhase] = useState<"study" | "spell-prompt" | "spelling">("study");
  const [sessionCompletionCommitted, setSessionCompletionCommitted] = useState(false);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [spellingIndex, setSpellingIndex] = useState(0);
  const [spellingInput, setSpellingInput] = useState("");
  const [spellingChecked, setSpellingChecked] = useState(false);
  const [spellingResults, setSpellingResults] = useState<boolean[]>([]);
  const [grading, setGrading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [settingsNotice, setSettingsNotice] = useState("正在准备安全的云端同步");
  const [confirmReset, setConfirmReset] = useState(false);
  const [planDirty, setPlanDirty] = useState(false);
  const [queueUnavailable, setQueueUnavailable] = useState(false);
  const [clock, setClock] = useState(0);
  const [libraryFilter, setLibraryFilter] = useState<"all" | RecallStatus>("all");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryVisibleCount, setLibraryVisibleCount] = useState(LIBRARY_PAGE_SIZE);
  const [reviewVisibleCount, setReviewVisibleCount] = useState(REVIEW_PAGE_SIZE);
  const [dictionaryWord, setDictionaryWord] = useState<WordCard | null>(null);
  const [dictionaryEvidence, setDictionaryEvidence] = useState<DictionaryEvidence | null>(null);
  const [dictionaryEvidenceStatus, setDictionaryEvidenceStatus] = useState<DictionaryEvidenceStatus>("idle");
  const [dictionaryEvidenceReload, setDictionaryEvidenceReload] = useState(0);
  const [cloudStatus, setCloudStatus] = useState<CloudSyncStatus>("connecting");
  const [cloudDisplayName, setCloudDisplayName] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const learningRef = useRef(learning);
  const settingsRef = useRef(settings);
  const settingsUpdatedAtRef = useRef(settingsUpdatedAt);
  const cloudReadyRef = useRef(false);
  const cloudRevisionRef = useRef(0);
  const cloudOwnerIdRef = useRef<string | null>(null);
  const localOwnerIdRef = useRef<string | null>(null);
  const syncInFlightRef = useRef(false);
  const syncQueuedRef = useRef(false);
  const pendingPullRef = useRef(false);
  const lastCloudSignatureRef = useRef("");
  const resetConfirmedRef = useRef(false);
  const pendingResetRef = useRef<number | null>(null);
  const hasLocalInteractionRef = useRef(false);
  const resetTriggerRef = useRef<HTMLButtonElement>(null);
  const resetCancelRef = useRef<HTMLButtonElement>(null);
  const resetDialogRef = useRef<HTMLElement>(null);
  const spellingInputRef = useRef<HTMLInputElement>(null);
  const dictionaryDialogRef = useRef<HTMLElement>(null);
  const dictionaryCloseRef = useRef<HTMLButtonElement>(null);
  const dictionaryTriggerRef = useRef<HTMLElement | null>(null);
  const transitionTimerRef = useRef<number | null>(null);
  const pendingCompletionStateRef = useRef<LearningState | null>(null);
  const libraryLoadMoreRef = useRef<HTMLDivElement>(null);
  const reviewLoadMoreRef = useRef<HTMLDivElement>(null);

  function setLearning(
    next: LearningState | ((current: LearningState) => LearningState),
  ) {
    setLearningValue((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      learningRef.current = resolved;
      return resolved;
    });
  }

  function setSettings(
    next: AppSettings | ((current: AppSettings) => AppSettings),
  ) {
    setSettingsValue((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      settingsRef.current = resolved;
      return resolved;
    });
  }

  function resetSessionQueue(ids: string[]) {
    const uniqueIds = Array.from(new Set(ids));
    setSessionQueue(uniqueIds);
    setSessionWordIds(uniqueIds);
    setSessionRatings(uniqueIds.map(() => null));
    setSessionMasteryPoints(Object.fromEntries(uniqueIds.map((id) => [id, 0])));
    setSessionLastRatings({});
    setSessionRound(1);
    setSessionPhase("study");
    setSessionCompletionCommitted(false);
    setSelectedChoiceId(null);
    setSpellingIndex(0);
    setSpellingInput("");
    setSpellingChecked(false);
    setSpellingResults([]);
    pendingCompletionStateRef.current = null;
  }

  function beginSessionRound(ids: string[], points: Record<string, number>, round: number) {
    const uniqueIds = Array.from(new Set(ids));
    setSessionQueue(uniqueIds);
    setSessionRatings(uniqueIds.map(() => null));
    setSessionMasteryPoints(points);
    setSessionRound(round);
    setCurrentIndex(0);
    setSessionPhase("study");
    setSessionCompletionCommitted(false);
    setSelectedChoiceId(null);
    setRevealed(false);
    setFeedback(null);
    setGrading(false);
  }

  function setSettingsUpdatedAt(
    next: number | ((current: number) => number),
  ) {
    setSettingsUpdatedAtValue((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      settingsUpdatedAtRef.current = resolved;
      return resolved;
    });
  }

  function clearTransitionTimer() {
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
  }

  useEffect(() => {
    let cancelled = false;
    let hydrationTimer: number | null = null;

    const hydrate = async () => {
      try {
        await loadExpandedWordbooks();
      } catch (error) {
        console.error("Imported wordbooks could not be loaded.", error);
      }
      if (cancelled) return;

      let next = createInitialState();
      let nextSettings = DEFAULT_SETTINGS;
      let nextSettingsUpdatedAt = 0;
      let savedOwnerId: string | null = null;
      try {
        const rawCloudMeta = window.localStorage.getItem(CLOUD_META_KEY);
        if (rawCloudMeta) {
          const cloudMeta = JSON.parse(rawCloudMeta) as {
            ownerId?: string;
            lastSyncedAt?: number;
          };
          if (typeof cloudMeta.ownerId === "string" && cloudMeta.ownerId) {
            savedOwnerId = cloudMeta.ownerId;
            localOwnerIdRef.current = cloudMeta.ownerId;
          }
          if (Number.isSafeInteger(cloudMeta.lastSyncedAt)) {
            window.setTimeout(() => setLastSyncedAt(cloudMeta.lastSyncedAt!), 0);
          }
        }
      } catch {
        savedOwnerId = null;
      }
      const progressKey = savedOwnerId ? ownerStorageKey(STORAGE_KEY, savedOwnerId) : STORAGE_KEY;
      const settingsKey = savedOwnerId ? ownerStorageKey(SETTINGS_KEY, savedOwnerId) : SETTINGS_KEY;
      const settingsUpdatedAtKey = savedOwnerId
        ? ownerStorageKey(SETTINGS_UPDATED_AT_KEY, savedOwnerId)
        : SETTINGS_UPDATED_AT_KEY;
      try {
        const raw = window.localStorage.getItem(progressKey);
        if (raw) next = prepareSavedState(JSON.parse(raw) as LearningState);
      } catch {
        next = createInitialState();
      }
      try {
        const rawSettings = window.localStorage.getItem(settingsKey);
        if (rawSettings) nextSettings = prepareSavedSettings(JSON.parse(rawSettings));
      } catch {
        nextSettings = DEFAULT_SETTINGS;
      }
      try {
        const rawUpdatedAt = Number(window.localStorage.getItem(settingsUpdatedAtKey));
        if (Number.isSafeInteger(rawUpdatedAt) && rawUpdatedAt > 0) {
          nextSettingsUpdatedAt = rawUpdatedAt;
        }
      } catch {
        nextSettingsUpdatedAt = 0;
      }
      if (next.todayQueueLevel !== nextSettings.level) {
        next = {
          ...next,
          todayQueuesCompleted: 0,
          todayQueueCompletionIds: [],
          sessionComplete: false,
          todayQueueLevel: nextSettings.level,
          todayQueueGoal: nextSettings.queuesPerDay,
        };
      } else if (next.todayQueueGoal === null) {
        next = { ...next, todayQueueGoal: nextSettings.queuesPerDay };
      }
      const initialGoal = next.todayQueueGoal ?? nextSettings.queuesPerDay;
      const initialComplete = next.todayQueueLevel === nextSettings.level &&
        (next.sessionComplete || next.todayQueuesCompleted >= initialGoal);
      const initialQueue = initialComplete ? [] : buildDailyQueue(next, nextSettings);
      // Client-only preferences are intentionally hydrated after the first mount.
      learningRef.current = next;
      settingsRef.current = nextSettings;
      settingsUpdatedAtRef.current = nextSettingsUpdatedAt;
      hydrationTimer = window.setTimeout(() => {
        if (cancelled) return;
        setSettings(nextSettings);
        setSettingsUpdatedAt(nextSettingsUpdatedAt);
        setLearning(next);
        resetSessionQueue(initialQueue);
        setQueueUnavailable(!initialQueue.length && !initialComplete);
        setClock(currentTimestamp());
        setWordbookRevision((revision) => revision + 1);
        setReady(true);
      }, 0);
    };

    void hydrate();
    return () => {
      cancelled = true;
      if (hydrationTimer !== null) window.clearTimeout(hydrationTimer);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setInterval(() => setClock(currentTimestamp()), MINUTE);
    return () => window.clearInterval(timer);
  }, [ready]);

  useEffect(() => {
    if (!ready || !clock || dayKey(clock) === learning.todayKey) return;
    const nextDay: LearningState = {
      ...prepareSavedState(learning, clock),
      todayQueueLevel: settings.level,
      todayQueueGoal: settings.queuesPerDay,
    };
    const nextQueue = buildDailyQueue(nextDay, settings, clock);
    const updateTimer = window.setTimeout(() => {
      setLearning(nextDay);
      resetSessionQueue(nextQueue);
      setQueueSource("daily");
      setCurrentIndex(0);
      setRevealed(false);
      setGrading(false);
      setQueueUnavailable(!nextQueue.length);
    }, 0);
    return () => window.clearTimeout(updateTimer);
  }, [clock, learning, ready, settings]);

  useEffect(() => {
    if (!ready) return;
    try {
      const ownerId = cloudOwnerIdRef.current ?? localOwnerIdRef.current;
      const progressKey = ownerId ? ownerStorageKey(STORAGE_KEY, ownerId) : STORAGE_KEY;
      window.localStorage.setItem(progressKey, JSON.stringify(learning));
    } catch {
      window.setTimeout(() => setSettingsNotice("当前浏览器未能保存进度，请检查隐私设置"), 0);
    }
  }, [learning, ready]);

  useEffect(() => {
    if (!ready) return;
    try {
      const ownerId = cloudOwnerIdRef.current ?? localOwnerIdRef.current;
      const settingsKey = ownerId ? ownerStorageKey(SETTINGS_KEY, ownerId) : SETTINGS_KEY;
      const updatedAtKey = ownerId
        ? ownerStorageKey(SETTINGS_UPDATED_AT_KEY, ownerId)
        : SETTINGS_UPDATED_AT_KEY;
      window.localStorage.setItem(settingsKey, JSON.stringify(settings));
      window.localStorage.setItem(updatedAtKey, String(settingsUpdatedAt));
    } catch {
      window.setTimeout(() => setSettingsNotice("当前浏览器未能保存设置，请检查隐私设置"), 0);
    }
  }, [settings, settingsUpdatedAt, ready]);

  function loadOwnerLocalPayload(ownerId: string): CloudPayload {
    let ownerLearning = createInitialState();
    let ownerSettings: AppSettings = {
      ...DEFAULT_SETTINGS,
      theme: settingsRef.current.theme,
      skin: settingsRef.current.skin,
      autoPronounce: settingsRef.current.autoPronounce,
      showTranslation: settingsRef.current.showTranslation,
      speechSpeed: settingsRef.current.speechSpeed,
    };
    let ownerSettingsUpdatedAt = 0;
    try {
      const rawLearning = window.localStorage.getItem(ownerStorageKey(STORAGE_KEY, ownerId));
      if (rawLearning) ownerLearning = prepareSavedState(JSON.parse(rawLearning) as LearningState);
      const rawSettings = window.localStorage.getItem(ownerStorageKey(SETTINGS_KEY, ownerId));
      if (rawSettings) {
        ownerSettings = prepareSavedSettings({
          ...JSON.parse(rawSettings),
          theme: settingsRef.current.theme,
          skin: settingsRef.current.skin,
        });
      }
      const rawUpdatedAt = Number(
        window.localStorage.getItem(ownerStorageKey(SETTINGS_UPDATED_AT_KEY, ownerId)),
      );
      if (Number.isSafeInteger(rawUpdatedAt) && rawUpdatedAt > 0) {
        ownerSettingsUpdatedAt = rawUpdatedAt;
      }
    } catch {
      ownerLearning = createInitialState();
      ownerSettings = {
        ...DEFAULT_SETTINGS,
        theme: settingsRef.current.theme,
        skin: settingsRef.current.skin,
        autoPronounce: settingsRef.current.autoPronounce,
        showTranslation: settingsRef.current.showTranslation,
        speechSpeed: settingsRef.current.speechSpeed,
      };
      ownerSettingsUpdatedAt = 0;
    }
    return buildCloudPayload(ownerLearning, ownerSettings, ownerSettingsUpdatedAt);
  }

  function buildRebasedResetPayload(candidate: CloudPayload, remote: CloudPayload) {
    const mergedPreferences = mergeCloudPayloads(candidate, remote);
    const resetAt = Math.max(
      currentTimestamp(),
      candidate.learning.resetAt + 1,
      remote.learning.resetAt + 1,
    );
    const rebasedLearning: LearningState = {
      ...candidate.learning,
      resetAt,
      updatedAt: Math.max(resetAt, candidate.learning.updatedAt + 1),
    };
    pendingResetRef.current = resetAt;
    return { ...mergedPreferences, learning: rebasedLearning };
  }

  function applyCloudPayload(payload: CloudPayload, rebuildDailyQueue: boolean) {
    const previousLearning = learningRef.current;
    const previousSettings = settingsRef.current;
    const nextLearning = prepareSavedState(payload.learning, currentTimestamp(), false);
    const nextSettings = prepareSavedSettings({
      ...settingsRef.current,
      ...payload.settings,
      theme: settingsRef.current.theme,
      skin: settingsRef.current.skin,
    });
    learningRef.current = nextLearning;
    settingsRef.current = nextSettings;
    settingsUpdatedAtRef.current = payload.settingsUpdatedAt;
    setLearning(nextLearning);
    setSettings(nextSettings);
    setSettingsUpdatedAt(payload.settingsUpdatedAt);
    setPlanDirty(true);

    const remoteChangedActivePlan =
      nextLearning.resetAt !== previousLearning.resetAt ||
      nextLearning.todayKey !== previousLearning.todayKey ||
      nextSettings.level !== previousSettings.level;
    const shouldRebuildQueue = remoteChangedActivePlan ||
      (rebuildDailyQueue && !hasLocalInteractionRef.current);

    if (shouldRebuildQueue) {
      clearTransitionTimer();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      const queueGoal = nextLearning.todayQueueLevel === nextSettings.level
        ? (nextLearning.todayQueueGoal ?? nextSettings.queuesPerDay)
        : nextSettings.queuesPerDay;
      const complete = nextLearning.todayQueueLevel === nextSettings.level &&
        (nextLearning.sessionComplete || nextLearning.todayQueuesCompleted >= queueGoal);
      const nextQueue = complete ? [] : buildDailyQueue(nextLearning, nextSettings);
      resetSessionQueue(nextQueue);
      setQueueSource("daily");
      setCurrentIndex(0);
      setRevealed(false);
      setGrading(false);
      setFeedback(remoteChangedActivePlan ? "已切换到云端的最新学习计划" : null);
      setQueueUnavailable(!nextQueue.length && !complete);
      setPlanDirty(false);
      hasLocalInteractionRef.current = false;
    }
  }

  function rememberSuccessfulSync(serverUpdatedAt?: string) {
    const normalizedServerTime = serverUpdatedAt && !serverUpdatedAt.includes("T")
      ? `${serverUpdatedAt.replace(" ", "T")}Z`
      : serverUpdatedAt;
    const timestamp = normalizedServerTime ? Date.parse(normalizedServerTime) : currentTimestamp();
    const safeTimestamp = Number.isFinite(timestamp) ? timestamp : currentTimestamp();
    setLastSyncedAt(safeTimestamp);
    try {
      const ownerId = cloudOwnerIdRef.current;
      if (ownerId) {
        localOwnerIdRef.current = ownerId;
        window.localStorage.setItem(
          ownerStorageKey(STORAGE_KEY, ownerId),
          JSON.stringify(learningRef.current),
        );
        window.localStorage.setItem(
          ownerStorageKey(SETTINGS_KEY, ownerId),
          JSON.stringify(settingsRef.current),
        );
        window.localStorage.setItem(
          ownerStorageKey(SETTINGS_UPDATED_AT_KEY, ownerId),
          String(settingsUpdatedAtRef.current),
        );
      }
      window.localStorage.setItem(CLOUD_META_KEY, JSON.stringify({
        ownerId,
        revision: cloudRevisionRef.current,
        lastSyncedAt: safeTimestamp,
      }));
    } catch {
      // Cloud sync remains authoritative even when this optional local hint is unavailable.
    }
  }

  async function synchronizeCloud(pullFirst = false) {
    if (!ready) return;
    if (!pullFirst && cloudReadyRef.current) {
      const current = buildCloudPayload(
        learningRef.current,
        settingsRef.current,
        settingsUpdatedAtRef.current,
      );
      if (payloadSignature(current) === lastCloudSignatureRef.current) return;
    }
    if (syncInFlightRef.current) {
      syncQueuedRef.current = true;
      if (pullFirst) pendingPullRef.current = true;
      return;
    }

    syncInFlightRef.current = true;
    const firstHydration = !cloudReadyRef.current;
    setCloudStatus(pullFirst ? "connecting" : "saving");

    try {
      let candidate = buildCloudPayload(
        learningRef.current,
        settingsRef.current,
        settingsUpdatedAtRef.current,
      );
      let revision = cloudRevisionRef.current;

      if (pullFirst || !cloudReadyRef.current) {
        const response = await fetch("/api/progress", {
          method: "GET",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        const result = await response.json() as {
          authenticated?: boolean;
          ownerId?: string;
          displayName?: string;
          snapshot?: CloudSnapshot | null;
        };

        if (response.status === 401) {
          cloudReadyRef.current = false;
          cloudOwnerIdRef.current = null;
          cloudRevisionRef.current = 0;
          lastCloudSignatureRef.current = "";
          setCloudDisplayName(null);
          setCloudStatus("signed-out");
          return;
        }
        if (!response.ok) throw new Error("Cloud progress could not be loaded.");
        if (!result.ownerId) throw new Error("Cloud owner identity is unavailable.");

        const accountChanged = Boolean(
          localOwnerIdRef.current && localOwnerIdRef.current !== result.ownerId,
        );
        cloudOwnerIdRef.current = result.ownerId;
        cloudReadyRef.current = true;
        setCloudDisplayName(result.displayName ?? null);
        if (accountChanged) {
          pendingResetRef.current = null;
          hasLocalInteractionRef.current = false;
          clearTransitionTimer();
          lastCloudSignatureRef.current = "";
          setLastSyncedAt(null);
          candidate = loadOwnerLocalPayload(result.ownerId);
          applyCloudPayload(candidate, true);
        } else {
          candidate = buildCloudPayload(
            learningRef.current,
            settingsRef.current,
            settingsUpdatedAtRef.current,
          );
        }
        if (result.snapshot) {
          const remote = normalizeCloudPayload(result.snapshot.payload);
          if (!remote) throw new Error("Cloud progress has an unsupported format.");
          remote.learning.resetAt = Math.max(remote.learning.resetAt, result.snapshot.resetAt);
          revision = result.snapshot.revision;
          cloudRevisionRef.current = revision;
          const requestedResetAt = pendingResetRef.current;
          if (requestedResetAt !== null) {
            if (remote.learning.resetAt === requestedResetAt) {
              pendingResetRef.current = null;
            } else if (remote.learning.resetAt > requestedResetAt) {
              candidate = buildRebasedResetPayload(candidate, remote);
              applyCloudPayload(candidate, true);
            }
          }
          const merged = mergeCloudPayloads(candidate, remote);
          const localChanged = payloadSignature(merged) !== payloadSignature(candidate);
          const remoteChanged = payloadSignature(merged) !== payloadSignature(remote);
          candidate = merged;

          if (localChanged) applyCloudPayload(merged, firstHydration);
          if (!remoteChanged) {
            lastCloudSignatureRef.current = payloadSignature(remote);
            setCloudStatus("synced");
            setSettingsNotice("已安全同步到云端");
            rememberSuccessfulSync(result.snapshot.serverUpdatedAt);
            return;
          }
        } else {
          revision = 0;
          cloudRevisionRef.current = 0;
        }
      }

      for (let attempt = 0; attempt < 3; attempt += 1) {
        setCloudStatus("saving");
        const wirePayload = packCloudPayload(candidate);
        const requestBody = JSON.stringify({
          payload: wirePayload,
          expectedRevision: revision,
          expectedOwnerId: cloudOwnerIdRef.current,
          resetAt: candidate.learning.resetAt,
          clientUpdatedAt: Math.max(candidate.learning.updatedAt, candidate.settingsUpdatedAt),
        });
        const response = await fetch("/api/progress", {
          method: "PUT",
          cache: "no-store",
          keepalive: requestBody.length < 60_000,
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: requestBody,
        });
        const result = await response.json() as {
          authenticated?: boolean;
          ownerId?: string;
          ownerChanged?: boolean;
          displayName?: string;
          snapshot?: CloudSnapshot | null;
        };

        if (response.status === 401) {
          cloudReadyRef.current = false;
          cloudOwnerIdRef.current = null;
          cloudRevisionRef.current = 0;
          lastCloudSignatureRef.current = "";
          setCloudDisplayName(null);
          setCloudStatus("signed-out");
          return;
        }

        if (response.status === 409 && result.ownerChanged) {
          cloudReadyRef.current = false;
          cloudOwnerIdRef.current = null;
          cloudRevisionRef.current = 0;
          lastCloudSignatureRef.current = "";
          pendingResetRef.current = null;
          pendingPullRef.current = true;
          setCloudDisplayName(null);
          setCloudStatus("connecting");
          return;
        }

        if (response.status === 409 && result.snapshot) {
          const remote = normalizeCloudPayload(result.snapshot.payload);
          if (!remote) throw new Error("Cloud progress has an unsupported format.");
          remote.learning.resetAt = Math.max(remote.learning.resetAt, result.snapshot.resetAt);
          revision = result.snapshot.revision;
          cloudRevisionRef.current = revision;
          const latestLocal = buildCloudPayload(
            learningRef.current,
            settingsRef.current,
            settingsUpdatedAtRef.current,
          );
          const pendingLocal = mergeCloudPayloads(candidate, latestLocal);
          const requestedResetAt = pendingResetRef.current;
          if (requestedResetAt !== null) {
            if (remote.learning.resetAt === requestedResetAt) {
              pendingResetRef.current = null;
            } else if (remote.learning.resetAt > requestedResetAt) {
              candidate = buildRebasedResetPayload(pendingLocal, remote);
              applyCloudPayload(candidate, true);
              continue;
            }
          }
          const merged = mergeCloudPayloads(pendingLocal, remote);
          candidate = merged;
          applyCloudPayload(merged, firstHydration);
          if (payloadSignature(merged) === payloadSignature(remote)) {
            lastCloudSignatureRef.current = payloadSignature(remote);
            setCloudStatus("synced");
            setSettingsNotice("已合并另一台设备上的最新进度");
            rememberSuccessfulSync(result.snapshot.serverUpdatedAt);
            return;
          }
          continue;
        }

        if (!response.ok || !result.snapshot) {
          throw new Error("Cloud progress could not be saved.");
        }

        revision = result.snapshot.revision;
        cloudRevisionRef.current = revision;
        cloudReadyRef.current = true;
        if (!result.ownerId || result.ownerId !== cloudOwnerIdRef.current) {
          cloudReadyRef.current = false;
          pendingPullRef.current = true;
          return;
        }
        cloudOwnerIdRef.current = result.ownerId;
        setCloudDisplayName(result.displayName ?? cloudDisplayName);
        lastCloudSignatureRef.current = payloadSignature(candidate);
        pendingResetRef.current = null;
        setCloudStatus("synced");
        setSettingsNotice("已安全同步到云端");
        rememberSuccessfulSync(result.snapshot.serverUpdatedAt);
        return;
      }

      throw new Error("Cloud progress changed too many times while saving.");
    } catch {
      setCloudStatus(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error");
      setSettingsNotice("云端暂时不可用；进度已保存在本机，稍后会自动重试");
    } finally {
      syncInFlightRef.current = false;
      const replayPull = pendingPullRef.current;
      pendingPullRef.current = false;
      if (syncQueuedRef.current || replayPull) {
        syncQueuedRef.current = false;
        window.setTimeout(() => void synchronizeCloud(replayPull), 80);
      }
    }
  }

  useEffect(() => {
    if (!ready) return;
    void synchronizeCloud(true);
    // Initial cloud hydration must run only after local state is ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (!ready || !cloudReadyRef.current) return;
    const currentPayload = buildCloudPayload(learning, settings, settingsUpdatedAt);
    if (payloadSignature(currentPayload) === lastCloudSignatureRef.current) return;
    const timer = window.setTimeout(() => void synchronizeCloud(false), 850);
    return () => window.clearTimeout(timer);
    // Synchronization reads the newest snapshots through refs to avoid stale writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learning.updatedAt, ready, settingsUpdatedAt]);

  useEffect(() => {
    if (!ready) return;
    const resumeSync = () => void synchronizeCloud(true);
    const syncForVisibility = () => {
      if (document.visibilityState === "visible") {
        resumeSync();
      } else {
        void synchronizeCloud(false);
      }
    };
    const flushBeforeLeaving = () => void synchronizeCloud(false);
    window.addEventListener("online", resumeSync);
    window.addEventListener("focus", resumeSync);
    window.addEventListener("pagehide", flushBeforeLeaving);
    document.addEventListener("visibilitychange", syncForVisibility);
    const timer = window.setInterval(syncForVisibility, MINUTE);
    return () => {
      window.removeEventListener("online", resumeSync);
      window.removeEventListener("focus", resumeSync);
      window.removeEventListener("pagehide", flushBeforeLeaving);
      document.removeEventListener("visibilitychange", syncForVisibility);
      window.clearInterval(timer);
    };
    // Event listeners always synchronize from the latest refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const resolved = settings.theme === "system" ? (media.matches ? "dark" : "light") : settings.theme;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.dataset.skin = settings.skin;
      document.documentElement.style.colorScheme = resolved;
    };
    applyTheme();
    if (settings.theme === "system") media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [ready, settings.skin, settings.theme]);

  const currentWordId = sessionQueue[currentIndex];
  const currentWord = WORD_BY_ID.get(currentWordId);
  const currentRecord = currentWord ? learning.records[currentWord.id] : undefined;
  const bookWords = useMemo(
    () => {
      void wordbookRevision;
      return WORDS.filter((word) => isWordInBook(word, settings.level));
    },
    [settings.level, wordbookRevision],
  );
  const learnedToday = useMemo(
    () => {
      void wordbookRevision;
      const learnedIds = new Set(learning.todayWordIds);
      return WORDS.filter((word) => isWordInBook(word, settings.level) && learnedIds.has(word.id));
    },
    [learning.todayWordIds, settings.level, wordbookRevision],
  );
  const dailyStoryAvailable = learnedToday.length > 0 && learnedToday.every(
    (word) => Boolean(word.storyDe && word.storyZh),
  );

  const dueWords = useMemo(
    () =>
      bookWords.filter((word) => {
        const record = learning.records[word.id];
        return record?.lastReviewedAt !== null && record?.dueAt <= clock;
      }).sort(
        (a, b) =>
          (learning.records[a.id]?.dueAt ?? 0) - (learning.records[b.id]?.dueAt ?? 0),
      ),
    [bookWords, clock, learning.records],
  );

  const reviewTotal = bookWords.filter((word) => learning.records[word.id]?.lastReviewedAt !== null && learning.records[word.id]).length;
  const reviewWords = useMemo(
    () => reviewTotal
      ? bookWords.filter((word) => learning.records[word.id])
      : bookWords.slice(0, 3),
    [bookWords, learning.records, reviewTotal],
  );
  const librarySearchIndex = useMemo(
    () => bookWords.map((word) => ({
      word,
      searchText: buildLibrarySearchText(word),
    })),
    [bookWords],
  );
  const libraryQueryTokens = useMemo(
    () => tokenizeLibraryQuery(libraryQuery),
    [libraryQuery],
  );
  const librarySearchMatches = useMemo(
    () => librarySearchIndex
      .filter(({ searchText }) => matchesLibrarySearch(searchText, libraryQueryTokens))
      .map(({ word }) => word),
    [libraryQueryTokens, librarySearchIndex],
  );
  const librarySearchCounts = useMemo(() => {
    const next = { unknown: 0, fuzzy: 0, known: 0 };
    librarySearchMatches.forEach((word) => {
      next[learning.records[word.id]?.status ?? "unknown"] += 1;
    });
    return next;
  }, [learning.records, librarySearchMatches]);
  const libraryWords = useMemo(
    () => librarySearchMatches.filter(
      (word) => libraryFilter === "all" ||
        (learning.records[word.id]?.status ?? "unknown") === libraryFilter,
    ),
    [learning.records, libraryFilter, librarySearchMatches],
  );
  const dictionaryLinks = useMemo(
    () => dictionaryWord ? buildDictionaryLinks(dictionaryWord.term) : [],
    [dictionaryWord],
  );

  useEffect(() => {
    if (view !== "library" || libraryVisibleCount >= libraryWords.length) return;
    const target = libraryLoadMoreRef.current;
    if (!target) return;
    if (typeof IntersectionObserver === "undefined") {
      const timer = globalThis.setTimeout(
        () => setLibraryVisibleCount(libraryWords.length),
        0,
      );
      return () => globalThis.clearTimeout(timer);
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setLibraryVisibleCount((count) => Math.min(count + LIBRARY_PAGE_SIZE, libraryWords.length));
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [libraryVisibleCount, libraryWords.length, view]);

  useEffect(() => {
    if (view !== "review" || reviewVisibleCount >= reviewWords.length) return;
    const target = reviewLoadMoreRef.current;
    if (!target) return;
    if (typeof IntersectionObserver === "undefined") {
      const timer = globalThis.setTimeout(
        () => setReviewVisibleCount(reviewWords.length),
        0,
      );
      return () => globalThis.clearTimeout(timer);
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setReviewVisibleCount((count) => Math.min(count + REVIEW_PAGE_SIZE, reviewWords.length));
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [reviewVisibleCount, reviewWords.length, view]);

  const activeQueueGoal = learning.todayQueueLevel === settings.level
    ? (learning.todayQueueGoal ?? settings.queuesPerDay)
    : settings.queuesPerDay;
  const dailyComplete = learning.todayQueueLevel === settings.level &&
    (learning.sessionComplete || learning.todayQueuesCompleted >= activeQueueGoal);
  const dailyTarget = settings.wordsPerQueue * settings.queuesPerDay;
  const targetLearnedWords = bookWords.filter((word) => Boolean(learning.records[word.id])).length;
  const targetRemainingWords = Math.max(0, bookWords.length - targetLearnedWords);
  const estimatedDaysRemaining = targetRemainingWords
    ? Math.ceil(targetRemainingWords / Math.max(1, dailyTarget))
    : 0;
  const targetCompletionPercent = Math.round(
    (targetLearnedWords / Math.max(1, bookWords.length)) * 100,
  );
  const sessionUniqueIds = sessionWordIds;
  const masteryPointsById = new Map<string, number>(Object.entries(sessionMasteryPoints));
  const latestSessionRatings = new Map<string, RecallStatus>(Object.entries(sessionLastRatings));
  const masteredInSession = sessionUniqueIds.filter((id) => (masteryPointsById.get(id) ?? 0) >= 3).length;
  const sessionUniqueTotal = sessionUniqueIds.length;
  const todayWordGoal = settings.wordsPerQueue * activeQueueGoal;
  const activeDailyMastery = queueSource === "daily" && !sessionCompletionCommitted
    ? masteredInSession
    : 0;
  const todayWordsCompleted = Math.min(
    todayWordGoal,
    learning.todayQueuesCompleted * settings.wordsPerQueue + activeDailyMastery,
  );
  const todayWordsRemaining = Math.max(0, todayWordGoal - todayWordsCompleted);
  const currentMasteryPoints = currentWord ? masteryPointsById.get(currentWord.id) ?? 0 : 0;
  const currentPromptMode: "choice" | "example" | "direct" = currentMasteryPoints <= 0
    ? "choice"
    : currentMasteryPoints === 1
      ? "example"
      : "direct";
  const currentAttemptNumber: number = currentWord ? 1 : 0;
  const currentIsRepeat = currentWord ? sessionRound > 1 : false;
  const currentMeaningChoices = useMemo(
    () => {
      const word = WORD_BY_ID.get(currentWordId);
      return word ? buildMeaningChoices(word, bookWords) : [];
    },
    [bookWords, currentWordId],
  );
  const spellingWord = WORD_BY_ID.get(sessionUniqueIds[spellingIndex]);
  const sessionProgress = sessionQueue.length
    ? Math.round((masteredInSession / Math.max(1, sessionUniqueTotal)) * 100)
    : dailyComplete ? 100 : Math.round((learning.todayQueuesCompleted / activeQueueGoal) * 100);

  function speak(word: WordCard) {
    if (!("speechSynthesis" in window)) {
      setFeedback("当前浏览器暂不支持德语朗读");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word.term.replace("etwas ", ""));
    utterance.lang = "de-DE";
    utterance.rate = SPEECH_RATES[settings.speechSpeed];
    window.speechSynthesis.speak(utterance);
  }

  function finishSession(nextState: LearningState) {
    setGrading(true);
    setSessionCompletionCommitted(true);
    pendingCompletionStateRef.current = null;
    const completionIds = [...nextState.todayQueueCompletionIds];
    if (queueSource === "daily") {
      completionIds.push(
        `queue-${nextState.todayKey}-${settings.level}-${Math.min(activeQueueGoal, nextState.todayQueuesCompleted + 1)}`,
      );
    }
    const uniqueCompletionIds = Array.from(new Set(completionIds));
    const completedQueues = queueSource === "daily"
      ? Math.min(activeQueueGoal, uniqueCompletionIds.length)
      : nextState.todayQueuesCompleted;
    const finishedDay = queueSource === "daily" && completedQueues >= activeQueueGoal;
    const finalState: LearningState = touchLearning({
      ...nextState,
      todayQueuesCompleted: completedQueues,
      todayQueueCompletionIds: uniqueCompletionIds,
      sessionComplete: nextState.sessionComplete || finishedDay,
      todayQueueLevel: queueSource === "daily" ? settings.level : nextState.todayQueueLevel,
      todayQueueGoal: queueSource === "daily" ? activeQueueGoal : nextState.todayQueueGoal,
    });
    setLearning(finalState);
    clearTransitionTimer();
    transitionTimerRef.current = window.setTimeout(() => {
      transitionTimerRef.current = null;
      setFeedback(null);
      setGrading(false);
      setCurrentIndex(0);
      setRevealed(false);
      if (queueSource === "daily") {
        resetSessionQueue([]);
        if (finishedDay) setView("story");
      } else {
        const dailyQueue = dailyComplete ? [] : buildDailyQueue(finalState, settings);
        resetSessionQueue(dailyQueue);
        setQueueUnavailable(!dailyQueue.length && !dailyComplete);
        setQueueSource("daily");
        setView(returnView);
      }
    }, 680);
  }

  function offerSpelling(
    nextState: LearningState,
    transitionDelay = 620,
    points?: Record<string, number>,
  ) {
    pendingCompletionStateRef.current = nextState;
    clearTransitionTimer();
    transitionTimerRef.current = window.setTimeout(() => {
      transitionTimerRef.current = null;
      if (points) setSessionMasteryPoints(points);
      setFeedback(null);
      setRevealed(false);
      setSelectedChoiceId(null);
      setGrading(false);
      setSessionPhase("spell-prompt");
    }, transitionDelay);
  }

  function beginSpelling() {
    setSpellingIndex(0);
    setSpellingInput("");
    setSpellingChecked(false);
    setSpellingResults([]);
    setSessionPhase("spelling");
  }

  function skipSpelling() {
    finishSession(pendingCompletionStateRef.current ?? learningRef.current);
  }

  function submitSpelling(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!spellingWord) return;
    if (spellingChecked) {
      if (spellingIndex + 1 >= sessionUniqueIds.length) {
        finishSession(pendingCompletionStateRef.current ?? learningRef.current);
        return;
      }
      setSpellingIndex((index) => index + 1);
      setSpellingInput("");
      setSpellingChecked(false);
      return;
    }
    if (!spellingInput.trim()) return;
    const answer = normalizeSpelling(spellingInput);
    const acceptedAnswers = [
      normalizeSpelling(spellingWord.term),
      normalizeSpelling(spellingWord.term.replace(/^etwas\s+/i, "")),
    ];
    const correct = acceptedAnswers.includes(answer);
    setSpellingResults((results) => [...results, correct]);
    setSpellingChecked(true);
  }

  function retrySpelling() {
    if (!spellingChecked) return;
    setSpellingResults((results) => results.slice(0, -1));
    setSpellingInput("");
    setSpellingChecked(false);
    window.requestAnimationFrame(() => spellingInputRef.current?.focus());
  }

  function rateCurrent(
    rating: RecallStatus,
    options: {
      allowUnrevealed?: boolean;
      mode?: "choice" | "rating";
      transitionDelay?: number;
      feedbackText?: string;
    } = {},
  ) {
    if (!currentWord || (!revealed && !options.allowUnrevealed) || grading) return;
    hasLocalInteractionRef.current = true;
    const now = currentTimestamp();
    const latest = learningRef.current;
    const { next, dueLabel } = gradeMemory(latest.records[currentWord.id], rating, now);
    const reviewEvents = [
      ...latest.todayReviewEventIds,
      uniqueId(`review-${latest.todayKey}-${currentWord.id}`),
    ];
    const nextState: LearningState = touchLearning({
      ...latest,
      records: { ...latest.records, [currentWord.id]: next },
      todayReviewed: reviewEvents.length,
      todayWordIds: Array.from(new Set([...latest.todayWordIds, currentWord.id])),
      todayReviewEventIds: reviewEvents,
    });
    setLearning(nextState);
    const nextMasteryPoints =
      rating === "known"
        ? Math.min(3, currentMasteryPoints + 1)
        : rating === "fuzzy"
          ? Math.max(0, currentMasteryPoints - 1)
          : 0;
    const nextPoints = { ...sessionMasteryPoints, [currentWord.id]: nextMasteryPoints };
    setSessionLastRatings((ratings) => ({ ...ratings, [currentWord.id]: rating }));

    // Multiple-choice recall is round based: each word appears once in the
    // current round. A wrong answer does not get inserted immediately; it
    // waits for the next round. Correct answers add one light and are removed
    // from subsequent rounds once they reach three lights.
    if (options.allowUnrevealed) {
      const nextRatings = [...sessionRatings];
      nextRatings[currentIndex] = rating;
      setSessionRatings(nextRatings);
      setFeedback(options.feedbackText ?? (
        nextMasteryPoints >= 3
          ? options.mode === "choice" ? "选择正确 · 三个光点已集齐" : "已知 · 三个光点已集齐"
          : options.mode === "choice"
            ? rating === "unknown"
              ? "选择错误 · 本轮结束后再来一次"
              : `选择正确 · 光点 ${nextMasteryPoints} / 3`
            : rating === "known"
              ? `已知 · 光点 ${nextMasteryPoints} / 3`
              : `${STATUS_META[rating].label} · 下一轮再来一次`
      ));
      setGrading(true);

      const roundComplete = currentIndex + 1 >= sessionQueue.length;
      if (roundComplete) {
        const remainingIds = sessionUniqueIds.filter((id) => (nextPoints[id] ?? 0) < 3);
        clearTransitionTimer();
        if (!remainingIds.length) {
          offerSpelling(nextState, options.transitionDelay, nextPoints);
          return;
        }
        const nextRound = sessionRound + 1;
        transitionTimerRef.current = window.setTimeout(() => {
          transitionTimerRef.current = null;
          beginSessionRound(remainingIds, nextPoints, nextRound);
        }, options.transitionDelay ?? 760);
        return;
      }

      clearTransitionTimer();
      transitionTimerRef.current = window.setTimeout(() => {
        transitionTimerRef.current = null;
        setSessionMasteryPoints(nextPoints);
        setCurrentIndex((index) => index + 1);
        setRevealed(false);
        setSelectedChoiceId(null);
        setFeedback(null);
        setGrading(false);
      }, options.transitionDelay ?? 620);
      return;
    }

    setSessionMasteryPoints(nextPoints);
    const shouldRepeat = nextMasteryPoints < 3;
    const nextQueue = [...sessionQueue];
    const nextRatings = [...sessionRatings];
    nextRatings[currentIndex] = rating;
    if (shouldRepeat) {
      const distance = nextMasteryPoints === 0 ? 5 : nextMasteryPoints === 1 ? 4 : 3;
      const insertionIndex = Math.min(nextQueue.length, currentIndex + distance);
      nextQueue.splice(insertionIndex, 0, currentWord.id);
      nextRatings.splice(insertionIndex, 0, null);
    }
    setSessionQueue(nextQueue);
    setSessionRatings(nextRatings);
    setFeedback(options.feedbackText ?? (
      nextMasteryPoints >= 3
        ? `已知 · 三个光点已集齐，下次 ${dueLabel}`
        : rating === "unknown"
          ? `未知 · 光点已清空，本组稍后重现`
          : `${STATUS_META[rating].label} · 光点 ${nextMasteryPoints} / 3，本组稍后重现`
    ));
    setGrading(true);

    if (currentIndex + 1 >= nextQueue.length) {
      offerSpelling(nextState, options.transitionDelay, nextPoints);
      return;
    }

    clearTransitionTimer();
    transitionTimerRef.current = window.setTimeout(() => {
      transitionTimerRef.current = null;
      setCurrentIndex((index) => index + 1);
      setRevealed(false);
      setSelectedChoiceId(null);
      setFeedback(null);
      setGrading(false);
    }, options.transitionDelay ?? 620);
  }

  function selectMeaningChoice(optionId: string) {
    if (!currentWord || currentPromptMode !== "choice" || currentAttemptNumber !== 1 || grading) return;
    const correct = optionId === currentWord.id;
    setSelectedChoiceId(optionId);
    rateCurrent(correct ? "known" : "unknown", {
      allowUnrevealed: true,
      mode: "choice",
      transitionDelay: 1000,
      feedbackText: correct ? "选择正确 · 获得一个光点" : "选择错误 · 已按未知记录，光点清零",
    });
  }

  function startQueue(
    ids: string[],
    source: "daily" | "review" | "manual" = "manual",
  ) {
    clearTransitionTimer();
    hasLocalInteractionRef.current = true;
    if (source !== "daily") setReturnView(view);
    if (source === "daily") setPlanDirty(false);
    setQueueUnavailable(false);
    setQueueSource(source);
    resetSessionQueue(ids);
    setCurrentIndex(0);
    setRevealed(false);
    setFeedback(null);
    setGrading(false);
    setView("learn");
  }

  function startNextDailyQueue() {
    const ids = buildDailyQueue(learning, settings);
    if (!ids.length) {
      if (learnedToday.length > 0) {
        finishDayWithAvailableWords();
        return;
      }
      setQueueUnavailable(true);
      return;
    }
    startQueue(ids, "daily");
  }

  function finishDayWithAvailableWords() {
    setLearning((current) => {
      const completionIds = Array.from({ length: activeQueueGoal }, (_, index) =>
        `queue-${current.todayKey}-${settings.level}-${index + 1}`,
      );
      return touchLearning({
        ...current,
        sessionComplete: true,
        todayQueuesCompleted: activeQueueGoal,
        todayQueueCompletionIds: completionIds,
        todayQueueLevel: settings.level,
        todayQueueGoal: activeQueueGoal,
      });
    });
    setQueueUnavailable(false);
    setView("story");
  }

  function revealAnswer() {
    // The active study loop is round-based multiple choice. Keep this guard
    // for legacy callers so a keyboard shortcut cannot bypass the choices.
    if (!currentWord || currentAttemptNumber === 1) return;
    hasLocalInteractionRef.current = true;
    setRevealed(true);
    if (settings.autoPronounce) speak(currentWord);
  }

  function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
    if (SYNCED_SETTING_KEYS.includes(key as keyof SyncedSettings)) {
      setSettingsUpdatedAt((current) => mutationTimestamp(current));
    }
    if (["wordsPerQueue", "level", "order", "dueFirst"].includes(key)) setPlanDirty(true);
    if (key === "level") {
      const nextLevel = value as CEFRLevel;
      setLibraryVisibleCount(LIBRARY_PAGE_SIZE);
      setReviewVisibleCount(REVIEW_PAGE_SIZE);
      setLearning((current) => touchLearning({
        ...current,
        todayQueuesCompleted: 0,
        todayQueueCompletionIds: [],
        sessionComplete: false,
        todayQueueLevel: nextLevel,
        todayQueueGoal: settings.queuesPerDay,
      }));
      setQueueUnavailable(false);
      setSettingsNotice(`已切换到 ${nextLevel} · 今日队列将按新词书重新开始`);
    } else if (key === "queuesPerDay") {
      const canApplyToday = learning.todayReviewed === 0 && learning.todayQueuesCompleted === 0;
      if (canApplyToday) {
        setLearning((current) => touchLearning({ ...current, todayQueueGoal: value as number }));
        setSettingsNotice("已自动保存 · 今天就按新的队列数量学习");
      } else {
        setSettingsNotice(`已自动保存 · 新的每日队列数明天生效，今天仍为 ${activeQueueGoal} 个`);
      }
    } else if (key === "theme" || key === "skin") {
      setSettingsNotice("已自动保存 · 外观已在本设备更新");
    } else {
      setSettingsNotice("已自动保存 · 新的学习计划从下一队列开始生效");
    }
    setConfirmReset(false);
  }

  function restoreDefaultSettings() {
    setSettings(DEFAULT_SETTINGS);
    setLibraryVisibleCount(LIBRARY_PAGE_SIZE);
    setReviewVisibleCount(REVIEW_PAGE_SIZE);
    setSettingsUpdatedAt((current) => mutationTimestamp(current));
    setPlanDirty(true);
    setLearning((current) => {
      const levelChanged = current.todayQueueLevel !== DEFAULT_SETTINGS.level;
      const canApplyGoal = current.todayReviewed === 0 && current.todayQueuesCompleted === 0;
      return touchLearning({
        ...current,
        todayQueuesCompleted: levelChanged ? 0 : current.todayQueuesCompleted,
        todayQueueCompletionIds: levelChanged ? [] : current.todayQueueCompletionIds,
        sessionComplete: levelChanged ? false : current.sessionComplete,
        todayQueueLevel: DEFAULT_SETTINGS.level,
        todayQueueGoal: levelChanged || canApplyGoal ? DEFAULT_SETTINGS.queuesPerDay : current.todayQueueGoal,
      });
    });
    setQueueUnavailable(false);
    setSettingsNotice("已恢复默认设置；如果今天已经开始学习，新的每日队列数明天生效");
    setConfirmReset(false);
  }

  function clearLearningProgress() {
    const now = Math.max(currentTimestamp(), learningRef.current.resetAt + 1);
    resetConfirmedRef.current = true;
    pendingResetRef.current = now;
    hasLocalInteractionRef.current = false;
    const fresh: LearningState = {
      ...createInitialState(now),
      todayQueueLevel: settings.level,
      todayQueueGoal: settings.queuesPerDay,
      resetAt: now,
      updatedAt: now,
    };
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    clearTransitionTimer();
    setLearning(fresh);
    resetSessionQueue(buildDailyQueue(fresh, settings));
    setQueueSource("daily");
    setReturnView("learn");
    setPlanDirty(false);
    setQueueUnavailable(false);
    setCurrentIndex(0);
    setRevealed(false);
    setGrading(false);
    setFeedback(null);
    setLibraryFilter("all");
    setLibraryVisibleCount(LIBRARY_PAGE_SIZE);
    setReviewVisibleCount(REVIEW_PAGE_SIZE);
    setSettingsNotice("学习进度已清空，正在同步到所有设备");
    setView("learn");
    setConfirmReset(false);
    window.setTimeout(() => void synchronizeCloud(false), 0);
  }

  function openDictionary(word: WordCard, trigger?: HTMLElement | null) {
    dictionaryTriggerRef.current = trigger ?? null;
    setDictionaryEvidence(null);
    setDictionaryEvidenceStatus("loading");
    setDictionaryWord(word);
  }

  function closeDictionary() {
    setDictionaryWord(null);
  }

  function retryDictionaryEvidence() {
    setDictionaryEvidence(null);
    setDictionaryEvidenceStatus("loading");
    setDictionaryEvidenceReload((revision) => revision + 1);
  }

  function switchView(nextView: View) {
    if (nextView === "library") setLibraryVisibleCount(LIBRARY_PAGE_SIZE);
    if (nextView === "review") setReviewVisibleCount(REVIEW_PAGE_SIZE);
    const shouldRestoreDaily = nextView === "learn" && (
      queueSource !== "daily" ||
      (view !== "learn" && !sessionQueue.length) ||
      planDirty
    );
    if (shouldRestoreDaily) {
      const dailyQueue = dailyComplete ? [] : buildDailyQueue(learning, settings);
      resetSessionQueue(dailyQueue);
      setQueueUnavailable(!dailyQueue.length && !dailyComplete);
      setQueueSource("daily");
      setPlanDirty(false);
      setCurrentIndex(0);
      setRevealed(false);
      setGrading(false);
    }
    setView(nextView);
    setFeedback(null);
  }

  useEffect(() => {
    if (
      view !== "learn"
      || !currentWord
      || grading
      || confirmReset
    ) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (dictionaryWord) return;
      const target = event.target as HTMLElement | null;
      // Letter/number shortcuts should work even when the matching button has
      // focus. Keep text-entry controls isolated so typing in settings or
      // search fields never changes the active study card.
      if (target?.closest("input, select, textarea")) return;
      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        speak(currentWord);
        return;
      }
      if (event.code === "Space" || event.key === " ") {
        event.preventDefault();
        const termButton = document.querySelector<HTMLElement>(".dictionary-term-main");
        openDictionary(currentWord, termButton);
        return;
      }
      if (currentPromptMode === "choice" && !grading) {
        const choiceIndex = Number.parseInt(event.key, 10) - 1;
        if (choiceIndex >= 0 && choiceIndex < currentMeaningChoices.length) {
          event.preventDefault();
          selectMeaningChoice(currentMeaningChoices[choiceIndex].id);
          return;
        }
      }
      const ratingByKey: Record<string, RecallStatus> = {
        q: "known",
        w: "fuzzy",
        e: "unknown",
      };
      const rating = ratingByKey[event.key.toLowerCase()];
      const ratingStage = revealed || currentPromptMode === "example" || currentPromptMode === "direct";
      if (ratingStage && rating) {
        event.preventDefault();
        rateCurrent(rating, {
          allowUnrevealed: currentPromptMode !== "choice",
          mode: currentPromptMode === "choice" ? "choice" : "rating",
          transitionDelay: 620,
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // revealAnswer deliberately reads the latest speech preferences listed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    confirmReset,
    currentWord,
    currentMeaningChoices,
    currentPromptMode,
    dictionaryWord,
    grading,
    revealed,
    settings.autoPronounce,
    settings.speechSpeed,
    view,
  ]);

  useEffect(() => {
    if (!confirmReset) return;
    resetConfirmedRef.current = false;
    const resetTrigger = resetTriggerRef.current;
    const previousOverflow = document.body.style.overflow;
    const backgroundElements = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".app-shell > .topbar, .app-shell > .main-content, .app-shell > .site-footer",
      ),
    );
    const previousAccessibility = backgroundElements.map((element) => ({
      element,
      ariaHidden: element.getAttribute("aria-hidden"),
      inert: element.hasAttribute("inert"),
    }));
    backgroundElements.forEach((element) => {
      element.setAttribute("inert", "");
      element.setAttribute("aria-hidden", "true");
    });
    document.body.style.overflow = "hidden";
    window.setTimeout(() => resetCancelRef.current?.focus(), 0);

    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setConfirmReset(false);
        return;
      }
      if (event.key !== "Tab" || !resetDialogRef.current) return;
      const focusable = Array.from(
        resetDialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      previousAccessibility.forEach(({ element, ariaHidden, inert }) => {
        if (!inert) element.removeAttribute("inert");
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      });
      window.removeEventListener("keydown", handleDialogKeyDown);
      if (!resetConfirmedRef.current && resetTrigger?.isConnected) resetTrigger.focus();
    };
  }, [confirmReset]);

  useEffect(() => {
    if (!dictionaryWord) return;
    const trigger = dictionaryTriggerRef.current;
    const previousOverflow = document.body.style.overflow;
    const backgroundElements = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".app-shell > .topbar, .app-shell > .main-content, .app-shell > .site-footer",
      ),
    );
    const previousAccessibility = backgroundElements.map((element) => ({
      element,
      ariaHidden: element.getAttribute("aria-hidden"),
      inert: element.hasAttribute("inert"),
    }));
    backgroundElements.forEach((element) => {
      element.setAttribute("inert", "");
      element.setAttribute("aria-hidden", "true");
    });
    document.body.style.overflow = "hidden";
    window.setTimeout(() => dictionaryCloseRef.current?.focus(), 0);

    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDictionary();
        return;
      }
      if (event.code === "Space" || event.key === " ") {
        event.preventDefault();
        closeDictionary();
        return;
      }
      if (event.key !== "Tab" || !dictionaryDialogRef.current) return;
      const focusable = Array.from(
        dictionaryDialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      previousAccessibility.forEach(({ element, ariaHidden, inert }) => {
        if (!inert) element.removeAttribute("inert");
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      });
      window.removeEventListener("keydown", handleDialogKeyDown);
      if (trigger?.isConnected) trigger.focus();
    };
  }, [dictionaryWord]);

  useEffect(() => {
    if (!dictionaryWord) return;
    const controller = new AbortController();
    const term = dictionaryWord.term;

    void (async () => {
      try {
        const response = await fetch(
          `/api/dictionary?term=${encodeURIComponent(term)}`,
          {
            headers: { Accept: "application/json" },
            signal: controller.signal,
          },
        );
        if (!response.ok) throw new Error("Dictionary evidence unavailable.");
        const evidence = parseDictionaryEvidencePayload(await response.json());
        if (!evidence) throw new Error("Dictionary evidence was invalid.");
        setDictionaryEvidence(evidence);
        setDictionaryEvidenceStatus("success");
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Dictionary evidence could not be loaded.", error);
        setDictionaryEvidence(null);
        setDictionaryEvidenceStatus("error");
      }
    })();

    return () => controller.abort();
  }, [dictionaryEvidenceReload, dictionaryWord]);

  if (!ready) {
    return (
      <main className="loading-page">
        <div className="loading-mark">W</div>
        <p>正在展开今天的词册…</p>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => switchView("learn")} aria-label="返回今日学习" disabled={grading}>
          <span className="brand-word">WORTTAG</span>
          <span className="brand-seal">W</span>
          <span className="brand-version">beta1.6</span>
        </button>
        <nav className="main-nav" aria-label="主导航">
          {([
            ["learn", "今日学习"],
            ["review", "复习"],
            ["library", "词库"],
            ["settings", "设置"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              className={view === id ? "nav-item active" : "nav-item"}
              onClick={() => switchView(id)}
              disabled={grading}
              aria-current={view === id ? "page" : undefined}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="streak" aria-label={`连续学习 ${learning.streakDays} 天`}>
          <span className="streak-flame">✦</span>
          <span><strong>{learning.streakDays}</strong> 天连续学习</span>
        </div>
      </header>

      <main className="main-content">
        {view === "learn" && (
          <>
            <section className="page-heading learn-heading">
              <div className={queueSource === "daily" ? "learn-title daily-library-title" : "learn-title"}>
                <p className="kicker">{queueSource === "daily" ? new Date().toLocaleDateString("de-DE", { weekday: "long" }) : queueSource === "review" ? "Wiederholen · 到期复习" : "Einzelkarte · 单独学习"}</p>
                <h1>{queueSource === "daily" ? `${settings.level} 今日词库` : queueSource === "review" ? "到期的词，认真想一次。" : "只学这一张，也算向前一步。"}</h1>
              </div>
              <div className="heading-progress" aria-label={`今日计划进度 ${sessionProgress}%`}>
                <div className="progress-copy">
                  <span>{queueSource === "daily" ? `今日计划 · 第 ${Math.min(learning.todayQueuesCompleted + 1, activeQueueGoal)} / ${activeQueueGoal} 队列` : queueSource === "review" ? "本次复习" : "本次单独学习"}</span>
                  <strong>{queueSource === "daily" && !sessionQueue.length ? `${learning.todayQueuesCompleted} / ${activeQueueGoal}` : `${masteredInSession} / ${sessionUniqueTotal}`}</strong>
                </div>
                <div className="progress-track"><span style={{ width: `${sessionProgress}%` }} /></div>
              </div>
            </section>

            {sessionPhase === "spell-prompt" ? (
              <section className="spelling-gate word-card">
                <div className="spelling-seal" aria-hidden="true">✓</div>
                <p className="kicker">Runde geschafft · 本轮完成</p>
                <h2>所有单词都已点亮三次。</h2>
                <p>现在要进行一次拼写测试吗？它不会改变已经获得的光点，可以放心挑战。</p>
                <div className="spelling-gate-summary">
                  <span><strong>{sessionUniqueTotal}</strong> 个单词</span>
                  <span><strong>{sessionUniqueTotal * 3}</strong> 个光点</span>
                </div>
                <div className="spelling-gate-actions">
                  <button className="reveal-button" onClick={beginSpelling}>开始拼写 →</button>
                  <button className="secondary-action" onClick={skipSpelling}>这轮暂不拼写</button>
                </div>
              </section>
            ) : sessionPhase === "spelling" && spellingWord ? (
              <section className="spelling-test word-card">
                <div className="spelling-test-topline">
                  <div>
                    <p className="kicker">Buchstabieren · 拼写测试</p>
                    <span>{spellingIndex + 1} / {sessionUniqueTotal}</span>
                  </div>
                  <div className="spelling-score">
                    <strong>{spellingResults.filter(Boolean).length}</strong>
                    <small>已拼对</small>
                  </div>
                </div>
                <div className="spelling-cue">
                  <span>{spellingWord.type}</span>
                  <h2>{spellingWord.meaning}</h2>
                  <button className="speak-button" type="button" onClick={() => speak(spellingWord)}>
                    <span className="sound-rings" aria-hidden="true">◖))</span> 听发音
                  </button>
                </div>
                <form className="spelling-form" onSubmit={submitSpelling}>
                  <label htmlFor="spelling-answer">写出完整德语单词，名词请包含冠词</label>
                  <input
                    ref={spellingInputRef}
                    id="spelling-answer"
                    value={spellingInput}
                    onChange={(event) => setSpellingInput(event.target.value)}
                    disabled={spellingChecked}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    autoFocus
                    placeholder="在这里输入…"
                  />
                  {spellingChecked && (
                    <div className={spellingResults[spellingResults.length - 1] ? "spelling-result correct" : "spelling-result incorrect"} role="status">
                      <strong>{spellingResults[spellingResults.length - 1] ? "拼写正确" : "再留意一次正确写法"}</strong>
                      <span lang="de"><ArticleTerm term={spellingWord.term} /></span>
                    </div>
                  )}
                  <div className="spelling-form-actions">
                    {spellingChecked && (
                      <button className="secondary-action" type="button" onClick={retrySpelling}>
                        重新拼写
                      </button>
                    )}
                    <button className="reveal-button" type="submit" disabled={!spellingChecked && !spellingInput.trim()}>
                      {spellingChecked ? (spellingIndex + 1 >= sessionUniqueTotal ? "完成本轮 →" : "下一个 →") : "检查拼写"}
                    </button>
                  </div>
                </form>
              </section>
            ) : currentWord ? (
              <div className="study-layout">
                <aside className="session-panel paper-panel" aria-label="今日学习队列">
                  <div className="panel-heading">
                    <span className="folio">01</span>
                    <div><p className="kicker">Sitzung</p><h2>{queueSource === "daily" ? "今日队列" : queueSource === "review" ? "复习队列" : "单独学习"}</h2></div>
                  </div>
                  <div className="queue-list">
                    {sessionUniqueIds.map((id, index) => {
                      const word = WORD_BY_ID.get(id);
                      if (!word) return null;
                      const recallStatus = latestSessionRatings.get(id);
                      const masteryPoints = masteryPointsById.get(id) ?? 0;
                      const itemStatus = masteryPoints >= 3
                        ? "done"
                        : currentWord?.id === id
                          ? "current"
                          : recallStatus
                            ? "attempted"
                            : "upcoming";
                      const statusIcon =
                        recallStatus === "known" ? "✓" : recallStatus === "fuzzy" ? "~" : recallStatus === "unknown" ? "×" : index + 1;
                      return (
                        <div className={`queue-item ${itemStatus}${recallStatus ? ` recall-${recallStatus}` : ""}`} key={id}>
                          <span className="queue-dot" title={recallStatus ? STATUS_META[recallStatus].label : undefined}>{statusIcon}</span>
                          <span className="queue-name"><ArticleTerm term={word.term.replace(/^etwas\s+/, "")} /></span>
                        </div>
                      );
                    })}
                  </div>
                </aside>

                <section className={revealed ? "word-card revealed" : "word-card"}>
                  <div className="card-topline">
                    <span className="card-mode">{currentIsRepeat ? `第 ${sessionRound} 轮` : queueSource === "manual" ? "单独学习" : currentRecord ? "复习" : "新词"} · {String(currentIndex + 1).padStart(2, "0")} / {sessionQueue.length}</span>
                    <button className="speak-button" onClick={() => speak(currentWord)} aria-label={`朗读 ${currentWord.term}`}>
                      <span className="sound-rings" aria-hidden="true">◖))</span> 听发音
                    </button>
                  </div>

                  <div className={`word-front exposure-${Math.min(3, currentAttemptNumber)}`}>
                    <p className="word-type">{currentWord.type}</p>
                    <div className="word-title-row">
                      <h2>
                        <button
                          className="dictionary-term-button dictionary-term-main"
                          type="button"
                          onClick={(event) => openDictionary(currentWord, event.currentTarget)}
                          aria-haspopup="dialog"
                          aria-label={`查看 ${currentWord.term} 的词典释义`}
                          title="查看权威词典释义"
                        >
                          <ArticleTerm term={currentWord.term} />
                        </button>
                      </h2>
                      <span className="mastery-lights" aria-label={`当前获得 ${currentMasteryPoints} / 3 个光点`}>
                        {[0, 1, 2].map((index) => (
                          <i className={index >= 3 - currentMasteryPoints ? "lit" : ""} key={index} />
                        ))}
                      </span>
                    </div>
                    <p className="word-forms">{wordFormsForDisplay(currentWord)}</p>
                  </div>

                  {!revealed ? (
                    currentPromptMode === "choice" ? (
                      <div className="choice-recall">
                        <div className="ink-divider"><span>第 {sessionRound} 轮 · 选择词义</span></div>
                        <div className="meaning-options" role="radiogroup" aria-label={`${currentWord.term} 的词义选项`}>
                          {currentMeaningChoices.map((option, index) => {
                            const optionClass = grading && selectedChoiceId
                              ? option.id === currentWord.id
                                ? "meaning-option correct-answer"
                                : option.id === selectedChoiceId
                                  ? "meaning-option incorrect-answer"
                                  : "meaning-option muted"
                              : selectedChoiceId === option.id
                                ? "meaning-option selected"
                                : "meaning-option";
                            return (
                              <button
                                className={optionClass}
                                type="button"
                                role="radio"
                                aria-checked={selectedChoiceId === option.id}
                                onClick={() => selectMeaningChoice(option.id)}
                                disabled={grading}
                                key={option.id}
                              >
                                <small>{option.type}</small>
                                <strong>{option.meaning}</strong>
                                <span className="meaning-key" aria-hidden="true">{index + 1}</span>
                              </button>
                            );
                          })}
                        </div>
                        {grading && selectedChoiceId ? (
                          <div className={selectedChoiceId === currentWord.id ? "choice-auto-result correct" : "choice-auto-result incorrect"} role="status">
                            <strong>{selectedChoiceId === currentWord.id ? "选择正确 · 光点 +1" : "正确词义"}</strong>
                            <span>{currentWord.meaning}</span>
                            {selectedChoiceId !== currentWord.id && <small>1 秒后自动进入下一个单词</small>}
                          </div>
                        ) : (
                          <p className="choice-instruction">本轮按顺序每词一次；答错会在下一轮再出现</p>
                        )}
                      </div>
                    ) : currentPromptMode === "example" ? (
                      <div className="round-rating example-stage">
                        <div className="ink-divider"><span>第 {sessionRound} 轮 · 根据例句判断</span></div>
                        {currentWord.example ? (
                          <blockquote className="recall-example">
                            <p lang="de">{currentWord.example}</p>
                          </blockquote>
                        ) : (
                          <div className="example-placeholder" role="note">（例句待补充）</div>
                        )}
                        <div className="rating-buttons" role="group" aria-label="根据例句判断记忆程度">
                          {(["known", "fuzzy", "unknown"] as const).map((status) => (
                            <button
                              className={`rating-button ${status}`}
                              key={status}
                              type="button"
                              onClick={() => rateCurrent(status, {
                                allowUnrevealed: true,
                                mode: "rating",
                                transitionDelay: 620,
                              })}
                              disabled={grading}
                            >
                              <span className="rating-icon" aria-hidden="true">
                                {status === "unknown" ? "×" : status === "fuzzy" ? "~" : "✓"}
                              </span>
                              <strong>{STATUS_META[status].label}</strong>
                              <span className="rating-key" aria-hidden="true">{status === "known" ? "Q" : status === "fuzzy" ? "W" : "E"}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : currentPromptMode === "direct" ? (
                      <div className="round-rating">
                        <div className="ink-divider"><span>第 {sessionRound} 轮 · 直接判断</span></div>
                        <div className="rating-buttons" role="group" aria-label="记忆程度">
                          {(["known", "fuzzy", "unknown"] as const).map((status) => (
                            <button
                              className={`rating-button ${status}`}
                              key={status}
                              type="button"
                              onClick={() => rateCurrent(status, {
                                allowUnrevealed: true,
                                mode: "rating",
                                transitionDelay: 620,
                              })}
                              disabled={grading}
                            >
                              <span className="rating-icon" aria-hidden="true">
                                {status === "unknown" ? "×" : status === "fuzzy" ? "~" : "✓"}
                              </span>
                              <strong>{STATUS_META[status].label}</strong>
                              <span className="rating-key" aria-hidden="true">{status === "known" ? "Q" : status === "fuzzy" ? "W" : "E"}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : currentAttemptNumber === 2 ? (
                      <div className="recall-prompt second-exposure">
                        <div className="ink-divider"><span>第二次 · 只看语境</span></div>
                        {currentWord.example ? (
                          <blockquote className="recall-example">
                            <p lang="de">{currentWord.example}</p>
                          </blockquote>
                        ) : (
                          <p className="recall-no-example">这个词条暂时没有例句；请直接尝试回忆词义。</p>
                        )}
                        <button className="reveal-button" onClick={revealAnswer}>
                          看答案 <span aria-hidden="true">→</span>
                        </button>
                      </div>
                    ) : (
                      <div className="recall-prompt third-exposure">
                        <button className="reveal-button" onClick={revealAnswer}>
                          看答案 <span aria-hidden="true">→</span>
                        </button>
                      </div>
                    )
                  ) : (
                    <div className="answer-sheet" aria-live="polite">
                      <div className="meaning-line">
                        <span className="answer-label">释义</span>
                        <strong>{currentWord.meaning}</strong>
                      </div>
                      {currentWord.example && (
                        <blockquote>
                          <p>{currentWord.example}</p>
                          {settings.showTranslation && currentWord.exampleZh && <footer>{currentWord.exampleZh}</footer>}
                        </blockquote>
                      )}
                      <div className="rating-area">
                        <p>光点规则：已知 +1 · 模糊 −1 · 未知清零</p>
                        <div className="rating-buttons">
                          {(["known", "fuzzy", "unknown"] as const).map((status) => (
                            <button
                              className={`rating-button ${status}`}
                              key={status}
                              onClick={() => rateCurrent(status)}
                              disabled={grading}
                            >
                              <span className="rating-icon" aria-hidden="true">
                                {status === "unknown" ? "×" : status === "fuzzy" ? "~" : "✓"}
                              </span>
                              <span><strong>{STATUS_META[status].label}</strong><small>{previewDue(currentRecord, status, clock)}</small></span>
                              <span className="rating-key" aria-hidden="true">{status === "known" ? "Q" : status === "fuzzy" ? "W" : "E"}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  {feedback && <div className="feedback-toast" role="status">{feedback}</div>}
                </section>

                <aside className="insight-column">
                  <section className="shortcut-card paper-panel" aria-label="学习快捷键">
                    <p className="kicker">Tastatur · 快捷键</p>
                    <div className="shortcut-keys">
                      <span><kbd>F</kbd> 按 F 发音</span>
                      <span><kbd>空格</kbd> 按空格打开详情</span>
                    </div>
                  </section>
                  <section className="plan-card paper-panel">
                    <div className="panel-heading compact">
                      <span className="folio">02</span>
                      <div><p className="kicker">Heute</p><h2>{queueSource === "daily" ? "今日计划" : queueSource === "review" ? "到期复习" : "单独学习"}</h2></div>
                    </div>
                    <div className="plan-stats">
                      <div><strong>{queueSource === "daily" ? dueWords.length : sessionUniqueTotal}</strong><span>{queueSource === "daily" ? "到期复习" : "本队词数"}</span></div>
                      <div><strong>{queueSource === "daily" ? todayWordsRemaining : dueWords.length}</strong><span>{queueSource === "daily" ? "今日剩余" : "到期总数"}</span></div>
                      <div><strong>{Math.max(2, Math.round((queueSource === "daily" ? settings.wordsPerQueue : sessionUniqueTotal) * 1.1))}</strong><span>约分钟</span></div>
                    </div>
                  </section>
                  <button className="story-preview" onClick={() => switchView("story")} disabled={grading}>
                    <span className="story-number">03</span>
                    <span><small>{settings.level} · 每日短文</small><strong>{LEVEL_META[settings.level].story}</strong><em>{dailyComplete ? "已经生成 · 阅读 →" : `完成 ${activeQueueGoal} 个队列后自动生成`}</em></span>
                  </button>
                </aside>
              </div>
            ) : queueUnavailable && !dailyComplete ? (
              <section className="empty-state word-card">
                <p className="kicker">Heute ruhig · {settings.level}</p>
                <h2>{learnedToday.length ? "今天能学的词已经全部完成。" : "当前词书暂时没有需要学习的词。"}</h2>
                <p>{learnedToday.length ? `今天已经学习 ${learnedToday.length} 个词，可以直接用这些词生成短文。` : "新词已经完成，下一次复习会按遗忘曲线准时出现。你也可以先切换另一本词书。"}</p>
                <div className="empty-actions">
                  <button className="reveal-button" onClick={learnedToday.length ? finishDayWithAvailableWords : () => switchView("settings")}>
                    {learnedToday.length ? "生成今日短文 →" : "选择其他词书 →"}
                  </button>
                  <button className="secondary-action" onClick={() => switchView("review")}>查看复习安排</button>
                </div>
              </section>
            ) : (
              <section className="empty-state word-card">
                <p className="kicker">{dailyComplete ? "Heute geschafft" : `Sitzung ${learning.todayQueuesCompleted + 1}`}</p>
                <h2>{dailyComplete ? "今天的学习已经完成。" : `第 ${learning.todayQueuesCompleted} 个队列完成。`}</h2>
                <p>{dailyComplete ? "复习节奏已排好，现在去读一篇只属于今天的小短文。" : `今天还剩 ${Math.max(0, activeQueueGoal - learning.todayQueuesCompleted)} 个队列，每个最多 ${settings.wordsPerQueue} 个词。`}</p>
                <button className="reveal-button" onClick={dailyComplete ? () => switchView("story") : startNextDailyQueue}>
                  {dailyComplete ? "阅读今日短文 →" : "开始下一队列 →"}
                </button>
              </section>
            )}
          </>
        )}

        {view === "review" && (
          <section className="secondary-page">
            <div className="page-heading">
              <div><p className="kicker">Wiederholen · {settings.level}</p><h1>到时间的词，才值得复习。</h1></div>
              <button className="primary-action" disabled={!dueWords.length} onClick={() => startQueue(dueWords.slice(0, settings.wordsPerQueue).map((word) => word.id), "review")}>
                {dueWords.length ? `开始复习 ${Math.min(dueWords.length, settings.wordsPerQueue)} 个词` : "今天已清空"}
              </button>
            </div>
            <div className="review-summary-grid">
              <article className="summary-card"><span>现在到期</span><strong>{dueWords.length}</strong><small>优先处理未知与逾期词</small></article>
              <article className="summary-card"><span>本日已复习</span><strong>{learning.todayReviewed}</strong><small>每次判断都会自动排期</small></article>
              <article className="summary-card"><span>最长间隔</span><strong>180</strong><small>天 · 连续答对逐级增长</small></article>
            </div>
            <div className="due-list paper-panel">
              <div className="list-header"><span>单词</span><span>状态</span><span>上次结果</span><span>下次出现</span></div>
              {reviewWords.slice(0, reviewVisibleCount).map((word) => {
                const record = learning.records[word.id];
                const status = record?.status ?? "unknown";
                return (
                  <button className="due-row" key={word.id} onClick={() => startQueue([word.id], "review")}>
                    <span><strong><ArticleTerm term={word.term} /></strong><small>{word.meaning}</small></span>
                    <span className={`status-pill ${status}`}>{STATUS_META[status].label}</span>
                    <span>{record ? `${record.intervalDays || "<1"} 天间隔` : "新词"}</span>
                    <span>{record ? formatDate(record.dueAt) : "尚未学习"}</span>
                  </button>
                );
              })}
              {reviewVisibleCount < reviewWords.length && (
                <div className="incremental-list-sentinel" ref={reviewLoadMoreRef} aria-hidden="true" />
              )}
            </div>
          </section>
        )}

        {view === "library" && (
          <section className="secondary-page">
            <div className="page-heading library-heading">
              <div><p className="kicker">Wortschatz · {settings.level} {LEVEL_META[settings.level].title}</p><h1>你的词，分得清才记得住。</h1></div>
              <div className="filter-tabs" aria-label="按掌握状态筛选">
                {(["all", "unknown", "fuzzy", "known"] as const).map((filter) => (
                  <button
                    key={filter}
                    className={libraryFilter === filter ? "active" : ""}
                    onClick={() => {
                      setLibraryVisibleCount(LIBRARY_PAGE_SIZE);
                      setLibraryFilter(filter);
                    }}
                    aria-pressed={libraryFilter === filter}
                  >
                    {filter === "all" ? "全部" : STATUS_META[filter].label}
                    <span>{filter === "all" ? librarySearchMatches.length : librarySearchCounts[filter]}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="library-search-tools">
              <div className="library-search" role="search">
                <span className="library-search-mark" aria-hidden="true">⌕</span>
                <input
                  type="search"
                  value={libraryQuery}
                  onChange={(event) => {
                    setLibraryVisibleCount(LIBRARY_PAGE_SIZE);
                    setLibraryQuery(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && libraryQuery) {
                      event.preventDefault();
                      setLibraryVisibleCount(LIBRARY_PAGE_SIZE);
                      setLibraryQuery("");
                    }
                  }}
                  placeholder="输入德语单词、变位或中文释义"
                  aria-label={`在 ${settings.level} 词书中进行中德双语检索`}
                  autoComplete="off"
                  spellCheck={false}
                />
                {libraryQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setLibraryVisibleCount(LIBRARY_PAGE_SIZE);
                      setLibraryQuery("");
                    }}
                    aria-label="清空检索"
                  >
                    清空
                  </button>
                )}
              </div>
              <p className="library-search-meta" aria-live="polite">
                {libraryQueryTokens.length
                  ? `在 ${settings.level} 词书中找到 ${libraryWords.length} 个结果`
                  : `支持中文与德语检索 · 当前 ${bookWords.length} 词`}
              </p>
            </div>
            {libraryWords.length ? (
              <div className="word-library-grid">
                {libraryWords.slice(0, libraryVisibleCount).map((word, index) => {
                  const status = learning.records[word.id]?.status ?? "unknown";
                  return (
                    <article className="library-card" key={word.id}>
                      <div className="library-card-top"><span className="folio">{String(index + 1).padStart(2, "0")}</span><span className={`status-pill ${status}`}>{STATUS_META[status].label}</span></div>
                      <p className="word-type">{word.type}</p>
                      <h2>
                        <button
                          className="dictionary-term-button"
                          type="button"
                          onClick={(event) => openDictionary(word, event.currentTarget)}
                          aria-haspopup="dialog"
                          aria-label={`查看 ${word.term} 的词典释义`}
                          title="查看权威词典释义"
                        >
                          <ArticleTerm term={word.term} />
                        </button>
                      </h2>
                      <p className="library-meaning">{word.meaning}</p>
                      <div className="library-grammar"><span>搭配</span>{word.grammarTitle}</div>
                      <button onClick={() => startQueue([word.id], "manual")}>单独学习 <span aria-hidden="true">→</span></button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="library-empty" role="status">
                <span aria-hidden="true">0</span>
                <div>
                  <p className="kicker">Keine Treffer · 暂无结果</p>
                  <h2>{libraryQueryTokens.length ? `没有找到“${libraryQuery.trim()}”` : "当前筛选下没有单词"}</h2>
                  <p>试试中文释义、德语原形、名词复数或动词变位，也可以清空掌握状态筛选。</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setLibraryVisibleCount(LIBRARY_PAGE_SIZE);
                    if (libraryQueryTokens.length) setLibraryQuery("");
                    else setLibraryFilter("all");
                  }}
                >
                  {libraryQueryTokens.length ? "清空检索" : "查看全部单词"}
                </button>
              </div>
            )}
            {libraryVisibleCount < libraryWords.length && (
              <div className="incremental-list-sentinel" ref={libraryLoadMoreRef} aria-hidden="true" />
            )}
          </section>
        )}

        {view === "settings" && (
          <section className="secondary-page settings-page">
            <div className="page-heading settings-heading">
              <div>
                <p className="kicker">Einstellungen</p>
                <h1>把每天的词课，调成你的节奏。</h1>
              </div>
              <div className="settings-save-note">
                <span aria-hidden="true">✓</span>{settingsNotice}
              </div>
            </div>

            <section className="settings-plan-summary" aria-label="当前学习计划摘要">
              <div><span>当前词书</span><strong>{settings.level}</strong><small>{LEVEL_META[settings.level].title}</small></div>
              <div><span>每队列</span><strong>{settings.wordsPerQueue}</strong><small>个单词</small></div>
              <div><span>每天</span><strong>{settings.queuesPerDay}</strong><small>个队列</small></div>
              <div className="daily-goal-seal"><span>每日目标</span><strong>{dailyTarget}</strong><small>张词卡</small></div>
            </section>

            <div className="settings-layout">
              <fieldset className="settings-card appearance-settings">
                <legend><span className="settings-index">01</span><span><small>Appearance</small>外观</span></legend>
                <p className="settings-help">深色模式仍保留羊皮纸质感；跟随系统会随设备外观自动变化。</p>
                <div className="theme-options">
                  {([
                    ["light", "浅色", "明亮羊皮纸"],
                    ["dark", "深色", "深棕绿纸张"],
                    ["system", "跟随系统", "自动切换"],
                  ] as const).map(([value, label, description]) => (
                    <label className={settings.theme === value ? "theme-option selected" : "theme-option"} key={value}>
                      <input type="radio" name="theme" value={value} checked={settings.theme === value} onChange={() => updateSetting("theme", value)} />
                      <span className={`theme-swatch ${value}`} aria-hidden="true"><i /><i /></span>
                      <strong>{label}</strong><small>{description}</small>
                      <em>{settings.theme === value ? "已选择" : ""}</em>
                    </label>
                  ))}
                </div>
                <div className="skin-heading">
                  <strong>风格皮肤</strong>
                  <small>只改变配色与纸张气质，可与深浅模式自由组合。</small>
                </div>
                <div className="skin-options" role="radiogroup" aria-label="风格皮肤">
                  {([
                    ["parchment", "原典羊皮纸", "米金 · 墨绿"],
                    ["mist", "雾蓝晨曦", "灰蓝 · 海松"],
                    ["forest", "苔绿书房", "苔绿 · 木棕"],
                    ["wine", "酒红典藏", "勃艮第 · 旧玫瑰"],
                    ["graphite", "石墨报刊", "灰白 · 炭黑"],
                  ] as const).map(([value, label, description]) => (
                    <label className={settings.skin === value ? "skin-option selected" : "skin-option"} key={value}>
                      <input type="radio" name="skin" value={value} checked={settings.skin === value} onChange={() => updateSetting("skin", value)} />
                      <span className={`skin-swatch ${value}`} aria-hidden="true"><i /><i /><i /></span>
                      <span><strong>{label}</strong><small>{description}</small></span>
                      <em>{settings.skin === value ? "✓" : ""}</em>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="settings-plan-column">
                <fieldset className="settings-card plan-settings">
                  <legend><span className="settings-index">02</span><span><small>Study plan</small>每日学习计划</span></legend>
                  <div className="setting-row">
                    <div><strong>每个队列的单词数</strong><p>一次专注完成一小组，包含新词与到期复习。</p></div>
                    <div className="number-options" role="radiogroup" aria-label="每个队列的单词数">
                      {[5, 10, 15, 20].map((value) => (
                        <label className={settings.wordsPerQueue === value ? "selected" : ""} key={value}>
                          <input type="radio" name="wordsPerQueue" checked={settings.wordsPerQueue === value} onChange={() => updateSetting("wordsPerQueue", value)} />
                          <span>{value}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="setting-row">
                    <div><strong>每天完成几个队列</strong><p>完成最后一个队列后，生成当天的德语短文。</p></div>
                    <div className="number-options" role="radiogroup" aria-label="每天的队列数">
                      {[1, 2, 3, 4, 5].map((value) => (
                        <label className={settings.queuesPerDay === value ? "selected" : ""} key={value}>
                          <input type="radio" name="queuesPerDay" checked={settings.queuesPerDay === value} onChange={() => updateSetting("queuesPerDay", value)} />
                          <span>{value}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="goal-note"><span>你的计划</span>每天最多学习 <strong>{dailyTarget}</strong> 张词卡，约 <strong>{Math.max(5, Math.round(dailyTarget * 1.1))}</strong> 分钟。</div>
                  {activeQueueGoal !== settings.queuesPerDay && (
                    <p className="active-goal-note">今天已经开始学习，因此仍按 {activeQueueGoal} 个队列完成；新的数量从明天生效。</p>
                  )}
                </fieldset>

                <section className="settings-card forecast-settings" aria-live="polite">
                  <div className="forecast-heading">
                    <span aria-hidden="true">⌛</span>
                    <div><p className="kicker">Zielprognose</p><h2>预计完成 {settings.level} 词书</h2></div>
                  </div>
                  <div className="forecast-result">
                    {estimatedDaysRemaining ? (
                      <strong>{estimatedDaysRemaining}<small> 天</small></strong>
                    ) : (
                      <strong className="forecast-complete">已完成</strong>
                    )}
                    <span>{estimatedDaysRemaining ? `按每天 ${dailyTarget} 个词估算` : "当前词书的所有单词均已学习"}</span>
                  </div>
                  <div className="forecast-progress" aria-label={`当前目标已完成 ${targetCompletionPercent}%`}>
                    <span style={{ width: `${targetCompletionPercent}%` }} />
                  </div>
                  <div className="forecast-meta">
                    <span>已学习 <strong>{targetLearnedWords}</strong> / {bookWords.length}</span>
                    <span>剩余 <strong>{targetRemainingWords}</strong> 词</span>
                  </div>
                  <p>这是按当前每日目标连续学习的估算；到期复习较多时，实际完成时间可能稍有延后。</p>
                </section>
              </div>

              <fieldset className="settings-card wordbook-settings">
                <legend><span className="settings-index">03</span><span><small>CEFR wordbooks</small>选择单词书</span></legend>
                <p className="settings-help">按 CEFR 能力等级整理的 Worttag 精选词书。切换词书不会丢失已经学过的记录。</p>
                <div className="level-options">
                  {(["A1", "A2", "B1", "B2", "C1"] as const).map((level) => {
                    const levelWords = WORDS.filter((word) => isWordInBook(word, level));
                    const levelCount = levelWords.length;
                    const learnedCount = levelWords.filter((word) => learning.records[word.id]).length;
                    return (
                      <label className={settings.level === level ? "level-option selected" : "level-option"} key={level}>
                        <input type="radio" name="wordbook" checked={settings.level === level} onChange={() => updateSetting("level", level)} />
                        <span className="level-mark">{level}</span>
                        <span><strong>{LEVEL_META[level].title}</strong><small>{LEVEL_META[level].description}</small></span>
                        <em>{learnedCount} / {levelCount}</em>
                      </label>
                    );
                  })}
                </div>
                <p className="cefr-note">CEFR 描述的是语言能力等级，并没有唯一的官方固定词表；这里按常见交际场景与课程进度精心分级。</p>
              </fieldset>

              <fieldset className="settings-card order-settings">
                <legend><span className="settings-index">04</span><span><small>Order</small>新词顺序</span></legend>
                <div className="order-options">
                  {([
                    ["sequential", "顺序学习", "按词书编排逐个前进，适合从 A1 系统起步。"],
                    ["random", "每日乱序", "每天稳定打乱一次；刷新页面不会改变当日顺序。"],
                  ] as const).map(([value, label, description]) => (
                    <label className={settings.order === value ? "order-option selected" : "order-option"} key={value}>
                      <input type="radio" name="wordOrder" checked={settings.order === value} onChange={() => updateSetting("order", value)} />
                      <span className="order-symbol" aria-hidden="true">{value === "sequential" ? "1·2·3" : "2·1·3"}</span>
                      <span><strong>{label}</strong><small>{description}</small></span>
                      <em>{settings.order === value ? "✓" : ""}</em>
                    </label>
                  ))}
                </div>
                <p className="settings-help compact-help">到期复习始终按紧急程度排序，不会被乱序设置打散。</p>
              </fieldset>

              <fieldset className="settings-card experience-settings">
                <legend><span className="settings-index">05</span><span><small>Learning experience</small>学习体验</span></legend>
                <label className="toggle-row">
                  <span><strong>揭晓时自动朗读</strong><small>显示答案时自动播放德语发音。</small></span>
                  <input type="checkbox" checked={settings.autoPronounce} onChange={(event) => updateSetting("autoPronounce", event.target.checked)} />
                  <span className="toggle-control" aria-hidden="true" />
                </label>
                <label className="toggle-row">
                  <span><strong>显示中文译文</strong><small>在例句与每日短文旁显示中文。</small></span>
                  <input type="checkbox" checked={settings.showTranslation} onChange={(event) => updateSetting("showTranslation", event.target.checked)} />
                  <span className="toggle-control" aria-hidden="true" />
                </label>
                <label className="toggle-row">
                  <span><strong>到期复习优先</strong><small>先处理该词书中已经到期的词，再加入新词。</small></span>
                  <input type="checkbox" checked={settings.dueFirst} onChange={(event) => updateSetting("dueFirst", event.target.checked)} />
                  <span className="toggle-control" aria-hidden="true" />
                </label>
                <div className="speech-setting">
                  <div><strong>朗读速度</strong><small>只影响德语单词朗读。</small></div>
                  <div className="speech-options">
                    {([ ["slow", "慢速"], ["standard", "标准"], ["natural", "自然"] ] as const).map(([value, label]) => (
                      <label className={settings.speechSpeed === value ? "selected" : ""} key={value}>
                        <input type="radio" name="speechSpeed" checked={settings.speechSpeed === value} onChange={() => updateSetting("speechSpeed", value)} />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </fieldset>

              <section className={`settings-card cloud-settings cloud-${cloudStatus}`}>
                <div className="data-heading"><span className="settings-index">06</span><span><small>Cloud archive</small><strong>云端存档</strong></span></div>
                <div className="cloud-status-copy" role="status" aria-live="polite" aria-atomic="true">
                  <span className="cloud-status-mark" aria-hidden="true">{cloudStatus === "synced" ? "✓" : cloudStatus === "offline" ? "↯" : cloudStatus === "signed-out" ? "⌑" : "↻"}</span>
                  <span><strong>{CLOUD_STATUS_META[cloudStatus].label}</strong><small>{CLOUD_STATUS_META[cloudStatus].detail}</small></span>
                </div>
                <div className="device-row" aria-label="支持的同步设备">
                  <span>Mac</span><i aria-hidden="true" /><span>iPad</span><i aria-hidden="true" /><span>iPhone</span>
                </div>
                <p>使用同一 ChatGPT 账户打开 Worttag，即可同步 A1–C1 的掌握状态、复习排期和每日计划。外观、朗读与译文显示偏好仍由每台设备单独决定。</p>
                <div className="cloud-account-row">
                  <span>{cloudDisplayName ? `账户 · ${cloudDisplayName}` : "ChatGPT 安全账户"}<small>{lastSyncedAt ? `上次同步 ${new Date(lastSyncedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : "首次连接后会自动建立云存档"}</small></span>
                  {cloudStatus === "signed-out" ? (
                    <a className="secondary-action" href="/signin-with-chatgpt?return_to=%2F">登录并同步</a>
                  ) : (
                    <button className="secondary-action" onClick={() => void synchronizeCloud(true)} disabled={cloudStatus === "connecting" || cloudStatus === "saving"}>立即同步</button>
                  )}
                </div>
              </section>

              <section className="settings-card data-settings">
                <div className="data-heading"><span className="settings-index">07</span><span><small>Data controls</small><strong>学习数据</strong></span></div>
                <p>恢复默认设置只调整学习偏好，不删除背词记录。清空进度会同步至使用同一账户的所有设备。</p>
                <div className="data-actions">
                  <button className="secondary-action" onClick={restoreDefaultSettings}>恢复默认设置</button>
                  <button
                    ref={resetTriggerRef}
                    className="danger-link"
                    aria-haspopup="dialog"
                    onClick={() => {
                      resetConfirmedRef.current = false;
                      setConfirmReset(true);
                    }}
                  >
                    重置学习进度
                  </button>
                </div>
              </section>
            </div>
          </section>
        )}

        {view === "story" && (
          <section className="story-page">
            <div className="story-page-header">
              <button className="back-link" onClick={() => switchView("learn")}>← 返回词课</button>
              <div className="story-date"><span>WORTTAG · TAGESGESCHICHTE</span><strong>{new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric" })}</strong></div>
            </div>
            {dailyComplete && dailyStoryAvailable ? (
              <article className="generated-story">
                <div className="story-title-block"><p className="kicker">{settings.level} · {LEVEL_META[settings.level].topic}</p><h1>{LEVEL_META[settings.level].story}</h1><p>{LEVEL_META[settings.level].storyZh}</p></div>
                <div className={settings.showTranslation ? "story-columns" : "story-columns translation-hidden"}>
                  <div className="german-story">
                    {learnedToday.map((word, index) => (
                      <span className={index === 0 ? "story-first-sentence" : undefined} key={word.id}>{index === 0 ? word.storyDe : ` ${word.storyDe}`}</span>
                    ))}
                  </div>
                  {settings.showTranslation && <div className="translation-panel">
                    <p className="note-label">中文译文</p>
                    {learnedToday.map((word, index) => <span key={word.id}>{index === 0 ? word.storyZh : ` ${word.storyZh}`}</span>)}
                  </div>}
                </div>
                <footer className="story-vocabulary">
                  <div><p className="kicker">Heute gelernt</p><h2>短文使用了 {learnedToday.length} 个今日词汇</h2></div>
                  <div className="story-chips">{learnedToday.map((word) => <button key={word.id} onClick={() => startQueue([word.id], "manual")}><ArticleTerm term={word.term} /></button>)}</div>
                </footer>
              </article>
            ) : dailyComplete && learnedToday.length > 0 ? (
              <div className="story-locked paper-panel">
                <span className="story-number">03</span>
                <p className="kicker">Tagesgeschichte</p>
                <h1>今天的词汇还没有可组成短文的例句。</h1>
                <p>你仍可点击任一单词查阅词义与权威词典；补充例句后，Worttag 会把它们编成今日短文。</p>
                <button className="reveal-button" onClick={() => switchView("library")}>查看今日词汇 →</button>
              </div>
            ) : dailyComplete ? (
              <div className="story-locked paper-panel">
                <span className="story-number">03</span>
                <p className="kicker">Tagesgeschichte</p>
                <h1>今天没有可用于短文的新词。</h1>
                <p>到期复习会继续按遗忘曲线安排。你可以切换词书开始新的等级，学习记录不会丢失。</p>
                <button className="reveal-button" onClick={() => switchView("settings")}>选择词书 →</button>
              </div>
            ) : (
              <div className="story-locked paper-panel">
                <span className="story-number">03</span>
                <p className="kicker">Tagesgeschichte</p>
                <h1>今天的短文，还差几个队列。</h1>
                <p>完成今日计划后，Worttag 会把你在 {settings.level} 词书里真正学过的词编成一篇连贯短文。</p>
                <div className="story-lock-progress"><span style={{ width: `${Math.min(100, (learning.todayQueuesCompleted / activeQueueGoal) * 100)}%` }} /></div>
                <button className="reveal-button" onClick={() => switchView("learn")}>继续学习 · {learning.todayQueuesCompleted} / {activeQueueGoal} 队列 →</button>
              </div>
            )}
          </section>
        )}
      </main>

      {dictionaryWord && (
        <div
          className="dictionary-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDictionary();
          }}
        >
          <section
            ref={dictionaryDialogRef}
            className="dictionary-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dictionary-word-title"
            aria-describedby="dictionary-word-summary dictionary-source-note"
          >
            <button
              ref={dictionaryCloseRef}
              className="dictionary-close"
              type="button"
              onClick={closeDictionary}
              aria-label="关闭词典释义"
            >
              <span aria-hidden="true">×</span>
            </button>

            <header className="dictionary-header">
              <div className="dictionary-seal" aria-hidden="true">W</div>
              <div>
                <p className="kicker">Wörterbuch · {dictionaryWord.level} 词条核验</p>
                <h2 id="dictionary-word-title" lang="de"><ArticleTerm term={dictionaryWord.term} /></h2>
                <p className="dictionary-forms">{dictionaryWord.type} · {dictionaryWord.forms}</p>
              </div>
              <button
                className="dictionary-speak"
                type="button"
                onClick={() => speak(dictionaryWord)}
                aria-label={`朗读 ${dictionaryWord.term}`}
              >
                <span aria-hidden="true">◖))</span>
                发音
              </button>
            </header>

            <section className="dictionary-meaning" aria-labelledby="dictionary-meaning-title">
              <p className="dictionary-section-label" id="dictionary-meaning-title">
                中文释义 <span>Worttag 课程释义</span>
              </p>
              <p id="dictionary-word-summary">{dictionaryWord.meaning}</p>
            </section>

            <section
              className={`dictionary-evidence evidence-${dictionaryEvidenceStatus}`}
              aria-labelledby="dictionary-evidence-title"
              aria-live="polite"
              aria-busy={dictionaryEvidenceStatus === "loading"}
            >
              <div className="dictionary-evidence-heading">
                <div>
                  <p className="dictionary-section-label">德语原文证据</p>
                  <h3 id="dictionary-evidence-title">开放词典德语释义</h3>
                </div>
                {dictionaryEvidenceStatus === "success" && <span className="evidence-state">证据已载入</span>}
              </div>

              {dictionaryEvidenceStatus === "loading" && (
                <div className="dictionary-evidence-loading" role="status">
                  <span aria-hidden="true" />
                  <span aria-hidden="true" />
                  <p>正在查询开放德语词典释义…</p>
                </div>
              )}

              {dictionaryEvidenceStatus === "error" && (
                <div className="dictionary-evidence-message evidence-error" role="status">
                  <span aria-hidden="true">↻</span>
                  <div>
                    <strong>暂时无法载入外部词典证据</strong>
                    <p>Worttag 的课程释义仍可正常使用，你也可以稍后重试。</p>
                  </div>
                  <button type="button" onClick={retryDictionaryEvidence}>重新查询</button>
                </div>
              )}

              {dictionaryEvidenceStatus === "success" && dictionaryEvidence && (
                <div className="dictionary-evidence-grid">
                  <article className="open-dictionary-evidence">
                    <div className="evidence-card-heading">
                      <div>
                        <strong>德语 Wiktionary</strong>
                        <span>{dictionaryEvidence.openDictionary.partsOfSpeech.join(" · ") || "开放德语词典"}</span>
                      </div>
                      <span className={dictionaryEvidence.openDictionary.found ? "evidence-found" : "evidence-empty"}>
                        {dictionaryEvidence.openDictionary.found ? "有释义" : "未找到"}
                      </span>
                    </div>
                    {dictionaryEvidence.openDictionary.found ? (
                      <ol className="open-sense-list" lang="de">
                        {dictionaryEvidence.openDictionary.senses.map((sense, index) => (
                          <li key={`${sense.gloss}-${index}`}>
                            <p>{sense.gloss}</p>
                            {sense.example && <blockquote>{sense.example}</blockquote>}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="dictionary-evidence-empty">
                        开放词典暂未返回“{dictionaryEvidence.headword}”的独立德语释义。
                      </p>
                    )}
                    <p className="dictionary-license">
                      开放内容 · 德语 Wiktionary · CC BY-SA 4.0，经 WiktApi 提供。
                      {" "}
                      <a href={dictionaryEvidence.openDictionary.sourceUrl} target="_blank" rel="noreferrer">查看原词条 ↗</a>
                    </p>
                  </article>

                </div>
              )}
            </section>

            {dictionaryWord.example && (
              <div className="dictionary-detail-grid">
                <section aria-labelledby="dictionary-example-title">
                  <p className="dictionary-section-label" id="dictionary-example-title">例句 · Beispiel</p>
                  <blockquote>
                    <p lang="de">{dictionaryWord.example}</p>
                    {dictionaryWord.exampleZh && <footer>{dictionaryWord.exampleZh}</footer>}
                  </blockquote>
                </section>
              </div>
            )}

            <section className="dictionary-sources" aria-labelledby="dictionary-sources-title">
              <div className="dictionary-sources-heading">
                <div>
                  <p className="dictionary-section-label">权威词典</p>
                  <h3 id="dictionary-sources-title">打开原始词条进一步核验</h3>
                </div>
                <span>外部来源</span>
              </div>
              <div className="dictionary-source-list">
                {dictionaryLinks.map((source) => (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    key={source.id}
                    aria-label={`在 ${source.name} 中查询 ${dictionaryWord.term}（新窗口）`}
                  >
                    <span className={`dictionary-source-mark source-${source.id}`} aria-hidden="true">
                      {source.name.slice(0, 1)}
                    </span>
                    <span>
                      <strong>{source.name}<small>{source.kind}</small></strong>
                      <em>{source.description}</em>
                    </span>
                    <i aria-hidden="true">↗</i>
                  </a>
                ))}
              </div>
              <p className="dictionary-source-note" id="dictionary-source-note">
                Worttag 课程义项经过开放词典交叉检查；开放德语释义保留来源与许可标记。Duden、DWDS、PONS 与 Langenscheidt 的完整权威内容不在本站复制，是否提供独立词条以原站实际收录为准。
              </p>
            </section>
          </section>
        </div>
      )}

      {confirmReset && (
        <div
          className="warning-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setConfirmReset(false);
          }}
        >
          <section
            ref={resetDialogRef}
            className="warning-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="reset-progress-title"
            aria-describedby="reset-progress-description"
          >
            <div className="warning-emblem" aria-hidden="true">!</div>
            <p className="kicker">Achtung · 不可撤销</p>
            <h2 id="reset-progress-title">确定重置所有学习进度？</h2>
            <p id="reset-progress-description">
              这会清空 A1–C1 的掌握状态、艾宾浩斯复习排期、连续学习天数和今日短文，并把这次清空同步到 Mac、iPad 与 iPhone。
            </p>
            <div className="warning-note"><span aria-hidden="true">✓</span>你的外观、词书与学习设置会保留。</div>
            <div className="warning-actions">
              <button ref={resetCancelRef} className="secondary-action" onClick={() => setConfirmReset(false)}>取消，保留进度</button>
              <button className="confirm-danger" onClick={clearLearningProgress}>确认重置所有设备</button>
            </div>
          </section>
        </div>
      )}

      <footer className="site-footer">
        <span>Wort für Wort, Tag für Tag.</span>
        <span>{cloudStatus === "synced" ? "云存档已同步 · Mac · iPad · iPhone" : cloudStatus === "signed-out" ? "登录 ChatGPT 后可跨设备同步" : "进度已保存在本机，云端会自动重试"}</span>
      </footer>
    </div>
  );
}
