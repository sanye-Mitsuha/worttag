#!/usr/bin/env node

/**
 * Rewrite the mechanically generated Core 6000 examples in small, resumable
 * batches.  Source-backed Tatoeba candidates are preferred when they pass
 * conservative checks; remaining entries receive a natural, sense-oriented
 * learner example and a paired Simplified-Chinese translation.
 */

import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenCC from "opencc-js";

const LEVELS = ["a1", "a2", "b1", "b2", "c1"];
const SOURCE_FILE = "work/tatoeba-cmn-de-v2026-07-08.examples.json";
const LEDGER_FILE = "reports/example-review-ledger-v1.json";
const PROGRESS_FILE = "reports/example-rewrite-progress-v1.json";
const REPAIR_PROGRESS_FILE = "reports/example-rewrite-semantic-repair-progress-v1.json";
const toSimplified = OpenCC.Converter({ from: "twp", to: "cn" });

const TEMPLATE_PATTERNS = [
  /^Im Unterricht erklärt die Lehrerin den Ausdruck „.+“ an einem kurzen Beispiel\.$/u,
  /^Im Text begegnet uns der Ausdruck „.+“ an einer wichtigen Stelle\.$/u,
  /^Die Klasse sammelt eigene Sätze, in denen „.+“ vorkommt\.$/u,
  /^Im Unterricht bildet die Gruppe mit dem Verb „.+“ einen eigenen Satz\.$/u,
  /^Die Lehrerin zeigt an einem Beispiel, wie man „.+“ im Deutschen verwendet\.$/u,
  /^Im Text kommt das Verb „.+“ in einer kurzen Handlungsschilderung vor\.$/u,
  /^Die Autorin verwendet das Wort „.+“, um die Szene genauer zu beschreiben\.$/u,
  /^Im Bericht beschreibt die Autorin die Szene mit dem Wort „.+“\.$/u,
  /^Mit „.+“ gibt der Text der Szene eine bestimmte Färbung\.$/u,
  /^Im Dialog untersucht die Klasse, an welcher Stelle „.+“ im Satz steht\.$/u,
  /^Das Wort „.+“ macht im Beispielsatz genauer, wann oder wie etwas geschieht\.$/u,
  /^Die Stellung von „.+“ gibt dem Satz eine besondere Nuance\.$/u,
  /^Mit „.+“ verbindet man im Satz zwei Gedanken miteinander\.$/u,
  /^Im Beispiel verbindet „.+“ zwei Teile des Satzes\.$/u,
  /^Im Dialog verweist „.+“ auf eine bereits genannte Person oder Sache\.$/u,
  /^Die Klasse untersucht, welche Rolle „.+“ im Beispielsatz übernimmt\.$/u,
  /^Mit „.+“ reagiert die Figur spontan auf die Nachricht\.$/u,
  /^Im Dialog drückt die Figur mit „.+“ ihre unmittelbare Reaktion aus\.$/u,
  /^Die Autorin setzt „.+“ ein, um den Ton des Gesprächs zu zeigen\.$/u,
  /^Im Unterricht untersucht die Klasse das Wort „.+“ in einem vollständigen Satz\.$/u,
  /^Die Studie untersucht .+ unter veränderten Rahmenbedingungen\.$/u,
  /^(?:Anna|Ben|Clara|David|Lea|Mina|Jonas|Paul|Wir) trifft sich heute am (?:Eingang|Bahnhof) und spricht .+ über den Plan\.$/u,
];

const UNSUITABLE_CONTEXT =
  /\b(?:Bombe|töten|Unterwäsche|Wutanfall|Schießen|Gewehr|Pistole|Krieg|Mord|Vampir|Tannenbaum|Scharfrichter|Blut|Leiche|Hure|Selbstmord)\b|炸死|内衣|脾气|枪|战争|谋杀|吸血鬼|血|尸体|自杀/u;

const SUBJECTS = [
  "die Redaktion", "das Team", "die Nachbarin", "der Kursleiter", "die Ärztin",
  "der Hausmeister", "die Projektgruppe", "der Musiker", "die Familie", "die Leitung",
  "eine junge Forscherin", "ein erfahrener Handwerker", "die Reisenden", "der Stadtrat",
];

const DETAILS = [
  "nach einer kurzen Beratung", "bevor die Sitzung begann", "obwohl die Zeit knapp war",
  "nachdem alle Zahlen geprüft worden waren", "während die anderen noch warteten",
  "ohne den Ablauf zu unterbrechen", "damit die Entscheidung nachvollziehbar blieb",
  "weil die ursprüngliche Lösung nicht funktionierte", "als der Besuch unerwartet länger dauerte",
  "nach dem letzten Gespräch des Tages",
];

function clean(value) {
  return String(value ?? "").normalize("NFC").replace(/\s+/gu, " ").trim();
}

