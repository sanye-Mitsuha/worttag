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
  assert.match(packageJson, /"version": "1\.1\.0"/);
  assert.match(layout, /const title = "Worttag · 德语词汇记忆"/);
  assert.match(layout, /间隔复习、语法例句和每日短文/);
  assert.match(layout, /openGraph:/);
  assert.match(layout, /twitter:/);
  assert.match(layout, /<html lang="zh-CN"/);

  assert.match(page, /\["learn", "今日学习"\]/);
  assert.match(page, /\["review", "复习"\]/);
  assert.match(page, /\["library", "词库"\]/);
  assert.match(page, /\["progress", "进度"\]/);
  assert.match(page, /\["settings", "设置"\]/);
  assert.match(css, /--paper:/);
  assert.match(css, /\[data-theme="dark"\]/);
});

test("keeps the mastery loop, keyboard controls and destructive reset warning", async () => {
  const [page] = await readAppSources();

  assert.match(page, /光点规则：已知 \+1 · 模糊 −1 · 未知清零/);
  assert.match(page, /所有单词都已点亮三次/);
  assert.match(page, /现在要进行一次拼写测试吗/);
  assert.match(page, /<kbd>F<\/kbd> 发音/);
  assert.match(page, /<kbd>空格<\/kbd> 揭晓/);
  assert.match(page, /<kbd>Q<\/kbd><kbd>W<\/kbd><kbd>E<\/kbd> 判断/);
  assert.match(page, /确定重置所有学习进度/);
  assert.match(page, /取消，保留进度/);
  assert.match(page, /云存档已同步 · Mac · iPad · iPhone/);
});
