// Pure game-session logic (no Redis): apply guesses/unlocks, score, build the client view.

import type {
  Difficulty,
  GameMode,
  GameStatus,
  GameView,
  GuessResult,
  ProfileKey,
  Reveal,
} from '../../shared/game';
import { generatePuzzle, MAX_ATTEMPTS, toPublicPuzzle, UNLOCK_COST, type Puzzle } from './generator.ts';
import { deriveProgress, evaluateGuess, isSolved, normalizeGuess, validateGuess } from './logic.ts';

/** What we persist per puzzle. The password is NOT stored; it is regenerated from the seed. */
export type StoredGame = {
  seed: string;
  difficulty: Difficulty;
  guesses: GuessResult[];
  unlocked: ProfileKey[];
  status: GameStatus;
  score: number | null;
  /** Pattern ids excluded for this puzzle (needed to regenerate the same puzzle). */
  avoid?: string[];
};

export const newGame = (seed: string, difficulty: Difficulty, avoid: string[] = []): StoredGame => ({
  seed,
  difficulty,
  avoid,
  guesses: [],
  unlocked: [],
  status: 'playing',
  score: null,
});

export const puzzleOf = (g: StoredGame, id: string): Puzzle =>
  generatePuzzle(g.seed, g.difficulty, id, g.avoid ?? []);

const BASE_POINTS: Record<Difficulty, number> = { easy: 100, medium: 200, hard: 300 };
const POINTS_PER_SPARE_ATTEMPT = 25;

export const penaltyOf = (g: StoredGame): number => g.unlocked.length * UNLOCK_COST[g.difficulty];

/** Won: base + bonus for unused attempts - unlock penalty (never below 10). Lost: 0. */
export const scoreOf = (g: StoredGame): number => {
  if (g.status !== 'won') return 0;
  const spare = MAX_ATTEMPTS - g.guesses.length;
  return Math.max(10, BASE_POINTS[g.difficulty] + spare * POINTS_PER_SPARE_ATTEMPT - penaltyOf(g));
};

export type Result = { ok: true; game: StoredGame } | { ok: false; error: string };

export const applyGuess = (p: Puzzle, g: StoredGame, raw: unknown): Result => {
  if (g.status !== 'playing') return { ok: false, error: 'Game is over' };
  if (typeof raw !== 'string') return { ok: false, error: 'Invalid guess' };
  const guess = normalizeGuess(raw, p.mixedCase);
  const err = validateGuess(guess, p.password.length, p.mixedCase);
  if (err) return { ok: false, error: err };

  const marks = evaluateGuess(p.password, guess);
  const guesses = [...g.guesses, { guess, marks }];
  const status: GameStatus = isSolved(marks) ? 'won' : guesses.length >= MAX_ATTEMPTS ? 'lost' : 'playing';
  const next: StoredGame = { ...g, guesses, status };
  return { ok: true, game: status === 'playing' ? next : { ...next, score: scoreOf(next) } };
};

export const applyUnlock = (p: Puzzle, g: StoredGame, key: unknown): Result => {
  if (g.status !== 'playing') return { ok: false, error: 'Game is over' };
  const field = toPublicPuzzle(p, g.unlocked).fields.find((f) => f.key === key);
  if (!field || !field.locked) return { ok: false, error: 'Nothing to unlock' };
  return { ok: true, game: { ...g, unlocked: [...g.unlocked, field.key] } };
};

export const buildView = (
  p: Puzzle,
  g: StoredGame,
  opts: { mode: GameMode; label: string; showLesson: boolean; level?: number; runScore?: number }
): GameView => {
  const reveal: Reveal | null =
    g.status === 'playing'
      ? null
      : { password: p.password, recipe: p.recipe, lesson: opts.showLesson ? p.lesson : null };
  return {
    mode: opts.mode,
    label: opts.label,
    puzzle: toPublicPuzzle(p, g.unlocked),
    guesses: g.guesses,
    progress: deriveProgress(p.password.length, g.guesses),
    status: g.status,
    attemptsLeft: MAX_ATTEMPTS - g.guesses.length,
    penalty: penaltyOf(g),
    score: g.score,
    reveal,
    level: opts.level ?? null,
    runScore: opts.runScore ?? null,
  };
};

/** Spoiler-free result grid for a Reddit comment (no characters, only marks). */
export const shareText = (date: string, g: StoredGame): string => {
  const icon = { correct: '⬜', present: '🔳', absent: '⬛' } as const;
  const tries = g.status === 'won' ? `${g.guesses.length}/${MAX_ATTEMPTS}` : `X/${MAX_ATTEMPTS}`;
  const points = g.status === 'won' ? ` · ${g.score ?? 0} pts` : '';
  const unlocks = g.unlocked.length ? ` · ${g.unlocked.length} unlock${g.unlocked.length > 1 ? 's' : ''}` : '';
  const head = `eXploit Daily ${date} · ${g.difficulty} · ${tries}${points}${unlocks}`;
  // Two trailing spaces = line break in Reddit markdown.
  const grid = g.guesses.map((r) => r.marks.map((m) => icon[m]).join('')).join('  \n');
  return `${head}\n\n${grid}`;
};
