// Puzzle generator: fictional profile + password from fixed patterns + randomness.
// Server-only. The password never leaves the server (see toPublicPuzzle).

import type {
  Difficulty,
  ProfileKey,
  PublicField,
  PublicPuzzle,
} from '../../shared/game';
import {
  charsetFor,
  CITIES,
  FIRST_NAMES,
  HOBBIES,
  JOBS,
  LAST_NAMES,
  MONTHS,
  PET_NAMES,
  PET_TYPES,
  SYMBOLS,
  TEAM_MASCOTS,
  TEAM_TOWNS,
} from './data.ts';
import { createHash } from 'node:crypto';
import { createRng, type Rng } from './rng.ts';

export const MAX_ATTEMPTS = 6;
export const MIN_LENGTH = 6;
export const MAX_LENGTH = 12;

export type FieldValue = {
  /** What the player sees. */
  display: string;
  /** What password patterns are built from. Must be derivable from display. */
  token: string;
};

export type Profile = Record<ProfileKey, FieldValue>;
export type Visibility = 'visible' | 'locked' | 'hidden';

export type Puzzle = {
  id: string;
  difficulty: Difficulty;
  profile: Profile;
  visibility: Record<ProfileKey, Visibility>;
  /** false = password is uppercase only (keypad shows only A-Z). */
  mixedCase: boolean;
  password: string;
  patternId: string;
  /** Human readable recipe, e.g. "Pet name + birth year" (for the lesson). */
  recipe: string;
  lesson: string;
  /** Fields the password is built from. */
  usedFields: ProfileKey[];
};

// ---------------------------------------------------------------------------
// Profile

export const FIELD_ORDER: ProfileKey[] = [
  'firstName', 'lastName', 'birthYear', 'birthday', 'city', 'country', 'job',
  'petType', 'petName', 'hobby', 'team', 'favNumber',
];

export const FIELD_LABELS: Record<ProfileKey, string> = {
  firstName: 'first name',
  lastName: 'last name',
  birthYear: 'born',
  birthday: 'birthday',
  city: 'city',
  country: 'country',
  job: 'job',
  petType: 'pet',
  petName: "pet's name",
  hobby: 'hobby',
  team: 'favorite team',
  favNumber: 'lucky number',
};

const plain = (s: string): FieldValue => ({ display: s, token: s });

export const generateProfile = (rng: Rng): Profile => {
  const loc = rng.pick(CITIES);
  const year = rng.int(1965, 2006);
  const month = rng.int(1, 12);
  const day = rng.int(1, 28);
  const town = rng.pick(TEAM_TOWNS);
  const mascot = rng.pick(TEAM_MASCOTS);
  const pad = (n: number) => String(n).padStart(2, '0');

  return {
    firstName: plain(rng.pick(FIRST_NAMES)),
    lastName: plain(rng.pick(LAST_NAMES)),
    birthYear: plain(String(year)),
    // US format (Reddit audience): display "October 13", token MMDD "1013"
    birthday: { display: `${MONTHS[month - 1]} ${day}`, token: pad(month) + pad(day) },
    city: plain(loc.city),
    country: plain(loc.country),
    job: plain(rng.pick(JOBS)),
    petType: plain(rng.pick(PET_TYPES)),
    petName: plain(rng.pick(PET_NAMES)),
    hobby: plain(rng.pick(HOBBIES)),
    team: { display: `${town} ${mascot}`, token: mascot },
    favNumber: plain(String(rng.int(2, 99))),
  };
};

// ---------------------------------------------------------------------------
// Transforms (all deterministic, so every result is derivable)

export type Fmt =
  | 'raw' | 'lower' | 'cap' | 'upper' | 'leet' | 'leetLower' | 'rev'
  | 'code3' | 'initial' | 'initialLower' | 'yy';

const LEET: Record<string, string> = { a: '4', e: '3', i: '1', o: '0', s: '5' };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
const leet = (s: string) => s.replace(/[aeios]/gi, (ch) => LEET[ch.toLowerCase()] ?? ch);

export const applyFmt = (token: string, fmt: Fmt): string => {
  switch (fmt) {
    case 'raw': return token;
    case 'lower': return token.toLowerCase();
    case 'cap': return cap(token);
    case 'upper': return token.toUpperCase();
    case 'leet': return leet(cap(token));
    case 'leetLower': return leet(token.toLowerCase());
    case 'rev': return [...token.toLowerCase()].reverse().join('');
    case 'code3': return token.slice(0, 3).toUpperCase();
    case 'initial': return token.charAt(0).toUpperCase();
    case 'initialLower': return token.charAt(0).toLowerCase();
    case 'yy': return token.slice(-2);
  }
};

