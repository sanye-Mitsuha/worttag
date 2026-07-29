#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const A1_PATH = path.join(ROOT, "public/wordbooks/a1-v1.json");
const REVIEW_PATH = path.join(ROOT, "data/editorial/a1-review.json");
const TATOEBA_PATH = path.join(ROOT, "work/tatoeba-cmn-de-v2026-07-08.examples.json");
const WIKTAPI_PATH = path.join(ROOT, ".cache/wordbooks/wiktapi-de-2026-07-28.json");
const HANDEDICT_PATH = path.join(ROOT, "data/lexicon/handedict-reverse-v1.json");

/*
 * This is an independently edited A1 teaching inventory. It is not copied from
 * an examination-provider list. Each row is: visible headword | Worttag type |
 * concise Simplified-Chinese teaching gloss.
 */
const INVENTORY_SOURCE = String.raw`
# Funktionswörter, Gesprächswörter und Zahlen
ich|pron|我
du|pron|你
er|pron|他
sie|pron|她；他们/她们/它们；您（大写 Sie）
es|pron|它；这
wir|pron|我们
ihr|pron|你们
beide|pron|两者；两个人
man|pron|人们；一般人
jemand|pron|某人
niemand|pron|没有人
etwas|pron|某事；一点
nichts|pron|什么也没有
alles|pron|一切；全部
wer|pron|谁
was|pron|什么
wo|adv|哪里
wohin|adv|到哪里
woher|adv|从哪里
wann|adv|什么时候
warum|adv|为什么
wie|adv|怎样；如何
welcher|det|哪个
dieser|det|这个
jeder|det|每个
kein|det|没有；不是任何
mein|det|我的
dein|det|你的
sein|det|他的；它的
ihr|det|她的；他们/她们的；您的（大写 Ihr）
unser|det|我们的
euer|det|你们的
alle|det|所有；全部
der|det|定冠词（阳性）
die|det|定冠词（阴性或复数）
das|det|定冠词（中性）
ein|det|一个；某个
und|conj|和；并且
oder|conj|或者
aber|conj|但是
denn|conj|因为
sondern|conj|而是
weil|conj|因为
dass|conj|……这一事实；引导从句
wenn|conj|如果；当……时
als|conj|当……时；比
ja|intj|是；对
nein|intj|不；不是
doch|intj|不对；其实；还是
bitte|intj|请；不客气
danke|intj|谢谢
hallo|intj|你好
tschüss|intj|再见
Entschuldigung|intj|对不起；劳驾
nicht|adv|不；没有
auch|adv|也
nur|adv|只；仅仅
schon|adv|已经
noch|adv|还；仍然
immer|adv|总是
oft|adv|经常
manchmal|adv|有时
nie|adv|从不
wieder|adv|又；再次
gern|adv|乐意地；喜欢
sehr|adv|很；非常
viel|pron|很多
wenig|pron|很少
mehr|adv|更多
jetzt|adv|现在
heute|adv|今天
gestern|adv|昨天
morgen|adv|明天
bald|adv|很快；不久
dann|adv|然后；那时
zuerst|adv|首先
später|adv|稍后；以后
hier|adv|这里
dort|adv|那里
oben|adv|上面
unten|adv|下面
links|adv|左边
rechts|adv|右边
zusammen|adv|一起
allein|adv|独自
so|adv|这样；如此
genau|adv|准确地；正是
vielleicht|adv|也许
natürlich|adv|当然；自然地
in|prep|在……里；进入
an|prep|在……旁；到……上
auf|prep|在……上；到……上
unter|prep|在……下面；在……之中
über|prep|在……上方；关于
vor|prep|在……前面；在……之前
hinter|prep|在……后面
neben|prep|在……旁边
zwischen|prep|在……之间
mit|prep|和……一起；用
ohne|prep|没有；不带
für|prep|为了；给
gegen|prep|反对；朝向；大约
durch|prep|穿过；通过
um|prep|围绕；在……点钟
aus|prep|从……出来；由……制成
bei|prep|在……处；在……期间
nach|prep|向；在……之后
von|prep|从；……的
zu|prep|到；向；在……处
bis|prep|直到
seit|prep|自从；已有
ab|prep|从……起
eins|num|一
zwei|num|二
drei|num|三
vier|num|四
fünf|num|五
sechs|num|六
sieben|num|七
acht|num|八
neun|num|九
zehn|num|十
elf|num|十一
zwölf|num|十二
hundert|num|一百

# Verben
sein|v|是；在；存在
haben|v|有；拥有
werden|v|变成；将要
können|v|能够；会
müssen|v|必须；不得不
wollen|v|想要
sollen|v|应该；据说
dürfen|v|可以；获准
mögen|v|喜欢
möchten|v|想要（礼貌表达）
machen|v|做；制作
tun|v|做；干
gehen|v|走；去
kommen|v|来
fahren|v|乘车；驾驶；行驶
fliegen|v|飞；乘飞机
laufen|v|跑；步行；运转
stehen|v|站；处于
sitzen|v|坐
liegen|v|躺；位于
wohnen|v|居住
leben|v|生活；活着
bleiben|v|停留；保持
heißen|v|名叫；意思是
sagen|v|说
sprechen|v|说话；讲（语言）
reden|v|交谈
fragen|v|问
antworten|v|回答
hören|v|听见；听
sehen|v|看见；看
lesen|v|读
schreiben|v|写
lernen|v|学习
üben|v|练习
verstehen|v|理解
wissen|v|知道（事实）
kennen|v|认识；熟悉
denken|v|想；思考
glauben|v|相信；认为
meinen|v|认为；意思是
finden|v|找到；觉得
suchen|v|寻找
zeigen|v|展示；指给……看
geben|v|给
nehmen|v|拿；选择；乘坐
bringen|v|带来；送来
holen|v|去取；接来
bekommen|v|得到；收到
brauchen|v|需要
kaufen|v|买
verkaufen|v|卖
bezahlen|v|付款
kosten|v|价钱为；花费
bestellen|v|点单；订购
essen|v|吃
trinken|v|喝
kochen|v|做饭；烹饪
frühstücken|v|吃早餐
schmecken|v|尝起来；合口味
arbeiten|v|工作
spielen|v|玩；演奏
schlafen|v|睡觉
aufstehen|v|起床；站起来
anfangen|v|开始
beginnen|v|开始
aufhören|v|停止
öffnen|v|打开
schließen|v|关闭；锁上
anmachen|v|打开（电器）；点燃
anziehen|v|穿上；吸引
tragen|v|穿戴；携带
waschen|v|洗
duschen|v|淋浴
baden|v|洗澡；游泳
putzen|v|清洁；刷
helfen|v|帮助
warten|v|等待
treffen|v|见面；遇见
besuchen|v|拜访；参观
anrufen|v|打电话给
telefonieren|v|打电话
schicken|v|寄；发送
klingeln|v|按铃；铃响
erklären|v|解释
buchstabieren|v|拼写
wiederholen|v|重复；复习
fehlen|v|缺少；缺席
passen|v|合适；合身
gefallen|v|使喜欢
lieben|v|爱；喜爱
lachen|v|笑
weinen|v|哭
tanzen|v|跳舞
singen|v|唱歌
schwimmen|v|游泳
reisen|v|旅行
zahlen|v|付款；支付
kennenlernen|v|认识；结识
heiraten|v|结婚
gewinnen|v|获胜；赢得
verlieren|v|失去；输
einladen|v|邀请
mitbringen|v|随身带来
abholen|v|接；取
einsteigen|v|上车
aussteigen|v|下车
umsteigen|v|换乘
ankommen|v|到达
abfahren|v|出发；发车
parken|v|停车
rauchen|v|吸烟
studieren|v|上大学；研读
gratulieren|v|祝贺
regnen|v|下雨

# Nomen: Menschen und Familie
der Mensch|nm|人；人类
der Mann|nm|男人；丈夫
die Frau|nf|女人；妻子
das Kind|nn|孩子
das Baby|nn|婴儿
der Junge|nm|男孩
das Mädchen|nn|女孩
der Freund|nm|朋友；男朋友
die Freundin|nf|女性朋友；女朋友
die Familie|nf|家庭；家人
die Mutter|nf|母亲
der Vater|nm|父亲
die Eltern|nf|父母
der Bruder|nm|兄弟；哥哥；弟弟
die Schwester|nf|姐妹；姐姐；妹妹
der Sohn|nm|儿子
die Tochter|nf|女儿
die Oma|nf|奶奶；外婆
der Opa|nm|爷爷；外公
die Großmutter|nf|祖母；外祖母
der Großvater|nm|祖父；外祖父
der Onkel|nm|叔叔；舅舅；姑父；姨父
die Tante|nf|姑姑；姨妈；舅妈；婶婶
der Name|nm|名字
der Vorname|nm|名
der Nachname|nm|姓
der Gast|nm|客人
der Nachbar|nm|男邻居
der Lehrer|nm|男教师
die Lehrerin|nf|女教师
der Schüler|nm|男学生
die Schülerin|nf|女学生
der Student|nm|男大学生
der Kollege|nm|男同事
die Kollegin|nf|女同事
der Chef|nm|男上司；老板
der Arzt|nm|男医生
der Verkäufer|nm|男售货员

# Nomen: Wohnung und Dinge
das Haus|nn|房子；家
die Wohnung|nf|住宅；公寓
das Zimmer|nn|房间
die Küche|nf|厨房
das Bad|nn|浴室；洗澡
das Schlafzimmer|nn|卧室
das Wohnzimmer|nn|客厅
der Flur|nm|走廊
der Balkon|nm|阳台
der Garten|nm|花园
die Tür|nf|门
das Fenster|nn|窗户
die Wand|nf|墙
der Boden|nm|地面；地板
das Dach|nn|屋顶
der Tisch|nm|桌子
der Stuhl|nm|椅子
das Bett|nn|床
das Sofa|nn|沙发
der Schrank|nm|柜子
das Regal|nn|架子；书架
die Lampe|nf|灯
der Schlüssel|nm|钥匙
die Tasche|nf|包；口袋
die Uhr|nf|钟；手表；……点钟
der Computer|nm|电脑
das Handy|nn|手机
das Telefon|nn|电话
der Fernseher|nm|电视机
das Buch|nn|书
das Bild|nn|图片；画
das Foto|nn|照片
der Stift|nm|笔

# Nomen: Essen und Trinken
das Essen|nn|饭；食物
das Frühstück|nn|早餐
das Mittagessen|nn|午餐
das Abendessen|nn|晚餐
das Brot|nn|面包
das Brötchen|nn|小面包
die Butter|nf|黄油
der Käse|nm|奶酪
die Wurst|nf|香肠
das Fleisch|nn|肉
der Fisch|nm|鱼
das Ei|nn|鸡蛋
die Milch|nf|牛奶
das Obst|nn|水果
das Gemüse|nn|蔬菜
der Apfel|nm|苹果
die Banane|nf|香蕉
die Kartoffel|nf|土豆
die Tomate|nf|西红柿
der Salat|nm|沙拉；生菜
die Suppe|nf|汤
der Reis|nm|大米；米饭
die Nudel|nf|面条
das Salz|nn|盐
der Zucker|nm|糖
der Kuchen|nm|蛋糕
die Schokolade|nf|巧克力
das Eis|nn|冰；冰淇淋
das Wasser|nn|水
der Kaffee|nm|咖啡
der Tee|nm|茶
der Saft|nm|果汁
das Bier|nn|啤酒
der Wein|nm|葡萄酒
die Flasche|nf|瓶子
das Glas|nn|玻璃杯；玻璃
die Tasse|nf|杯子
der Teller|nm|盘子
das Messer|nn|刀
die Gabel|nf|叉子
der Löffel|nm|勺子
das Restaurant|nn|餐厅
das Café|nn|咖啡馆
die Speisekarte|nf|菜单
die Rechnung|nf|账单
der Hunger|nm|饥饿
der Durst|nm|口渴

# Nomen: Ort, Arbeit und Reise
die Stadt|nf|城市
das Dorf|nn|村庄
die Straße|nf|街道
der Weg|nm|路；方法
der Platz|nm|广场；位置；座位
der Park|nm|公园
der Bahnhof|nm|火车站
die Haltestelle|nf|车站；站点
der Flughafen|nm|机场
das Hotel|nn|酒店
das Geschäft|nn|商店；生意
der Laden|nm|商店
der Supermarkt|nm|超市
die Bäckerei|nf|面包店
die Apotheke|nf|药店
die Bank|nf|银行；长椅
die Post|nf|邮局；邮件
die Polizei|nf|警察；警方
das Krankenhaus|nn|医院
die Schule|nf|学校
das Büro|nn|办公室
die Arbeit|nf|工作
der Beruf|nm|职业
der Markt|nm|市场
die Kirche|nf|教堂
das Kino|nn|电影院
das Schwimmbad|nn|游泳馆
das Auto|nn|汽车
der Bus|nm|公交车
die Bahn|nf|铁路；轨道交通
der Zug|nm|火车
das Fahrrad|nn|自行车
das Taxi|nn|出租车
das Flugzeug|nn|飞机
die Fahrkarte|nf|车票
das Ticket|nn|票
die Reise|nf|旅行
der Urlaub|nm|假期；休假
der Koffer|nm|行李箱
der Pass|nm|护照
die Adresse|nf|地址
die Nummer|nf|号码
die Karte|nf|卡；地图；票
der Plan|nm|计划；图
die Ampel|nf|交通信号灯
der Eingang|nm|入口
der Ausgang|nm|出口

# Nomen: Zeit, Wetter und Natur
die Zeit|nf|时间
der Tag|nm|天；白天
die Woche|nf|星期；周
das Wochenende|nn|周末
der Monat|nm|月
das Jahr|nn|年
der Morgen|nm|早晨
der Vormittag|nm|上午
der Mittag|nm|中午
der Nachmittag|nm|下午
der Abend|nm|晚上
die Nacht|nf|夜晚
die Stunde|nf|小时；课时
die Minute|nf|分钟
die Sekunde|nf|秒
der Montag|nm|星期一
der Dienstag|nm|星期二
der Mittwoch|nm|星期三
der Donnerstag|nm|星期四
der Freitag|nm|星期五
der Samstag|nm|星期六
der Sonntag|nm|星期日
der Januar|nm|一月
der Februar|nm|二月
der März|nm|三月
der April|nm|四月
der Mai|nm|五月
der Juni|nm|六月
der Juli|nm|七月
der August|nm|八月
der September|nm|九月
der Oktober|nm|十月
der November|nm|十一月
der Dezember|nm|十二月
der Frühling|nm|春天
der Sommer|nm|夏天
der Herbst|nm|秋天
der Winter|nm|冬天
das Wetter|nn|天气
die Sonne|nf|太阳
der Regen|nm|雨
der Schnee|nm|雪
der Wind|nm|风
die Wolke|nf|云
der Himmel|nm|天空
die Luft|nf|空气
die Temperatur|nf|温度
der Baum|nm|树

# Nomen: Körper, Kleidung und Lernen
der Körper|nm|身体
der Kopf|nm|头
das Gesicht|nn|脸
das Haar|nn|头发；毛发
das Auge|nn|眼睛
das Ohr|nn|耳朵
die Nase|nf|鼻子
der Mund|nm|嘴
der Zahn|nm|牙齿
der Hals|nm|脖子；咽喉
der Arm|nm|手臂
die Hand|nf|手
der Finger|nm|手指
der Bauch|nm|肚子
der Rücken|nm|背部
das Bein|nn|腿
der Fuß|nm|脚
das Herz|nn|心脏；心
die Gesundheit|nf|健康
die Krankheit|nf|疾病
der Schmerz|nm|疼痛
das Fieber|nn|发烧
die Medizin|nf|药；医学
die Tablette|nf|药片
der Termin|nm|预约；约定时间
die Kleidung|nf|衣服；服装
das Kleid|nn|连衣裙
der Rock|nm|裙子
die Hose|nf|裤子
das Hemd|nn|衬衫
das T-Shirt|nn|T恤
der Pullover|nm|套头衫；毛衣
die Jacke|nf|夹克；外套
der Mantel|nm|大衣
der Schuh|nm|鞋
die Socke|nf|袜子
der Hut|nm|帽子
die Mütze|nf|便帽
die Brille|nf|眼镜
die Farbe|nf|颜色
die Sprache|nf|语言
das Wort|nn|单词；话
der Satz|nm|句子
die Frage|nf|问题
die Antwort|nf|回答；答案
die Aufgabe|nf|任务；练习题
die Übung|nf|练习
das Beispiel|nn|例子
die Lösung|nf|解决办法；答案
der Kurs|nm|课程
die Klasse|nf|班级；等级
die Pause|nf|休息
der Unterricht|nm|课；教学
die Prüfung|nf|考试
der Fehler|nm|错误
die Seite|nf|页；一侧
die Liste|nf|清单
die E-Mail|nf|电子邮件
der Brief|nm|信
die Nachricht|nf|消息
das Gespräch|nn|谈话
die Musik|nf|音乐
der Film|nm|电影
das Lied|nn|歌曲
der Sport|nm|运动
das Spiel|nn|游戏；比赛
der Fußball|nm|足球
die Party|nf|聚会
die Feier|nf|庆祝活动
der Geburtstag|nm|生日
das Geschenk|nn|礼物
der Preis|nm|价格；奖项
das Geld|nn|钱
der Euro|nm|欧元
der Cent|nm|欧分
die Ferien|nf|假期
die Freizeit|nf|空闲时间
das Hobby|nn|爱好
die Hilfe|nf|帮助
das Problem|nn|问题
die Idee|nf|想法
der Spaß|nm|乐趣
das Internet|nn|互联网
die Hausaufgabe|nf|家庭作业
der Kalender|nm|日历

# Adjektive und weitere Adverbien
gut|adj|好的
schlecht|adj|坏的；差的
groß|adj|大的；高大的
klein|adj|小的
lang|adj|长的
kurz|adj|短的
hoch|adj|高的
alt|adj|老的；旧的
jung|adj|年轻的
neu|adj|新的
schön|adj|漂亮的；美好的
hübsch|adj|好看的；漂亮的
hässlich|adj|难看的
nett|adj|友好的；不错的
freundlich|adj|友好的
glücklich|adj|幸福的；幸运的
traurig|adj|悲伤的
froh|adj|高兴的
lustig|adj|有趣的；滑稽的
ernst|adj|严肃的；认真的
leicht|adj|轻的；容易的
schwer|adj|重的；难的
einfach|adj|简单的
schwierig|adj|困难的
richtig|adj|正确的
falsch|adj|错误的
wichtig|adj|重要的
interessant|adj|有趣的
langweilig|adj|无聊的
schnell|adj|快的
langsam|adj|慢的
früh|adj|早的
spät|adj|晚的；迟的
warm|adj|温暖的
kalt|adj|冷的
heiß|adj|热的
kühl|adj|凉爽的
hell|adj|明亮的；浅色的
dunkel|adj|暗的；深色的
laut|adj|响亮的
leise|adj|安静的；轻声的
sauber|adj|干净的
schmutzig|adj|脏的
voll|adj|满的
leer|adj|空的
offen|adj|开着的；开放的
geschlossen|adj|关着的；关闭的
frei|adj|空闲的；免费的；自由的
besetzt|adj|占用的；有人使用的
fertig|adj|完成的；准备好的
kaputt|adj|坏的
teuer|adj|贵的
billig|adj|便宜的
reich|adj|富有的；丰富的
arm|adj|贫穷的
gesund|adj|健康的
krank|adj|生病的
müde|adj|疲倦的
wach|adj|醒着的
hungrig|adj|饿的
durstig|adj|渴的
stark|adj|强壮的；强烈的
schwach|adj|虚弱的
dick|adj|胖的；厚的
dünn|adj|瘦的；薄的
breit|adj|宽的
eng|adj|窄的；紧的
nah|adj|近的
weit|adj|远的；宽广的
bequem|adj|舒适的
modern|adj|现代的
bekannt|adj|出名的；熟悉的
verheiratet|adj|已婚的
ledig|adj|未婚的
ruhig|adj|安静的；平静的
gemeinsam|adj|共同的
gleich|adj|相同的；马上
anders|adv|不同地；另外
wirklich|adv|真的；确实
ungefähr|adv|大约
besonders|adv|特别地
leider|adv|遗憾地
sofort|adv|立即
gerade|adv|正在；正好
draußen|adv|在外面
drinnen|adv|在里面
überall|adv|到处
nirgendwo|adv|哪里都不
zurück|adv|回来；向后
weiter|adv|继续；更远
fast|adv|几乎
genug|adv|足够
`;

