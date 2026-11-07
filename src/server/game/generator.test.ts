import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Difficulty } from '../../shared/game';
import { applyFmt, generatePuzzle, isSolvable, PATTERNS, toPublicPuzzle } from './generator.ts';

const DIFFS: Difficulty[] = ['easy', 'medium', 'hard'];

void test('same seed -> same puzzle', () => {
  assert.deepEqual(generatePuzzle('2026-11-07', 'medium'), generatePuzzle('2026-11-07', 'medium'));
});

void test('different seeds -> different puzzles', () => {
  const pw = new Set(Array.from({ length: 50 }, (_, i) => generatePuzzle(`s${i}`, 'easy').password));
  assert.ok(pw.size > 30);
});

void test('every puzzle is solvable (2000 seeds per difficulty)', () => {
  for (const d of DIFFS) {
    for (let i = 0; i < 2000; i++) {
      const p = generatePuzzle(`seed-${d}-${i}`, d);
      assert.ok(isSolvable(p), `unsolvable: ${p.id} ${p.patternId}`);
      assert.equal(p.difficulty, d);
    }
  }
});

void test('all patterns of each difficulty get used', () => {
  for (const d of DIFFS) {
    const seen = new Set(Array.from({ length: 500 }, (_, i) => generatePuzzle(`p${i}`, d).patternId));
    for (const pat of PATTERNS.filter((x) => x.difficulty === d)) assert.ok(seen.has(pat.id), pat.id);
  }
});

void test('public puzzle never contains the password', () => {
  for (let i = 0; i < 500; i++) {
    const p = generatePuzzle(`pub${i}`, 'hard');
    const allKeys = ['firstName', 'lastName', 'birthYear', 'birthday', 'city', 'country', 'job',
      'petType', 'petName', 'hobby', 'team', 'favNumber'] as const;
    const json = JSON.stringify(toPublicPuzzle(p, [...allKeys]));
    assert.ok(!json.includes(p.password), `leak in ${p.id}`);
    assert.ok(!json.includes('password') && !json.includes('recipe') && !json.includes('pattern'));
  }
});

void test('locked fields do not leak their value', () => {
  for (let i = 0; i < 200; i++) {
    const p = generatePuzzle(`lock${i}`, 'hard');
    for (const fld of toPublicPuzzle(p).fields) {
      if (fld.locked) assert.ok(!('value' in fld));
    }
  }
});

void test('easy/medium are uppercase only, hard may mix', () => {
  for (let i = 0; i < 300; i++) {
    for (const d of ['easy', 'medium'] as const) {
      const p = generatePuzzle(`case${i}`, d);
      assert.equal(p.password, p.password.toUpperCase());
      assert.equal(toPublicPuzzle(p).mixedCase, false);
    }
  }
  const hard = Array.from({ length: 300 }, (_, i) => generatePuzzle(`case${i}`, 'hard').password);
  assert.ok(hard.some((pw) => /[a-z]/.test(pw)));
});

void test('birthday token is MMDD', () => {
  for (let i = 0; i < 100; i++) {
    const { birthday } = generatePuzzle(`bd${i}`, 'easy').profile;
    const [monthName, day] = birthday.display.split(' ');
    const month = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
      'September', 'October', 'November', 'December'].indexOf(monthName ?? '') + 1;
    assert.equal(birthday.token, String(month).padStart(2, '0') + String(day).padStart(2, '0'));
  }
});

void test('avoid list: no pattern repeats within 3 levels', () => {
  for (const d of DIFFS) {
    let recent: string[] = [];
    for (let i = 0; i < 200; i++) {
      const p = generatePuzzle(`avoid-${d}-${i}`, d, 'x', recent);
      assert.ok(!recent.includes(p.patternId), `${d}: ${p.patternId} repeated`);
      recent = [...recent, p.patternId].slice(-3);
    }
  }
});

void test('avoid list is ignored when every pattern is excluded', () => {
  const ids = PATTERNS.filter((p) => p.difficulty === 'easy').map((p) => p.id);
  assert.ok(ids.includes(generatePuzzle('all-avoided', 'easy', 'x', ids).patternId));
});

void test('transforms', () => {
  assert.equal(applyFmt('Biscuit', 'leet'), 'B15cu1t');
  assert.equal(applyFmt('Luna', 'rev'), 'anul');
  assert.equal(applyFmt('Zurich', 'code3'), 'ZUR');
  assert.equal(applyFmt('1987', 'yy'), '87');
});
