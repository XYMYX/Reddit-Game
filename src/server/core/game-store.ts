// Redis persistence + seeds. The password is never stored; it is regenerated from the seed.

import { createHmac, randomUUID } from 'node:crypto';
import { redis, settings } from '@devvit/web/server';
import type { Difficulty } from '../../shared/game';
import { difficultyForLevel } from '../game/generator.ts';
import { createRng } from '../game/rng.ts';
import { newGame, type StoredGame } from '../game/session.ts';

export class ConfigError extends Error {}

/** UTC date, YYYY-MM-DD. Same daily puzzle for everyone worldwide. */
export const todayUtc = (): string => new Date().toISOString().slice(0, 10);

/** Mon/Tue easy, Wed/Thu medium, Fri-Sun hard. */
export const dailyDifficulty = (date: string): Difficulty => {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  if (day === 1 || day === 2) return 'easy';
  if (day === 3 || day === 4) return 'medium';
  return 'hard';
};

/** Daily seed = HMAC(secret app setting, date). Without the secret nobody can precompute it. */
export const dailySeed = async (date: string): Promise<string> => {
  const secret = await settings.get<string>('dailySeed');
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new ConfigError('Daily puzzle is not configured yet');
  }
  return createHmac('sha256', secret).update(`daily|${date}`).digest('hex');
};

// --- daily

const dailyKey = (date: string, userId: string) => `daily:${date}:${userId}`;
export const leaderboardKey = (date: string) => `lb:daily:${date}`;

export const loadDaily = async (date: string, userId: string): Promise<StoredGame | null> => {
  const raw = await redis.get(dailyKey(date, userId));
  return raw ? JSON.parse(raw) : null;
};

export const saveDaily = async (date: string, userId: string, g: StoredGame): Promise<void> => {
  await redis.set(dailyKey(date, userId), JSON.stringify(g), {
    expiration: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
  });
};

// --- endless

export type EndlessState = {
  level: number;
  runScore: number;
  bestLevel: number;
  game: StoredGame;
  /** Pattern ids of the last levels; they are not repeated. */
  recent?: string[];
};

/** A pattern may only come back after at least this many other levels. */
export const NO_REPEAT_LEVELS = 3;

const endlessKey = (userId: string) => `endless:${userId}`;

/** Random, server-only seed: the client can never predict an endless level. */
export const newEndlessGame = (level: number, recent: string[] = []): StoredGame => {
  const seed = randomUUID();
  return newGame(seed, difficultyForLevel(level, createRng(`${seed}|difficulty`)), recent);
};

export const loadEndless = async (userId: string): Promise<EndlessState> => {
  const raw = await redis.get(endlessKey(userId));
  if (raw) return JSON.parse(raw);
  return { level: 1, runScore: 0, bestLevel: 0, game: newEndlessGame(1) };
};

export const saveEndless = async (userId: string, s: EndlessState): Promise<void> => {
  await redis.set(endlessKey(userId), JSON.stringify(s));
};

// --- lock against parallel requests (e.g. double-submit to get extra attempts)

export const withLock = async <T>(name: string, fn: () => Promise<T>): Promise<T | 'busy'> => {
  const key = `lock:${name}`;
  const n = await redis.incrBy(key, 1);
  if (n > 1) return 'busy';
  await redis.expire(key, 10);
  try {
    return await fn();
  } finally {
    await redis.del(key);
  }
};
