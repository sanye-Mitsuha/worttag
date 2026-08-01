import assert from "node:assert/strict";
import test from "node:test";
import { moderateBoardMessage } from "../app/board-moderation.ts";

test("accepts a normal learning note", () => {
  const result = moderateBoardMessage("Heute habe ich drei neue Wörter gelernt.", "Lena");
  assert.deepEqual(result, {
    ok: true,
    nickname: "Lena",
    content: "Heute habe ich drei neue Wörter gelernt.",
  });
});

test("normalizes whitespace and uses an anonymous nickname", () => {
  const result = moderateBoardMessage("  例句很有帮助。\r\n  ", "  ");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.nickname, "匿名");
    assert.equal(result.content, "例句很有帮助。");
  }
});

test("does not display links, contact details, or blocked content", () => {
  assert.equal(moderateBoardMessage("请看 https://example.com", "匿名").ok, false);
  assert.equal(moderateBoardMessage("我的电话是 13800138000", "匿名").ok, false);
  assert.equal(moderateBoardMessage("加微信私聊", "匿名").ok, false);
});

test("rejects empty, oversized, and repeated spam messages", () => {
  assert.equal(moderateBoardMessage("   ", "匿名").ok, false);
  assert.equal(moderateBoardMessage("a".repeat(241), "匿名").ok, false);
  assert.equal(moderateBoardMessage("哈哈哈哈哈哈哈哈哈哈哈哈", "匿名").ok, false);
});
