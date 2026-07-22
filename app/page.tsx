"use client";

import { useEffect, useMemo, useState } from "react";

type RecallStatus = "unknown" | "fuzzy" | "known";
type View = "learn" | "review" | "library" | "progress" | "story";

type WordCard = {
  id: string;
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
};

const STORAGE_KEY = "worttag-learning-state-v1";
const MINUTE = 60_000;
const DAY = 86_400_000;
const INTERVAL_DAYS = [0, 1, 3, 7, 14, 30, 60, 120, 180] as const;

const WORDS: WordCard[] = [
  {
    id: "gewohnheit",
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
  const due = (daysAgo: number) => now - daysAgo * DAY;
  return {
    records: {
      gewohnheit: {
        status: "unknown",
        stage: 0,
        dueAt: due(2),
        intervalDays: 0,
        knownStreak: 0,
        lapseCount: 1,
        lastReviewedAt: due(3),
        sameDayLapses: 0,
        lapseDayKey: null,
      },
      zuverlaessig: {
        status: "known",
        stage: 2,
        dueAt: due(1),
        intervalDays: 3,
        knownStreak: 2,
        lapseCount: 0,
        lastReviewedAt: due(4),
        sameDayLapses: 0,
        lapseDayKey: null,
      },
      vereinbaren: {
        status: "fuzzy",
        stage: 1,
        dueAt: now - 3 * 60 * MINUTE,
        intervalDays: 1,
        knownStreak: 0,
        lapseCount: 0,
        lastReviewedAt: due(1),
        sameDayLapses: 0,
        lapseDayKey: null,
      },
      verspaetung: {
        status: "fuzzy",
        stage: 1,
        dueAt: now - 2 * 60 * MINUTE,
        intervalDays: 1,
        knownStreak: 0,
        lapseCount: 1,
        lastReviewedAt: due(1),
        sameDayLapses: 0,
        lapseDayKey: null,
      },
      erledigen: {
        status: "known",
        stage: 3,
        dueAt: now - 30 * MINUTE,
        intervalDays: 7,
        knownStreak: 3,
        lapseCount: 0,
        lastReviewedAt: due(7),
        sameDayLapses: 0,
        lapseDayKey: null,
      },
    },
    todayKey: dayKey(now),
    todayReviewed: 0,
    todayWordIds: [],
    streakDays: 8,
    sessionComplete: false,
  };
}

function prepareSavedState(saved: LearningState, now = Date.now()): LearningState {
  const currentDay = dayKey(now);
  if (saved.todayKey === currentDay) return saved;
  const gap = dayDifference(saved.todayKey, currentDay);
  return {
    ...saved,
    todayKey: currentDay,
    todayReviewed: 0,
    todayWordIds: [],
    streakDays: gap === 1 ? saved.streakDays + 1 : 1,
    sessionComplete: false,
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

function previewDue(record: MemoryRecord | undefined, rating: RecallStatus) {
  return gradeMemory(record, rating).dueLabel;
}

function buildDailyQueue(state: LearningState, now = Date.now()) {
  const completed = new Set(state.todayWordIds);
  const due = Object.entries(state.records)
    .filter(([, record]) => record.lastReviewedAt !== null && record.dueAt <= now)
    .filter(([id]) => !completed.has(id))
    .sort(([, a], [, b]) => {
      const bucketA = a.stage === 0 ? 0 : 1;
      const bucketB = b.stage === 0 ? 0 : 1;
      return bucketA - bucketB || a.dueAt - b.dueAt || b.lapseCount - a.lapseCount;
    })
    .map(([id]) => id);

  const fresh = WORDS.filter((word) => !state.records[word.id] && !completed.has(word.id))
    .slice(0, 7)
    .map((word) => word.id);

  const queue: string[] = [];
  while (due.length || fresh.length) {
    for (let index = 0; index < 3 && due.length; index += 1) {
      queue.push(due.shift()!);
    }
    if (fresh.length) queue.push(fresh.shift()!);
  }
  return queue;
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

function uniqueIds(ids: string[]) {
  return [...new Set(ids)];
}

export default function Home() {
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>("learn");
  const [learning, setLearning] = useState<LearningState>(() => createInitialState());
  const [sessionQueue, setSessionQueue] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [grading, setGrading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [libraryFilter, setLibraryFilter] = useState<"all" | RecallStatus>("all");

  useEffect(() => {
    let next = createInitialState();
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) next = prepareSavedState(JSON.parse(raw) as LearningState);
    } catch {
      next = createInitialState();
    }
    setLearning(next);
    setSessionQueue(buildDailyQueue(next));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(learning));
  }, [learning, ready]);

  const currentWord = WORDS.find((word) => word.id === sessionQueue[currentIndex]);
  const currentRecord = currentWord ? learning.records[currentWord.id] : undefined;
  const learnedToday = useMemo(
    () => WORDS.filter((word) => new Set(learning.todayWordIds).has(word.id)),
    [learning.todayWordIds],
  );

  const counts = useMemo(() => {
    const result = { unknown: 0, fuzzy: 0, known: 0 };
    WORDS.forEach((word) => {
      result[learning.records[word.id]?.status ?? "unknown"] += 1;
    });
    return result;
  }, [learning.records]);

  const dueWords = useMemo(
    () =>
      WORDS.filter((word) => {
        const record = learning.records[word.id];
        return record?.lastReviewedAt !== null && record?.dueAt <= Date.now();
      }).sort(
        (a, b) =>
          (learning.records[a.id]?.dueAt ?? 0) - (learning.records[b.id]?.dueAt ?? 0),
      ),
    [learning.records],
  );

  const reviewTotal = Object.values(learning.records).filter(
    (record) => record.lastReviewedAt !== null,
  ).length;
  const newTotal = WORDS.length - reviewTotal;
  const sessionProgress = sessionQueue.length
    ? Math.round((currentIndex / sessionQueue.length) * 100)
    : 100;

  function speak(word: WordCard) {
    if (!("speechSynthesis" in window)) {
      setFeedback("当前浏览器暂不支持德语朗读");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word.term.replace("etwas ", ""));
    utterance.lang = "de-DE";
    utterance.rate = 0.82;
    window.speechSynthesis.speak(utterance);
  }

  function finishSession(nextState: LearningState) {
    setLearning({ ...nextState, sessionComplete: true });
    window.setTimeout(() => {
      setFeedback(null);
      setGrading(false);
      setView("story");
    }, 680);
  }

  function rateCurrent(rating: RecallStatus) {
    if (!currentWord || !revealed || grading) return;
    const now = Date.now();
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

  function startQueue(ids: string[]) {
    setSessionQueue(ids);
    setCurrentIndex(0);
    setRevealed(false);
    setFeedback(null);
    setGrading(false);
    setView("learn");
  }

  function switchView(nextView: View) {
    setView(nextView);
    setFeedback(null);
  }

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
        <button className="brand" onClick={() => switchView("learn")} aria-label="返回今日学习">
          <span className="brand-word">WORTTAG</span>
          <span className="brand-seal">W</span>
        </button>
        <nav className="main-nav" aria-label="主导航">
          {([
            ["learn", "今日学习"],
            ["review", "复习"],
            ["library", "词库"],
            ["progress", "进度"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              className={view === id ? "nav-item active" : "nav-item"}
              onClick={() => switchView(id)}
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
                <p className="kicker">Mittwoch · 今日词课</p>
                <h1>先想起来，再看答案。</h1>
              </div>
              <div className="heading-progress" aria-label={`今日进度 ${sessionProgress}%`}>
                <div className="progress-copy">
                  <span>今日进度</span>
                  <strong>{currentIndex} / {sessionQueue.length || learning.todayReviewed}</strong>
                </div>
                <div className="progress-track"><span style={{ width: `${sessionProgress}%` }} /></div>
              </div>
            </section>

            {currentWord ? (
              <div className="study-layout">
                <aside className="session-panel paper-panel" aria-label="今日学习队列">
                  <div className="panel-heading">
                    <span className="folio">01</span>
                    <div><p className="kicker">Sitzung</p><h2>今日队列</h2></div>
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
                    <span className="card-mode">{currentRecord ? "复习" : "新词"} · {String(currentIndex + 1).padStart(2, "0")}</span>
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
                      <button className="reveal-button" onClick={() => setRevealed(true)}>
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
                        <footer>{currentWord.exampleZh}</footer>
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
                              <span><strong>{STATUS_META[status].label}</strong><small>{previewDue(currentRecord, status)}</small></span>
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
                      <div><p className="kicker">Heute</p><h2>今日计划</h2></div>
                    </div>
                    <div className="plan-stats">
                      <div><strong>{reviewTotal}</strong><span>到期复习</span></div>
                      <div><strong>{newTotal}</strong><span>新词</span></div>
                      <div><strong>12</strong><span>约分钟</span></div>
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
                  <button className="story-preview" onClick={() => switchView("story")}>
                    <span className="story-number">03</span>
                    <span><small>每日短文</small><strong>Ein kleiner Umweg</strong><em>{learning.sessionComplete ? "已经生成 · 阅读 →" : "完成词课后自动生成"}</em></span>
                  </button>
                </aside>
              </div>
            ) : (
              <section className="empty-state word-card">
                <p className="kicker">Heute geschafft</p>
                <h2>今天的词已经学完了。</h2>
                <p>复习节奏已排好，现在去读一篇只属于今天的小短文。</p>
                <button className="reveal-button" onClick={() => switchView("story")}>阅读今日短文 →</button>
              </section>
            )}
          </>
        )}

        {view === "review" && (
          <section className="secondary-page">
            <div className="page-heading">
              <div><p className="kicker">Wiederholen</p><h1>到时间的词，才值得复习。</h1></div>
              <button className="primary-action" disabled={!dueWords.length} onClick={() => startQueue(dueWords.map((word) => word.id))}>
                {dueWords.length ? `开始复习 ${dueWords.length} 个词` : "今天已清空"}
              </button>
            </div>
            <div className="review-summary-grid">
              <article className="summary-card"><span>现在到期</span><strong>{dueWords.length}</strong><small>优先处理未知与逾期词</small></article>
              <article className="summary-card"><span>本日已复习</span><strong>{learning.todayReviewed}</strong><small>每次判断都会自动排期</small></article>
              <article className="summary-card"><span>最长间隔</span><strong>180</strong><small>天 · 连续答对逐级增长</small></article>
            </div>
            <div className="due-list paper-panel">
              <div className="list-header"><span>单词</span><span>状态</span><span>上次结果</span><span>下次出现</span></div>
              {(reviewTotal ? WORDS.filter((word) => learning.records[word.id]) : WORDS.slice(0, 3)).map((word) => {
                const record = learning.records[word.id];
                const status = record?.status ?? "unknown";
                return (
                  <button className="due-row" key={word.id} onClick={() => startQueue([word.id])}>
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
              <div><p className="kicker">Wortschatz</p><h1>你的词，分得清才记得住。</h1></div>
              <div className="filter-tabs" aria-label="按掌握状态筛选">
                {(["all", "unknown", "fuzzy", "known"] as const).map((filter) => (
                  <button key={filter} className={libraryFilter === filter ? "active" : ""} onClick={() => setLibraryFilter(filter)} aria-pressed={libraryFilter === filter}>
                    {filter === "all" ? "全部" : STATUS_META[filter].label}
                    <span>{filter === "all" ? WORDS.length : counts[filter]}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="word-library-grid">
              {WORDS.filter((word) => libraryFilter === "all" || (learning.records[word.id]?.status ?? "unknown") === libraryFilter).map((word, index) => {
                const status = learning.records[word.id]?.status ?? "unknown";
                return (
                  <article className="library-card" key={word.id}>
                    <div className="library-card-top"><span className="folio">{String(index + 1).padStart(2, "0")}</span><span className={`status-pill ${status}`}>{STATUS_META[status].label}</span></div>
                    <p className="word-type">{word.type}</p>
                    <h2>{word.term}</h2>
                    <p className="library-meaning">{word.meaning}</p>
                    <div className="library-grammar"><span>搭配</span>{word.grammarTitle}</div>
                    <button onClick={() => startQueue([word.id])}>单独学习 <span aria-hidden="true">→</span></button>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {view === "progress" && (
          <section className="secondary-page">
            <div className="page-heading"><div><p className="kicker">Fortschritt</p><h1>进步，是记忆留下的痕迹。</h1></div><div className="date-stamp">本周 · 第 30 周</div></div>
            <div className="progress-stat-grid">
              <article><span>连续学习</span><strong>{learning.streakDays}<small> 天</small></strong><p>比上周多 2 天</p></article>
              <article><span>已知词汇</span><strong>{counts.known}<small> / {WORDS.length}</small></strong><p>稳定进入长期记忆</p></article>
              <article><span>今日判断</span><strong>{learning.todayReviewed}<small> 次</small></strong><p>未知、模糊、已知</p></article>
              <article><span>预计保持率</span><strong>{Math.round(((counts.known * 0.88 + counts.fuzzy * 0.58 + counts.unknown * 0.28) / WORDS.length) * 100)}<small>%</small></strong><p>根据当前掌握状态估算</p></article>
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
                    <div className="mastery-bar"><span className={status} style={{ width: `${(counts[status] / WORDS.length) * 100}%` }} /></div>
                  </div>
                ))}
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
            {learning.sessionComplete || learnedToday.length >= 3 ? (
              <article className="generated-story">
                <div className="story-title-block"><p className="kicker">B1 · Alltag</p><h1>Ein kleiner Umweg</h1><p>一个小小的绕路</p></div>
                <div className="story-columns">
                  <div className="german-story">
                    <span className="drop-cap">M</span>
                    {WORDS.filter((word) => new Set(uniqueIds(learning.todayWordIds)).has(word.id)).map((word) => (
                      <span key={word.id}> {word.storyDe}</span>
                    ))}
                    <span> Am Ende kommt Mara zwar später, aber gut gelaunt im Büro an. Aus dem ungeplanten Umweg ist eine schöne Begegnung geworden.</span>
                  </div>
                  <div className="translation-panel">
                    <p className="note-label">中文译文</p>
                    {WORDS.filter((word) => new Set(uniqueIds(learning.todayWordIds)).has(word.id)).map((word) => <span key={word.id}>{word.storyZh}</span>)}
                    <span>最后，玛拉虽然晚了一点，但心情愉快地到了办公室。一次计划之外的绕路，变成了一场温暖的相遇。</span>
                  </div>
                </div>
                <footer className="story-vocabulary">
                  <div><p className="kicker">Heute gelernt</p><h2>短文使用了 {learnedToday.length} 个今日词汇</h2></div>
                  <div className="story-chips">{learnedToday.map((word) => <button key={word.id} onClick={() => startQueue([word.id])}>{word.term}</button>)}</div>
                </footer>
              </article>
            ) : (
              <div className="story-locked paper-panel">
                <span className="story-number">03</span>
                <p className="kicker">Tagesgeschichte</p>
                <h1>今天的短文，还差几个词。</h1>
                <p>完成至少 3 个单词后，Worttag 会把你今天真正学过的词编成一篇连贯的 B1 小短文。</p>
                <div className="story-lock-progress"><span style={{ width: `${Math.min(100, (learnedToday.length / 3) * 100)}%` }} /></div>
                <button className="reveal-button" onClick={() => switchView("learn")}>继续学习 · {learnedToday.length} / 3 →</button>
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
