import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(['clearTransitionTimer', 'advanceStudyWord', 'scheduleStudyAdvance', 'prepareSavedSettings']);
const functions = [];
function visit(node) {
  if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) functions.push(node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
const code = ts.transpileModule(functions.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function harness(delay = 0) {
  const timers = new Map();
  let timerId = 0;
  const state = { waiting: false, stopped: 0, cancelled: 0 };
  const context = vm.createContext({
    pendingAdvanceRef: { current: null }, transitionTimerRef: { current: null },
    settings: { answerDelay: delay },
    setAwaitingAdvance: value => { state.waiting = value; },
    stopCurrentAudio: () => state.stopped++,
    window: {
      setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; },
      clearTimeout: id => timers.delete(id),
      speechSynthesis: { cancel: () => state.cancelled++ },
    },
    DEFAULT_SETTINGS: { speechSpeed: '1', answerDelay: 0 },
    SPEECH_SPEED_VALUES: ['0.5', '0.75', '1', '1.25'], WORDBOOK_CATEGORIES: ['A1', 'A2'],
  });
  vm.runInContext(code, context);
  return { context, timers, state };
}
test('manual pacing keeps the answer and advances once even on repeated clicks', () => {
  const { context, timers, state } = harness();
  let advances = 0;
  context.scheduleStudyAdvance(() => advances++);
  assert.equal(state.waiting, true);
  assert.equal(timers.size, 0);
  context.advanceStudyWord();
  context.advanceStudyWord();
  assert.equal(advances, 1);
  assert.equal(state.waiting, false);
  assert.equal(state.stopped, 1);
  assert.equal(state.cancelled, 1);
});
test('automatic pacing respects the delay and manual next cancels its timer', () => {
  for (const delay of [2000, 5000]) {
    const { context, timers } = harness(delay);
    let advances = 0;
    context.scheduleStudyAdvance(() => advances++);
    const timer = [...timers.values()][0];
    assert.equal(timer.ms, delay);
    context.advanceStudyWord();
    assert.equal(timers.size, 0);
    timer.fn();
    assert.equal(advances, 1);
  }
});
test('queue reset cancels pending advancement and replacement discards old work', () => {
  const { context, timers, state } = harness(2000);
  let old = 0; let current = 0;
  context.scheduleStudyAdvance(() => old++);
  context.scheduleStudyAdvance(() => current++);
  assert.equal(timers.size, 1);
  [...timers.values()][0].fn();
  assert.equal(old, 0);
  assert.equal(current, 1);
  context.scheduleStudyAdvance(() => old++);
  context.clearTransitionTimer();
  context.advanceStudyWord();
  assert.equal(old, 0);
  assert.equal(state.waiting, false);
  assert.equal(timers.size, 0);
});
test('old or malformed preferences use valid defaults and legacy speech settings migrate', () => {
  const { context } = harness();
  for (const saved of [{}, { answerDelay: -1, speechSpeed: 'invalid' }]) {
    const result = context.prepareSavedSettings(saved);
    assert.equal(result.answerDelay, 0);
    assert.equal(result.speechSpeed, '1');
  }
  assert.equal(context.prepareSavedSettings({ speechSpeed: 'standard' }).speechSpeed, '1');
  assert.equal(context.prepareSavedSettings({ answerDelay: 5000, speechSpeed: '0.75' }).answerDelay, 5000);
});