// ---------------------------------------------------------------------------
// Patterns

type PartSpec = { field: ProfileKey; fmts: Fmt[] } | { symbol: true };

export type Pattern = {
  id: string;
  difficulty: Difficulty;
  recipe: string;
  lesson: string;
  parts: PartSpec[];
};

const f = (field: ProfileKey, ...fmts: Fmt[]): PartSpec => ({ field, fmts });
const SYM: PartSpec = { symbol: true };

export const PATTERNS: Pattern[] = [
  // --- easy
  {
    id: 'pet-year', difficulty: 'easy', recipe: 'Pet name + birth year',
    lesson: 'Pet names and birth years are often public on social media. Attackers try them first.',
    parts: [f('petName', 'cap', 'lower'), f('birthYear', 'raw')],
  },
  {
    id: 'first-year', difficulty: 'easy', recipe: 'First name + birth year',
    lesson: 'Your own name plus your birth year is one of the most common passwords worldwide.',
    parts: [f('firstName', 'cap', 'lower'), f('birthYear', 'raw')],
  },
  {
    id: 'pet-number', difficulty: 'easy', recipe: 'Pet name + lucky number',
    lesson: 'A favorite number adds almost nothing: attackers simply try 0-99 after every word.',
    parts: [f('petName', 'cap', 'lower'), f('favNumber', 'raw')],
  },
  {
    id: 'hobby-year', difficulty: 'easy', recipe: 'Hobby + birth year',
    lesson: 'Hobbies show up in profiles, photos and bios. They are guessable, not secret.',
    parts: [f('hobby', 'cap', 'lower'), f('birthYear', 'raw')],
  },
  {
    id: 'first-pet', difficulty: 'easy', recipe: 'First name + pet name',
    lesson: 'Two facts from the same profile are still just public facts. Length alone does not make it safe.',
    parts: [f('firstName', 'cap', 'lower'), f('petName', 'cap', 'lower')],
  },
  {
    id: 'team-year', difficulty: 'easy', recipe: 'Favorite team + birth year',
    lesson: 'Fans post about their team all the time. Team names are on every attacker word list.',
    parts: [f('team', 'cap', 'lower'), f('birthYear', 'raw')],
  },
  // --- medium
  {
    id: 'leetpet-yy', difficulty: 'medium', recipe: 'Pet name in leetspeak + short year',
    lesson: 'Leetspeak (a=4, e=3, o=0) is built into every cracking tool. It does not make a word secret.',
    parts: [f('petName', 'leet', 'leetLower'), f('birthYear', 'yy')],
  },
  {
    id: 'pet-yy-sym', difficulty: 'medium', recipe: 'Pet name + short year + symbol',
    lesson: 'A symbol at the end is what everyone does when a site demands one. Attackers know that.',
    parts: [f('petName', 'cap'), f('birthYear', 'yy'), SYM],
  },
  {
    id: 'revpet-year', difficulty: 'medium', recipe: 'Pet name reversed + birth year',
    lesson: 'Reversing a word is a standard rule in cracking tools. It costs them almost no extra time.',
    parts: [f('petName', 'rev'), f('birthYear', 'raw')],
  },
  {
    id: 'team-yy', difficulty: 'medium', recipe: 'Favorite team + short year',
    lesson: 'Favorite teams are easy to find. Fans use them everywhere, including passwords.',
    parts: [f('team', 'upper'), f('birthYear', 'yy')],
  },
  {
    id: 'first-ddmm', difficulty: 'medium', recipe: 'First name + birthday (MMDD)',
    lesson: 'Birthdays are shared on social media every year. Never use them in passwords.',
    parts: [f('firstName', 'cap', 'lower'), f('birthday', 'raw')],
  },
  {
    id: 'last-sym-yy', difficulty: 'medium', recipe: 'Last name + symbol + short year',
    lesson: 'Family names are public. Adding a symbol and a year is a predictable recipe.',
    parts: [f('lastName', 'cap'), SYM, f('birthYear', 'yy')],
  },
  {
    id: 'leethobby-num-sym', difficulty: 'medium', recipe: 'Hobby in leetspeak + lucky number + symbol',
    lesson: 'Three predictable tricks in a row are still predictable.',
    parts: [f('hobby', 'leetLower'), f('favNumber', 'raw'), SYM],
  },
  // --- hard
  {
    id: 'initials-pet-yy', difficulty: 'hard', recipe: 'Initials + pet name + short year',
    lesson: 'Combining personal facts feels clever, but each piece is public. Use a password manager.',
    parts: [f('firstName', 'initial', 'initialLower'), f('lastName', 'initial', 'initialLower'), f('petName', 'cap'), f('birthYear', 'yy')],
  },
  {
    id: 'city-hobby', difficulty: 'hard', recipe: 'City code + hobby',
    lesson: 'Where you live and what you do are often the first things in your profile.',
    parts: [f('city', 'code3'), f('hobby', 'lower')],
  },
  {
    id: 'city-ddmm-sym', difficulty: 'hard', recipe: 'City code + birthday + symbol',
    lesson: 'Short codes and dates are tiny search spaces for a computer.',
    parts: [f('city', 'code3'), f('birthday', 'raw'), SYM],
  },
  {
    id: 'leetpet-sym-num', difficulty: 'hard', recipe: 'Pet name in leetspeak + symbol + lucky number',
    lesson: 'Substitutions and symbols follow patterns that tools try automatically.',
    parts: [f('petName', 'leet'), SYM, f('favNumber', 'raw')],
  },
  {
    id: 'revpet-initials', difficulty: 'hard', recipe: 'Pet name reversed + initials',
    lesson: 'A long random passphrase beats any clever mix of personal details.',
    parts: [f('petName', 'rev'), f('firstName', 'initial'), f('lastName', 'initial')],
  },
  {
    id: 'hobby-city-yy', difficulty: 'hard', recipe: 'Hobby + city code + short year',
    lesson: 'Mixing two public facts only doubles the work for an attacker, it does not make it secret.',
    parts: [f('hobby', 'cap'), f('city', 'code3'), f('birthYear', 'yy')],
  },
];

