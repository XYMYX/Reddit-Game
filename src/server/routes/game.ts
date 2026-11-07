import { Hono, type Context } from 'hono';
import { context, reddit, redis } from '@devvit/web/server';
import type { ApiError, GameView, LeaderboardView, MenuView, ShareResponse } from '../../shared/game';
import {
  ConfigError,
  dailyDifficulty,
  dailySeed,
  leaderboardKey,
  loadDaily,
  loadEndless,
  newEndlessGame,
  NO_REPEAT_LEVELS,
  saveDaily,
  saveEndless,
  todayUtc,
  withLock,
  type EndlessState,
} from '../core/game-store.ts';
import {
  applyGuess,
  applyUnlock,
  buildView,
  newGame,
  puzzleOf,
  shareText,
  type Result,
  type StoredGame,
} from '../game/session.ts';

export const game = new Hono();

const fail = (c: Context, status: 400 | 401 | 409 | 429 | 500 | 503, error: string) =>
  c.json<ApiError>({ error }, status);

const readBody = async (c: Context): Promise<Record<string, unknown>> => {
  try {
    const body: unknown = await c.req.json();
    return typeof body === 'object' && body !== null ? { ...body } : {};
  } catch {
    return {};
  }
};

const handleError = (c: Context, err: unknown) => {
  if (err instanceof ConfigError) return fail(c, 503, err.message);
  console.error('game route error', err);
  return fail(c, 500, 'Server error');
};

// --- views

const dailyView = (date: string, g: StoredGame): GameView =>
  buildView(puzzleOf(g, date), g, { mode: 'daily', label: date, showLesson: true });

const endlessView = (s: EndlessState): GameView =>
  buildView(puzzleOf(s.game, `endless-${s.level}`), s.game, {
    mode: 'endless',
    label: `LEVEL ${s.level}`,
    showLesson: s.level % 10 === 0,
    level: s.level,
    runScore: s.runScore,
  });

const getDaily = async (date: string, userId: string): Promise<StoredGame> =>
  (await loadDaily(date, userId)) ?? newGame(await dailySeed(date), dailyDifficulty(date));

// --- menu

game.get('/menu', async (c) => {
  try {
    const { userId } = context;
    const date = todayUtc();
    const daily = userId ? await loadDaily(date, userId) : null;
    const endless = userId ? await loadEndless(userId) : null;
    return c.json<MenuView>({
      username: (await reddit.getCurrentUsername()) ?? null,
      date,
      daily: { status: daily?.status ?? 'new', score: daily?.score ?? null },
      endless: {
        level: endless?.level ?? 1,
        runScore: endless?.runScore ?? 0,
        bestLevel: endless?.bestLevel ?? 0,
      },
    });
  } catch (err) {
    return handleError(c, err);
  }
});

// --- daily

game.get('/daily', async (c) => {
  try {
    const { userId } = context;
    if (!userId) return fail(c, 401, 'Log in to play');
    const date = todayUtc();
    return c.json<GameView>(dailyView(date, await getDaily(date, userId)));
  } catch (err) {
    return handleError(c, err);
  }
});

const dailyAction = (action: 'guess' | 'unlock') => async (c: Context) => {
  try {
    const { userId } = context;
    if (!userId) return fail(c, 401, 'Log in to play');
    const body = await readBody(c);
    const date = todayUtc();

    const out = await withLock(`daily:${date}:${userId}`, async () => {
      const g = await getDaily(date, userId);
      const p = puzzleOf(g, date);
      const r: Result = action === 'guess' ? applyGuess(p, g, body.guess) : applyUnlock(p, g, body.key);
      if (!r.ok) return r;
      await saveDaily(date, userId, r.game);
      if (g.status === 'playing' && r.game.status === 'won' && r.game.score !== null) {
        const username = await reddit.getCurrentUsername();
        if (username) await redis.zAdd(leaderboardKey(date), { member: username, score: r.game.score });
      }
      return r;
    });
    if (out === 'busy') return fail(c, 429, 'Slow down');
    if (!out.ok) return fail(c, 400, out.error);
    return c.json<GameView>(dailyView(date, out.game));
  } catch (err) {
    return handleError(c, err);
  }
};

game.post('/daily/guess', dailyAction('guess'));
game.post('/daily/unlock', dailyAction('unlock'));

/**
 * Explicit user action (button): post the spoiler-free result grid as a comment
 * on the current post, from the user's account. Text is built on the server.
 */