const FORM_OVERRIDES = new Map(
  Object.entries({
    "ich|pron": "ich · mich · mir",
    "du|pron": "du · dich · dir",
    "er|pron": "er · ihn · ihm",
    "sie|pron": "sie · sie · ihr / ihnen",
    "es|pron": "es · es · ihm",
    "wir|pron": "wir · uns · uns",
    "ihr|pron": "ihr · euch · euch",
    "Sie|pron": "Sie · Sie · Ihnen",
    "beide|pron": "beide · beiden · beider",
    "man|pron": "man · einen · einem",
    "jemand|pron": "jemand · jemanden · jemandem",
    "niemand|pron": "niemand · niemanden · niemandem",
    "alles|pron": "alles · alles · allem",
    "wer|pron": "wer · wen · wem",
    "mein|det": "mein · meine · meinen",
    "dein|det": "dein · deine · deinen",
    "sein|det": "sein · seine · seinen",
    "ihr|det": "ihr · ihre · ihren",
    "unser|det": "unser · unsere · unseren",
    "euer|det": "euer · eure · euren",
    "Ihr|det": "Ihr · Ihre · Ihren",
    "alle|det": "alle · allen · aller",
    "der|det": "der · die · das · die",
    "die|det": "die · der · die",
    "das|det": "das · des · dem",
    "ein|det": "ein · eine · einen",
    "dieser|det": "dieser · diese · dieses",
    "jeder|det": "jeder · jede · jedes",
    "welcher|det": "welcher · welche · welches",
    "kein|det": "kein · keine · keinen",

    "sein|v": "sein · ist · war · ist gewesen",
    "möchten|v": "möchten · möchte · möchtest · möchten",
    "fahren|v": "fahren · fährt · fuhr · ist gefahren",
    "wohnen|v": "wohnen · wohnt · wohnte · hat gewohnt",
    "sprechen|v": "sprechen · spricht · sprach · hat gesprochen",
    "lernen|v": "lernen · lernt · lernte · hat gelernt",
    "verstehen|v": "verstehen · versteht · verstand · hat verstanden",
    "geben|v": "geben · gibt · gab · hat gegeben",
    "nehmen|v": "nehmen · nimmt · nahm · hat genommen",
    "brauchen|v": "brauchen · braucht · brauchte · hat gebraucht",
    "trinken|v": "trinken · trinkt · trank · hat getrunken",
    "frühstücken|v": "frühstücken · frühstückt · frühstückte · hat gefrühstückt",
    "arbeiten|v": "arbeiten · arbeitet · arbeitete · hat gearbeitet",
    "schlafen|v": "schlafen · schläft · schlief · hat geschlafen",
    "aufstehen|v": "aufstehen · steht auf · stand auf · ist aufgestanden",
    "anmachen|v": "anmachen · macht an · machte an · hat angemacht",
    "tragen|v": "tragen · trägt · trug · hat getragen",
    "buchstabieren|v": "buchstabieren · buchstabiert · buchstabierte · hat buchstabiert",
    "kennenlernen|v": "kennenlernen · lernt kennen · lernte kennen · hat kennengelernt",
    "einladen|v": "einladen · lädt ein · lud ein · hat eingeladen",
    "mitbringen|v": "mitbringen · bringt mit · brachte mit · hat mitgebracht",
    "klingeln|v": "klingeln · klingelt · klingelte · hat geklingelt",
    "rauchen|v": "rauchen · raucht · rauchte · hat geraucht",
    "gratulieren|v": "gratulieren · gratuliert · gratulierte · hat gratuliert",

    "der Mann|nm": "der Mann · die Männer",
    "der Junge|nm": "der Junge · die Jungen",
    "die Familie|nf": "die Familie · die Familien",
    "die Eltern|nf": "die Eltern · nur Plural",
    "die Wohnung|nf": "die Wohnung · die Wohnungen",
    "das Zimmer|nn": "das Zimmer · die Zimmer",
    "der Balkon|nm": "der Balkon · die Balkone / Balkons",
    "das Regal|nn": "das Regal · die Regale",
    "das Foto|nn": "das Foto · die Fotos",
    "das Essen|nn": "das Essen · meist ohne Plural",
    "die Butter|nf": "die Butter · meist ohne Plural",
    "die Milch|nf": "die Milch · meist ohne Plural",
    "das Obst|nn": "das Obst · meist ohne Plural",
    "das Gemüse|nn": "das Gemüse · meist ohne Plural",
    "der Reis|nm": "der Reis · meist ohne Plural",
    "der Zucker|nm": "der Zucker · meist ohne Plural",
    "das Wasser|nn": "das Wasser · meist ohne Plural",
    "der Teller|nm": "der Teller · die Teller",
    "die Rechnung|nf": "die Rechnung · die Rechnungen",
    "der Park|nm": "der Park · die Parks",
    "die Haltestelle|nf": "die Haltestelle · die Haltestellen",
    "der Laden|nm": "der Laden · die Läden",
    "die Post|nf": "die Post · meist ohne Plural",
    "die Bank|nf": "die Bank · die Banken (Geldinstitut) / die Bänke (Sitzmöbel)",
    "die Polizei|nf": "die Polizei · meist ohne Plural",
    "das Schwimmbad|nn": "das Schwimmbad · die Schwimmbäder",
    "das Taxi|nn": "das Taxi · die Taxis",
    "der Monat|nm": "der Monat · die Monate",
    "das Wetter|nn": "das Wetter · meist ohne Plural",
    "der Regen|nm": "der Regen · meist ohne Plural",
    "die Luft|nf": "die Luft · meist ohne Plural",
    "der Vormittag|nm": "der Vormittag · die Vormittage",
    "das Gesicht|nn": "das Gesicht · die Gesichter",
    "die Medizin|nf": "die Medizin · meist ohne Plural",
    "das Fieber|nn": "das Fieber · meist ohne Plural",
    "der Termin|nm": "der Termin · die Termine",
    "die Kleidung|nf": "die Kleidung · meist ohne Plural",
    "die Socke|nf": "die Socke · die Socken",
    "die Frage|nf": "die Frage · die Fragen",
    "die E-Mail|nf": "die E-Mail · die E-Mails",
    "der Unterricht|nm": "der Unterricht · meist ohne Plural",
    "die Musik|nf": "die Musik · meist ohne Plural",
    "der Sport|nm": "der Sport · meist ohne Plural",
    "der Euro|nm": "der Euro · die Euro / Euros",
    "der Cent|nm": "der Cent · die Cent / Cents",
    "die Ferien|nf": "die Ferien · nur Plural",
    "die Freizeit|nf": "die Freizeit · meist ohne Plural",
    "der Spaß|nm": "der Spaß · die Späße",
    "das Internet|nn": "das Internet · meist ohne Plural",
    "die Hausaufgabe|nf": "die Hausaufgabe · die Hausaufgaben",
  }),
);

