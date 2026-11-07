// Terminal test tool for the generator and game logic. Not part of the app bundle.
//
//   npm run gen                          -> 3 puzzles per difficulty
//   npm run gen -- --difficulty hard --count 5 --seed test
//   npm run gen -- --play --difficulty medium
//
// Output shows the password, so this is a dev tool only.

import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import type { Difficulty, GuessResult, Mark, ProfileKey } from '../../shared/game';
import { FIELD_ORDER, generatePuzzle, isSolvable, MAX_ATTEMPTS, toPublicPuzzle, type Puzzle } from './generator.ts';
import { deriveProgress, evaluateGuess, isSolved, normalizeGuess, validateGuess } from './logic.ts';

const { values } = parseArgs({
  options: {
    difficulty: { type: 'string', default: 'all' },
    count: { type: 'string', default: '3' },
    seed: { type: 'string', default: String(Date.now()) },
    play: { type: 'boolean', default: false },
  },
});

const DIFFS: Difficulty[] = ['easy', 'medium', 'hard'];
const isDifficulty = (s: string): s is Difficulty => DIFFS.some((d) => d === s);
const diffs = values.difficulty === 'all' ? DIFFS : isDifficulty(values.difficulty) ? [values.difficulty] : [];
if (diffs.length === 0) {
  console.error('--difficulty must be easy, medium, hard or all');
  process.exit(1);
}

const TAG = { visible: '   ', locked: '[L]', hidden: '[-]' } as const;

const printPuzzle = (p: Puzzle) => {
  console.log(`\n=== ${p.id}  (${p.difficulty})  ${isSolvable(p) ? 'OK' : '!! UNSOLVABLE'}`);
  for (const k of FIELD_ORDER) {
    const used = p.usedFields.includes(k) ? '*' : ' ';
    console.log(`  ${TAG[p.visibility[k]]} ${used} ${k.padEnd(10)} ${p.profile[k].display}`);
  }
  console.log(`  password: ${p.password}  (${p.password.length})  pattern: ${p.recipe}`);
};

/** Black/white terminal rendering: [X] correct, (X) present, ' x ' absent. */
const renderMarks = (guess: string, marks: Mark[]) =>
  marks.map((m, i) => (m === 'correct' ? `[${guess[i]}]` : m === 'present' ? `(${guess[i]})` : ` ${guess[i]} `)).join('');

const play = async (p: Puzzle) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const unlocked: ProfileKey[] = [];
  const results: GuessResult[] = [];
  let penalty = 0;

  while (results.length < MAX_ATTEMPTS) {
    const pub = toPublicPuzzle(p, unlocked);
    console.log('\n--- profile');
    for (const fld of pub.fields) {
      console.log(`  ${fld.label.padEnd(14)} ${fld.locked ? `[locked: unlock ${fld.key} -${fld.cost}]` : fld.value}`);
    }
    const prog = deriveProgress(pub.length, results);
    console.log(`\n  ${prog.mask.map((c) => c ?? '_').join(' ')}`);
    console.log(`  in password, position unclear: ${prog.present.join(' ') || '-'}`);
    console.log(`  not in password: ${prog.excluded.join(' ') || '-'}`);
    results.forEach((r) => console.log(`  ${renderMarks(r.guess, r.marks)}`));

    const input = (await rl.question(`\nattempt ${results.length + 1}/${MAX_ATTEMPTS} > `)).trim();
    const unlock = /^unlock (\w+)$/.exec(input);
    if (unlock) {
      const fld = pub.fields.find((x) => x.key === unlock[1]);
      if (fld?.locked) {
        unlocked.push(fld.key);
        penalty += fld.cost;
      } else console.log('  nothing to unlock with that name');
      continue;
    }
    const guess = normalizeGuess(input, p.mixedCase);
    const err = validateGuess(guess, pub.length, p.mixedCase);
    if (err) {
      console.log(`  ${err}`);
      continue;
    }
    const marks = evaluateGuess(p.password, guess);
    results.push({ guess, marks });
    if (isSolved(marks)) {
      console.log(`\n  ACCESS GRANTED in ${results.length} attempts (unlock penalty -${penalty})`);
      console.log(`  ${p.recipe}: ${p.lesson}`);
      rl.close();
      return;
    }
  }
  console.log(`\n  ACCESS DENIED. Password was: ${p.password}\n  ${p.lesson}`);
  rl.close();
};

const count = Math.max(1, Number(values.count) || 1);
if (values.play) {
  const d = diffs[Math.floor(Math.random() * diffs.length)] ?? 'easy';
  await play(generatePuzzle(values.seed, d));
} else {
  for (const d of diffs) {
    for (let i = 0; i < count; i++) printPuzzle(generatePuzzle(`${values.seed}:${d}:${i}`, d));
  }
}
