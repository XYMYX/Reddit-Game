import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGuess, applyUnlock, buildView, newGame, puzzleOf, shareText, type StoredGame } from './session.ts';

const setup = () => {
  const g = newGame('session-test', 'medium');
  return { g, p: puzzleOf(g, 'test') };
};
const wrong = (len: number) => '#'.repeat(len);
const must = (r: ReturnType<typeof applyGuess>): StoredGame => {
  assert.ok(r.ok, r.ok ? '' : r.error);
  return r.game;
};

void test('win scores points and reveals', () => {
  const { g, p } = setup();
  const won = must(applyGuess(p, g, p.password.toLowerCase())); // uppercase puzzle: case-insensitive input
  assert.equal(won.status, 'won');
  assert.equal(won.score, 200 + 5 * 25);
  const v = buildView(p, won, { mode: 'daily', label: 'x', showLesson: true });
  assert.equal(v.reveal?.password, p.password);
  assert.ok(v.reveal?.lesson);
});

void test('six wrong guesses lose, seventh is rejected', () => {
  const { g, p } = setup();
  let cur = g;
  for (let i = 0; i < 6; i++) cur = must(applyGuess(p, cur, wrong(p.password.length)));
  assert.equal(cur.status, 'lost');
  assert.equal(cur.score, 0);
  assert.equal(applyGuess(p, cur, p.password).ok, false);
});

void test('no reveal while playing', () => {
  const { g, p } = setup();
  const cur = must(applyGuess(p, g, wrong(p.password.length)));
  const v = buildView(p, cur, { mode: 'daily', label: 'x', showLesson: true });
  assert.equal(v.reveal, null);
  assert.ok(!JSON.stringify(v).includes(p.password));
});

void test('invalid input is rejected', () => {
  const { g, p } = setup();
  assert.equal(applyGuess(p, g, 123).ok, false);
  assert.equal(applyGuess(p, g, 'x').ok, false);
  assert.equal(applyGuess(p, g, ' '.repeat(p.password.length)).ok, false);
});

void test('unlock only locked fields, once, and costs points', () => {
  const { g, p } = setup();
  const locked = Object.entries(p.visibility).find(([, v]) => v === 'locked')?.[0];
  const hidden = Object.entries(p.visibility).find(([, v]) => v === 'hidden')?.[0];
  assert.ok(locked);
  const r = applyUnlock(p, g, locked);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(applyUnlock(p, r.game, locked).ok, false);
  assert.equal(applyUnlock(p, g, hidden).ok, false);
  assert.equal(applyUnlock(p, g, 'password').ok, false);
  const won = must(applyGuess(p, r.game, p.password));
  assert.equal(won.score, 200 + 5 * 25 - 75);
});

void test('share text has no password characters', () => {
  const { g, p } = setup();
  let cur = must(applyGuess(p, g, wrong(p.password.length)));
  cur = must(applyGuess(p, cur, p.password));
  const text = shareText('2026-11-08', cur);
  assert.ok(text.startsWith('eXploit Daily 2026-11-08 · medium · 2/6'));
  assert.ok(!text.includes(p.password));
  assert.ok(!/[A-Za-z0-9]{3,}/.test(text.split('\n\n')[1] ?? ''));
});