const EXAMPLE_SOURCE = String.raw`
ich|pron|Ich lerne Deutsch.|我学德语。
du|pron|Du wohnst in Berlin.|你住在柏林。
er|pron|Er kommt aus Deutschland.|他来自德国。
sie|pron|Sie arbeitet heute.|她今天上班。
es|pron|Das Kind schläft; es ist müde.|孩子睡着了；它累了。
wir|pron|Wir gehen nach Hause.|我们回家。
ihr|pron|Ihr seid heute früh da.|你们今天来得很早。
beide|pron|Beide kommen aus Berlin.|两个人都来自柏林。
man|pron|Hier darf man nicht rauchen.|这里不可以吸烟。
jemand|pron|Jemand wartet vor der Tür.|有人在门外等候。
niemand|pron|Heute ist niemand im Büro.|今天办公室里没有人。
etwas|pron|Möchtest du etwas trinken?|你想喝点什么吗？
nichts|pron|Ich höre nichts.|我什么也没听见。
alles|pron|Alles ist fertig.|一切都准备好了。
wer|pron|Wer ist das?|这是谁？
was|pron|Was machst du heute?|你今天做什么？
wo|adv|Wo ist der Bahnhof?|火车站在哪里？
wohin|adv|Wohin fährt dieser Bus?|这辆公交车开往哪里？
woher|adv|Woher kommen Sie?|您来自哪里？
wann|adv|Wann beginnt der Kurs?|课程什么时候开始？
warum|adv|Warum lernst du Deutsch?|你为什么学德语？
wie|adv|Wie heißt du?|你叫什么名字？
welcher|det|Welcher Bus fährt zum Bahnhof?|哪辆公交车开往火车站？
dieser|det|Dieser Kaffee ist heiß.|这杯咖啡很烫。
jeder|det|Jeder Tag ist anders.|每一天都不一样。
kein|det|Ich habe kein Auto.|我没有汽车。
mein|det|Das ist mein Buch.|这是我的书。
dein|det|Wie ist deine Adresse?|你的地址是什么？
sein|det|Das ist sein Vater.|这是他的父亲。
ihr|det|Das ist ihr Buch.|这是她的书。
unser|det|Unser Kurs beginnt um neun.|我们的课程九点开始。
euer|det|Ist das euer Haus?|这是你们的房子吗？
alle|det|Alle Kinder sind da.|所有孩子都到了。
der|det|Der Tisch ist neu.|这张桌子是新的。
die|det|Die Lampe ist schön.|这盏灯很漂亮。
das|det|Das Fenster ist offen.|这扇窗户开着。
ein|det|Ich brauche einen Stift.|我需要一支笔。
und|conj|Ich trinke Kaffee und Wasser.|我喝咖啡和水。
oder|conj|Möchtest du Tee oder Kaffee?|你想喝茶还是咖啡？
aber|conj|Das Zimmer ist klein, aber schön.|房间虽小，但很漂亮。
denn|conj|Ich bleibe zu Hause, denn ich bin krank.|我待在家里，因为我病了。
sondern|conj|Das ist kein Hotel, sondern ein Restaurant.|这不是酒店，而是餐厅。
weil|conj|Ich lerne Deutsch, weil ich in Berlin wohne.|我学德语，因为我住在柏林。
dass|conj|Ich weiß, dass der Kurs heute beginnt.|我知道课程今天开始。
wenn|conj|Ruf mich an, wenn du Zeit hast.|你有时间时给我打电话。
als|conj|Der Bus ist schneller als das Fahrrad.|公交车比自行车快。
ja|intj|Ja, das stimmt.|对，是这样的。
nein|intj|Nein, danke.|不用了，谢谢。
doch|intj|Du hast kein Geld? – Doch!|你没有钱？——不，我有！
bitte|intj|Ein Glas Wasser, bitte.|请给我一杯水。
danke|intj|Danke für deine Hilfe.|谢谢你的帮助。
hallo|intj|Hallo, wie geht es dir?|你好，你怎么样？
tschüss|intj|Tschüss, bis morgen!|再见，明天见！
Entschuldigung|intj|Entschuldigung, wo ist der Bahnhof?|劳驾，请问火车站在哪里？
nicht|adv|Ich verstehe das nicht.|我不明白这个。
auch|adv|Ich lerne auch Deutsch.|我也学德语。
nur|adv|Ich habe nur zehn Euro.|我只有十欧元。
schon|adv|Das Essen ist schon fertig.|饭已经做好了。
noch|adv|Ich brauche noch eine Minute.|我还需要一分钟。
immer|adv|Er kommt immer pünktlich.|他总是准时来。
oft|adv|Wir gehen oft ins Kino.|我们经常去电影院。
manchmal|adv|Manchmal fahre ich mit dem Bus.|我有时坐公交车。
nie|adv|Ich trinke nie Kaffee.|我从不喝咖啡。
wieder|adv|Wann kommst du wieder?|你什么时候再来？
gern|adv|Ich höre gern Musik.|我喜欢听音乐。
sehr|adv|Das Buch ist sehr interessant.|这本书很有趣。
viel|pron|Heute habe ich viel zu tun.|我今天有很多事要做。
wenig|pron|Ich habe nur wenig Zeit.|我只有很少的时间。
mehr|adv|Möchtest du mehr Wasser?|你想再喝点水吗？
jetzt|adv|Wir essen jetzt.|我们现在吃饭。
heute|adv|Heute ist Montag.|今天是星期一。
gestern|adv|Gestern war ich zu Hause.|我昨天在家。
morgen|adv|Morgen beginnt der Kurs.|课程明天开始。
bald|adv|Der Bus kommt bald.|公交车很快就来。
dann|adv|Zuerst lernen wir, dann machen wir Pause.|我们先学习，然后休息。
zuerst|adv|Zuerst wasche ich meine Hände.|我先洗手。
später|adv|Ich rufe dich später an.|我稍后给你打电话。
hier|adv|Hier ist dein Schlüssel.|你的钥匙在这里。
dort|adv|Dort ist die Haltestelle.|车站在那里。
oben|adv|Das Bad ist oben.|浴室在楼上。
unten|adv|Der Bus wartet unten.|公交车在楼下等。
links|adv|Die Post ist links.|邮局在左边。
rechts|adv|Das Hotel ist rechts.|酒店在右边。
zusammen|adv|Wir lernen zusammen.|我们一起学习。
allein|adv|Sie wohnt allein.|她独自居住。
so|adv|So geht das.|就是这样做。
genau|adv|Das ist genau richtig.|这完全正确。
vielleicht|adv|Vielleicht kommt er morgen.|他也许明天来。
natürlich|adv|Natürlich helfe ich dir.|我当然会帮助你。
in|prep|Das Buch liegt in der Tasche.|书在包里。
an|prep|Das Bild hängt an der Wand.|画挂在墙上。
auf|prep|Das Glas steht auf dem Tisch.|杯子在桌上。
unter|prep|Die Tasche liegt unter dem Stuhl.|包在椅子下面。
über|prep|Die Lampe hängt über dem Tisch.|灯挂在桌子上方。
vor|prep|Der Bus wartet vor dem Hotel.|公交车在酒店前等候。
hinter|prep|Der Garten liegt hinter dem Haus.|花园在房子后面。
neben|prep|Die Apotheke ist neben der Bank.|药店在银行旁边。
zwischen|prep|Das Café liegt zwischen Hotel und Kino.|咖啡馆在酒店和电影院之间。
mit|prep|Ich fahre mit dem Bus.|我坐公交车。
ohne|prep|Ich trinke Kaffee ohne Zucker.|我喝不加糖的咖啡。
für|prep|Das Geschenk ist für dich.|这份礼物是给你的。
gegen|prep|Der Zug fährt gegen acht Uhr ab.|火车大约八点出发。
durch|prep|Wir gehen durch den Park.|我们穿过公园。
um|prep|Der Kurs beginnt um neun Uhr.|课程九点开始。
aus|prep|Ich komme aus China.|我来自中国。
bei|prep|Ich wohne bei meinen Eltern.|我和父母住在一起。
nach|prep|Wir fahren nach Berlin.|我们去柏林。
von|prep|Der Brief ist von meiner Mutter.|这封信是我母亲寄来的。
zu|prep|Ich gehe zum Bahnhof.|我去火车站。
bis|prep|Ich arbeite bis fünf Uhr.|我工作到五点。
seit|prep|Ich wohne seit einem Jahr hier.|我在这里住了一年了。
ab|prep|Der Kurs beginnt ab Montag.|课程从星期一开始。
eins|num|Eins plus eins ist zwei.|一加一等于二。
zwei|num|Ich habe zwei Kinder.|我有两个孩子。
drei|num|Wir brauchen drei Fahrkarten.|我们需要三张车票。
vier|num|Der Tisch hat vier Beine.|桌子有四条腿。
fünf|num|Der Kurs beginnt um fünf Uhr.|课程五点开始。
sechs|num|Das Geschäft schließt um sechs Uhr.|商店六点关门。
sieben|num|Eine Woche hat sieben Tage.|一周有七天。
acht|num|Der Zug fährt um acht Uhr.|火车八点发车。
neun|num|Ich komme um neun Uhr.|我九点来。
zehn|num|Das kostet zehn Euro.|这个十欧元。
elf|num|Der Bus kommt um elf Uhr.|公交车十一点来。
zwölf|num|Ein Jahr hat zwölf Monate.|一年有十二个月。
hundert|num|Das Hotel hat hundert Zimmer.|这家酒店有一百个房间。

sein|v|Ich bin heute zu Hause.|我今天在家。
haben|v|Wir haben zwei Kinder.|我们有两个孩子。
werden|v|Das Wetter wird warm.|天气会变暖。
können|v|Ich kann Deutsch sprechen.|我会说德语。
müssen|v|Ich muss heute arbeiten.|我今天必须工作。
wollen|v|Wir wollen nach Hause gehen.|我们想回家。
sollen|v|Du sollst den Arzt anrufen.|你应该给医生打电话。
dürfen|v|Darf ich hier sitzen?|我可以坐在这里吗？
mögen|v|Ich mag diesen Kaffee.|我喜欢这杯咖啡。
möchten|v|Ich möchte einen Tee.|我想要一杯茶。
fahren|v|Wir fahren mit dem Zug.|我们坐火车。
wohnen|v|Ich wohne in Shanghai.|我住在上海。
sprechen|v|Sie spricht sehr gut Deutsch.|她德语说得很好。
lernen|v|Wir lernen jeden Tag Deutsch.|我们每天学习德语。
verstehen|v|Ich verstehe die Frage.|我明白这个问题。
geben|v|Bitte geben Sie mir die Rechnung.|请把账单给我。
nehmen|v|Ich nehme den Bus.|我坐公交车。
brauchen|v|Ich brauche einen Termin.|我需要一个预约。
trinken|v|Er trinkt ein Glas Wasser.|他喝一杯水。
frühstücken|v|Wir frühstücken um acht Uhr.|我们八点吃早餐。
arbeiten|v|Meine Mutter arbeitet im Krankenhaus.|我母亲在医院工作。
schlafen|v|Das Baby schläft.|婴儿在睡觉。
aufstehen|v|Ich stehe jeden Morgen um sieben Uhr auf.|我每天早上七点起床。
anmachen|v|Mach bitte das Licht an.|请把灯打开。
tragen|v|Sie trägt eine rote Jacke.|她穿着一件红夹克。
buchstabieren|v|Können Sie Ihren Namen buchstabieren?|您能拼一下您的名字吗？
kennenlernen|v|Ich möchte deine Familie kennenlernen.|我想认识你的家人。
einladen|v|Ich lade dich zu meiner Party ein.|我邀请你参加我的聚会。
mitbringen|v|Bring bitte deinen Pass mit.|请带上你的护照。
klingeln|v|Bitte klingeln Sie an der Tür.|请按门铃。
rauchen|v|Hier darf man nicht rauchen.|这里不可以吸烟。
gratulieren|v|Ich gratuliere dir zum Geburtstag.|我祝你生日快乐。
machen|v|Ich mache heute die Hausaufgaben.|我今天做家庭作业。
tun|v|Was kann ich für dich tun?|我能为你做什么？
gehen|v|Wir gehen zu Fuß zur Schule.|我们步行去学校。
kommen|v|Der Bus kommt um acht Uhr.|公交车八点到。
fliegen|v|Morgen fliegen wir nach Berlin.|我们明天乘飞机去柏林。
laufen|v|Das Kind läuft schnell.|孩子跑得很快。
stehen|v|Der Bus steht vor dem Hotel.|公交车停在酒店前。
sitzen|v|Wir sitzen am Tisch.|我们坐在桌旁。
liegen|v|Das Buch liegt auf dem Tisch.|书在桌上。
leben|v|Meine Großeltern leben in Hamburg.|我的祖父母住在汉堡。
bleiben|v|Heute bleibe ich zu Hause.|我今天待在家里。
heißen|v|Ich heiße Anna.|我叫安娜。
sagen|v|Bitte sag deinen Namen.|请说出你的名字。
reden|v|Wir reden über den Urlaub.|我们谈论假期。
fragen|v|Ich frage den Lehrer.|我问老师。
antworten|v|Bitte antworte auf die Frage.|请回答这个问题。
hören|v|Ich höre gern Musik.|我喜欢听音乐。
sehen|v|Ich sehe den Bus.|我看见公交车了。
lesen|v|Er liest ein Buch.|他在读一本书。
schreiben|v|Sie schreibt eine E-Mail.|她在写电子邮件。
üben|v|Wir üben die neuen Wörter.|我们练习新单词。
wissen|v|Ich weiß die Antwort.|我知道答案。
kennen|v|Kennst du diese Stadt?|你熟悉这座城市吗？
denken|v|Ich denke oft an meine Familie.|我经常想起家人。
glauben|v|Ich glaube dir.|我相信你。
meinen|v|Was meinst du?|你是什么意思？
finden|v|Ich finde meinen Schlüssel nicht.|我找不到钥匙。
suchen|v|Wir suchen den Bahnhof.|我们在找火车站。
zeigen|v|Zeigen Sie mir bitte den Weg.|请给我指路。
bringen|v|Ich bringe dir einen Kaffee.|我给你带一杯咖啡。
holen|v|Ich hole das Buch aus dem Zimmer.|我从房间里拿书。
bekommen|v|Heute bekomme ich einen Brief.|我今天收到一封信。
kaufen|v|Wir kaufen Brot und Milch.|我们买面包和牛奶。
verkaufen|v|Der Laden verkauft Obst.|这家商店卖水果。
bezahlen|v|Ich bezahle mit Karte.|我用卡付款。
kosten|v|Das Buch kostet zehn Euro.|这本书十欧元。
bestellen|v|Ich bestelle eine Suppe.|我点一份汤。
essen|v|Wir essen heute im Restaurant.|我们今天在餐厅吃饭。
kochen|v|Mein Vater kocht das Abendessen.|我父亲做晚餐。
schmecken|v|Die Suppe schmeckt gut.|这汤很好喝。
spielen|v|Die Kinder spielen im Garten.|孩子们在花园里玩。
anfangen|v|Der Kurs fängt um neun Uhr an.|课程九点开始。
beginnen|v|Der Film beginnt um acht Uhr.|电影八点开始。
aufhören|v|Der Regen hört bald auf.|雨很快就停。
öffnen|v|Bitte öffnen Sie das Fenster.|请打开窗户。
schließen|v|Bitte schließen Sie die Tür.|请关门。
anziehen|v|Ich ziehe eine warme Jacke an.|我穿上一件暖和的夹克。
waschen|v|Ich wasche meine Hände.|我洗手。
duschen|v|Ich dusche jeden Morgen.|我每天早上淋浴。
baden|v|Das Kind badet in der Badewanne.|孩子在浴缸里洗澡。
putzen|v|Ich putze meine Zähne.|我刷牙。
helfen|v|Kannst du mir helfen?|你能帮我吗？
warten|v|Wir warten auf den Bus.|我们等公交车。
treffen|v|Ich treffe meine Freundin im Café.|我在咖啡馆见女朋友。
besuchen|v|Am Sonntag besuche ich meine Eltern.|我星期日去看望父母。
anrufen|v|Ich rufe dich heute Abend an.|我今晚给你打电话。
telefonieren|v|Sie telefoniert mit ihrer Mutter.|她在和母亲打电话。
schicken|v|Ich schicke dir eine E-Mail.|我给你发一封电子邮件。
erklären|v|Der Lehrer erklärt die Aufgabe.|老师解释这道练习。
wiederholen|v|Bitte wiederholen Sie den Satz.|请重复这个句子。
fehlen|v|Heute fehlen zwei Schüler.|今天有两名学生缺席。
passen|v|Die Jacke passt gut.|这件夹克很合身。
gefallen|v|Das Kleid gefällt mir.|我喜欢这条连衣裙。
lieben|v|Ich liebe meine Familie.|我爱我的家人。
lachen|v|Die Kinder lachen.|孩子们在笑。
weinen|v|Das Baby weint.|婴儿在哭。
tanzen|v|Wir tanzen auf der Party.|我们在聚会上跳舞。
singen|v|Sie singt ein deutsches Lied.|她唱一首德语歌。
schwimmen|v|Im Sommer schwimmen wir im See.|我们夏天在湖里游泳。
reisen|v|Wir reisen im Sommer nach Deutschland.|我们夏天去德国旅行。
zahlen|v|Kann ich mit Karte zahlen?|我可以刷卡付款吗？
heiraten|v|Anna und Paul heiraten im Mai.|安娜和保罗五月结婚。
gewinnen|v|Unsere Mannschaft gewinnt das Spiel.|我们队赢得比赛。
verlieren|v|Ich verliere oft meinen Schlüssel.|我经常弄丢钥匙。
abholen|v|Ich hole dich am Bahnhof ab.|我去火车站接你。
einsteigen|v|Wir steigen am Bahnhof ein.|我们在火车站上车。
aussteigen|v|Bitte steigen Sie hier aus.|请在这里下车。
umsteigen|v|In Berlin müssen wir umsteigen.|我们必须在柏林换乘。
ankommen|v|Der Zug kommt um zehn Uhr an.|火车十点到达。
abfahren|v|Der Bus fährt um acht Uhr ab.|公交车八点发车。
parken|v|Hier darf man nicht parken.|这里不能停车。
studieren|v|Sie studiert in Berlin.|她在柏林上大学。
regnen|v|Heute regnet es.|今天下雨。

die Familie|nf|Meine Familie wohnt in China.|我的家人住在中国。
die Eltern|nf|Meine Eltern wohnen in Berlin.|我的父母住在柏林。
die Wohnung|nf|Unsere Wohnung hat drei Zimmer.|我们的公寓有三个房间。
das Zimmer|nn|Das Zimmer ist klein, aber hell.|房间虽小，但很明亮。
das Wasser|nn|Ich trinke ein Glas Wasser.|我喝一杯水。
der Teller|nm|Der Teller steht auf dem Tisch.|盘子在桌上。
die Rechnung|nf|Die Rechnung, bitte.|请结账。
die Haltestelle|nf|Die Haltestelle ist dort.|车站在那里。
das Schwimmbad|nn|Das Schwimmbad ist heute offen.|游泳馆今天开放。
das Taxi|nn|Das Taxi wartet vor dem Hotel.|出租车在酒店前等候。
der Monat|nm|Ein Jahr hat zwölf Monate.|一年有十二个月。
der Vormittag|nm|Am Vormittag arbeite ich.|我上午工作。
der Termin|nm|Ich habe morgen einen Termin beim Arzt.|我明天约了医生。
die Socke|nf|Die Socke ist unter dem Bett.|袜子在床下面。
der Hut|nm|Der Hut ist schwarz.|帽子是黑色的。
die Frage|nf|Ich habe eine Frage.|我有一个问题。
die E-Mail|nf|Ich schreibe dir eine E-Mail.|我给你写一封电子邮件。
die Ferien|nf|In den Ferien reisen wir.|我们假期去旅行。
der Spaß|nm|Das Spiel macht Spaß.|这个游戏很有趣。
die Hausaufgabe|nf|Ich mache meine Hausaufgaben.|我做家庭作业。
der Mensch|nm|Jeder Mensch braucht Wasser.|每个人都需要水。
der Mann|nm|Der Mann wartet auf den Bus.|这个男人在等公交车。
die Frau|nf|Die Frau trägt eine rote Jacke.|这个女人穿着红夹克。
das Kind|nn|Das Kind spielt im Garten.|孩子在花园里玩。
das Baby|nn|Das Baby schläft im Bett.|婴儿在床上睡觉。
der Junge|nm|Der Junge fährt Fahrrad.|男孩在骑自行车。
das Mädchen|nn|Das Mädchen liest ein Buch.|女孩在读书。
der Freund|nm|Paul ist mein Freund.|保罗是我的朋友。
die Freundin|nf|Anna ist meine Freundin.|安娜是我的女朋友。
die Mutter|nf|Meine Mutter heißt Li Hua.|我母亲叫李华。
der Vater|nm|Mein Vater kocht gern.|我父亲喜欢做饭。
der Bruder|nm|Mein Bruder ist fünfzehn Jahre alt.|我弟弟十五岁。
die Schwester|nf|Meine Schwester lernt Deutsch.|我妹妹学德语。
der Sohn|nm|Ihr Sohn geht zur Schule.|她的儿子上学。
die Tochter|nf|Seine Tochter ist sechs Jahre alt.|他的女儿六岁。
die Oma|nf|Meine Oma wohnt bei uns.|我奶奶和我们一起住。
der Opa|nm|Mein Opa liest die Zeitung.|我爷爷在读报。
die Großmutter|nf|Meine Großmutter ist siebzig Jahre alt.|我祖母七十岁。
der Großvater|nm|Mein Großvater geht jeden Tag spazieren.|我祖父每天散步。
der Onkel|nm|Mein Onkel wohnt in Hamburg.|我叔叔住在汉堡。
die Tante|nf|Meine Tante kommt am Sonntag.|我姑姑星期日来。
der Name|nm|Mein Name ist Wang Wei.|我叫王伟。
der Nachname|nm|Mein Nachname ist Wang.|我姓王。
der Gast|nm|Unser Gast kommt um acht Uhr.|我们的客人八点来。
der Nachbar|nm|Mein Nachbar ist sehr freundlich.|我的邻居很友好。
der Lehrer|nm|Der Lehrer erklärt die Aufgabe.|老师解释这道题。
die Lehrerin|nf|Die Lehrerin spricht langsam.|女老师说得很慢。
der Schüler|nm|Der Schüler liest einen Satz.|男学生读一个句子。
die Schülerin|nf|Die Schülerin schreibt eine Antwort.|女学生写答案。
der Student|nm|Der Student lernt in der Bibliothek.|男大学生在图书馆学习。
der Kollege|nm|Mein Kollege hilft mir.|我的男同事帮助我。
der Chef|nm|Der Chef ist heute im Büro.|老板今天在办公室。
der Arzt|nm|Der Arzt hat heute einen Termin frei.|医生今天有一个空余预约。
das Haus|nn|Das Haus hat einen kleinen Garten.|这栋房子有一个小花园。
die Küche|nf|In der Küche steht ein Tisch.|厨房里有一张桌子。
das Bad|nn|Das Bad ist neben dem Schlafzimmer.|浴室在卧室旁边。
das Schlafzimmer|nn|Im Schlafzimmer steht ein Bett.|卧室里有一张床。
das Wohnzimmer|nn|Wir sitzen im Wohnzimmer.|我们坐在客厅里。
der Flur|nm|Die Schuhe stehen im Flur.|鞋放在走廊里。
der Balkon|nm|Auf dem Balkon stehen zwei Stühle.|阳台上有两把椅子。
der Garten|nm|Die Kinder spielen im Garten.|孩子们在花园里玩。
die Tür|nf|Bitte schließen Sie die Tür.|请关门。
das Fenster|nn|Das Fenster ist offen.|窗户开着。
die Wand|nf|Das Bild hängt an der Wand.|画挂在墙上。
der Boden|nm|Die Tasche liegt auf dem Boden.|包在地上。
das Dach|nn|Das Haus hat ein rotes Dach.|房子有红色屋顶。
der Tisch|nm|Das Buch liegt auf dem Tisch.|书在桌上。
der Stuhl|nm|Der Stuhl steht am Fenster.|椅子在窗边。
das Bett|nn|Das Kind schläft im Bett.|孩子在床上睡觉。
das Sofa|nn|Wir sitzen auf dem Sofa.|我们坐在沙发上。
der Schrank|nm|Die Kleidung ist im Schrank.|衣服在柜子里。
das Regal|nn|Die Bücher stehen im Regal.|书放在书架上。
die Lampe|nf|Die Lampe steht auf dem Tisch.|灯在桌上。
der Schlüssel|nm|Der Schlüssel liegt in meiner Tasche.|钥匙在我的包里。
die Tasche|nf|Meine Tasche ist schwer.|我的包很重。
die Uhr|nf|Die Uhr hängt an der Wand.|钟挂在墙上。
der Computer|nm|Der Computer steht im Büro.|电脑在办公室里。
das Handy|nn|Mein Handy ist in der Tasche.|我的手机在包里。
das Telefon|nn|Das Telefon klingelt.|电话响了。
der Fernseher|nm|Der Fernseher steht im Wohnzimmer.|电视机在客厅里。
das Buch|nn|Ich lese ein deutsches Buch.|我读一本德语书。
das Bild|nn|Das Bild ist sehr schön.|这幅画很漂亮。
das Foto|nn|Das ist ein Foto meiner Familie.|这是我家人的照片。
der Stift|nm|Ich brauche einen blauen Stift.|我需要一支蓝色的笔。
das Essen|nn|Das Essen ist fertig.|饭做好了。
das Frühstück|nn|Das Frühstück ist um acht Uhr.|早餐八点开始。
das Mittagessen|nn|Zum Mittagessen gibt es Suppe.|午餐有汤。
das Abendessen|nn|Das Abendessen ist auf dem Tisch.|晚餐在桌上。
das Brot|nn|Ich kaufe frisches Brot.|我买新鲜面包。
das Brötchen|nn|Zum Frühstück esse ich ein Brötchen.|我早餐吃一个小面包。
die Butter|nf|Ich esse Brot mit Butter.|我吃抹黄油的面包。
der Käse|nm|Ich kaufe zweihundert Gramm Käse.|我买两百克奶酪。
das Fleisch|nn|Heute essen wir kein Fleisch.|我们今天不吃肉。
der Fisch|nm|Am Freitag essen wir Fisch.|我们星期五吃鱼。
das Ei|nn|Zum Frühstück esse ich ein Ei.|我早餐吃一个鸡蛋。
die Milch|nf|Das Kind trinkt Milch.|孩子喝牛奶。
das Obst|nn|Äpfel und Bananen sind Obst.|苹果和香蕉是水果。
das Gemüse|nn|Wir kaufen frisches Gemüse.|我们买新鲜蔬菜。
der Apfel|nm|Der Apfel ist rot.|苹果是红色的。
die Banane|nf|Die Banane ist gelb.|香蕉是黄色的。
die Kartoffel|nf|Wir brauchen ein Kilo Kartoffeln.|我们需要一公斤土豆。
die Tomate|nf|Ich schneide die Tomate.|我切西红柿。
der Salat|nm|Zum Essen gibt es einen Salat.|这顿饭有一份沙拉。
die Suppe|nf|Die Suppe ist heiß.|汤很烫。
der Reis|nm|Ich esse gern Reis.|我喜欢吃米饭。
die Nudel|nf|Die Kinder essen Nudeln.|孩子们吃面条。
das Salz|nn|Die Suppe braucht noch Salz.|这汤还需要一点盐。
der Zucker|nm|Ich trinke Kaffee ohne Zucker.|我喝不加糖的咖啡。
der Kuchen|nm|Der Kuchen schmeckt gut.|蛋糕很好吃。
die Schokolade|nf|Das Kind mag Schokolade.|孩子喜欢巧克力。
das Eis|nn|Im Sommer esse ich gern Eis.|我夏天喜欢吃冰淇淋。
der Kaffee|nm|Der Kaffee ist noch heiß.|咖啡还是热的。
der Tee|nm|Ich trinke eine Tasse Tee.|我喝一杯茶。
der Saft|nm|Möchtest du einen Saft?|你想喝果汁吗？
das Bier|nn|Er bestellt ein Bier.|他点了一杯啤酒。
der Wein|nm|Sie trinkt ein Glas Wein.|她喝一杯葡萄酒。
die Flasche|nf|Die Flasche ist leer.|瓶子是空的。
das Glas|nn|Das Glas steht auf dem Tisch.|玻璃杯在桌上。
die Tasse|nf|Die Tasse ist blau.|杯子是蓝色的。
das Messer|nn|Ich schneide das Brot mit dem Messer.|我用刀切面包。
die Gabel|nf|Ich esse den Salat mit der Gabel.|我用叉子吃沙拉。
der Löffel|nm|Für die Suppe brauche ich einen Löffel.|我喝汤需要一把勺子。
das Restaurant|nn|Das Restaurant öffnet um zwölf Uhr.|餐厅十二点开门。
das Café|nn|Wir treffen uns im Café.|我们在咖啡馆见面。
die Speisekarte|nf|Kann ich bitte die Speisekarte haben?|请给我菜单好吗？
der Hunger|nm|Ich habe Hunger.|我饿了。
der Durst|nm|Nach dem Sport habe ich Durst.|运动后我渴了。
die Stadt|nf|Berlin ist eine große Stadt.|柏林是一座大城市。
das Dorf|nn|Das Dorf liegt am See.|村庄在湖边。
die Straße|nf|Wir gehen über die Straße.|我们过马路。
der Weg|nm|Ist das der Weg zum Bahnhof?|这是去火车站的路吗？
der Platz|nm|Ist dieser Platz frei?|这个座位空着吗？
der Park|nm|Wir gehen im Park spazieren.|我们在公园散步。
der Bahnhof|nm|Der Bahnhof ist im Zentrum.|火车站在市中心。
der Flughafen|nm|Wir fahren mit dem Bus zum Flughafen.|我们坐公交车去机场。
das Hotel|nn|Unser Hotel liegt im Zentrum.|我们的酒店在市中心。
das Geschäft|nn|Das Geschäft öffnet um neun Uhr.|商店九点开门。
der Laden|nm|Der Laden ist heute geschlossen.|商店今天关门。
der Supermarkt|nm|Im Supermarkt kaufen wir Lebensmittel.|我们在超市买食品。
die Bank|nf|Die Bank ist am Montag geöffnet.|银行星期一营业。
die Post|nf|Die Post ist neben der Bank.|邮局在银行旁边。
die Polizei|nf|Die Polizei hilft uns.|警察帮助我们。
das Krankenhaus|nn|Das Krankenhaus ist in der Stadt.|医院在城里。
die Schule|nf|Die Kinder gehen zur Schule.|孩子们上学。
das Büro|nn|Mein Büro ist im zweiten Stock.|我的办公室在二楼。
die Arbeit|nf|Meine Arbeit beginnt um acht Uhr.|我的工作八点开始。
der Beruf|nm|Was sind Sie von Beruf?|您的职业是什么？
der Markt|nm|Auf dem Markt kaufen wir Obst.|我们在市场买水果。
die Kirche|nf|Die Kirche steht im Zentrum.|教堂在市中心。
das Kino|nn|Heute Abend gehen wir ins Kino.|我们今晚去电影院。
das Auto|nn|Das Auto steht vor dem Haus.|汽车停在房子前。
der Bus|nm|Der Bus kommt in fünf Minuten.|公交车五分钟后到。
die Bahn|nf|Ich fahre mit der Bahn zur Arbeit.|我坐轨道交通上班。
der Zug|nm|Der Zug fährt um zehn Uhr ab.|火车十点发车。
das Fahrrad|nn|Ich fahre mit dem Fahrrad zur Schule.|我骑自行车上学。
das Flugzeug|nn|Das Flugzeug fliegt nach Berlin.|飞机飞往柏林。
die Fahrkarte|nf|Wo kann ich eine Fahrkarte kaufen?|我在哪里可以买车票？
das Ticket|nn|Das Ticket kostet zwanzig Euro.|票价二十欧元。
die Reise|nf|Die Reise dauert drei Tage.|旅行持续三天。
der Urlaub|nm|Im Urlaub fahren wir ans Meer.|我们假期去海边。
der Koffer|nm|Mein Koffer ist sehr schwer.|我的行李箱很重。
der Pass|nm|Für die Reise brauche ich meinen Pass.|旅行需要护照。
die Adresse|nf|Bitte schreiben Sie Ihre Adresse hier.|请把您的地址写在这里。
die Nummer|nf|Wie ist Ihre Nummer?|您的号码是多少？
die Karte|nf|Ich bezahle mit Karte.|我用卡付款。
der Plan|nm|Unser Plan ist ganz einfach.|我们的计划很简单。
die Ampel|nf|Die Ampel ist rot.|交通信号灯是红色的。
der Eingang|nm|Der Eingang ist links.|入口在左边。
die Zeit|nf|Heute habe ich viel Zeit.|我今天有很多时间。
der Tag|nm|Heute ist ein schöner Tag.|今天是美好的一天。
die Woche|nf|Eine Woche hat sieben Tage.|一周有七天。
das Wochenende|nn|Am Wochenende besuche ich meine Eltern.|我周末去看望父母。
das Jahr|nn|Ein Jahr hat zwölf Monate.|一年有十二个月。
der Morgen|nm|Am Morgen trinke ich Kaffee.|我早上喝咖啡。
der Mittag|nm|Um zwölf Uhr ist Mittag.|十二点是中午。
der Nachmittag|nm|Am Nachmittag lerne ich Deutsch.|我下午学德语。
der Abend|nm|Am Abend lese ich ein Buch.|我晚上读书。
die Nacht|nf|In der Nacht ist es ruhig.|夜里很安静。
die Stunde|nf|Der Kurs dauert eine Stunde.|课程持续一小时。
die Minute|nf|Warten Sie bitte eine Minute.|请等一分钟。
die Sekunde|nf|Das dauert nur eine Sekunde.|这只需要一秒。
der Montag|nm|Am Montag beginnt die Schule.|学校星期一开学。
der Dienstag|nm|Am Dienstag arbeite ich zu Hause.|我星期二在家工作。
der Mittwoch|nm|Am Mittwoch haben wir Deutschkurs.|我们星期三上德语课。
der Donnerstag|nm|Am Donnerstag gehe ich zum Arzt.|我星期四去看医生。
der Freitag|nm|Am Freitag essen wir Fisch.|我们星期五吃鱼。
der Samstag|nm|Am Samstag gehen wir einkaufen.|我们星期六去购物。
der Sonntag|nm|Am Sonntag schlafe ich lange.|我星期日睡懒觉。
der Januar|nm|Im Januar ist es kalt.|一月天气很冷。
der Februar|nm|Der Februar hat achtundzwanzig Tage.|二月有二十八天。
der März|nm|Im März beginnt der Frühling.|春天在三月开始。
der April|nm|Im April regnet es oft.|四月经常下雨。
der Mai|nm|Im Mai ist das Wetter schön.|五月天气很好。
der Juni|nm|Im Juni beginnt der Sommer.|夏天在六月开始。
der August|nm|Im August haben die Kinder Ferien.|孩子们八月放假。
der Oktober|nm|Im Oktober wird es kühl.|十月天气转凉。
der November|nm|Im November ist es oft grau.|十一月经常是阴天。
der Dezember|nm|Im Dezember ist Weihnachten.|十二月是圣诞节。
der Frühling|nm|Im Frühling wird es warm.|春天天气转暖。
der Sommer|nm|Im Sommer ist es oft heiß.|夏天经常很热。
der Herbst|nm|Im Herbst fallen die Blätter.|秋天树叶落下。
der Winter|nm|Im Winter liegt oft Schnee.|冬天经常有积雪。
das Wetter|nn|Heute ist das Wetter schön.|今天天气很好。
die Sonne|nf|Heute scheint die Sonne.|今天阳光明媚。
der Regen|nm|Der Regen hört bald auf.|雨很快就停。
der Schnee|nm|Die Kinder spielen im Schnee.|孩子们在雪地里玩。
der Wind|nm|Heute ist der Wind stark.|今天风很大。
die Wolke|nf|Am Himmel ist eine Wolke.|天上有一朵云。
der Himmel|nm|Der Himmel ist blau.|天空是蓝色的。
die Luft|nf|Die Luft ist heute warm.|今天空气很暖。
die Temperatur|nf|Die Temperatur liegt bei zwanzig Grad.|温度是二十度。
der Baum|nm|Vor dem Haus steht ein Baum.|房子前有一棵树。
der Körper|nm|Sport ist gut für den Körper.|运动对身体有益。
der Kopf|nm|Mein Kopf tut weh.|我头痛。
das Gesicht|nn|Wasch bitte dein Gesicht.|请洗脸。
das Haar|nn|Sie hat lange schwarze Haare.|她有一头黑色长发。
das Auge|nn|Meine Augen sind blau.|我的眼睛是蓝色的。
das Ohr|nn|Mein linkes Ohr tut weh.|我的左耳疼。
die Nase|nf|Meine Nase ist kalt.|我的鼻子很凉。
der Mund|nm|Bitte öffnen Sie den Mund.|请张嘴。
der Zahn|nm|Mein Zahn tut weh.|我牙疼。
der Hals|nm|Mein Hals tut weh.|我嗓子疼。
der Arm|nm|Er trägt die Tasche im Arm.|他用手臂抱着包。
die Hand|nf|Wasch bitte deine Hände.|请洗手。
der Finger|nm|Ich habe zehn Finger.|我有十根手指。
der Bauch|nm|Mein Bauch tut weh.|我肚子疼。
der Rücken|nm|Mein Rücken tut weh.|我背疼。
das Bein|nn|Mein rechtes Bein tut weh.|我的右腿疼。
der Fuß|nm|Mein linker Fuß tut weh.|我的左脚疼。
das Herz|nn|Mein Herz schlägt schnell.|我的心跳得很快。
die Gesundheit|nf|Sport ist gut für die Gesundheit.|运动有益健康。
die Krankheit|nf|Diese Krankheit ist nicht gefährlich.|这种病不危险。
der Schmerz|nm|Der Schmerz ist schon besser.|疼痛已经减轻了。
das Fieber|nn|Das Kind hat Fieber.|孩子发烧了。
die Medizin|nf|Nehmen Sie diese Medizin zweimal täglich.|请每天服用两次这种药。
die Tablette|nf|Nehmen Sie morgens eine Tablette.|请早上服一片药。
die Kleidung|nf|Die Kleidung ist im Schrank.|衣服在柜子里。
das Kleid|nn|Das rote Kleid ist schön.|这条红色连衣裙很漂亮。
der Rock|nm|Sie trägt einen schwarzen Rock.|她穿着一条黑裙子。
die Hose|nf|Die Hose ist zu lang.|裤子太长了。
das Hemd|nn|Das Hemd ist weiß.|衬衫是白色的。
das T-Shirt|nn|Ich trage heute ein T-Shirt.|我今天穿T恤。
der Pullover|nm|Der Pullover ist warm.|毛衣很暖和。
die Jacke|nf|Zieh bitte deine Jacke an.|请穿上夹克。
der Mantel|nm|Im Winter trage ich einen Mantel.|我冬天穿大衣。
der Schuh|nm|Der Schuh ist zu klein.|鞋太小了。
die Mütze|nf|Im Winter trage ich eine Mütze.|我冬天戴帽子。
die Brille|nf|Ohne Brille kann ich nicht gut lesen.|我不戴眼镜就看不清字。
die Farbe|nf|Welche Farbe hat das Auto?|汽车是什么颜色？
die Sprache|nf|Deutsch ist eine schöne Sprache.|德语是一门美丽的语言。
das Wort|nn|Ich verstehe dieses Wort nicht.|我不懂这个单词。
der Satz|nm|Bitte lesen Sie den Satz.|请读这个句子。
die Antwort|nf|Die Antwort ist richtig.|答案是正确的。
die Aufgabe|nf|Die Aufgabe ist noch nicht fertig.|任务还没有完成。
der Kurs|nm|Der Kurs beginnt am Montag.|课程星期一开始。
die Klasse|nf|In unserer Klasse sind zwanzig Schüler.|我们班有二十名学生。
die Pause|nf|Um zehn Uhr machen wir Pause.|我们十点休息。
der Unterricht|nm|Der Unterricht beginnt um acht Uhr.|课程八点开始。
die Prüfung|nf|Die Prüfung ist am Freitag.|考试在星期五。
der Fehler|nm|Hier ist ein kleiner Fehler.|这里有一个小错误。
die Seite|nf|Bitte lesen Sie Seite zehn.|请读第十页。
die Liste|nf|Mein Name steht auf der Liste.|名单上有我的名字。
der Brief|nm|Der Brief ist von meiner Mutter.|这封信是我母亲寄来的。
die Nachricht|nf|Ich schreibe dir eine Nachricht.|我给你发一条消息。
das Gespräch|nn|Das Gespräch dauert zehn Minuten.|谈话持续十分钟。
die Musik|nf|Ich höre gern Musik.|我喜欢听音乐。
der Film|nm|Der Film beginnt um acht Uhr.|电影八点开始。
das Lied|nn|Wir singen ein deutsches Lied.|我们唱一首德语歌。
der Sport|nm|Sport ist gut für die Gesundheit.|运动有益健康。
das Spiel|nn|Das Spiel beginnt um drei Uhr.|比赛三点开始。
der Fußball|nm|Die Kinder spielen Fußball.|孩子们踢足球。
die Party|nf|Die Party beginnt um acht Uhr.|聚会八点开始。
die Feier|nf|Die Feier ist am Samstag.|庆祝活动在星期六。
der Geburtstag|nm|Heute ist mein Geburtstag.|今天是我的生日。
das Geschenk|nn|Das Geschenk ist für dich.|这份礼物是给你的。
der Preis|nm|Der Preis ist zu hoch.|价格太高了。
das Geld|nn|Ich habe nicht genug Geld.|我没有足够的钱。
der Euro|nm|Das kostet zehn Euro.|这个十欧元。
die Freizeit|nf|In meiner Freizeit lese ich gern.|我空闲时喜欢读书。
das Hobby|nn|Lesen ist mein Hobby.|阅读是我的爱好。
die Hilfe|nf|Danke für deine Hilfe.|谢谢你的帮助。
das Problem|nn|Wir haben ein kleines Problem.|我们有一个小问题。
die Idee|nf|Das ist eine gute Idee.|这是一个好主意。
das Internet|nn|Im Hotel gibt es kostenloses Internet.|酒店有免费网络。
der Kalender|nm|Der Termin steht im Kalender.|日历上写着预约时间。
das Beispiel|nn|Der Lehrer gibt ein Beispiel.|老师举了一个例子。
die Lösung|nf|Wir suchen eine Lösung.|我们在寻找解决办法。
groß|adj|Berlin ist eine große Stadt.|柏林是一座大城市。
klein|adj|Das Zimmer ist klein.|房间很小。
lang|adj|Die Straße ist sehr lang.|这条街很长。
kurz|adj|Der Film ist kurz.|这部电影很短。
hoch|adj|Das Haus ist sehr hoch.|这栋房子很高。
alt|adj|Mein Auto ist schon alt.|我的汽车已经旧了。
jung|adj|Die Lehrerin ist noch jung.|女老师还很年轻。
neu|adj|Ich habe ein neues Handy.|我有一部新手机。
schön|adj|Der Park ist sehr schön.|公园很漂亮。
hübsch|adj|Das Kleid ist hübsch.|这条连衣裙很好看。
hässlich|adj|Ich finde die Farbe hässlich.|我觉得这个颜色不好看。
nett|adj|Unsere Nachbarn sind nett.|我们的邻居很友好。
freundlich|adj|Der Verkäufer ist sehr freundlich.|售货员很友好。
glücklich|adj|Heute bin ich sehr glücklich.|我今天很幸福。
traurig|adj|Warum bist du traurig?|你为什么难过？
froh|adj|Ich bin froh, dass du da bist.|你来了，我很高兴。
lustig|adj|Der Film ist lustig.|这部电影很有趣。
ernst|adj|Der Lehrer ist heute sehr ernst.|老师今天很严肃。
schwer|adj|Der Koffer ist schwer.|行李箱很重。
schwierig|adj|Die Prüfung ist schwierig.|考试很难。
falsch|adj|Diese Antwort ist falsch.|这个答案是错的。
wichtig|adj|Deutsch ist für meine Arbeit wichtig.|德语对我的工作很重要。
interessant|adj|Das Buch ist interessant.|这本书很有趣。
langweilig|adj|Der Unterricht ist heute langweilig.|今天的课很无聊。
schnell|adj|Der Zug ist sehr schnell.|火车很快。
langsam|adj|Bitte sprechen Sie langsam.|请您说慢一点。
früh|adj|Der frühe Zug fährt um sechs Uhr.|早班火车六点发车。
spät|adj|Der späte Bus kommt um elf Uhr.|晚班公交车十一点来。
warm|adj|Das Wasser ist warm.|水是温的。
kalt|adj|Im Winter ist es kalt.|冬天很冷。
heiß|adj|Der Kaffee ist heiß.|咖啡很烫。
kühl|adj|Am Abend wird es kühl.|晚上会变凉。
hell|adj|Das Zimmer ist groß und hell.|房间宽敞明亮。
dunkel|adj|In der Nacht ist es dunkel.|夜里很暗。
laut|adj|Die Musik ist zu laut.|音乐声音太大。
leise|adj|Bitte sprechen Sie leise.|请轻声说话。
sauber|adj|Das Bad ist sauber.|浴室很干净。
schmutzig|adj|Meine Schuhe sind schmutzig.|我的鞋脏了。
leer|adj|Die Flasche ist leer.|瓶子是空的。
offen|adj|Das Fenster ist offen.|窗户开着。
geschlossen|adj|Der Laden ist geschlossen.|商店关门了。
frei|adj|Ist dieser Platz frei?|这个座位空着吗？
besetzt|adj|Dieser Platz ist besetzt.|这个座位有人了。
fertig|adj|Das Essen ist fertig.|饭做好了。
kaputt|adj|Mein Handy ist kaputt.|我的手机坏了。
teuer|adj|Das Hotel ist zu teuer.|这家酒店太贵了。
billig|adj|Das Ticket ist billig.|这张票很便宜。
reich|adj|Er ist reich, aber nicht glücklich.|他很富有，但并不幸福。
arm|adj|Die Familie ist arm.|这个家庭很贫困。
gesund|adj|Obst und Gemüse sind gesund.|水果和蔬菜有益健康。
krank|adj|Ich bin krank und bleibe zu Hause.|我生病了，待在家里。
wach|adj|Das Kind ist noch wach.|孩子还醒着。
hungrig|adj|Nach der Arbeit bin ich hungrig.|下班后我很饿。
durstig|adj|Nach dem Sport bin ich durstig.|运动后我很渴。
stark|adj|Der Wind ist heute stark.|今天风很大。
schwach|adj|Nach der Krankheit ist er noch schwach.|病后他还很虚弱。
dick|adj|Das Buch ist sehr dick.|这本书很厚。
dünn|adj|Das Eis ist zu dünn.|冰层太薄。
breit|adj|Die Straße ist breit.|这条街很宽。
eng|adj|Die Hose ist zu eng.|裤子太紧。
nah|adj|Der Bahnhof ist ganz nah.|火车站很近。
weit|adj|Der Flughafen ist weit weg.|机场很远。
bequem|adj|Das Sofa ist bequem.|沙发很舒服。
modern|adj|Das Hotel ist modern.|酒店很现代。
bekannt|adj|Berlin ist eine bekannte Stadt.|柏林是一座著名城市。
verheiratet|adj|Ich bin verheiratet und habe ein Kind.|我已婚，有一个孩子。
ruhig|adj|In der Nacht ist die Straße ruhig.|夜里街道很安静。
gemeinsam|adj|Das ist unsere gemeinsame Wohnung.|这是我们共同的住宅。
gleich|adj|Die beiden Taschen sind gleich.|这两个包一样。
anders|adv|Heute machen wir es anders.|我们今天换一种做法。
besonders|adv|Der Kuchen schmeckt besonders gut.|这个蛋糕特别好吃。
überall|adv|Im Sommer sind überall viele Menschen.|夏天到处都有很多人。
zurück|adv|Wann kommst du zurück?|你什么时候回来？
fast|adv|Das Glas ist fast leer.|杯子快空了。
genug|adv|Das ist gut genug.|这样已经足够好了。

müde|adj|Ich bin müde und gehe schlafen.|我累了，要去睡觉。
sofort|adv|Ich komme sofort.|我马上来。
draußen|adv|Draußen ist es kalt.|外面很冷。
drinnen|adv|Drinnen ist es warm.|里面很暖和。
nirgendwo|adv|Ich finde meinen Schlüssel nirgendwo.|我到处都找不到钥匙。
weiter|adv|Gehen Sie bitte weiter.|请继续往前走。
leider|adv|Leider habe ich heute keine Zeit.|很遗憾，我今天没有时间。
gerade|adv|Ich lerne gerade Deutsch.|我正在学德语。
wirklich|adv|Das ist wirklich schön.|这真的很美。
ungefähr|adv|Die Fahrt dauert ungefähr eine Stunde.|车程大约一小时。
der Vorname|nm|Mein Vorname ist Anna.|我的名字是安娜。
die Kollegin|nf|Meine Kollegin arbeitet heute zu Hause.|我的女同事今天在家办公。
der Verkäufer|nm|Der Verkäufer hilft mir.|男售货员帮助我。
die Wurst|nf|Ich esse Brot mit Wurst.|我吃夹香肠的面包。
die Bäckerei|nf|In der Bäckerei kaufe ich Brot.|我在面包店买面包。
die Apotheke|nf|Die Apotheke ist neben der Bank.|药店在银行旁边。
der Ausgang|nm|Der Ausgang ist dort rechts.|出口在那边右侧。
der Juli|nm|Im Juli haben wir Ferien.|我们七月放假。
der September|nm|Der Kurs beginnt im September.|课程九月开始。
die Übung|nf|Diese Übung ist einfach.|这道练习很简单。
der Cent|nm|Das kostet fünfzig Cent.|这个五十欧分。
gut|adj|Das Essen ist gut.|饭很好吃。
schlecht|adj|Das Wetter ist heute schlecht.|今天天气不好。
leicht|adj|Der Koffer ist leicht.|这个行李箱很轻。
einfach|adj|Die Aufgabe ist einfach.|这道题很简单。
richtig|adj|Die Antwort ist richtig.|答案是正确的。
voll|adj|Die Flasche ist voll.|瓶子是满的。
ledig|adj|Er ist ledig.|他未婚。
`;

