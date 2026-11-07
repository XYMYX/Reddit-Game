// Types shared between server and client.
// IMPORTANT: Nothing in here may ever carry the password or hints derived from it.

export type Difficulty = 'easy' | 'medium' | 'hard';

export type ProfileKey =
  | 'firstName'
  | 'lastName'
  | 'birthYear'
  | 'birthday'
  | 'city'
  | 'country'
  | 'job'
  | 'petType'
  | 'petName'
  | 'hobby'
  | 'team'
  | 'favNumber';

/** Feedback per character, like Wordle (rendered black/white in the UI). */
export type Mark = 'correct' | 'present' | 'absent';

export type PublicField =
  | { key: ProfileKey; label: string; locked: false; value: string }
  | { key: ProfileKey; label: string; locked: true; cost: number };

/** What the client is allowed to see of a puzzle. */
export type PublicPuzzle = {
  id: string;
  difficulty: Difficulty;
  length: number;
  maxAttempts: number;
  /** false = uppercase only, the keypad shows no lowercase letters. */
  mixedCase: boolean;
  fields: PublicField[];
};

export type GuessResult = {
  guess: string;
  marks: Mark[];
};

export type Progress = {
  /** Known character per position, null = still unknown. */
  mask: (string | null)[];
  /** Characters in the password whose position is still unclear. */
  present: string[];
  /** Characters that do not occur in the password. */
  excluded: string[];
};

// ---------------------------------------------------------------------------
// API (all responses are computed by the server)

export type GameMode = 'daily' | 'endless';
export type GameStatus = 'playing' | 'won' | 'lost';

/** Only sent after the game is over. */
export type Reveal = {
  password: string;
  recipe: string;
  /** Security lesson: after every daily, in endless only every 10th level. */
  lesson: string | null;
};

export type GameView = {
  mode: GameMode;
  /** Daily: date (UTC, YYYY-MM-DD). Endless: level number as string. */
  label: string;
  puzzle: PublicPuzzle;
  guesses: GuessResult[];
  progress: Progress;
  status: GameStatus;
  attemptsLeft: number;
  penalty: number;
  /** Points for this puzzle, set when finished. */
  score: number | null;
  reveal: Reveal | null;
  /** Endless only. */
  level: number | null;
  runScore: number | null;
};

export type MenuView = {
  username: string | null;
  date: string;
  daily: { status: GameStatus | 'new'; score: number | null };
  endless: { level: number; runScore: number; bestLevel: number };
};

export type LeaderboardRow = { rank: number; username: string; score: number };

export type LeaderboardView = {
  date: string;
  top: LeaderboardRow[];
  me: LeaderboardRow | null;
  total: number;
};

export type GuessRequest = { guess: string };
export type UnlockRequest = { key: ProfileKey };
export type ApiError = { error: string };
export type ShareResponse = { ok: true };
