import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appRoot = new URL("../app/", import.meta.url);

async function readAppSources() {
  return Promise.all([
    readFile(new URL("page.tsx", appRoot), "utf8"),
    readFile(new URL("layout.tsx", appRoot), "utf8"),
    readFile(new URL("globals.css", appRoot), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
}

test("declares Worttag metadata and a production-ready application shell", async () => {
  const [page, layout, css, packageJson] = await readAppSources();

  assert.match(packageJson, /"name": "worttag"/);
  assert.match(packageJson, /"version": "2\.3\.5"/);
  assert.match(layout, /const title = "Worttag · 德语词汇记忆"/);
  assert.match(layout, /间隔复习和高质量语法例句/);
  assert.match(layout, /openGraph:/);
  assert.match(layout, /twitter:/);
  assert.match(layout, /<html lang="zh-CN"/);

  assert.match(page, /\["learn", "今日学习"\]/);
  assert.match(page, /\["review", "复习"\]/);
  assert.match(page, /\["library", "词库"\]/);
  assert.match(page, /\["settings", "设置"\]/);
  assert.doesNotMatch(page, /\["progress", "进度"\]/);
  assert.doesNotMatch(page, /view === "progress"/);
  assert.match(css, /--paper:/);
  assert.match(css, /\[data-theme="dark"\]/);
});

test("keeps the mastery loop, keyboard controls and destructive reset warning", async () => {
  const [page, , css] = await readAppSources();

  assert.match(page, /光点规则：已知 \+1 · 模糊 −1 · 未知清零/);
  assert.match(page, /所有单词都已点亮三次/);
  assert.match(page, /现在要进行一次拼写测试吗/);
  assert.match(page, /type StudyMode = "mastery" \| "speed"/);
  assert.match(page, /刷词模式/);
  assert.match(page, /熟记/);
  assert.match(page, /速刷/);
  assert.match(page, /先根据德语例句判断/);
  assert.match(page, /下一个词/);
  assert.doesNotMatch(page, /下一个词 →/);
  assert.match(page, /candidate\.schemaVersion !== 2/);
  assert.doesNotMatch(page, /className="library-grammar"/);
  assert.match(page, /beta3\.9/);
  assert.match(page, /const APP_VERSION = "beta3\.9"/);
  assert.match(page, /exampleAudioUrl/);
  assert.match(page, /ExampleAudioButton/);
  assert.match(page, /听例句/);
  assert.match(page, /影响德语单词和例句朗读/);
  assert.match(page, /function openReleaseNotes/);
  assert.match(page, /已知晓，本版本不再提示/);
  assert.match(page, /https:\/\/space\.bilibili\.com\/96625971/);
  assert.doesNotMatch(page, /className="header-bilibili-link"/);
  assert.doesNotMatch(page, /RELEASE_NOTES/);
  assert.doesNotMatch(page, /release-link-github/);
  assert.match(page, /bilibili：三叶-Mitsuha/);
  assert.match(page, /github：mitsuha/);
  assert.match(page, /from "ts-fsrs"/);
  assert.match(page, /const REVIEW_FSRS_SCHEDULER = fsrs\(/);
  assert.match(page, /function gradeReviewMemory\(/);
  assert.match(page, /queueSource === "review"\n      \? gradeReviewMemory/s);
  assert.match(page, /if \(queueSource === "review"\)/);
  assert.match(page, /sessionRatings\.filter\(\(rating\) => rating !== null\)/);
  assert.doesNotMatch(page, /review-summary-grid/);
  assert.match(page, /reviewCount\?: number/);
  assert.match(page, /const MAX_REVIEW_COUNT = 3/);
  assert.match(page, /function reviewCountForRecord\(/);
  assert.match(page, /function nextMasteryPointsForRating\(/);
  assert.match(page, /if \(rating === "fuzzy"\) return Math\.max\(0, points - 1\)/);
  assert.match(page, /function nextLearningStageForRating\(/);
  assert.match(page, /const reviewCount = nextMasteryPointsForRating\(reviewCountForRecord\(state\), rating\)/);
  assert.match(page, /const studyPoints = nextMasteryPointsForRating\(studyPointsForRecord\(state\), rating\)/);
  assert.doesNotMatch(page, /record\.fsrs\?\.reps/);
  assert.match(page, /function isMasteredRecord\(/);
  assert.match(page, /record\?\.status === "known" && Boolean\(record\.fsrs\)/);
  assert.match(page, /复习次数/);
  assert.match(page, /已熟记词库/);
  assert.match(page, /const libraryWordsSource = useMemo/);
  assert.match(page, /libraryWordsSource\.map/);
  assert.match(page, /Wortschatz · 10,000 Wörter/);
  assert.doesNotMatch(page, /example-quality-v1\.json|例句质量|例句审核|example-quality-badge|example-quality-icon|library-quality-summary-note/);
  assert.doesNotMatch(css, /example-quality|library-quality-summary|dictionary-example-quality/);
  assert.match(page, /当前 \$\{libraryWordsSource\.length\} 词/);
  assert.match(page, /className="mastered-drawer"/);
  assert.doesNotMatch(page, /按掌握状态筛选|filter-tabs|status-pill/);
  assert.match(page, /className="board-launch-button"/);
  assert.match(page, /function openBoard/);
  assert.match(page, /\/api\/board/);
  assert.match(page, /留言已通过审核并公开显示/);
  assert.match(css, /\.board-backdrop\s*\{/);
  assert.match(css, /\.board-message-content\s*\{/);
  assert.match(css, /\.release-notes-dialog\s*\{/);
  assert.match(css, /\.version-notice-dot\s*\{/);
  assert.match(css, /\.example-audio-button\s*\{/);
  assert.match(page, /return word\.level === level/);
  assert.match(page, /className="queue-review-dots"/);
 assert.match(css, /\.queue-item > \.queue-review-dots/);
  assert.match(page, /function studyPointsForRecord\(/);
  assert.match(page, /showMasteredGold=\{queueSource === "review"\}/);
  assert.match(page, /record\?\.status === "known" && Boolean\(record\.fsrs\)/);
  assert.match(page, /还剩 \$\{dueWords\.length\} 个复习/);
  assert.doesNotMatch(page, /每日短文|Tagesgeschichte|story-preview|story-page|generated-story/);
  assert.doesNotMatch(page, /todayPlanWordIds|buildTodayPlanIds|selectStoryWords|dailyStoryAvailable/);
  assert.doesNotMatch(page, /storyDe|storyZh/);
  assert.match(page, /const activeStudyMode: StudyMode = queueSource === "manual" \? "speed" : settings\.studyMode/);
  assert.match(page, /className="speed-state-label"/);
  assert.match(page, /currentSessionRating && event\.key\.toLowerCase\(\) === "x"/);
  assert.match(page, /aria-keyshortcuts="X"/);
  assert.match(page, /className="speed-next-key"/);
  assert.doesNotMatch(page, /<kbd>X<\/kbd> 速刷下一个词/);
  assert.match(css, /\.topbar\s*\{[\s\S]*position: sticky;[\s\S]*top: 0;[\s\S]*z-index: 50;/u);
  assert.match(page, /速刷 · \{currentWord\.example \? "先看例句" : "先看词义"\}/);
  assert.match(page, /已记录；模糊和未知会在本轮结束后重刷/);
  assert.match(page, /remainingIds = sessionUniqueIds\.filter/);
  assert.match(page, /setSessionLastRatings\(\{\}\)/);
  assert.match(page, /重新拼写/);
  assert.match(page, /预计完成 \{settings\.level\} 词书/);
  assert.doesNotMatch(page, /className="shortcut-card/);
  assert.doesNotMatch(page, /className="insight-column/);
  assert.doesNotMatch(page, /Tastatur · 快捷键/);
  assert.match(page, /<kbd className="feature-shortcut" aria-hidden="true">F<\/kbd>/);
  assert.match(page, /<kbd className="feature-shortcut" aria-hidden="true">G<\/kbd>/);
  assert.match(page, /aria-keyshortcuts="G"/);
  assert.doesNotMatch(page, /<kbd className="feature-shortcut" aria-hidden="true">空格<\/kbd>/);
  assert.match(page, /aria-keyshortcuts="F"/);
  assert.match(page, /aria-keyshortcuts="Space"/);
  assert.match(page, /className="meaning-key"/);
  assert.match(page, /status === "known" \? "Q"/);
  assert.match(page, /event\.code === "Space"/);
  assert.match(page, /const ratingStage = activeStudyMode === "speed" \|\| revealed \|\| currentPromptMode === "example" \|\| currentPromptMode === "direct"/);
  assert.match(page, /target\?\.closest\("input, select, textarea"\)/);
  assert.match(page, /<p className="word-type">\{currentWord\.type\}<\/p>/);
  assert.match(page, /本轮按顺序每词一次；答错会在下一轮再出现/);
  assert.match(page, /确定重置所有学习进度/);
  assert.match(page, /取消，保留进度/);
  assert.match(page, /云存档已同步 · 电脑 · 平板 · 手机/);
  assert.doesNotMatch(page, /className="streak"/);
  assert.doesNotMatch(page, /className="plan-card paper-panel"/);
  assert.doesNotMatch(page, /className="dictionary-evidence/);
  assert.doesNotMatch(page, /className="dictionary-sources"/);
  assert.doesNotMatch(page, /buildDictionaryLinks|parseDictionaryEvidencePayload|\/api\/dictionary/);
  assert.doesNotMatch(page, /按 CEFR 能力等级整理的 Worttag 精选词书/);
  assert.doesNotMatch(page, /到期复习始终按紧急程度排序/);
  assert.doesNotMatch(page, /恢复默认设置只调整学习偏好/);
  assert.doesNotMatch(page, /这是按当前每日目标连续学习的估算/);
  assert.doesNotMatch(
    page,
    /meaning:\s*expandedMeaning\(term,\s*meaning,\s*typeCode\)/u,
    "reviewed packed meanings must not be replaced by global homograph hints",
  );
});

test("keeps the simplified learning and dictionary layouts", async () => {
  const [page, , css] = await readAppSources();

  assert.doesNotMatch(page, /className="explanation-grid"/);
  assert.doesNotMatch(page, /className="memory-note"/);
  assert.doesNotMatch(page, /className="dwds-evidence"/);
  assert.doesNotMatch(page, /dictionary-grammar-title/);
  assert.match(page, /中文释义 <span>Worttag 课程释义<\/span>/);
  assert.match(css, /\.settings-plan-column > \*/);
  assert.match(css, /\.order-settings,\s*\.experience-settings/);
  assert.match(css, /\.study-mode-options/);
});
