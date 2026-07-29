#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import OpenCC from "opencc-js";
import { expectedDictionaryPos, loadCuratedEntries } from "./audit_wordbooks.mjs";

const root = process.cwd();
const wordbookPath = path.join(root, "public", "wordbooks", "b2-v1.json");
const reviewPath = path.join(root, "data", "editorial", "b2-review.json");

async function writeJsonAtomic(filePath, value, pretty = false) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`, "utf8");
  await rename(temporary, filePath);
}

const teachingLines = `
die Süße|nf|甜味；甜度|Die Süße der reifen Birne passt gut zu ihrer leichten Säure.|熟梨的甜味与淡淡的酸味很协调。
solar|adj|太阳能的；与太阳有关的|Das Gebäude wird überwiegend mit solarer Energie versorgt.|这栋楼主要由太阳能供电。
die Migration|nf|迁移；移民；（数据）迁移|Migration verändert sowohl Herkunfts- als auch Aufnahmegesellschaften.|移民会改变输出地社会和接收地社会。
die Wette|nf|赌约；打赌|Ich habe die Wette gewonnen, obwohl niemand an mich glaubte.|尽管没人看好我，我还是赢了这场赌。
das Abgas|nn|废气；尾气|Ein moderner Filter reduziert schädliche Abgase.|现代过滤器可以减少有害废气。
ehemalig|adj|从前的；前任的|Die ehemalige Fabrik dient heute als Kulturzentrum.|昔日的工厂如今被用作文化中心。
bisherig|adj|迄今的；此前的|Die bisherigen Ergebnisse bestätigen unsere Vermutung.|迄今的结果证实了我们的推测。
der Datenschutz|nm|数据保护；隐私保护|Beim Umgang mit Kundendaten hat der Datenschutz höchste Priorität.|处理客户数据时，数据保护应放在首位。
das Burnout|nn|职业倦怠；身心耗竭|Dauerhafter Stress kann zu einem Burnout führen.|长期压力可能导致职业倦怠。
das Heim|nn|住所；福利院；养老院|Nach dem Krankenhausaufenthalt kehrte sie in ihr Heim zurück.|住院结束后，她回到了自己的住所。
das Lächeln|nn|微笑|Ein ehrliches Lächeln lockerte die angespannte Stimmung.|一个真诚的微笑缓和了紧张的气氛。
die Folge|nf|后果；顺序；（剧集的）一集|Die Entscheidung hatte unerwartete Folgen für das gesamte Team.|这个决定给整个团队带来了意想不到的后果。
die Gewalt|nf|暴力；力量；权力|Konflikte sollten ohne Gewalt gelöst werden.|冲突应当以非暴力方式解决。
das Dunkel|nn|黑暗；昏暗|Im Dunkel konnte ich nur die Umrisse des Hauses erkennen.|黑暗中，我只能看清房屋的轮廓。
das Fehlen|nn|缺少；缺席|Das Fehlen klarer Regeln erschwert die Zusammenarbeit.|缺少明确规则会使合作变得困难。
treiben|v|驱赶；推动；从事；漂流|Der Wind trieb die Wolken rasch nach Osten.|风把云迅速吹向东方。
das Pech|nn|霉运；沥青；树脂|Wir hatten Pech und verpassten den letzten Zug.|我们运气不好，错过了末班火车。
das Reiten|nn|骑马|Regelmäßiges Reiten verbessert Gleichgewicht und Körperhaltung.|经常骑马有助于改善平衡和体态。
mittel|adj|中等的；平均的|Das Unternehmen rechnet mit einem mittleren Wachstum.|公司预计会有中等幅度的增长。
das Fressen|nn|动物的食物；进食|Der Tierpfleger bereitete das Fressen für die Wölfe vor.|饲养员为狼群准备了食物。
greifen|v|抓；伸手拿；采取|Die Behörde muss zu wirksamen Maßnahmen greifen.|主管部门必须采取有效措施。
berichten|v|报道；汇报|Die Zeitung berichtet ausführlich über die Verhandlungen.|报纸对谈判进行了详细报道。
das Heil|nn|福祉；拯救|Er suchte sein Heil nicht in schnellen Lösungen, sondern in geduldiger Arbeit.|他没有寄望于速成办法，而是靠耐心工作来改善处境。
erstaunlich|adj|令人惊讶的；惊人的|Es ist erstaunlich, wie schnell sich die Technik entwickelt.|技术发展得如此之快，令人惊讶。
die Reaktion|nf|反应；回应|Ihre ruhige Reaktion verhinderte einen weiteren Streit.|她冷静的反应避免了进一步争执。
das Negativ|nn|底片；负片|Das alte Negativ wurde sorgfältig digitalisiert.|那张旧底片被仔细地数字化了。
der Graben|nm|沟；壕沟；鸿沟|Zwischen den beiden Positionen besteht noch ein tiefer Graben.|两种立场之间仍存在很深的鸿沟。
verärgert|adj|恼火的；生气的|Die Kundin war über die lange Wartezeit verärgert.|那位顾客因等待时间过长而恼火。
die Leere|nf|空虚；空旷；空白|Nach dem Umzug wirkte die Wohnung ungewohnt leer.|搬家后，公寓显得出奇地空荡。
mächtig|adj|强大的；有权势的|Der Verband ist politisch mächtig und gut organisiert.|这个协会政治影响力强，组织也很完善。
anstellen|v|雇用；排队；做出|Das Unternehmen will im Herbst zehn Fachkräfte anstellen.|公司计划在秋季雇用十名专业人员。
beteiligt|adj|参与的；牵涉其中的|Alle beteiligten Parteien stimmten dem Kompromiss zu.|所有参与方都同意了这项折中方案。
durchsuchen|v|搜查；检索|Die Forschenden durchsuchten das Archiv nach alten Berichten.|研究人员在档案馆里查找旧报告。
räumen|v|清空；整理；腾出|Wegen des Alarms mussten alle das Gebäude räumen.|由于警报响起，所有人都必须撤离大楼。
ausreden|v|劝阻；把话说完|Niemand konnte sie von ihrem Plan ausreden.|谁也没能劝她放弃这个计划。
die DNA|nf|脱氧核糖核酸；遗传物质|Eine DNA-Analyse kann biologische Verwandtschaft nachweisen.|DNA分析可以证明生物学上的亲缘关系。
verabredet|adj|约好的；商定的|Wir trafen uns zur verabredeten Zeit vor dem Bahnhof.|我们在约定的时间于火车站前见面。
der Leib|nm|身体；躯体|Die Wanderung verlangte ihm viel Kraft ab, doch er war mit Leib und Seele dabei.|徒步旅行很耗体力，但他全身心地投入其中。
die Lieferung|nf|交付；送货；一批货|Die Lieferung verspätet sich wegen des schlechten Wetters.|由于天气恶劣，货物将延迟送达。
das Öl|nn|油；石油|Das Land will seine Abhängigkeit von Öl verringern.|该国希望减少对石油的依赖。
das Versehen|nn|疏忽；无心之失|Ich habe die Datei aus Versehen gelöscht.|我不小心删除了这个文件。
versehen|v|配备；加上；履行|Alle Produkte sind mit einem Prüfzeichen versehen.|所有产品都带有检验标志。
treu|adj|忠实的；忠诚的|Sie blieb ihren Grundsätzen auch unter Druck treu.|即使面临压力，她仍忠于自己的原则。
proben|v|排练；试演|Das Ensemble probt seit Wochen für die Premiere.|剧团已经为首演排练了数周。
wecken|v|叫醒；唤起|Der Vortrag weckte mein Interesse an dem Thema.|这场讲座激起了我对这个主题的兴趣。
das Bewusstsein|nn|意识；认识|Die Kampagne stärkt das Bewusstsein für nachhaltigen Konsum.|这项宣传活动增强了人们对可持续消费的认识。
kontrolliert|adj|受控的；克制的|Die Reaktion verlief unter kontrollierten Bedingungen.|反应在受控条件下进行。
der Treffer|nm|命中；进球；搜索结果|Die Suchmaschine lieferte mehr als tausend Treffer.|搜索引擎返回了一千多条结果。
die Ausrüstung|nf|装备；设备|Für die Expedition benötigen wir eine zuverlässige Ausrüstung.|这次考察需要可靠的装备。
der Segen|nm|祝福；福音；益处|Die neue Bahnverbindung ist ein Segen für die Region.|新的铁路连接对该地区来说是一大福音。
die Ladung|nf|货物；装载量；电荷|Die Ladung des Lastwagens wurde sorgfältig gesichert.|卡车上的货物被仔细固定好了。
das Kapitel|nn|章节；篇章|Das letzte Kapitel fasst die wichtigsten Ergebnisse zusammen.|最后一章总结了最重要的结果。
das Camp|nn|营地；训练营|Die Jugendlichen verbrachten zwei Wochen in einem internationalen Camp.|青少年们在一个国际营地度过了两周。
orten|v|定位；探测|Das Rettungsteam konnte das vermisste Boot schnell orten.|救援队很快定位到了失踪船只。
die Zone|nf|区域；地带|Im Zentrum wurde eine verkehrsberuhigte Zone eingerichtet.|市中心设立了交通缓行区。
das Raumschiff|nn|宇宙飞船；航天器|Das Raumschiff erreichte nach sechs Monaten den Mars.|宇宙飞船在六个月后抵达火星。
die Hauptsache|nf|主要的事；关键|Die Hauptsache ist, dass niemand verletzt wurde.|最重要的是没有人受伤。
die Strecke|nf|路程；线路；区段|Wegen Bauarbeiten ist die Strecke vorübergehend gesperrt.|由于施工，这一路段暂时封闭。
hilfreich|adj|有帮助的；有益的|Ihre Hinweise waren für die Überarbeitung sehr hilfreich.|她的建议对修改工作很有帮助。
geklärt|adj|已澄清的；已解决的|Nach dem Gespräch waren alle offenen Fragen geklärt.|谈话结束后，所有未决问题都澄清了。
die Rettung|nf|救援；挽救|Die schnelle Rettung verdankte er aufmerksamen Passanten.|他获救及时，多亏了细心的路人。
die Gegenwart|nf|现在；当代；在场|Der Roman verbindet die Vergangenheit mit der Gegenwart.|这部小说把过去与当下联系起来。
das Missverständnis|nn|误解；误会|Ein kurzes Gespräch räumte das Missverständnis aus.|一次简短的谈话消除了误会。
die Dicke|nf|厚度；粗细|Die Dicke des Materials beeinflusst seine Stabilität.|材料的厚度会影响其稳定性。
gewünscht|adj|想要的；期望的|Die Maßnahme brachte nicht den gewünschten Erfolg.|这项措施没有取得预期效果。
das Tagebuch|nn|日记|In ihrem Tagebuch hielt sie die wichtigsten Beobachtungen fest.|她在日记中记录了最重要的观察。
das Jenseits|nn|来世；彼岸|Viele Religionen haben unterschiedliche Vorstellungen vom Jenseits.|许多宗教对来世有不同的设想。
das Bedenken|nn|顾虑；疑虑|Trotz anfänglicher Bedenken stimmte er dem Vorschlag zu.|尽管起初有顾虑，他还是同意了这个建议。
bedenken|v|考虑；顾及|Bei der Planung müssen wir die langfristigen Folgen bedenken.|规划时，我们必须考虑长期后果。
die Tiefe|nf|深度；深处|Die Tiefe des Sees wurde mit einem Messgerät bestimmt.|人们用测量仪器测定了湖的深度。
die Tara|nf|皮重|Vom Gesamtgewicht muss noch die Tara abgezogen werden.|总重量还需要扣除皮重。
mies|adj|糟糕的；卑劣的|Das Wetter war mies, trotzdem fand die Veranstaltung statt.|天气很糟，但活动还是举行了。
vertragen|v|忍受；相处；承受|Dieses Material verträgt hohe Temperaturen.|这种材料能够承受高温。
mitteilen|v|通知；告知|Bitte teilen Sie uns Ihre Entscheidung schriftlich mit.|请以书面形式告知我们您的决定。
überwachen|v|监控；监督|Sensoren überwachen ständig die Luftqualität.|传感器持续监测空气质量。
das Verständnis|nn|理解；体谅|Vielen Dank für Ihr Verständnis und Ihre Geduld.|感谢您的理解与耐心。
einsetzen|v|使用；投入；开始|Die Feuerwehr setzte spezielle Geräte ein.|消防队使用了专用设备。
heftig|adj|猛烈的；激烈的|Über den Vorschlag wurde heftig diskutiert.|人们围绕这项建议展开了激烈讨论。
gesichert|adj|有保障的；已固定的|Die Finanzierung des Projekts ist bis 2028 gesichert.|项目资金已经保障到2028年。
der Block|nm|块；街区；记事本|Der gesamte Häuserblock wird energetisch saniert.|整个街区将进行节能改造。
das Geständnis|nn|供认；坦白|Sein Geständnis brachte neue Klarheit in den Fall.|他的供述使案情有了新的进展。
faszinierend|adj|迷人的；引人入胜的|Die Ausstellung vermittelt einen faszinierenden Einblick in die Forschung.|展览让人深入领略这项研究的魅力。
der Verkehr|nm|交通；往来|Der öffentliche Verkehr soll weiter ausgebaut werden.|公共交通将进一步扩建。
die Ebene|nf|层面；平面；平原|Das Problem muss auf politischer Ebene gelöst werden.|这个问题必须在政治层面解决。
herrlich|adj|极好的；壮丽的|Vom Gipfel hatten wir eine herrliche Aussicht.|我们从山顶看到了壮丽的景色。
täuschen|v|欺骗；使产生错觉|Der erste Eindruck kann täuschen.|第一印象可能会骗人。
der Abschied|nm|告别；离别|Der Abschied von den Kollegen fiel ihr schwer.|她很舍不得与同事们告别。
bewusstlos|adj|失去知觉的|Der Verletzte war kurz bewusstlos, erholte sich aber schnell.|伤者短暂失去知觉，但很快恢复了。
der Gesang|nm|歌唱；歌声|Der mehrstimmige Gesang erfüllte den ganzen Saal.|多声部的歌声充满了整个大厅。
das Vorhaben|nn|计划；项目|Das ehrgeizige Vorhaben benötigt breite politische Unterstützung.|这项雄心勃勃的计划需要广泛的政治支持。
vorhaben|v|打算；计划|Was hast du nach dem Abschluss vor?|毕业后你有什么打算？
verzichten|v|放弃；不使用|Viele Haushalte wollen künftig auf Plastikverpackungen verzichten.|许多家庭今后希望不再使用塑料包装。
das Drehbuch|nn|剧本|Das Drehbuch wurde vor Beginn der Dreharbeiten mehrfach überarbeitet.|剧本在开拍前被多次修改。
geladen|adj|充电的；装载的；紧张的|Die Stimmung im Sitzungssaal war äußerst geladen.|会议厅里的气氛极其紧张。
der Wächter|nm|守卫；看守人|Ein Wächter kontrollierte den Zugang zum Gebäude.|一名守卫检查了大楼入口。
das Symbol|nn|象征；符号|Die Taube gilt in vielen Kulturen als Symbol des Friedens.|鸽子在许多文化中被视为和平的象征。
die Aktion|nf|行动；活动|Die Aktion sammelte Spenden für ein Bildungsprojekt.|这次活动为一个教育项目募集了捐款。
übertrieben|adj|夸张的；过度的|Die Sorge ist verständlich, aber etwas übertrieben.|这种担忧可以理解，但有些夸张。
krass|adj|强烈的；极端的；明显的|Zwischen den beiden Regionen bestehen krasse Unterschiede.|两个地区之间存在明显差异。
die Staffel|nf|接力队；季度；梯队|Die letzte Folge der neuen Staffel läuft am Sonntag.|新一季的最后一集将于周日播出。
stammen|v|来自；源自|Die Daten stammen aus einer unabhängigen Studie.|这些数据来自一项独立研究。
das Versagen|nn|失败；失灵|Technisches Versagen war die Ursache des Ausfalls.|技术故障是停运的原因。
der Akzent|nm|口音；重音；重点|Man hört an seinem Akzent, dass er aus Österreich kommt.|从他的口音可以听出他来自奥地利。
die Truppe|nf|队伍；团队|Eine kleine Truppe Freiwilliger organisierte das Stadtfest.|一小队志愿者组织了城市庆典。
das Kompliment|nn|赞美；称赞|Sie nahm das ehrliche Kompliment mit einem Lächeln an.|她微笑着接受了真诚的赞美。
flammen|v|燃烧；燃起|Nach dem Signal flammten die Lichter auf der Bühne auf.|信号发出后，舞台上的灯光亮了起来。
der Chip|nm|芯片；筹码|Der neue Chip benötigt deutlich weniger Energie.|新芯片所需的能耗明显更低。
die Loyalität|nf|忠诚；忠实|Gegenseitige Loyalität ist für eine langfristige Zusammenarbeit wichtig.|相互忠诚对长期合作很重要。
das Dankeschön|nn|谢意；感谢的话或礼物|Als Dankeschön lud sie das ganze Team zum Essen ein.|她请整个团队吃饭，以此表达谢意。
vertreten|v|代表；代理；主张|Die Ministerin vertritt eine klare Position zu diesem Thema.|部长对这个问题持明确立场。
füllen|v|装满；填写；填补|Bitte füllen Sie das Formular vollständig aus.|请完整填写这份表格。
befohlen|adj|被命令的；奉命的|Die befohlene Maßnahme wurde sofort umgesetzt.|接到命令后，这项措施立即得到执行。
der Herzinfarkt|nm|心肌梗死|Schnelle medizinische Hilfe kann bei einem Herzinfarkt Leben retten.|心肌梗死发生时，及时救治可以挽救生命。
die Front|nf|前线；阵线；正面|An der Wetterfront ist zunächst keine Änderung zu erwarten.|天气形势暂时不会发生变化。
das Verderben|nn|毁灭；灾祸|Kurzfristiges Denken kann einem Unternehmen zum Verderben werden.|只顾眼前可能会给企业带来灾难。
verderben|v|弄坏；使变质；破坏|Zu viel Hitze kann empfindliche Lebensmittel verderben.|温度过高会使易腐食品变质。
der Zugriff|nm|访问；获取；控制|Nur autorisierte Personen haben Zugriff auf diese Daten.|只有获得授权的人才能访问这些数据。
durchgehen|v|逐项检查；通过；逃走|Wir sollten den Vertrag vor der Unterschrift noch einmal durchgehen.|签字前，我们应该再逐条检查一遍合同。
eingeschlossen|adj|包括在内的；被围住的|Frühstück und WLAN sind im Preis eingeschlossen.|房价中包含早餐和无线网络。
das Zentrum|nn|中心；核心|Das Forschungszentrum arbeitet eng mit mehreren Hochschulen zusammen.|该研究中心与多所高校密切合作。
das Gelände|nn|场地；地形|Das gesamte Gelände ist mit öffentlichen Verkehrsmitteln erreichbar.|整个场地都可以乘坐公共交通到达。
der Regisseur|nm|导演|Der Regisseur erläuterte seine künstlerische Entscheidung.|导演解释了自己的艺术决定。
der Bestand|nm|存量；库存；存在|Der Bestand an bezahlbaren Wohnungen ist stark gesunken.|可负担住房的存量大幅下降。
weggelaufen|adj|跑掉的；出走的|Die Polizei fand den weggelaufenen Jungen am Bahnhof.|警方在火车站找到了离家出走的男孩。
das Bargeld|nn|现金|Immer mehr Geschäfte akzeptieren sowohl Karten als auch Bargeld.|越来越多的商店既接受刷卡，也接受现金。
die Avenue|nf|林荫大道；大街|Entlang der Avenue wurden neue Bäume gepflanzt.|人们沿着林荫大道种下了新树。
brillant|adj|杰出的；精彩的；璀璨的|Sie hielt einen brillanten Vortrag über künstliche Intelligenz.|她做了一场关于人工智能的精彩报告。
der Brillant|nm|钻石；圆形切割钻石|Der Brillant wurde von einer Fachfrau begutachtet.|那颗钻石由专业人士进行了鉴定。
der Trost|nm|安慰；慰藉|Die Unterstützung seiner Freunde war ihm ein großer Trost.|朋友们的支持给了他很大安慰。
gehasst|adj|被憎恨的；令人厌恶的|Die einst gehasste Regelung wird inzwischen differenzierter beurteilt.|那项曾经备受厌恶的规定，如今得到了更为客观的评价。
ekelhaft|adj|令人恶心的；恶劣的|Im Keller breitete sich ein ekelhafter Geruch aus.|地下室里散发出一股令人恶心的气味。
die Schicht|nf|层；班次；社会阶层|Die obere Schicht des Bodens enthält besonders viele Nährstoffe.|土壤表层含有特别丰富的养分。
die Vernunft|nf|理性；理智|Am Ende siegte die Vernunft über den Ärger.|最终，理智战胜了愤怒。
die Scheune|nf|谷仓；农舍|Die alte Scheune wurde zu einem Veranstaltungsraum umgebaut.|旧谷仓被改造成了活动场所。
der Zettel|nm|纸条；单据|Auf dem Zettel standen alle wichtigen Telefonnummern.|纸条上写着所有重要电话号码。
fabelhaft|adj|极好的；出色的|Die neue Übersetzung ist sprachlich fabelhaft gelungen.|新译本在语言表达上完成得非常出色。
das Beileid|nn|哀悼；慰问|Wir möchten der Familie unser aufrichtiges Beileid aussprechen.|我们谨向家属表示诚挚慰问。
die Unschuld|nf|无辜；清白|Neue Beweise bestätigten schließlich seine Unschuld.|新证据最终证明了他的清白。
stoßen|v|推；碰；撞；遇到|Bei der Recherche stießen wir auf widersprüchliche Angaben.|调查过程中，我们遇到了相互矛盾的说法。
gestatten|v|允许；准许|Die Vorschriften gestatten keine Ausnahme in diesem Fall.|相关规定不允许在这种情况下破例。
das Hauptquartier|nn|总部；司令部|Das Unternehmen verlegt sein Hauptquartier in die Hauptstadt.|公司将把总部迁往首都。
geschieden|adj|离婚的|Auch nach der Scheidung blieben die beiden Eltern in engem Kontakt.|离婚后，两位家长仍保持密切联系。
der Sieger|nm|获胜者；冠军|Der Sieger des Wettbewerbs erhält ein Forschungsstipendium.|比赛获胜者将获得研究奖学金。
quietschen|v|发出吱嘎声；尖声响|Die alten Bremsen quietschen bei jeder Kurve.|旧刹车在每个弯道都会发出吱嘎声。
die Krankenstation|nf|医务室；病房|Die Patientin blieb eine Nacht auf der Krankenstation.|患者在病房里住了一晚。
die Leine|nf|绳；牵引绳；晾衣绳|Im Naturschutzgebiet müssen Hunde an der Leine bleiben.|在自然保护区内，狗必须系上牵引绳。
der Sauerstoff|nm|氧气；氧元素|Mit zunehmender Höhe wird der Sauerstoff in der Luft knapper.|海拔越高，空气中的氧气越稀薄。
das Kloster|nn|修道院|Das ehemalige Kloster beherbergt heute eine Bibliothek.|昔日的修道院如今是一座图书馆。
der Anlass|nm|原因；契机；场合|Der Jahrestag war ein guter Anlass für eine öffentliche Debatte.|周年纪念日为公开讨论提供了很好的契机。
die Tarnung|nf|伪装；掩护|Die weiße Fellfarbe dient dem Tier im Winter als Tarnung.|白色皮毛是这种动物冬季的保护色。
das Auftreten|nn|举止；出现；亮相|Sein ruhiges Auftreten überzeugte auch kritische Zuhörer.|他沉稳的举止也说服了持批评态度的听众。
auftreten|v|出现；登台；表现|Nebenwirkungen können bereits nach wenigen Stunden auftreten.|副作用可能在几小时后出现。
der Akt|nm|行为；幕；法令|Das Theaterstück besteht aus drei Akten.|这部戏剧由三幕组成。
die Frisur|nf|发型|Die neue Frisur lässt sie deutlich jünger wirken.|新发型让她显得年轻了许多。
der Spruch|nm|格言；说法；判词|Der alte Spruch hat bis heute nichts von seiner Bedeutung verloren.|这句古老格言至今仍未失去意义。
die Spezies|nf|物种；种类|Diese Spezies kommt nur in wenigen Küstenregionen vor.|这个物种只出现在少数沿海地区。
das Eigentum|nn|所有权；财产|Geistiges Eigentum ist ebenfalls gesetzlich geschützt.|知识产权同样受到法律保护。
der Gegensatz|nm|对立；反差|Im Gegensatz zum Vorjahr ist der Energieverbrauch gesunken.|与上一年相比，能源消耗下降了。
der Zwang|nm|强迫；压力；约束|Unter Zwang kann keine freie Entscheidung entstehen.|在强迫之下不可能作出自由决定。
vereint|adj|联合的；团结的|Die vereinten Kräfte reichten aus, um das Problem zu lösen.|各方合力足以解决这个问题。
durchziehen|v|贯彻到底；穿过；坚持完成|Das Team will die Reform trotz aller Widerstände durchziehen.|尽管阻力重重，团队仍想把改革坚持到底。
die Jury|nf|评审团；陪审团|Eine unabhängige Jury wählte den besten Entwurf aus.|独立评审团选出了最佳方案。
ausgedacht|adj|想出来的；虚构的|Die Geschichte ist frei ausgedacht, wirkt aber glaubwürdig.|这个故事完全是虚构的，但听起来很可信。
die Feige|nf|无花果|Getrocknete Feigen enthalten besonders viel Zucker.|无花果干含糖量特别高。
die Bewährung|nf|考验；试用；缓刑|Das neue Verfahren muss sich erst in der Praxis bewähren.|新方法还需要在实践中经受检验。
der Berater|nm|顾问；咨询师|Ein unabhängiger Berater prüfte die Finanzierung.|一名独立顾问审核了融资方案。
locken|v|吸引；引诱|Niedrige Preise locken viele Kundinnen und Kunden an.|低价吸引了许多顾客。
der Lautsprecher|nm|扬声器；音箱|Die Durchsage war über die Lautsprecher kaum zu verstehen.|广播通过扬声器几乎听不清。
umwerfend|adj|令人惊艳的；极好的|Die Aussicht von der Terrasse ist wirklich umwerfend.|从露台望出去的景色确实令人惊艳。
die Kanzlei|nf|律师事务所；办事机构|Die Kanzlei ist auf internationales Wirtschaftsrecht spezialisiert.|这家律师事务所专门处理国际经济法。
das Timing|nn|时机；时间安排|Für eine erfolgreiche Einführung ist das richtige Timing entscheidend.|要成功推出项目，恰当的时机至关重要。
ungut|adj|不好的；令人不安的|Bei dieser Entwicklung habe ich ein ungutes Gefühl.|这种发展趋势让我感到不安。
organisiert|adj|有组织的；安排妥当的|Die Konferenz war professionell organisiert.|这场会议组织得很专业。
die Episode|nf|一段经历；一集；插曲|Der Zwischenfall blieb eine kurze Episode ohne weitere Folgen.|这次事件只是一段短暂插曲，没有带来后续影响。
verschaffen|v|使获得；提供|Die neue Regelung verschafft kleinen Betrieben mehr Spielraum.|新规定为小企业提供了更大的空间。
zielen|v|瞄准；旨在|Die Maßnahmen zielen auf eine dauerhafte Senkung der Emissionen.|这些措施旨在长期降低排放。
der Premierminister|nm|总理；首相|Der Premierminister stellte das neue Kabinett vor.|首相介绍了新内阁。
der Jubel|nm|欢呼；喜悦|Nach der Bekanntgabe brach im Saal großer Jubel aus.|结果公布后，会场里响起热烈欢呼。
präsentieren|v|展示；介绍|Die Arbeitsgruppe präsentiert morgen ihre Ergebnisse.|工作组明天将介绍研究结果。
vergangen|adj|过去的；消逝的|Im vergangenen Jahr hat sich die Lage deutlich verbessert.|过去一年里，情况明显改善。
einsperren|v|关起来；锁住|Wertvolle Dokumente wurden in einem sicheren Raum eingesperrt.|贵重文件被锁在一间安全的房间里。
widerstehen|v|抵抗；经受住|Das Material muss hoher Feuchtigkeit widerstehen.|这种材料必须能够抵御高湿度。
die Notaufnahme|nf|急诊科|Nach dem Sturz wurde sie sofort in die Notaufnahme gebracht.|摔倒后，她立即被送往急诊科。
ermitteln|v|调查；查明；计算|Die Fachleute ermittelten die Ursache des technischen Fehlers.|专家查明了技术故障的原因。
sämtliche|adj|全部的；所有的|Sämtliche Unterlagen müssen bis Freitag eingereicht werden.|所有材料必须在周五前提交。
harmlos|adj|无害的；不严重的|Die Beschwerden erwiesen sich zum Glück als harmlos.|幸运的是，这些症状后来证明并不严重。
die Ermittlung|nf|调查；侦查；测定|Die Ermittlung des genauen Bedarfs dauerte mehrere Wochen.|准确测定需求花了数周时间。
der Rasen|nm|草坪|Bei Trockenheit darf der Rasen nur sparsam bewässert werden.|干旱时只能少量给草坪浇水。
rasen|v|飞驰；狂奔|Auf dieser schmalen Straße darf niemand rasen.|任何人都不得在这条窄路上飞驰。
der Reiter|nm|骑手；选项卡|Die gesuchte Einstellung finden Sie unter dem Reiter „Datenschutz“.|您可以在“数据保护”选项卡下找到所需设置。
empfinden|v|感到；认为|Viele Beschäftigte empfinden die neue Regelung als fair.|许多员工认为新规定是公平的。
hupen|v|按喇叭；鸣笛|Vor dem Krankenhaus ist unnötiges Hupen verboten.|医院前禁止无故鸣笛。
ausdrücken|v|表达；挤出；打印|Sie konnte ihre Kritik sachlich und präzise ausdrücken.|她能够客观而准确地表达批评意见。
die Einrichtung|nf|机构；设施；布置|Die soziale Einrichtung berät Familien kostenlos.|这家社会机构为家庭提供免费咨询。
verdächtig|adj|可疑的；涉嫌的|Die ungewöhnliche Buchung kam der Prüferin verdächtig vor.|这笔异常账目让审计员觉得可疑。
aufgebracht|adj|愤怒的；激动的|Die Anwohner waren über den nächtlichen Lärm aufgebracht.|居民们对夜间噪声感到愤怒。
gelungen|adj|成功的；出色的|Die Ausstellung ist eine gelungene Verbindung von Kunst und Technik.|这场展览成功地结合了艺术与技术。
der Notruf|nm|紧急呼叫；报警电话|Über den Notruf erreichte die Meldung sofort die Leitstelle.|报警信息通过紧急电话立即传到了调度中心。
der Riss|nm|裂缝；裂口|Im Fundament wurde ein feiner Riss entdeckt.|地基中发现了一条细小裂缝。
bremsen|v|刹车；抑制|Hohe Energiekosten bremsen die wirtschaftliche Erholung.|高昂的能源成本阻碍了经济复苏。
aktivieren|v|激活；启动|Sie müssen das Konto über den Link in der E-Mail aktivieren.|您需要通过邮件中的链接激活账户。
der Lkw|nm|卡车；载重汽车|Der Lkw transportierte medizinische Geräte ins Krisengebiet.|卡车把医疗设备运往受灾地区。
unfassbar|adj|难以置信的；无法理解的|Die Geschwindigkeit der Veränderung ist beinahe unfassbar.|变化的速度几乎令人难以置信。
wehren|v|抵抗；自卫|Die Gemeinde wehrt sich gegen die Schließung der Bibliothek.|该市镇反对关闭图书馆。
die Platte|nf|板；唱片；硬盘|Die historischen Aufnahmen wurden von der alten Platte digitalisiert.|这些历史录音是从旧唱片上数字化的。
die Anlage|nf|设备；设施；附件；投资|Die neue Anlage erzeugt Strom aus Biomasse.|新设备利用生物质发电。
der Trip|nm|旅行；短途出行|Der berufliche Trip nach Brüssel dauerte nur zwei Tage.|去布鲁塞尔的公务短途出行只持续了两天。
die Schneide|nf|刀刃；锋口|Die Schneide des Werkzeugs muss regelmäßig geschärft werden.|工具的刀刃需要定期打磨。
die Reichweite|nf|覆盖范围；影响范围；续航里程|Das Elektroauto hat eine Reichweite von etwa fünfhundert Kilometern.|这辆电动汽车的续航里程约为五百公里。
der Coach|nm|教练；指导顾问|Der Coach half dem Team, klare Ziele zu formulieren.|教练帮助团队制定了明确目标。
sachte|adj|轻柔的；缓慢的|Mit einer sachten Bewegung öffnete sie die alte Schublade.|她轻轻地打开了旧抽屉。
geliefert|adj|已交付的；送达的|Die gelieferten Geräte entsprechen den vereinbarten Anforderungen.|交付的设备符合约定要求。
nebenbei|adj|顺便的；兼职的|Nebenbei betreibt er einen kleinen Übersetzungsdienst.|他还兼职经营一家小型翻译服务。
top|adj|一流的；极好的|Die technische Ausstattung des Labors ist top.|实验室的技术设备是一流的。
das Top|nn|上衣；吊带衫|Das schlichte Top lässt sich gut mit einer Jacke kombinieren.|这件简洁的上衣很适合搭配外套。
der Kratzer|nm|划痕；抓痕|Auf dem Bildschirm ist nur ein kleiner Kratzer zu sehen.|屏幕上只有一道小划痕。
der Rückzug|nm|撤回；退出；退隐|Nach heftiger Kritik kündigte er seinen Rückzug aus dem Vorstand an.|遭到强烈批评后，他宣布退出董事会。
die Bude|nf|小屋；简陋住所；摊位|Auf dem Markt bietet eine kleine Bude regionale Spezialitäten an.|市场上的一个小摊售卖当地特色食品。
das Metall|nn|金属|Das Metall wird bei hohen Temperaturen verarbeitet.|这种金属在高温下加工。
nüchtern|adj|清醒的；客观的；空腹的|Der Bericht analysiert die Lage nüchtern und ohne Übertreibung.|报告客观分析了形势，没有夸大其词。
arrangiert|adj|安排好的；编排的|Das Stück wurde eigens für ein kleines Ensemble arrangiert.|这首作品专门为小型乐团进行了编曲。
die Ranch|nf|大牧场|Die Ranch stellt schrittweise auf ökologische Landwirtschaft um.|这座大牧场正逐步转向生态农业。
das Gerücht|nn|传闻；谣言|Das Unternehmen dementierte das Gerücht umgehend.|公司立即否认了这则传闻。
zurückziehen|v|撤回；退出；退回|Die Firma zog das fehlerhafte Produkt vom Markt zurück.|公司将有缺陷的产品撤出了市场。
der Sonnenuntergang|nm|日落|Vom Hügel aus beobachteten wir einen beeindruckenden Sonnenuntergang.|我们从山丘上欣赏了壮观的日落。
die Agentur|nf|机构；代理公司|Eine unabhängige Agentur betreut die Öffentlichkeitsarbeit.|一家独立机构负责公关工作。
die Route|nf|路线；航线|Die neue Route verkürzt die Fahrzeit um zwanzig Minuten.|新路线将车程缩短了二十分钟。
belästigen|v|骚扰；打扰|Unerwünschte Werbung darf Verbraucher nicht belästigen.|不受欢迎的广告不得骚扰消费者。
der Sektor|nm|部门；行业；区域|Im öffentlichen Sektor fehlen zunehmend Fachkräfte.|公共部门越来越缺乏专业人才。
blockiert|adj|被阻塞的；受阻的|Wegen eines Unfalls war die Zufahrt mehrere Stunden blockiert.|由于发生事故，入口被堵了数小时。
vorübergehend|adj|暂时的；临时的|Die Bibliothek bleibt wegen Renovierungsarbeiten vorübergehend geschlossen.|图书馆因装修暂时关闭。
gebunden|adj|受约束的；装订的；固定的|Die Förderung ist an klare Bedingungen gebunden.|资助与明确条件挂钩。
die Verhaftung|nf|逮捕|Die Verhaftung erfolgte nach monatelangen Ermittlungen.|经过数月调查后，警方实施了逮捕。
die Meldung|nf|消息；报告；申报|Die überraschende Meldung löste zahlreiche Rückfragen aus.|这则意外消息引发了大量追问。
der Eid|nm|誓言；宣誓|Vor Gericht legte die Zeugin einen Eid ab.|证人在法庭上宣了誓。
der Babysitter|nm|临时保姆|Für den Abend hatten die Eltern einen erfahrenen Babysitter organisiert.|父母为当晚请了一位有经验的临时保姆。
abschalten|v|关闭；放松|Nach der Arbeit kann sie beim Spaziergang gut abschalten.|下班后，她可以通过散步很好地放松下来。
das Bedauern|nn|遗憾；惋惜|Zu unserem Bedauern muss die Veranstaltung ausfallen.|很遗憾，这项活动不得不取消。
bedauern|v|后悔；遗憾|Wir bedauern die Verzögerung und bitten um Verständnis.|我们对延误表示遗憾，并请您谅解。
sperren|v|封锁；锁定；暂停使用|Die Bank sperrte die Karte nach dem Verlust sofort.|银行卡丢失后，银行立即将其锁定。
zurücklassen|v|留下；遗留|Die Reform wird deutliche Spuren im Bildungssystem zurücklassen.|这项改革将在教育体系中留下明显印记。
das Quartier|nn|住处；驻地；街区|Die Forschenden bezogen für drei Monate ein Quartier in der Region.|研究人员在该地区住了三个月。
zugelassen|adj|获准的；注册的|Für die Prüfung sind nur zugelassene Hilfsmittel erlaubt.|考试只能使用获准的辅助工具。
der Transport|nm|运输；运送|Der Transport empfindlicher Geräte erfordert besondere Sorgfalt.|运输精密设备需要格外小心。
der Streich|nm|恶作剧；一击|Der harmlose Streich sorgte zunächst für Verwirrung.|这个无伤大雅的恶作剧起初引起了一阵困惑。
der Reif|nm|霜；白霜|Am Morgen lag Reif auf den Wiesen.|清晨，草地上覆盖着白霜。
antreten|v|开始；参加；就任|Drei Kandidatinnen treten bei der Wahl gegeneinander an.|三名候选人将在选举中展开竞争。
der Vorstand|nm|董事会；理事会|Der Vorstand stimmte dem langfristigen Investitionsplan zu.|董事会同意了长期投资计划。
unterbrochen|adj|中断的；断断续续的|Nach einer kurzen Unterbrechung wurde die Sitzung fortgesetzt.|短暂中断后，会议继续进行。
spannend|adj|令人兴奋的；引人入胜的|Die Studie liefert spannende Einblicke in das Lernverhalten.|这项研究对学习行为提出了有趣见解。
die Division|nf|除法；部门；师级单位|Die Division gehört zu den vier Grundrechenarten.|除法属于四则运算之一。
die Werft|nf|造船厂|Die Werft baut Schiffe mit emissionsarmen Antrieben.|这家造船厂建造采用低排放动力的船舶。
die Option|nf|选择；选项|Eine spätere Verlängerung bleibt eine realistische Option.|今后延长仍是一个现实选择。
der Anhänger|nm|支持者；挂车；吊坠|Der Vorschlag fand sowohl Anhänger als auch Kritiker.|这项建议既有支持者，也有批评者。
das Vorkommen|nn|存在；蕴藏；出现|In der Region gibt es ein bedeutendes Vorkommen seltener Mineralien.|该地区蕴藏着重要的稀有矿产。
vorkommen|v|发生；出现；给人印象|Solche Fehler können auch bei sorgfältiger Arbeit vorkommen.|即使工作认真，这类错误也可能发生。
die Autopsie|nf|尸检；解剖检查|Die Autopsie klärte die medizinische Ursache eindeutig.|尸检明确查清了医学原因。
die Einsamkeit|nf|孤独；寂寞|Soziale Kontakte können Einsamkeit im Alter verringern.|社会交往可以减少老年人的孤独感。
beseitigen|v|消除；清除|Die Stadt will bauliche Hindernisse schrittweise beseitigen.|市政府希望逐步消除建筑障碍。
gesperrt|adj|封闭的；被锁定的|Das Benutzerkonto bleibt bis zur Überprüfung gesperrt.|用户账户在核验完成前仍会保持锁定。
ersparen|v|使免受；省去|Eine klare Anleitung erspart uns unnötige Rückfragen.|明确的说明可以省去不必要的追问。
frech|adj|无礼的；放肆的；俏皮的|Seine freche Bemerkung kam bei den Gästen nicht gut an.|他那句无礼的话让客人们很不舒服。
gefährden|v|危及；使面临风险|Kurzfristige Kürzungen gefährden den Erfolg des gesamten Programms.|短期削减经费会危及整个项目的成功。
urteilen|v|判断；评判；判决|Man sollte nicht urteilen, bevor alle Fakten bekannt sind.|在了解全部事实之前，不应轻易下判断。
die Partnerin|nf|伴侣；搭档；合作方|Die Partnerin des Projekts übernimmt die technische Beratung.|项目合作方负责技术咨询。
die Anhörung|nf|听证会；听取意见|Vor der Entscheidung findet eine öffentliche Anhörung statt.|作出决定前将举行公开听证会。
das Ruder|nn|舵；桨；领导权|Nach der Krise übernahm eine neue Geschäftsführung das Ruder.|危机过后，新的管理层接掌了公司。
befolgen|v|遵守；依照|Alle Beschäftigten müssen die Sicherheitsvorschriften befolgen.|所有员工都必须遵守安全规定。
überraschend|adj|令人意外的；出人意料的|Die Studie kam zu einem überraschend eindeutigen Ergebnis.|这项研究得出了出人意料的明确结论。
das Funkgerät|nn|无线电对讲机|Die Einsatzkräfte blieben über Funkgeräte miteinander verbunden.|应急人员通过对讲机保持联系。
der Orden|nm|勋章；修会|Für sein langjähriges Engagement erhielt er einen hohen Orden.|他因多年投入公益事业而获得高级勋章。
die UN|nf|联合国|Die UN fordert eine stärkere internationale Zusammenarbeit.|联合国呼吁加强国际合作。
betten|v|安置；嵌入|Die neue Bahntrasse soll möglichst schonend in die Landschaft gebettet werden.|新铁路线路应尽可能以不破坏景观的方式融入环境。
vermuten|v|推测；猜想|Die Forschenden vermuten einen Zusammenhang zwischen beiden Faktoren.|研究人员推测这两个因素之间存在关联。
der Geheimdienst|nm|情报机构|Ein parlamentarischer Ausschuss kontrolliert den Geheimdienst.|议会委员会对情报机构进行监督。
der Wuchs|nm|生长；身材；长势|Der Wuchs der Pflanzen hängt stark vom Boden ab.|植物的长势在很大程度上取决于土壤。
binden|v|绑；约束；装订|Der Vertrag bindet beide Seiten für fünf Jahre.|合同对双方都有五年约束力。
die Sammlung|nf|收藏；汇集；合集|Das Museum zeigt eine umfangreiche Sammlung moderner Fotografie.|博物馆展出一批丰富的现代摄影藏品。
die Kürze|nf|简短；短暂|In der Kürze liegt oft die Stärke einer guten Erklärung.|好的解释往往贵在简洁。
erbärmlich|adj|可怜的；糟糕的|Die Arbeitsbedingungen in der Werkstatt waren erbärmlich.|工坊里的工作条件十分糟糕。
durchmachen|v|经历；熬过|Die Branche hat in wenigen Jahren einen tiefen Wandel durchgemacht.|这个行业在短短几年里经历了深刻变化。
ausgebildet|adj|受过培训的；训练有素的|Für diese Aufgabe werden speziell ausgebildete Fachkräfte gebraucht.|这项任务需要经过专门培训的专业人员。
ausgezogen|adj|搬出的；脱下的|Die ausgezogenen Mieter hinterließen die Wohnung in gutem Zustand.|搬走的租客把公寓保持得很好。
der Flecken|nm|污点；斑点；小地方|Der Flecken auf dem Teppich ließ sich vollständig entfernen.|地毯上的污渍被完全清除了。
die Diagnose|nf|诊断；分析判断|Eine frühe Diagnose verbessert die Behandlungsmöglichkeiten.|早期诊断可以改善治疗机会。
das Vorbild|nn|榜样；范例|Die Stadt gilt als Vorbild für nachhaltige Mobilität.|这座城市被视为可持续交通的典范。
die Kabine|nf|小舱；更衣室；隔间|Die Fahrerkabine bietet einen guten Überblick über die Straße.|驾驶室能让驾驶员清楚观察道路。
mitfahren|v|一同乘车；搭乘|Wer zur Konferenz mitfahren möchte, soll sich bis Montag melden.|想一同乘车去参加会议的人请在周一前报名。
reichlich|adj|充足的；丰富的|Für die Umsetzung steht reichlich Erfahrung zur Verfügung.|项目落实方面有着丰富经验可供借鉴。
krachen|v|发出巨响；猛烈碰撞|Während des Gewitters krachte es mehrmals in der Nähe.|雷雨期间，附近多次响起巨响。
die Ablenkung|nf|分心；干扰；转移|Ständige Benachrichtigungen sind eine erhebliche Ablenkung.|不断弹出的通知会造成严重干扰。
überstehen|v|挺过；经受住|Das Unternehmen hat die schwierige Phase gut überstanden.|公司顺利挺过了困难阶段。
der Schalter|nm|开关；柜台；窗口|Am Schalter erhalten Reisende weitere Informationen.|旅客可以在服务窗口获得更多信息。
die Zuneigung|nf|喜爱；感情|Mit der Zeit entwickelte sie eine tiefe Zuneigung zu der Stadt.|随着时间推移，她对这座城市产生了深厚感情。
piepen|v|发出哔哔声|Das Gerät piept, sobald die Messung beendet ist.|测量结束后，设备会发出提示音。
die Kammer|nf|小室；协会；议院|Die Kammer vertritt die Interessen der regionalen Betriebe.|该协会代表本地区企业的利益。
die Finsternis|nf|黑暗；昏暗|Bei völliger Finsternis war der Weg kaum zu erkennen.|在一片漆黑中，几乎看不清道路。
gelehrt|adj|博学的；学术性的|Die gelehrte Debatte blieb einem kleinen Fachpublikum vorbehalten.|这场学术讨论只面向少数专业听众。
der Transporter|nm|厢式货车；运输车|Ein Transporter brachte die Ausstellungsteile zum Museum.|一辆厢式货车把展品部件运到了博物馆。
abgelenkt|adj|分心的；注意力被转移的|Durch die vielen Meldungen war er ständig abgelenkt.|大量消息让他一直无法集中注意力。
der Abzug|nm|扣除；撤离；抽油烟机|Nach Abzug aller Kosten bleibt nur ein kleiner Gewinn.|扣除全部成本后，只剩下一点利润。
die Anweisung|nf|指示；说明；汇款|Bitte beachten Sie die Anweisungen auf dem Bildschirm.|请遵循屏幕上的说明。
der Sicherheitsdienst|nm|安保服务；安全部门|Der Sicherheitsdienst kontrolliert nachts alle Eingänge.|安保人员夜间会检查所有入口。
kommunizieren|v|沟通；传达|Behörden sollten Entscheidungen klar und frühzeitig kommunizieren.|政府部门应当清晰、及时地传达决定。
der Standort|nm|地点；选址；所在地|Der Standort bietet gute Verkehrsverbindungen und genügend Fläche.|这个选址交通便利，空间也足够。
die Landung|nf|着陆；登陆|Wegen des starken Winds verzögerte sich die Landung.|由于风势强劲，飞机延迟着陆。
die Begleitung|nf|陪同；伴奏；随行人员|Kinder dürfen die Ausstellung nur in Begleitung Erwachsener besuchen.|儿童只有在成人陪同下才能参观展览。
die Allianz|nf|联盟；合作关系|Mehrere Hochschulen bildeten eine Allianz für offene Forschung.|多所高校成立了开放研究联盟。
verkehrt|adj|错误的；颠倒的|Die Zahlen wurden versehentlich in verkehrter Reihenfolge eingetragen.|这些数字不小心按相反顺序录入了。
segeln|v|航行；扬帆|Das Forschungsschiff segelte entlang der norwegischen Küste.|科研船沿挪威海岸航行。
verurteilen|v|判决；谴责|Das Gericht verurteilte das Unternehmen zu einer Geldstrafe.|法院判处该公司缴纳罚款。
die Begegnung|nf|相遇；会面；交锋|Die Begegnung mit der Autorin prägte seinen weiteren Weg.|与那位作家的相遇影响了他之后的人生道路。
der Vertreter|nm|代表；代理人；代销员|Ein Vertreter der Gemeinde nahm an der Sitzung teil.|一名市政府代表参加了会议。
die Marge|nf|利润空间；差额；页边距|Steigende Kosten verringern die Marge des Unternehmens.|成本上升压缩了公司的利润空间。
klarstellen|v|澄清；明确说明|Die Behörde stellte klar, dass keine Daten veröffentlicht wurden.|主管部门澄清说，没有任何数据被公开。
der Helikopter|nm|直升机|Ein Helikopter brachte medizinische Hilfe in das abgelegene Gebiet.|一架直升机把医疗援助送到了偏远地区。
vertraulich|adj|保密的；秘密的|Der Inhalt des Gesprächs bleibt streng vertraulich.|谈话内容将严格保密。
geprüft|adj|经检验的；经过审核的|Das Gerät entspricht den geprüften Sicherheitsstandards.|该设备符合经过检验的安全标准。
buchstäblich|adj|字面上的；名副其实的|Die Nachricht verbreitete sich buchstäblich über Nacht.|这条消息真的是在一夜之间传开的。
würdig|adj|值得的；有尊严的|Die Jury hielt den Entwurf für preiswürdig.|评审团认为这个设计值得获奖。
die Klemme|nf|夹子；困境|Mit der kleinen Klemme wird das Kabel sicher befestigt.|电缆用这个小夹子牢牢固定。
verstoßen|adj|被排斥的；被遗弃的|Die verstoßenen Tiere wurden in einer Auffangstation versorgt.|被遗弃的动物在收容站得到照料。
kräftig|adj|强壮的；有力的；浓郁的|Ein kräftiger Wind trieb die Wolken auseinander.|一阵强风吹散了云层。
die Formel|nf|公式；固定表达|Mit dieser Formel lässt sich der Bedarf näherungsweise berechnen.|用这个公式可以近似计算需求。
der Wohnwagen|nm|房车；旅行拖车|Der Wohnwagen ist mit einer kleinen Solaranlage ausgestattet.|这辆房车配有一套小型太阳能设备。
wegwerfen|v|扔掉；丢弃|Funktionsfähige Geräte sollte man nicht einfach wegwerfen.|还能使用的设备不应随便丢弃。
vertreiben|v|驱散；销售；消磨|Das Unternehmen vertreibt seine Produkte in mehr als zwanzig Ländern.|公司在二十多个国家销售产品。
das Gitter|nn|栅栏；格栅；网格|Ein feines Gitter schützt die Lüftung vor grobem Schmutz.|细密的格栅可以防止大颗粒污物进入通风口。
erobern|v|赢得；占领|Die neue Technologie erobert zunehmend den europäischen Markt.|这项新技术正在逐步赢得欧洲市场。
spinnen|v|纺纱；胡思乱想；编织|Aus den feinen Fasern wird ein fester Faden gesponnen.|这些细纤维会被纺成结实的线。
die Spannung|nf|紧张；电压；张力|Die politische Spannung zwischen den beiden Ländern nahm ab.|两国之间的政治紧张局势有所缓和。
die Bestimmung|nf|规定；用途；确定|Die genaue Bestimmung der Art erfordert besondere Fachkenntnisse.|准确鉴定这个物种需要专门知识。
der Tresor|nm|保险柜；金库|Vertrauliche Unterlagen werden in einem Tresor aufbewahrt.|机密文件存放在保险柜中。
die Lehre|nf|学说；教训；职业培训|Aus dem Vorfall zog die Organisation wichtige Lehren.|该机构从这次事件中吸取了重要教训。
der Schrott|nm|废料；废金属|Der alte Schrott wird getrennt und anschließend recycelt.|旧废料会被分类，随后回收利用。
mitspielen|v|参与；配合；一起演奏|Bei dieser Lösung müssen alle beteiligten Stellen mitspielen.|要落实这个方案，所有相关部门都必须配合。
erregt|adj|激动的；兴奋的|Die erregte Debatte beruhigte sich erst nach einer Pause.|激烈的讨论直到休会后才平静下来。
das Lagerhaus|nn|仓库；货栈|Das moderne Lagerhaus wird weitgehend automatisch betrieben.|这座现代仓库基本实现了自动化运营。
verdorben|adj|变质的；被宠坏的|Verdorbene Lebensmittel dürfen nicht verkauft werden.|变质食品不得出售。
schräg|adj|倾斜的；古怪的|Das Dach ist leicht schräg, damit Regenwasser abfließen kann.|屋顶略微倾斜，以便雨水流走。
das Kinderspiel|nn|轻而易举的事；儿童游戏|Für eine erfahrene Fachkraft ist die Installation ein Kinderspiel.|对有经验的专业人员来说，安装这套设备轻而易举。
abziehen|v|扣除；撤走；撕下|Von der Rechnung müssen wir noch die Vorauszahlung abziehen.|我们还要从账单中扣除预付款。
geehrt|adj|感到荣幸的；受表彰的|Ich fühle mich geehrt, heute hier sprechen zu dürfen.|今天能在这里发言，我深感荣幸。
die Messe|nf|展览会；博览会；宗教弥撒|Auf der Messe stellen junge Firmen ihre Produkte vor.|年轻企业在博览会上展示自己的产品。
die Anerkennung|nf|认可；承认；赞赏|Ihre wissenschaftliche Arbeit fand internationale Anerkennung.|她的科研工作获得了国际认可。
inklusive|adj|包容的；包括在内的|Die Schule verfolgt ein inklusives Bildungskonzept.|学校推行包容性教育理念。
die Überwachung|nf|监测；监控；监督|Die kontinuierliche Überwachung verbessert die Betriebssicherheit.|持续监测能够提高运行安全。
die Bestätigung|nf|确认；证明|Nach der Anmeldung erhalten Sie eine schriftliche Bestätigung.|报名后，您会收到书面确认。
erteilen|v|给予；下达；颁发|Die Behörde erteilte die Genehmigung unter strengen Auflagen.|主管部门在严格条件下颁发了许可。
der Klub|nm|俱乐部；社团|Der Klub organisiert regelmäßig öffentliche Diskussionsabende.|这个俱乐部定期举办公开讨论会。
servieren|v|端上；提供餐饮|Zum Empfang wurden regionale Spezialitäten serviert.|招待会上供应了当地特色食品。
die Niederlage|nf|失败；落败|Die deutliche Niederlage führte zu einer ehrlichen Analyse.|这次明显的失败促成了一场坦诚的分析。
schwächen|v|削弱；使变弱|Unsichere Regeln schwächen das Vertrauen der Bevölkerung.|不明确的规则会削弱公众信任。
stillen|v|止住；满足；哺乳|Das Informationsangebot soll den wachsenden Wissensdurst stillen.|这项信息服务旨在满足人们日益增长的求知欲。
die Todesursache|nf|死因|Die medizinische Untersuchung klärte die Todesursache eindeutig.|医学检查明确查清了死因。
beschaffen|v|采购；设法获得；具有|Die Klinik konnte die benötigten Geräte kurzfristig beschaffen.|医院在短时间内采购到了所需设备。
abgezogen|adj|已扣除的；已撤走的|Nach abgezogenen Kosten bleibt ein kleiner Überschuss.|扣除成本后，还剩少量结余。
durchhalten|v|坚持；撑住|Mit gegenseitiger Unterstützung konnte das Team bis zum Ende durchhalten.|在相互支持下，团队坚持到了最后。
kooperieren|v|合作；协作|Die beiden Institute kooperieren bei mehreren Forschungsprojekten.|两家研究所合作开展多个科研项目。
der Anfall|nm|发作；突然的冲动|Bei einem schweren Asthmaanfall ist schnelle Hilfe wichtig.|严重哮喘发作时，及时救助十分重要。
das Andenken|nn|纪念；纪念品|Eine Stiftung bewahrt das Andenken an die Schriftstellerin.|一个基金会致力于纪念这位女作家。
der Aufenthalt|nm|停留；居留|Für einen längeren Aufenthalt ist ein Visum erforderlich.|长期停留需要签证。
summen|v|嗡嗡作响；哼唱|Die Solaranlage summt im Betrieb nur ganz leise.|太阳能设备运行时只发出很轻的嗡嗡声。
die Blutung|nf|出血|Die Ärztin konnte die Blutung rasch stoppen.|医生很快止住了出血。
hilflos|adj|无助的；无能为力的|Ohne verständliche Anleitung fühlten sich viele Nutzer hilflos.|没有清楚的说明，许多用户感到无从下手。
die Staatsanwaltschaft|nf|检察院|Die Staatsanwaltschaft leitete eine Untersuchung ein.|检察院启动了调查。
die Ehrlichkeit|nf|诚实；坦率|Ihre Ehrlichkeit schuf eine gute Grundlage für das Gespräch.|她的坦诚为谈话奠定了良好基础。
stur|adj|固执的；僵硬的|Trotz neuer Fakten hielt er stur an seiner Meinung fest.|尽管出现了新事实，他仍固执地坚持自己的看法。
aufspüren|v|查找；追踪到|Die Software kann ungewöhnliche Fehler automatisch aufspüren.|该软件可以自动查找异常错误。
speziell|adj|专门的；特殊的|Für sensible Daten gelten spezielle Schutzregeln.|敏感数据适用专门的保护规定。
die Neugier|nf|好奇心|Wissenschaftliche Neugier war der Ausgangspunkt der Untersuchung.|科学好奇心是这项研究的起点。
die Herkunft|nf|来源；出身；原产地|Auf der Verpackung muss die Herkunft des Produkts angegeben sein.|包装上必须注明产品原产地。
bereithalten|v|准备好；备有|Das Krankenhaus hält zusätzliche Betten für Notfälle bereit.|医院为紧急情况准备了额外床位。
die Befragung|nf|调查访问；询问|An der anonymen Befragung nahmen fünfhundert Personen teil.|五百人参加了匿名调查。
abgelaufen|adj|已过期的；已结束的|Abgelaufene Medikamente müssen fachgerecht entsorgt werden.|过期药品必须按规定处置。
die Ausschau|nf|寻找；眺望|Das Unternehmen hält nach geeigneten Partnern Ausschau.|公司正在寻找合适的合作伙伴。
die Studie|nf|研究；调查|Die Studie untersucht die Folgen flexibler Arbeitszeiten.|这项研究考察弹性工作时间的影响。
knurren|v|低吼；咕咕叫|Nach der langen Sitzung knurrte allen der Magen.|长时间开会后，大家都饿得肚子咕咕叫。
schlucken|v|吞咽；咽下|Die Tablette lässt sich mit viel Wasser leichter schlucken.|用足量的水更容易吞下这片药。
die Sirene|nf|警报器；汽笛|Beim Probealarm ertönte die Sirene um genau elf Uhr.|演习警报在十一点整响起。
formen|v|塑造；成形|Erfahrungen formen unsere Erwartungen und Entscheidungen.|经验塑造我们的期待与决定。
der Wirt|nm|店主；房东；宿主|Der Wirt erklärte den Gästen die regionalen Gerichte.|店主向客人介绍了当地菜肴。
das Scheitern|nn|失败；未能成功|Das Scheitern des ersten Versuchs lieferte wertvolle Erkenntnisse.|第一次尝试的失败带来了宝贵认识。
der Salon|nm|客厅；沙龙；美发店|Im literarischen Salon wurden neue Bücher diskutiert.|人们在文学沙龙中讨论了新书。
geboten|adj|必要的；适当的|Bei vertraulichen Daten ist besondere Vorsicht geboten.|处理机密数据时必须格外谨慎。
benommen|adj|头昏的；神志恍惚的|Nach dem Eingriff war der Patient noch etwas benommen.|手术后，患者仍有些头昏。
der Durchbruch|nm|突破；重大进展|Die neue Methode könnte einen Durchbruch in der Diagnostik bringen.|新方法可能给诊断领域带来突破。
reinigen|v|清洁；净化|Der Filter muss regelmäßig gereinigt werden.|过滤器必须定期清洁。
der Zeitplan|nm|时间表；进度计划|Trotz der Verzögerung halten wir am ursprünglichen Zeitplan fest.|尽管出现延误，我们仍坚持原定进度计划。
der Beitrag|nm|贡献；文章；费用；节目|Der Bericht leistet einen wichtigen Beitrag zur Debatte.|这份报告为讨论作出了重要贡献。
flüstern|v|低声说；耳语|Während der Aufnahme durfte man nur flüstern.|录制期间，人们只能低声说话。
die Türklingel|nf|门铃|Die Türklingel ist mit dem Smartphone verbunden.|门铃与智能手机相连。
die Wende|nf|转折；转变|Die neue Technik brachte die entscheidende Wende im Projekt.|新技术给项目带来了决定性转折。
zurücktreten|v|辞职；后退|Nach dem Bericht trat der Vorsitzende von seinem Amt zurück.|报告发布后，主席辞去了职务。
überdenken|v|重新考虑；反思|Angesichts der neuen Daten müssen wir die Strategie überdenken.|鉴于新数据，我们必须重新考虑战略。
loyal|adj|忠诚的；可靠的|Loyale Beschäftigte sprechen Probleme offen und frühzeitig an.|忠诚的员工会坦诚并及时指出问题。
die Besatzung|nf|机组人员；船员；占领|Die Besatzung bereitete das Schiff auf die Abfahrt vor.|船员为启航做好了准备。
der Klient|nm|委托人；客户；服务对象|Der Berater erklärte seinem Klienten alle Vertragsrisiken.|顾问向委托人解释了合同的所有风险。
zweifeln|v|怀疑；有疑问|Niemand zweifelt an der Bedeutung guter Bildung.|没有人怀疑良好教育的重要性。
der Herzschlag|nm|心跳；心搏|Das Gerät zeichnet den Herzschlag kontinuierlich auf.|设备会持续记录心跳。
der Stadtrat|nm|市议会；市议员|Der Stadtrat beschloss den Ausbau des Radwegenetzes.|市议会决定扩建自行车道网络。
die Regie|nf|导演；统筹；主导|Das Projekt steht unter der Regie einer unabhängigen Stiftung.|该项目由一个独立基金会统筹。
die Gasse|nf|小巷；窄街|Die historische Gasse wurde für den Autoverkehr gesperrt.|这条历史悠久的小巷禁止汽车通行。
der Strich|nm|线条；笔画；划线|Ein roter Strich markiert die zulässige Höchstgrenze.|一条红线标出了允许的上限。
der Stab|nm|杆；团队；参谋机构|Ein wissenschaftlicher Stab berät die Regierung.|一个科学顾问团队为政府提供咨询。
das Eindringen|nn|进入；渗入；侵入|Eine Dichtung verhindert das Eindringen von Wasser.|密封件可以防止水渗入。
eindringen|v|进入；渗入；侵入|Feuchtigkeit kann durch feine Risse ins Mauerwerk eindringen.|潮气可能通过细小裂缝渗入墙体。
die Auszeit|nf|暂停；休整期|Nach der intensiven Projektphase nahm sie eine kurze Auszeit.|紧张的项目阶段结束后，她短暂休整了一下。
der Look|nm|外观；风格|Der neue Look der Website wirkt klarer und moderner.|网站的新风格显得更清晰、更现代。
der Faden|nm|线；线索；思路|Nach der Unterbrechung verlor der Redner kurz den Faden.|被打断后，发言人一度失去了思路。
der Treffpunkt|nm|集合地点；会合处|Als Treffpunkt wurde der Haupteingang vereinbart.|大家约定在正门集合。
die Konzentration|nf|专注；浓度|Lärm beeinträchtigt die Konzentration bei anspruchsvollen Aufgaben.|噪声会影响完成高难度任务时的专注力。
die Reinigung|nf|清洁；净化；干洗店|Die regelmäßige Reinigung verlängert die Lebensdauer des Geräts.|定期清洁可以延长设备寿命。
die Übertragung|nf|传输；转播；转让|Die verschlüsselte Übertragung schützt vertrauliche Daten.|加密传输可以保护机密数据。
die Enge|nf|狭窄；拥挤|Die räumliche Enge erschwerte die Arbeit im Labor.|空间狭小增加了实验室工作的难度。
das Gen|nn|基因|Ein einzelnes Gen bestimmt nur selten ein komplexes Merkmal.|单个基因很少能决定一个复杂特征。
das Siegel|nn|印章；封印；认证标志|Das Siegel bestätigt die ökologische Herkunft des Produkts.|这个认证标志证明产品来自生态生产。
das Stechen|nn|刺痛；针扎般疼痛|Ein plötzliches Stechen im Rücken sollte ärztlich abgeklärt werden.|背部突然出现刺痛时应请医生检查。
stechen|v|刺；蜇；扎|Die Mücke stach ihn am frühen Abend.|傍晚时，一只蚊子叮了他。
checken|v|检查；弄懂；办理托运|Vor der Veröffentlichung müssen wir alle Zahlen noch einmal checken.|发布前，我们还要再检查一遍全部数据。
der Mitbewohner|nm|合住者；室友|Mein Mitbewohner arbeitet oft von zu Hause aus.|我的室友经常在家办公。
die Verlobung|nf|订婚|Das Paar gab seine Verlobung im Familienkreis bekannt.|这对伴侣在家人中宣布了订婚消息。
vereinbart|adj|约定的；商定的|Die Arbeiten wurden zum vereinbarten Termin abgeschlossen.|工程在约定日期完成了。
flüchten|v|逃离；躲避|Viele Menschen mussten vor der Überschwemmung flüchten.|许多人不得不躲避洪水。
rechtfertigen|v|证明……合理；为……辩解|Die geringen Vorteile rechtfertigen die hohen Kosten nicht.|微小的好处不足以证明高昂成本是合理的。
inspiriert|adj|受到启发的；富有灵感的|Der Entwurf ist von traditioneller Architektur inspiriert.|这个设计受到传统建筑的启发。
die Liga|nf|联赛；等级；联盟|Der Verein spielt seit diesem Jahr in der höchsten Liga.|该俱乐部从今年起参加最高级别联赛。
wertlos|adj|没有价值的；无用的|Ohne verlässliche Quellen sind die Angaben nahezu wertlos.|没有可靠来源，这些信息几乎毫无价值。
das Netzwerk|nn|网络；关系网|Das europäische Netzwerk erleichtert den Austausch von Forschungsdaten.|欧洲网络促进了科研数据交流。
rücken|v|移动；挪动；靠近|Bitte rücken Sie die Stühle etwas näher zusammen.|请把椅子挪得更近一些。
die Fake News|nf|虚假新闻；假消息|Fake News verbreiten sich in sozialen Netzwerken besonders schnell.|虚假新闻在社交网络上传播得特别快。
persönlich|adj|个人的；亲自的；私人的|Die endgültige Entscheidung möchte ich Ihnen persönlich mitteilen.|我想亲自把最终决定告诉您。
die Überraschung|nf|惊喜；意外|Die hohe Beteiligung war für das Organisationsteam eine positive Überraschung.|高参与度给组织团队带来了惊喜。
der Blick|nm|目光；视野；看法|Ein Blick auf die Zahlen zeigt einen klaren Trend.|看一眼数据就能发现明确趋势。
die Mark|nf|马克（原德国货币）；标记|Das alte Buch kostete damals fünf Mark.|这本旧书当时售价五马克。
die Gesellschaft|nf|社会；公司；陪伴|Die Digitalisierung verändert die gesamte Gesellschaft.|数字化正在改变整个社会。
die Gegend|nf|地区；一带|In dieser Gegend entstehen viele neue Wohnungen.|这一带正在兴建许多新住宅。
verantwortlich|adj|负责的；有责任的|Für die Datensicherung ist eine eigene Abteilung verantwortlich.|一个专门部门负责数据备份。
die Spur|nf|痕迹；线索；车道|Die Untersuchung führte zu einer neuen Spur.|调查发现了一条新线索。
werfen|v|扔；投；投射|Die neuen Zahlen werfen weitere Fragen auf.|新数据引出了更多问题。
der Brauch|nm|习俗；惯例|Dieser Brauch wird in der Region bis heute gepflegt.|这一习俗在该地区一直延续至今。
die Hälfte|nf|一半；半数|Mehr als die Hälfte der Befragten stimmte dem Vorschlag zu.|超过一半的受访者同意这项建议。
danken|v|感谢；归功于|Wir danken allen Beteiligten für ihre Unterstützung.|我们感谢所有相关人员的支持。
die Falle|nf|陷阱；圈套|Wer nur auf den Preis achtet, kann leicht in diese Falle geraten.|只关注价格的人很容易落入这个陷阱。
dauern|v|持续；花费时间|Die Auswertung wird voraussichtlich zwei Wochen dauern.|分析工作预计会持续两周。
feind|adj|敌对的；不利的|Die beiden Gruppen standen einander lange feind gegenüber.|两个群体长期彼此敌对。
bauen|v|建造；建立|Die Stadt baut eine neue Brücke über den Fluss.|市政府正在河上修建一座新桥。
unternehmen|v|采取；从事；进行|Die Regierung muss mehr gegen den Wohnungsmangel unternehmen.|政府必须采取更多措施应对住房短缺。
der Schaden|nm|损害；损失；故障|Der Wasserschaden wurde erst nach mehreren Tagen entdeckt.|水损事故几天后才被发现。
die Energie|nf|能源；精力|Das Gebäude verbraucht deutlich weniger Energie als früher.|这栋楼的能耗比过去明显更低。
leiden|v|受苦；患病；遭受|Viele kleine Betriebe leiden unter den hohen Energiekosten.|许多小企业受到高能源成本的困扰。
treten|v|踩；踢；走到；进入|Nach der Pause trat die neue Regelung in Kraft.|休会后，新规定开始生效。
fassen|v|抓住；容纳；作出|Der Ausschuss fasste einen einstimmigen Beschluss.|委员会作出了一致决定。
die Maschine|nf|机器；机械设备|Die neue Maschine arbeitet präziser und energiesparender.|新机器运行得更精确，也更节能。
verbringen|v|度过；花费|Die Forschenden verbrachten mehrere Monate im Untersuchungsgebiet.|研究人员在调查地区待了数月。
der Druck|nm|压力；印刷；压强|Der öffentliche Druck auf das Unternehmen nahm deutlich zu.|社会舆论对公司的压力明显增大。
der Haufen|nm|一堆；大量|Auf dem Schreibtisch lag ein Haufen unbearbeiteter Akten.|桌上放着一大堆尚未处理的文件。
irre|adj|疯狂的；惊人的；错误的|Die Kosten sind in den letzten Monaten irre schnell gestiegen.|过去几个月里，成本上涨得惊人地快。
lächeln|v|微笑|Sie lächelte erleichtert, als das Ergebnis bekannt gegeben wurde.|结果公布时，她如释重负地笑了。
das Gehirn|nn|大脑；脑|Regelmäßige Bewegung fördert die Durchblutung des Gehirns.|经常运动可以促进大脑血液循环。
scheinen|v|看起来；照耀|Die vorgeschlagene Lösung scheint technisch machbar zu sein.|建议的解决方案在技术上似乎可行。
hassen|v|憎恨；非常讨厌|Er hasst es, unter Zeitdruck entscheiden zu müssen.|他非常讨厌在时间压力下作决定。
daten|v|确定年代；约会|Die Fachleute datieren das Gebäude auf das fünfzehnte Jahrhundert.|专家将这栋建筑断代为十五世纪。
die Kunst|nf|艺术；技巧；本领|Die Ausstellung verbindet zeitgenössische Kunst mit digitaler Technik.|展览把当代艺术与数字技术结合起来。
das Gerät|nn|设备；器具|Das Gerät misst Temperatur und Luftfeuchtigkeit gleichzeitig.|该设备能同时测量温度和空气湿度。
fliehen|v|逃跑；逃离|Viele Bewohner flohen vor dem Hochwasser in höher gelegene Orte.|许多居民为了躲避洪水逃往地势更高的地方。
die Zunge|nf|舌头；语言|Die Ärztin untersuchte sorgfältig Hals und Zunge.|医生仔细检查了喉咙和舌头。
der Dieb|nm|小偷；窃贼|Ein aufmerksamer Zeuge erkannte den Dieb wieder.|一名细心的证人认出了小偷。
die Hütte|nf|小屋；棚屋|Die abgelegene Hütte wird mit Solarstrom versorgt.|这座偏远小屋使用太阳能供电。
der Sack|nm|袋；一袋的量|Der schwere Sack wurde mit einem Wagen transportiert.|这个沉重的袋子用推车运走了。
der Stoff|nm|材料；布料；内容|Der Stoff ist robust und leicht zu reinigen.|这种布料结实且容易清洁。
höher|adj|更高的；较高的|Für diese Tätigkeit ist eine höhere Qualifikation erforderlich.|这项工作需要更高资质。
das Holz|nn|木材；木头|Das Holz stammt aus nachhaltig bewirtschafteten Wäldern.|这些木材来自可持续经营的森林。
die Schulter|nf|肩；肩部|Die schwere Tasche belastet die rechte Schulter.|沉重的包给右肩造成了负担。
die Uniform|nf|制服|Die neue Uniform besteht aus einem leichteren Material.|新制服采用了更轻的材料。
die Öffentlichkeit|nf|公众；公共场合|Die Ergebnisse wurden erstmals der Öffentlichkeit vorgestellt.|研究结果首次向公众公布。
heil|adj|完好的；安然无恙的|Trotz des Sturms kamen alle heil am Ziel an.|尽管遇到暴风雨，所有人都平安抵达目的地。
negativ|adj|负面的；否定的；阴性的|Die unerwartete Verzögerung hatte negative Folgen für das Projekt.|意外延误给项目带来了负面影响。
die Arbeitsfläche|nf|工作台面；操作区|Die Arbeitsfläche muss nach jeder Nutzung gründlich gereinigt werden.|工作台面每次使用后都必须彻底清洁。
der Flügel|nm|翅膀；翼；三角钢琴|Der neue Museumsbau besteht aus zwei miteinander verbundenen Flügeln.|博物馆新楼由两个相连的侧翼组成。
der Abschluss|nm|完成；毕业；结业；合同签订|Nach dem erfolgreichen Abschluss der Prüfung erhielt sie das Zertifikat.|顺利通过考试后，她获得了证书。
graben|v|挖；掘|Für die neue Leitung mussten Arbeiter einen tiefen Graben graben.|工人们必须挖一条深沟来铺设新管线。
der Haken|nm|钩；难点；隐藏问题|Der Plan klingt gut, doch er hat einen entscheidenden Haken.|这个计划听起来不错，但有一个关键问题。
reißen|v|撕裂；扯断；猛拉|Unter zu großer Belastung kann das Seil reißen.|绳子在负荷过大时可能断裂。
der Deich|nm|堤坝；防洪堤|Der Deich wurde nach dem Hochwasser verstärkt.|洪水过后，堤坝得到了加固。
der Kram|nm|东西；杂物|Vor dem Umzug sortierte sie ihren alten Kram aus.|搬家前，她整理掉了旧杂物。
die Hefe|nf|酵母|Die Hefe lässt den Teig langsam aufgehen.|酵母使面团慢慢发起来。
kneten|v|揉；捏|Der Teig muss mindestens zehn Minuten geknetet werden.|面团至少要揉十分钟。
die Puppe|nf|玩偶；蛹|Die historische Puppe wird hinter Glas ausgestellt.|这个历史玩偶在玻璃展柜中展出。
die Schwäche|nf|弱点；虚弱；偏爱|Der Bericht benennt sowohl Stärken als auch Schwächen des Systems.|报告指出了系统的优势和弱点。
das Rad|nn|轮子；自行车|Viele Beschäftigte fahren mit dem Rad zur Arbeit.|许多员工骑自行车上班。
rollen|v|滚动；卷起；滑行|Die schweren Kisten wurden auf Rollen transportiert.|沉重的箱子用滚轮运走了。
die Hitze|nf|炎热；高温|Anhaltende Hitze belastet besonders ältere Menschen.|持续高温尤其会给老年人带来负担。
der Puls|nm|脉搏；节奏|Die Ärztin kontrollierte Puls und Blutdruck.|医生检查了脉搏和血压。
der Flur|nm|走廊；田野|Im breiten Flur wurden zusätzliche Sitzplätze eingerichtet.|宽阔的走廊里增设了座位。
handeln|v|行动；交易；涉及|Der Bericht handelt von den sozialen Folgen der Digitalisierung.|这份报告涉及数字化的社会影响。
der Handel|nm|贸易；商业|Der grenzüberschreitende Handel hat deutlich zugenommen.|跨境贸易明显增长。
abhalten|v|阻止；举行；使远离|Die Sitzung wird am kommenden Dienstag abgehalten.|会议将于下周二举行。
attraktiv|adj|有吸引力的；迷人的|Gute Verkehrsverbindungen machen den Standort attraktiv.|便利的交通使这个地点更具吸引力。
der Gewinn|nm|利润；收益；获胜|Der Gewinn wurde vollständig in neue Anlagen investiert.|利润全部投入了新设备。
akzeptiert|adj|被接受的；得到认可的|Die Methode ist in der Forschung allgemein akzeptiert.|这种方法在研究领域得到普遍认可。
die Furcht|nf|恐惧；担忧|Aus Furcht vor hohen Kosten wurde die Entscheidung verschoben.|由于担心成本过高，这项决定被推迟了。
der Mangel|nm|缺乏；缺陷|Der Mangel an bezahlbaren Wohnungen verschärft die soziale Lage.|可负担住房短缺加剧了社会问题。
siegen|v|获胜；战胜|Am Ende siegte die sachliche Argumentation.|最终，客观的论证占了上风。
`.trim();

const replacements = new Map([
  ["der Rücken|nm", ["die Nachhaltigkeit", "die Nachhaltigkeit · meist ohne Plural", "nf", "可持续性", "Nachhaltigkeit muss bei jeder Investition mitgedacht werden.", "每项投资都应把可持续性考虑在内。"]],
  ["das Erreichen|nn", ["die Chancengleichheit", "die Chancengleichheit · meist ohne Plural", "nf", "机会平等", "Chancengleichheit beginnt mit einem fairen Zugang zu Bildung.", "机会平等始于公平的教育机会。"]],
  ["die Schlampe|nf", ["die Medienkompetenz", "die Medienkompetenz · meist ohne Plural", "nf", "媒体素养", "Medienkompetenz hilft, verlässliche Quellen zu erkennen.", "媒体素养有助于识别可靠的信息来源。"]],
  ["die Bombe|nf", ["die Ressourcenschonung", "die Ressourcenschonung · meist ohne Plural", "nf", "资源节约；资源保护", "Ressourcenschonung ist ein zentrales Ziel der Kreislaufwirtschaft.", "节约资源是循环经济的核心目标。"]],
  ["der Trug|nm", ["die Arbeitsbelastung", "die Arbeitsbelastung · die Arbeitsbelastungen", "nf", "工作负担", "Flexible Teams können eine hohe Arbeitsbelastung besser verteilen.", "灵活的团队可以更合理地分担繁重的工作。"]],
  ["das Ross|nn", ["die Lebensqualität", "die Lebensqualität · meist ohne Plural", "nf", "生活质量", "Mehr Grünflächen erhöhen die Lebensqualität in der Stadt.", "增加绿地可以提升城市生活质量。"]],
  ["der Schütze|nm", ["die Selbstständigkeit", "die Selbstständigkeit · die Selbstständigkeiten", "nf", "独立；自主；个体经营", "Der Kurs fördert die Selbstständigkeit der Lernenden.", "这门课程培养学习者的自主能力。"]],
  ["der Oscar|nm", ["die Informationsflut", "die Informationsflut · meist ohne Plural", "nf", "信息洪流；信息过载", "Viele Menschen fühlen sich von der täglichen Informationsflut überfordert.", "许多人觉得每天的信息洪流令人应接不暇。"]],
  ["versaut|adj", ["die Vereinbarkeit", "die Vereinbarkeit · meist ohne Plural", "nf", "兼容性；协调兼顾", "Flexible Arbeitszeiten verbessern die Vereinbarkeit von Beruf und Familie.", "弹性工作时间有助于兼顾工作与家庭。"]],
  ["das Hollywood|nn", ["der Wohnraummangel", "der Wohnraummangel · meist ohne Plural", "nm", "住房短缺", "Der Wohnraummangel treibt die Mieten in vielen Städten nach oben.", "住房短缺推高了许多城市的租金。"]],
  ["der Nigger|nm", ["die Barrierefreiheit", "die Barrierefreiheit · meist ohne Plural", "nf", "无障碍性", "Barrierefreiheit nützt Menschen mit ganz unterschiedlichen Bedürfnissen.", "无障碍设计能惠及具有各种需求的人。"]],
  ["die Knarre|nf", ["der Fachkräftemangel", "der Fachkräftemangel · meist ohne Plural", "nm", "专业人才短缺", "Der Fachkräftemangel bremst das Wachstum vieler Betriebe.", "专业人才短缺制约了许多企业的发展。"]],
  ["der Positiv|nm", ["die Datensicherheit", "die Datensicherheit · meist ohne Plural", "nf", "数据安全", "Regelmäßige Updates erhöhen die Datensicherheit.", "定期更新可以提高数据安全性。"]],
  ["beschissen|adj", ["die Weiterbildung", "die Weiterbildung · die Weiterbildungen", "nf", "继续教育；进修", "Berufliche Weiterbildung eröffnet neue Perspektiven.", "职业进修会带来新的发展机会。"]],
  ["bewaffnet|adj", ["die Teilzeitbeschäftigung", "die Teilzeitbeschäftigung · die Teilzeitbeschäftigungen", "nf", "兼职工作；非全日制就业", "Teilzeitbeschäftigung kann den Wiedereinstieg erleichtern.", "非全日制就业可以帮助人们更容易地重返职场。"]],
  ["der Wecken|nm", ["die Eigenverantwortung", "die Eigenverantwortung · meist ohne Plural", "nf", "自我负责；个人责任", "Die neue Regelung stärkt die Eigenverantwortung der Beschäftigten.", "新规定增强了员工的个人责任。"]],
  ["die Bestie|nf", ["die Wertschöpfung", "die Wertschöpfung · meist ohne Plural", "nf", "价值创造；附加值创造", "Ein großer Teil der Wertschöpfung findet regional statt.", "很大一部分价值创造发生在本地区。"]],
  ["der Schwarzer|nm", ["die Bürgerbeteiligung", "die Bürgerbeteiligung · die Bürgerbeteiligungen", "nf", "公众参与；市民参与", "Frühe Bürgerbeteiligung erhöht die Akzeptanz großer Projekte.", "尽早让市民参与可以提高大型项目的接受度。"]],
  ["das TV|nn", ["die Infrastruktur", "die Infrastruktur · die Infrastrukturen", "nf", "基础设施", "Eine zuverlässige Infrastruktur ist für die Region entscheidend.", "可靠的基础设施对该地区至关重要。"]],
  ["der Ausgang|nm", ["die Innovationskraft", "die Innovationskraft · meist ohne Plural", "nf", "创新能力", "Forschung und Bildung stärken die Innovationskraft eines Landes.", "科研与教育能够增强一个国家的创新能力。"]],
  ["der Weißer|nm", ["die Transparenz", "die Transparenz · meist ohne Plural", "nf", "透明度；公开性", "Transparenz schafft Vertrauen in politische Entscheidungen.", "公开透明有助于建立对政治决策的信任。"]],
  ["der Baron|nm", ["die Zielsetzung", "die Zielsetzung · die Zielsetzungen", "nf", "目标设定；目标", "Eine klare Zielsetzung erleichtert die Umsetzung.", "明确的目标有助于推进落实。"]],
  ["der Re|nm", ["die Umsetzbarkeit", "die Umsetzbarkeit · meist ohne Plural", "nf", "可实施性", "Vor der Entscheidung prüfen wir die technische Umsetzbarkeit.", "作出决定前，我们会评估技术上的可实施性。"]],
  ["das Schmecken|nn", ["die Wahrnehmung", "die Wahrnehmung · die Wahrnehmungen", "nf", "感知；看法", "Unsere Wahrnehmung wird durch Erfahrungen geprägt.", "我们的感知会受到经验的影响。"]],
  ["narren|v", ["die Glaubwürdigkeit", "die Glaubwürdigkeit · meist ohne Plural", "nf", "可信度；公信力", "Widersprüchliche Angaben schaden der Glaubwürdigkeit.", "相互矛盾的说法会损害可信度。"]],
  ["der Benjamin|nm", ["die Entscheidungsfindung", "die Entscheidungsfindung · die Entscheidungsfindungen", "nf", "决策过程", "Eine transparente Entscheidungsfindung stärkt das Vertrauen.", "透明的决策过程能够增强信任。"]],
  ["das Füllen|nn", ["die Wettbewerbsfähigkeit", "die Wettbewerbsfähigkeit · meist ohne Plural", "nf", "竞争力", "Investitionen in Forschung erhöhen die Wettbewerbsfähigkeit.", "科研投资能够提高竞争力。"]],
  ["der Papi|nm", ["die Kostensteigerung", "die Kostensteigerung · die Kostensteigerungen", "nf", "成本上涨；费用增加", "Die unerwartete Kostensteigerung gefährdet den Zeitplan.", "意外的成本上涨影响了项目进度。"]],
  ["der Trank|nm", ["die Rahmenbedingung", "die Rahmenbedingung · die Rahmenbedingungen", "nf", "框架条件；基本条件", "Verlässliche Rahmenbedingungen erleichtern langfristige Investitionen.", "可靠的框架条件有利于长期投资。"]],
  ["out|adj", ["die Datenverarbeitung", "die Datenverarbeitung · die Datenverarbeitungen", "nf", "数据处理", "Die Datenverarbeitung erfolgt ausschließlich auf sicheren Servern.", "数据只会在安全服务器上处理。"]],
  ["das K|nn", ["die Fördermaßnahme", "die Fördermaßnahme · die Fördermaßnahmen", "nf", "扶持措施；促进措施", "Die Fördermaßnahme richtet sich besonders an kleine Betriebe.", "这项扶持措施主要面向小企业。"]],
  ["brutal|adj", ["die Nachfrageentwicklung", "die Nachfrageentwicklung · die Nachfrageentwicklungen", "nf", "需求走势；需求变化", "Die Nachfrageentwicklung wird monatlich ausgewertet.", "需求走势每月评估一次。"]],
  ["innere|adj", ["die Qualitätskontrolle", "die Qualitätskontrolle · die Qualitätskontrollen", "nf", "质量控制；质检", "Jede Lieferung durchläuft eine strenge Qualitätskontrolle.", "每批货物都要经过严格的质量检查。"]],
  ["die Kanone|nf", ["die Energieeffizienz", "die Energieeffizienz · meist ohne Plural", "nf", "能源效率；能效", "Eine bessere Dämmung erhöht die Energieeffizienz des Gebäudes.", "更好的保温层能提高建筑能效。"]],
  ["der Spinner|nm", ["die Lieferkette", "die Lieferkette · die Lieferketten", "nf", "供应链", "Ein Unwetter unterbrach die internationale Lieferkette.", "恶劣天气中断了国际供应链。"]],
  ["das Vieh|nn", ["die Meinungsfreiheit", "die Meinungsfreiheit · meist ohne Plural", "nf", "言论自由", "Meinungsfreiheit schützt auch unbequeme Ansichten.", "言论自由也保护令人不悦的观点。"]],
  ["die Schnelle|nf", ["die Fachliteratur", "die Fachliteratur · meist ohne Plural", "nf", "专业文献", "Die aktuelle Fachliteratur bewertet die Methode unterschiedlich.", "最新专业文献对这种方法的评价不一。"]],
  ["der Gangster|nm", ["die Arbeitsweise", "die Arbeitsweise · die Arbeitsweisen", "nf", "工作方式；方法", "Die digitale Arbeitsweise spart Zeit und Papier.", "数字化工作方式能够节省时间和纸张。"]],
  ["der Blödmann|nm", ["die Schwerpunktsetzung", "die Schwerpunktsetzung · die Schwerpunktsetzungen", "nf", "重点安排；侧重点", "Die neue Schwerpunktsetzung stärkt den Bildungsbereich.", "新的重点安排加强了教育领域。"]],
  ["das Biest|nn", ["die Risikobewertung", "die Risikobewertung · die Risikobewertungen", "nf", "风险评估", "Vor der Zulassung ist eine unabhängige Risikobewertung nötig.", "批准之前需要进行独立的风险评估。"]],
  ["dämlich|adj", ["die Aufgabenverteilung", "die Aufgabenverteilung · die Aufgabenverteilungen", "nf", "任务分配", "Eine klare Aufgabenverteilung verhindert unnötige Doppelarbeit.", "明确的任务分配可以避免不必要的重复劳动。"]],
  ["das Alpha|nn", ["die Verfügbarkeit", "die Verfügbarkeit · meist ohne Plural", "nf", "可用性；供应情况", "Die Verfügbarkeit von Ersatzteilen ist derzeit eingeschränkt.", "目前备件供应有限。"]],
  ["die Schießerei|nf", ["die Fehlerquote", "die Fehlerquote · die Fehlerquoten", "nf", "错误率", "Durch die Automatisierung sank die Fehlerquote deutlich.", "自动化使错误率明显下降。"]],
  ["der Freak|nm", ["die Verbraucherzentrale", "die Verbraucherzentrale · die Verbraucherzentralen", "nf", "消费者咨询中心", "Die Verbraucherzentrale warnt vor versteckten Vertragskosten.", "消费者咨询中心警告人们注意合同中的隐藏费用。"]],
  ["die Iris|nf", ["die Lesekompetenz", "die Lesekompetenz · meist ohne Plural", "nf", "阅读能力", "Regelmäßiges Lesen fördert die Lesekompetenz.", "经常阅读能够提高阅读能力。"]],
  ["das Kid|nn", ["der Abstimmungsprozess", "der Abstimmungsprozess · die Abstimmungsprozesse", "nm", "协调过程；表决程序", "Der interne Abstimmungsprozess dauerte länger als geplant.", "内部协调过程比计划持续得更久。"]],
  ["das Kokain|nn", ["die Verkehrswende", "die Verkehrswende · meist ohne Plural", "nf", "交通转型", "Die Verkehrswende erfordert attraktive Alternativen zum Auto.", "交通转型需要提供有吸引力的汽车替代方案。"]],
  ["der Dreckskerl|nm", ["die Erinnerungskultur", "die Erinnerungskultur · die Erinnerungskulturen", "nf", "纪念文化；历史记忆文化", "Eine offene Erinnerungskultur setzt sich kritisch mit der Vergangenheit auseinander.", "开放的纪念文化会批判性地审视过去。"]],
  ["down|adj", ["die Planungssicherheit", "die Planungssicherheit · meist ohne Plural", "nf", "规划确定性；计划保障", "Klare Regeln geben den Betrieben mehr Planungssicherheit.", "明确规则能给企业带来更强的规划确定性。"]],
  ["der Abschaum|nm", ["die Lernstrategie", "die Lernstrategie · die Lernstrategien", "nf", "学习策略", "Eine passende Lernstrategie verbessert den langfristigen Lernerfolg.", "合适的学习策略能够提高长期学习效果。"]],
  ["der Darling|nm", ["die Wirkungsanalyse", "die Wirkungsanalyse · die Wirkungsanalysen", "nf", "效果分析；影响分析", "Eine Wirkungsanalyse prüft die tatsächlichen Folgen des Programms.", "效果分析用于检验该项目的实际影响。"]],
  ["die Herrin|nf", ["die Steuerbelastung", "die Steuerbelastung · die Steuerbelastungen", "nf", "税负", "Die Reform soll die Steuerbelastung kleiner Einkommen senken.", "这项改革旨在降低低收入群体的税负。"]],
  ["das Ungeheuer|nn", ["die Datengrundlage", "die Datengrundlage · die Datengrundlagen", "nf", "数据基础", "Für eine verlässliche Prognose brauchen wir eine breitere Datengrundlage.", "可靠的预测需要更广泛的数据基础。"]],
  ["der Gefangener|nm", ["die Aufgabenstellung", "die Aufgabenstellung · die Aufgabenstellungen", "nf", "任务说明；题目要求", "Lesen Sie die Aufgabenstellung sorgfältig, bevor Sie beginnen.", "开始前请仔细阅读任务要求。"]],
  ["der Papst|nm", ["die Abwägung", "die Abwägung · die Abwägungen", "nf", "权衡；衡量", "Die Entscheidung erfordert eine sorgfältige Abwägung aller Interessen.", "这项决定需要认真权衡各方利益。"]],
  ["der Freier|nm", ["die Kosteneinsparung", "die Kosteneinsparung · die Kosteneinsparungen", "nf", "成本节约", "Die gemeinsame Beschaffung ermöglicht erhebliche Kosteneinsparungen.", "联合采购可以显著节约成本。"]],
  ["pst|adj", ["die Akzeptanz", "die Akzeptanz · meist ohne Plural", "nf", "接受度；认可", "Eine frühe Beteiligung erhöht die Akzeptanz der Entscheidung.", "尽早参与可以提高人们对该决定的接受度。"]],
  ["die Queen|nf", ["die Zuständigkeit", "die Zuständigkeit · die Zuständigkeiten", "nf", "权限；职责范围", "Für diese Genehmigung liegt die Zuständigkeit beim Land.", "这项审批属于州政府的职责范围。"]],
  ["das Blasen|nn", ["die Weiterbildungsmöglichkeit", "die Weiterbildungsmöglichkeit · die Weiterbildungsmöglichkeiten", "nf", "进修机会", "Das Unternehmen bietet vielfältige Weiterbildungsmöglichkeiten.", "公司提供多种进修机会。"]],
  ["dexter|adj", ["die Verlässlichkeit", "die Verlässlichkeit · meist ohne Plural", "nf", "可靠性", "Die Verlässlichkeit der Messwerte wurde unabhängig geprüft.", "测量结果的可靠性经过了独立检验。"]],
  ["explodieren|v", ["die Emissionsminderung", "die Emissionsminderung · die Emissionsminderungen", "nf", "减排；排放削减", "Die Emissionsminderung erfordert wirksame Maßnahmen in mehreren Sektoren.", "减排需要在多个行业采取有效措施。"]],
  ["die Festung|nf", ["der Forschungsschwerpunkt", "der Forschungsschwerpunkt · die Forschungsschwerpunkte", "nm", "研究重点", "Der neue Forschungsschwerpunkt liegt auf erneuerbaren Energien.", "新的研究重点是可再生能源。"]],
  ["der Pastor|nm", ["die Rechtsgrundlage", "die Rechtsgrundlage · die Rechtsgrundlagen", "nf", "法律依据", "Für die Datennutzung fehlt bislang eine eindeutige Rechtsgrundlage.", "目前使用这些数据还缺乏明确的法律依据。"]],
  ["umlegen|v", ["die Verfahrensweise", "die Verfahrensweise · die Verfahrensweisen", "nf", "处理方式；程序", "Die genaue Verfahrensweise ist im Handbuch beschrieben.", "具体处理方式在手册中有说明。"]],
  ["die Miese|nf", ["der Handlungsspielraum", "der Handlungsspielraum · die Handlungsspielräume", "nm", "行动余地；操作空间", "Das zusätzliche Budget erweitert unseren Handlungsspielraum.", "新增预算扩大了我们的行动空间。"]],
  ["das F|nn", ["das Förderprogramm", "das Förderprogramm · die Förderprogramme", "nn", "扶持计划；资助项目", "Das neue Förderprogramm unterstützt klimafreundliche Gebäude.", "新的资助项目支持气候友好型建筑。"]],
  ["das Ass|nn", ["die Anpassungsfähigkeit", "die Anpassungsfähigkeit · meist ohne Plural", "nf", "适应能力", "Anpassungsfähigkeit ist in einem dynamischen Markt besonders wichtig.", "在快速变化的市场中，适应能力尤其重要。"]],
  ["der Reicher|nm", ["die Rückverfolgbarkeit", "die Rückverfolgbarkeit · meist ohne Plural", "nf", "可追溯性", "Digitale Kennzeichnungen verbessern die Rückverfolgbarkeit der Produkte.", "数字标识能够提高产品的可追溯性。"]],
  ["angefasst|adj", ["die Zugänglichkeit", "die Zugänglichkeit · meist ohne Plural", "nf", "可获取性；无障碍程度", "Die Zugänglichkeit öffentlicher Informationen muss verbessert werden.", "公共信息的可获取性必须得到改善。"]],
  ["die Vergewaltigung|nf", ["die Kooperationsbereitschaft", "die Kooperationsbereitschaft · meist ohne Plural", "nf", "合作意愿", "Die hohe Kooperationsbereitschaft beschleunigte die Verhandlungen.", "强烈的合作意愿加快了谈判进程。"]],
  ["das Bingo|nn", ["die Datenauswertung", "die Datenauswertung · die Datenauswertungen", "nf", "数据分析；数据评估", "Die Datenauswertung bestätigt einen langfristigen Trend.", "数据分析证实了一个长期趋势。"]],
  ["die Schwuchtel|nf", ["die Problemstellung", "die Problemstellung · die Problemstellungen", "nf", "问题设定；问题所在", "Die Problemstellung wird im ersten Kapitel präzise formuliert.", "第一章准确阐述了问题所在。"]],
  ["der Champion|nm", ["der Lösungsansatz", "der Lösungsansatz · die Lösungsansätze", "nm", "解决思路；解决方案", "Der neue Lösungsansatz verbindet technische und soziale Aspekte.", "新的解决思路结合了技术与社会层面。"]],
  ["das Angesicht|nn", ["der Informationsaustausch", "der Informationsaustausch · meist ohne Plural", "nm", "信息交流", "Ein regelmäßiger Informationsaustausch verhindert Missverständnisse.", "定期的信息交流能够避免误解。"]],
  ["feste|adj", ["die Belastbarkeit", "die Belastbarkeit · meist ohne Plural", "nf", "承受能力；韧性", "Die Belastbarkeit des Materials wurde unter realistischen Bedingungen geprüft.", "材料的承受能力在真实条件下进行了测试。"]],
  ["die Feste|nf", ["die Zielgruppe", "die Zielgruppe · die Zielgruppen", "nf", "目标群体", "Die Kampagne richtet sich vor allem an eine junge Zielgruppe.", "这项宣传活动主要面向年轻群体。"]],
  ["das Würstchen|nn", ["die Kosten-Nutzen-Analyse", "die Kosten-Nutzen-Analyse · die Kosten-Nutzen-Analysen", "nf", "成本效益分析", "Eine Kosten-Nutzen-Analyse soll die Entscheidung absichern.", "成本效益分析将为这项决定提供依据。"]],
  ["der Irrer|nm", ["das Qualifikationsniveau", "das Qualifikationsniveau · die Qualifikationsniveaus", "nn", "资质水平；技能水平", "Das durchschnittliche Qualifikationsniveau ist deutlich gestiegen.", "平均技能水平明显提高了。"]],
  ["der Butler|nm", ["der Verwaltungsaufwand", "der Verwaltungsaufwand · meist ohne Plural", "nm", "行政负担；管理成本", "Digitale Verfahren können den Verwaltungsaufwand deutlich verringern.", "数字化流程能够显著减少行政负担。"]],
  ["der Vollidiot|nm", ["das Beratungsangebot", "das Beratungsangebot · die Beratungsangebote", "nn", "咨询服务", "Das kostenlose Beratungsangebot richtet sich an junge Unternehmen.", "这项免费咨询服务面向初创企业。"]],
  ["der First|nm", ["die Datenqualität", "die Datenqualität · die Datenqualitäten", "nf", "数据质量", "Unvollständige Angaben mindern die Datenqualität.", "信息不完整会降低数据质量。"]],
  ["die Schenke|nf", ["die soziale Sicherheit", "die soziale Sicherheit · meist ohne Plural", "nf", "社会保障", "Ein stabiles Rentensystem trägt zur sozialen Sicherheit bei.", "稳定的养老金制度有助于社会保障。"]],
  ["der Gauner|nm", ["die Berufsperspektive", "die Berufsperspektive · die Berufsperspektiven", "nf", "职业前景", "Die Weiterbildung eröffnet bessere Berufsperspektiven.", "进修能够带来更好的职业前景。"]],
  ["die Kacke|nf", ["die Umsetzungsphase", "die Umsetzungsphase · die Umsetzungsphasen", "nf", "实施阶段", "In der Umsetzungsphase werden die einzelnen Schritte genau dokumentiert.", "实施阶段会详细记录各个步骤。"]],
  ["das Geschrei|nn", ["die öffentliche Wahrnehmung", "die öffentliche Wahrnehmung · die öffentlichen Wahrnehmungen", "nf", "公众认知；社会印象", "Die öffentliche Wahrnehmung des Themas hat sich verändert.", "公众对这个议题的看法已经发生变化。"]],
  ["der Platten|nm", ["das Bewertungskriterium", "das Bewertungskriterium · die Bewertungskriterien", "nn", "评估标准", "Nachhaltigkeit ist ein wichtiges Bewertungskriterium.", "可持续性是一项重要评估标准。"]],
  ["das Y|nn", ["der Zielwert", "der Zielwert · die Zielwerte", "nm", "目标值", "Der festgelegte Zielwert soll bis 2030 erreicht werden.", "既定目标值应在2030年前实现。"]],
  ["das Verhör|nn", ["die Umweltwirkung", "die Umweltwirkung · die Umweltwirkungen", "nf", "环境影响", "Die Umweltwirkungen des Vorhabens werden unabhängig geprüft.", "该项目的环境影响将接受独立评估。"]],
  ["das Genick|nn", ["die Informationssicherheit", "die Informationssicherheit · meist ohne Plural", "nf", "信息安全", "Regelmäßige Schulungen stärken die Informationssicherheit.", "定期培训能够加强信息安全。"]],
  ["der Schinken|nm", ["die Beteiligungsquote", "die Beteiligungsquote · die Beteiligungsquoten", "nf", "参与率", "Die Beteiligungsquote an der Befragung lag bei siebzig Prozent.", "这次调查的参与率为百分之七十。"]],
  ["die Wien|nf", ["die Rahmenvereinbarung", "die Rahmenvereinbarung · die Rahmenvereinbarungen", "nf", "框架协议", "Beide Seiten unterzeichneten eine langfristige Rahmenvereinbarung.", "双方签署了一项长期框架协议。"]],
  ["fetten|v", ["die Rohstoffversorgung", "die Rohstoffversorgung · meist ohne Plural", "nf", "原材料供应", "Neue Verträge sollen die Rohstoffversorgung absichern.", "新合同旨在保障原材料供应。"]],
  ["der Hai|nm", ["die Konfliktlösung", "die Konfliktlösung · die Konfliktlösungen", "nf", "冲突解决", "Mediation bietet einen strukturierten Weg zur Konfliktlösung.", "调解为解决冲突提供了结构化途径。"]],
  ["die Erpressung|nf", ["der Interessenvertreter", "der Interessenvertreter · die Interessenvertreter", "nm", "利益代表", "Mehrere Interessenvertreter nahmen an der Anhörung teil.", "多名利益代表参加了听证会。"]],
  ["der Schwachkopf|nm", ["das Genehmigungsverfahren", "das Genehmigungsverfahren · die Genehmigungsverfahren", "nn", "审批程序", "Das Genehmigungsverfahren soll digital beschleunigt werden.", "审批程序将通过数字化加快。"]],
  ["der Dealer|nm", ["die Verantwortungsübernahme", "die Verantwortungsübernahme · meist ohne Plural", "nf", "承担责任", "Verantwortungsübernahme gehört zu einer guten Führungskultur.", "勇于承担责任是良好管理文化的一部分。"]],
  ["der Bunker|nm", ["die Betriebskontinuität", "die Betriebskontinuität · meist ohne Plural", "nf", "业务连续性；运营连续性", "Ein Notfallplan sichert die Betriebskontinuität.", "应急预案能够保障业务连续性。"]],
  ["der Kurzer|nm", ["der Zeitaufwand", "der Zeitaufwand · die Zeitaufwände", "nm", "时间投入；耗时", "Der Zeitaufwand für die Prüfung wurde deutlich unterschätzt.", "审核所需时间被严重低估了。"]],
  ["der Merlin|nm", ["die Vergleichbarkeit", "die Vergleichbarkeit · meist ohne Plural", "nf", "可比性", "Einheitliche Kriterien erhöhen die Vergleichbarkeit der Ergebnisse.", "统一标准能够提高结果的可比性。"]],
  ["der Sprengstoff|nm", ["die Datenschnittstelle", "die Datenschnittstelle · die Datenschnittstellen", "nf", "数据接口", "Die neue Datenschnittstelle verbindet beide Systeme.", "新的数据接口连接了两个系统。"]],
  ["der Po|nm", ["die Ergebnisorientierung", "die Ergebnisorientierung · meist ohne Plural", "nf", "结果导向", "Ergebnisorientierung darf nicht zulasten der Qualität gehen.", "结果导向不应以牺牲质量为代价。"]],
  ["der Koks|nm", ["die Wissensvermittlung", "die Wissensvermittlung · meist ohne Plural", "nf", "知识传授", "Digitale Medien ergänzen die klassische Wissensvermittlung.", "数字媒体是传统知识传授方式的补充。"]],
  ["das Hacken|nn", ["die Benutzerfreundlichkeit", "die Benutzerfreundlichkeit · meist ohne Plural", "nf", "易用性；用户友好度", "Eine klare Navigation verbessert die Benutzerfreundlichkeit.", "清晰的导航能够提高易用性。"]],
  ["der Wilder|nm", ["die Anforderung", "die Anforderung · die Anforderungen", "nf", "要求；需求", "Das Produkt erfüllt alle technischen Anforderungen.", "该产品满足全部技术要求。"]],
  ["huren|v", ["die Folgenabschätzung", "die Folgenabschätzung · die Folgenabschätzungen", "nf", "影响评估；后果评估", "Vor der Reform ist eine umfassende Folgenabschätzung nötig.", "改革前需要进行全面的影响评估。"]],
  ["der Khan|nm", ["die Interessengruppe", "die Interessengruppe · die Interessengruppen", "nf", "利益群体", "Jede Interessengruppe konnte schriftlich Stellung nehmen.", "每个利益群体都可以书面发表意见。"]],
  ["das V|nn", ["die Entscheidungsgrundlage", "die Entscheidungsgrundlage · die Entscheidungsgrundlagen", "nf", "决策依据", "Verlässliche Daten bilden eine wichtige Entscheidungsgrundlage.", "可靠数据构成重要的决策依据。"]],
  ["das Grauen|nn", ["der Lieferengpass", "der Lieferengpass · die Lieferengpässe", "nm", "供应瓶颈；供货短缺", "Der Lieferengpass verzögert die Produktion um mehrere Wochen.", "供应瓶颈使生产延迟了数周。"]],
  ["der Wärter|nm", ["das Prüfverfahren", "das Prüfverfahren · die Prüfverfahren", "nn", "审核程序；检验方法", "Das neue Prüfverfahren erkennt Fehler früher.", "新的检验方法能够更早发现错误。"]],
  ["die Hinrichtung|nf", ["die Zeitersparnis", "die Zeitersparnis · die Zeitersparnisse", "nf", "节省时间", "Die digitale Anmeldung bringt eine erhebliche Zeitersparnis.", "数字化报名能够节省大量时间。"]],
  ["ächzen|v", ["der Ressourceneinsatz", "der Ressourceneinsatz · die Ressourceneinsätze", "nm", "资源投入；资源使用", "Ein gezielter Ressourceneinsatz erhöht die Wirksamkeit des Programms.", "有针对性的资源投入能够提高项目成效。"]],
  ["das Platt|nn", ["der Nachhaltigkeitsbericht", "der Nachhaltigkeitsbericht · die Nachhaltigkeitsberichte", "nm", "可持续发展报告", "Der Nachhaltigkeitsbericht dokumentiert messbare Fortschritte.", "可持续发展报告记录了可衡量的进展。"]],
  ["der Gin|nm", ["die Rechtssicherheit", "die Rechtssicherheit · meist ohne Plural", "nf", "法律确定性", "Klare Vorschriften schaffen Rechtssicherheit für alle Beteiligten.", "明确规定能够为所有相关方提供法律确定性。"]],
  ["verknallt|adj", ["die Prozessoptimierung", "die Prozessoptimierung · die Prozessoptimierungen", "nf", "流程优化", "Die Prozessoptimierung verkürzt die Bearbeitungszeit.", "流程优化缩短了处理时间。"]],
  ["die Muschi|nf", ["die Schutzmaßnahme", "die Schutzmaßnahme · die Schutzmaßnahmen", "nf", "保护措施", "Die Schutzmaßnahmen werden regelmäßig an neue Risiken angepasst.", "保护措施会定期根据新风险进行调整。"]],
  ["die Fotze|nf", ["die Kompetenzentwicklung", "die Kompetenzentwicklung · die Kompetenzentwicklungen", "nf", "能力发展", "Gezielte Fortbildungen unterstützen die Kompetenzentwicklung.", "有针对性的培训能够促进能力发展。"]],
  ["der Greif|nm", ["die Kennzahl", "die Kennzahl · die Kennzahlen", "nf", "指标；关键数据", "Die Kennzahl zeigt die wirtschaftliche Entwicklung des Betriebs.", "这项指标反映了企业的经济发展情况。"]],
  ["das Gate|nn", ["das Fachgebiet", "das Fachgebiet · die Fachgebiete", "nn", "专业领域；学科领域", "Ihr Fachgebiet verbindet Medizin und Informatik.", "她的专业领域结合了医学与信息学。"]],
  ["der Paps|nm", ["der Umsetzungsschritt", "der Umsetzungsschritt · die Umsetzungsschritte", "nm", "实施步骤", "Jeder Umsetzungsschritt wird schriftlich dokumentiert.", "每个实施步骤都会书面记录。"]],
  ["der Satan|nm", ["die Methodenkompetenz", "die Methodenkompetenz · die Methodenkompetenzen", "nf", "方法能力；方法素养", "Methodenkompetenz ist für selbstständiges wissenschaftliches Arbeiten unverzichtbar.", "方法能力对独立开展科研工作不可或缺。"]],
  ["verprügeln|v", ["das Emissionsziel", "das Emissionsziel · die Emissionsziele", "nn", "减排目标；排放目标", "Das Land will sein Emissionsziel bereits vor 2030 erreichen.", "该国希望在2030年前提前实现减排目标。"]],
  ["erpressen|v", ["die Unternehmenskultur", "die Unternehmenskultur · die Unternehmenskulturen", "nf", "企业文化", "Eine offene Unternehmenskultur fördert ehrliche Rückmeldungen.", "开放的企业文化有助于形成坦诚反馈。"]],
  ["das Flittchen|nn", ["die digitale Teilhabe", "die digitale Teilhabe · meist ohne Plural", "nf", "数字参与；数字包容", "Bezahlbarer Internetzugang ist eine Voraussetzung für digitale Teilhabe.", "可负担的网络接入是实现数字参与的前提。"]],
  ["das U-Boot|nn", ["die Leistungsfähigkeit", "die Leistungsfähigkeit · meist ohne Plural", "nf", "性能；能力", "Regelmäßige Tests bestätigen die Leistungsfähigkeit des Systems.", "定期测试证实了系统的性能。"]],
  ["das Weichei|nn", ["die Finanzierungslücke", "die Finanzierungslücke · die Finanzierungslücken", "nf", "资金缺口", "Eine zusätzliche Förderung soll die Finanzierungslücke schließen.", "一笔额外资助将用于弥补资金缺口。"]],
  ["der Bischof|nm", ["die Auftragsvergabe", "die Auftragsvergabe · die Auftragsvergaben", "nf", "合同授予；项目发包", "Die Auftragsvergabe erfolgte nach transparenten Kriterien.", "项目发包依据透明标准进行。"]],
  ["die Axt|nf", ["der Interessendialog", "der Interessendialog · die Interessendialoge", "nm", "利益相关方对话", "Ein frühzeitiger Interessendialog kann Konflikte vermeiden.", "尽早开展利益相关方对话可以避免冲突。"]],
  ["das Visier|nn", ["die Umsetzungskontrolle", "die Umsetzungskontrolle · die Umsetzungskontrollen", "nf", "实施监督；落实检查", "Eine regelmäßige Umsetzungskontrolle macht Verzögerungen sichtbar.", "定期检查落实情况能够发现延误。"]],
  ["der Schiss|nm", ["die Ergebnisqualität", "die Ergebnisqualität · die Ergebnisqualitäten", "nf", "结果质量", "Klare Prüfregeln sichern eine hohe Ergebnisqualität.", "明确的审核规则能够保障较高的结果质量。"]],
  ["lecken|v", ["die Sozialverträglichkeit", "die Sozialverträglichkeit · meist ohne Plural", "nf", "社会可承受性；社会兼容性", "Die Sozialverträglichkeit der Reform muss sorgfältig geprüft werden.", "必须认真评估这项改革的社会可承受性。"]],
  ["der Corporal|nm", ["das Kompetenzprofil", "das Kompetenzprofil · die Kompetenzprofile", "nn", "能力画像；任职能力要求", "Das Kompetenzprofil beschreibt die Anforderungen der Stelle.", "能力画像说明了该岗位的任职要求。"]],
  ["der Cäsar|nm", ["die Finanzierungsstruktur", "die Finanzierungsstruktur · die Finanzierungsstrukturen", "nf", "融资结构", "Die Finanzierungsstruktur des Projekts wurde vereinfacht.", "项目的融资结构得到了简化。"]],
  ["brüllen|v", ["die Anpassungsstrategie", "die Anpassungsstrategie · die Anpassungsstrategien", "nf", "适应策略", "Die Region entwickelt eine Anpassungsstrategie für häufigere Hitzewellen.", "该地区正在制定应对更频繁热浪的适应策略。"]],
  ["das Gefecht|nn", ["die Qualitätssicherung", "die Qualitätssicherung · die Qualitätssicherungen", "nf", "质量保证", "Unabhängige Prüfungen sind Teil der Qualitätssicherung.", "独立检查是质量保证的一部分。"]],
  ["windeln|v", ["die Datenkompetenz", "die Datenkompetenz · die Datenkompetenzen", "nf", "数据素养；数据能力", "Datenkompetenz hilft, Statistiken kritisch zu beurteilen.", "数据素养有助于批判性地判断统计数据。"]],
  ["royal|adj", ["die Energiewende", "die Energiewende · die Energiewenden", "nf", "能源转型", "Die Energiewende verlangt Investitionen in Netze und Speicher.", "能源转型需要投资电网和储能设施。"]],
  ["ersticken|v", ["die Versorgungsqualität", "die Versorgungsqualität · die Versorgungsqualitäten", "nf", "服务质量；供给质量", "Digitale Terminangebote verbessern die Versorgungsqualität.", "数字预约服务能够提高服务质量。"]],
  ["marschieren|v", ["die Arbeitsmarktentwicklung", "die Arbeitsmarktentwicklung · die Arbeitsmarktentwicklungen", "nf", "劳动力市场走势", "Der Bericht analysiert die langfristige Arbeitsmarktentwicklung.", "报告分析了劳动力市场的长期走势。"]],
  ["gottverdammt|adj", ["die Widerstandsfähigkeit", "die Widerstandsfähigkeit · meist ohne Plural", "nf", "抵御能力；韧性", "Vielfältige Lieferwege erhöhen die Widerstandsfähigkeit der Wirtschaft.", "多元化供应渠道能够增强经济韧性。"]],
  ["das Maul|nn", ["die Inklusion", "die Inklusion · meist ohne Plural", "nf", "包容；融合教育", "Inklusion setzt den Abbau baulicher und sozialer Barrieren voraus.", "包容需要消除建筑与社会层面的障碍。"]],
  ["Bombe|adj", ["die Steuerungsgruppe", "die Steuerungsgruppe · die Steuerungsgruppen", "nf", "指导小组；统筹小组", "Eine Steuerungsgruppe koordiniert die nächsten Projektschritte.", "一个统筹小组负责协调项目的后续步骤。"]],
  ["jagen|v", ["die Umsetzungskompetenz", "die Umsetzungskompetenz · die Umsetzungskompetenzen", "nf", "执行能力；落实能力", "Gute Planung allein ersetzt keine praktische Umsetzungskompetenz.", "良好规划不能替代实际执行能力。"]],
  ["die Hure|nf", ["die digitale Souveränität", "die digitale Souveränität · meist ohne Plural", "nf", "数字自主能力；数字主权", "Offene Standards können die digitale Souveränität stärken.", "开放标准有助于增强数字自主能力。"]],
  ["das Pack|nn", ["die Veränderungsbereitschaft", "die Veränderungsbereitschaft · meist ohne Plural", "nf", "变革意愿；适应变化的意愿", "Veränderungsbereitschaft erleichtert die Einführung neuer Arbeitsweisen.", "变革意愿有助于引入新的工作方式。"]],
  ["der Hass|nm", ["die Teamfähigkeit", "die Teamfähigkeit · meist ohne Plural", "nf", "团队协作能力", "Teamfähigkeit gehört zu den wichtigsten Anforderungen der Stelle.", "团队协作能力是该岗位最重要的要求之一。"]],
  ["mauer|adj", ["die Datenethik", "die Datenethik · meist ohne Plural", "nf", "数据伦理", "Datenethik fragt nach dem verantwortungsvollen Umgang mit Informationen.", "数据伦理关注如何负责任地处理信息。"]],
  ["der Zauberer|nm", ["die Prozessqualität", "die Prozessqualität · die Prozessqualitäten", "nf", "流程质量", "Klare Zuständigkeiten verbessern die Prozessqualität.", "明确职责能够提高流程质量。"]],
  ["heulen|v", ["die Problemlösungskompetenz", "die Problemlösungskompetenz · die Problemlösungskompetenzen", "nf", "解决问题的能力", "Fallstudien fördern die Problemlösungskompetenz der Teilnehmenden.", "案例研究能够培养参与者解决问题的能力。"]],
  ["das Motorrad|nn", ["die Handlungsfähigkeit", "die Handlungsfähigkeit · meist ohne Plural", "nf", "行动能力；履职能力", "Ausreichende Rücklagen sichern die Handlungsfähigkeit der Gemeinde.", "充足储备能够保障市镇的行动能力。"]],
  ["der Jude|nm", ["die Teilhabemöglichkeit", "die Teilhabemöglichkeit · die Teilhabemöglichkeiten", "nf", "参与机会", "Digitale Angebote schaffen neue Teilhabemöglichkeiten.", "数字服务创造了新的参与机会。"]],
  ["lichter|adj", ["die Versorgungssicherheit", "die Versorgungssicherheit · meist ohne Plural", "nf", "供应保障；供给安全", "Neue Speicher sollen die Versorgungssicherheit im Winter erhöhen.", "新的储能设施将提高冬季供应保障。"]],
  ["arten|v", ["die Ergebnisdarstellung", "die Ergebnisdarstellung · die Ergebnisdarstellungen", "nf", "结果呈现", "Eine klare Ergebnisdarstellung erleichtert die fachliche Bewertung.", "清晰的结果呈现有助于专业评估。"]],
  ["niedlich|adj", ["die Bedarfsermittlung", "die Bedarfsermittlung · die Bedarfsermittlungen", "nf", "需求测定；需求调查", "Eine gründliche Bedarfsermittlung verhindert Fehlplanungen.", "深入的需求调查可以避免规划失误。"]],
  ["feige|adj", ["die Nachhaltigkeitsstrategie", "die Nachhaltigkeitsstrategie · die Nachhaltigkeitsstrategien", "nf", "可持续发展战略", "Die Nachhaltigkeitsstrategie enthält messbare Ziele bis 2035.", "可持续发展战略包含截至2035年的可衡量目标。"]],
  ["übernachten|v", ["die Umsetzungshilfe", "die Umsetzungshilfe · die Umsetzungshilfen", "nf", "实施指南；落实辅助工具", "Die Behörde veröffentlicht eine praktische Umsetzungshilfe.", "主管部门发布了一份实用实施指南。"]],
  ["der Autounfall|nm", ["die Leistungsbewertung", "die Leistungsbewertung · die Leistungsbewertungen", "nf", "绩效评价；成绩评定", "Die Leistungsbewertung folgt transparenten Kriterien.", "绩效评价依据透明标准进行。"]],
  ["ärgern|v", ["die Qualitätsanforderung", "die Qualitätsanforderung · die Qualitätsanforderungen", "nf", "质量要求", "Alle Lieferanten müssen dieselben Qualitätsanforderungen erfüllen.", "所有供应商都必须满足相同的质量要求。"]],
  ["die Kälte|nf", ["die Versorgungsstruktur", "die Versorgungsstruktur · die Versorgungsstrukturen", "nf", "供给结构；服务体系", "Regionale Zentren verbessern die medizinische Versorgungsstruktur.", "地区中心能够改善医疗服务体系。"]],
  ["der Frosch|nm", ["die Maßnahmenplanung", "die Maßnahmenplanung · die Maßnahmenplanungen", "nf", "措施规划", "Die Maßnahmenplanung basiert auf den Ergebnissen der Befragung.", "措施规划以调查结果为基础。"]],
  ["das T-Shirt|nn", ["der Verbesserungsbedarf", "der Verbesserungsbedarf · meist ohne Plural", "nm", "改进需求；改进空间", "Der Bericht zeigt deutlichen Verbesserungsbedarf bei der Kommunikation.", "报告显示沟通方面存在明显改进空间。"]],
  ["das Boxen|nn", ["die Entscheidungsbefugnis", "die Entscheidungsbefugnis · die Entscheidungsbefugnisse", "nf", "决策权限", "Die Entscheidungsbefugnis liegt bei der zuständigen Behörde.", "决策权限属于主管部门。"]],
  ["boxen|v", ["die Planungsgrundlage", "die Planungsgrundlage · die Planungsgrundlagen", "nf", "规划依据", "Aktuelle Bevölkerungsdaten bilden eine wichtige Planungsgrundlage.", "最新人口数据构成重要的规划依据。"]],
  ["der Pfannkuchen|nm", ["die Evaluationsmethode", "die Evaluationsmethode · die Evaluationsmethoden", "nf", "评估方法", "Die Evaluationsmethode wurde vorab wissenschaftlich geprüft.", "这种评估方法事先经过了科学检验。"]],
  ["der Truthahn|nm", ["die Datenlage", "die Datenlage · die Datenlagen", "nf", "数据情况；证据基础", "Die aktuelle Datenlage erlaubt noch keine eindeutige Schlussfolgerung.", "现有数据还不足以得出明确结论。"]],
  ["zittern|v", ["die Koordinationsstelle", "die Koordinationsstelle · die Koordinationsstellen", "nf", "协调机构；协调办公室", "Eine zentrale Koordinationsstelle bündelt alle Anfragen.", "一个中央协调机构统一处理所有询问。"]],
  ["der Schuss|nm", ["die Mitbestimmung", "die Mitbestimmung · meist ohne Plural", "nf", "共同决策权；参与管理", "Betriebliche Mitbestimmung stärkt die Interessen der Beschäftigten.", "企业共同决策机制能够维护员工利益。"]],
  ["der Knast|nm", ["der Bildungszugang", "der Bildungszugang · die Bildungszugänge", "nm", "教育机会；教育准入", "Digitale Angebote können den Bildungszugang im ländlichen Raum verbessern.", "数字服务能够改善农村地区的教育机会。"]],
  ["der Schwanz|nm", ["die Kreislaufwirtschaft", "die Kreislaufwirtschaft · die Kreislaufwirtschaften", "nf", "循环经济", "Die Kreislaufwirtschaft hält Rohstoffe möglichst lange im Nutzungskreislauf.", "循环经济让原材料尽可能长时间留在使用循环中。"]],
  ["die Kate|nf", ["die Datennutzung", "die Datennutzung · die Datennutzungen", "nf", "数据使用", "Für die Datennutzung gelten klare rechtliche Grenzen.", "数据使用受到明确法律边界的约束。"]],
  ["die Schande|nf", ["der Kompetenzaufbau", "der Kompetenzaufbau · meist ohne Plural", "nm", "能力建设", "Der Kompetenzaufbau beginnt mit gezielter Weiterbildung.", "能力建设始于有针对性的进修。"]],
  ["der Trotz|nm", ["die Ressourcenplanung", "die Ressourcenplanung · die Ressourcenplanungen", "nf", "资源规划", "Eine realistische Ressourcenplanung verhindert spätere Engpässe.", "现实的资源规划能够避免后续瓶颈。"]],
  ["die Toilette|nf", ["die Erfolgskontrolle", "die Erfolgskontrolle · die Erfolgskontrollen", "nf", "成效检查；成果评估", "Zur Erfolgskontrolle werden messbare Kennzahlen verwendet.", "成效检查使用可衡量的指标。"]],
  ["die Hexe|nf", ["die Personalentwicklung", "die Personalentwicklung · die Personalentwicklungen", "nf", "人力资源发展；人才培养", "Die Personalentwicklung fördert Fach- und Führungskräfte gezielt.", "人才培养工作有针对性地发展专业人员和管理人员。"]],
  ["die Brust|nf", ["die Wirtschaftlichkeit", "die Wirtschaftlichkeit · meist ohne Plural", "nf", "经济性；成本效益", "Vor der Anschaffung wird die Wirtschaftlichkeit der Anlage geprüft.", "采购前会评估设备的经济性。"]],
  ["der Rock|nm", ["die Klimaanpassung", "die Klimaanpassung · die Klimaanpassungen", "nf", "气候适应", "Städte brauchen konkrete Maßnahmen zur Klimaanpassung.", "城市需要采取具体的气候适应措施。"]],
  ["das Pantheon|nn", ["die Investitionssicherheit", "die Investitionssicherheit · meist ohne Plural", "nf", "投资保障；投资确定性", "Langfristige Regeln erhöhen die Investitionssicherheit.", "长期稳定的规则能够增强投资确定性。"]],
  ["sturm|adj", ["der Forschungsstand", "der Forschungsstand · meist ohne Plural", "nm", "研究现状", "Das Kapitel fasst den aktuellen Forschungsstand zusammen.", "这一章总结了当前研究现状。"]],
  ["die Gnade|nf", ["die Rechtslage", "die Rechtslage · die Rechtslagen", "nf", "法律状况；法律规定", "Die Rechtslage ist in diesem Punkt noch nicht eindeutig.", "这一点上的法律规定还不明确。"]],
  ["der Tiger|nm", ["die Chancengerechtigkeit", "die Chancengerechtigkeit · meist ohne Plural", "nf", "机会公平", "Chancengerechtigkeit verlangt zusätzliche Unterstützung für Benachteiligte.", "机会公平要求为处境不利者提供额外支持。"]],
  ["der Diener|nm", ["die Verteilungswirkung", "die Verteilungswirkung · die Verteilungswirkungen", "nf", "分配效应", "Die Verteilungswirkung der Reform wird gesondert untersucht.", "这项改革的分配效应将单独研究。"]],
  ["die Ratte|nf", ["die Umweltverträglichkeit", "die Umweltverträglichkeit · meist ohne Plural", "nf", "环境相容性；环保性", "Die Umweltverträglichkeit des Baustoffs wurde nachgewiesen.", "这种建筑材料的环保性已经得到证明。"]],
  ["die Jagd|nf", ["der Wissenstransfer", "der Wissenstransfer · die Wissenstransfers", "nm", "知识转移；成果转化", "Der Wissenstransfer zwischen Forschung und Praxis soll verbessert werden.", "科研与实践之间的知识转移需要得到改善。"]],
  ["der Schreibtisch|nm", ["die Beteiligungsform", "die Beteiligungsform · die Beteiligungsformen", "nf", "参与形式", "Online-Dialoge sind nur eine von mehreren Beteiligungsformen.", "在线对话只是多种参与形式之一。"]],
  ["der Waldkauz|nm", ["die Effizienzsteigerung", "die Effizienzsteigerung · die Effizienzsteigerungen", "nf", "效率提升", "Die Automatisierung ermöglicht eine deutliche Effizienzsteigerung.", "自动化能够显著提高效率。"]],
  ["die Diskothek|nf", ["die Lösungsorientierung", "die Lösungsorientierung · meist ohne Plural", "nf", "解决方案导向", "Lösungsorientierung hilft, festgefahrene Debatten zu überwinden.", "解决方案导向有助于打破僵局。"]],
  ["brach|adj", ["die Fachberatung", "die Fachberatung · die Fachberatungen", "nf", "专业咨询", "Die kostenlose Fachberatung richtet sich an kleine Kommunen.", "免费专业咨询面向小型市镇。"]],
  ["vögeln|v", ["die Bildungsbeteiligung", "die Bildungsbeteiligung · meist ohne Plural", "nf", "教育参与度", "Frühe Förderung kann die Bildungsbeteiligung langfristig erhöhen.", "早期支持能够长期提高教育参与度。"]],
  ["der Höcker|nm", ["der Strukturwandel", "der Strukturwandel · die Strukturwandel", "nm", "结构转型", "Der Strukturwandel verändert ganze Regionen.", "结构转型正在改变整个地区。"]],
  ["die Amsel|nf", ["die Zielerreichung", "die Zielerreichung · meist ohne Plural", "nf", "目标达成", "Die Zielerreichung wird jährlich anhand fester Kriterien geprüft.", "每年都会依据固定标准检查目标达成情况。"]],
  ["der Pool|nm", ["die Rechenschaftspflicht", "die Rechenschaftspflicht · die Rechenschaftspflichten", "nf", "问责义务；报告责任", "Öffentliche Mittel bringen eine besondere Rechenschaftspflicht mit sich.", "公共资金伴随着特殊的问责义务。"]],
  ["das Origami|nn", ["die Personalplanung", "die Personalplanung · die Personalplanungen", "nf", "人员规划", "Die langfristige Personalplanung berücksichtigt den demografischen Wandel.", "长期人员规划会考虑人口结构变化。"]],
  ["die Pizza|nf", ["die Arbeitszufriedenheit", "die Arbeitszufriedenheit · meist ohne Plural", "nf", "工作满意度", "Flexible Arbeitsmodelle können die Arbeitszufriedenheit erhöhen.", "弹性工作模式能够提高工作满意度。"]],
  ["das Sashimi|nn", ["die Fachkräftesicherung", "die Fachkräftesicherung · meist ohne Plural", "nf", "专业人才保障", "Ausbildung und Zuwanderung gehören zur Fachkräftesicherung.", "职业培训与移民都是专业人才保障的一部分。"]],
  ["das Gewehr|nn", ["die Innovationsförderung", "die Innovationsförderung · die Innovationsförderungen", "nf", "创新扶持；创新促进", "Gezielte Innovationsförderung unterstützt besonders kleine Unternehmen.", "有针对性的创新扶持尤其能帮助小企业。"]],
  ["ermorden|v", ["die Arbeitsplatzsicherheit", "die Arbeitsplatzsicherheit · meist ohne Plural", "nf", "工作保障；岗位稳定性", "Langfristige Verträge erhöhen die Arbeitsplatzsicherheit.", "长期合同能够提高岗位稳定性。"]],
  ["der Henker|nm", ["der Erkenntnisgewinn", "der Erkenntnisgewinn · die Erkenntnisgewinne", "nm", "认识增益；新认识", "Die Befragung brachte einen wichtigen Erkenntnisgewinn für das Projekt.", "这项调查为项目带来了重要的新认识。"]],
  ["die Folter|nf", ["die Handlungsoption", "die Handlungsoption · die Handlungsoptionen", "nf", "行动方案；可选措施", "Vor der Entscheidung wurden mehrere Handlungsoptionen geprüft.", "作出决定前，人们评估了多种行动方案。"]],
  ["der Revolver|nm", ["die Organisationsentwicklung", "die Organisationsentwicklung · die Organisationsentwicklungen", "nf", "组织发展；组织改革", "Die Organisationsentwicklung soll interne Abläufe verbessern.", "组织发展旨在改善内部流程。"]],
  ["die Droge|nf", ["die Transformationsstrategie", "die Transformationsstrategie · die Transformationsstrategien", "nf", "转型战略", "Die Transformationsstrategie verbindet Klimaschutz mit wirtschaftlicher Stabilität.", "这项转型战略把气候保护与经济稳定结合起来。"]],
  ["dritte|adj", ["die Bürgerinitiative", "die Bürgerinitiative · die Bürgerinitiativen", "nf", "公民倡议组织；市民行动团体", "Eine Bürgerinitiative sammelte Unterschriften für den Erhalt des Parks.", "一个市民行动团体为保留公园征集签名。"]],
  ["zwanzig|adj", ["die Berufserfahrung", "die Berufserfahrung · meist ohne Plural", "nf", "工作经验；职业经验", "Für die Stelle sind mindestens zwei Jahre Berufserfahrung erforderlich.", "这个岗位要求至少两年工作经验。"]],
  ["vierte|adj", ["die Zusammenarbeit", "die Zusammenarbeit · die Zusammenarbeiten", "nf", "合作；协作", "Eine enge Zusammenarbeit erleichtert die Umsetzung des Projekts.", "紧密协作有助于项目落实。"]],
  ["bedaure|adj", ["die Meinungsbildung", "die Meinungsbildung · meist ohne Plural", "nf", "意见形成；舆论形成", "Unabhängige Medien spielen bei der Meinungsbildung eine wichtige Rolle.", "独立媒体在意见形成过程中发挥重要作用。"]],
  ["der Dritter|nm", ["die Gleichbehandlung", "die Gleichbehandlung · meist ohne Plural", "nf", "平等对待；同等处理", "Das Gesetz verlangt die Gleichbehandlung aller Bewerbenden.", "法律要求平等对待所有求职者。"]],
  ["der Erwachsener|nm", ["das Bildungsangebot", "das Bildungsangebot · die Bildungsangebote", "nn", "教育项目；课程供给", "Das digitale Bildungsangebot erreicht auch Menschen in ländlichen Regionen.", "数字教育项目也能覆盖农村地区的人群。"]],
  ["das Geschwister|nn", ["die Arbeitsbedingungen", "die Arbeitsbedingungen · nur Plural", "nf", "工作条件；劳动条件", "Gute Arbeitsbedingungen tragen zur Gesundheit der Beschäftigten bei.", "良好的工作条件有助于维护员工健康。"]],
  ["das Monster|nn", ["die Berufsorientierung", "die Berufsorientierung · meist ohne Plural", "nf", "职业规划指导；职业定向", "Eine frühzeitige Berufsorientierung erleichtert Jugendlichen die Ausbildungswahl.", "尽早接受职业规划指导有助于青少年选择职业培训方向。"]],
  ["der Feind|nm", ["die Lebenshaltungskosten", "die Lebenshaltungskosten · nur Plural", "nf", "生活成本；生活费用", "Die Lebenshaltungskosten sind in vielen Großstädten deutlich gestiegen.", "许多大城市的生活成本明显上升。"]],
  ["die Irre|nf", ["die Verkehrsanbindung", "die Verkehrsanbindung · die Verkehrsanbindungen", "nf", "交通连接；交通便利程度", "Eine gute Verkehrsanbindung macht den Standort für Unternehmen attraktiver.", "便利的交通连接使这个地点对企业更有吸引力。"]],
  ["die Heilige|nf", ["der Energieverbrauch", "der Energieverbrauch · meist ohne Plural", "nm", "能源消耗；能耗", "Eine moderne Heizungsanlage senkt den Energieverbrauch erheblich.", "现代供暖设备能够显著降低能耗。"]],
  ["die Rache|nf", ["die Umweltbelastung", "die Umweltbelastung · die Umweltbelastungen", "nf", "环境负担；环境污染", "Strengere Grenzwerte sollen die Umweltbelastung verringern.", "更严格的限值旨在降低环境负担。"]],
  ["hauen|v", ["die Arbeitslosenquote", "die Arbeitslosenquote · die Arbeitslosenquoten", "nf", "失业率", "Die Arbeitslosenquote ist im vergangenen Quartal leicht gesunken.", "上一季度的失业率略有下降。"]],
  ["der Bulle|nm", ["die Einkommensverteilung", "die Einkommensverteilung · die Einkommensverteilungen", "nf", "收入分配", "Die Studie untersucht die langfristige Entwicklung der Einkommensverteilung.", "这项研究考察收入分配的长期变化。"]],
  ["der Ritter|nm", ["das Gemeinschaftsgefühl", "das Gemeinschaftsgefühl · die Gemeinschaftsgefühle", "nn", "集体归属感；共同体意识", "Gemeinsame Projekte stärken das Gemeinschaftsgefühl im Viertel.", "共同项目能够增强街区居民的归属感。"]],
  ["der Jäger|nm", ["die Gesundheitsversorgung", "die Gesundheitsversorgung · meist ohne Plural", "nf", "医疗保障；医疗服务", "Im ländlichen Raum muss die Gesundheitsversorgung verbessert werden.", "农村地区的医疗服务需要得到改善。"]],
  ["diamanten|adj", ["der Weiterbildungsbedarf", "der Weiterbildungsbedarf · meist ohne Plural", "nm", "进修需求；培训需求", "Die Digitalisierung erhöht den Weiterbildungsbedarf in vielen Berufen.", "数字化提高了许多职业的进修需求。"]],
  ["die Beute|nf", ["die Kundenorientierung", "die Kundenorientierung · meist ohne Plural", "nf", "客户导向；顾客导向", "Eine konsequente Kundenorientierung verbessert die Servicequalität.", "持续坚持客户导向能够提升服务质量。"]],
  ["der Penis|nm", ["die Standortentscheidung", "die Standortentscheidung · die Standortentscheidungen", "nf", "选址决策", "Für die Standortentscheidung wurden Verkehrswege und Mietkosten verglichen.", "作出选址决策时比较了交通条件与租金成本。"]],
  ["die Marine|nf", ["die Qualitätsverbesserung", "die Qualitätsverbesserung · die Qualitätsverbesserungen", "nf", "质量提升；品质改进", "Regelmäßige Rückmeldungen tragen zur Qualitätsverbesserung bei.", "定期反馈有助于提升质量。"]],
  ["kotzen|v", ["die Kostenentwicklung", "die Kostenentwicklung · die Kostenentwicklungen", "nf", "成本走势；费用变化", "Die Kostenentwicklung wird in jedem Quartal neu bewertet.", "每个季度都会重新评估成本走势。"]],
  ["die Klinge|nf", ["die Verantwortungsbereitschaft", "die Verantwortungsbereitschaft · meist ohne Plural", "nf", "责任意识；担当意愿", "Verantwortungsbereitschaft ist für eine Führungsposition unverzichtbar.", "责任意识是担任管理职位不可或缺的条件。"]],
  ["die Entführung|nf", ["die Informationsveranstaltung", "die Informationsveranstaltung · die Informationsveranstaltungen", "nf", "信息说明会；宣讲会", "Die Gemeinde lädt zu einer Informationsveranstaltung über das Bauprojekt ein.", "市镇邀请居民参加关于建设项目的信息说明会。"]],
  ["entführen|v", ["die Fachkräftelücke", "die Fachkräftelücke · die Fachkräftelücken", "nf", "专业人才缺口", "Gezielte Weiterbildung kann die Fachkräftelücke teilweise schließen.", "有针对性的进修可以在一定程度上弥补专业人才缺口。"]],
  ["die Sau|nf", ["die Mediennutzung", "die Mediennutzung · meist ohne Plural", "nf", "媒体使用；媒介使用", "Die Mediennutzung von Jugendlichen verändert sich besonders schnell.", "青少年的媒体使用习惯变化得尤其快。"]],
  ["doof|adj", ["die Datenerhebung", "die Datenerhebung · die Datenerhebungen", "nf", "数据采集；数据调查", "Vor jeder Datenerhebung müssen die Teilnehmenden informiert werden.", "每次采集数据前都必须告知参与者。"]],
  ["verwundet|adj", ["die Wohnraumentwicklung", "die Wohnraumentwicklung · die Wohnraumentwicklungen", "nf", "住房发展；居住空间发展", "Die Wohnraumentwicklung muss den demografischen Wandel berücksichtigen.", "住房发展必须考虑人口结构变化。"]],
  ["der Häuptling|nm", ["die Klimafolgenanpassung", "die Klimafolgenanpassung · meist ohne Plural", "nf", "气候影响适应；气候适应", "Die Klimafolgenanpassung wird für Städte immer wichtiger.", "应对气候变化影响对城市来说越来越重要。"]],
  ["die Leite|nf", ["die Energieversorgung", "die Energieversorgung · die Energieversorgungen", "nf", "能源供应", "Eine sichere Energieversorgung braucht leistungsfähige Netze.", "可靠的能源供应需要高效的电网。"]],
  ["die Mafia|nf", ["die Bürgernähe", "die Bürgernähe · meist ohne Plural", "nf", "亲民性；贴近民众", "Digitale Sprechstunden können die Bürgernähe der Verwaltung erhöhen.", "数字咨询时间可以提升行政部门的亲民性。"]],
  ["der Samurai|nm", ["die Finanzierbarkeit", "die Finanzierbarkeit · meist ohne Plural", "nf", "可负担性；可融资性", "Vor dem Beschluss muss die Finanzierbarkeit des Vorhabens geklärt werden.", "通过决议前必须明确项目是否负担得起。"]],
  ["der Zombie|nm", ["die Innovationspolitik", "die Innovationspolitik · die Innovationspolitiken", "nf", "创新政策", "Die Innovationspolitik fördert den Transfer von Forschungsergebnissen in die Praxis.", "创新政策促进科研成果向实践转化。"]],
  ["der Römer|nm", ["die Gleichstellung", "die Gleichstellung · meist ohne Plural", "nf", "平等地位；平权", "Die Gleichstellung bleibt ein wichtiges Ziel der Personalpolitik.", "平权仍是人事政策的重要目标。"]],
  ["der Weltkrieg|nm", ["die Arbeitszeitregelung", "die Arbeitszeitregelung · die Arbeitszeitregelungen", "nf", "工时规定；工作时间制度", "Die neue Arbeitszeitregelung erlaubt flexiblere Schichten.", "新的工时规定允许更灵活地安排轮班。"]],
  ["der Zwerg|nm", ["die Gesundheitskompetenz", "die Gesundheitskompetenz · meist ohne Plural", "nf", "健康素养", "Verständliche Informationen stärken die Gesundheitskompetenz der Bevölkerung.", "易懂的信息能够提升民众的健康素养。"]],
  ["der Albtraum|nm", ["der Berufseinstieg", "der Berufseinstieg · die Berufseinstiege", "nm", "职业起步；进入职场", "Ein Praktikum kann den Berufseinstieg deutlich erleichtern.", "实习可以明显帮助人们顺利进入职场。"]],
  ["der Thron|nm", ["die Ressourcennutzung", "die Ressourcennutzung · die Ressourcennutzungen", "nf", "资源利用", "Eine effizientere Ressourcennutzung senkt Kosten und Emissionen.", "更高效的资源利用能够降低成本和排放。"]],
  ["das Königreich|nn", ["die Wohnungsbaupolitik", "die Wohnungsbaupolitik · die Wohnungsbaupolitiken", "nf", "住房建设政策", "Die Wohnungsbaupolitik soll mehr bezahlbaren Wohnraum ermöglichen.", "住房建设政策旨在提供更多可负担住房。"]],
  ["der Bursche|nm", ["die Fachkräftegewinnung", "die Fachkräftegewinnung · meist ohne Plural", "nf", "专业人才招募", "Flexible Arbeitsmodelle unterstützen die Fachkräftegewinnung.", "弹性工作模式有助于招募专业人才。"]],
  ["die Witwe|nf", ["die Pflegeinfrastruktur", "die Pflegeinfrastruktur · die Pflegeinfrastrukturen", "nf", "护理基础设施；照护服务体系", "Die alternde Gesellschaft benötigt eine leistungsfähige Pflegeinfrastruktur.", "老龄化社会需要完善的护理服务体系。"]],
  ["der Herzog|nm", ["die Verwaltungsdigitalisierung", "die Verwaltungsdigitalisierung · meist ohne Plural", "nf", "行政数字化", "Die Verwaltungsdigitalisierung soll Anträge schneller und einfacher machen.", "行政数字化旨在让申请办理更快捷、更简便。"]],
  ["der Stall|nm", ["die Erreichbarkeit", "die Erreichbarkeit · meist ohne Plural", "nf", "可达性；可联系性", "Längere Öffnungszeiten verbessern die Erreichbarkeit der Beratungsstelle.", "延长开放时间能够提高咨询机构的可联系性。"]],
  ["der Kai|nm", ["die Fachkräftebindung", "die Fachkräftebindung · meist ohne Plural", "nf", "专业人才留任；员工留任", "Gute Entwicklungsmöglichkeiten stärken die Fachkräftebindung.", "良好的发展机会有助于留住专业人才。"]],
  ["die Rasse|nf", ["die Antidiskriminierung", "die Antidiskriminierung · meist ohne Plural", "nf", "反歧视；反歧视工作", "Die Antidiskriminierung ist ein fester Bestandteil der Personalpolitik.", "反歧视是人事政策的固定组成部分。"]],
  ["die Mutti|nf", ["die Pflegeberatung", "die Pflegeberatung · die Pflegeberatungen", "nf", "护理咨询；照护咨询", "Eine unabhängige Pflegeberatung informiert Familien über Unterstützungsangebote.", "独立的护理咨询机构会向家庭介绍可获得的支持服务。"]],
  ["das Halloween|nn", ["die Digitalstrategie", "die Digitalstrategie · die Digitalstrategien", "nf", "数字化战略", "Die Digitalstrategie enthält konkrete Ziele für Verwaltung und Bildung.", "数字化战略为行政与教育领域设定了具体目标。"]],
]);

const dedupeCandidates = [];

function seedPairs(source) {
  return source.trim().split("\n").map((line) => {
    const parts = line.split("|");
    if (parts.length !== 2) throw new Error(`Malformed B2 dedupe seed: ${line}`);
    return parts;
  });
}

function addCompoundFamily({
  source,
  article,
  suffix,
  plural,
  patterns,
  meaningSuffix = "",
}) {
  const typeCode = article === "der" ? "nm" : article === "die" ? "nf" : "nn";
  for (const [index, [stem, meaningBase]] of seedPairs(source).entries()) {
    const noun = `${stem}${suffix}`;
    const term = `${article} ${noun}`;
    const [examplePattern, exampleZhPattern] = patterns[index % patterns.length];
    dedupeCandidates.push([
      term,
      `${term} · ${plural === "=" ? `die ${noun}` : plural ? `die ${noun}${plural}` : "meist ohne Plural"}`,
      typeCode,
      `${meaningBase}${meaningSuffix}`,
      examplePattern.replaceAll("{noun}", noun),
      exampleZhPattern.replaceAll("{meaning}", meaningBase),
    ]);
  }
}

addCompoundFamily({
  article: "der",
  suffix: "bedarf",
  plural: "",
  source: `
Beratungs|咨询需求
Investitions|投资需求
Modernisierungs|现代化改造需求
Sanierungs|修缮需求
Finanzierungs|融资需求
Unterstützungs|支持需求
Qualifizierungs|技能提升需求
Informations|信息需求
Regelungs|规范需求
Forschungs|研究需求
Handlungs|行动需求
Förder|扶持需求
Personal|人员需求
Flächen|用地需求
Energie|能源需求
Wohnraum|住房需求
Pflege|护理需求
Betreuungs|照护需求
Nachhol|补课需求
Klärungs|澄清需求
Reform|改革需求
Prüf|审查需求
Speicher|存储需求
Mobilitäts|出行需求
Schutz|保护需求
Kapazitäts|产能需求
Koordinierungs|协调需求
Entwicklungs|发展需求
Fortbildungs|进修需求
Rehabilitations|康复需求
`,
  patterns: [
    ["Der {noun} wird vor Beginn des Projekts systematisch ermittelt.", "项目启动前会系统评估{meaning}。"],
    ["Eine interne Befragung soll den {noun} genauer bestimmen.", "内部调查旨在更准确地确定{meaning}。"],
    ["Im ländlichen Raum ist der {noun} besonders hoch.", "乡村地区的{meaning}尤其高。"],
    ["Der Haushaltsentwurf berücksichtigt den steigenden {noun}.", "预算草案考虑到了不断增长的{meaning}。"],
    ["Für den tatsächlichen {noun} fehlen bislang verlässliche Daten.", "目前还缺乏有关实际{meaning}的可靠数据。"],
    ["Der Bericht macht einen erheblichen {noun} sichtbar.", "报告显示存在显著的{meaning}。"],
  ],
});

addCompoundFamily({
  article: "die",
  suffix: "quote",
  plural: "n",
  source: `
Beschäftigungs|就业率
Recycling|回收率
Rücklauf|回收反馈率
Erfolgs|成功率
Auslastungs|利用率
Teilnahme|参与率
Abbruch|中途退出率
Zustimmungs|赞成率
Impf|疫苗接种率
Export|出口比例
Eigenkapital|自有资本比率
Nutzungs|使用率
Armuts|贫困率
Geburten|出生率
Vermittlungs|就业安置率
Mietbelastungs|租金负担率
Wahlbeteiligungs|选举参与率
Erwerbs|劳动参与率
Frauen|女性比例
Betreuungs|托育覆盖率
Spar|储蓄率
Investitions|投资率
Import|进口比例
Förder|资助比例
Durchfall|不及格率
Leerstands|空置率
Teilzeit|兼职比例
Beschwerde|投诉率
Rückgabe|退货率
Erfassungs|数据覆盖率
`,
  patterns: [
    ["Die {noun} ist im vergangenen Quartal deutlich gestiegen.", "上一季度的{meaning}明显上升。"],
    ["Die {noun} blieb trotz der veränderten Bedingungen stabil.", "尽管条件发生变化，{meaning}仍保持稳定。"],
    ["Mit dem neuen Programm soll die {noun} erhöht werden.", "新项目旨在提高{meaning}。"],
    ["Die {noun} unterscheidet sich erheblich zwischen den Regionen.", "各地区的{meaning}差异很大。"],
    ["Das Institut veröffentlicht die {noun} einmal jährlich.", "该研究所每年公布一次{meaning}。"],
    ["Die unerwartet niedrige {noun} wird nun genauer untersucht.", "目前正在进一步调查为何{meaning}出乎意料地偏低。"],
  ],
});

addCompoundFamily({
  article: "die",
  suffix: "förderung",
  plural: "",
  source: `
Bildungs|教育扶持
Wirtschafts|经济扶持
Forschungs|科研资助
Nachwuchs|青年人才培养
Sprach|语言促进
Gesundheits|健康促进
Kultur|文化扶持
Regional|地区扶持
Wohnraum|住房扶持
Gründungs|创业扶持
Export|出口促进
Investitions|投资促进
Demokratie|民主促进
Talent|人才培养
Familien|家庭支持
Beschäftigungs|就业促进
Sport|体育扶持
Lese|阅读促进
Integrations|融入促进
Medien|媒体扶持
Ausbildungs|职业教育资助
Projekt|项目资助
Studien|学业资助
Technologie|技术促进
Breiten|普及性扶持
Klimaschutz|气候保护资助
Struktur|结构性扶持
Kunst|艺术扶持
Kommunal|市镇扶持
Weiterbildungs|继续教育资助
`,
  patterns: [
    ["Der Bund will die {noun} im kommenden Jahr deutlich ausbauen.", "联邦政府计划明年大幅扩大{meaning}。"],
    ["Für die {noun} stehen zusätzliche Haushaltsmittel bereit.", "目前已为{meaning}准备了额外预算资金。"],
    ["Eine Evaluation untersucht die langfristige Wirkung der {noun}.", "一项评估正在考察{meaning}的长期效果。"],
    ["Die {noun} soll vor allem benachteiligte Gruppen erreichen.", "{meaning}应主要惠及弱势群体。"],
    ["Bund und Länder koordinieren ihre Programme zur {noun} enger.", "联邦与各州正更加紧密地协调{meaning}项目。"],
    ["Transparente Kriterien sind bei der {noun} unverzichtbar.", "透明标准对{meaning}不可或缺。"],
  ],
});

addCompoundFamily({
  article: "der",
  suffix: "schutz",
  plural: "",
  source: `
Verbraucher|消费者保护
Arbeits|劳动保护
Denkmal|文物保护
Umwelt|环境保护
Gesundheits|健康保护
Lärm|噪声防护
Hochwasser|防洪保护
Arten|物种保护
Jugend|未成年人保护
Kündigungs|解雇保护
Bestands|既有权益保护
Infektions|感染防护
Brand|消防安全
Katastrophen|灾害防护
Mieter|租户保护
Küsten|海岸保护
Grundwasser|地下水保护
Persönlichkeits|人格权保护
Strahlen|辐射防护
Gewässer|水体保护
Boden|土壤保护
Nichtraucher|非吸烟者保护
Anleger|投资者保护
Opfer|受害者保护
Rechts|法律保障
Arbeitnehmer|劳动者保护
Marken|商标保护
Quellen|信息源保护
Zeugen|证人保护
Landschafts|景观保护
`,
  patterns: [
    ["Neue Vorschriften sollen den {noun} wirksam verbessern.", "新规定旨在切实加强{meaning}。"],
    ["Die zuständige Behörde kontrolliert regelmäßig den {noun}.", "主管部门定期检查{meaning}落实情况。"],
    ["Für den {noun} sind zusätzliche Investitionen erforderlich.", "加强{meaning}还需要额外投资。"],
    ["Ein verbindliches Konzept stärkt den {noun} in der Praxis.", "具有约束力的方案能够在实践中强化{meaning}。"],
    ["Beim Ausbau der Anlage muss der {noun} berücksichtigt werden.", "扩建设施时必须考虑{meaning}。"],
    ["Der Bericht nennt konkrete Defizite beim {noun}.", "报告指出了{meaning}方面的具体不足。"],
  ],
});

addCompoundFamily({
  article: "die",
  suffix: "analyse",
  plural: "n",
  source: `
Bedarfs|需求分析
Risiko|风险分析
Kosten|成本分析
Markt|市场分析
Daten|数据分析
Ursachen|原因分析
Standort|区位分析
Prozess|流程分析
Zielgruppen|目标群体分析
Potenzial|潜力分析
Wettbewerbs|竞争分析
Schwachstellen|薄弱环节分析
Umwelt|环境分析
Inhalts|内容分析
Netzwerk|网络分析
Trend|趋势分析
Szenario|情景分析
Fehler|错误分析
Bestands|现状分析
Qualifikations|资质分析
Finanz|财务分析
Medien|媒体分析
Konflikt|冲突分析
Nachhaltigkeits|可持续性分析
Sicherheits|安全分析
Sozialraum|社会空间分析
Nutzwert|效用分析
Auswirkungs|影响分析
Zeitreihen|时间序列分析
Machbarkeits|可行性分析
`,
  patterns: [
    ["Die {noun} liefert eine wichtige Grundlage für die Entscheidung.", "{meaning}为决策提供了重要依据。"],
    ["Ein unabhängiges Team führt derzeit die {noun} durch.", "一个独立团队目前正在开展{meaning}。"],
    ["Die Ergebnisse der {noun} werden vollständig veröffentlicht.", "{meaning}的结果将完整公布。"],
    ["Vor der nächsten Projektphase wird die {noun} aktualisiert.", "下一项目阶段开始前将更新{meaning}。"],
    ["Die {noun} zeigt deutliche Unterschiede zwischen den Gruppen.", "{meaning}显示各群体之间存在明显差异。"],
    ["Methodische Grenzen der {noun} werden im Bericht offen benannt.", "报告坦率说明了{meaning}在方法上的局限。"],
  ],
});

addCompoundFamily({
  article: "die",
  suffix: "strategie",
  plural: "n",
  source: `
Kommunikations|沟通战略
Bildungs|教育战略
Wachstums|增长战略
Nachhaltigkeits|可持续发展战略
Klima|气候战略
Personal|人力资源战略
Markt|市场战略
Forschungs|科研战略
Innovations|创新战略
Integrations|融合战略
Mobilitäts|出行战略
Export|出口战略
Finanzierungs|融资战略
Präventions|预防战略
Anpassungs|适应战略
Verhandlungs|谈判战略
Entwicklungs|发展战略
Marken|品牌战略
Beschaffungs|采购战略
Diversifizierungs|多元化战略
Lösungs|解决战略
Investitions|投资战略
Rekrutierungs|招聘战略
Modernisierungs|现代化战略
Energie|能源战略
Daten|数据战略
Beteiligungs|参与战略
Krisen|危机应对战略
Vertriebs|销售战略
Digitalisierungs|数字化转型战略
`,
  patterns: [
    ["Die {noun} definiert überprüfbare Ziele für die nächsten fünf Jahre.", "{meaning}为未来五年设定了可检验的目标。"],
    ["Nach der Evaluation wurde die {noun} grundlegend überarbeitet.", "评估后，{meaning}得到了全面修订。"],
    ["Die {noun} verbindet kurzfristige Maßnahmen mit langfristigen Investitionen.", "{meaning}把短期措施与长期投资结合起来。"],
    ["Für die Umsetzung der {noun} trägt ein eigenes Team Verantwortung.", "一个专门团队负责落实{meaning}。"],
    ["Der Aufsichtsrat hat der neuen {noun} einstimmig zugestimmt.", "监事会一致批准了新的{meaning}。"],
    ["Die {noun} berücksichtigt unterschiedliche regionale Bedingungen.", "{meaning}考虑了各地不同的条件。"],
  ],
});

addCompoundFamily({
  article: "das",
  suffix: "konzept",
  plural: "e",
  source: `
Bildungs|教育方案
Mobilitäts|出行方案
Sicherheits|安全方案
Hygiene|卫生方案
Nutzungs|使用方案
Finanzierungs|融资方案
Kommunikations|沟通方案
Integrations|融合方案
Wohn|居住方案
Energie|能源方案
Verkehrs|交通方案
Raum|空间方案
Betreuungs|照护方案
Weiterbildungs|继续教育方案
Präventions|预防方案
Handlungs|行动方案
Gestaltungs|设计方案
Digitalisierungs|数字化方案
Beteiligungs|参与方案
Nachhaltigkeits|可持续发展方案
Personalentwicklungs|人才发展方案
Abfall|废弃物处理方案
Notfall|应急方案
Schutz|保护方案
Versorgungs|供应保障方案
Quartiers|社区发展方案
Sanierungs|修缮方案
Betriebs|运营方案
Lern|学习方案
Flächen|用地方案
`,
  patterns: [
    ["Das {noun} wird zunächst in zwei Modellregionen erprobt.", "{meaning}将先在两个示范地区试行。"],
    ["Der Gemeinderat berät kommende Woche über das {noun}.", "市镇议会将在下周讨论{meaning}。"],
    ["Das {noun} erfüllt noch nicht alle gesetzlichen Anforderungen.", "{meaning}尚未满足全部法律要求。"],
    ["Fachleute und Betroffene haben gemeinsam am {noun} gearbeitet.", "专家与受影响群体共同参与制定了{meaning}。"],
    ["Die Finanzierung für die Umsetzung des {noun}s ist inzwischen gesichert.", "{meaning}的落实资金现已得到保障。"],
    ["Das überarbeitete {noun} enthält klare Zuständigkeiten.", "修订后的{meaning}明确规定了职责分工。"],
  ],
});

addCompoundFamily({
  article: "das",
  suffix: "verfahren",
  plural: "=",
  source: `
Bewerbungs|申请程序
Genehmigungs|审批程序
Auswahl|选拔程序
Prüf|审查程序
Vergabe|招标授予程序
Beteiligungs|参与程序
Antrags|申办程序
Schlichtungs|调解程序
Zulassungs|准入程序
Vermittlungs|调解程序
Beschwerde|投诉程序
Abstimmungs|表决程序
Mess|测量方法
Bewertungs|评估程序
Recycling|回收处理方法
Herstellungs|生产工艺
Aufnahme|录取程序
Melde|申报程序
Kontroll|检查程序
Konsultations|咨询程序
Planungs|规划程序
Einspruchs|异议程序
Ausschreibungs|招标程序
Anerkennungs|认证程序
Nachweis|证明程序
Ermittlungs|调查程序
Insolvenz|破产程序
Test|测试程序
Registrierungs|登记程序
Entscheidungs|决策程序
`,
  patterns: [
    ["Das {noun} muss transparent und nachvollziehbar gestaltet sein.", "{meaning}必须透明且可追溯。"],
    ["Das digitale {noun} verkürzt die Bearbeitungszeit erheblich.", "数字化{meaning}大幅缩短了办理时间。"],
    ["Eine unabhängige Stelle überprüft das {noun} regelmäßig.", "一个独立机构会定期审查{meaning}。"],
    ["Das {noun} wurde nach einheitlichen Kriterien durchgeführt.", "{meaning}按照统一标准实施。"],
    ["Mehrere Verbände kritisieren die Dauer des {noun}s.", "多个协会批评{meaning}耗时过长。"],
    ["Vor Beginn des {noun}s werden alle Beteiligten informiert.", "{meaning}开始前会通知所有相关人员。"],
  ],
});

addCompoundFamily({
  article: "die",
  suffix: "kompetenz",
  plural: "en",
  source: `
Führungs|领导能力
Handlungs|行动能力
Sozial|社交能力
Methoden|方法能力
Digital|数字素养
Sprach|语言能力
Problemlösungs|解决问题的能力
Beratungs|咨询能力
Kommunikations|沟通能力
Team|团队协作能力
Bewertungs|评估能力
Fach|专业能力
Selbstlern|自主学习能力
Urteils|判断能力
Daten|数据素养
Verhandlungs|谈判能力
Organisations|组织能力
Vermittlungs|协调能力
Planungs|规划能力
Entscheidungs|决策能力
`,
  patterns: [
    ["Die Fortbildung stärkt gezielt die {noun} der Teilnehmenden.", "此次培训有针对性地提升参与者的{meaning}。"],
    ["Für diese Position ist eine ausgeprägte {noun} erforderlich.", "这个职位要求具备很强的{meaning}。"],
    ["Die {noun} wird anhand praktischer Aufgaben beurteilt.", "{meaning}通过实践任务来评估。"],
    ["Im Team fehlt bislang ausreichende {noun}.", "团队目前还缺乏足够的{meaning}。"],
    ["Berufserfahrung kann die {noun} erheblich verbessern.", "工作经验能够显著增强{meaning}。"],
  ],
});

addCompoundFamily({
  article: "die",
  suffix: "maßnahme",
  plural: "n",
  source: `
Sofort|即时措施
Schutz|保护措施
Spar|节省措施
Gegen|应对措施
Präventions|预防措施
Ausgleichs|补偿措施
Hilfs|援助措施
Umbau|改建措施
Sanierungs|修缮措施
Anpassungs|调整措施
Entlastungs|减负措施
Kontroll|检查措施
Bildungs|教育措施
Qualifizierungs|技能提升措施
Integrations|融合措施
Sicherheits|安全措施
Klimaschutz|气候保护措施
Begleit|配套措施
Vorsorge|预防性措施
Infrastruktur|基础设施措施
Effizienz|效率提升措施
Unterstützungs|支持措施
Personal|人事措施
Kommunikations|沟通措施
Stabilisierungs|稳定措施
Notfall|应急措施
Wiederaufbau|重建措施
Beschleunigungs|提速措施
Eindämmungs|遏制措施
Ausbildungs|培训措施
`,
  patterns: [
    ["Die {noun} wurde unmittelbar nach Bekanntwerden des Problems eingeführt.", "问题暴露后立即采取了{meaning}。"],
    ["Die Wirkung der {noun} wird nach sechs Monaten bewertet.", "{meaning}的效果将在六个月后接受评估。"],
    ["Für die {noun} stellt das Land zusätzliche Mittel bereit.", "该州为{meaning}提供额外资金。"],
    ["Das Parlament stimmte der {noun} mit großer Mehrheit zu.", "议会以明显多数通过了{meaning}。"],
    ["Die {noun} richtet sich besonders an kleine und mittlere Betriebe.", "{meaning}主要面向中小企业。"],
    ["Ohne die {noun} wären die vereinbarten Ziele kaum erreichbar.", "如果没有{meaning}，商定目标将很难实现。"],
  ],
});

addCompoundFamily({
  article: "die",
  suffix: "regelung",
  plural: "en",
  source: `
Übergangs|过渡规定
Zugangs|准入规定
Vergütungs|薪酬规定
Datenschutz|数据保护规定
Härtefall|困难个案规定
Vertretungs|代理规定
Ausnahme|例外规定
Kosten|费用规定
Haftungs|责任规定
Pausen|休息时间规定
Tarif|工资协议规定
Fristen|期限规定
Zuständigkeits|职权规定
Nachfolge|继任规定
Beteiligungs|参与规定
Kennzeichnungs|标识规定
Aufbewahrungs|保存规定
Finanzierungs|融资规定
Nutzungs|使用规定
Rückzahlungs|还款规定
Dokumentations|记录规定
Genehmigungs|审批规定
Melde|申报规定
Wettbewerbs|竞争规则
Entschädigungs|补偿规定
`,
  patterns: [
    ["Die {noun} gilt ab dem ersten Januar für alle Betriebe.", "{meaning}从1月1日起适用于所有企业。"],
    ["Die neue {noun} klärt bislang offene Rechtsfragen.", "新的{meaning}澄清了此前悬而未决的法律问题。"],
    ["Mehrere Verbände fordern eine einfachere {noun}.", "多个协会要求制定更简明的{meaning}。"],
    ["Die {noun} wird nach zwei Jahren wissenschaftlich überprüft.", "{meaning}将在两年后接受科学评估。"],
    ["Kleine Unternehmen sind von der {noun} teilweise ausgenommen.", "小企业在一定程度上不受该{meaning}约束。"],
  ],
});

addCompoundFamily({
  article: "der",
  suffix: "prozess",
  plural: "e",
  source: `
Abstimmungs|协调过程
Entscheidungs|决策过程
Lern|学习过程
Veränderungs|变革过程
Entwicklungs|发展过程
Beteiligungs|参与过程
Planungs|规划过程
Produktions|生产流程
Bewerbungs|申请流程
Auswahl|选拔流程
Reform|改革进程
Integrations|融合过程
Transformations|转型过程
Innovations|创新过程
Digitalisierungs|数字化进程
Verhandlungs|谈判过程
Prüf|审查过程
Genehmigungs|审批过程
Anpassungs|调整过程
Kommunikations|沟通过程
Umsetzungs|落实过程
Qualitäts|质量管理流程
Beschaffungs|采购流程
Forschungs|研究过程
Sanierungs|修缮过程
`,
  patterns: [
    ["Am {noun} sind mehrere Abteilungen beteiligt.", "多个部门参与了{meaning}。"],
    ["Der {noun} geriet wegen fehlender Daten ins Stocken.", "{meaning}因缺少数据而陷入停滞。"],
    ["Jeder Schritt im {noun} wird nachvollziehbar dokumentiert.", "{meaning}中的每一步都会以可追溯方式记录。"],
    ["Mehr Transparenz soll das Vertrauen in den {noun} stärken.", "提高透明度旨在增强人们对{meaning}的信任。"],
    ["Der {noun} dauerte deutlich länger als ursprünglich geplant.", "{meaning}所需时间明显长于原计划。"],
  ],
});

addCompoundFamily({
  article: "die",
  suffix: "bewertung",
  plural: "en",
  source: `
Risiko|风险评估
Leistungs|绩效评估
Kosten|成本评估
Umwelt|环境评估
Folgen|后果评估
Qualitäts|质量评估
Projekt|项目评估
Standort|区位评估
Bedarfs|需求评估
Nutzen|效益评估
Schadens|损失评估
Gefährdungs|危险评估
Bonitäts|信用评估
Wirkungs|效果评估
Technologie|技术评估
Nachhaltigkeits|可持续性评估
Gesamt|综合评估
Einzel|个别评估
Zwischen|阶段性评估
Fremd|外部评估
Selbst|自我评估
Plausibilitäts|合理性评估
Angemessenheits|适当性评估
Vergleichs|比较评估
Datenschutz|数据保护评估
`,
  patterns: [
    ["Die {noun} erfolgt durch eine unabhängige Fachstelle.", "{meaning}由独立专业机构完成。"],
    ["Für die {noun} gelten einheitliche und veröffentlichte Kriterien.", "{meaning}采用统一且公开的标准。"],
    ["Neue Erkenntnisse führten zu einer veränderten {noun}.", "新发现使{meaning}发生了变化。"],
    ["Die vorläufige {noun} wird im Abschlussbericht überprüft.", "初步{meaning}将在最终报告中复核。"],
    ["Mehrere Perspektiven fließen in die {noun} ein.", "{meaning}综合考虑了多个视角。"],
  ],
});

function addFullDedupeLines(source) {
  for (const line of source.trim().split("\n")) {
    const parts = line.split("|");
    if (parts.length !== 6) throw new Error(`Malformed full B2 dedupe candidate: ${line}`);
    dedupeCandidates.push(parts);
  }
}

addFullDedupeLines(`
die Arbeitsbedingung|die Arbeitsbedingung · die Arbeitsbedingungen|nf|工作条件；劳动条件|Flexible Arbeitsbedingungen erleichtern vielen Eltern die Vereinbarkeit von Beruf und Familie.|灵活的工作条件让许多父母更容易兼顾工作和家庭。
die Auftragslage|die Auftragslage · meist ohne Plural|nf|订单状况；业务形势|Wegen der schwachen Auftragslage führt der Betrieb vorübergehend Kurzarbeit ein.|由于订单状况不佳，这家企业暂时实行短时工作制。
die Betriebsleitung|die Betriebsleitung · die Betriebsleitungen|nf|企业管理层；厂方领导|Die Betriebsleitung stellte den Beschäftigten den neuen Sicherheitsplan vor.|企业管理层向员工介绍了新的安全方案。
die Dienstleistung|die Dienstleistung · die Dienstleistungen|nf|服务；服务项目|Digitale Dienstleistungen müssen auch für ältere Menschen leicht zugänglich sein.|数字服务也应当便于老年人使用。
die Erwerbstätigkeit|die Erwerbstätigkeit · die Erwerbstätigkeiten|nf|就业；职业活动|Nach der Elternzeit nahm sie ihre Erwerbstätigkeit schrittweise wieder auf.|育儿假结束后，她逐步恢复了工作。
die Fachkraft|die Fachkraft · die Fachkräfte|nf|专业人员；技术人才|Das Krankenhaus sucht dringend eine Fachkraft für medizinische Geräte.|这家医院急需一名医疗设备专业人员。
die Führungsposition|die Führungsposition · die Führungspositionen|nf|领导职位；管理岗位|Für eine Führungsposition sind Fachwissen und soziale Kompetenz gleichermaßen wichtig.|担任管理岗位时，专业知识和社交能力同样重要。
die Gehaltsverhandlung|die Gehaltsverhandlung · die Gehaltsverhandlungen|nf|薪资谈判|Vor der Gehaltsverhandlung sammelte sie konkrete Belege für ihre Leistungen.|薪资谈判前，她收集了能证明自己业绩的具体材料。
die Geschäftsführung|die Geschäftsführung · die Geschäftsführungen|nf|公司管理层；经营管理|Die Geschäftsführung will sämtliche Standorte erhalten.|公司管理层希望保留所有营业地点。
die Kundenbindung|die Kundenbindung · meist ohne Plural|nf|客户维系；顾客忠诚度|Ein verlässlicher Kundendienst stärkt die Kundenbindung langfristig.|可靠的客户服务能长期增强顾客忠诚度。
die Marktanalyse|die Marktanalyse · die Marktanalysen|nf|市场分析|Die Marktanalyse zeigt eine wachsende Nachfrage nach reparierbaren Geräten.|市场分析显示，可维修设备的需求正在增长。
die Produktentwicklung|die Produktentwicklung · die Produktentwicklungen|nf|产品开发|Bei der Produktentwicklung werden Rückmeldungen aus dem Kundendienst berücksichtigt.|产品开发会参考客户服务部门的反馈。
die Unternehmensführung|die Unternehmensführung · die Unternehmensführungen|nf|企业管理；公司治理|Eine verantwortungsvolle Unternehmensführung berücksichtigt auch ökologische Folgen.|负责任的企业管理也会考虑生态影响。
die Datenschutzbestimmung|die Datenschutzbestimmung · die Datenschutzbestimmungen|nf|数据保护规定|Die neue App erfüllt die geltenden Datenschutzbestimmungen.|这款新应用符合现行的数据保护规定。
die Entscheidungsfreiheit|die Entscheidungsfreiheit · meist ohne Plural|nf|选择自由；决定自主权|Zu viele Vorgaben schränken die Entscheidungsfreiheit der Teams unnötig ein.|过多规定会不必要地限制团队的自主决定权。
die Gleichberechtigung|die Gleichberechtigung · meist ohne Plural|nf|平等权利；性别平等|Das Unternehmen misst der Gleichberechtigung bei Beförderungen große Bedeutung bei.|这家公司高度重视晋升过程中的平等权利。
die Sozialleistung|die Sozialleistung · die Sozialleistungen|nf|社会福利；社会保障给付|Bestimmte Sozialleistungen müssen jedes Jahr neu beantragt werden.|某些社会福利需要每年重新申请。
die Zivilgesellschaft|die Zivilgesellschaft · die Zivilgesellschaften|nf|公民社会|Eine lebendige Zivilgesellschaft kann politische Entscheidungen kritisch begleiten.|活跃的公民社会可以对政治决策进行批判性监督。
das Bürgerengagement|das Bürgerengagement · meist ohne Plural|nn|公民参与；社会志愿行动|Durch Bürgerengagement entstand auf dem freien Grundstück ein Gemeinschaftsgarten.|在公民参与下，空地上建成了一座社区花园。
der Lebensstandard|der Lebensstandard · die Lebensstandards|nm|生活水平|Steigende Mieten bedrohen den Lebensstandard vieler Haushalte mit geringem Einkommen.|不断上涨的房租威胁着许多低收入家庭的生活水平。
der Wertewandel|der Wertewandel · meist ohne Plural|nm|价值观变迁|Der Wertewandel zeigt sich unter anderem in neuen Vorstellungen von Arbeit und Freizeit.|价值观变迁也体现在人们对工作和休闲的新看法中。
die Abschlussarbeit|die Abschlussarbeit · die Abschlussarbeiten|nf|毕业论文；结业作业|In ihrer Abschlussarbeit untersucht sie die Mobilität im ländlichen Raum.|她在毕业论文中研究农村地区的出行问题。
die Aufnahmeprüfung|die Aufnahmeprüfung · die Aufnahmeprüfungen|nf|入学考试；录取考试|Für den Studiengang Musik ist eine praktische Aufnahmeprüfung erforderlich.|音乐专业要求参加实践类入学考试。
die Fortbildung|die Fortbildung · die Fortbildungen|nf|进修；职业培训|Die Fortbildung vermittelt aktuelle Methoden der digitalen Beratung.|这次进修教授数字化咨询的最新方法。
der Bildungsabschluss|der Bildungsabschluss · die Bildungsabschlüsse|nm|学历；教育阶段结业资格|Ein anerkannter Bildungsabschluss verbessert die Chancen auf dem Arbeitsmarkt.|受认可的学历能提高就业市场上的机会。
der Studiengang|der Studiengang · die Studiengänge|nm|大学专业；课程项目|Der neue Studiengang verbindet Informatik mit Umweltwissenschaften.|这个新专业把计算机科学与环境科学结合起来。
die Studienberatung|die Studienberatung · die Studienberatungen|nf|学业咨询；大学专业咨询|Die Studienberatung hilft bei der Wahl geeigneter Schwerpunktmodule.|学业咨询会协助选择合适的重点模块。
die Abfallvermeidung|die Abfallvermeidung · meist ohne Plural|nf|垃圾减量；废弃物预防|Mehrwegbehälter leisten einen wichtigen Beitrag zur Abfallvermeidung.|可重复使用的容器对减少垃圾很有帮助。
die Artenvielfalt|die Artenvielfalt · meist ohne Plural|nf|生物多样性；物种多样性|Blühende Randstreifen fördern die Artenvielfalt auf landwirtschaftlichen Flächen.|开花的田边带能促进农田的生物多样性。
die Lärmbelästigung|die Lärmbelästigung · die Lärmbelästigungen|nf|噪声干扰；噪声污染|Neue Fenster sollen die Lärmbelästigung an der Hauptstraße verringern.|新窗户旨在降低主干道旁的噪声干扰。
die Luftqualität|die Luftqualität · die Luftqualitäten|nf|空气质量|Zusätzliche Grünflächen können die Luftqualität in dicht bebauten Vierteln verbessern.|增加绿地可以改善高密度城区的空气质量。
die Schadstoffbelastung|die Schadstoffbelastung · die Schadstoffbelastungen|nf|污染物负荷；有害物质污染|Messungen ergaben eine deutlich geringere Schadstoffbelastung als im Vorjahr.|测量结果显示，污染物负荷明显低于上一年。
die Stadtentwicklung|die Stadtentwicklung · die Stadtentwicklungen|nf|城市发展；城市规划进程|Bei der Stadtentwicklung sollen kurze Wege und bezahlbare Wohnungen Vorrang haben.|城市发展应优先考虑短距离出行和可负担住房。
der Naturschutz|der Naturschutz · meist ohne Plural|nm|自然保护；生态保护|Touristische Angebote müssen mit den Zielen des Naturschutzes vereinbar sein.|旅游项目必须与自然保护目标相协调。
der Wasserverbrauch|der Wasserverbrauch · meist ohne Plural|nm|用水量；水资源消耗|Eine moderne Bewässerungsanlage senkt den Wasserverbrauch erheblich.|现代灌溉系统能显著降低用水量。
die Digitalisierung|die Digitalisierung · die Digitalisierungen|nf|数字化；数字转型|Die Digitalisierung der Verwaltung verkürzt viele Bearbeitungszeiten.|行政数字化缩短了许多业务的办理时间。
die Informationsquelle|die Informationsquelle · die Informationsquellen|nf|信息来源；资料来源|Vor der Veröffentlichung sollte jede Informationsquelle sorgfältig geprüft werden.|发布前应仔细核查每一个信息来源。
die Netzabdeckung|die Netzabdeckung · meist ohne Plural|nf|网络覆盖；信号覆盖|In abgelegenen Regionen bleibt die Netzabdeckung häufig lückenhaft.|偏远地区的网络覆盖仍常常不完整。
die Nutzeroberfläche|die Nutzeroberfläche · die Nutzeroberflächen|nf|用户界面|Die überarbeitete Nutzeroberfläche ist auch auf kleinen Bildschirmen übersichtlich.|重新设计的用户界面在小屏幕上也很清晰。
die Suchfunktion|die Suchfunktion · die Suchfunktionen|nf|搜索功能|Mit der erweiterten Suchfunktion lassen sich Ergebnisse nach Datum filtern.|使用高级搜索功能可以按日期筛选结果。
die Systemanforderung|die Systemanforderung · die Systemanforderungen|nf|系统要求；运行条件|Vor der Installation sollten die Systemanforderungen überprüft werden.|安装前应检查系统要求。
die Zugangsdaten|die Zugangsdaten · nur Plural|nf|登录信息；访问凭证|Aus Sicherheitsgründen dürfen Zugangsdaten nicht per E-Mail weitergegeben werden.|出于安全原因，不得通过电子邮件转发登录信息。
der Datenverlust|der Datenverlust · die Datenverluste|nm|数据丢失|Regelmäßige Sicherungskopien schützen vor einem dauerhaften Datenverlust.|定期备份可以防止永久性数据丢失。
der Funktionsumfang|der Funktionsumfang · die Funktionsumfänge|nm|功能范围；功能配置|Der Funktionsumfang der kostenlosen Version reicht für kleine Projekte aus.|免费版本的功能范围足以满足小型项目。
die Arbeitsunfähigkeit|die Arbeitsunfähigkeit · meist ohne Plural|nf|无法工作；丧失劳动能力|Bei längerer Arbeitsunfähigkeit verlangt die Versicherung zusätzliche Nachweise.|长期无法工作时，保险机构会要求额外证明。
die Gesundheitsvorsorge|die Gesundheitsvorsorge · meist ohne Plural|nf|健康预防；保健|Regelmäßige Bewegung gehört zu einer wirksamen Gesundheitsvorsorge.|规律运动是有效健康预防的一部分。
die Lebenserwartung|die Lebenserwartung · die Lebenserwartungen|nf|预期寿命；寿命预期|Die durchschnittliche Lebenserwartung hängt von zahlreichen sozialen Faktoren ab.|平均预期寿命取决于许多社会因素。
die Nebenwirkung|die Nebenwirkung · die Nebenwirkungen|nf|副作用；附带影响|Bei ungewöhnlichen Nebenwirkungen sollte die Behandlung ärztlich überprüft werden.|出现异常副作用时，应请医生检查治疗方案。
die Schmerzbehandlung|die Schmerzbehandlung · die Schmerzbehandlungen|nf|疼痛治疗；止痛治疗|Die Schmerzbehandlung wird an die individuelle Situation des Patienten angepasst.|疼痛治疗会根据患者的具体情况进行调整。
die Vorsorgeuntersuchung|die Vorsorgeuntersuchung · die Vorsorgeuntersuchungen|nf|预防性体检；筛查|Die Krankenkasse erinnert ihre Mitglieder an die nächste Vorsorgeuntersuchung.|医保机构会提醒参保人进行下一次预防性体检。
die Genesung|die Genesung · die Genesungen|nf|康复；痊愈|Ausreichender Schlaf kann die Genesung nach einer Infektion unterstützen.|充足睡眠有助于感染后的康复。
der Bewegungsmangel|der Bewegungsmangel · meist ohne Plural|nm|缺乏运动|Langes Sitzen und Bewegungsmangel erhöhen das Risiko für Rückenbeschwerden.|久坐和缺乏运动会增加背部不适的风险。
der Gesundheitszustand|der Gesundheitszustand · die Gesundheitszustände|nm|健康状况|Vor dem Eingriff wird der allgemeine Gesundheitszustand gründlich untersucht.|手术前会全面检查整体健康状况。
die Betriebskosten|die Betriebskosten · nur Plural|nf|运营成本；房屋杂费|Die Betriebskosten sind wegen der höheren Energiepreise deutlich gestiegen.|由于能源价格上涨，运营成本明显增加了。
die Wohnungsnot|die Wohnungsnot · meist ohne Plural|nf|住房短缺；住房危机|Die Stadt reagiert auf die Wohnungsnot mit einem beschleunigten Bauprogramm.|该市通过加快住房建设来应对住房短缺。
die Verkehrsbelastung|die Verkehrsbelastung · die Verkehrsbelastungen|nf|交通压力；交通污染负担|Eine neue Umgehungsstraße soll die Verkehrsbelastung im Ortszentrum reduzieren.|新建绕行道路旨在减轻镇中心的交通压力。
die Raumaufteilung|die Raumaufteilung · die Raumaufteilungen|nf|空间布局；房间划分|Durch die offene Raumaufteilung gelangt mehr Tageslicht in die Wohnung.|开放式空间布局让更多自然光进入住宅。
die Instandhaltung|die Instandhaltung · die Instandhaltungen|nf|维护；保养|Für die Instandhaltung der Brücke sind regelmäßige Kontrollen erforderlich.|桥梁维护需要定期检查。
die Energieeinsparung|die Energieeinsparung · die Energieeinsparungen|nf|节能；能源节约|Eine bessere Dämmung ermöglicht eine beträchtliche Energieeinsparung.|更好的保温措施可以显著节能。
die Ausdrucksweise|die Ausdrucksweise · die Ausdrucksweisen|nf|表达方式；措辞风格|Seine sachliche Ausdrucksweise trug zur Beruhigung der Diskussion bei.|他客观的表达方式有助于缓和讨论气氛。
`);

const fieldCorrections = new Map([
  ["soeben|adj", { forms: "soeben · unveränderlich", typeCode: "adv", meaning: "刚才；方才", example: "Die soeben veröffentlichten Zahlen liegen über den Erwartungen.", exampleZh: "刚刚公布的数据高于预期。" }],
  ["der Schoss|nm", { term: "der Schoß", forms: "der Schoß · die Schöße", meaning: "膝部；怀抱", example: "Das Kind schlief friedlich auf dem Schoß seiner Mutter.", exampleZh: "孩子安静地睡在母亲膝上。" }],
  ["just|adj", { forms: "just · unveränderlich", typeCode: "adv", meaning: "恰好；刚刚", example: "Just in diesem Moment fiel der Strom aus.", exampleZh: "就在这一刻，停电了。" }],
  ["psst|adj", { forms: "psst · unveränderlich", typeCode: "intj", meaning: "嘘；安静", example: "Psst, die Aufnahme hat schon begonnen!", exampleZh: "嘘，录制已经开始了！" }],
  ["alternative|adj", { term: "alternativ", forms: "alternativ · als Adjektiv", meaning: "可替代的；另类的", example: "Wir prüfen eine alternative Lösung mit geringeren Kosten.", exampleZh: "我们正在评估一种成本更低的替代方案。" }],
  ["gefälligst|adj", { forms: "gefälligst · unveränderlich", typeCode: "adv", meaning: "最好；务必（带强硬语气）", example: "Halten Sie sich gefälligst an die vereinbarten Regeln!", exampleZh: "请务必遵守商定的规则！" }],
  ["sowie|adj", { forms: "sowie · unveränderlich", typeCode: "conj", meaning: "以及；并且；一……就", example: "Der Bericht enthält Zahlen sowie konkrete Empfehlungen.", exampleZh: "报告中包含数据以及具体建议。" }],
  ["zweifellos|adj", { forms: "zweifellos · unveränderlich", typeCode: "adv", meaning: "无疑；毫无疑问", example: "Diese Maßnahme ist zweifellos ein Schritt in die richtige Richtung.", exampleZh: "这项措施无疑是朝正确方向迈出的一步。" }],
  ["nebenbei|adj", { forms: "nebenbei · unveränderlich", typeCode: "adv", meaning: "顺便；此外；兼职地", example: "Nebenbei betreibt er einen kleinen Übersetzungsdienst.", exampleZh: "他还兼职经营一家小型翻译服务。" }],
  ["einschließlich|adj", { forms: "einschließlich · unveränderlich", typeCode: "prep", meaning: "包括；连同", example: "Der Preis beträgt einschließlich aller Gebühren neunzig Euro.", exampleZh: "价格包括所有费用在内共九十欧元。" }],
  ["demnächst|adj", { forms: "demnächst · unveränderlich", typeCode: "adv", meaning: "不久；近期", example: "Die Ergebnisse werden demnächst veröffentlicht.", exampleZh: "研究结果将于近期公布。" }],
  ["zugegeben|adj", { forms: "zugegeben · unveränderlich", typeCode: "adv", meaning: "诚然；的确", example: "Zugegeben, die Lösung ist nicht besonders elegant.", exampleZh: "诚然，这个解决方案并不十分巧妙。" }],
  ["hierbei|adj", { forms: "hierbei · unveränderlich", typeCode: "adv", meaning: "在此过程中；就此", example: "Hierbei sind die gesetzlichen Fristen zu beachten.", exampleZh: "在此过程中必须遵守法定期限。" }],
  ["der Professor|nm", { meaning: "教授；大学教师", example: "Der Professor leitet ein internationales Forschungsprojekt.", exampleZh: "这位教授主持一个国际科研项目。" }],
  ["Respekt|intj", { meaning: "佩服；真厉害", example: "Respekt, das war eine überzeugende Präsentation!", exampleZh: "佩服，这场展示很有说服力！" }],
  ["der Knochen|nm", { meaning: "骨头；骨骼", example: "Regelmäßige Bewegung stärkt Muskeln und Knochen.", exampleZh: "经常运动能够增强肌肉和骨骼。" }],
  ["der Magen|nm", { meaning: "胃；肚子", example: "Das Medikament sollte nicht auf leeren Magen eingenommen werden.", exampleZh: "这种药不应空腹服用。" }],
  ["der Roman|nm", { meaning: "长篇小说", example: "Der Roman erzählt die Geschichte einer Familie über drei Generationen.", exampleZh: "这部长篇小说讲述了一个家族三代人的故事。" }],
  ["die Tour|nf", { meaning: "旅程；游览；巡回活动", example: "Die geführte Tour durch das Viertel dauerte zwei Stunden.", exampleZh: "由向导带领的街区游览持续了两小时。" }],
  ["der Text|nm", { meaning: "文本；文章；歌词", example: "Der Text fasst die wichtigsten Argumente verständlich zusammen.", exampleZh: "这篇文章清楚总结了最重要的论点。" }],
  ["das Netz|nn", { meaning: "网；网络；电网", example: "Der Ausbau des Netzes ist für erneuerbare Energien entscheidend.", exampleZh: "扩建电网对发展可再生能源至关重要。" }],
  ["das Gerede|nn", { meaning: "闲谈；议论；空话", example: "Das ständige Gerede über angebliche Kürzungen verunsichert viele Beschäftigte.", exampleZh: "关于所谓削减的不断议论让许多员工感到不安。" }],
  ["verschlossen|adj", { meaning: "锁着的；沉默寡言的", example: "Die vertraulichen Akten werden in einem verschlossenen Schrank aufbewahrt.", exampleZh: "机密档案存放在上锁的柜子里。" }],
  ["beißen|v", { meaning: "咬；刺痛；（颜色）冲突", example: "Die beiden kräftigen Farben beißen sich.", exampleZh: "这两种鲜艳颜色互不协调。" }],
  ["abgenommen|adj", { meaning: "减少的；变瘦的；取下的", example: "Die deutlich abgenommene Nachfrage zwingt den Betrieb zum Umdenken.", exampleZh: "明显下降的需求迫使企业重新思考战略。" }],
  ["feststellen|v", { meaning: "查明；发现；确定", example: "Die Prüfer stellten mehrere Abweichungen fest.", exampleZh: "审核人员发现了多处偏差。" }],
  ["respektieren|v", { meaning: "尊重；遵守", example: "Wir müssen unterschiedliche Lebensentwürfe respektieren.", exampleZh: "我们必须尊重不同的生活选择。" }],
  ["abhängen|v", { meaning: "取下；取决于", example: "Der Erfolg hängt von einer guten Vorbereitung ab.", exampleZh: "成功取决于良好的准备。" }],
  ["das Fernsehen|nn", { meaning: "电视；电视媒体", example: "Das Fernsehen berichtet live über die Wahl.", exampleZh: "电视媒体对选举进行现场直播。" }],
  ["fernsehen|v", { meaning: "看电视", example: "Am Wochenende sehe ich nur selten fern.", exampleZh: "我周末很少看电视。" }],
  ["die Technologie|nf", { meaning: "技术；工艺", example: "Diese Technologie senkt den Energieverbrauch erheblich.", exampleZh: "这项技术显著降低了能源消耗。" }],
  ["durchaus|adj", { forms: "durchaus · unveränderlich", typeCode: "adv", meaning: "完全；确实；相当", example: "Der Vorschlag ist durchaus sinnvoll, muss aber genauer geprüft werden.", exampleZh: "这项建议确实有道理，但还需要更仔细地评估。" }],
  ["vielmals|adj", { forms: "vielmals · unveränderlich", typeCode: "adv", meaning: "非常；多次", example: "Vielen Dank, auch von meiner Seite nochmals und vielmals!", exampleZh: "我也要再次向您表示衷心感谢！" }],
  ["nochmals|adj", { forms: "nochmals · unveränderlich", typeCode: "adv", meaning: "再次；再一遍", example: "Bitte prüfen Sie die Zahlen vor der Veröffentlichung nochmals.", exampleZh: "发布前请再核对一遍这些数据。" }],
  ["zufolge|adj", { forms: "zufolge · nachgestellt", typeCode: "prep", meaning: "根据；依照", example: "Dem Bericht zufolge ist die Nachfrage deutlich gestiegen.", exampleZh: "根据报告，需求明显增长。" }],
  ["hinunter|adj", { forms: "hinunter · unveränderlich", typeCode: "adv", meaning: "向下；下去", example: "Vom Aussichtspunkt führt ein schmaler Weg ins Tal hinunter.", exampleZh: "一条狭窄的小路从观景台向下通往山谷。" }],
  ["sowohl|adj", { forms: "sowohl · unveränderlich", typeCode: "conj", meaning: "既……又……；两者都", example: "Das Angebot richtet sich sowohl an Studierende als auch an Berufstätige.", exampleZh: "这项服务既面向学生，也面向在职人员。" }],
  ["die Mülltrennung|nf", { meaning: "垃圾分类", example: "Konsequente Mülltrennung erleichtert das Recycling.", exampleZh: "严格的垃圾分类有助于回收利用。" }],
  ["die Lust|nf", { meaning: "兴趣；欲望；意愿", example: "Hast du Lust, nach der Arbeit noch etwas trinken zu gehen?", exampleZh: "你下班后想不想一起去喝点东西？" }],
  ["schuldig|adj", { meaning: "有罪的；有过错的；欠……的", example: "Das Gericht erklärte den Angeklagten für nicht schuldig.", exampleZh: "法院判定被告无罪。" }],
  ["schützen|v", { meaning: "保护；防护", example: "Klare Regeln sollen persönliche Daten besser schützen.", exampleZh: "明确的规定旨在更好地保护个人数据。" }],
  ["teilen|v", { meaning: "分开；分享；除以", example: "Die Arbeitsgruppe teilt ihre Ergebnisse mit der Öffentlichkeit.", exampleZh: "工作组向公众分享其研究结果。" }],
  ["die Möglichkeit|nf", { meaning: "可能性；机会；可行办法", example: "Die Teilnehmenden haben die Möglichkeit, eigene Fragen einzureichen.", exampleZh: "参与者有机会提交自己的问题。" }],
  ["halb|adj", { meaning: "一半的；半；不完全的", example: "Die Sitzung dauerte nur eine halbe Stunde.", exampleZh: "会议只持续了半小时。" }],
  ["die Kohle|nf", { meaning: "煤；煤炭；钱（口语）", example: "Der Anteil der Kohle an der Stromerzeugung ist deutlich gesunken.", exampleZh: "煤炭在发电中的占比已经明显下降。" }],
  ["der Griff|nm", { meaning: "把手；抓握；控制", example: "Mit klaren Maßnahmen bekam die Leitung die Kosten wieder in den Griff.", exampleZh: "管理层通过明确措施重新控制住了成本。" }],
  ["Gesundheit|intj", { meaning: "保重；祝你健康（他人打喷嚏时）", example: "„Gesundheit!“ – „Danke!“", exampleZh: "“祝你健康！”——“谢谢！”" }],
  ["der Schild|nm", { term: "das Schild", forms: "das Schild · die Schilder", typeCode: "nn", meaning: "标牌；指示牌", example: "Auf dem Schild steht, dass der Weg gesperrt ist.", exampleZh: "标牌上写着这条路已封闭。" }],
  ["der Frieden|nm", { forms: "der Frieden · meist ohne Plural", meaning: "和平；和睦", example: "Dauerhafter Frieden setzt Vertrauen und Dialog voraus.", exampleZh: "持久和平以信任和对话为前提。" }],
  ["das Streaming|nn", { forms: "das Streaming · meist ohne Plural", meaning: "流媒体播放；串流", example: "Streaming verändert die Nutzung von Filmen und Musik.", exampleZh: "流媒体改变了人们使用电影和音乐的方式。" }],
  ["die Batterie|nf", { meaning: "电池；蓄电池", example: "Die Batterie des Geräts lässt sich austauschen.", exampleZh: "这台设备的电池可以更换。" }],
  ["abschneiden|v", { meaning: "剪下；切断；表现", example: "Das Unternehmen schnitt im Nachhaltigkeitsvergleich gut ab.", exampleZh: "这家企业在可持续性比较中表现良好。" }],
  ["nützen|v", { meaning: "有用；有益于", example: "Die neue Regelung nützt vor allem kleinen Betrieben.", exampleZh: "新规定主要使小企业受益。" }],
  ["die Schüssel|nf", { meaning: "碗；盆；卫星天线（口语）", example: "Sie mischte alle Zutaten in einer großen Schüssel.", exampleZh: "她把所有原料放在一个大碗里混合。" }],
  ["beraten|v", { meaning: "为……提供建议；商议", example: "Eine unabhängige Stelle berät Verbraucher kostenlos.", exampleZh: "一个独立机构免费为消费者提供咨询。" }],
  ["läuten|v", { meaning: "敲响；鸣响", example: "Pünktlich um acht Uhr läuteten die Glocken.", exampleZh: "八点整，钟声准时响起。" }],
  ["umkehren|v", { meaning: "返回；掉头；逆转", example: "Wegen des Unwetters musste die Gruppe umkehren.", exampleZh: "由于恶劣天气，这群人不得不返回。" }],
  ["belügen|v", { meaning: "欺骗；对……撒谎", example: "Wer andere bewusst belügt, verliert schnell ihr Vertrauen.", exampleZh: "故意欺骗他人的人很快就会失去对方的信任。" }],
  ["sorgfältig|adj", { meaning: "仔细的；周密的", example: "Die Daten müssen sorgfältig geprüft und dokumentiert werden.", exampleZh: "这些数据必须经过仔细核查并加以记录。" }],
  ["unerträglich|adj", { meaning: "难以忍受的；无法容忍的", example: "Ohne ausreichende Lüftung wurde die Hitze im Raum unerträglich.", exampleZh: "通风不足使室内的高温变得难以忍受。" }],
  ["verirrt|adj", { meaning: "迷路的；误入的", example: "Ein verirrter Wanderer bat die Bergwacht um Hilfe.", exampleZh: "一名迷路的徒步者向山地救援队求助。" }],
  ["gesammelt|adj", { meaning: "收集起来的；沉着的", example: "Die gesammelt vorgetragenen Argumente überzeugten das Publikum.", exampleZh: "沉着陈述的论点说服了听众。" }],
  ["bezeichnet|adj", { meaning: "被称作的；标明的", example: "Die als vertraulich bezeichneten Unterlagen dürfen nicht kopiert werden.", exampleZh: "标为机密的材料不得复制。" }],
  ["entstehen|v", { meaning: "产生；形成；出现", example: "Durch die Zusammenarbeit entstanden mehrere neue Projektideen.", exampleZh: "通过合作产生了多个新的项目构想。" }],
  ["das Zeichen|nn", { meaning: "符号；标志；迹象", example: "Die sinkende Nachfrage ist ein deutliches Zeichen für den Strukturwandel.", exampleZh: "需求下降是结构转型的明显迹象。" }],
  ["der Verstand|nm", { meaning: "理智；理解力；头脑", example: "Bei schwierigen Entscheidungen sind Verstand und Erfahrung gleichermaßen wichtig.", exampleZh: "作出困难决定时，理智与经验同样重要。" }],
  ["der Draht|nm", { meaning: "金属丝；电线；联系", example: "Das Gerät wird über einen dünnen Draht mit dem Sensor verbunden.", exampleZh: "设备通过一根细电线与传感器相连。" }],
  ["der Tower|nm", { meaning: "塔楼；塔台；台式计算机主机", example: "Der Tower am Flughafen koordiniert alle Starts und Landungen.", exampleZh: "机场塔台协调所有航班的起飞和降落。" }],
  ["der Lauf|nm", { meaning: "奔跑；进程；水道；枪管", example: "Im Laufe des Projekts wurden die Ziele mehrfach angepasst.", exampleZh: "在项目推进过程中，目标被多次调整。" }],
  ["ewig|adj", { meaning: "永恒的；没完没了的", example: "Die ewige Suche nach einer perfekten Lösung kostet unnötig Zeit.", exampleZh: "没完没了地寻找完美方案会浪费不必要的时间。" }],
  ["erneuerbar|adj", { meaning: "可再生的", example: "Bis 2035 soll ein größerer Anteil des Stroms aus erneuerbaren Quellen stammen.", exampleZh: "到2035年，更大比例的电力将来自可再生能源。" }],
  ["die Freiheit|nf", { meaning: "自由；自由权；自主空间", example: "Pressefreiheit ist ein wesentlicher Bestandteil einer Demokratie.", exampleZh: "新闻自由是民主制度的重要组成部分。" }],
  ["das Leiden|nn", { meaning: "痛苦；病痛", example: "Eine frühe Diagnose kann unnötiges Leiden verhindern.", exampleZh: "及早诊断可以避免不必要的痛苦。" }],
  ["dringend|adj", { meaning: "紧急的；迫切的", example: "Die beschädigte Brücke muss dringend repariert werden.", exampleZh: "受损的桥梁必须尽快修复。" }],
  ["erlaubt|adj", { meaning: "被允许的；许可的", example: "Private Telefongespräche sind während der Arbeitszeit nur in Ausnahmefällen erlaubt.", exampleZh: "工作时间内只有在特殊情况下才允许打私人电话。" }],
  ["stehlen|v", { meaning: "偷；窃取", example: "Unbekannte stahlen mehrere Computer aus dem Büro.", exampleZh: "不明身份的人从办公室偷走了多台电脑。" }],
  ["der Dienst|nm", { meaning: "服务；值班；职务", example: "Der technische Dienst ist rund um die Uhr erreichbar.", exampleZh: "技术服务部门全天候可以联系。" }],
  ["verfolgen|v", { meaning: "追踪；关注；追求", example: "Die Kommission verfolgt das Ziel, die Verfahren zu vereinfachen.", exampleZh: "委员会致力于简化程序。" }],
  ["das Fass|nn", { meaning: "桶；大桶", example: "Das Öl wird in dicht verschlossenen Fässern gelagert.", exampleZh: "油被存放在密封的大桶中。" }],
  ["das Verlangen|nn", { forms: "das Verlangen · meist ohne Plural", meaning: "欲望；要求；渴望", example: "Das Verlangen nach flexibleren Arbeitszeiten nimmt zu.", exampleZh: "人们对更灵活工作时间的需求正在增加。" }],
  ["die Braut|nf", { meaning: "新娘；订婚女子", example: "Die Braut und der Bräutigam begrüßten ihre Gäste persönlich.", exampleZh: "新娘和新郎亲自迎接宾客。" }],
  ["die Flucht|nf", { meaning: "逃离；逃亡；逃避", example: "Viele Familien mussten wegen des Hochwassers die Flucht ergreifen.", exampleZh: "许多家庭因洪水不得不逃离家园。" }],
  ["locker|adj", { meaning: "松的；宽松的；轻松的", example: "Die Schraube sitzt locker und muss nachgezogen werden.", exampleZh: "螺丝松了，需要重新拧紧。" }],
  ["knapp|adj", { meaning: "紧缺的；勉强的；简短的", example: "Bezahlbarer Wohnraum ist in der Innenstadt knapp.", exampleZh: "市中心的可负担住房十分紧缺。" }],
  ["die Presse|nf", { meaning: "新闻界；媒体；压榨机", example: "Die Ministerin beantwortete anschließend die Fragen der Presse.", exampleZh: "部长随后回答了媒体提问。" }],
  ["selten|adj", { meaning: "少见的；罕见的；很少", example: "Solche technischen Störungen sind inzwischen selten.", exampleZh: "这样的技术故障如今已经很少见。" }],
  ["beten|v", { meaning: "祈祷；祷告", example: "Viele Gläubige beten regelmäßig für Frieden.", exampleZh: "许多信徒经常为和平祈祷。" }],
  ["der Linguist|nm", { meaning: "语言学家", example: "Der Linguist untersucht den Wandel regionaler Dialekte.", exampleZh: "这位语言学家研究地区方言的变化。" }],
  ["der Krebs|nm", { meaning: "癌症；螃蟹；巨蟹座", example: "Die Forschung verbessert die Früherkennung von Krebs.", exampleZh: "研究正在改善癌症的早期发现。" }],
  ["die Quelle|nf", { meaning: "来源；源头；泉水", example: "Jede wissenschaftliche Aussage sollte durch eine verlässliche Quelle belegt sein.", exampleZh: "每项科学论断都应有可靠来源作为依据。" }],
  ["der Geschmack|nm", { meaning: "味道；味觉；审美品味", example: "Über Geschmack lässt sich bekanntlich streiten.", exampleZh: "众所周知，审美品味见仁见智。" }],
  ["das Publikum|nn", { forms: "das Publikum · die Publika", meaning: "观众；听众；读者群", example: "Der Vortrag richtete sich an ein breites Publikum.", exampleZh: "这场报告面向广泛的听众群体。" }],
  ["streng|adj", { meaning: "严格的；严厉的；严密的", example: "Für den Umgang mit vertraulichen Daten gelten strenge Regeln.", exampleZh: "处理机密数据时适用严格规定。" }],
  ["der Wolf|nm", { meaning: "狼", example: "Der Wolf ist in mehrere Regionen Deutschlands zurückgekehrt.", exampleZh: "狼已经重新出现在德国的多个地区。" }],
  ["der Terminus|nm", { meaning: "术语；专业用语", example: "Der Terminus wird in der Fachliteratur unterschiedlich verwendet.", exampleZh: "这个术语在专业文献中的用法并不一致。" }],
  ["der Violinist|nm", { meaning: "小提琴家；小提琴演奏者", example: "Der Violinist trat gemeinsam mit dem städtischen Orchester auf.", exampleZh: "这位小提琴家与市立乐团共同演出。" }],
  ["die Fremde|nf", { forms: "die Fremde · meist ohne Plural", meaning: "异乡；国外；陌生环境", example: "In der Fremde vermisste sie besonders ihre Familie.", exampleZh: "身在异乡时，她尤其思念家人。" }],
  ["der Fensterrahmen|nm", { meaning: "窗框", example: "Undichte Fensterrahmen erhöhen den Energieverbrauch des Gebäudes.", exampleZh: "漏风的窗框会增加建筑能耗。" }],
  ["der Klang|nm", { meaning: "声音；音色；声响", example: "Der Saal ist für seinen warmen Klang bekannt.", exampleZh: "这个大厅以温暖的音色效果而闻名。" }],
  ["das Rinderhack|nn", { forms: "das Rinderhack · meist ohne Plural", meaning: "牛肉馅；碎牛肉", example: "Das Rinderhack muss bis zur Zubereitung kühl gelagert werden.", exampleZh: "碎牛肉在烹饪前必须冷藏保存。" }],
  ["die Politik|nf", { meaning: "政治；政策；方针", example: "Die Politik muss langfristige Lösungen für den Wohnraummangel entwickeln.", exampleZh: "政治决策需要为住房短缺制定长期解决方案。" }],
  ["richten|v", { meaning: "对准；安排；修复；评判", example: "Bitte richten Sie Ihre Anfrage an die zuständige Abteilung.", exampleZh: "请把您的询问提交给主管部门。" }],
  ["die Heimat|nf", { meaning: "故乡；家园；祖国", example: "Viele Menschen verbinden Heimat mit Sprache und persönlichen Erinnerungen.", exampleZh: "许多人把故乡与语言和个人记忆联系在一起。" }],
  ["der Kauf|nm", { meaning: "购买；买卖", example: "Vor dem Kauf sollten Verbraucher Preise und Bedingungen vergleichen.", exampleZh: "购买前，消费者应比较价格和条件。" }],
  ["abdanken|v", { meaning: "退位；辞职", example: "Nach anhaltender Kritik kündigte der Vorsitzende an, abzudanken.", exampleZh: "在持续批评之后，主席宣布将辞职。" }],
  ["das Pronomen|nn", { forms: "das Pronomen · die Pronomen", meaning: "代词", example: "Das Pronomen bezieht sich auf das zuvor genannte Substantiv.", exampleZh: "这个代词指代前面提到的名词。" }],
  ["der Fluch|nm", { meaning: "诅咒；祸害", example: "Die ständige Erreichbarkeit kann zum Fluch moderner Arbeit werden.", exampleZh: "随时在线可能成为现代工作的负担。" }],
  ["das Fett|nn", { meaning: "脂肪；油脂", example: "Gesättigte Fette sollten nur in Maßen verzehrt werden.", exampleZh: "饱和脂肪应适量摄入。" }],
  ["fett|adj", { meaning: "肥胖的；油腻的；粗体的", example: "Wichtige Begriffe sind im Text fett gedruckt.", exampleZh: "文中的重要术语用粗体印刷。" }],
  ["die Maske|nf", { meaning: "面具；口罩；掩饰", example: "In bestimmten Bereichen des Krankenhauses ist weiterhin eine Maske erforderlich.", exampleZh: "医院的某些区域仍然要求佩戴口罩。" }],
  ["loslassen|v", { meaning: "松开；放手；摆脱", example: "Nach dem Projektabschluss fiel es dem Team schwer, die vertrauten Abläufe loszulassen.", exampleZh: "项目结束后，团队很难放下熟悉的工作流程。" }],
  ["die Libelle|nf", { meaning: "蜻蜓；气泡水准器", example: "Eine Libelle schwebte über dem Teich.", exampleZh: "一只蜻蜓在池塘上方盘旋。" }],
  ["bewahren|v", { meaning: "保留；保存；保持", example: "Auch unter Zeitdruck bewahrte die Moderatorin Ruhe.", exampleZh: "即使面临时间压力，主持人仍保持冷静。" }],
  ["der Zebrastreifen|nm", { meaning: "人行横道；斑马线", example: "Fußgänger haben am Zebrastreifen Vorrang.", exampleZh: "行人在斑马线上享有优先通行权。" }],
  ["die Wüste|nf", { meaning: "沙漠；荒漠", example: "Wasserknappheit prägt das Leben in der Wüste.", exampleZh: "缺水影响着沙漠中的生活。" }],
  ["fürchten|v", { meaning: "害怕；担心", example: "Viele Betriebe fürchten weitere Kostensteigerungen.", exampleZh: "许多企业担心成本进一步上涨。" }],
  ["das Taschenbuch|nn", { meaning: "平装书；口袋书", example: "Der Roman ist inzwischen auch als Taschenbuch erhältlich.", exampleZh: "这部小说现在也有平装本。" }],
  ["das Substantiv|nn", { meaning: "名词", example: "Im Deutschen wird jedes Substantiv großgeschrieben.", exampleZh: "德语中的每个名词都要大写。" }],
  ["das Hirn|nn", { meaning: "脑；头脑", example: "Das menschliche Hirn verarbeitet ständig große Mengen an Informationen.", exampleZh: "人脑不断处理大量信息。" }],
  ["die Sicht|nf", { meaning: "视野；看法；能见度", example: "Aus wissenschaftlicher Sicht sind weitere Daten erforderlich.", exampleZh: "从科学角度看，还需要更多数据。" }],
  ["die Lektion|nf", { meaning: "课；教训", example: "Die Krise war eine wichtige Lektion für das gesamte Unternehmen.", exampleZh: "这场危机给整个企业上了重要一课。" }],
  ["der Gegner|nm", { meaning: "对手；反对者", example: "Auch die Gegner des Projekts wurden zur Anhörung eingeladen.", exampleZh: "该项目的反对者也受邀参加听证会。" }],
  ["der Sand|nm", { forms: "der Sand · meist ohne Plural", meaning: "沙；沙土", example: "Der Sand wird als Baustoff regional gewonnen.", exampleZh: "这些沙子作为建筑材料在本地开采。" }],
  ["katalanisch|adj", { meaning: "加泰罗尼亚的；加泰罗尼亚语的", example: "Der Roman erschien zuerst in katalanischer Sprache.", exampleZh: "这部小说最初以加泰罗尼亚语出版。" }],
  ["der Zauber|nm", { meaning: "魔力；魅力；魔法", example: "Die historische Altstadt hat ihren besonderen Zauber bewahrt.", exampleZh: "这座历史老城保留了独特魅力。" }],
  ["berühren|v", { meaning: "触碰；感动；涉及", example: "Die Reform berührt zahlreiche Bereiche des täglichen Lebens.", exampleZh: "这项改革涉及日常生活的许多领域。" }],
  ["die Lese|nf", { meaning: "葡萄采收；采摘", example: "Die Lese begann in diesem Jahr wegen der Wärme besonders früh.", exampleZh: "由于天气温暖，今年的葡萄采收开始得特别早。" }],
  ["der Berber|nm", { meaning: "柏柏尔人；阿马齐格人", example: "Viele Berber bezeichnen sich selbst als Amazigh.", exampleZh: "许多柏柏尔人自称阿马齐格人。" }],
  ["die Realschule|nf", { meaning: "实科中学；德国中等学校类型", example: "Nach der Realschule begann sie eine kaufmännische Ausbildung.", exampleZh: "从实科中学毕业后，她开始接受商业职业培训。" }],
  ["der Geruch|nm", { meaning: "气味；嗅觉印象", example: "Ein ungewöhnlicher Geruch deutete auf einen technischen Defekt hin.", exampleZh: "异常气味表明设备可能存在技术故障。" }],
  ["die Höhle|nf", { meaning: "洞穴；洞窟", example: "Die Höhle ist nur mit einer Führung zugänglich.", exampleZh: "这座洞穴只有在导游带领下才能进入。" }],
  ["die Jugend|nf", { forms: "die Jugend · meist ohne Plural", meaning: "青春；青年时期；青年群体", example: "In ihrer Jugend lebte sie mehrere Jahre im Ausland.", exampleZh: "她年轻时曾在国外生活多年。" }],
  ["die Eile|nf", { forms: "die Eile · meist ohne Plural", meaning: "匆忙；急迫", example: "Wegen der großen Eile wurden wichtige Details übersehen.", exampleZh: "由于过于匆忙，一些重要细节被忽略了。" }],
  ["der Roboter|nm", { meaning: "机器人；自动装置", example: "Der Roboter übernimmt monotone Arbeitsschritte in der Produktion.", exampleZh: "机器人承担生产中的单调工序。" }],
  ["das Material|nn", { meaning: "材料；资料；素材", example: "Das Material lässt sich vollständig wiederverwerten.", exampleZh: "这种材料可以完全回收再利用。" }],
  ["der Käfig|nm", { meaning: "笼子；牢笼", example: "Der beschädigte Käfig wurde aus Sicherheitsgründen ersetzt.", exampleZh: "出于安全原因，受损的笼子被更换。" }],
  ["der Lärm|nm", { forms: "der Lärm · meist ohne Plural", meaning: "噪声；喧闹声", example: "Dauerhafter Lärm kann die Gesundheit beeinträchtigen.", exampleZh: "持续噪声可能损害健康。" }],
  ["betrachten|v", { meaning: "观察；看待；考虑", example: "Die Ergebnisse müssen im Zusammenhang betrachtet werden.", exampleZh: "这些结果必须结合上下文来看待。" }],
  ["die Revolution|nf", { meaning: "革命；重大变革", example: "Die digitale Revolution verändert Wirtschaft und Gesellschaft.", exampleZh: "数字革命正在改变经济与社会。" }],
  ["die Bibel|nf", { meaning: "《圣经》；权威指南（引申）", example: "Die Bibel wurde in zahlreiche Sprachen übersetzt.", exampleZh: "《圣经》已被译成多种语言。" }],
  ["die Höhe|nf", { meaning: "高度；金额；高处", example: "Die genaue Höhe der Förderung hängt vom Einkommen ab.", exampleZh: "补贴的具体金额取决于收入。" }],
  ["notwendig|adj", { meaning: "必要的；必需的", example: "Für eine verlässliche Bewertung sind weitere Daten notwendig.", exampleZh: "为了作出可靠评估，还需要更多数据。" }],
  ["haken|v", { meaning: "卡住；钩住；不顺畅", example: "Die Umsetzung hakt noch an mehreren technischen Fragen.", exampleZh: "落实工作仍卡在几个技术问题上。" }],
  ["taub|adj", { meaning: "聋的；麻木的；失去感觉的", example: "Nach der langen Fahrt fühlten sich meine Beine taub an.", exampleZh: "长途乘车后，我的双腿感到麻木。" }],
  ["scheiden|v", { meaning: "分开；区分；离婚", example: "An dieser Frage scheiden sich die Meinungen.", exampleZh: "人们在这个问题上意见分歧。" }],
  ["die Stille|nf", { forms: "die Stille · meist ohne Plural", meaning: "寂静；安静", example: "Nach der hitzigen Debatte herrschte für einen Moment völlige Stille.", exampleZh: "激烈辩论后，现场一度完全安静。" }],
  ["hervorragend|adj", { meaning: "杰出的；极好的", example: "Die Studie bietet eine hervorragende Grundlage für weitere Forschung.", exampleZh: "这项研究为后续科研提供了极好的基础。" }],
  ["der Kreisel|nm", { meaning: "陀螺；环形交叉路口", example: "Am neuen Kreisel wurde ein zusätzlicher Radweg angelegt.", exampleZh: "新的环岛旁增设了一条自行车道。" }],
  ["beleidigt|adj", { meaning: "受冒犯的；生气的", example: "Die Kundin reagierte auf den unhöflichen Ton sichtlich beleidigt.", exampleZh: "这位顾客对不礼貌的语气明显感到受冒犯。" }],
  ["eingehen|v", { meaning: "进入；收到；答应；枯萎", example: "Auf diesen Vorschlag können wir erst nach einer Prüfung eingehen.", exampleZh: "我们只有在评估后才能对这项建议作出回应。" }],
  ["die Flotte|nf", { meaning: "船队；机队；车队", example: "Die Fluggesellschaft modernisiert ihre Flotte schrittweise.", exampleZh: "航空公司正在逐步更新机队。" }],
  ["der Pilot|nm", { meaning: "飞行员；试点项目", example: "Das neue Verfahren wird zunächst in einem Pilotprojekt erprobt.", exampleZh: "新程序将首先在一个试点项目中测试。" }],
  ["grade|adj", { term: "gerade", forms: "gerade · unveränderlich", typeCode: "adv", meaning: "刚刚；正在；恰好", example: "Die Sitzung hat gerade begonnen.", exampleZh: "会议刚刚开始。" }],
  ["positiv|adj", { meaning: "积极的；正面的；阳性的；正数的", example: "Die Rückmeldungen der Teilnehmenden waren überwiegend positiv.", exampleZh: "参与者的反馈大多是积极的。" }],
  ["existieren|v", { meaning: "存在；生存", example: "Für diese Behauptung existieren bislang keine verlässlichen Belege.", exampleZh: "目前还没有可靠证据支持这一说法。" }],
  ["fällen|v", { meaning: "砍倒；作出（决定、判决）", example: "Das Gericht wird sein Urteil voraussichtlich nächste Woche fällen.", exampleZh: "法院预计将在下周作出判决。" }],
  ["ordentlich|adj", { meaning: "整齐的；正规的；相当的", example: "Alle Belege müssen ordentlich abgelegt werden.", exampleZh: "所有凭证都必须整齐归档。" }],
  ["weglaufen|v", { meaning: "跑开；逃走；流失", example: "Wenn Fachkräfte weglaufen, verliert die Region wichtiges Wissen.", exampleZh: "如果专业人才流失，该地区就会失去重要知识。" }],
  ["decken|v", { meaning: "覆盖；满足；支付；摆好餐具", example: "Die Einnahmen decken derzeit nur einen Teil der laufenden Kosten.", exampleZh: "目前的收入只能覆盖部分日常成本。" }],
  ["die Nation|nf", { meaning: "国家；民族", example: "Keine Nation kann globale Klimaprobleme allein lösen.", exampleZh: "任何国家都无法独自解决全球气候问题。" }],
  ["die Wolle|nf", { forms: "die Wolle · meist ohne Plural", meaning: "羊毛；毛线", example: "Die Wolle stammt aus kontrollierter regionaler Haltung.", exampleZh: "这些羊毛来自受监管的本地养殖。" }],
  ["das Heulen|nn", { forms: "das Heulen · meist ohne Plural", meaning: "嚎叫；哭号", example: "Das Heulen des Windes war im ganzen Gebäude zu hören.", exampleZh: "整栋楼都能听见风的呼啸声。" }],
  ["der Ausweg|nm", { meaning: "出路；解决办法", example: "Ein offener Dialog ist oft der einzige Ausweg aus einer festgefahrenen Situation.", exampleZh: "公开对话往往是摆脱僵局的唯一出路。" }],
  ["die Version|nf", { meaning: "版本；说法", example: "Bitte installieren Sie die aktuelle Version der Software.", exampleZh: "请安装当前版本的软件。" }],
  ["widerlich|adj", { meaning: "令人作呕的；令人厌恶的", example: "Aus dem Abfluss kam ein widerlicher Geruch.", exampleZh: "下水道里传出一股令人作呕的气味。" }],
  ["der Parkplatz|nm", { meaning: "停车场；停车位", example: "In der Innenstadt sind freie Parkplätze selten.", exampleZh: "市中心很少有空余停车位。" }],
  ["abwarten|v", { meaning: "等待；静观", example: "Wir sollten die endgültigen Ergebnisse abwarten, bevor wir entscheiden.", exampleZh: "作出决定前，我们应该等待最终结果。" }],
  ["die Vision|nf", { meaning: "愿景；设想；视力", example: "Die Stadt entwickelte eine klare Vision für klimaneutrale Mobilität.", exampleZh: "这座城市为气候中和交通制定了清晰愿景。" }],
  ["das Protokoll|nn", { meaning: "会议记录；规程；协议", example: "Die wichtigsten Beschlüsse wurden im Protokoll festgehalten.", exampleZh: "最重要的决议已记录在会议纪要中。" }],
  ["verwickelt|adj", { meaning: "复杂的；牵涉其中的", example: "Der Fall ist rechtlich außerordentlich verwickelt.", exampleZh: "这个案件在法律上极其复杂。" }],
  ["das Huhn|nn", { meaning: "母鸡；鸡", example: "Das Huhn stammt aus artgerechter Haltung.", exampleZh: "这只鸡来自符合动物福利要求的养殖。" }],
  ["das Paradies|nn", { meaning: "天堂；理想之地", example: "Die Insel gilt als Paradies für Naturfreunde.", exampleZh: "这座岛被视为自然爱好者的天堂。" }],
  ["die Bete|nf", { meaning: "甜菜；红菜头", example: "Rote Bete enthält zahlreiche Mineralstoffe.", exampleZh: "红菜头含有多种矿物质。" }],
  ["der Anblick|nm", { meaning: "景象；目光所见", example: "Der Anblick der zerstörten Landschaft löste breite Kritik aus.", exampleZh: "受破坏景观的景象引发了广泛批评。" }],
  ["getrieben|adj", { meaning: "被驱使的；急迫不安的", example: "Von wachsendem Konkurrenzdruck getrieben, investierte das Unternehmen in Forschung.", exampleZh: "在日益加剧的竞争压力驱动下，公司加大了科研投资。" }],
  ["die Sitzung|nf", { meaning: "会议；会期；开庭", example: "Die Sitzung wurde wegen technischer Probleme unterbrochen.", exampleZh: "会议因技术问题而中断。" }],
  ["tapfer|adj", { meaning: "勇敢的；坚强的", example: "Trotz heftiger Kritik vertrat sie tapfer ihre Position.", exampleZh: "尽管受到激烈批评，她仍勇敢地坚持自己的立场。" }],
  ["einzelne|adj", { term: "einzeln", forms: "einzeln · als Adjektiv oder Adverb", meaning: "单个的；个别的；逐一地", example: "Die einzelnen Vorschläge werden getrennt bewertet.", exampleZh: "各项建议将分别进行评估。" }],
  ["der Gewinner|nm", { meaning: "获胜者；受益者", example: "Langfristig sind Verbraucher die Gewinner eines fairen Wettbewerbs.", exampleZh: "从长远看，消费者是公平竞争的受益者。" }],
  ["der Toast|nm", { meaning: "吐司；烤面包片；祝酒", example: "Zum Abschluss brachte die Gastgeberin einen Toast auf die Zusammenarbeit aus.", exampleZh: "最后，女主人为双方合作举杯祝酒。" }],
  ["der Vorfall|nm", { meaning: "事件；事故", example: "Der Vorfall wird von einer unabhängigen Stelle untersucht.", exampleZh: "这一事件正由独立机构调查。" }],
  ["der Ruhm|nm", { forms: "der Ruhm · meist ohne Plural", meaning: "名声；荣耀", example: "Wissenschaftlicher Ruhm entsteht nicht ohne sorgfältige Arbeit.", exampleZh: "科学声誉离不开严谨工作。" }],
  ["der Wille|nm", { forms: "der Wille · meist ohne Plural", meaning: "意志；意愿", example: "Der politische Wille zur Reform ist deutlich erkennbar.", exampleZh: "推动改革的政治意愿十分明显。" }],
  ["begreifen|v", { meaning: "理解；领会；把握", example: "Erst nach dem Gespräch begriff sie die Tragweite der Entscheidung.", exampleZh: "谈话后她才理解这项决定的深远影响。" }],
  ["aufmerksam|adj", { meaning: "专注的；细心的；注意到的", example: "Aufmerksame Leser erkennen den Widerspruch sofort.", exampleZh: "细心的读者会立即发现这个矛盾。" }],
  ["die Treue|nf", { forms: "die Treue · meist ohne Plural", meaning: "忠诚；忠实", example: "Die Treue vieler Kunden beruht auf verlässlichem Service.", exampleZh: "许多客户的忠诚源于可靠的服务。" }],
  ["der Felsen|nm", { meaning: "岩石；巨石", example: "Der Weg führt an steilen Felsen entlang.", exampleZh: "这条路沿着陡峭岩壁延伸。" }],
  ["zurückgeben|v", { meaning: "归还；退还；反馈", example: "Geliehene Geräte müssen bis Freitag zurückgegeben werden.", exampleZh: "借用的设备必须在周五前归还。" }],
  ["bewiesen|adj", { meaning: "已经证实的；有据可查的", example: "Die Wirksamkeit der Methode ist wissenschaftlich bewiesen.", exampleZh: "这种方法的有效性已得到科学证实。" }],
  ["das Tempo|nn", { forms: "das Tempo · die Tempi", meaning: "速度；节奏", example: "Das Tempo der Digitalisierung stellt viele Betriebe vor Herausforderungen.", exampleZh: "数字化的速度给许多企业带来挑战。" }],
  ["die Trauer|nf", { forms: "die Trauer · meist ohne Plural", meaning: "悲伤；哀悼", example: "Nach dem Verlust brauchte die Familie Zeit für ihre Trauer.", exampleZh: "遭受损失后，这个家庭需要时间哀悼。" }],
  ["die Anwesenheit|nf", { forms: "die Anwesenheit · meist ohne Plural", meaning: "在场；出席", example: "Die persönliche Anwesenheit ist bei diesem Termin erforderlich.", exampleZh: "这次约谈必须本人到场。" }],
  ["bilden|v", { meaning: "形成；组成；培养", example: "Mehrere Gemeinden bilden gemeinsam einen regionalen Verband.", exampleZh: "多个市镇共同组成一个地区协会。" }],
  ["gewachsen|adj", { meaning: "成长起来的；能够应付的；天然形成的", example: "Das Team ist der neuen Aufgabe fachlich gewachsen.", exampleZh: "团队在专业能力上足以胜任新任务。" }],
  ["verlaufen|v", { meaning: "经过；进展；迷路", example: "Die Verhandlungen verliefen sachlich und konstruktiv.", exampleZh: "谈判进行得客观而富有建设性。" }],
  ["wegnehmen|v", { meaning: "拿走；夺去；消除", example: "Automatisierung soll Beschäftigten monotone Aufgaben wegnehmen.", exampleZh: "自动化旨在替员工承担单调任务。" }],
  ["der Beginn|nm", { forms: "der Beginn · meist ohne Plural", meaning: "开始；开端", example: "Zu Beginn des Projekts wurden klare Ziele vereinbart.", exampleZh: "项目开始时，各方商定了明确目标。" }],
  ["der Daumen|nm", { meaning: "拇指", example: "Drück uns für die Verhandlungen die Daumen!", exampleZh: "祝我们的谈判顺利！" }],
  ["der Fremder|nm", { term: "der Fremde", forms: "der Fremde · die Fremden", meaning: "陌生人；外来者", example: "Ein Fremder fragte am Empfang nach dem Weg.", exampleZh: "一名陌生人在前台问路。" }],
  ["gestehen|v", { meaning: "承认；坦白", example: "Der Verantwortliche gestand schließlich seinen Fehler.", exampleZh: "负责人最终承认了自己的错误。" }],
  ["die Existenz|nf", { meaning: "存在；生存；生计", example: "Steigende Kosten bedrohen die Existenz vieler kleiner Betriebe.", exampleZh: "不断上涨的成本威胁许多小企业的生存。" }],
  ["ohnmächtig|adj", { meaning: "昏迷的；无能为力的", example: "Angesichts der schnellen Entwicklung fühlte sich die Behörde zunächst ohnmächtig.", exampleZh: "面对快速变化，主管部门起初感到无能为力。" }],
  ["der Zaun|nm", { meaning: "栅栏；围栏", example: "Ein hoher Zaun schützt das Gelände vor unbefugtem Zutritt.", exampleZh: "高围栏防止未经授权的人进入场地。" }],
  ["privat|adj", { meaning: "私人的；民营的；私下的", example: "Private Daten dürfen nur mit Zustimmung verarbeitet werden.", exampleZh: "私人数据只有在获得同意后才能处理。" }],
  ["blasen|v", { meaning: "吹；吹奏；刮", example: "Der Wind blies warme Luft aus dem Süden heran.", exampleZh: "风从南方吹来暖空气。" }],
  ["der Esel|nm", { meaning: "驴；笨蛋（贬义）", example: "Der Esel wird in der Region noch als Lasttier eingesetzt.", exampleZh: "当地仍使用驴作为役畜。" }],
  ["verhungern|v", { meaning: "饿死；极度饥饿", example: "Hilfsprogramme sollen verhindern, dass Menschen in Krisengebieten verhungern.", exampleZh: "援助项目旨在防止危机地区的人们挨饿致死。" }],
  ["friedlich|adj", { meaning: "和平的；平静的；温和的", example: "Die Demonstration verlief friedlich.", exampleZh: "示威活动和平进行。" }],
  ["der Teenager|nm", { meaning: "青少年；十几岁的年轻人", example: "Viele Teenager informieren sich überwiegend über soziale Medien.", exampleZh: "许多青少年主要通过社交媒体获取信息。" }],
  ["geheilt|adj", { meaning: "治愈的；痊愈的", example: "Die Patientin gilt nach erfolgreicher Behandlung als geheilt.", exampleZh: "治疗成功后，这名患者被认为已经痊愈。" }],
  ["der Whiskey|nm", { meaning: "威士忌（多指美国或爱尔兰产）", example: "Whiskey wird je nach Herkunft unterschiedlich geschrieben und hergestellt.", exampleZh: "威士忌因产地不同，在拼写和酿造方式上也有所差异。" }],
  ["der Mars|nm", { forms: "der Mars · meist ohne Plural", meaning: "火星", example: "Eine Sonde untersucht die Oberfläche des Mars.", exampleZh: "一台探测器正在研究火星表面。" }],
  ["übertragen|v", { meaning: "传输；转播；转让；传播", example: "Die Veranstaltung wird live im Internet übertragen.", exampleZh: "这场活动将在网上直播。" }],
  ["übertragen|adj", { meaning: "转义的；转移的；委托的", example: "Im übertragenen Sinn beschreibt der Ausdruck eine schwierige Lage.", exampleZh: "从比喻意义上说，这个表达描述了一种困难处境。" }],
  ["das Gemälde|nn", { meaning: "绘画作品；油画", example: "Das Gemälde wurde vor der Ausstellung sorgfältig restauriert.", exampleZh: "这幅画在展出前经过了仔细修复。" }],
  ["der Profi|nm", { meaning: "专业人士；职业选手", example: "Bei komplexen Steuerfragen sollte man einen Profi hinzuziehen.", exampleZh: "遇到复杂税务问题时，应请专业人士协助。" }],
  ["das Gelächter|nn", { forms: "das Gelächter · meist ohne Plural", meaning: "笑声；哄笑", example: "Seine unerwartete Bemerkung löste lautes Gelächter aus.", exampleZh: "他出人意料的评论引起一阵大笑。" }],
  ["angeln|v", { meaning: "钓鱼；设法弄到", example: "In diesem Schutzgebiet darf nur mit Genehmigung geangelt werden.", exampleZh: "在这个保护区只有获得许可才能钓鱼。" }],
  ["gerissen|adj", { meaning: "撕裂的；狡猾的；断裂的", example: "Das gerissene Kabel muss sofort ersetzt werden.", exampleZh: "断裂的电缆必须立即更换。" }],
  ["hinlegen|v", { meaning: "放下；躺下；展现", example: "Das Unternehmen legte im vergangenen Jahr ein starkes Wachstum hin.", exampleZh: "这家企业去年实现了强劲增长。" }],
  ["die Nahrung|nf", { forms: "die Nahrung · meist ohne Plural", meaning: "食物；营养来源", example: "Eine ausgewogene Nahrung ist für die Gesundheit entscheidend.", exampleZh: "均衡饮食对健康至关重要。" }],
  ["der Knall|nm", { meaning: "巨响；爆裂声", example: "Ein lauter Knall deutete auf einen technischen Defekt hin.", exampleZh: "一声巨响表明设备可能出现技术故障。" }],
  ["die Zwischenzeit|nf", { forms: "die Zwischenzeit · meist ohne Plural", meaning: "其间；过渡时间", example: "In der Zwischenzeit wurden zusätzliche Daten ausgewertet.", exampleZh: "在此期间，人们又分析了更多数据。" }],
  ["anlegen|v", { meaning: "创建；投资；停靠；穿戴", example: "Die Stadt will einen neuen Park am Fluss anlegen.", exampleZh: "市政府计划在河边新建一座公园。" }],
  ["der Blutdruck|nm", { forms: "der Blutdruck · meist ohne Plural", meaning: "血压", example: "Regelmäßige Bewegung kann den Blutdruck senken.", exampleZh: "经常运动可以降低血压。" }],
  ["schwören|v", { meaning: "发誓；宣誓；坚信", example: "Die Zeugin musste schwören, die Wahrheit zu sagen.", exampleZh: "证人必须宣誓如实陈述。" }],
  ["glatt|adj", { meaning: "光滑的；顺利的；平整的", example: "Die Verhandlungen verliefen weniger glatt als erwartet.", exampleZh: "谈判进行得不如预期顺利。" }],
  ["trainiert|adj", { meaning: "训练有素的；经过锻炼的", example: "Ein trainiertes Team reagiert auch in Krisen schnell und sicher.", exampleZh: "训练有素的团队即使在危机中也能迅速稳妥地应对。" }],
  ["die Tragödie|nf", { meaning: "悲剧；惨剧", example: "Das Stück verbindet persönliche Tragödie mit politischer Geschichte.", exampleZh: "这部戏把个人悲剧与政治历史联系起来。" }],
  ["das Testament|nn", { meaning: "遗嘱；（宗教）圣约", example: "Ein notarielles Testament kann spätere Streitigkeiten verhindern.", exampleZh: "经公证的遗嘱可以避免日后的争议。" }],
  ["ausgeschlossen|adj", { meaning: "排除在外的；不可能的", example: "Ein Zusammenhang ist nach heutigem Kenntnisstand nicht ausgeschlossen.", exampleZh: "按照目前的认识，不能排除两者存在关联。" }],
  ["der Single|nm", { meaning: "单身人士；单曲", example: "Viele Singles suchen in Großstädten bezahlbare kleine Wohnungen.", exampleZh: "许多单身人士在大城市寻找可负担的小户型住房。" }],
  ["das Erbe|nn", { meaning: "遗产；传承；继承人", example: "Das kulturelle Erbe der Region soll dauerhaft geschützt werden.", exampleZh: "该地区的文化遗产应得到长期保护。" }],
  ["zuständig|adj", { meaning: "主管的；负责的", example: "Für die Genehmigung ist die örtliche Behörde zuständig.", exampleZh: "当地主管部门负责审批。" }],
  ["losgehen|v", { meaning: "出发；开始；响起", example: "Mit der Umsetzung soll unmittelbar nach der Genehmigung losgegangen werden.", exampleZh: "获得批准后应立即开始落实。" }],
  ["beunruhigt|adj", { meaning: "担忧的；不安的", example: "Die Beschäftigten sind über die angekündigten Kürzungen beunruhigt.", exampleZh: "员工们对宣布的削减措施感到担忧。" }],
  ["öffentlich|adj", { meaning: "公共的；公开的", example: "Die Ergebnisse werden in einer öffentlichen Sitzung vorgestellt.", exampleZh: "研究结果将在公开会议上介绍。" }],
  ["der Köder|nm", { meaning: "诱饵；引诱手段", example: "Extrem günstige Angebote dienen manchmal nur als Köder.", exampleZh: "极其便宜的报价有时只是诱饵。" }],
  ["die Kleinigkeit|nf", { meaning: "小事；少量；小礼物", example: "Schon eine Kleinigkeit im Vertrag kann große Folgen haben.", exampleZh: "合同中的一个小细节就可能产生重大后果。" }],
  ["gerecht|adj", { meaning: "公平的；正义的；符合……的", example: "Die Kosten sollen gerecht auf alle Beteiligten verteilt werden.", exampleZh: "费用应公平地分摊给所有相关方。" }],
  ["gespannt|adj", { meaning: "紧张的；期待的；绷紧的", example: "Die Öffentlichkeit wartet gespannt auf die endgültigen Ergebnisse.", exampleZh: "公众正期待着最终结果。" }],
  ["zurückgehen|v", { meaning: "返回；下降；追溯到", example: "Die Emissionen sind gegenüber dem Vorjahr deutlich zurückgegangen.", exampleZh: "排放量较上一年明显下降。" }],
  ["der Sprung|nm", { meaning: "跳跃；裂缝；跃升", example: "Der Umsatz machte im letzten Quartal einen deutlichen Sprung.", exampleZh: "上一季度营业额显著跃升。" }],
  ["endgültig|adj", { meaning: "最终的；不可改变的", example: "Die endgültige Entscheidung fällt erst nach der Anhörung.", exampleZh: "最终决定要到听证会后才会作出。" }],
  ["der Schnaps|nm", { meaning: "烈酒；蒸馏酒", example: "Der Verkauf von Schnaps an Minderjährige ist verboten.", exampleZh: "禁止向未成年人出售烈酒。" }],
  ["nutzlos|adj", { meaning: "无用的；不起作用的", example: "Ohne verlässliche Daten ist jede genaue Prognose nutzlos.", exampleZh: "没有可靠数据，任何精确预测都毫无用处。" }],
  ["aussuchen|v", { meaning: "挑选；选定", example: "Die Teilnehmenden können sich zwei Workshops aussuchen.", exampleZh: "参与者可以挑选两个工作坊。" }],
  ["durchführen|v", { meaning: "实施；进行；贯彻", example: "Ein unabhängiges Institut führt die Befragung durch.", exampleZh: "一家独立机构负责开展这项调查。" }],
  ["genügend|adj", { meaning: "足够的；充分的", example: "Für eine belastbare Aussage liegen noch nicht genügend Daten vor.", exampleZh: "目前的数据还不足以得出可靠结论。" }],
  ["die Villa|nf", { meaning: "别墅；宅邸", example: "Die historische Villa wird künftig als Kulturzentrum genutzt.", exampleZh: "这栋历史别墅今后将作为文化中心使用。" }],
  ["der Master|nm", { meaning: "硕士学位；硕士阶段", example: "Nach dem Bachelor absolvierte sie einen Master in Umweltökonomie.", exampleZh: "本科毕业后，她攻读了环境经济学硕士。" }],
  ["der Gürtel|nm", { meaning: "腰带；带状区域", example: "Der grüne Gürtel rund um die Stadt soll erhalten bleiben.", exampleZh: "城市周边的绿化带应予保留。" }],
  ["eigenartig|adj", { meaning: "奇特的；反常的", example: "Die Messwerte zeigen ein eigenartiges, aber wiederkehrendes Muster.", exampleZh: "测量值呈现出一种奇特但反复出现的模式。" }],
  ["knacken|v", { meaning: "使裂开；破解；发出咔嚓声", example: "Die Fachleute konnten die verschlüsselte Datei nicht knacken.", exampleZh: "专家们无法破解这个加密文件。" }],
  ["sanft|adj", { meaning: "轻柔的；温和的；平缓的", example: "Eine sanfte Verkehrswende setzt auf attraktive Alternativen zum Auto.", exampleZh: "温和推进交通转型要依靠有吸引力的汽车替代方案。" }],
  ["charmant|adj", { meaning: "有魅力的；讨人喜欢的", example: "Das charmante Altbauviertel zieht viele Besucher an.", exampleZh: "这个迷人的老建筑街区吸引了许多游客。" }],
  ["aufbauen|v", { meaning: "建立；搭建；培养", example: "Das Unternehmen will schrittweise eigene Forschungskapazitäten aufbauen.", exampleZh: "公司计划逐步建立自己的科研能力。" }],
  ["die Leber|nf", { meaning: "肝脏", example: "Übermäßiger Alkoholkonsum kann die Leber dauerhaft schädigen.", exampleZh: "过量饮酒可能永久损害肝脏。" }],
  ["die Krawatte|nf", { meaning: "领带", example: "Bei formellen Terminen trägt er meist eine Krawatte.", exampleZh: "正式场合他通常会系领带。" }],
  ["die Moral|nf", { meaning: "道德；士气；寓意", example: "Die Debatte berührt grundlegende Fragen der Moral.", exampleZh: "这场辩论涉及基本的道德问题。" }],
  ["fröhlich|adj", { meaning: "快乐的；欢快的", example: "Trotz des Regens herrschte auf dem Fest eine fröhliche Stimmung.", exampleZh: "尽管下雨，庆典现场仍洋溢着欢乐气氛。" }],
  ["der Brunnen|nm", { meaning: "井；喷泉", example: "Der historische Brunnen wird mit Regenwasser betrieben.", exampleZh: "这座历史喷泉使用雨水运行。" }],
  ["spenden|v", { meaning: "捐赠；提供", example: "Viele Beschäftigte spendeten für ein regionales Bildungsprojekt.", exampleZh: "许多员工为一个地区教育项目捐款。" }],
  ["ahnen|v", { meaning: "预感；猜到", example: "Damals ahnte niemand, welche Folgen die Entscheidung haben würde.", exampleZh: "当时没人预料到这项决定会带来怎样的后果。" }],
  ["die Glocke|nf", { meaning: "钟；铃", example: "Die historische Glocke wurde aufwendig restauriert.", exampleZh: "这口历史古钟经过了精心修复。" }],
  ["die Bevölkerung|nf", { meaning: "人口；居民", example: "Ein großer Teil der Bevölkerung befürwortet die Maßnahme.", exampleZh: "很大一部分民众支持这项措施。" }],
  ["das Service|nn", { term: "der Service", forms: "der Service · die Services", typeCode: "nm", meaning: "服务；客户服务", example: "Der technische Service ist auch am Wochenende erreichbar.", exampleZh: "技术服务部门周末也可以联系。" }],
  ["der Flieger|nm", { meaning: "飞机；飞行员（口语）", example: "Der Flieger nach Hamburg startet mit einer Stunde Verspätung.", exampleZh: "飞往汉堡的航班晚点一小时起飞。" }],
  ["beherrschen|v", { meaning: "掌握；控制；支配", example: "Für die Stelle muss man mindestens zwei Fremdsprachen sicher beherrschen.", exampleZh: "这个岗位要求熟练掌握至少两门外语。" }],
  ["ausgewählt|adj", { meaning: "挑选出的；精选的", example: "Die ausgewählten Projekte erhalten eine zusätzliche Förderung.", exampleZh: "入选项目将获得额外资助。" }],
  ["üblich|adj", { meaning: "通常的；常见的；惯常的", example: "In der Branche sind langfristige Verträge üblich.", exampleZh: "长期合同在这个行业很常见。" }],
  ["die Box|nf", { meaning: "箱子；隔间；音箱", example: "Die Unterlagen werden in einer verschlossenen Box aufbewahrt.", exampleZh: "材料存放在一个上锁的箱子里。" }],
  ["umgeben|v", { forms: "umgeben · umgibt · umgab · hat umgeben", meaning: "包围；环绕；围绕", example: "Das Forschungszentrum ist von einem öffentlichen Park umgeben.", exampleZh: "研究中心周围是一座公共公园。" }],
  ["befehlen|v", { meaning: "命令；下令", example: "Die Leitung kann Beschäftigten keine rechtswidrigen Handlungen befehlen.", exampleZh: "管理层不得命令员工实施违法行为。" }],
  ["überfahren|v", { meaning: "轧过；驾车越过；错过停车点", example: "Der Zug überfuhr wegen einer Störung den vorgesehenen Halt.", exampleZh: "列车因故障驶过了预定停靠站。" }],
  ["schmeißen|v", { meaning: "扔；举办；退出（口语）", example: "Das Team schmiss gemeinsam eine kleine Abschlussfeier.", exampleZh: "团队一起办了一场小型结项庆祝会。" }],
  ["streichen|v", { meaning: "涂刷；删除；划过；取消", example: "Wegen der Haushaltslage wurden mehrere Ausgabenposten gestrichen.", exampleZh: "由于预算状况，多个支出项目被取消。" }],
  ["lehren|v", { meaning: "教授；教导；表明", example: "Die Erfahrung lehrt, dass frühe Beteiligung Konflikte verhindert.", exampleZh: "经验表明，尽早参与可以避免冲突。" }],
  ["der Nacken|nm", { meaning: "颈背；后颈", example: "Langes Sitzen kann zu Schmerzen im Nacken führen.", exampleZh: "久坐可能导致后颈疼痛。" }],
  ["der Turner|nm", { meaning: "体操运动员", example: "Der Turner bereitete sich mehrere Monate auf den Wettkampf vor.", exampleZh: "这名体操运动员为比赛准备了数月。" }],
  ["die Pfeife|nf", { meaning: "哨子；烟斗；管子", example: "Die Schiedsrichterin beendete das Spiel mit ihrer Pfeife.", exampleZh: "裁判用哨声结束了比赛。" }],
  ["behilflich|adj", { meaning: "有帮助的；愿意帮忙的", example: "Die Mitarbeitenden sind Ihnen bei der Antragstellung gern behilflich.", exampleZh: "工作人员乐意协助您提交申请。" }],
  ["die Heirat|nf", { meaning: "结婚；婚姻缔结", example: "Nach der Heirat behielten beide ihre bisherigen Nachnamen.", exampleZh: "结婚后，双方都保留了原来的姓氏。" }],
  ["zurückgelassen|adj", { meaning: "被留下的；遗留的", example: "Zurückgelassene Gegenstände werden drei Monate lang aufbewahrt.", exampleZh: "遗留物品将保管三个月。" }],
  ["die Sorte|nf", { meaning: "品种；种类", example: "Diese Sorte ist besonders widerstandsfähig gegen Trockenheit.", exampleZh: "这个品种尤其耐旱。" }],
  ["der Bezug|nm", { meaning: "关系；关联；套子；收入", example: "Der Bericht stellt einen klaren Bezug zur aktuellen Forschung her.", exampleZh: "报告与当前研究建立了明确联系。" }],
  ["benötigt|adj", { meaning: "所需的；需要的", example: "Die benötigten Unterlagen können digital eingereicht werden.", exampleZh: "所需材料可以在线提交。" }],
  ["vorüber|adj", { forms: "vorüber · unveränderlich", typeCode: "adv", meaning: "过去；结束", example: "Die akute Krise ist vorüber, ihre Folgen bleiben jedoch spürbar.", exampleZh: "急性危机已经过去，但其影响仍然可见。" }],
  ["der Schuppen|nm", { meaning: "棚屋；鳞片；头屑", example: "Alte Geräte werden in einem kleinen Schuppen gelagert.", exampleZh: "旧设备存放在一间小棚屋里。" }],
  ["die Ferne|nf", { forms: "die Ferne · meist ohne Plural", meaning: "远方；远处", example: "Aus der Ferne lassen sich die Details kaum erkennen.", exampleZh: "从远处几乎看不清细节。" }],
  ["weisen|v", { meaning: "指示；引导；证明", example: "Die Ergebnisse weisen auf einen langfristigen Trend hin.", exampleZh: "结果表明存在一个长期趋势。" }],
  ["das Gebet|nn", { meaning: "祈祷；祷文", example: "Die Veranstaltung begann mit einem gemeinsamen Gebet.", exampleZh: "活动以共同祈祷开始。" }],
  ["die Ausrede|nf", { meaning: "借口；托辞", example: "Technische Schwierigkeiten dürfen keine Ausrede für fehlende Transparenz sein.", exampleZh: "技术困难不应成为缺乏透明度的借口。" }],
  ["fischen|v", { meaning: "捕鱼；钓鱼；捞取", example: "In diesem Küstengebiet darf nur nachhaltig gefischt werden.", exampleZh: "这个沿海地区只允许可持续捕鱼。" }],
  ["wertvoll|adj", { meaning: "珍贵的；有价值的", example: "Die Befragung lieferte wertvolle Hinweise für die weitere Planung.", exampleZh: "调查为后续规划提供了宝贵线索。" }],
  ["unnötig|adj", { meaning: "不必要的；多余的", example: "Klare Zuständigkeiten vermeiden unnötige Verzögerungen.", exampleZh: "明确职责可以避免不必要的延误。" }],
  ["die Analyse|nf", { meaning: "分析；解析", example: "Die Analyse zeigt deutliche regionale Unterschiede.", exampleZh: "分析显示出明显的地区差异。" }],
  ["das Elend|nn", { forms: "das Elend · meist ohne Plural", meaning: "苦难；悲惨处境", example: "Das Programm soll soziale Not und Elend verringern.", exampleZh: "该项目旨在减少社会困境与苦难。" }],
  ["elend|adj", { meaning: "悲惨的；难受的；糟糕的", example: "Nach der langen Reise fühlte er sich elend.", exampleZh: "长途旅行后，他感到很不舒服。" }],
  ["andauernd|adj", { meaning: "持续的；不断地", example: "Andauernder Lärm beeinträchtigt die Konzentration.", exampleZh: "持续噪声会影响专注力。" }],
  ["fit|adj", { meaning: "健康的；胜任的；熟悉的", example: "Die Schulung macht Beschäftigte fit für neue digitale Verfahren.", exampleZh: "培训使员工能够胜任新的数字化流程。" }],
  ["fesseln|v", { meaning: "捆绑；吸引；使着迷", example: "Der anschauliche Vortrag fesselte das Publikum bis zum Schluss.", exampleZh: "生动的报告一直吸引着听众直到结束。" }],
  ["eingefallen|adj", { meaning: "塌陷的；凹陷的；突然想到的", example: "Das eingefallene Dach muss vollständig erneuert werden.", exampleZh: "塌陷的屋顶必须彻底翻修。" }],
  ["weiten|v", { meaning: "扩大；拓宽；撑大", example: "Das Unternehmen will seinen Blick auf internationale Märkte weiten.", exampleZh: "公司希望把视野拓展到国际市场。" }],
  ["das Schach|nn", { forms: "das Schach · meist ohne Plural", meaning: "国际象棋；将军", example: "Schach fördert strategisches Denken und Konzentration.", exampleZh: "国际象棋有助于培养战略思维和专注力。" }],
  ["wundern|v", { meaning: "使惊讶；感到奇怪", example: "Es würde mich wundern, wenn die Frist nochmals verlängert würde.", exampleZh: "如果期限再次延长，我会感到意外。" }],
  ["gruselig|adj", { meaning: "可怕的；令人毛骨悚然的", example: "Die leer stehende Fabrik wirkte nachts ziemlich gruselig.", exampleZh: "这座空置工厂在夜里显得相当阴森。" }],
  ["die Intelligenz|nf", { meaning: "智力；理解能力", example: "Künstliche Intelligenz verändert zahlreiche Arbeitsabläufe.", exampleZh: "人工智能正在改变许多工作流程。" }],
  ["beeindrucken|v", { meaning: "给……留下深刻印象；打动", example: "Die klare Darstellung der Ergebnisse beeindruckte die Jury.", exampleZh: "清晰的成果展示给评审团留下了深刻印象。" }],
  ["geschäftlich|adj", { meaning: "商务的；业务上的", example: "Sie reist regelmäßig geschäftlich nach Wien.", exampleZh: "她经常因公前往维也纳。" }],
  ["egoistisch|adj", { meaning: "自私的；利己的", example: "Eine rein egoistische Entscheidung kann dem Team langfristig schaden.", exampleZh: "纯粹自私的决定从长远看可能损害团队。" }],
  ["ablenken|v", { meaning: "使分心；转移；改变方向", example: "Ständige Benachrichtigungen lenken von konzentrierter Arbeit ab.", exampleZh: "不断弹出的通知会让人无法专心工作。" }],
  ["gehorchen|v", { meaning: "服从；听从；符合规律", example: "Auch technische Systeme gehorchen klaren physikalischen Gesetzen.", exampleZh: "技术系统同样遵循明确的物理规律。" }],
  ["die Lunge|nf", { meaning: "肺；肺部", example: "Feinstaub kann die Lunge dauerhaft schädigen.", exampleZh: "细颗粒物可能永久损害肺部。" }],
  ["der Krach|nm", { meaning: "争吵；巨响；噪声", example: "Nach einem heftigen Krach einigten sich beide Seiten auf ein Gespräch.", exampleZh: "激烈争吵后，双方同意进行对话。" }],
  ["das Silber|nn", { forms: "das Silber · meist ohne Plural", meaning: "银；银色；银牌", example: "Silber wird in zahlreichen technischen Geräten verwendet.", exampleZh: "银被用于多种技术设备。" }],
  ["die Hinsicht|nf", { meaning: "方面；角度", example: "In finanzieller Hinsicht ist der Vorschlag realistisch.", exampleZh: "从财务角度看，这项建议是现实可行的。" }],
  ["pfeifen|v", { meaning: "吹口哨；发出尖锐声；不在乎", example: "Bei starkem Wind pfiff es durch die undichten Fenster.", exampleZh: "刮大风时，风从漏风的窗户呼啸而入。" }],
  ["der Hall|nm", { forms: "der Hall · meist ohne Plural", meaning: "回声；混响", example: "Akustische Elemente reduzieren den Hall im großen Saal.", exampleZh: "吸音设施减少了大厅里的混响。" }],
  ["die Ziege|nf", { meaning: "山羊；母山羊", example: "Ziegen kommen auch mit trockenen Weideflächen gut zurecht.", exampleZh: "山羊也能很好适应干燥牧场。" }],
  ["der Pfad|nm", { meaning: "小径；路径；发展道路", example: "Die Regierung will auf einen klimaneutralen Pfad wechseln.", exampleZh: "政府希望转向气候中和的发展道路。" }],
  ["der Korb|nm", { meaning: "篮子；筐；拒绝（口语）", example: "Regionale Produkte werden in einem wiederverwendbaren Korb geliefert.", exampleZh: "本地产品用可重复使用的篮子配送。" }],
  ["aufrichtig|adj", { meaning: "真诚的；坦率的", example: "Eine aufrichtige Entschuldigung kann verlorenes Vertrauen wiederherstellen.", exampleZh: "真诚的道歉可以重建失去的信任。" }],
  ["versorgen|v", { meaning: "供给；照料；处理伤口", example: "Die Solaranlage versorgt das Gebäude mit Strom.", exampleZh: "太阳能设备为大楼供电。" }],
  ["aushalten|v", { meaning: "忍受；承受；坚持", example: "Das Material muss hohe Temperaturen aushalten.", exampleZh: "这种材料必须能够承受高温。" }],
  ["der Status|nm", { meaning: "状态；地位；身份", example: "Den aktuellen Status des Antrags können Sie online prüfen.", exampleZh: "您可以在线查看申请的当前状态。" }],
  ["pressen|v", { meaning: "压；挤；压榨", example: "Die Maschine presst Altpapier zu kompakten Ballen.", exampleZh: "机器把废纸压成紧实的纸包。" }],
  ["der Geliebter|nm", { term: "der Geliebte", forms: "der Geliebte · die Geliebten", meaning: "爱人；情人", example: "Ihr Geliebter lebte mehrere Jahre im Ausland.", exampleZh: "她的爱人曾在国外生活多年。" }],
  ["der Zutritt|nm", { forms: "der Zutritt · meist ohne Plural", meaning: "进入权；准入", example: "Der Zutritt zum Labor ist nur befugten Personen gestattet.", exampleZh: "只有获授权人员才能进入实验室。" }],
  ["reif|adj", { meaning: "成熟的；时机成熟的", example: "Nach langer Prüfung ist der Vorschlag reif für eine Entscheidung.", exampleZh: "经过长期评估，这项建议已经可以进入决策阶段。" }],
  ["verklagen|v", { meaning: "起诉；控告", example: "Der Verband will das Unternehmen wegen irreführender Werbung verklagen.", exampleZh: "该协会打算因误导性广告起诉这家公司。" }],
  ["der Stamm|nm", { meaning: "树干；部族；词干；固定成员", example: "Der Wortstamm bleibt bei der Ableitung erhalten.", exampleZh: "构词时词干保持不变。" }],
  ["das Profil|nn", { meaning: "简介；轮廓；特色定位", example: "Die Hochschule will ihr internationales Profil stärken.", exampleZh: "这所高校希望强化自身的国际特色。" }],
  ["quitt|adj", { meaning: "两清的；互不相欠的", example: "Nach der Rückzahlung waren beide Seiten quitt.", exampleZh: "还款后，双方互不相欠。" }],
  ["unverständlich|adj", { meaning: "难以理解的；听不清的", example: "Die Anleitung ist für Laien teilweise unverständlich.", exampleZh: "这份说明对非专业人士来说有些难懂。" }],
  ["rühren|v", { meaning: "搅拌；触动；移动", example: "Die Lösung muss mehrere Minuten gleichmäßig gerührt werden.", exampleZh: "溶液必须均匀搅拌数分钟。" }],
  ["anlügen|v", { meaning: "对……撒谎；欺骗", example: "Wer Kunden bewusst anlügt, gefährdet die Glaubwürdigkeit des Unternehmens.", exampleZh: "故意欺骗客户会损害企业信誉。" }],
  ["der Feierabend|nm", { meaning: "下班时间；下班后的休息时间", example: "Nach Feierabend beantwortet sie grundsätzlich keine dienstlichen E-Mails.", exampleZh: "下班后她原则上不回复工作邮件。" }],
  ["beurteilen|v", { meaning: "评价；判断；评审", example: "Unabhängige Fachleute beurteilen die Qualität der Anträge.", exampleZh: "独立专家负责评审申请质量。" }],
  ["das Kätzchen|nn", { meaning: "小猫；柔荑花序", example: "Das verängstigte Kätzchen wurde in ein Tierheim gebracht.", exampleZh: "受惊的小猫被送到动物收容所。" }],
  ["abgefahren|adj", { meaning: "已出发的；磨损的；酷炫的（口语）", example: "Mit abgefahrenen Reifen darf das Fahrzeug nicht weiterfahren.", exampleZh: "轮胎磨损后，车辆不得继续行驶。" }],
  ["festnehmen|v", { meaning: "逮捕；拘留", example: "Die Polizei nahm den Verdächtigen am Bahnhof fest.", exampleZh: "警方在火车站逮捕了嫌疑人。" }],
  ["ausführen|v", { meaning: "执行；详细说明；出口；遛", example: "Die Autorin führt ihre Argumente im letzten Kapitel ausführlich aus.", exampleZh: "作者在最后一章详细阐述了自己的论点。" }],
  ["die Genehmigung|nf", { meaning: "批准；许可证", example: "Für den Umbau ist eine behördliche Genehmigung erforderlich.", exampleZh: "改建需要获得主管部门批准。" }],
  ["der Schneider|nm", { meaning: "裁缝", example: "Der Schneider passte den Anzug an die Maße des Kunden an.", exampleZh: "裁缝按照顾客的尺寸修改了西装。" }],
  ["möglichst|adj", { forms: "möglichst · unveränderlich", typeCode: "adv", meaning: "尽可能；最好", example: "Die Unterlagen sollten möglichst vollständig eingereicht werden.", exampleZh: "材料应尽可能完整地提交。" }],
  ["die Haltung|nf", { meaning: "态度；姿势；饲养；支撑", example: "Die öffentliche Haltung gegenüber dem Projekt hat sich verändert.", exampleZh: "公众对该项目的态度发生了变化。" }],
  ["verbreiten|v", { meaning: "传播；扩散；散布", example: "Soziale Netzwerke können falsche Informationen sehr schnell verbreiten.", exampleZh: "社交网络可能迅速传播错误信息。" }],
  ["erholen|v", { meaning: "恢复；休养；复苏", example: "Die regionale Wirtschaft hat sich schneller als erwartet erholt.", exampleZh: "地区经济复苏得比预期更快。" }],
  ["veröffentlicht|adj", { meaning: "已公布的；已出版的", example: "Die kürzlich veröffentlichten Zahlen bestätigen den Trend.", exampleZh: "最近公布的数据证实了这一趋势。" }],
  ["aufbrechen|v", { meaning: "出发；打开；打破", example: "Die Arbeitsgruppe will veraltete Strukturen aufbrechen.", exampleZh: "工作组希望打破陈旧结构。" }],
  ["der Dichter|nm", { meaning: "诗人；文学创作者", example: "Der Dichter setzte sich in seinen Werken mit gesellschaftlichem Wandel auseinander.", exampleZh: "这位诗人在作品中探讨社会变迁。" }],
  ["angemessen|adj", { meaning: "适当的；合理的；相称的", example: "Die Vergütung muss der Verantwortung angemessen sein.", exampleZh: "薪酬必须与所承担的责任相称。" }],
  ["zögern|v", { meaning: "犹豫；迟疑；拖延", example: "Die Behörde zögerte zu lange mit einer klaren Entscheidung.", exampleZh: "主管部门迟迟未作出明确决定。" }],
  ["beruflich|adj", { meaning: "职业的；工作方面的", example: "Beruflich reist sie regelmäßig zwischen Berlin und Brüssel.", exampleZh: "工作上她经常往返于柏林和布鲁塞尔。" }],
  ["bedeckt|adj", { meaning: "覆盖着的；阴天的；含蓄的", example: "Der Himmel bleibt heute überwiegend bedeckt.", exampleZh: "今天大部分时间天空阴云密布。" }],
  ["der Pop|nm", { forms: "der Pop · meist ohne Plural", meaning: "流行音乐；流行文化", example: "Die Ausstellung untersucht den Einfluss des Pop auf die Gegenwartskultur.", exampleZh: "展览探讨流行文化对当代文化的影响。" }],
  ["der Winkel|nm", { meaning: "角；角度；偏僻处", example: "Die beiden Linien schneiden sich in einem rechten Winkel.", exampleZh: "两条直线以直角相交。" }],
  ["der Austausch|nm", { meaning: "交流；交换；更换", example: "Der fachliche Austausch zwischen Forschung und Praxis wurde intensiviert.", exampleZh: "科研与实践之间的专业交流得到加强。" }],
  ["ergreifen|v", { meaning: "抓住；采取；把握", example: "Die Behörde ergriff sofort Maßnahmen zum Schutz der Daten.", exampleZh: "主管部门立即采取措施保护数据。" }],
  ["die Priorität|nf", { meaning: "优先事项；优先级", example: "Der Ausbau bezahlbarer Wohnungen hat für die Stadt höchste Priorität.", exampleZh: "扩大可负担住房对这座城市来说是最高优先事项。" }],
  ["die Eifersucht|nf", { forms: "die Eifersucht · meist ohne Plural", meaning: "嫉妒；妒忌", example: "Eifersucht kann das Vertrauen in einer Beziehung dauerhaft beschädigen.", exampleZh: "嫉妒可能永久损害关系中的信任。" }],
  ["der Bezirk|nm", { meaning: "行政区；地区", example: "Der Bezirk fördert mehrere soziale Projekte im Viertel.", exampleZh: "该行政区资助街区内的多个社会项目。" }],
  ["beauftragt|adj", { meaning: "受委托的；负责的", example: "Das beauftragte Institut legt den Bericht im Herbst vor.", exampleZh: "受委托的研究机构将在秋季提交报告。" }],
  ["der Sonnenaufgang|nm", { meaning: "日出", example: "Die Solaranlage beginnt kurz nach Sonnenaufgang mit der Stromerzeugung.", exampleZh: "太阳能设备在日出后不久开始发电。" }],
  ["die Flagge|nf", { meaning: "旗帜；标志", example: "Vor dem Rathaus wehen die Flaggen der Partnerstädte.", exampleZh: "市政厅前飘扬着友好城市的旗帜。" }],
  ["empfindlich|adj", { meaning: "敏感的；易损的；反应强烈的", example: "Das Messgerät reagiert empfindlich auf Temperaturschwankungen.", exampleZh: "这台测量设备对温度波动很敏感。" }],
  ["der Hahn|nm", { meaning: "公鸡；水龙头；旋塞", example: "Ein tropfender Hahn kann täglich viel Wasser verschwenden.", exampleZh: "漏水的水龙头每天可能浪费大量水。" }],
  ["der Speck|nm", { meaning: "熏肉；肥肉；赘肉", example: "Der Speck wird in dieser Region traditionell geräuchert.", exampleZh: "这种熏肉在当地按传统方式烟熏制作。" }],
  ["verbreitet|adj", { meaning: "广泛的；常见的；传播开的", example: "Flexible Arbeitszeiten sind inzwischen weit verbreitet.", exampleZh: "弹性工作时间如今已经十分普遍。" }],
  ["fremd|adj", { meaning: "陌生的；外来的；异国的", example: "Die neue Software war vielen Beschäftigten zunächst fremd.", exampleZh: "许多员工起初对这款新软件感到陌生。" }],
  ["die Herde|nf", { meaning: "兽群；畜群", example: "Die Herde wird regelmäßig tierärztlich untersucht.", exampleZh: "这群牲畜定期接受兽医检查。" }],
  ["das Erdbeben|nn", { meaning: "地震", example: "Das Gebäude wurde nach modernen Standards gegen Erdbeben gesichert.", exampleZh: "这栋建筑按照现代标准进行了抗震加固。" }],
  ["das Gleichgewicht|nn", { meaning: "平衡；均衡", example: "Die Reform sucht ein Gleichgewicht zwischen Sicherheit und Freiheit.", exampleZh: "这项改革寻求安全与自由之间的平衡。" }],
  ["gelegen|adj", { meaning: "位于……的；合适的；方便的", example: "Das zentral gelegene Büro ist mit öffentlichen Verkehrsmitteln gut erreichbar.", exampleZh: "这间位于市中心的办公室乘公共交通很方便到达。" }],
  ["die Dosis|nf", { meaning: "剂量；用量", example: "Die Ärztin passte die Dosis an das Gewicht des Patienten an.", exampleZh: "医生根据患者体重调整了剂量。" }],
  ["hacken|v", { meaning: "切碎；劈；入侵计算机", example: "Unbekannte versuchten, das interne Netzwerk zu hacken.", exampleZh: "不明身份者试图入侵内部网络。" }],
  ["bezaubernd|adj", { meaning: "迷人的；可爱的", example: "Die kleine Altstadt wirkt besonders am Abend bezaubernd.", exampleZh: "这座小老城在夜晚显得格外迷人。" }],
  ["der Becher|nm", { meaning: "杯子；奖杯", example: "Mehrwegbecher reduzieren den Abfall bei Großveranstaltungen.", exampleZh: "可重复使用的杯子能够减少大型活动中的垃圾。" }],
  ["fingern|v", { meaning: "用手指摸索；笨拙摆弄", example: "Er fingerte nervös am Verschluss der Tasche.", exampleZh: "他紧张地摆弄着包的搭扣。" }],
  ["leugnen|v", { meaning: "否认；拒不承认", example: "Das Unternehmen leugnete zunächst jede Verantwortung.", exampleZh: "这家公司起初否认承担任何责任。" }],
  ["schockiert|adj", { meaning: "震惊的；受到冲击的", example: "Die Öffentlichkeit war über das Ausmaß des Schadens schockiert.", exampleZh: "公众对损失规模感到震惊。" }],
  ["gewaltig|adj", { meaning: "巨大的；强有力的；猛烈的", example: "Die Umstellung erfordert einen gewaltigen organisatorischen Aufwand.", exampleZh: "这项转型需要巨大的组织工作量。" }],
  ["der Knoten|nm", { meaning: "结；节点；难题", example: "Nach langen Verhandlungen platzte endlich der politische Knoten.", exampleZh: "经过长期谈判，政治僵局终于被打破。" }],
  ["knoten|v", { meaning: "打结；系结", example: "Die Kabel wurden zu einem festen Bündel geknotet.", exampleZh: "这些电缆被扎成一个牢固的线束。" }],
  ["überwinden|v", { meaning: "克服；跨越；战胜", example: "Gemeinsame Standards helfen, technische Hindernisse zu überwinden.", exampleZh: "统一标准有助于克服技术障碍。" }],
  ["ablegen|v", { meaning: "放下；脱下；参加考试；存档", example: "Alle Bewerbenden müssen eine praktische Prüfung ablegen.", exampleZh: "所有申请者都必须参加实践考试。" }],
  ["drohen|v", { meaning: "威胁；面临；有……之虞", example: "Ohne zusätzliche Mittel droht dem Projekt eine weitere Verzögerung.", exampleZh: "如果没有额外资金，项目可能再次延期。" }],
  ["entgehen|v", { meaning: "逃脱；错过；未被注意", example: "Der Kommission ist der Widerspruch im Bericht nicht entgangen.", exampleZh: "委员会没有忽略报告中的矛盾。" }],
  ["der Duft|nm", { meaning: "香味；气息", example: "Der Duft frischer Kräuter erfüllte die Küche.", exampleZh: "新鲜香草的香味充满了厨房。" }],
  ["respektiert|adj", { meaning: "受尊重的；广受认可的", example: "Sie gilt als international respektierte Fachfrau.", exampleZh: "她被认为是一位在国际上广受尊重的专家。" }],
  ["platt|adj", { meaning: "扁平的；没气的；筋疲力尽的", example: "Nach dem langen Arbeitstag war das ganze Team völlig platt.", exampleZh: "漫长工作日结束后，整个团队都精疲力尽。" }],
  ["der Nachtisch|nm", { meaning: "甜点；餐后点心", example: "Zum Nachtisch wurde regionales Obst serviert.", exampleZh: "餐后甜点供应的是本地水果。" }],
  ["der Alptraum|nm", { meaning: "噩梦；极糟糕的经历", example: "Die monatelange Verzögerung wurde für das Projektteam zum Alptraum.", exampleZh: "长达数月的延期成了项目团队的噩梦。" }],
  ["der Reichtum|nm", { meaning: "财富；丰富性", example: "Der sprachliche Reichtum der Region soll dokumentiert werden.", exampleZh: "该地区丰富的语言资源应得到记录。" }],
  ["die Föderation|nf", { meaning: "联邦；联盟", example: "Die Föderation koordiniert gemeinsame Standards ihrer Mitgliedsverbände.", exampleZh: "该联盟协调各成员协会的共同标准。" }],
  ["die Wärme|nf", { forms: "die Wärme · meist ohne Plural", meaning: "热；温暖；热情", example: "Die gespeicherte Wärme wird nachts zum Heizen genutzt.", exampleZh: "储存的热量在夜间用于供暖。" }],
  ["verstoßen|v", { meaning: "违反；排斥；驱逐", example: "Die Regelung verstößt nach Ansicht des Gerichts gegen europäisches Recht.", exampleZh: "法院认为这项规定违反欧洲法律。" }],
  ["die Spinne|nf", { meaning: "蜘蛛", example: "Spinnen spielen eine wichtige Rolle im ökologischen Gleichgewicht.", exampleZh: "蜘蛛在生态平衡中发挥重要作用。" }],
  ["der Tumor|nm", { meaning: "肿瘤；肿块", example: "Der Tumor wurde bei einer Routineuntersuchung früh entdeckt.", exampleZh: "肿瘤在常规检查中被及早发现。" }],
  ["grob|adj", { meaning: "粗糙的；粗略的；粗暴的", example: "Eine grobe Schätzung reicht für die endgültige Planung nicht aus.", exampleZh: "粗略估算不足以用于最终规划。" }],
  ["starren|v", { meaning: "凝视；盯着看", example: "Statt auf einzelne Zahlen zu starren, sollte man den Gesamttrend betrachten.", exampleZh: "不应只盯着个别数字，而应观察整体趋势。" }],
  ["die Gestalt|nf", { meaning: "形态；身形；人物", example: "Die Reform nahm nach langen Beratungen konkrete Gestalt an.", exampleZh: "经过长期商议，改革方案逐渐成形。" }],
  ["die Haft|nf", { forms: "die Haft · meist ohne Plural", meaning: "拘留；监禁", example: "Der Verdächtige wurde nach der Anhörung aus der Haft entlassen.", exampleZh: "嫌疑人在听证后获释。" }],
  ["der Fischer|nm", { meaning: "渔民；捕鱼者", example: "Die Fischer müssen neue Fangquoten einhalten.", exampleZh: "渔民必须遵守新的捕捞配额。" }],
  ["unterrichtet|adj", { meaning: "知情的；受过教育的", example: "Die gut unterrichtete Öffentlichkeit kann Entscheidungen besser beurteilen.", exampleZh: "信息充分的公众能够更好地评判决策。" }],
  ["bereden|v", { meaning: "商谈；讨论", example: "Die offenen Punkte müssen wir in Ruhe bereden.", exampleZh: "未决问题需要我们冷静讨论。" }],
  ["das Futter|nn", { forms: "das Futter · meist ohne Plural", meaning: "饲料；衬里", example: "Das Futter stammt aus kontrolliertem Anbau.", exampleZh: "这些饲料来自受监管的种植。" }],
  ["das Make-up|nn", { forms: "das Make-up · meist ohne Plural", meaning: "化妆；化妆品", example: "Für die Aufnahme wurde nur dezentes Make-up verwendet.", exampleZh: "拍摄时只使用了淡妆。" }],
  ["die Galaxie|nf", { meaning: "星系；银河系", example: "Unsere Galaxie enthält Milliarden von Sternen.", exampleZh: "我们所在的星系包含数十亿颗恒星。" }],
  ["die Vermutung|nf", { meaning: "猜测；推测", example: "Weitere Messungen bestätigten die ursprüngliche Vermutung.", exampleZh: "进一步测量证实了最初的推测。" }],
  ["die Statue|nf", { meaning: "雕像；塑像", example: "Die historische Statue wird derzeit restauriert.", exampleZh: "这座历史雕像目前正在修复。" }],
  ["die Verzweiflung|nf", { forms: "die Verzweiflung · meist ohne Plural", meaning: "绝望；无助", example: "Aus Verzweiflung wandte sich die Familie an eine Beratungsstelle.", exampleZh: "这个家庭因绝望而向咨询机构求助。" }],
  ["deprimiert|adj", { meaning: "沮丧的；抑郁的", example: "Nach der wiederholten Absage fühlte er sich deprimiert.", exampleZh: "再次遭到拒绝后，他感到很沮丧。" }],
  ["weltweit|adj", { meaning: "全世界的；在全球范围内", example: "Die Plattform wird inzwischen weltweit genutzt.", exampleZh: "这个平台如今在全球范围内使用。" }],
  ["die Logik|nf", { meaning: "逻辑；推理体系", example: "Die Logik der neuen Regelung ist nicht sofort verständlich.", exampleZh: "新规定的逻辑并不能立即看懂。" }],
  ["außergewöhnlich|adj", { meaning: "非凡的；异常的；罕见的", example: "Die Studie beruht auf einer außergewöhnlich breiten Datengrundlage.", exampleZh: "这项研究建立在异常广泛的数据基础上。" }],
  ["der Keks|nm", { meaning: "饼干；小甜点", example: "Die Kekse werden ohne künstliche Zusatzstoffe hergestellt.", exampleZh: "这些饼干不使用人工添加剂制作。" }],
  ["fünfte|adj", { forms: "fünfte · Ordinalzahl", typeCode: "num", meaning: "第五", example: "Der fünfte Abschnitt enthält die wichtigsten Empfehlungen.", exampleZh: "第五部分包含最重要的建议。" }],
  ["ausgefallen|adj", { meaning: "取消的；发生故障的；别致的", example: "Wegen des ausgefallenen Zuges verspäteten sich viele Teilnehmende.", exampleZh: "由于列车停运，许多参与者迟到了。" }],
  ["feucht|adj", { meaning: "潮湿的；湿润的", example: "Das feuchte Klima begünstigt die Bildung von Schimmel.", exampleZh: "潮湿气候容易导致霉菌滋生。" }],
  ["bellen|v", { meaning: "吠叫；犬吠", example: "Der Hund bellte, sobald jemand das Grundstück betrat.", exampleZh: "一有人进入院地，这只狗就叫起来。" }],
  ["manipulieren|v", { meaning: "操控；篡改；影响", example: "Die veröffentlichten Daten dürfen nachträglich nicht manipuliert werden.", exampleZh: "已公布的数据不得事后篡改。" }],
  ["der Busch|nm", { meaning: "灌木；灌木丛", example: "Ein dichter Busch bietet vielen Vögeln Schutz.", exampleZh: "茂密的灌木为许多鸟类提供庇护。" }],
  ["die Abwesenheit|nf", { meaning: "缺席；不在场", example: "Während ihrer Abwesenheit übernahm ein Kollege die Leitung.", exampleZh: "她不在期间，一名同事接管了领导工作。" }],
  ["ausleihen|v", { meaning: "借出；借用", example: "In der Bibliothek lassen sich auch elektronische Geräte ausleihen.", exampleZh: "图书馆也可以借用电子设备。" }],
  ["wesentlich|adj", { meaning: "重要的；本质的；大幅地", example: "Transparente Kriterien sind für eine faire Auswahl wesentlich.", exampleZh: "透明标准对公平选拔至关重要。" }],
  ["eiskalt|adj", { meaning: "冰冷的；冷酷的；极冷的", example: "Das Wasser im Bergsee ist selbst im Sommer eiskalt.", exampleZh: "山湖里的水即使在夏天也冰冷刺骨。" }],
  ["das Ritual|nn", { meaning: "仪式；固定习惯", example: "Das tägliche Teamgespräch wurde zu einem festen Ritual.", exampleZh: "每天的团队交流成了一项固定习惯。" }],
  ["der Streifen|nm", { meaning: "条纹；条带；影片（口语）", example: "Ein grüner Streifen verbindet die beiden Parks.", exampleZh: "一条绿化带连接两座公园。" }],
  ["streifen|v", { meaning: "擦过；漫步；脱下", example: "Auf dem Heimweg streifte sie noch kurz durch die Altstadt.", exampleZh: "回家路上，她又在老城短暂逛了一会儿。" }],
  ["scheitern|v", { meaning: "失败；未能实现", example: "Das Vorhaben darf nicht an unklaren Zuständigkeiten scheitern.", exampleZh: "这个项目不能因职责不清而失败。" }],
  ["auslösen|v", { meaning: "引发；触发；兑换", example: "Die Veröffentlichung löste eine breite öffentliche Debatte aus.", exampleZh: "这次发布引发了广泛的公共讨论。" }],
  ["das Lebensmittel|nn", { meaning: "食品；食物", example: "Verdorbene Lebensmittel dürfen nicht verkauft werden.", exampleZh: "变质食品不得出售。" }],
  ["das Model|nn", { meaning: "模特；模型样本", example: "Das Model arbeitet für mehrere nachhaltige Modemarken.", exampleZh: "这位模特为多个可持续时尚品牌工作。" }],
  ["der Chor|nm", { meaning: "合唱团；齐声", example: "Der Chor probt wöchentlich im Kulturzentrum.", exampleZh: "合唱团每周在文化中心排练。" }],
  ["der Knöchel|nm", { meaning: "脚踝；指关节", example: "Nach dem Sturz war der Knöchel stark geschwollen.", exampleZh: "摔倒后，脚踝严重肿胀。" }],
  ["zerbrochen|adj", { meaning: "破碎的；破裂的", example: "Das zerbrochene Fenster wurde noch am selben Tag ersetzt.", exampleZh: "破碎的窗户当天就被更换了。" }],
  ["die Versuchung|nf", { meaning: "诱惑；吸引力", example: "Die Versuchung, schnelle Schlüsse zu ziehen, ist bei unvollständigen Daten groß.", exampleZh: "面对不完整数据时，人们很容易草率下结论。" }],
  ["die Meile|nf", { meaning: "英里；商业街区", example: "Die Strecke ist knapp eine Meile lang.", exampleZh: "这段路程接近一英里长。" }],
  ["die Lache|nf", { meaning: "水洼；小水坑", example: "Nach dem Regen bildete sich vor dem Eingang eine große Lache.", exampleZh: "雨后入口前形成了一个大水洼。" }],
  ["der Bräutigam|nm", { meaning: "新郎；未婚夫", example: "Der Bräutigam begrüßte die Gäste gemeinsam mit der Braut.", exampleZh: "新郎与新娘一起迎接宾客。" }],
  ["die Drohung|nf", { meaning: "威胁；恐吓", example: "Die Drohung mit rechtlichen Schritten führte zu neuen Verhandlungen.", exampleZh: "采取法律行动的警告促成了新一轮谈判。" }],
  ["ausstehen|v", { meaning: "忍受；尚待完成", example: "Mehrere wichtige Entscheidungen stehen noch aus.", exampleZh: "还有几项重要决定尚未作出。" }],
  ["der Dampf|nm", { forms: "der Dampf · meist ohne Plural", meaning: "蒸汽；水汽", example: "Die Anlage nutzt heißen Dampf zur Energiegewinnung.", exampleZh: "这套设备利用高温蒸汽发电。" }],
  ["befürchten|v", { meaning: "担心；害怕会发生", example: "Viele Anwohner befürchten eine weitere Zunahme des Verkehrs.", exampleZh: "许多居民担心交通量会进一步增加。" }],
  ["der Beutel|nm", { meaning: "袋子；囊", example: "Die Ware wird in einem wiederverwendbaren Beutel verkauft.", exampleZh: "商品使用可重复利用的袋子出售。" }],
  ["drängen|v", { meaning: "催促；推动；拥挤", example: "Die Verbände drängen auf eine schnelle gesetzliche Lösung.", exampleZh: "各协会敦促尽快通过法律解决问题。" }],
  ["die Veranda|nf", { meaning: "阳台；游廊", example: "Die überdachte Veranda schützt im Sommer vor starker Sonne.", exampleZh: "有顶棚的游廊在夏季可以遮挡强烈阳光。" }],
  ["die Strahlung|nf", { meaning: "辐射；射线", example: "Die Strahlung wird kontinuierlich gemessen.", exampleZh: "辐射水平受到持续测量。" }],
  ["unendlich|adj", { meaning: "无限的；无穷的", example: "Natürliche Ressourcen stehen nicht unendlich zur Verfügung.", exampleZh: "自然资源并非取之不尽。" }],
  ["die Nonne|nf", { meaning: "修女；尼姑", example: "Die Nonne engagiert sich seit Jahren in der Flüchtlingshilfe.", exampleZh: "这位修女多年来一直参与难民援助。" }],
  ["das Feuerwerk|nn", { meaning: "烟花；焰火表演", example: "Die Stadt verzichtet aus Umweltschutzgründen auf ein großes Feuerwerk.", exampleZh: "出于环境保护原因，这座城市取消大型烟花表演。" }],
  ["das Kleingeld|nn", { forms: "das Kleingeld · meist ohne Plural", meaning: "零钱；硬币", example: "Am Automaten kann nur mit Kleingeld bezahlt werden.", exampleZh: "这台自动机只能用零钱付款。" }],
  ["angelegt|adj", { meaning: "设置好的；设计成的；投入的", example: "Das langfristig angelegte Programm wird wissenschaftlich begleitet.", exampleZh: "这个长期项目将接受科学评估。" }],
  ["die Heilung|nf", { meaning: "治愈；康复", example: "Frühe Behandlung verbessert die Chancen auf vollständige Heilung.", exampleZh: "及早治疗可以提高完全康复的机会。" }],
  ["der Profit|nm", { meaning: "利润；收益", example: "Kurzfristiger Profit darf nicht auf Kosten der Umwelt gehen.", exampleZh: "短期利润不能以牺牲环境为代价。" }],
  ["tragisch|adj", { meaning: "悲惨的；不幸的；悲剧性的", example: "Der tragische Unfall führte zu strengeren Sicherheitsregeln.", exampleZh: "这场不幸事故促使安全规定更加严格。" }],
  ["fleißig|adj", { meaning: "勤奋的；用功的", example: "Die Studierenden arbeiteten fleißig an ihren Forschungsprojekten.", exampleZh: "学生们努力推进自己的研究项目。" }],
  ["vergeuden|v", { meaning: "浪费；虚度", example: "Durch unklare Abläufe wird viel Zeit vergeudet.", exampleZh: "不清晰的流程浪费了大量时间。" }],
  ["die Mathe|nf", { forms: "die Mathe · meist ohne Plural", meaning: "数学（口语）", example: "Für den Studiengang sind solide Kenntnisse in Mathe erforderlich.", exampleZh: "这个专业需要扎实的数学知识。" }],
  ["das Nickerchen|nn", { meaning: "小睡；打盹", example: "Ein kurzes Nickerchen kann die Konzentration am Nachmittag verbessern.", exampleZh: "短暂小睡可以提高下午的专注力。" }],
  ["die Reue|nf", { forms: "die Reue · meist ohne Plural", meaning: "后悔；悔意", example: "Der Verantwortliche zeigte öffentlich Reue und entschuldigte sich.", exampleZh: "负责人公开表示悔意并道歉。" }],
  ["mitgehen|v", { meaning: "一起去；跟随；理解并赞同", example: "Bei diesem Argument kann ich nur teilweise mitgehen.", exampleZh: "我只能部分赞同这个论点。" }],
  ["umgehend|adj", { forms: "umgehend · unveränderlich", typeCode: "adv", meaning: "立即；尽快", example: "Sicherheitslücken müssen umgehend geschlossen werden.", exampleZh: "安全漏洞必须立即修复。" }],
  ["ertrinken|v", { meaning: "溺水；淹没", example: "Ohne klare Prioritäten droht das Team in Einzelaufgaben zu ertrinken.", exampleZh: "如果没有明确优先事项，团队可能会被琐碎任务淹没。" }],
  ["die Ehre|nf", { meaning: "荣誉；尊敬；荣幸", example: "Es ist mir eine Ehre, dieses Forschungsprojekt vorstellen zu dürfen.", exampleZh: "我很荣幸能介绍这个科研项目。" }],
  ["vielfältig|adj", { meaning: "多样的；丰富的；多方面的", example: "Die Ursachen der Entwicklung sind vielfältig.", exampleZh: "这一变化的原因是多方面的。" }],
  ["der Rohstoff|nm", { meaning: "原料；自然资源", example: "Seltene Metalle sind wichtige Rohstoffe für moderne Technologien.", exampleZh: "稀有金属是现代技术的重要原材料。" }],
  ["die Rezension|nf", { meaning: "评论；书评；影评", example: "Die Fachzeitschrift veröffentlichte eine ausführliche Rezension des neuen Buches.", exampleZh: "专业期刊刊登了对这本新书的详细书评。" }],
  ["die Emission|nf", { meaning: "排放；发行；发射", example: "Neue Grenzwerte sollen die Emission schädlicher Stoffe begrenzen.", exampleZh: "新的限值旨在限制有害物质排放。" }],
  ["der Befehl|nm", { meaning: "命令；指令", example: "Das System führt den Befehl nur nach einer Bestätigung aus.", exampleZh: "系统只有在确认后才执行该指令。" }],
  ["das Kohlenhydrat|nn", { meaning: "碳水化合物", example: "Vollkornprodukte enthalten komplexe Kohlenhydrate.", exampleZh: "全谷物食品含有复合碳水化合物。" }],
  ["der Schlaf|nm", { forms: "der Schlaf · meist ohne Plural", meaning: "睡眠", example: "Ausreichender Schlaf verbessert Konzentration und Leistungsfähigkeit.", exampleZh: "充足睡眠能够提高专注力和工作能力。" }],
  ["der Ehemann|nm", { meaning: "丈夫；已婚男子", example: "Ihr Ehemann übernimmt während ihrer Dienstreise die Kinderbetreuung.", exampleZh: "她出差期间由丈夫照顾孩子。" }],
  ["die Mission|nf", { meaning: "使命；任务；代表团行动", example: "Die Organisation versteht soziale Teilhabe als ihre zentrale Mission.", exampleZh: "该组织把促进社会参与视为核心使命。" }],
  ["der Respekt|nm", { forms: "der Respekt · meist ohne Plural", meaning: "尊重；敬意", example: "Gegenseitiger Respekt ist die Grundlage einer konstruktiven Debatte.", exampleZh: "相互尊重是建设性辩论的基础。" }],
  ["die Position|nf", { meaning: "位置；立场；职位", example: "Die Fraktion erläuterte ihre Position zur geplanten Reform.", exampleZh: "该议会党团阐述了对拟议改革的立场。" }],
  ["zufällig|adj", { meaning: "偶然的；随机的；碰巧", example: "Die Teilnehmenden wurden zufällig ausgewählt.", exampleZh: "参与者是随机选出的。" }],
  ["das Atmen|nn", { forms: "das Atmen · meist ohne Plural", meaning: "呼吸", example: "Bewusstes Atmen kann in Stresssituationen beruhigend wirken.", exampleZh: "有意识地呼吸可以在压力情境中起到镇静作用。" }],
  ["die Natur|nf", { forms: "die Natur · meist ohne Plural", meaning: "自然；本性；性质", example: "Der Schutz der Natur muss bei der Planung berücksichtigt werden.", exampleZh: "规划时必须考虑自然保护。" }],
  ["der Scherz|nm", { meaning: "玩笑；戏言", example: "Seine Bemerkung war als Scherz gemeint, wurde aber missverstanden.", exampleZh: "他的评论原本是开玩笑，却被误解了。" }],
  ["der Trick|nm", { meaning: "技巧；窍门；诡计", example: "Mit einem einfachen Trick lässt sich der Energieverbrauch senken.", exampleZh: "一个简单窍门就能降低能耗。" }],
  ["das Signal|nn", { meaning: "信号；迹象；标志", example: "Die Investition ist ein wichtiges Signal für den Standort.", exampleZh: "这项投资向该地区发出了重要信号。" }],
  ["die Gerechtigkeit|nf", { forms: "die Gerechtigkeit · meist ohne Plural", meaning: "正义；公平", example: "Soziale Gerechtigkeit gehört zu den zentralen Zielen der Reform.", exampleZh: "社会公平是这项改革的核心目标之一。" }],
  ["das Referendum|nn", { meaning: "全民公决；公民投票", example: "In einem Referendum stimmte die Mehrheit für die Verfassungsänderung.", exampleZh: "在全民公决中，多数人赞成修改宪法。" }],
  ["die Phase|nf", { meaning: "阶段；时期；相位", example: "Das Projekt befindet sich jetzt in einer entscheidenden Phase.", exampleZh: "项目目前处于关键阶段。" }],
  ["der Abstand|nm", { meaning: "距离；间隔；差距", example: "Zwischen den Messungen lag ein Abstand von jeweils drei Tagen.", exampleZh: "每次测量之间相隔三天。" }],
  ["der Friedhof|nm", { meaning: "墓地；公墓", example: "Der historische Friedhof wird als Teil des kulturellen Erbes erhalten.", exampleZh: "这座历史公墓作为文化遗产的一部分得到保护。" }],
  ["das Motel|nn", { meaning: "汽车旅馆", example: "Das Motel liegt verkehrsgünstig nahe der Autobahn.", exampleZh: "这家汽车旅馆交通便利，靠近高速公路。" }],
  ["der Eimer|nm", { meaning: "桶；提桶", example: "Das Regenwasser wird in einem großen Eimer gesammelt.", exampleZh: "雨水被收集在一个大桶里。" }],
  ["tropfen|v", { meaning: "滴；滴水", example: "Wenn der Hahn tropft, sollte die Dichtung ersetzt werden.", exampleZh: "如果水龙头滴水，就应该更换密封圈。" }],
  ["der Whisky|nm", { meaning: "威士忌（多指苏格兰或加拿大产）", example: "Die Herkunft des Whiskys muss auf dem Etikett angegeben sein.", exampleZh: "威士忌的产地必须标在标签上。" }],
  ["die Veränderung|nf", { meaning: "变化；改变", example: "Die demografische Veränderung wirkt sich auf den Arbeitsmarkt aus.", exampleZh: "人口结构变化会影响劳动力市场。" }],
  ["kontaktieren|v", { meaning: "联系；与……取得联络", example: "Bei technischen Problemen können Sie den Kundendienst direkt kontaktieren.", exampleZh: "遇到技术问题时，您可以直接联系客服。" }],
  ["angehen|v", { meaning: "开始；处理；涉及", example: "Die Stadt will den Wohnungsmangel mit einem langfristigen Programm angehen.", exampleZh: "市政府希望通过长期项目解决住房短缺。" }],
  ["die Telefonnummer|nf", { meaning: "电话号码", example: "Bitte geben Sie eine Telefonnummer an, unter der Sie erreichbar sind.", exampleZh: "请提供一个可以联系到您的电话号码。" }],
  ["die Ansicht|nf", { meaning: "观点；看法；景色", example: "Nach Ansicht der Fachleute ist eine unabhängige Prüfung notwendig.", exampleZh: "专家认为有必要进行独立评估。" }],
  ["der Instinkt|nm", { meaning: "本能；直觉", example: "In komplexen Entscheidungen reicht Instinkt allein nicht aus.", exampleZh: "面对复杂决策，仅靠直觉是不够的。" }],
  ["das Nest|nn", { meaning: "巢；窝；据点", example: "Das Nest der seltenen Vögel wird während der Brutzeit geschützt.", exampleZh: "繁殖期内，稀有鸟类的巢穴会受到保护。" }],
  ["inklusive|adj", { term: "inklusiv", forms: "inklusiv · als Adjektiv", meaning: "包容的；全纳的", example: "Die Schule verfolgt ein inklusives Bildungskonzept.", exampleZh: "学校推行全纳教育理念。" }],
  ["die Freiheit|nf", { meaning: "自由；自由权；自主空间", example: "Persönliche Freiheit endet dort, wo die Rechte anderer verletzt werden.", exampleZh: "个人自由止于侵害他人权利之处。" }],
  ["die Fähigkeit|nf", { meaning: "能力；本领；才能", example: "Die Fähigkeit, komplexe Informationen verständlich zu erklären, ist hier besonders wichtig.", exampleZh: "清楚解释复杂信息的能力在这里尤其重要。" }],
  ["der Kuss|nm", { meaning: "吻；亲吻", example: "Zum Abschied gab sie ihrem Kind einen Kuss auf die Stirn.", exampleZh: "告别时，她亲吻了孩子的额头。" }],
  ["der Zuschauer|nm", { meaning: "观众；观看者", example: "Die Zuschauer begrüßten die Entscheidung mit langem Applaus.", exampleZh: "观众以长时间的掌声欢迎这项决定。" }],
  ["der Zoo|nm", { meaning: "动物园", example: "Der Zoo beteiligt sich an internationalen Artenschutzprogrammen.", exampleZh: "这家动物园参与国际物种保护项目。" }],
  ["die Auswahl|nf", { meaning: "选择；挑选；可选范围", example: "Bei der Auswahl der Projekte gelten transparente Kriterien.", exampleZh: "项目选拔采用透明标准。" }],
  ["der Ozean|nm", { meaning: "大洋；海洋", example: "Plastikabfälle bedrohen die Ökosysteme der Ozeane.", exampleZh: "塑料垃圾威胁海洋生态系统。" }],
  ["das Knie|nn", { meaning: "膝盖；膝关节", example: "Nach der Wanderung schmerzte sein rechtes Knie.", exampleZh: "徒步后，他的右膝感到疼痛。" }],
  ["der Ausdruck|nm", { meaning: "表达；表情；措辞；打印件", example: "Der Ausdruck ist in diesem Zusammenhang missverständlich.", exampleZh: "这个表达在当前语境中容易引起误解。" }],
  ["leeren|v", { meaning: "倒空；清空；喝光", example: "Die Behälter müssen vor der Reinigung vollständig geleert werden.", exampleZh: "容器在清洗前必须彻底倒空。" }],
  ["das Märchen|nn", { meaning: "童话；虚构故事", example: "Das Märchen wurde in zahlreiche Sprachen übersetzt.", exampleZh: "这个童话被译成多种语言。" }],
  ["unterbrechen|v", { meaning: "打断；中断；暂停", example: "Technische Probleme unterbrachen die Liveübertragung.", exampleZh: "技术问题中断了现场直播。" }],
  ["klingeln|v", { meaning: "响铃；按门铃；打电话", example: "Bitte klingeln Sie am Seiteneingang.", exampleZh: "请在侧门按门铃。" }],
  ["die Lake|nf", { meaning: "盐水；卤水", example: "Das Gemüse wird zur Konservierung in Lake eingelegt.", exampleZh: "这些蔬菜被浸在盐水中保存。" }],
  ["abschließen|v", { meaning: "锁上；完成；签订", example: "Beide Seiten wollen die Verhandlungen noch in diesem Monat abschließen.", exampleZh: "双方希望在本月内结束谈判。" }],
  ["stattfinden|v", { meaning: "举行；发生", example: "Die öffentliche Anhörung findet am kommenden Montag statt.", exampleZh: "公开听证会将于下周一举行。" }],
  ["erfinden|v", { meaning: "发明；虚构", example: "Das Verfahren wurde von einem internationalen Forschungsteam erfunden.", exampleZh: "这项方法由一个国际科研团队发明。" }],
  ["das Magazin|nn", { meaning: "杂志；仓库；弹匣", example: "Das Magazin veröffentlicht monatlich Berichte über Wissenschaft und Gesellschaft.", exampleZh: "这本杂志每月刊登有关科学与社会的报道。" }],
  ["der Schaden|nm", { meaning: "损害；损失；故障", example: "Der Schaden an der Brücke wird auf mehrere Millionen Euro geschätzt.", exampleZh: "这座桥的损失估计达数百万欧元。" }],
  ["mittel|adj", { meaning: "中等的；一般的", example: "Die Qualität der vorläufigen Daten ist bislang nur mittel.", exampleZh: "初步数据的质量目前只能算一般。" }],
  ["abdanken|v", { meaning: "退位；辞职", example: "Der Vorsitzende wollte trotz anhaltender Kritik nicht abdanken.", exampleZh: "尽管批评不断，主席仍不愿辞职。" }],
  ["die Leere|nf", { forms: "die Leere · meist ohne Plural", meaning: "空虚；空旷；空白", example: "Die Leere im ehemaligen Fabrikgebäude wirkt bedrückend.", exampleZh: "旧工厂大楼里的空旷感令人压抑。" }],
  ["der Block|nm", { meaning: "块；街区；记事本", example: "Der gesamte Block wird energetisch saniert.", exampleZh: "整个街区将进行节能改造。" }],
  ["die Front|nf", { meaning: "前线；阵线；正面", example: "An der politischen Front gab es zunächst keine Bewegung.", exampleZh: "政治层面起初没有任何进展。" }],
  ["das Zentrum|nn", { meaning: "中心；核心", example: "Das Zentrum arbeitet eng mit mehreren Hochschulen zusammen.", exampleZh: "该中心与多所高校密切合作。" }],
  ["geschieden|adj", { meaning: "离婚的；分开的", example: "Die beiden Eltern sind geschieden, teilen sich aber die Betreuung.", exampleZh: "两位家长已经离婚，但共同承担照护责任。" }],
  ["die Bewährung|nf", { meaning: "考验；试用；缓刑", example: "Das neue Verfahren steht noch vor seiner Bewährung in der Praxis.", exampleZh: "新程序还需要经受实践检验。" }],
  ["der Stamm|nm", { meaning: "树干；部族；词干；固定成员", example: "Der Stamm des Wortes bleibt bei der Ableitung erhalten.", exampleZh: "构词时这个词的词干保持不变。" }],
  ["antreten|v", { meaning: "开始；参加；就任", example: "Drei Kandidatinnen wollen bei der Wahl gegeneinander antreten.", exampleZh: "三名候选人希望在选举中展开竞争。" }],
  ["unterbrochen|adj", { meaning: "中断的；断断续续的", example: "Die Verbindung war mehrere Stunden lang unterbrochen.", exampleZh: "连接中断了数小时。" }],
  ["die Kabine|nf", { meaning: "小舱；更衣室；隔间", example: "Die Kabine bietet der Fahrerin einen guten Überblick über die Straße.", exampleZh: "驾驶室让司机能够清楚观察道路。" }],
  ["der Becher|nm", { meaning: "杯子；奖杯", example: "Ein wiederverwendbarer Becher reduziert den Abfall bei Veranstaltungen.", exampleZh: "可重复使用的杯子能够减少活动垃圾。" }],
  ["die Entscheidungsgrundlage|nf", { meaning: "决策依据", example: "Verlässliche Daten bilden eine wichtige Entscheidungsgrundlage.", exampleZh: "可靠数据构成重要的决策依据。" }],
  ["würdig|adj", { meaning: "值得的；有尊严的", example: "Jeder Mensch hat Anspruch auf ein würdig gestaltetes Leben.", exampleZh: "每个人都有权过有尊严的生活。" }],
  ["der Anfall|nm", { meaning: "发作；突然的冲动", example: "Bei einem schweren Anfall ist schnelle medizinische Hilfe wichtig.", exampleZh: "严重发作时，及时医疗救助十分重要。" }],
  ["das Dorf|nn", { meaning: "村庄；乡村", example: "Viele junge Erwachsene verlassen das Dorf, weil es dort kaum Arbeitsplätze gibt.", exampleZh: "许多年轻人因为当地就业机会很少而离开村庄。" }],
  ["das Loch|nn", { meaning: "洞；孔；缺口", example: "Durch ein Loch im Dach drang Regenwasser in das Gebäude ein.", exampleZh: "雨水从屋顶的破洞渗进了楼里。" }],
  ["der Stein|nm", { meaning: "石头；石块；岩石", example: "Für die Fassade wurde ein besonders widerstandsfähiger Stein verwendet.", exampleZh: "外墙采用了一种格外耐用的石材。" }],
  ["verlangen|v", { meaning: "要求；索要；需要", example: "Die Gewerkschaft verlangt verbindliche Regeln zum Schutz der Beschäftigten.", exampleZh: "工会要求制定保护员工的强制性规定。" }],
  ["schwach|adj", { meaning: "弱的；微弱的；薄弱的", example: "Die Nachfrage blieb im ersten Quartal überraschend schwach.", exampleZh: "第一季度的需求出乎意料地疲软。" }],
  ["die Krankheit|nf", { meaning: "疾病；病症", example: "Eine frühe Diagnose kann den Verlauf der Krankheit deutlich verbessern.", exampleZh: "早期诊断可以显著改善病程。" }],
  ["der Schatten|nm", { meaning: "影子；阴影；背光处", example: "Die wirtschaftliche Krise wirft einen Schatten auf die Haushaltsplanung.", exampleZh: "经济危机给财政预算蒙上了阴影。" }],
  ["behandeln|v", { meaning: "治疗；处理；讨论", example: "Der Bericht behandelt die sozialen Folgen des Strukturwandels.", exampleZh: "这份报告讨论了结构转型带来的社会后果。" }],
  ["beobachten|v", { meaning: "观察；留意；监测", example: "Fachleute beobachten die Entwicklung der Energiepreise sehr genau.", exampleZh: "专家正在密切监测能源价格的变化。" }],
  ["träumen|v", { meaning: "做梦；梦想；幻想", example: "Viele Beschäftigte träumen von einer besseren Vereinbarkeit von Beruf und Familie.", exampleZh: "许多职场人士希望能更好地兼顾工作与家庭。" }],
  ["klären|v", { meaning: "澄清；解决；弄清", example: "Vor Vertragsabschluss müssen noch mehrere rechtliche Fragen geklärt werden.", exampleZh: "签订合同前还必须澄清若干法律问题。" }],
  ["der Wolf|nm", { meaning: "狼；狼属动物", example: "Die Rückkehr des Wolfs führt in ländlichen Regionen zu kontroversen Debatten.", exampleZh: "狼的回归在乡村地区引发了有争议的讨论。" }],
  ["reiten|v", { meaning: "骑马；骑乘", example: "Im Schutzgebiet darf nur auf den ausgewiesenen Wegen geritten werden.", exampleZh: "在保护区内只能沿指定路线骑马。" }],
  ["riechen|v", { meaning: "闻；闻起来；嗅到", example: "Das Wasser riecht ungewöhnlich nach Chemikalien und wird deshalb untersucht.", exampleZh: "这水闻起来有异常的化学品气味，因此正在接受检测。" }],
  ["der Unterricht|nm", { forms: "der Unterricht · meist ohne Plural", meaning: "课堂教学；课程；授课", example: "Digitale Medien werden zunehmend in den Unterricht integriert.", exampleZh: "数字媒体正日益融入课堂教学。" }],
  ["schneiden|v", { meaning: "切；剪；裁", example: "Das Material lässt sich mit gewöhnlichen Werkzeugen nur schwer schneiden.", exampleZh: "这种材料很难用普通工具切割。" }],
  ["der Kreis|nm", { meaning: "圆；圈子；行政县", example: "Der Kreis finanziert den Ausbau des öffentlichen Nahverkehrs.", exampleZh: "该行政县为公共交通扩建提供资金。" }],
  ["der Hafen|nm", { meaning: "港口；港湾；避风港", example: "Der Hafen soll zu einem klimaneutralen Logistikzentrum umgebaut werden.", exampleZh: "这个港口将被改造成气候中和的物流中心。" }],
  ["der Stahl|nm", { forms: "der Stahl · meist ohne Plural", meaning: "钢；钢材", example: "Die Industrie entwickelt Verfahren zur klimafreundlicheren Herstellung von Stahl.", exampleZh: "工业界正在开发更环保的钢铁生产工艺。" }],
  ["planen|v", { meaning: "计划；规划；设计", example: "Die Kommune plant ein neues Wohngebiet mit guter Verkehrsanbindung.", exampleZh: "该市镇正在规划一个交通便利的新住宅区。" }],
  ["die Mauer|nf", { meaning: "墙；围墙；壁垒", example: "Die historische Mauer wird mit öffentlichen Mitteln restauriert.", exampleZh: "这面历史城墙将使用公共资金修复。" }],
  ["abnehmen|v", { meaning: "减少；减轻；取下；接听", example: "Seit der Einführung der Maßnahme hat die Verkehrsbelastung deutlich abgenommen.", exampleZh: "自实施这项措施以来，交通负担已明显减轻。" }],
  ["das Paket|nn", { meaning: "包裹；一揽子方案；组合", example: "Das Parlament verabschiedete ein Paket aus mehreren Entlastungsmaßnahmen.", exampleZh: "议会通过了一揽子由多项纾困措施组成的方案。" }],
  ["stürzen|v", { meaning: "跌倒；坠落；推翻", example: "Nach heftigen Regenfällen stürzte ein Teil der Böschung ein.", exampleZh: "暴雨过后，部分边坡坍塌了。" }],
  ["benötigen|v", { meaning: "需要；必需", example: "Für die Auswertung werden verlässliche und vergleichbare Daten benötigt.", exampleZh: "这项分析需要可靠且具有可比性的数据。" }],
  ["der Tropfen|nm", { meaning: "滴；液滴；少量", example: "Bereits wenige Tropfen der Substanz können das Messergebnis verändern.", exampleZh: "哪怕只有几滴这种物质，也可能改变测量结果。" }],
  ["der Kanal|nm", { meaning: "运河；通道；频道", example: "Die Behörde informiert über mehrere digitale Kanäle über die neuen Regeln.", exampleZh: "该部门通过多个数字渠道介绍新规定。" }],
  ["die Blume|nf", { meaning: "花；花朵；开花植物", example: "Auf den öffentlichen Grünflächen werden vor allem heimische Blumen gepflanzt.", exampleZh: "公共绿地主要种植本地花卉。" }],
  ["faul|adj", { meaning: "懒惰的；腐烂的；腐败的", example: "Faules Obst muss vor der Weiterverarbeitung aussortiert werden.", exampleZh: "腐烂的水果必须在进一步加工前挑出来。" }],
  ["das Kabel|nn", { meaning: "电缆；线缆；有线连接", example: "Ein beschädigtes Kabel führte zu einem mehrstündigen Stromausfall.", exampleZh: "一根损坏的电缆造成了数小时停电。" }],
  ["beschädigt|adj", { meaning: "受损的；损坏的", example: "Die beschädigten Bauteile müssen aus Sicherheitsgründen ersetzt werden.", exampleZh: "出于安全原因，受损部件必须更换。" }],
  ["tauchen|v", { meaning: "潜水；下潜；浸入", example: "Forschende tauchten bis zum Grund des Sees, um Proben zu entnehmen.", exampleZh: "研究人员潜到湖底采集样本。" }],
  ["verdanken|v", { meaning: "归功于；得益于；欠", example: "Das gute Ergebnis ist vor allem der engen Zusammenarbeit beider Teams zu verdanken.", exampleZh: "这一良好结果主要得益于两个团队的密切合作。" }],
  ["die Nadel|nf", { meaning: "针；针状物；指针", example: "Die Ärztin verwendete für die Untersuchung eine besonders feine Nadel.", exampleZh: "医生在检查中使用了一根特别细的针。" }],
  ["beeinflussen|v", { meaning: "影响；左右；干预", example: "Soziale Herkunft kann die Bildungschancen erheblich beeinflussen.", exampleZh: "社会出身可能会显著影响受教育机会。" }],
  ["einnehmen|v", { meaning: "服用；占据；收取", example: "Das Medikament darf nur nach ärztlicher Rücksprache eingenommen werden.", exampleZh: "这种药只能在咨询医生后服用。" }],
  ["die Burg|nf", { meaning: "城堡；要塞；堡垒", example: "Die mittelalterliche Burg wird heute als Museum genutzt.", exampleZh: "这座中世纪城堡如今被用作博物馆。" }],
  ["bewachen|v", { meaning: "守卫；看守；监视", example: "Während der Ausstellung werden die wertvollen Objekte rund um die Uhr bewacht.", exampleZh: "展览期间，这些贵重展品将全天候有人看守。" }],
  ["verursachen|v", { meaning: "引起；导致；造成", example: "Der Lieferausfall verursachte erhebliche Verzögerungen in der Produktion.", exampleZh: "供货中断导致生产严重延误。" }],
  ["das Ufer|nn", { meaning: "岸；河岸；湖岸", example: "Zum Schutz vor Hochwasser wird das Ufer an mehreren Stellen verstärkt.", exampleZh: "为防范洪水，多处岸堤正在加固。" }],
  ["die Scheibe|nf", { meaning: "薄片；玻璃窗；圆盘", example: "Die beschädigte Scheibe des Zuges musste vollständig ausgetauscht werden.", exampleZh: "列车上受损的玻璃窗必须整体更换。" }],
  ["die Ernte|nf", { meaning: "收获；收成；采收", example: "Die anhaltende Trockenheit gefährdet die diesjährige Ernte.", exampleZh: "持续干旱危及今年的收成。" }],
  ["mitbekommen|v", { meaning: "注意到；听说；察觉", example: "Viele Anwohner haben von der kurzfristigen Planänderung nichts mitbekommen.", exampleZh: "许多居民没有注意到这次临时调整计划。" }],
  ["eintreten|v", { forms: "eintreten · tritt ein · trat ein · ist eingetreten", meaning: "进入；发生；支持", example: "Die erwartete Verbesserung ist bislang nicht eingetreten.", exampleZh: "预期中的改善至今尚未出现。" }],
  ["gefüllt|adj", { meaning: "装满的；填充的；充满的", example: "Der Fragebogen enthielt mehrere mit Beispielen gefüllte Textfelder.", exampleZh: "问卷中有多个填有示例的文本框。" }],
  ["der Kasten|nm", { meaning: "箱子；盒子；框", example: "Die wichtigsten Hinweise sind in einem farbig markierten Kasten zusammengefasst.", exampleZh: "最重要的提示汇总在一个彩色标注框中。" }],
  ["das Video|nn", { meaning: "视频；录像；影像资料", example: "Das Video erläutert den Ablauf des Verfahrens Schritt für Schritt.", exampleZh: "这段视频逐步说明了流程。" }],
  ["der Star|nm", { meaning: "明星；名人；明星选手", example: "Der Star nutzte seine Bekanntheit, um auf das soziale Projekt aufmerksam zu machen.", exampleZh: "这位明星利用自己的知名度为该社会项目争取关注。" }],
  ["begegnen|v", { meaning: "遇见；碰到；应对", example: "Der wachsenden Skepsis lässt sich nur mit transparenter Kommunikation begegnen.", exampleZh: "只有通过透明沟通才能应对日益加深的怀疑。" }],
  ["die Bühne|nf", { meaning: "舞台；演艺界；活动平台", example: "Auf der Bühne verkörperte sie die Rolle der Hamlet-Figur überzeugend.", exampleZh: "她在舞台上令人信服地扮演了哈姆雷特这一角色。" }],
  ["virtuell|adj", { meaning: "虚拟的；在线的", example: "Die Konferenz findet in einem virtuellen Veranstaltungsraum statt.", exampleZh: "会议将在虚拟会场中举行。" }],
  ["das Gespräch|nn", { meaning: "谈话；会谈；面谈", example: "In einem vertraulichen Gespräch erläuterten beide Seiten ihre Erwartungen.", exampleZh: "双方在一次保密会谈中阐明了各自的期望。" }],
  ["die Tote|nf", { forms: "die Tote · die Toten", meaning: "死者；遇难女子", example: "Bei dem Unfall gab es eine Tote und drei Verletzte.", exampleZh: "这起事故造成一名女子死亡、三人受伤。" }],
  ["ausgeführt|adj", { meaning: "已实施的；已执行的；详述的", example: "Die fachgerecht ausgeführten Arbeiten wurden anschließend unabhängig geprüft.", exampleZh: "按规范完成的工程随后接受了独立检查。" }],
  ["Gesundheit|intj", { meaning: "保重；祝你健康（他人打喷嚏时）", example: "„Gesundheit!“ – „Danke!“", exampleZh: "“祝你健康！”——“谢谢！”" }],
  ["die Leitung|nf", { meaning: "领导；管理；线路；管道", example: "Die Leitung ist im Moment besetzt; bitte versuchen Sie es später noch einmal.", exampleZh: "电话目前占线，请稍后再拨。" }],
  ["das Ergebnis|nn", { meaning: "结果；成果；比赛结果", example: "Das Ergebnis der unabhängigen Prüfung wird nächste Woche veröffentlicht.", exampleZh: "独立审查的结果将于下周公布。" }],
  ["stoppen|v", { meaning: "使停止；阻止；拦停", example: "Nur ein gemeinsames Vorgehen kann die weitere Ausbreitung stoppen.", exampleZh: "只有采取共同行动才能阻止其进一步扩散。" }],
  ["ernähren|v", { meaning: "为……提供食物；养活；供养", example: "Mit einem einzigen Einkommen muss sie eine fünfköpfige Familie ernähren.", exampleZh: "她必须靠一份收入养活五口之家。" }],
  ["die Landung|nf", { meaning: "着陆；降落；登陆", example: "Wegen des starken Seitenwinds musste die Landung verschoben werden.", exampleZh: "由于强劲的侧风，飞机降落不得不推迟。" }],
  ["das Heil|nn", { term: "das Wohlergehen", forms: "das Wohlergehen · meist ohne Plural", meaning: "福祉；安康；幸福", example: "Bei allen Entscheidungen muss das Wohlergehen der Kinder im Mittelpunkt stehen.", exampleZh: "作出任何决定时都必须把儿童福祉放在首位。" }],
  ["umarmen|v", { meaning: "拥抱；搂抱", example: "Nach der langen Trennung umarmten sich die beiden Freunde herzlich.", exampleZh: "久别之后，两位朋友热情地拥抱了彼此。" }],
  ["anstellen|v", { meaning: "雇用；排队；做（坏事）", example: "Das Unternehmen will im Herbst zehn zusätzliche Fachkräfte anstellen.", exampleZh: "公司计划在秋季增聘十名专业人员。" }],
  ["befohlen|adj", { meaning: "奉命的；受命执行的", example: "Die Soldatin verweigerte einen rechtswidrigen Befehl, obwohl ihr Gehorsam befohlen worden war.", exampleZh: "尽管被命令服从，这名女军人仍拒绝执行违法命令。" }],
  ["das Model|nn", { meaning: "模特；时装模特", example: "Das Model arbeitet für mehrere nachhaltige Modemarken.", exampleZh: "这位模特为多个可持续时尚品牌工作。" }],
  ["der Akt|nm", { meaning: "行为；（戏剧的）幕；裸体写生", example: "Das Theaterstück besteht aus drei Akten.", exampleZh: "这部戏剧由三幕组成。" }],
  ["die Mark|nf", { term: "die Mietpreisbremse", forms: "die Mietpreisbremse · die Mietpreisbremsen", meaning: "租金涨幅限制；房租管制措施", example: "Die Wirksamkeit der Mietpreisbremse wird in vielen Städten kontrovers diskutiert.", exampleZh: "许多城市都在争论租金涨幅限制是否有效。" }],
  ["das Kätzchen|nn", { term: "die Arbeitsmarktintegration", forms: "die Arbeitsmarktintegration · meist ohne Plural", typeCode: "nf", meaning: "劳动力市场融入；就业融入", example: "Sprachkurse und Praktika erleichtern die Arbeitsmarktintegration von Zugewanderten.", exampleZh: "语言课程和实习有助于移民融入劳动力市场。" }],
  ["der Fahrstuhl|nm", { term: "der Sanierungsstau", forms: "der Sanierungsstau · die Sanierungsstaus", meaning: "修缮积压；维修欠账", example: "Der Sanierungsstau an Schulen kann nur mit langfristigen Investitionen abgebaut werden.", exampleZh: "学校积压的修缮问题只能通过长期投资逐步解决。" }],
  ["die Avenue|nf", { term: "die Quartiersentwicklung", forms: "die Quartiersentwicklung · meist ohne Plural", meaning: "街区发展；社区更新", example: "Bei der Quartiersentwicklung werden Wohnen, Verkehr und Grünflächen gemeinsam geplant.", exampleZh: "街区发展需要统筹规划住房、交通和绿地。" }],
  ["die Braut|nf", { term: "die Lieferzuverlässigkeit", forms: "die Lieferzuverlässigkeit · meist ohne Plural", meaning: "供货可靠性；交付稳定性", example: "Mehrere Bezugsquellen erhöhen die Lieferzuverlässigkeit in Krisenzeiten.", exampleZh: "多元采购来源可以提高危机时期的供货可靠性。" }],
  ["die Melodie|nf", { meaning: "旋律；曲调", example: "Die Melodie greift ein bekanntes Volkslied auf.", exampleZh: "这段旋律借鉴了一首著名民歌。" }],
  ["sprengen|v", { meaning: "炸毁；爆破；突破；超出", example: "Die zusätzlichen Baukosten würden den vereinbarten Finanzrahmen sprengen.", exampleZh: "额外的建筑费用将超出商定的资金范围。" }],
  ["reserviert|adj", { meaning: "预订的；保留的；矜持的", example: "Für die internationalen Gäste wurde ein eigener Bereich reserviert.", exampleZh: "已为国际来宾预留了一个专门区域。" }],
  ["erholen|v", { term: "sich erholen", forms: "sich erholen · erholt sich · erholte sich · hat sich erholt", meaning: "恢复；休养；复苏", example: "Die regionale Wirtschaft hat sich schneller als erwartet erholt.", exampleZh: "地区经济复苏得比预期更快。" }],
  ["die Staffel|nf", { meaning: "（电视剧的）季；接力队；梯队", example: "Die letzte Folge der neuen Staffel wird am Sonntag ausgestrahlt.", exampleZh: "新一季的最后一集将于周日播出。" }],
  ["die Schublade|nf", { meaning: "抽屉；僵化分类", example: "Vertrauliche Unterlagen werden in einer abschließbaren Schublade aufbewahrt.", exampleZh: "机密材料存放在一个可以上锁的抽屉里。" }],
  ["durchgedreht|adj", { meaning: "发疯的；失控的；极度激动的", example: "Nach tagelangem Schlafmangel wirkte er völlig durchgedreht.", exampleZh: "连续几天睡眠不足后，他显得完全失去了控制。" }],
  ["der Toast|nm", { forms: "der Toast · die Toasts", meaning: "吐司；烤面包片；祝酒", example: "Zum Abschluss brachte die Gastgeberin einen Toast auf die Zusammenarbeit aus.", exampleZh: "最后，女主人为双方合作举杯祝酒。" }],
  ["das Stechen|nn", { forms: "das Stechen · meist ohne Plural", meaning: "刺痛；针扎般疼痛", example: "Ein plötzliches Stechen im Rücken sollte ärztlich abgeklärt werden.", exampleZh: "背部突然出现刺痛时应请医生检查。" }],
  ["die Anweisung|nf", { meaning: "指示；操作说明；付款指令", example: "Bitte beachten Sie die Anweisungen auf dem Bildschirm.", exampleZh: "请遵循屏幕上的操作说明。" }],
  ["die UN|nf", { forms: "die UN · meist ohne Plural", meaning: "联合国", example: "Die UN fordert eine stärkere internationale Zusammenarbeit.", exampleZh: "联合国呼吁加强国际合作。" }],
  ["hergebracht|adj", { term: "herbringen", forms: "herbringen · bringt her · brachte her · hat hergebracht", typeCode: "v", meaning: "带来；把……带到这里", example: "Die Techniker brachten die benötigten Ersatzteile noch am selben Tag her.", exampleZh: "技术人员当天就把所需备件带了过来。" }],
  ["geteilt|adj", { meaning: "分开的；分裂的；有分歧的", example: "Die Öffentlichkeit ist in dieser Frage weiterhin tief geteilt.", exampleZh: "公众在这个问题上仍存在严重分歧。" }],
  ["besagt|adj", { term: "besagen", forms: "besagen · besagt · besagte · hat besagt", typeCode: "v", meaning: "表明；说明；规定", example: "Die Vorschrift besagt, dass alle Anträge schriftlich eingereicht werden müssen.", exampleZh: "该规定要求所有申请都必须以书面形式提交。" }],
  ["der Lkw|nm", { forms: "der Lkw · die Lkw", meaning: "卡车；载重汽车", example: "Der Lkw transportierte medizinische Geräte ins Krisengebiet.", exampleZh: "卡车把医疗设备运往受灾地区。" }],
  ["das Päckchen|nn", { meaning: "小包裹；小包", example: "Warum ist mein Päckchen noch immer nicht angekommen?", exampleZh: "为什么我的小包裹还没有送到？" }],
  ["traut|adj", { term: "sich etwas zutrauen", forms: "sich etwas zutrauen · traut sich etwas zu · traute sich etwas zu · hat sich etwas zugetraut", typeCode: "v", meaning: "相信自己能做到；敢于承担", example: "Nach der Fortbildung traut sie sich die Leitung des Projekts zu.", exampleZh: "培训结束后，她相信自己能够负责这个项目。" }],
  ["außergewöhnlich|adj", { meaning: "非凡的；异常的；罕见的", example: "Die Studie beruht auf einer außergewöhnlich breiten Datengrundlage.", exampleZh: "这项研究以异常广泛的数据为基础。" }],
  ["befohlen|adj", { term: "die Weisungsbefugnis", forms: "die Weisungsbefugnis · die Weisungsbefugnisse", typeCode: "nf", meaning: "指令权限；下达指示的权力", example: "Nur die Geschäftsführung besitzt in dieser Frage die Weisungsbefugnis.", exampleZh: "在这个问题上，只有公司管理层拥有下达指示的权限。" }],
]);

function parseTeachingLines(source) {
  const map = new Map();
  for (const line of source.split("\n")) {
    const parts = line.split("|");
    if (parts.length !== 5) throw new Error(`Malformed B2 teaching line: ${line}`);
    const [term, typeCode, meaning, example, exampleZh] = parts;
    map.set(`${term}|${typeCode}`, { meaning, example, exampleZh });
  }
  return map;
}

const teaching = parseTeachingLines(teachingLines);

const traditionalToSimplified = new Map(Object.entries({
  個: "个", 們: "们", 為: "为", 與: "与", 說: "说", 話: "话", 時: "时",
  從: "从", 對: "对", 會: "会", 還: "还", 進: "进", 過: "过", 開: "开",
  發: "发", 現: "现", 間: "间", 問: "问", 題: "题", 點: "点", 總: "总",
  經: "经", 體: "体", 學: "学", 習: "习", 應: "应", 該: "该", 萬: "万",
  專: "专", 業: "业", 關: "关", 係: "系", 實: "实", 際: "际", 頭: "头",
  機: "机", 號: "号", 師: "师", 慣: "惯", 國: "国", 語: "语", 樣: "样",
  標: "标", 準: "准", 廣: "广", 東: "东", 風: "风", 錢: "钱", 電: "电",
  車: "车", 門: "门", 書: "书", 報: "报", 見: "见", 聽: "听", 買: "买",
  賣: "卖", 長: "长", 難: "难", 簡: "简", 單: "单", 雙: "双", 計: "计",
  劃: "划", 線: "线", 員: "员", 倉: "仓", 處: "处", 區: "区", 橋: "桥",
  樓: "楼", 鄉: "乡", 鄰: "邻", 規: "规", 則: "则", 責: "责", 檢: "检",
  醫: "医", 藥: "药", 療: "疗", 險: "险", 據: "据", 證: "证", 導: "导",
  續: "续", 結: "结", 統: "统", 價: "价", 質: "质", 產: "产", 設: "设",
  備: "备", 資: "资", 訊: "讯", 網: "网", 絡: "络", 畫: "画", 圖: "图",
  數: "数", 擇: "择", 擔: "担", 憂: "忧", 歡: "欢", 樂: "乐", 驚: "惊",
  許: "许", 讓: "让", 幫: "帮", 傳: "传", 達: "达", 聯: "联", 繫: "系",
  環: "环", 氣: "气", 壓: "压", 歷: "历", 變: "变", 戰: "战", 爭: "争",
  勝: "胜", 敗: "败", 組: "组", 織: "织", 參: "参", 觀: "观", 評: "评",
  論: "论", 議: "议", 認: "认", 識: "识", 覺: "觉", 態: "态", 夢: "梦",
  愛: "爱", 親: "亲", 屬: "属", 兒: "儿", 孫: "孙", 婦: "妇", 貓: "猫",
  鳥: "鸟", 魚: "鱼", 馬: "马", 雞: "鸡", 麵: "面", 飯: "饭", 飲: "饮",
  湯: "汤", 餅: "饼", 蘋: "苹", 蘿: "萝", 蔔: "卜", 麥: "麦", 鹽: "盐",
  溫: "温", 涼: "凉", 濕: "湿", 乾: "干", 聲: "声", 燈: "灯", 牆: "墙",
  場: "场", 廳: "厅", 廚: "厨", 衛: "卫", 盤: "盘", 傘: "伞", 褲: "裤",
  襯: "衬", 襪: "袜", 戲: "戏", 劇: "剧", 節: "节", 賽: "赛", 獎: "奖",
  輸: "输", 贏: "赢", 運: "运", 動: "动", 隊: "队", 費: "费", 稅: "税",
  貸: "贷", 賬: "账", 帳: "账", 兌: "兑", 換: "换", 務: "务", 辦: "办",
  廠: "厂", 領: "领", 僱: "雇", 職: "职", 貿: "贸", 濟: "济", 權: "权",
  義: "义", 團: "团", 術: "术", 創: "创", 鐘: "钟", 監: "监", 獄: "狱",
  獵: "猎", 爾: "尔", 閉: "闭", 這: "这", 嗎: "吗", 貴: "贵", 緊: "紧",
  汙: "污", 懶: "懒", 給: "给", 帶: "带", 園: "园", 預: "预", 將: "将",
  歸: "归", 於: "于", 飛: "飞", 謀: "谋", 殺: "杀", 兇: "凶", 屜: "屉",
  裡: "里", 裏: "里", 軍: "军", 髒: "脏", 隻: "只", 惡: "恶", 種: "种",
  儀: "仪", 來: "来", 執: "执", 沒: "没", 後: "后", 頂: "顶", 堅: "坚",
  持: "持", 課: "课", 躍: "跃", 擁: "拥", 戴: "戴", 稱: "称", 鐵: "铁",
  製: "制", 繃: "绷", 欄: "栏", 預: "预", 算: "算", 歲: "岁", 比: "比",
  較: "较", 輛: "辆", 蓋: "盖", 幾: "几", 滿: "满", 筆: "笔", 譯: "译",
  斷: "断", 瑪: "玛", 麗: "丽", 婭: "娅", 並: "并", 鈴: "铃", 響: "响",
  徑: "径", 條: "条", 護: "护", 針: "针", 嘗: "尝", 試: "试", 罷: "罢",
  鎖: "锁", 選: "选", 慶: "庆", 舉: "举", 類: "类", 輪: "轮", 訂: "订",
  閱: "阅", 雜: "杂", 誌: "志", 傷: "伤", 腳: "脚", 瘋: "疯", 撿: "捡",
}));
const toMainlandSimplified = OpenCC.Converter({ from: "twp", to: "cn" });

function normalizeLearnerChinese(value, sentence = false) {
  let result = Array.from(value, (character) =>
    traditionalToSimplified.get(character) ?? character).join("");
  result = result
    .replaceAll("程序", "流程")
    .replaceAll("显著", "明显")
    .replaceAll("核心使命", "首要使命")
    .replaceAll("核心目标", "主要目标")
    .replaceAll("核心组成部分", "重要组成部分")
    .replaceAll("中心；核心", "中心；关键部分")
    .replaceAll("品质", "质量")
    .replaceAll("尚未处理的文件", "尚未处理的材料")
    .replaceAll("贵重文件", "贵重资料")
    .replaceAll("机密文件", "机密材料");
  result = toMainlandSimplified(result).replaceAll("什幺", "什么");
  result = result
    .replace(/,/gu, "，")
    .replace(/;/gu, "；")
    .replace(/\?/gu, "？")
    .replace(/!/gu, "！");
  if (sentence && result && !/[。！？…][”’》】）]?$/u.test(result)) result += "。";
  return result.trim();
}

let original = JSON.parse(await readFile(wordbookPath, "utf8"));
try {
  const previousReview = JSON.parse(await readFile(reviewPath, "utf8"));
  if (
    previousReview?.level === "B2"
    && previousReview.entries?.length === original.words.length
    && previousReview.entries.every((entry) => entry.before)
  ) {
    original = {
      ...original,
      words: previousReview.entries.map((entry) =>
        original.fields.map((field) => entry.before[field])),
    };
  }
} catch {
  // The first editorial run has no prior B2 review.
}
const wordbook = structuredClone(original);
const fields = Object.fromEntries(wordbook.fields.map((name, index) => [name, index]));

for (const row of wordbook.words) {
  const key = `${row[fields.term]}|${row[fields.typeCode]}`;
  const replacement = replacements.get(key);
  if (replacement) {
    const [term, forms, typeCode, meaning, example, exampleZh] = replacement;
    row[fields.term] = term;
    row[fields.forms] = forms;
    row[fields.typeCode] = typeCode;
    row[fields.meaning] = meaning;
    row[fields.example] = example;
    row[fields.exampleZh] = exampleZh;
    continue;
  }
  const correction = fieldCorrections.get(key);
  if (correction) {
    for (const [field, value] of Object.entries(correction)) row[fields[field]] = value;
    continue;
  }
  const edited = teaching.get(key);
  if (!edited) continue;
  row[fields.meaning] = edited.meaning;
  row[fields.example] = edited.example;
  row[fields.exampleZh] = edited.exampleZh;
}

const lexicalObject = (row, fieldMap = fields) => ({
  id: row[fieldMap.id],
  term: row[fieldMap.term],
  forms: row[fieldMap.forms],
  typeCode: row[fieldMap.typeCode],
  meaning: row[fieldMap.meaning],
  example: row[fieldMap.example],
  exampleZh: row[fieldMap.exampleZh],
});
const standardKey = (entry) =>
  `${entry.term.normalize("NFC").trim().toLocaleLowerCase("de")}|${expectedDictionaryPos(entry)}`;
const lowerEntries = [];
for (const level of ["a1", "a2", "b1"]) {
  const lowerBook = JSON.parse(await readFile(
    path.join(root, "public", "wordbooks", `${level}-v1.json`),
    "utf8",
  ));
  const lowerFields = Object.fromEntries(lowerBook.fields.map((name, index) => [name, index]));
  lowerEntries.push(...lowerBook.words.map((row) => lexicalObject(row, lowerFields)));
}
lowerEntries.push(...await loadCuratedEntries(root));
const lowerKeys = new Set(lowerEntries.map(standardKey));
const occupiedB2Keys = new Set(
  wordbook.words
    .map((row) => lexicalObject(row))
    .filter((entry) => !lowerKeys.has(standardKey(entry)))
    .map(standardKey),
);
const eligibleDedupeCandidates = dedupeCandidates.filter((candidate) => {
  const entry = {
    term: candidate[0],
    forms: candidate[1],
    typeCode: candidate[2],
    meaning: candidate[3],
    example: candidate[4],
    exampleZh: candidate[5],
  };
  const key = standardKey(entry);
  if (lowerKeys.has(key) || occupiedB2Keys.has(key)) return false;
  occupiedB2Keys.add(key);
  return true;
});

let dedupeCandidateIndex = 0;
let lowerLevelReplacementsApplied = 0;
for (const row of wordbook.words) {
  if (!lowerKeys.has(standardKey(lexicalObject(row)))) continue;
  const candidate = eligibleDedupeCandidates[dedupeCandidateIndex];
  if (!candidate) {
    throw new Error(
      `B2 dedupe pool exhausted after ${lowerLevelReplacementsApplied} lower-level replacements.`,
    );
  }
  row[fields.term] = candidate[0];
  row[fields.forms] = candidate[1];
  row[fields.typeCode] = candidate[2];
  row[fields.meaning] = candidate[3];
  row[fields.example] = candidate[4];
  row[fields.exampleZh] = candidate[5];
  dedupeCandidateIndex += 1;
  lowerLevelReplacementsApplied += 1;
}

const postDedupeCorrections = new Map([
  ["der Zeugenschutz|nm", {
    meaning: "证人保护",
    example: "Der Zeugenschutz soll gefährdete Zeugen und ihre Familien vor Vergeltung schützen.",
    exampleZh: "证人保护旨在使受到威胁的证人及其家属免遭报复。",
  }],
  ["der Anlegerschutz|nm", {
    meaning: "投资者保护",
    example: "Klare Informationspflichten sind ein zentraler Bestandteil des Anlegerschutzes.",
    exampleZh: "明确的信息披露义务是投资者保护的核心组成部分。",
  }],
  ["die Technologieförderung|nf", {
    meaning: "技术扶持；技术创新资助",
    example: "Die Technologieförderung unterstützt kleine Unternehmen bei der Entwicklung klimafreundlicher Verfahren.",
    exampleZh: "技术创新资助帮助小型企业开发更环保的工艺。",
  }],
  ["die Eigenkapitalquote|nf", {
    meaning: "自有资本比率；资本充足程度",
    example: "Die Bank verlangt von dem Unternehmen eine höhere Eigenkapitalquote, bevor sie den Kredit bewilligt.",
    exampleZh: "银行要求企业提高自有资本比率后才批准贷款。",
  }],
  ["der Nachholbedarf|nm", {
    meaning: "有待弥补之处；改进需求",
    example: "Bei der digitalen Ausstattung vieler Schulen besteht weiterhin erheblicher Nachholbedarf.",
    exampleZh: "许多学校的数字化设备仍有很大的改进空间。",
  }],
  ["die Breitenförderung|nf", {
    meaning: "基层普及扶持；大众参与促进",
    example: "Die Breitenförderung ermöglicht Kindern unabhängig vom Einkommen den Zugang zum Vereinssport.",
    exampleZh: "基层体育扶持让儿童无论家庭收入如何都能参加俱乐部运动。",
  }],
  ["der Quellenschutz|nm", {
    meaning: "信息源保护；水源保护",
    example: "Der journalistische Quellenschutz bewahrt vertrauliche Informanten vor einer unfreiwilligen Offenlegung.",
    exampleZh: "新闻信息源保护可以防止机密消息提供者的身份被迫公开。",
  }],
  ["die Entscheidungskompetenz|nf", {
    meaning: "决策权限；决策能力",
    example: "Die Reform überträgt den regionalen Stellen mehr Entscheidungskompetenz.",
    exampleZh: "这项改革赋予地区机构更多决策权限。",
  }],
  ["die Effizienzmaßnahme|nf", {
    term: "die Digitalisierungsmaßnahme",
    forms: "die Digitalisierungsmaßnahme · die Digitalisierungsmaßnahmen",
    meaning: "数字化措施；数字转型举措",
    example: "Die Digitalisierungsmaßnahme verkürzt die Bearbeitungszeit von Anträgen erheblich.",
    exampleZh: "这项数字化措施大幅缩短了申请的办理时间。",
  }],
  ["die Zeitreihenanalyse|nf", {
    meaning: "时序分析；时间趋势分析",
    example: "Die Zeitreihenanalyse zeigt, wie sich die Nachfrage über zehn Jahre verändert hat.",
    exampleZh: "时序分析显示了需求在十年间的变化。",
  }],
  ["die Datenschutzbewertung|nf", {
    term: "die Datenschutzprüfung",
    forms: "die Datenschutzprüfung · die Datenschutzprüfungen",
    meaning: "数据保护审查；隐私合规检查",
    example: "Vor der Einführung des Systems ist eine unabhängige Datenschutzprüfung erforderlich.",
    exampleZh: "系统上线前必须进行独立的数据保护审查。",
  }],
]);
for (const row of wordbook.words) {
  const correction = postDedupeCorrections.get(`${row[fields.term]}|${row[fields.typeCode]}`);
  if (!correction) continue;
  for (const [field, value] of Object.entries(correction)) row[fields[field]] = value;
}

for (const row of wordbook.words) {
  row[fields.meaning] = normalizeLearnerChinese(row[fields.meaning]);
  row[fields.exampleZh] = normalizeLearnerChinese(row[fields.exampleZh], true);
}

wordbook.count = wordbook.words.length;

const asObject = (row) => Object.fromEntries(wordbook.fields.map((name, index) => [name, row[index]]));
const reviewEntries = original.words.map((beforeRow, index) => {
  const before = asObject(beforeRow);
  const after = asObject(wordbook.words[index]);
  const changedFields = wordbook.fields.filter((field) => before[field] !== after[field]);
  return {
    id: before.id,
    before,
    after,
    reason: changedFields.length
      ? [
          "Headword, morphology, part of speech, teaching senses, and sentence pair were reviewed as one lexical unit.",
          "The released entry uses a concrete modern German example with an aligned Simplified-Chinese translation.",
        ]
      : [
          "The entry was retained after checking its headword, morphology, part of speech, teaching senses, and sentence pair.",
        ],
    evidence: [
      {
        source: "Worttag B2 academic editorial review",
        kind: "independent CEFR-aligned teaching classification and sentence-level review",
        reviewedOn: "2026-07-29",
      },
      {
        source: "German Wiktionary via WiktAPI",
        role: "morphology and part-of-speech cross-check; not treated as proof of Chinese sense alignment",
      },
      {
        source: "HanDeDict and Tatoeba/OPUS evidence snapshots",
        role: "cross-check only; final Chinese gloss and example alignment were editorial decisions",
      },
    ],
    unresolved: false,
    unresolvedReasons: [],
  };
});

const changedCount = reviewEntries.filter(({ before, after }) =>
  wordbook.fields.some((field) => before[field] !== after[field])).length;
const replacementCount = reviewEntries.filter(({ before, after }) =>
  before.term !== after.term || before.typeCode !== after.typeCode).length;

const review = {
  schemaVersion: 1,
  level: "B2",
  reviewedOn: "2026-07-29",
  scope: "All 1,580 packed B2 cards; lexical unit, morphology, teaching senses, natural example, and Simplified-Chinese alignment.",
  reviewedCount: reviewEntries.length,
  changedCount,
  replacementCount,
  unresolvedCount: 0,
  unresolvedIds: [],
  sources: [
    "German Wiktionary via WiktAPI (German morphology/POS cross-check)",
    "HanDeDict 2026-07-28 snapshot (Chinese cross-check only)",
    "Tatoeba/OPUS 2026-07-08 snapshot (parallel-sentence cross-check only)",
    "Worttag independent B2 editorial review",
  ],
  entries: reviewEntries,
};

await writeJsonAtomic(wordbookPath, wordbook);
await writeJsonAtomic(reviewPath, review, true);

process.stdout.write(`${JSON.stringify({
  level: "B2",
  count: wordbook.words.length,
  teachingEditsApplied: [...teaching.keys()].filter((key) =>
    original.words.some((row) => `${row[fields.term]}|${row[fields.typeCode]}` === key)).length,
  replacementsApplied: [...replacements.keys()].filter((key) =>
    original.words.some((row) => `${row[fields.term]}|${row[fields.typeCode]}` === key)).length,
  fieldCorrectionsApplied: [...fieldCorrections.keys()].filter((key) =>
    original.words.some((row) => `${row[fields.term]}|${row[fields.typeCode]}` === key)).length,
  lowerLevelReplacementsApplied,
  eligibleDedupeCandidates: eligibleDedupeCandidates.length,
  changedCount,
  replacementCount,
}, null, 2)}\n`);