game.post('/daily/share', async (c) => {
  try {
    const { userId, postId } = context;
    if (!userId) return fail(c, 401, 'Log in to play');
    if (!postId) return fail(c, 400, 'No post');
    const date = todayUtc();
    const out = await withLock(`share:${date}:${userId}`, async () => {
      const g = await loadDaily(date, userId);
      if (!g || g.status === 'playing') return 'Finish the daily first';
      const flag = `shared:${date}:${userId}`;
      if (await redis.get(flag)) return 'Already shared today';
      await reddit.submitComment({ id: postId, text: shareText(date, g), runAs: 'USER' });
      await redis.set(flag, '1', { expiration: new Date(Date.now() + 1000 * 60 * 60 * 48) });
      return null;
    });
    if (out === 'busy') return fail(c, 429, 'Slow down');
    if (out) return fail(c, 400, out);
    return c.json<ShareResponse>({ ok: true });
  } catch (err) {
    return handleError(c, err);
  }
});

game.get('/daily/leaderboard', async (c) => {
  try {
    const date = todayUtc();
    const key = leaderboardKey(date);
    const rows = await redis.zRange(key, 0, 9, { by: 'rank', reverse: true });
    const total = await redis.zCard(key);
    const username = await reddit.getCurrentUsername();

    let me: LeaderboardView['me'] = null;
    if (username) {
      const asc = await redis.zRank(key, username);
      const score = await redis.zScore(key, username);
      if (asc !== undefined && score !== undefined) me = { rank: total - asc, username, score };
    }
    return c.json<LeaderboardView>({
      date,
      top: rows.map((r, i) => ({ rank: i + 1, username: r.member, score: r.score })),
      me,
      total,
    });
  } catch (err) {
    return handleError(c, err);
  }
});

// --- endless

game.get('/endless', async (c) => {
  try {
    const { userId } = context;
    if (!userId) return fail(c, 401, 'Log in to play');
    const s = await loadEndless(userId);
    await saveEndless(userId, s); // persist a freshly created run
    return c.json<GameView>(endlessView(s));
  } catch (err) {
    return handleError(c, err);
  }
});

const endlessAction = (action: 'guess' | 'unlock') => async (c: Context) => {
  try {
    const { userId } = context;
    if (!userId) return fail(c, 401, 'Log in to play');
    const body = await readBody(c);

    const out = await withLock(`endless:${userId}`, async () => {
      const s = await loadEndless(userId);
      const p = puzzleOf(s.game, `endless-${s.level}`);
      const r = action === 'guess' ? applyGuess(p, s.game, body.guess) : applyUnlock(p, s.game, body.key);
      if (!r.ok) return r;
      const won = s.game.status === 'playing' && r.game.status === 'won';
      const next: EndlessState = {
        ...s,
        game: r.game,
        runScore: s.runScore + (won ? (r.game.score ?? 0) : 0),
        bestLevel: won ? Math.max(s.bestLevel, s.level) : s.bestLevel,
      };
      await saveEndless(userId, next);
      return { ok: true as const, state: next };
    });
    if (out === 'busy') return fail(c, 429, 'Slow down');
    if (!out.ok) return fail(c, 400, out.error);
    return c.json<GameView>(endlessView(out.state));
  } catch (err) {
    return handleError(c, err);
  }
};

game.post('/endless/guess', endlessAction('guess'));
game.post('/endless/unlock', endlessAction('unlock'));

/** After a win: next level. After a loss: new run from level 1. */
game.post('/endless/next', async (c) => {
  try {
    const { userId } = context;
    if (!userId) return fail(c, 401, 'Log in to play');
    const out = await withLock(`endless:${userId}`, async () => {
      const s = await loadEndless(userId);
      if (s.game.status === 'playing') return null;
      const finished = puzzleOf(s.game, `endless-${s.level}`).patternId;
      const recent = [...(s.recent ?? []), finished].slice(-NO_REPEAT_LEVELS);
      const next: EndlessState =
        s.game.status === 'won'
          ? { ...s, level: s.level + 1, recent, game: newEndlessGame(s.level + 1, recent) }
          : { level: 1, runScore: 0, bestLevel: s.bestLevel, recent, game: newEndlessGame(1, recent) };
      await saveEndless(userId, next);
      return next;
    });
    if (out === 'busy') return fail(c, 429, 'Slow down');
    if (!out) return fail(c, 409, 'Level is not finished');
    return c.json<GameView>(endlessView(out));
  } catch (err) {
    return handleError(c, err);
  }
});