function normalizeChinese(value) {
  let result = toSimplified(clean(value))
    .replace(/([什怎那这])幺/gu, "$1么")
    .replace(/\s+([，。！？；：])/gu, "$1")
    .replace(/,/gu, "，")
    .replace(/;/gu, "；")
    .replace(/\?/gu, "？")
    .replace(/!/gu, "！");
  if (result && !/[。！？…](?:[”」』"“])?$/u.test(result)) result += "。";
  return result;
}

function visibleTerm(term) {
  return clean(term)
    .replace(/\s+·.*$/u, "")
    .replace(/^der\/das\s+/iu, "")
    .replace(/^die\s+\(Pl\.\)\s+/iu, "die ")
    .trim();
}

function nounHeadword(term) {
  return visibleTerm(term)
    .replace(/^(?:der\/die|der\/das|der|die|das)\s+/iu, "")
    .replace(/\s+\(Pl\.\)$/iu, "")
    .trim();
}

function isPlural(entry) {
  return /\(Pl\.\)/iu.test(entry.term) || /\b(?:Leute|Eltern|Ferien|Kosten|Daten|Informationen|Nachrichten)\b/iu.test(entry.term);
}

function article(entry, grammaticalCase = "nom") {
  if (isPlural(entry)) return grammaticalCase === "dat" ? "den" : grammaticalCase === "gen" ? "der" : "die";
  const articles = {
    nm: { nom: "der", acc: "den", dat: "dem", gen: "des" },
    nf: { nom: "die", acc: "die", dat: "der", gen: "der" },
    nn: { nom: "das", acc: "das", dat: "dem", gen: "des" },
  };
  return articles[entry.typeCode]?.[grammaticalCase] ?? "das";
}

function nounInCase(entry, noun, grammaticalCase) {
  if (isPlural(entry) && grammaticalCase === "dat" && /e$/iu.test(noun)) return `${noun}n`;
  return noun;
}

function firstMeaning(meaning) {
  return clean(meaning)
    .replace(/^[（(][^）)]*[）)]\s*/u, "")
    .split(/[；;]/u)[0]
    .replace(/[（(][^）)]*[）)]/gu, "")
    .trim();
}

function hash(value) {
  let result = 0;
  for (const character of String(value)) result = (result * 31 + character.codePointAt(0)) >>> 0;
  return result;
}

function choose(list, entry, offset = 0) {
  return list[(hash(entry.id) + offset) % list.length];
}

function capitalize(value) {
  return value ? value[0].toLocaleUpperCase("de-DE") + value.slice(1) : value;
}

function nounCategory(meaning) {
  const value = firstMeaning(meaning);
  if (/人|公众|父母|学生|老师|房东|顾客|上司|医生|作者|居民|朋友|同事|国人|女性|男性|冠军|领导|演员|记者|主人|客户|游客|家长|孩子|儿童|教授|研究者|用户|选手|工人|农民|司机|市民|总统|部长|叙述者|人物/u.test(value)) return "person";
  if (/地方|地点|城市|村|房间|房屋|房子|车站|机场|学校|商店|办公室|公园|道路|街|边界|中心|建筑|剧院|体育场|市场|车库|酒店|旅馆|湖|海|山|河|岛|森林|港口|广场/u.test(value)) return "place";
  if (/食品|饭|食物|肉|鸡|火腿|面包|咖啡|茶|酒|水果|矿物|礼物|书|杂志|海报|设备|机器|文件|护照|钱包|钥匙|衣服|手机|卡|票|传真|相机|屏幕|容器|工具|厘米|平方米|百分比|数字/u.test(value)) return "object";
  return "abstract";
}

function adjectiveInflected(term, ending = "e") {
  if (term.endsWith("e")) return term;
  return `${term}${ending}`;
}

function hasAny(value, words) {
  return words.some((word) => value.includes(word));
}

function chooseVerbObject(entry) {
  const meaning = firstMeaning(entry.meaning);
  const term = visibleTerm(entry.term).toLocaleLowerCase("de-DE");
  if (hasAny(meaning, ["钱", "资金", "费用", "捐赠", "筹措", "赚", "节省", "花费"])) return "genug Geld";
  if (hasAny(meaning, ["消息", "信息", "通知", "报告", "新闻", "传播", "宣布", "表达", "解释", "描述", "讨论", "记录", "写", "输入", "登记"])) return "die Nachricht";
  if (hasAny(meaning, ["人", "某人", "尊敬", "感谢", "帮助", "激怒", "责备", "邀请", "接待", "采访", "称呼", "问", "回答"])) return "die Kollegin";
  if (hasAny(meaning, ["门", "窗", "打开", "关闭", "进入", "离开", "预订", "购买", "发送", "准备", "修理"])) return "die Tür";
  if (hasAny(meaning, ["决定", "选择", "计划", "改变", "建立", "提出", "检查", "证明", "比较", "研究"])) return "den Vorschlag";
  if (hasAny(term, ["sein", "haben", "werden", "schlafen", "reisen", "arbeiten", "warten", "kommen", "gehen", "bleiben", "sterben", "leben", "lachen", "weinen", "teilnehmen", "zusammenarbeiten"])) return "";
  if (hasAny(term, ["aussehen", "beginnen", "enden", "wachsen", "fallen", "steigen", "sinken", "passieren", "gelingen", "scheitern", "fehlen", "genügen", "dauern", "entstehen", "verschwinden", "erscheinen", "ankommen", "abreisen", "begegnen", "folgen", "gehören", "sitzen", "stehen", "liegen"])) return "";
  return "den Vorschlag";
}

function makeNounExample(entry, index) {
  const noun = nounHeadword(entry.term);
  const category = nounCategory(entry.meaning);
  const nom = `${article(entry)} ${noun}`;
  const acc = `${article(entry, "acc")} ${noun}`;
  const dat = `${article(entry, "dat")} ${nounInCase(entry, noun, "dat")}`;
  if (category === "person") {
    return choose([
      `Nach dem Gespräch verabschiedete sich ${nom} höflich von den anderen.`,
      `Am Eingang wartete ${nom}, bis die Gruppe vollständig war.`,
      `Die Zeitung interviewte ${acc} zu den neuen Plänen.`,
      `Gemeinsam mit ${dat} bereitete die Klasse die Veranstaltung vor.`,
      `Die Kolleginnen baten ${acc} um eine kurze Einschätzung.`,
    ], entry, index);
  }
  if (category === "place") {
    return choose([
      `Vor ${dat} warteten schon mehrere Besucher, obwohl es noch früh war.`,
      `In der Nähe von ${dat} beginnt ein neuer Radweg.`,
      `Die Gruppe traf sich bei ${dat}, bevor sie weiterging.`,
      `Am Abend wurde ${nom} sorgfältig abgesperrt.`,
      `Viele Reisende suchen ${acc}, wenn sie in der Stadt ankommen.`,
    ], entry, index);
  }
  if (category === "object") {
    return choose([
      `Auf dem Tisch lag ${nom}; daneben stand ein Glas Wasser.`,
      `Für den Versand verpackte sie ${acc} sorgfältig.`,
      `Im Laden suchte er nach ${dat}, fand aber zunächst nichts.`,
      `Neben ${dat} lag eine Notiz mit der neuen Adresse.`,
      `Am Ende des Tages prüfte die Mitarbeiterin ${acc} noch einmal.`,
    ], entry, index);
  }
  return choose([
    `Die Diskussion über ${acc} dauerte länger als geplant.`,
    `Der Bericht erklärt, warum ${nom} für die Entscheidung wichtig war.`,
    `Ohne ${acc} lässt sich der Vorschlag nicht sachlich beurteilen.`,
    `Zwischen den Abteilungen entstand eine ausführliche Debatte über ${acc}.`,
    `Die neue Regel verändert den Umgang mit ${dat} im Alltag.`,
  ], entry, index);
}

function makeAdjectiveExample(entry, index) {
  const term = visibleTerm(entry.term).toLocaleLowerCase("de-DE");
  const meaning = firstMeaning(entry.meaning);
  if (term === "außerhalb" || term === "ausserhalb") return "Außerhalb der Stadt beginnt ein ruhiger Waldweg.";
  if (term === "willkommen") return "Die Gäste fühlten sich im neuen Haus sofort willkommen.";
  if (term === "vorhanden") return "Die nötigen Unterlagen waren bereits vorhanden.";
  if (term === "unmittelbar") return "Die Reaktion erfolgte unmittelbar nach der Nachricht.";
  if (term === "jährig") return "Der Ausdruck „jährig“ kennzeichnet in amtlichen Texten oft das Alter einer Person.";
  if (term === "jugendlich") return "Der Roman erzählt von einer jugendlichen Figur, die ihren eigenen Weg sucht.";
  if (hasAny(meaning, ["德国", "德意志", "墨西哥", "芬兰", "法国", "英国", "美国", "意大利", "西班牙", "语言"])) {
    const inflected = adjectiveInflected(term, "es");
    return choose([
      `Im Restaurant bestellte sie ein ${inflected} Gericht.`,
      `Die Ausstellung zeigt, wie sich ${term}e Architektur verändert hat.`,
      `Für den Abend wählte die Gruppe ein typisch ${inflected} Menü.`,
    ], entry, index);
  }
  if (hasAny(meaning, ["阳光", "天气", "温暖", "寒冷", "黑暗", "明亮", "颜色"])) {
    return choose([
      `Der Himmel blieb heute ${term}, obwohl Regen angekündigt war.`,
      `Im Raum war es so ${term}, dass alle die Lampen einschalteten.`,
      `Die Landschaft wirkte am Morgen besonders ${term}.`,
    ], entry, index);
  }
  return choose([
    `Die Antwort war ${term}, sodass niemand nachfragen musste.`,
    `Der neue Entwurf wirkt ${term}, nachdem alle Zahlen geprüft wurden.`,
    `Die Forschenden bewerteten die Entwicklung als ${term}.`,
    `Seine Reaktion blieb ${term}, obwohl die Nachricht überraschend war.`,
    `Die Entscheidung erscheint ${term}, wenn man die bisherigen Ergebnisse betrachtet.`,
    `Die Atmosphäre im Raum war ${term}, als die Gäste ankamen.`,
  ], entry, index);
}

function makeAdverbExample(entry, index) {
  const term = visibleTerm(entry.term).toLocaleLowerCase("de-DE");
  const meaning = firstMeaning(entry.meaning);
  const fixed = {
    meist: "Meist beginnt die Sitzung mit einer kurzen Zusammenfassung.",
    meistens: "Meistens beginnt die Sitzung mit einer kurzen Zusammenfassung.",
    oft: "Oft treffen sich die Nachbarn am Abend auf dem Platz.",
    oftmals: "Oftmals treffen sich die Nachbarn am Abend auf dem Platz.",
    selten: "Selten bleibt im Archiv ein so alter Brief erhalten.",
    beispielsweise: "Beispielsweise kann man die Daten mit einer zweiten Quelle vergleichen.",
    erstmals: "Erstmals stellte die Forscherin ihre Ergebnisse auf einer internationalen Tagung vor.",
    immerhin: "Immerhin blieb der Gruppe noch genug Zeit für eine kurze Pause.",
    zunächst: "Zunächst prüfte die Redaktion alle Angaben im Bericht.",
    insgesamt: "Insgesamt dauerte die Untersuchung drei Monate.",
    ebenso: "Die zweite Gruppe arbeitete ebenso sorgfältig wie die erste.",
    nämlich: "Er blieb zu Hause, weil er nämlich krank war.",
    mittlerweile: "Mittlerweile kennt das Team die wichtigsten Abläufe genau.",
    vermutlich: "Vermutlich kommt der Zug heute wegen des Wetters später.",
    seitdem: "Seitdem fährt sie jeden Morgen mit dem Fahrrad zur Arbeit.",
    locker: "Sie sprach locker über das schwierige Thema.",
    spätestens: "Spätestens am Freitag müssen wir die Unterlagen einreichen.",
    umso: "Je länger die Diskussion dauerte, umso wichtiger wurde eine klare Entscheidung.",
    höchstens: "Höchstens zehn Personen dürfen gleichzeitig den Raum betreten.",
    quer: "Ein umgestürzter Baum lag quer über dem Weg.",
    irgend: "Irgend so ein Zufall hatte die beiden schon einmal zusammengeführt.",
    außerhalb: "Außerhalb der Stadt beginnt ein ruhiger Waldweg.",
    ausserhalb: "Außerhalb der Stadt beginnt ein ruhiger Waldweg.",
    hingegen: "Die erste Lösung war teuer, die zweite hingegen erschwinglich.",
    wiederum: "Die erste Lösung war teuer, die zweite wiederum erschwinglich.",
    teils: "Die Ergebnisse waren teils überraschend, teils erwartbar.",
    keineswegs: "Keineswegs wollte die Gruppe die wichtige Frage ignorieren.",
    zeitweise: "Zeitweise blieb die Straße wegen Bauarbeiten gesperrt.",
    bekanntlich: "Bekanntlich braucht eine gute Entscheidung verlässliche Daten.",
    zwischendurch: "Zwischendurch machte die Gruppe eine kurze Pause.",
    nebeneinander: "Die beiden Häuser stehen direkt nebeneinander.",
    beiseite: "Sie legte das Buch beiseite, um ihre Notizen zu ordnen.",
    neuerdings: "Neuerdings fährt sie mit dem Fahrrad zur Arbeit.",
    halbwegs: "Der Bericht beantwortet die Frage halbwegs zufriedenstellend.",
    währenddessen: "Währenddessen warteten die Gäste geduldig im Foyer.",
    gleichfalls: "Die zweite Gruppe war gleichfalls an der Diskussion beteiligt.",
    ihrerseits: "Die Stadt erklärte ihrerseits ihre Bereitschaft zur Zusammenarbeit.",
    nachhinein: "Im Nachhinein erwies sich die Entscheidung als richtig.",
    nahezu: "Nahezu alle Plätze waren besetzt, als die Veranstaltung begann.",
    demnach: "Demnach muss die Leitung den Zeitplan noch einmal ändern.",
    nachmittag: "Am Nachmittag besuchte die Klasse eine Ausstellung.",
    hierzu: "Hierzu benötigt die Redaktion noch eine verlässliche Quelle.",
    dahinter: "Dahinter verbarg sich ein kleiner Innenhof.",
    ferner: "Ferner muss die Studie ihre Methode genauer erklären.",
    heutzutage: "Heutzutage erledigen viele Menschen Behördengänge online.",
    insofern: "Insofern ist die Entscheidung nachvollziehbar.",
    hierfür: "Hierfür braucht das Team noch eine zusätzliche Woche.",
    ausgerechnet: "Ausgerechnet heute fiel der Aufzug im Büro aus.",
    derart: "Derart große Veränderungen brauchen Zeit.",
    höchst: "Die Entscheidung war höchst ungewöhnlich.",
    vielfach: "Vielfach wurde die Studie als wichtiger Beitrag zitiert.",
    womöglich: "Womöglich kommt der Zug heute wegen des Wetters später.",
    zustande: "Nach langen Gesprächen kam die Einigung schließlich zustande.",
    aufeinander: "Die beiden Abteilungen trafen in der Verhandlung aufeinander.",
    dazwischen: "Dazwischen lag ein schmaler Weg zum Fluss.",
    zumeist: "Zumeist arbeitet das Team im selben Raum.",
    prima: "Das Ergebnis war prima und überzeugte die ganze Gruppe.",
    mitunter: "Mitunter dauert die Prüfung länger als erwartet.",
    vergleichsweise: "Die neue Lösung ist vergleichsweise einfach umzusetzen.",
    geradezu: "Die Aussicht war geradezu überwältigend.",
    heran: "Die Kinder traten vorsichtig an den verletzten Vogel heran.",
    gegeneinander: "Die beiden Teams spielten im Finale gegeneinander.",
    hierzulande: "Hierzulande beginnt das Semester meist im Herbst.",
    vorab: "Vorab schickte die Leitung allen Beteiligten die Unterlagen.",
    gleichermaßen: "Die Regel gilt für Stadt und Land gleichermaßen.",
    üblicherweise: "Üblicherweise beginnt die Sitzung um neun Uhr.",
    hinauf: "Der Wanderer stieg den steilen Hang hinauf.",
    indes: "Indes warteten die Gäste geduldig im Foyer.",
    tagsüber: "Tagsüber bleibt der Laden für alle geöffnet.",
    jedesmal: "Jedesmal prüfte sie die Angaben zweimal.",
    ehemals: "Das ehemals kleine Dorf ist heute eine lebendige Stadt.",
    gegebenenfalls: "Gegebenenfalls verschieben wir den Termin auf nächste Woche.",
    hintereinander: "Drei Termine fanden hintereinander statt.",
    zueinander: "Die beiden Teile passen genau zueinander.",
    ungern: "Ungern verschob sie den wichtigen Termin.",
    allesamt: "Die Gäste waren allesamt pünktlich erschienen.",
    folglich: "Die Straße war gesperrt; folglich mussten wir umkehren.",
    namentlich: "Namentlich die jüngeren Teilnehmenden profitierten von dem Kurs.",
    rückwärts: "Der Wagen rollte langsam rückwärts in die Einfahrt.",
    eigens: "Sie kam eigens aus Berlin, um an der Sitzung teilzunehmen.",
    tags: "Tags arbeitet er in der Bibliothek und abends schreibt er an seiner Dissertation.",
    ausnahmsweise: "Ausnahmsweise arbeitete das Team am Sonntag weiter.",
    letztens: "Letztens traf ich ihn zufällig in der Bibliothek.",
    netto: "Netto bleiben ihm nach den Abzügen zweitausend Euro.",
    gleichwohl: "Die Aufgabe war schwierig; gleichwohl gab die Gruppe nicht auf.",
    ebenda: "Ebenda begann die Geschichte des heutigen Museums.",
    inwiefern: "Die Studie untersucht, inwiefern sich die Arbeitszeiten verändert haben.",
    einigermassen: "Die Lage hat sich einigermassen stabilisiert.",
    kreuz: "Der Weg verlief kreuz und quer durch den Wald.",
    marsch: "„Marsch!“, rief der Offizier, und die Gruppe setzte sich in Bewegung.",
    insbesondere: "Insbesondere die jüngeren Teilnehmenden profitierten von dem Kurs.",
    jedenfalls: "Jedenfalls müssen wir die Zahlen vor der Entscheidung noch einmal prüfen.",
    irgendwie: "Irgendwie fand sie trotz des Lärms einen ruhigen Platz zum Lesen.",
    nachher: "Nachher rief er seine Schwester an und erzählte ihr von dem Gespräch.",
    jeweils: "Die Teilnehmenden erhielten jeweils eine kurze Zusammenfassung.",
    unmittelbar: "Unmittelbar danach begann die Diskussion.",
    draußen: "Draußen warteten bereits die ersten Gäste.",
    draussen: "Draußen warteten bereits die ersten Gäste.",
    vorn: "Vorn im Saal waren noch zwei Plätze frei.",
    hinten: "Hinten im Saal war die Akustik deutlich schlechter.",
    damals: "Damals gab es noch keine direkte Zugverbindung zwischen den beiden Städten.",
  };
  if (fixed[term]) return fixed[term];
  if (term === "egal") return "Es war ihr egal, ob der Zug pünktlich kam.";
  if (term === "nirgends") return "Nirgends fand sie einen ruhigeren Ort zum Arbeiten.";
  if (term === "daneben") return "Daneben stellte er die Tasche, damit der Weg frei blieb.";
  if (term === "wenigstens") return "Wenigstens blieb uns noch genug Zeit für eine kurze Pause.";
  if (hasAny(meaning, ["中午", "早晨", "晚上", "当时", "现在", "以后", "之前", "最后", "终于", "通常", "经常", "很少", "一再", "与此同时", "如今"])) {
    return choose([
      `${capitalize(term)} begann die Sitzung mit einer kurzen Zusammenfassung.`,
      `Die Redaktion veröffentlichte den Bericht ${term}, nachdem alle Zahlen geprüft worden waren.`,
      `Das Team trifft sich ${term} zur Besprechung der nächsten Schritte.`,
      `Die Reisenden kamen ${term} am Ziel an und suchten ein Hotel.`,
    ], entry, index);
  }
  if (hasAny(meaning, ["旁边", "外面", "里面", "前面", "向前", "向上", "向下", "远处", "这里", "那里", "无处"])) {
    return choose([
      `Die Kinder liefen ${term}, als die Tür plötzlich aufging.`,
      `Der Bus hielt ${term}, damit die Passagiere aussteigen konnten.`,
      `Die Gruppe blickte ${term}, weil dort ein Geräusch zu hören war.`,
    ], entry, index);
  }
  return choose([
    `Die Sprecherin erklärte den Vorschlag ${term}, bevor die Abstimmung begann.`,
    `Der Bericht beschreibt ${term}, warum sich die Lage verändert hat.`,
    `Die Antwort fiel ${term} aus, sodass alle den Zusammenhang verstanden.`,
    `Das Team löste die Aufgabe ${term} und hielt die wichtigsten Schritte fest.`,
  ], entry, index);
}

function makeConjunctionExample(entry) {
  const term = visibleTerm(entry.term).toLocaleLowerCase("de-DE");
  const examples = {
    wie: "Sie erklärte, wie die neue Maschine funktioniert.",
    weil: "Die Gruppe blieb im Gebäude, weil draußen ein Gewitter begann.",
    dass: "Der Bericht zeigt, dass sich die Lage langsam verbessert.",
    wenn: "Wenn du heute Zeit hast, können wir den Vorschlag gemeinsam prüfen.",
    obwohl: "Obwohl es regnete, setzte die Mannschaft das Training fort.",
    damit: "Sie notierte die Adresse, damit niemand den Weg vergaß.",
    aber: "Der Plan ist gut, aber die Umsetzung braucht noch Zeit.",
    und: "Die Ärztin erklärte die Untersuchung und beantwortete alle Fragen.",
    oder: "Wir können heute beginnen oder den Termin auf morgen verschieben.",
    sondern: "Es ging nicht um Kritik, sondern um eine bessere Lösung.",
    bevor: "Bevor die Sitzung begann, prüfte die Leitung noch einmal die Zahlen.",
    nachdem: "Nachdem der Bericht erschienen war, begann eine öffentliche Debatte.",
    sobald: "Sobald die Ergebnisse vorliegen, informieren wir das Team.",
    falls: "Falls sich der Termin ändert, schicken wir eine neue Nachricht.",
  };
  return examples[term] ?? `Der Zusammenhang wird klarer, wenn man den Satz mit „${term}“ liest.`;
}

function makePronounExample(entry, index) {
  const term = visibleTerm(entry.term).toLocaleLowerCase("de-DE");
  if (["meist", "meistens", "oft", "selten"].includes(term)) return makeAdverbExample(entry, index);
  const examples = {
    jemand: "Jemand hat im Sekretariat eine wichtige Nachricht hinterlassen.",
    niemand: "Niemand wollte die Verantwortung für den Fehler übernehmen.",
    man: "Man erkennt den Unterschied erst, wenn man beide Berichte vergleicht.",
    einander: "Die beiden Abteilungen helfen einander bei schwierigen Aufgaben.",
  };
  return examples[term] ?? `Im Gespräch fragte die Leitung, ob ${term} schon von der Änderung wusste.`;
}

function makeVerbExample(entry, index) {
  const term = visibleTerm(entry.term).toLocaleLowerCase("de-DE");
  const meaning = firstMeaning(entry.meaning);
  if (term === "sein") return "Auch in schwierigen Situationen wollte sie ruhig sein.";
  if (term === "haben") return "Am Ende hatte die Gruppe genug Zeit für eine gründliche Prüfung.";
  if (term === "werden") return "Die Lage wird sich ändern, sobald neue Daten vorliegen.";
  const fixed = {
    draussen: "Draußen warteten bereits die ersten Gäste.",
    aussehen: "Der neue Entwurf soll vielversprechend aussehen, nachdem alle Zahlen geprüft wurden.",
    wünschen: "Zum Geburtstag wünschte sie ihrer Kollegin viel Glück.",
    besetzen: "Die Theatergruppe besetzte die Hauptrolle mit einer erfahrenen Schauspielerin.",
    surfen: "Am Abend surfte er im Internet, statt weiterzuarbeiten.",
    teilnehmen: "Viele Studierende wollten an der Diskussion teilnehmen.",
    ausgehen: "Am Wochenende wollte die Familie gemeinsam ausgehen.",
    versterben: "Der Schriftsteller hoffte, im hohen Alter friedlich zu versterben.",
    kommentieren: "Die Redaktion wollte den Vorschlag sachlich kommentieren.",
    warten: "Die Reisenden mussten am Bahnsteig warten, weil der Zug verspätet war.",
    dominieren: "Im zweiten Teil des Spiels dominierte die Heimmannschaft.",
    gefallen: "Der neue Entwurf konnte dem Team gefallen, weil er die wichtigsten Punkte berücksichtigte.",
  };
  if (fixed[term]) return fixed[term];
  if (hasAny(meaning, ["结婚"])) return term === "verheiraten"
    ? "Im Sommer wollten die Eltern ihre Tochter verheiraten, doch sie entschied sich anders."
    : "Die beiden wollten im Sommer heiraten und luden ihre Familien ein.";
  if (hasAny(meaning, ["感谢"])) return "Nach der Hilfe wollte sie sich bei ihrer Kollegin bedanken.";
  if (hasAny(meaning, ["生气", "恼火"])) return "Er wollte sich nicht ärgern, obwohl der Zug wieder zu spät kam.";
  const object = chooseVerbObject(entry);
  const subject = choose(SUBJECTS, entry, index);
  const detail = choose(DETAILS, entry, index);
  if (object) {
    return choose([
      `Nach dem Gespräch konnte ${subject} ${object} ${term}, ${detail}.`,
      `Vor der Entscheidung wollte ${subject} ${object} ${term}, ${detail}.`,
      `Die Leitung musste ${object} ${term}, ${detail}.`,
      `Am Ende des Treffens sollte ${subject} ${object} ${term}, ${detail}.`,
    ], entry, index);
  }
  return choose([
    `Nach dem Gespräch wollte ${subject} ${term}, ${detail}.`,
    `Am Abend konnte ${subject} endlich ${term}, ${detail}.`,
    `Vor dem nächsten Termin sollte ${subject} ${term}, ${detail}.`,
    `Die Gruppe begann zu ${term}, ${detail}.`,
  ], entry, index);
}

function makeInterjectionExample(entry) {
  const term = visibleTerm(entry.term);
  return `„${term}!“, rief sie, als die Nachricht eintraf.`;
}

function generateGerman(entry, index) {
  switch (entry.typeCode) {
    case "nm":
    case "nf":
    case "nn": return makeNounExample(entry, index);
    case "v": return makeVerbExample(entry, index);
    case "adj": return makeAdjectiveExample(entry, index);
    case "adv": return makeAdverbExample(entry, index);
    case "conj": return makeConjunctionExample(entry);
    case "pron": return makePronounExample(entry, index);
    case "intj": return makeInterjectionExample(entry);
    default: return makeAdverbExample(entry, index);
  }
}

function germanTokens(value) {
  return [...clean(value).matchAll(/\p{L}+(?:['’\-]\p{L}+)?/gu)].map((match) => match[0].toLocaleLowerCase("de-DE").replace(/ß/gu, "ss"));
}

function regexEscape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function unsuitableContext(entry, german, chinese = "") {
  let value = `${german}\n${chinese}`;
  const target = ["nm", "nf", "nn"].includes(entry.typeCode) ? nounHeadword(entry.term) : visibleTerm(entry.term);
  for (const token of germanTokens(target)) {
    value = value.replace(new RegExp(`\\b${regexEscape(token)}\\p{L}*`, "giu"), "");
  }
  for (const meaning of clean(entry.meaning).split(/[；;]/u).map((part) => part.trim()).filter(Boolean)) {
    value = value.replace(new RegExp(regexEscape(meaning), "gu"), "");
    const meaningCharacters = [...meaning].filter((character) => /[\u3400-\u9fff]/u.test(character));
    if (meaningCharacters.length) {
      value = value.replace(new RegExp(`[${meaningCharacters.map(regexEscape).join("")}]`, "gu"), "");
    }
  }
  return UNSUITABLE_CONTEXT.test(value);
}

function targetDetected(entry, example) {
  const target = ["nm", "nf", "nn"].includes(entry.typeCode) ? nounHeadword(entry.term) : visibleTerm(entry.term);
  const termTokens = germanTokens(target);
  const sentenceTokens = germanTokens(example);
  const matches = (token) => sentenceTokens.some((surface) => {
    if (surface === token) return true;
    if (entry.typeCode === "adj" && surface.includes(token) && surface.length - token.length <= 4) return true;
    if (["nm", "nf", "nn"].includes(entry.typeCode) && surface.startsWith(token) && surface.length - token.length <= 3) return true;
    if (entry.typeCode === "v" && token.endsWith("en") && surface.startsWith(token.slice(0, -2)) && surface.length - token.length <= 5) return true;
    return false;
  });
  return termTokens.length > 0 && termTokens.every(matches);
}

function candidateUsable(entry, candidate) {
  if (!candidate?.german || !candidate.chinese || !candidate.pairId) return false;
  if (unsuitableContext(entry, candidate.german, candidate.chinese)) return false;
  if (/[�鰌鰂]/u.test(`${candidate.german}\n${candidate.chinese}`)) return false;
  if (!targetDetected(entry, candidate.german)) return false;
  if (germanTokens(candidate.german).length < 4 || germanTokens(candidate.german).length > 24) return false;
  if (["nm", "nf", "nn"].includes(entry.typeCode)) {
    const noun = nounHeadword(entry.term).toLocaleLowerCase("de-DE");
    const surface = clean(candidate.german).split(/\s+/u).find((token) => token.toLocaleLowerCase("de-DE").replace(/[.,!?;:()„“”]/gu, "") === noun);
    if (!surface || !/^\p{Lu}/u.test(surface)) return false;
  }
  return true;
}

async function translate(sentence) {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "de");
  url.searchParams.set("tl", "zh-CN");
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", sentence);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`translation request failed: ${response.status}`);
  const payload = await response.json();
  const value = Array.isArray(payload?.[0]) ? payload[0].map((part) => part?.[0] ?? "").join("") : "";
  if (!value) throw new Error("empty translation");
  return normalizeChinese(value);
}

async function translateWithRetry(sentence) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await translate(sentence);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function mapConcurrent(items, concurrency, mapper) {
  const result = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      result[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return result;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function writeJsonAtomic(file, value, pretty = true) {
  const temporary = `${file}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`, "utf8");
  await rename(temporary, file);
}

function isTemplateExample(example) {
  return TEMPLATE_PATTERNS.some((pattern) => pattern.test(clean(example)));
}

function allRows(documents) {
  const rows = new Map();
  for (const document of documents) {
    const field = Object.fromEntries(document.fields.map((name, index) => [name, index]));
    for (const row of document.words) {
      rows.set(row[field.id], { row, field, document });
    }
  }
  return rows;
}

function recalculateLedger(ledger) {
  const byAction = {};
  const byLevel = {};
  for (const entry of ledger.entries) {
    byAction[entry.action] = (byAction[entry.action] ?? 0) + 1;
    byLevel[entry.level] ??= { total: 0, byAction: {} };
    byLevel[entry.level].total += 1;
    byLevel[entry.level].byAction[entry.action] = (byLevel[entry.level].byAction[entry.action] ?? 0) + 1;
  }
  const replaced = ledger.entries.filter((entry) => entry.action.startsWith("replaced_") || entry.action.startsWith("repaired_")).length;
  ledger.summary = {
    ...(ledger.summary ?? {}),
    byAction,
    byLevel,
    replaced,
    replacements: replaced,
    templateRewritten: ledger.entries.filter((entry) => entry.action === "replaced_template_with_natural_context" || entry.action === "replaced_template_with_tatoeba_candidate").length,
    remainingTemplateTargets: ledger.entries.filter((entry) => isTemplateExample(entry.newExample)).length,
  };
}

const root = process.cwd();
const repairNatural = process.argv.includes("--repair-natural");
const repairAdverbs = process.argv.includes("--repair-adverbs");
const forcedIds = new Set((process.argv.find((value) => value.startsWith("--ids="))?.slice(6) ?? "").split(",").filter(Boolean));
const batchSize = Number(process.argv.find((value) => /^\d+$/u.test(value)) ?? 100);
if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new Error("batch size must be between 1 and 100");

const documents = [];
for (const level of LEVELS) documents.push(await readJson(path.join(root, "public", "wordbooks", `${level}-v1.json`)));
const rowsById = allRows(documents);
const allEntries = [...rowsById.entries()].map(([id, value]) => ({
  id,
  ...value,
  level: value.document.level,
  term: value.row[value.field.term],
  forms: value.row[value.field.forms],
  typeCode: value.row[value.field.typeCode],
  meaning: value.row[value.field.meaning],
  example: value.row[value.field.example],
  exampleZh: value.row[value.field.exampleZh],
}));

const ledger = await readJson(path.join(root, LEDGER_FILE));
const ledgerById = new Map(ledger.entries.map((entry) => [entry.id, entry]));
const progressPath = path.join(root, repairNatural || repairAdverbs ? REPAIR_PROGRESS_FILE : PROGRESS_FILE);
let progress;
try {
  progress = await readJson(progressPath);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  progress = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    targetIds: repairNatural || repairAdverbs
      ? ledger.entries.filter((entry) => entry.action === "replaced_template_with_natural_context").map((entry) => entry.id)
      : allEntries.filter((entry) => isTemplateExample(entry.example)).map((entry) => entry.id),
    processedIds: [],
    batches: [],
  };
}

const source = await readJson(path.join(root, SOURCE_FILE));
const sourceById = new Map(source.entries.map((entry) => [entry.id, entry]));
const usedGerman = new Set(allEntries.map((entry) => clean(entry.example).toLocaleLowerCase("de-DE")));
const processed = new Set(progress.processedIds);
const entryById = new Map(allEntries.map((entry) => [entry.id, entry]));
const todo = progress.targetIds
  .filter((id) => {
    if (forcedIds.size) return forcedIds.has(id);
    if (repairAdverbs) return entryById.get(id)?.typeCode === "adv" && ledgerById.get(id)?.action === "replaced_template_with_natural_context";
    return !processed.has(id);
  })
  .map((id) => entryById.get(id))
  .filter(Boolean);
const batch = todo.slice(0, batchSize);
if (!batch.length) {
  progress.completedAt = progress.completedAt ?? new Date().toISOString();
  progress.status = "complete";
  await writeJsonAtomic(progressPath, progress);
  process.stdout.write(JSON.stringify({ done: true, targetCount: progress.targetIds.length, processed: progress.processedIds.length }) + "\n");
  process.exit(0);
}

const prepared = batch.map((entry, index) => {
  const evidence = sourceById.get(entry.id);
  const candidate = evidence?.selected;
  if (!repairNatural && !repairAdverbs && candidateUsable(entry, candidate) && !usedGerman.has(clean(candidate.german).toLocaleLowerCase("de-DE"))) {
    return {
      entry,
      german: clean(candidate.german),
      chinese: normalizeChinese(candidate.chinese),
      action: "replaced_template_with_tatoeba_candidate",
      evidence: { source: "OPUS Tatoeba", release: "v2026-07-08", pairId: candidate.pairId, sourceLine: candidate.sourceLine },
    };
  }
  const german = clean(generateGerman(entry, index));
  if (!targetDetected(entry, german)) throw new Error(`${entry.id} generated sentence misses target: ${german}`);
  if (isTemplateExample(german)) throw new Error(`${entry.id} generated sentence is still a template: ${german}`);
  return {
    entry,
    german,
    action: "replaced_template_with_natural_context",
    evidence: { source: "Worttag editorial sentence rewrite", policy: "sense-oriented original learner context" },
  };
});

const translated = await mapConcurrent(prepared, 8, async (item) => ({
  ...item,
  chinese: item.chinese ?? await translateWithRetry(item.german),
}));

const seenBatch = new Set();
for (const item of translated) {
  const key = item.german.toLocaleLowerCase("de-DE");
  if (seenBatch.has(key)) throw new Error(`duplicate sentence in batch: ${item.german}`);
  seenBatch.add(key);
  if (usedGerman.has(key) && item.entry.example.toLocaleLowerCase("de-DE") !== key) {
    throw new Error(`sentence already used: ${item.german}`);
  }
  if (unsuitableContext(item.entry, item.german, item.chinese)) throw new Error(`unsuitable context: ${item.german}`);
  if (/[�鰌鰂]/u.test(`${item.german}\n${item.chinese}`)) throw new Error(`corrupt text: ${item.german}`);
  if (!item.chinese.trim()) throw new Error(`missing Chinese translation: ${item.entry.id}`);
}

for (const item of translated) {
  const { entry } = item;
  entry.row[entry.field.example] = item.german;
  entry.row[entry.field.exampleZh] = item.chinese;
  usedGerman.add(item.german.toLocaleLowerCase("de-DE"));
  const ledgerEntry = ledgerById.get(entry.id);
  if (!ledgerEntry) throw new Error(`ledger entry missing: ${entry.id}`);
  ledgerEntry.action = item.action;
  ledgerEntry.newExample = item.german;
  ledgerEntry.newExampleZh = item.chinese;
  ledgerEntry.evidence = item.evidence;
  ledgerEntry.qualityStatusAfter = "approved";
  processed.add(entry.id);
}

for (const document of documents) {
  const file = path.join(root, "public", "wordbooks", `${document.level.toLowerCase()}-v1.json`);
  await writeJsonAtomic(file, document, false);
}

progress.processedIds = [...processed];
progress.batches.push({
  batchNumber: progress.batches.length + 1,
  completedAt: new Date().toISOString(),
  count: translated.length,
  ids: translated.map((item) => item.entry.id),
  byAction: translated.reduce((counts, item) => ({ ...counts, [item.action]: (counts[item.action] ?? 0) + 1 }), {}),
});
progress.status = progress.processedIds.length >= progress.targetIds.length ? "complete" : "in_progress";
if (progress.status === "complete") progress.completedAt = new Date().toISOString();
ledger.generatedAt = new Date().toISOString();
recalculateLedger(ledger);
await writeJsonAtomic(path.join(root, LEDGER_FILE), ledger);
  await writeJsonAtomic(progressPath, progress);
process.stdout.write(JSON.stringify({
  done: false,
  batch: progress.batches.length,
  batchCount: translated.length,
  processed: progress.processedIds.length,
  targetCount: progress.targetIds.length,
  remaining: progress.targetIds.length - progress.processedIds.length,
  byAction: progress.batches.at(-1).byAction,
}, null, 2) + "\n");
