import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveProgress, evaluateGuess, isSolved, normalizeGuess, validateGuess } from './logic.ts';

void test('exact match is all correct', () => {
  const m = evaluateGuess('Luna1987', 'Luna1987');
  assert.ok(isSolved(m));
});

void test('present and absent', () => {
  assert.deepEqual(evaluateGuess('abc123', 'cba129'), [
    'present', 'correct', 'present', 'correct', 'correct', 'absent',
  ]);
});

void test('duplicates are not over-counted', () => {
  // solution has one 'o', guess has two -> only one gets marked
  assert.deepEqual(evaluateGuess('rocky7', 'oooooo'), [
    'absent', 'correct', 'absent', 'absent', 'absent', 'absent',
  ]);
  assert.deepEqual(evaluateGuess('rocky7', 'oxoxxx'), [
    'present', 'absent', 'absent', 'absent', 'absent', 'absent',
  ]);
});

void test('case-sensitive', () => {
  assert.deepEqual(evaluateGuess('Luna87', 'luna87'), [
    'absent', 'correct', 'correct', 'correct', 'correct', 'correct',
  ]);
});

void test('validateGuess', () => {
  assert.equal(validateGuess('abc', 6), 'Guess must be 6 characters');
  assert.equal(validateGuess('abc de', 6), 'Guess contains invalid characters');
  assert.equal(validateGuess('ab!d_9', 6), null);
  assert.equal(validateGuess('ab!d_9', 6, false), 'Guess contains invalid characters');
  assert.equal(validateGuess(normalizeGuess('ab!d_9', false), 6, false), null);
});

void test('deriveProgress builds mask, present and excluded', () => {
  const solution = 'Kiko92';
  const guesses = ['Kxyz29', 'Kiwo92'].map((guess) => ({ guess, marks: evaluateGuess(solution, guess) }));
  const p = deriveProgress(6, guesses);
  assert.deepEqual(p.mask, ['K', 'i', null, 'o', '9', '2']);
  assert.deepEqual(p.present, []);
  assert.deepEqual(p.excluded, ['w', 'x', 'y', 'z']);
});

void test('present char stays listed until placed', () => {
  const p = deriveProgress(6, [{ guess: 'xxxxxL', marks: evaluateGuess('Luna87', 'xxxxxL') }]);
  assert.deepEqual(p.present, ['L']);
  assert.deepEqual(p.excluded, ['x']);
});

void test('char marked absent as duplicate is not excluded', () => {
  // one 'o' in solution; second 'o' is absent but 'o' must not be excluded
  const p = deriveProgress(6, [{ guess: 'oxoxxx', marks: evaluateGuess('rocky7', 'oxoxxx') }]);
  assert.deepEqual(p.present, ['o']);
  assert.deepEqual(p.excluded, ['x']);
});