export const usedFieldsOf = (pattern: Pattern): ProfileKey[] => [
  ...new Set(pattern.parts.flatMap((p) => ('field' in p ? [p.field] : []))),
];

export const buildPassword = (pattern: Pattern, profile: Profile, rng: Rng): string =>
  pattern.parts
    .map((p) => ('symbol' in p ? rng.pick(SYMBOLS) : applyFmt(profile[p.field].token, rng.pick(p.fmts))))
    .join('');

// ---------------------------------------------------------------------------
// Visibility: higher difficulty = fewer visible infos, more locked ones.

type VisConfig = {
  /** How many of the password fields may be locked (rest visible). */
  lockedUsedMax: number;
  /** Unused fields shown as noise. */
  extraVisible: number;
  /** Unused fields that are locked (red herrings, cost points). */
  extraLocked: number;
};

const VIS: Record<Difficulty, VisConfig> = {
  easy: { lockedUsedMax: 0, extraVisible: 5, extraLocked: 1 },
  medium: { lockedUsedMax: 1, extraVisible: 3, extraLocked: 2 },
  hard: { lockedUsedMax: 2, extraVisible: 2, extraLocked: 2 },
};

/** Lower and upper case only on higher difficulty. */
export const MIXED_CASE: Record<Difficulty, boolean> = { easy: false, medium: false, hard: true };

export const UNLOCK_COST: Record<Difficulty, number> = { easy: 50, medium: 75, hard: 100 };

/** Always shown: the "who" of the profile. */
const ALWAYS_VISIBLE: ProfileKey[] = ['firstName', 'lastName'];

const assignVisibility = (
  used: ProfileKey[],
  difficulty: Difficulty,
  rng: Rng
): Record<ProfileKey, Visibility> => {
  const cfg = VIS[difficulty];
  const vis: Record<ProfileKey, Visibility> = {
    firstName: 'hidden', lastName: 'hidden', birthYear: 'hidden', birthday: 'hidden',
    city: 'hidden', country: 'hidden', job: 'hidden', petType: 'hidden',
    petName: 'hidden', hobby: 'hidden', team: 'hidden', favNumber: 'hidden',
  };
  for (const k of ALWAYS_VISIBLE) vis[k] = 'visible';

  // Password fields: visible or locked, never hidden. At least one stays visible.
  const lockable = rng.shuffle(used.filter((k) => !ALWAYS_VISIBLE.includes(k)));
  const maxLocked = Math.min(cfg.lockedUsedMax, used.length - 1);
  const lockCount = rng.int(Math.min(1, maxLocked), maxLocked);
  lockable.forEach((k, i) => (vis[k] = i < lockCount ? 'locked' : 'visible'));

  // Noise fields.
  const others = rng.shuffle(FIELD_ORDER.filter((k) => !used.includes(k) && !ALWAYS_VISIBLE.includes(k)));
  others.forEach((k, i) => {
    if (i < cfg.extraVisible) vis[k] = 'visible';
    else if (i < cfg.extraVisible + cfg.extraLocked) vis[k] = 'locked';
  });
  return vis;
};

