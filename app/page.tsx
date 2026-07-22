"use client";

import { useEffect, useMemo, useState } from "react";
import { A1_WORDS, A2_WORDS } from "./wordbooks-a1-a2";
import { B1_ADDITIONS, B2_WORDS, C1_WORDS } from "./wordbooks-advanced";

type RecallStatus = "unknown" | "fuzzy" | "known";
type View = "learn" | "review" | "library" | "progress" | "story" | "settings";
type ThemeMode = "light" | "dark" | "system";
type CEFRLevel = "A1" | "A2" | "B1" | "B2" | "C1";
type WordOrder = "sequential" | "random";
type SpeechSpeed = "slow" | "standard" | "natural";

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
};

type LearningState = {
  records: Record<string, MemoryRecord>;
  todayKey: string;
  todayReviewed: number;
  todayWordIds: string[];
  streakDays: number;
  sessionComplete: boolean;
  todayQueuesCompleted: number;
  todayQueueLevel: CEFRLevel | null;
  todayQueueGoal: number | null;
};

type AppSettings = {
  theme: ThemeMode;
  wordsPerQueue: number;
  queuesPerDay: number;
  level: CEFRLevel;
  order: WordOrder;
  autoPronounce: boolean;
  showTranslation: boolean;
  dueFirst: boolean;
  speechSpeed: SpeechSpeed;
};

const STORAGE_KEY = "worttag-learning-state-v1";
const SETTINGS_KEY = "worttag-settings-v1";
const MINUTE = 60_000;
const DAY = 86_400_000;
const INTERVAL_DAYS = [0, 1, 3, 7, 14, 30, 60, 120, 180] as const;

const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
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
    storyZh: "途中，她照顾年长邻居沃尔夫先生的步行速度，并帮他提一个购物袋。",
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
    exampleZh: "我们约好了周五去银行办理业务。",
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

const WORDS: WordCard[] = [
  ...A1_WORDS,
  ...A2_WORDS,
  ...B1_BASE_WORDS,
  ...B1_ADDITIONS,
  ...B2_WORDS,
  ...C1_WORDS,
];

const STATUS_META: Record<RecallStatus, { label: string; short: string }> = {
  unknown: { label: "未知", short: "10 分钟后" },
  fuzzy: { label: "模糊", short: "明天" },
  known: { label: "已知", short: "进入下一阶段" },
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
    streakDays: 1,
    sessionComplete: false,
    todayQueuesCompleted: 0,
    todayQueueLevel: null,
    todayQueueGoal: null,
  };
}