function parseExampleOverrides(source) {
  const map = new Map();
  for (const [index, rawLine] of source.split("\n").entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split("|");
    if (parts.length !== 4) {
      throw new Error(`Example line ${index + 1} does not have four fields: ${line}`);
    }
    const [term, typeCode, example, exampleZh] = parts;
    const key = `${term}|${typeCode}`;
    if (map.has(key)) throw new Error(`Duplicate example override: ${key}`);
    map.set(key, { example, exampleZh });
  }
  return map;
}

const EXAMPLE_OVERRIDES = parseExampleOverrides(EXAMPLE_SOURCE);

function parseInventory(source) {
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line, index) => {
      const parts = line.split("|");
      if (parts.length !== 3) throw new Error(`Inventory line ${index + 1} does not have three fields: ${line}`);
      const [term, typeCode, meaning] = parts;
      return { term, typeCode, meaning };
    });
}

function normalizeTerm(value) {
  return value
    .normalize("NFC")
    .replace(/^(der|die|das)\s+/iu, "")
    .trim()
    .toLocaleLowerCase("de-DE");
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function readJsonIfPresent(file) {
  try {
    return await readJson(file);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return null;
    throw error;
  }
}

const TYPE_TO_POS = {
  v: "verb",
  nm: "noun",
  nf: "noun",
  nn: "noun",
  adj: "adjective",
  adv: "adverb",
  prep: "preposition",
  conj: "conjunction",
  pron: "pronoun",
  det: "determiner",
  num: "numeral",
  part: "particle",
  intj: "interjection",
};

function defaultForms(item, source) {
  const key = `${item.term}|${item.typeCode}`;
  const override = FORM_OVERRIDES.get(key);
  if (override) return override;
  if (/^n[mfn]$/.test(item.typeCode) || item.typeCode === "v") {
    if (source?.forms) {
      const pieces = source.forms.split(" · ");
      pieces[0] = item.term;
      return pieces.join(" · ");
    }
    return item.typeCode === "v"
      ? `${item.term} · Form noch redaktionell festzulegen`
      : `${item.term} · Plural noch redaktionell festzulegen`;
  }
  if (item.typeCode === "adj") return `${item.term} · als Adjektiv`;
  return `${item.term} · unveränderlich`;
}

function candidateSafetyScore(candidate) {
  const german = candidate?.german ?? "";
  const chinese = candidate?.chinese ?? "";
  if (!candidate?.match?.targetVerified || !german || !chinese) return Number.NEGATIVE_INFINITY;
  const blocked =
    /(Selbstmord|Mord|Mörder|töten|Krieg|Armee|Nazi|Sex|Schlampe|verdammt|Hölle|Gewehr|Pistole|Bombe)/iu;
  if (blocked.test(german)) return Number.NEGATIVE_INFINITY;
  if (/[/\n\r]|\.\.\.|…/.test(german) || /[/\n\r]/.test(chinese)) return Number.NEGATIVE_INFINITY;
  const words = german.trim().split(/\s+/u).length;
  let score = 500;
  score -= Math.abs(words - 7) * 9;
  score -= Math.max(0, german.length - 75) * 3;
  score -= Math.max(0, chinese.length - 36) * 2;
  if (words < 3 || words > 15 || german.length > 110 || chinese.length > 70) score -= 500;
  if (/[“”„"]/u.test(german)) score -= 40;
  if (/[A-ZÄÖÜ][a-zäöüß]+(?:,|\s)+(?:[A-ZÄÖÜ][a-zäöüß]+)/u.test(german)) score -= 15;
  return score;
}

function selectTatoebaExample(item, tatoebaEntries) {
  const expectedPos = TYPE_TO_POS[item.typeCode];
  const normalized = normalizeTerm(item.term);
  const exactEntries = tatoebaEntries.filter(
    (entry) =>
      entry.term === item.term &&
      entry.partOfSpeech === expectedPos &&
      entry.normalizedHeadword === normalized,
  );
  const matchingEntries = exactEntries.length
    ? exactEntries
    : tatoebaEntries.filter(
        (entry) => entry.partOfSpeech === expectedPos && entry.normalizedHeadword === normalized,
      );
  const candidates = [];
  for (const entry of matchingEntries) {
    for (const candidate of [entry.selected, ...(entry.candidates ?? [])]) {
      if (!candidate) continue;
      candidates.push({ ...candidate, entryId: entry.id });
    }
  }
  const deduplicated = [...new Map(candidates.map((candidate) => [candidate.pairId, candidate])).values()];
  const selected = deduplicated
    .map((candidate) => ({ candidate, score: candidateSafetyScore(candidate) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((left, right) => right.score - left.score)[0]?.candidate;
  if (!selected) return null;
  return {
    example: selected.german.trim(),
    exampleZh: selected.chinese.trim(),
    evidence: {
      source: "Tatoeba via OPUS",
      release: "v2026-07-08",
      pairId: selected.pairId,
      sourceLine: selected.sourceLine,
      targetVerified: true,
    },
  };
}

function genericExample(item) {
  const firstMeaning = item.meaning.split("；")[0];
  if (/^n[mfn]$/.test(item.typeCode)) {
    if (item.term === "die Eltern") {
      return { example: "Hier sind die Eltern.", exampleZh: "父母在这里。" };
    }
    if (item.term === "die Ferien") {
      return { example: "Die Ferien beginnen heute.", exampleZh: "假期今天开始。" };
    }
    return {
      example: `Hier ist ${item.term}.`,
      exampleZh: `这里有${firstMeaning}。`,
    };
  }
  if (item.typeCode === "adj") {
    return { example: `Das ist ${item.term}.`, exampleZh: `这是${firstMeaning}。` };
  }
  if (item.typeCode === "v") {
    return { example: `Wir möchten heute ${item.term}.`, exampleZh: `我们今天想${firstMeaning}。` };
  }
  return { example: `Das ist ${item.term}.`, exampleZh: `这是${firstMeaning}。` };
}

function findDictionaryEvidence(item, wiktapiCache) {
  const normalized = normalizeTerm(item.term);
  const titleCase = normalized ? `${normalized[0].toLocaleUpperCase("de-DE")}${normalized.slice(1)}` : normalized;
  const attempted = [item.term, normalizeTerm(item.term), titleCase];
  for (const key of attempted) {
    const record = wiktapiCache.entries?.[key];
    if (!record) continue;
    const positions = [
      ...new Set(
        (record.response?.definitions ?? [])
          .filter((definition) => definition.lang_code === "de")
          .map((definition) => definition.pos)
          .filter(Boolean),
      ),
    ];
    return {
      source: "German Wiktionary via WiktAPI",
      cacheKey: key,
      status: record.status,
      endpoint: record.endpoint,
      positions,
    };
  }
  return {
    source: "German Wiktionary via WiktAPI",
    cacheKey: null,
    status: "cache-miss",
    endpoint: null,
    positions: [],
  };
}

function findHanDeDictEvidence(item, source, handeDict) {
  if (!source) return null;
  const record = handeDict.entries?.[source.id];
  if (!record) return null;
  const matches = [...(record.matches ?? []), ...(record.conflictingMatches ?? [])].slice(0, 3);
  if (!matches.length) return null;
  return {
    source: "HanDeDict",
    editionDate: handeDict.source?.editionDate,
    license: handeDict.source?.license,
    sourceIds: matches.map((match) => match.sourceId),
    role: "cross-check only; Chinese teaching gloss was editorially selected",
  };
}

function rowObject(fields, row) {
  return Object.fromEntries(fields.map((field, index) => [field, row[index]]));
}

function objectRow(fields, row) {
  return fields.map((field) => row[field]);
}

function rowsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has("--apply");
  const verify = args.has("--verify");
  for (const arg of args) {
    if (!["--apply", "--verify"].includes(arg)) throw new Error(`Unknown argument: ${arg}`);
  }
  if (apply && verify) throw new Error("Choose either --apply or --verify.");

  const inventory = parseInventory(INVENTORY_SOURCE);
  if (inventory.length !== 630) {
    throw new Error(`The A1 inventory must contain exactly 630 rows; found ${inventory.length}.`);
  }

  const books = await Promise.all(
    ["a1", "a2", "b1", "b2", "c1"].map(async (level) => ({
      level: level.toUpperCase(),
      data: await readJson(path.join(ROOT, `public/wordbooks/${level}-v1.json`)),
    })),
  );
  const sourceRows = books.flatMap(({ level, data }) =>
    data.words.map((word) => ({
      level,
      id: word[0],
      term: word[1],
      forms: word[2],
      typeCode: word[3],
      meaning: word[4],
      example: word[5],
      exampleZh: word[6],
    })),
  );

  const resolved = inventory.map((item) => {
    const exact = sourceRows.filter((row) => row.term === item.term);
    const exactType = exact.find((row) => row.typeCode === item.typeCode);
    const normalized = sourceRows.filter((row) => normalizeTerm(row.term) === normalizeTerm(item.term));
    const normalizedType = normalized.find((row) => row.typeCode === item.typeCode);
    return {
      ...item,
      source: exactType ?? exact[0] ?? normalizedType ?? normalized[0] ?? null,
    };
  });

  const duplicateKeys = resolved
    .map((row) => `${row.term}|${row.typeCode}`)
    .filter((key, index, array) => array.indexOf(key) !== index);
  if (duplicateKeys.length) throw new Error(`Duplicate editorial entries: ${duplicateKeys.join(", ")}`);

  const currentA1 = await readJson(A1_PATH);
  const previousReview = await readJsonIfPresent(REVIEW_PATH);
  const currentObjects = currentA1.words.map((row) => rowObject(currentA1.fields, row));

  if (verify) {
    if (!previousReview) throw new Error("No A1 editorial review exists yet.");
    const expectedRows = previousReview.entries.map((entry) => entry.after);
    const mismatches = currentObjects
      .map((row, index) => ({ row, expected: expectedRows[index], index }))
      .filter(({ row, expected }) => !rowsEqual(row, expected));
    if (mismatches.length) {
      throw new Error(`A1 does not match the editorial record (${mismatches.length} mismatched rows).`);
    }
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          reviewedCount: previousReview.reviewedCount,
          unresolvedCount: previousReview.unresolvedCount,
          digest: sha256(await fs.readFile(A1_PATH)),
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  let beforeObjects = currentObjects;
  if (
    previousReview?.entries?.length === 630 &&
    currentObjects.every((row, index) => rowsEqual(row, previousReview.entries[index]?.after))
  ) {
    beforeObjects = previousReview.entries.map((entry) => entry.before);
  }

  const [tatoeba, wiktapi, handeDict] = await Promise.all([
    readJson(TATOEBA_PATH),
    readJson(WIKTAPI_PATH),
    readJson(HANDEDICT_PATH),
  ]);

  const editorialRows = resolved.map((item, index) => {
    const id = beforeObjects[index].id;
    const forms = defaultForms(item, item.source);
    const override = EXAMPLE_OVERRIDES.get(`${item.term}|${item.typeCode}`);
    const tatoebaExample = override ? null : selectTatoebaExample(item, tatoeba.entries);
    const fallback = override ?? tatoebaExample ?? genericExample(item);
    const dictionaryEvidence = findDictionaryEvidence(item, wiktapi);
    const evidence = [
      {
        source: "Worttag A1 editorial review",
        kind: "independent CEFR-aligned teaching classification",
        reviewedOn: "2026-07-28",
      },
      dictionaryEvidence,
    ];
    const handeEvidence = findHanDeDictEvidence(item, item.source, handeDict);
    if (handeEvidence) evidence.push(handeEvidence);
    if (tatoebaExample?.evidence) evidence.push(tatoebaExample.evidence);
    if (override) {
      evidence.push({
        source: "Worttag A1 editorial review",
        kind: "manually written example and Simplified-Chinese translation",
      });
    } else if (!tatoebaExample) {
      evidence.push({
        source: "Worttag A1 editorial review",
        kind: "controlled fallback example",
      });
    }

    const after = {
      id,
      term: item.term,
      forms,
      typeCode: item.typeCode,
      meaning: item.meaning,
      example: fallback.example,
      exampleZh: fallback.exampleZh,
    };
    const before = beforeObjects[index];
    const replacement = before.term !== after.term || before.typeCode !== after.typeCode;
    const unresolvedReasons = [];
    if (/noch redaktionell festzulegen/u.test(forms)) unresolvedReasons.push("forms_not_resolved");
    if (!override && !tatoebaExample) unresolvedReasons.push("example_has_no_external_parallel_source");
    return {
      id,
      before,
      after,
      reason: replacement
        ? [
            "The previous frequency-derived row was duplicated, malformed, outside the practical A1 syllabus, or attached to an unsuitable part of speech.",
            "Replaced with an independently selected high-frequency item needed for elementary communication.",
            "Headword, article or verb forms, teaching sense, and example were checked as one lexical unit.",
          ]
        : [
            "Retained the useful A1 headword and corrected or normalized its lexical category, forms, Chinese teaching sense, and example.",
          ],
      evidence,
      unresolved: unresolvedReasons.length > 0,
      unresolvedReasons,
    };
  });

  const unresolvedEntries = editorialRows.filter((entry) => entry.unresolved);
  const review = {
    schemaVersion: 1,
    level: "A1",
    reviewedOn: "2026-07-28",
    scope: {
      packedRows: 630,
      policy:
        "Independent CEFR-aligned A1 teaching inventory; not copied from an examination-provider word list.",
      identityPolicy: "All 630 original opaque row IDs are preserved in their original order.",
      editorialPolicy:
        "Every row was reviewed as a lexical unit. Common modern senses and short learner-facing Simplified-Chinese glosses take priority over rare, archaic, slang, or mechanically generated homographs.",
    },
    reviewedCount: 630,
    changedCount: editorialRows.filter((entry) => !rowsEqual(entry.before, entry.after)).length,
    replacementCount: editorialRows.filter(
      (entry) => entry.before.term !== entry.after.term || entry.before.typeCode !== entry.after.typeCode,
    ).length,
    unresolvedCount: unresolvedEntries.length,
    unresolvedIds: unresolvedEntries.map((entry) => entry.id),
    sources: {
      wiktapi: {
        provider: wiktapi.provider,
        edition: wiktapi.edition,
        language: wiktapi.language,
        cacheSha256: sha256(await fs.readFile(WIKTAPI_PATH)),
      },
      handeDict: {
        name: handeDict.source?.name,
        editionDate: handeDict.source?.editionDate,
        license: handeDict.source?.license,
        indexSha256: sha256(await fs.readFile(HANDEDICT_PATH)),
      },
      tatoeba: {
        corpus: tatoeba.source?.corpus,
        release: tatoeba.source?.release,
        license: tatoeba.source?.license,
        indexSha256: sha256(await fs.readFile(TATOEBA_PATH)),
      },
    },
    entries: editorialRows,
  };

  const nextA1 = {
    ...currentA1,
    count: editorialRows.length,
    words: editorialRows.map((entry) => objectRow(currentA1.fields, entry.after)),
  };
  const output = {
    inventoryCount: inventory.length,
    changedCount: review.changedCount,
    replacementCount: review.replacementCount,
    unresolvedCount: review.unresolvedCount,
    dictionaryCacheMisses: editorialRows.filter((entry) =>
      entry.evidence.some(
        (evidence) =>
          evidence.source === "German Wiktionary via WiktAPI" && evidence.status === "cache-miss",
      ),
    ).length,
    externallyPairedExamples: editorialRows.filter((entry) =>
      entry.evidence.some((evidence) => evidence.source === "Tatoeba via OPUS"),
    ).length,
    manuallyWrittenExamples: editorialRows.filter((entry) =>
      entry.evidence.some(
        (evidence) =>
          evidence.source === "Worttag A1 editorial review" &&
          evidence.kind === "manually written example and Simplified-Chinese translation",
      ),
    ).length,
    controlledFallbackExamples: editorialRows.filter((entry) =>
      entry.evidence.some(
        (evidence) =>
          evidence.source === "Worttag A1 editorial review" &&
          evidence.kind === "controlled fallback example",
      ),
    ).length,
  };

  if (apply) {
    await fs.mkdir(path.dirname(REVIEW_PATH), { recursive: true });
    await fs.writeFile(REVIEW_PATH, stableJson(review));
    await fs.writeFile(A1_PATH, `${JSON.stringify(nextA1)}\n`);
    output.written = [
      path.relative(ROOT, REVIEW_PATH),
      path.relative(ROOT, A1_PATH),
    ];
  } else {
    output.mode = "check";
  }
  process.stdout.write(
    `${JSON.stringify(output, null, 2)}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