// ---------------------------------------------------------------------------
// Puzzle

/** Endless mode: difficulty rises with the level, with some mixing. */
export const difficultyForLevel = (level: number, rng: Rng): Difficulty => {
  if (level <= 3) return 'easy';
  if (level <= 6) return rng.chance(0.7) ? 'medium' : 'easy';
  if (level <= 10) return rng.chance(0.6) ? 'medium' : 'hard';
  return rng.chance(0.75) ? 'hard' : 'medium';
};

/**
 * Independent RNG streams per purpose. The player can observe the profile, so a
 * clever attacker might reconstruct the PRNG state from it. Because each stream
 * is seeded with sha256(seed + purpose), that reveals nothing about the
 * password stream (pattern, casing, symbols).
 */
const streams = (seed: string) => {
  const sub = (purpose: string) =>
    createRng(createHash('sha256').update(`${seed}|${purpose}`).digest('hex'));
  return { profile: sub('profile'), password: sub('password'), visibility: sub('visibility') };
};

/**
 * Generate a puzzle deterministically from a seed.
 * The seed must be unguessable (daily: HMAC of server secret + date,
 * endless: random UUID stored on the server).
 */
export const generatePuzzle = (
  seed: string,
  difficulty: Difficulty,
  id = seed,
  /** Pattern ids to skip (endless: the last levels). Ignored if nothing else is left. */
  avoid: readonly string[] = []
): Puzzle => {
  const rng = streams(seed);
  const all = PATTERNS.filter((p) => p.difficulty === difficulty);
  const fresh = all.filter((p) => !avoid.includes(p.id));
  const patterns = fresh.length > 0 ? fresh : all;
  const mixedCase = MIXED_CASE[difficulty];

  for (let attempt = 0; attempt < 100; attempt++) {
    const profile = generateProfile(rng.profile);
    const pattern = rng.password.pick(patterns);
    const built = buildPassword(pattern, profile, rng.password);
    const password = mixedCase ? built : built.toUpperCase();
    if (password.length < MIN_LENGTH || password.length > MAX_LENGTH) continue;
    if (!charsetFor(mixedCase).test(password)) continue;

    const usedFields = usedFieldsOf(pattern);
    return {
      id,
      difficulty,
      profile,
      visibility: assignVisibility(usedFields, difficulty, rng.visibility),
      mixedCase,
      password,
      patternId: pattern.id,
      recipe: pattern.recipe,
      lesson: pattern.lesson,
      usedFields,
    };
  }
  throw new Error(`Could not generate puzzle for seed ${seed}`);
};

/** Hard rule check: every password field must be visible or unlockable. */
export const isSolvable = (p: Puzzle): boolean =>
  p.usedFields.every((k) => p.visibility[k] !== 'hidden') &&
  p.password.length >= MIN_LENGTH &&
  p.password.length <= MAX_LENGTH &&
  charsetFor(p.mixedCase).test(p.password);

/** The ONLY view of a puzzle that may be sent to the client. */
export const toPublicPuzzle = (p: Puzzle, unlocked: readonly ProfileKey[] = []): PublicPuzzle => {
  const fields: PublicField[] = [];
  for (const key of FIELD_ORDER) {
    const v = p.visibility[key];
    if (v === 'hidden') continue;
    const label = FIELD_LABELS[key];
    if (v === 'visible' || unlocked.includes(key)) {
      fields.push({ key, label, locked: false, value: p.profile[key].display });
    } else {
      fields.push({ key, label, locked: true, cost: UNLOCK_COST[p.difficulty] });
    }
  }
  return {
    id: p.id,
    difficulty: p.difficulty,
    length: p.password.length,
    maxAttempts: MAX_ATTEMPTS,
    mixedCase: p.mixedCase,
    fields,
  };
};