function prepareSavedState(saved: LearningState, now = Date.now()): LearningState {
  const currentDay = dayKey(now);
  const savedQueueGoal = [1, 2, 3, 4, 5].includes(saved.todayQueueGoal ?? -1)
    ? saved.todayQueueGoal
    : null;
  const normalized: LearningState = {
    records: saved.records ?? {},
    todayKey: saved.todayKey ?? currentDay,
    todayReviewed: saved.todayReviewed ?? 0,
    todayWordIds: saved.todayWordIds ?? [],
    streakDays: saved.streakDays ?? 1,
    sessionComplete: saved.sessionComplete ?? false,
    todayQueuesCompleted:
      saved.todayQueuesCompleted ?? (saved.sessionComplete ? 1 : 0),
    todayQueueLevel:
      saved.todayQueueLevel ??
      WORDS.find((word) => (saved.todayWordIds ?? []).includes(word.id))?.level ??
      null,
    todayQueueGoal: savedQueueGoal,
  };
  if (normalized.todayKey === currentDay) return normalized;
  const gap = dayDifference(normalized.todayKey, currentDay);
  return {
    ...normalized,
    todayKey: currentDay,
    todayReviewed: 0,
    todayWordIds: [],
    streakDays: gap === 1 ? normalized.streakDays + 1 : 1,
    sessionComplete: false,
    todayQueuesCompleted: 0,
    todayQueueLevel: null,
    todayQueueGoal: null,
  };
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

function buildDailyQueue(state: LearningState, settings: AppSettings, now = Date.now()) {
  const book = WORDS.filter((word) => word.level === settings.level);
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
  const levels: CEFRLevel[] = ["A1", "A2", "B1", "B2", "C1"];
  const orders: WordOrder[] = ["sequential", "random"];
  const speeds: SpeechSpeed[] = ["slow", "standard", "natural"];
  const queueSizes = [5, 10, 15, 20];
  const dailyQueues = [1, 2, 3, 4, 5];
  return {
    theme: themes.includes(saved.theme as ThemeMode) ? saved.theme! : DEFAULT_SETTINGS.theme,
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

export default function Home() {
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>("learn");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [learning, setLearning] = useState<LearningState>(() => createInitialState());
  const [sessionQueue, setSessionQueue] = useState<string[]>([]);
  const [queueSource, setQueueSource] = useState<"daily" | "review" | "manual">("daily");
  const [returnView, setReturnView] = useState<View>("learn");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [grading, setGrading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [settingsNotice, setSettingsNotice] = useState("所有设置都会自动保存在当前设备");
  const [confirmReset, setConfirmReset] = useState(false);
  const [planDirty, setPlanDirty] = useState(false);
  const [queueUnavailable, setQueueUnavailable] = useState(false);
  const [clock, setClock] = useState(0);
  const [libraryFilter, setLibraryFilter] = useState<"all" | RecallStatus>("all");

  useEffect(() => {
    let next = createInitialState();
    let nextSettings = DEFAULT_SETTINGS;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) next = prepareSavedState(JSON.parse(raw) as LearningState);
    } catch {
      next = createInitialState();
    }
    try {
      const rawSettings = window.localStorage.getItem(SETTINGS_KEY);
      if (rawSettings) nextSettings = prepareSavedSettings(JSON.parse(rawSettings));
    } catch {
      nextSettings = DEFAULT_SETTINGS;
    }
    if (next.todayQueueLevel !== nextSettings.level) {
      next = {
        ...next,
        todayQueuesCompleted: 0,
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(nextSettings);
    setLearning(next);
    setSessionQueue(initialQueue);
    setQueueUnavailable(!initialQueue.length && !initialComplete);
    setClock(currentTimestamp());
    setReady(true);
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
    // The minute clock is also responsible for rolling an open app into a new study day.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLearning(nextDay);
    setSessionQueue(nextQueue);
    setQueueSource("daily");
    setCurrentIndex(0);
    setRevealed(false);
    setGrading(false);
    setQueueUnavailable(!nextQueue.length);
  }, [clock, learning, ready, settings]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(learning));
    } catch {
      window.setTimeout(() => setSettingsNotice("当前浏览器未能保存进度，请检查隐私设置"), 0);
    }
  }, [learning, ready]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      window.setTimeout(() => setSettingsNotice("当前浏览器未能保存设置，请检查隐私设置"), 0);
    }
  }, [settings, ready]);

  useEffect(() => {
    if (!ready) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const resolved = settings.theme === "system" ? (media.matches ? "dark" : "light") : settings.theme;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
    };
    applyTheme();
    if (settings.theme === "system") media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [ready, settings.theme]);

  const currentWord = WORDS.find((word) => word.id === sessionQueue[currentIndex]);
  const currentRecord = currentWord ? learning.records[currentWord.id] : undefined;
  const bookWords = useMemo(
    () => WORDS.filter((word) => word.level === settings.level),
    [settings.level],
  );
  const learnedToday = useMemo(
    () => {
      const learnedIds = new Set(learning.todayWordIds);
      return WORDS.filter((word) => word.level === settings.level && learnedIds.has(word.id));
    },
    [learning.todayWordIds, settings.level],
  );

  const counts = useMemo(() => {
    const result = { unknown: 0, fuzzy: 0, known: 0 };
    bookWords.forEach((word) => {
      result[learning.records[word.id]?.status ?? "unknown"] += 1;
    });
    return result;
  }, [bookWords, learning.records]);

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
  const newTotal = bookWords.length - reviewTotal;
  const activeQueueGoal = learning.todayQueueLevel === settings.level
    ? (learning.todayQueueGoal ?? settings.queuesPerDay)
    : settings.queuesPerDay;
  const dailyComplete = learning.todayQueueLevel === settings.level &&
    (learning.sessionComplete || learning.todayQueuesCompleted >= activeQueueGoal);
  const dailyTarget = settings.wordsPerQueue * settings.queuesPerDay;
  const sessionProgress = sessionQueue.length
    ? Math.round(((currentIndex + (grading ? 1 : 0)) / sessionQueue.length) * 100)
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
    const completedQueues = queueSource === "daily"
      ? Math.min(activeQueueGoal, nextState.todayQueuesCompleted + 1)
      : nextState.todayQueuesCompleted;
    const finishedDay = queueSource === "daily" && completedQueues >= activeQueueGoal;
    const finalState: LearningState = {
      ...nextState,
      todayQueuesCompleted: completedQueues,
      sessionComplete: nextState.sessionComplete || finishedDay,
      todayQueueLevel: queueSource === "daily" ? settings.level : nextState.todayQueueLevel,
      todayQueueGoal: queueSource === "daily" ? activeQueueGoal : nextState.todayQueueGoal,
    };
    setLearning(finalState);
    window.setTimeout(() => {
      setFeedback(null);
      setGrading(false);
      setCurrentIndex(0);
      setRevealed(false);
      if (queueSource === "daily") {
        setSessionQueue([]);
        if (finishedDay) setView("story");
      } else {
        const dailyQueue = dailyComplete ? [] : buildDailyQueue(finalState, settings);
        setSessionQueue(dailyQueue);
        setQueueUnavailable(!dailyQueue.length && !dailyComplete);
        setQueueSource("daily");
        setView(returnView);
      }
    }, 680);
  }

  function rateCurrent(rating: RecallStatus) {
    if (!currentWord || !revealed || grading) return;
    const now = currentTimestamp();
    const { next, dueLabel } = gradeMemory(learning.records[currentWord.id], rating, now);
    const nextState: LearningState = {
      ...learning,
      records: { ...learning.records, [currentWord.id]: next },
      todayReviewed: learning.todayReviewed + 1,
      todayWordIds: [...learning.todayWordIds, currentWord.id],
    };
    setLearning(nextState);
    setFeedback(`${STATUS_META[rating].label} · 已安排 ${dueLabel}复习`);
    setGrading(true);

    if (currentIndex + 1 >= sessionQueue.length) {
      finishSession(nextState);
      return;
    }

    window.setTimeout(() => {
      setCurrentIndex((index) => index + 1);
      setRevealed(false);
      setFeedback(null);
      setGrading(false);
    }, 620);
  }

  function startQueue(
    ids: string[],
    source: "daily" | "review" | "manual" = "manual",
  ) {
    if (source !== "daily") setReturnView(view);
    if (source === "daily") setPlanDirty(false);
    setQueueUnavailable(false);
    setQueueSource(source);
    setSessionQueue(ids);
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
    setLearning((current) => ({
      ...current,
      sessionComplete: true,
      todayQueuesCompleted: activeQueueGoal,
      todayQueueLevel: settings.level,
      todayQueueGoal: activeQueueGoal,
    }));
    setQueueUnavailable(false);
    setView("story");
  }

  function revealAnswer() {
    if (!currentWord) return;
    setRevealed(true);
    if (settings.autoPronounce) speak(currentWord);
  }

  function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
    if (["wordsPerQueue", "level", "order", "dueFirst"].includes(key)) setPlanDirty(true);
    if (key === "level") {
      const nextLevel = value as CEFRLevel;
      setLearning((current) => ({
        ...current,
        todayQueuesCompleted: 0,
        sessionComplete: false,
        todayQueueLevel: nextLevel,
        todayQueueGoal: settings.queuesPerDay,
      }));
      setQueueUnavailable(false);
      setSettingsNotice(`已切换到 ${nextLevel} · 今日队列将按新词书重新开始`);
    } else if (key === "queuesPerDay") {
      const canApplyToday = learning.todayReviewed === 0 && learning.todayQueuesCompleted === 0;
      if (canApplyToday) {
        setLearning((current) => ({ ...current, todayQueueGoal: value as number }));
        setSettingsNotice("已自动保存 · 今天就按新的队列数量学习");
      } else {
        setSettingsNotice(`已自动保存 · 新的每日队列数明天生效，今天仍为 ${activeQueueGoal} 个`);
      }
    } else {
      setSettingsNotice("已自动保存 · 新的学习计划从下一队列开始生效");
    }
    setConfirmReset(false);
  }

  function restoreDefaultSettings() {
    setSettings(DEFAULT_SETTINGS);
    setPlanDirty(true);
    setLearning((current) => {
      const levelChanged = current.todayQueueLevel !== DEFAULT_SETTINGS.level;
      const canApplyGoal = current.todayReviewed === 0 && current.todayQueuesCompleted === 0;
      return {
        ...current,
        todayQueuesCompleted: levelChanged ? 0 : current.todayQueuesCompleted,
        sessionComplete: levelChanged ? false : current.sessionComplete,
        todayQueueLevel: DEFAULT_SETTINGS.level,
        todayQueueGoal: levelChanged || canApplyGoal ? DEFAULT_SETTINGS.queuesPerDay : current.todayQueueGoal,
      };
    });
    setQueueUnavailable(false);
    setSettingsNotice("已恢复默认设置；如果今天已经开始学习，新的每日队列数明天生效");
    setConfirmReset(false);
  }

  function clearLearningProgress() {
    const fresh: LearningState = {
      ...createInitialState(),
      todayQueueLevel: settings.level,
      todayQueueGoal: settings.queuesPerDay,
    };
    setLearning(fresh);
    setSessionQueue(buildDailyQueue(fresh, settings));
    setQueueSource("daily");
    setPlanDirty(false);
    setQueueUnavailable(false);
    setCurrentIndex(0);
    setRevealed(false);
    setView("learn");
    setConfirmReset(false);
  }

  function switchView(nextView: View) {
    const shouldRestoreDaily = nextView === "learn" && (
      queueSource !== "daily" ||
      (view !== "learn" && !sessionQueue.length) ||
      planDirty
    );
    if (shouldRestoreDaily) {
      const dailyQueue = dailyComplete ? [] : buildDailyQueue(learning, settings);
      setSessionQueue(dailyQueue);
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
    if (view !== "learn" || !currentWord || grading) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, input, select, textarea, a")) return;
      if (event.code === "Space" && !revealed) {
        event.preventDefault();
        revealAnswer();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // revealAnswer deliberately reads the latest speech preferences listed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWord, grading, revealed, settings.autoPronounce, settings.speechSpeed, view]);

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
        </button>
        <nav className="main-nav" aria-label="主导航">
          {([
            ["learn", "今日学习"],
            ["review", "复习"],
            ["library", "词库"],
            ["progress", "进度"],
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
              <div>
                <p className="kicker">{queueSource === "daily" ? `${new Date().toLocaleDateString("de-DE", { weekday: "long" })} · ${settings.level} 今日词课` : queueSource === "review" ? "Wiederholen · 到期复习" : "Einzelkarte · 单独学习"}</p>
                <h1>{queueSource === "daily" ? "先想起来，再看答案。" : queueSource === "review" ? "到期的词，认真想一次。" : "只学这一张，也算向前一步。"}</h1>
              </div>
              <div className="heading-progress" aria-label={`今日计划进度 ${sessionProgress}%`}>
                <div className="progress-copy">
                  <span>{queueSource === "daily" ? `今日计划 · 第 ${Math.min(learning.todayQueuesCompleted + 1, activeQueueGoal)} / ${activeQueueGoal} 队列` : queueSource === "review" ? "本次复习" : "本次单独学习"}</span>
                  <strong>{queueSource === "daily" && !sessionQueue.length ? `${learning.todayQueuesCompleted} / ${activeQueueGoal}` : `${currentIndex} / ${sessionQueue.length}`}</strong>
                </div>
                <div className="progress-track"><span style={{ width: `${sessionProgress}%` }} /></div>
              </div>
            </section>

            {currentWord ? (
              <div className="study-layout">
                <aside className="session-panel paper-panel" aria-label="今日学习队列">
                  <div className="panel-heading">
                    <span className="folio">01</span>
                    <div><p className="kicker">Sitzung</p><h2>{queueSource === "daily" ? "今日队列" : queueSource === "review" ? "复习队列" : "单独学习"}</h2></div>
                  </div>
                  <div className="queue-list">
                    {sessionQueue.map((id, index) => {
                      const word = WORDS.find((item) => item.id === id)!;
                      const itemStatus =
                        index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming";
                      return (
                        <div className={`queue-item ${itemStatus}`} key={`${id}-${index}`}>
                          <span className="queue-dot">{index < currentIndex ? "✓" : index + 1}</span>
                          <span className="queue-name">{word.term.replace("etwas ", "")}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="keyboard-note"><kbd>空格</kbd> 揭晓答案</div>
                </aside>

                <section className={revealed ? "word-card revealed" : "word-card"}>
                  <div className="card-topline">
                    <span className="card-mode">{queueSource === "manual" ? "单独学习" : currentRecord ? "复习" : "新词"} · {String(currentIndex + 1).padStart(2, "0")}</span>
                    <button className="speak-button" onClick={() => speak(currentWord)} aria-label={`朗读 ${currentWord.term}`}>
                      <span className="sound-rings" aria-hidden="true">◖))</span> 听发音
                    </button>
                  </div>

                  <div className="word-front">
                    <p className="word-type">{currentWord.type}</p>
                    <h2>{currentWord.term}</h2>
                    <p className="word-forms">{currentWord.forms}</p>
                  </div>

                  {!revealed ? (
                    <div className="recall-prompt">
                      <div className="ink-divider"><span>想一想</span></div>
                      <p>它是什么意思？试着在脑中说出一个搭配。</p>
                      <button className="reveal-button" onClick={revealAnswer}>
                        查看释义 <span aria-hidden="true">→</span>
                      </button>
                    </div>
                  ) : (
                    <div className="answer-sheet" aria-live="polite">
                      <div className="meaning-line">
                        <span className="answer-label">释义</span>
                        <strong>{currentWord.meaning}</strong>
                      </div>
                      <blockquote>
                        <p>{currentWord.example}</p>
                        {settings.showTranslation && <footer>{currentWord.exampleZh}</footer>}
                      </blockquote>
                      <div className="explanation-grid">
                        <article>
                          <span className="note-label">语法与搭配</span>
                          <h3>{currentWord.grammarTitle}</h3>
                          <p>{currentWord.grammar}</p>
                        </article>
                        <article className="memory-note">
                          <span className="note-label">记忆提示</span>
                          <p>{currentWord.memory}</p>
                        </article>
                      </div>
                      <div className="rating-area">
                        <p>现在，你对这个词的感觉是？</p>
                        <div className="rating-buttons">
                          {(["unknown", "fuzzy", "known"] as const).map((status) => (
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
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  {feedback && <div className="feedback-toast" role="status">{feedback}</div>}
                </section>

                <aside className="insight-column">
                  <section className="plan-card paper-panel">
                    <div className="panel-heading compact">
                      <span className="folio">02</span>
                      <div><p className="kicker">Heute</p><h2>{queueSource === "daily" ? "今日计划" : queueSource === "review" ? "到期复习" : "单独学习"}</h2></div>
                    </div>
                    <div className="plan-stats">
                      <div><strong>{queueSource === "daily" ? dueWords.length : sessionQueue.length}</strong><span>{queueSource === "daily" ? "到期复习" : "本队词数"}</span></div>
                      <div><strong>{queueSource === "daily" ? newTotal : dueWords.length}</strong><span>{queueSource === "daily" ? "新词" : "到期总数"}</span></div>
                      <div><strong>{Math.max(2, Math.round((queueSource === "daily" ? settings.wordsPerQueue : sessionQueue.length) * 1.1))}</strong><span>约分钟</span></div>
                    </div>
                  </section>
                  <section className="rhythm-card">
                    <p className="kicker">Vergessenskurve</p>
                    <h2>记住，不靠死撑。</h2>
                    <div className="mini-schedule" aria-label="复习间隔：今天、1天、3天、7天、14天">
                      {["今天", "1天", "3天", "7天", "14天"].map((label, index) => (
                        <div className="schedule-stop" key={label}><span className={index === 0 ? "active" : ""} /><small>{label}</small></div>
                      ))}
                    </div>
                    <p>你的选择会改变下一次出现的时间。</p>
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
              {(reviewTotal ? bookWords.filter((word) => learning.records[word.id]) : bookWords.slice(0, 3)).map((word) => {
                const record = learning.records[word.id];
                const status = record?.status ?? "unknown";
                return (
                  <button className="due-row" key={word.id} onClick={() => startQueue([word.id], "review")}>
                    <span><strong>{word.term}</strong><small>{word.meaning}</small></span>
                    <span className={`status-pill ${status}`}>{STATUS_META[status].label}</span>
                    <span>{record ? `${record.intervalDays || "<1"} 天间隔` : "新词"}</span>
                    <span>{record ? formatDate(record.dueAt) : "尚未学习"}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {view === "library" && (
          <section className="secondary-page">
            <div className="page-heading library-heading">
              <div><p className="kicker">Wortschatz · {settings.level} {LEVEL_META[settings.level].title}</p><h1>你的词，分得清才记得住。</h1></div>
              <div className="filter-tabs" aria-label="按掌握状态筛选">
                {(["all", "unknown", "fuzzy", "known"] as const).map((filter) => (
                  <button key={filter} className={libraryFilter === filter ? "active" : ""} onClick={() => setLibraryFilter(filter)} aria-pressed={libraryFilter === filter}>
                    {filter === "all" ? "全部" : STATUS_META[filter].label}
                    <span>{filter === "all" ? bookWords.length : counts[filter]}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="word-library-grid">
              {bookWords.filter((word) => libraryFilter === "all" || (learning.records[word.id]?.status ?? "unknown") === libraryFilter).map((word, index) => {
                const status = learning.records[word.id]?.status ?? "unknown";
                return (
                  <article className="library-card" key={word.id}>
                    <div className="library-card-top"><span className="folio">{String(index + 1).padStart(2, "0")}</span><span className={`status-pill ${status}`}>{STATUS_META[status].label}</span></div>
                    <p className="word-type">{word.type}</p>
                    <h2>{word.term}</h2>
                    <p className="library-meaning">{word.meaning}</p>
                    <div className="library-grammar"><span>搭配</span>{word.grammarTitle}</div>
                    <button onClick={() => startQueue([word.id], "manual")}>单独学习 <span aria-hidden="true">→</span></button>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {view === "progress" && (
          <section className="secondary-page">
            <div className="page-heading"><div><p className="kicker">Fortschritt</p><h1>进步，是记忆留下的痕迹。</h1></div><div className="date-stamp">{settings.level} · {LEVEL_META[settings.level].title}词书</div></div>
            <div className="progress-stat-grid">
              <article><span>连续学习</span><strong>{learning.streakDays}<small> 天</small></strong><p>比上周多 2 天</p></article>
              <article><span>已知词汇</span><strong>{counts.known}<small> / {bookWords.length}</small></strong><p>稳定进入长期记忆</p></article>
              <article><span>今日判断</span><strong>{learning.todayReviewed}<small> 次</small></strong><p>未知、模糊、已知</p></article>
              <article><span>预计保持率</span><strong>{Math.round(((counts.known * 0.88 + counts.fuzzy * 0.58 + counts.unknown * 0.28) / Math.max(1, bookWords.length)) * 100)}<small>%</small></strong><p>根据当前掌握状态估算</p></article>
            </div>
            <div className="progress-detail-grid">
              <section className="curve-card paper-panel">
                <div><p className="kicker">Vergessenskurve</p><h2>复习把遗忘拉回来</h2></div>
                <div className="curve-visual" role="img" aria-label="记忆保持率在复习间隔之间下降，并在每次复习后回升">
                  {[100, 72, 91, 58, 88, 52, 84, 47, 80].map((height, index) => <span key={index} style={{ height: `${height}%` }} className={index % 2 === 0 ? "review-point" : ""} />)}
                </div>
                <div className="curve-labels"><span>今天</span><span>1 天</span><span>3 天</span><span>7 天</span><span>14 天</span></div>
              </section>
              <section className="mastery-card">
                <p className="kicker">掌握分布</p><h2>三种状态</h2>
                {(["known", "fuzzy", "unknown"] as const).map((status) => (
                  <div className="mastery-row" key={status}>
                    <div><span className={`legend-dot ${status}`} /><strong>{STATUS_META[status].label}</strong></div><span>{counts[status]} 词</span>
                    <div className="mastery-bar"><span className={status} style={{ width: `${(counts[status] / Math.max(1, bookWords.length)) * 100}%` }} /></div>
                  </div>
                ))}
              </section>
            </div>
          </section>
        )}

        {view === "settings" && (
          <section className="secondary-page settings-page">
            <div className="page-heading settings-heading">
              <div>
                <p className="kicker">Einstellungen</p>
                <h1>把每天的词课，调成你的节奏。</h1>
              </div>
              <div className="settings-save-note" aria-live="polite">
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
              </fieldset>

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

              <fieldset className="settings-card wordbook-settings">
                <legend><span className="settings-index">03</span><span><small>CEFR wordbooks</small>选择单词书</span></legend>
                <p className="settings-help">按 CEFR 能力等级整理的 Worttag 精选词书。切换词书不会丢失已经学过的记录。</p>
                <div className="level-options">
                  {(["A1", "A2", "B1", "B2", "C1"] as const).map((level) => {
                    const levelCount = WORDS.filter((word) => word.level === level).length;
                    const learnedCount = WORDS.filter((word) => word.level === level && learning.records[word.id]).length;
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

              <section className="settings-card data-settings">
                <div className="data-heading"><span className="settings-index">06</span><span><small>Local data</small><strong>学习数据</strong></span></div>
                <p>学习记录和设置只保存在当前设备。恢复默认设置不会删除背词进度。</p>
                <div className="data-actions">
                  <button className="secondary-action" onClick={restoreDefaultSettings}>恢复默认设置</button>
                  {!confirmReset ? (
                    <button className="danger-link" onClick={() => setConfirmReset(true)}>清空学习进度</button>
                  ) : (
                    <div className="reset-confirm" role="alert">
                      <span>确定清空所有等级的学习记录？此操作无法撤销。</span>
                      <button onClick={clearLearningProgress}>确认清空</button>
                      <button onClick={() => setConfirmReset(false)}>取消</button>
                    </div>
                  )}
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
            {dailyComplete && learnedToday.length > 0 ? (
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
                  <div className="story-chips">{learnedToday.map((word) => <button key={word.id} onClick={() => startQueue([word.id], "manual")}>{word.term}</button>)}</div>
                </footer>
              </article>
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

      <footer className="site-footer">
        <span>Wort für Wort, Tag für Tag.</span>
        <span>进度保存在当前设备</span>
      </footer>
    </div>
  );
}
