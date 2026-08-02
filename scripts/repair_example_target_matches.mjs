#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const REPAIRS = {
  "core6000-a2-1312": ["Kraft seiner Erfahrung traf Jonas eine klare Entscheidung.", "凭借他的经验，乔纳斯作出了明确决定。"],
  "core6000-b1-2180": ["Der Preis ist inklusive Frühstück.", "价格包含早餐。"],
  "core6000-b2-2658": ["Mittels einer Umfrage ermittelte das Institut die Zufriedenheit.", "研究所通过一项调查了解了满意度。"],
  "core6000-b2-2769": ["Wir schicken die Unterlagen via E-Mail.", "我们通过电子邮件发送材料。"],
  "core6000-b2-2819": ["Anhand der Daten erklärt die Forscherin den Unterschied.", "研究人员根据数据解释了差异。"],
  "core6000-b2-2861": ["Bezüglich des Termins melde ich mich morgen noch einmal.", "关于日期，我明天再联系你。"],
  "core6000-b2-3187": ["Hinsichtlich der Kosten braucht das Projekt eine neue Planung.", "就费用而言，这个项目需要重新规划。"],
  "core6000-b2-3243": ["Seitens der Schule gab es keine Einwände.", "校方没有提出异议。"],
  "core6000-b2-3272": ["Jenseits des Flusses beginnt ein dichter Wald.", "河流对岸是一片茂密的森林。"],
  "core6000-b2-3544": ["Das Gericht entschied zugunsten der Klägerin.", "法院作出了有利于原告的判决。"],
  "core6000-b2-3573": ["Infolge des Unwetters fiel der Zugverkehr aus.", "由于暴风雨，铁路交通中断了。"],
  "core6000-b2-3576": ["Unterhalb der Burg liegt ein kleines Dorf.", "城堡下方有一个小村庄。"],
  "core6000-c1-4132": ["Anstelle des Autos nehmen wir heute den Zug.", "今天我们乘火车，不开车。"],
  "core6000-c1-4139": ["Oberhalb des Dorfes beginnt der Wanderweg.", "村庄上方是徒步小路的起点。"],
  "core6000-c1-4462": ["Die Ergebnisse übertreffen unsere Erwartungen.", "结果超出了我们的预期。"],
  "core6000-c1-4737": ["Mangels Beweisen wurde das Verfahren eingestellt.", "由于缺乏证据，诉讼程序被终止。"],
  "core6000-c1-4787": ["Inmitten der Stadt liegt ein ruhiger Park.", "市中心有一座安静的公园。"],
  "core6000-c1-4795": ["Als der Preis sank, schlug sie sofort zu.", "价格下降后，她立即出手。"],
  "core6000-c1-5784": ["Zwecks weiterer Informationen wenden Sie sich bitte an das Büro.", "如需进一步信息，请联系办公室。"],
  "core6000-b2-2695": ["Der Verein will der Gewinnerin den Preis verleihen.", "协会想把奖项授予获胜者。"],
  "core6000-b2-2728": ["Angesichts der steigenden Kosten prüft das Team den Plan erneut.", "面对不断上涨的成本，团队再次审查了计划。"],
  "core6000-b2-3349": ["Sie kam samt ihrem Gepäck am Bahnhof an.", "她带着行李一起到达了车站。"],
  "core6000-b2-3668": ["Der Zug fährt gen Norden.", "火车向北行驶。"],
  "core6000-b2-3802": ["Wider Erwarten verlief das Gespräch ruhig.", "出乎意料的是，这次谈话进行得很平静。"],
  "core6000-c1-5423": ["Nebst den Unterlagen brachte sie auch die Originale mit.", "除了文件，她还带来了原件。"],
};

const levels = ["a1", "a2", "b1", "b2", "c1"];
let changed = 0;
const applied = [];
for (const level of levels) {
  const file = `public/wordbooks/${level}-v1.json`;
  const document = JSON.parse(await readFile(file, "utf8"));
  const field = Object.fromEntries(document.fields.map((name, index) => [name, index]));
  for (const row of document.words) {
    const repair = REPAIRS[row[field.id]];
    if (!repair) continue;
    row[field.example] = repair[0];
    row[field.exampleZh] = repair[1];
    changed += 1;
    applied.push({ id: row[field.id], example: repair[0], exampleZh: repair[1] });
  }
  await writeFile(file, `${JSON.stringify(document)}\n`, "utf8");
}
if (changed !== Object.keys(REPAIRS).length) throw new Error(`Applied ${changed} repairs, expected ${Object.keys(REPAIRS).length}.`);
const ledgerFile = "reports/example-review-ledger-v1.json";
const ledger = JSON.parse(await readFile(ledgerFile, "utf8"));
const byId = new Map((ledger.entries ?? []).map((entry) => [entry.id, entry]));
for (const repair of applied) {
  const entry = byId.get(repair.id);
  if (!entry) throw new Error(`Ledger entry missing for ${repair.id}.`);
  entry.action = "repaired_example_target_match_after_template_upgrade";
  entry.newExample = repair.example;
  entry.newExampleZh = repair.exampleZh;
  entry.evidence = {
    source: "Worttag sentence-quality repair",
    policy: "Repair added the declared headword or a verified inflected/separable form and removed a repeated generic sentence.",
  };
}
ledger.generatedAt = new Date().toISOString();
ledger.summary = {
  ...(ledger.summary ?? {}),
  postUpgradeRepairs: (ledger.summary?.postUpgradeRepairs ?? 0) + applied.length,
};
await writeFile(ledgerFile, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ changed, entries: Object.keys(REPAIRS) }, null, 2)}\n`);
