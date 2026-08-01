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
  assert.match(packageJson, /"version": "1\.3\.0"/);
  assert.match(layout, /const title = "Worttag · 德语词汇记忆"/);
  assert.match(layout, /间隔复习、语法例句和每日短文/);
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
  const [page] = await readAppSources();

  assert.match(page, /光点规则：已知 \+1 · 模糊 −1 · 未知清零/);
  assert.match(page, /所有单词都已点亮三次/);
  assert.match(page, /现在要进行一次拼写测试吗/);
  assert.match(page, /重新拼写/);
  assert.match(page, /预计完成 \{settings\.level\} 词书/);
  assert.match(page, /<kbd>F<\/kbd> 发音/);
  assert.match(page, /<kbd>点击<\/kbd> 选择词义/);
  assert.match(page, /本轮按顺序每词一次；答错会在下一轮再出现/);
  assert.match(page, /确定重置所有学习进度/);
  assert.match(page, /取消，保留进度/);
  assert.match(page, /云存档已同步 · Mac · iPad · iPhone/);
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
});
