// Game logic: Wordle-style feedback and progress mask. Server-only.

import type { GuessResult, Mark, Progress } from '../../shared/game';
import { charsetFor } from './data.ts';

/** Uppercase-only puzzles accept any case and compare in uppercase. */
export const normalizeGuess = (guess: string, mixedCase: boolean): string =>
  mixedCase ? guess : guess.toUpperCase();

/** Returns an error message, or null if the (normalized) guess is valid. */
export const validateGuess = (guess: string, length: number, mixedCase = true): string | null => {
  if (guess.length !== length) return `Guess must be ${length} characters`;
  if (!charsetFor(mixedCase).test(guess)) return 'Guess contains invalid characters';
  return null;
};

/**
 * Wordle rules, case-sensitive ('A' != 'a').
 * Duplicates: a character is only marked 'present' as often as it still
 * occurs in the solution after exact matches are removed.
 */
export const evaluateGuess = (solution: string, guess: string): Mark[] => {
  if (solution.length !== guess.length) throw new Error('length mismatch');
  const marks: Mark[] = Array.from({ length: guess.length }, () => 'absent');
  const remaining = new Map<string, number>();

  for (let i = 0; i < solution.length; i++) {
    const s = solution[i]!;
    if (guess[i] === s) marks[i] = 'correct';
    else remaining.set(s, (remaining.get(s) ?? 0) + 1);
  }
  for (let i = 0; i < guess.length; i++) {
    if (marks[i] === 'correct') continue;
    const g = guess[i]!;
    const left = remaining.get(g) ?? 0;
    if (left > 0) {
      marks[i] = 'present';
      remaining.set(g, left - 1);
    }
  }
  return marks;
};

export const isSolved = (marks: Mark[]): boolean => marks.every((m) => m === 'correct');

/** Derive what the player knows so far from all guesses. */
export const deriveProgress = (length: number, results: GuessResult[]): Progress => {
  const mask: (string | null)[] = Array.from({ length }, () => null);
  const minCount = new Map<string, number>(); // known minimum occurrences
  const absentSeen = new Set<string>();

  for (const { guess, marks } of results) {
    const counts = new Map<string, number>();
    marks.forEach((m, i) => {
      const ch = guess[i]!;
      if (m === 'correct') mask[i] = ch;
      if (m === 'absent') absentSeen.add(ch);
      else counts.set(ch, (counts.get(ch) ?? 0) + 1);
    });
    for (const [ch, n] of counts) minCount.set(ch, Math.max(minCount.get(ch) ?? 0, n));
  }

  const present: string[] = [];
  for (const [ch, n] of minCount) {
    const placed = mask.filter((c) => c === ch).length;
    if (n > placed) present.push(ch);
  }
  const excluded = [...absentSeen].filter((ch) => !minCount.has(ch));

  return { mask, present: present.sort(), excluded: excluded.sort() };
};
