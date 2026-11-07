// eXploit client. Shows only what the server sends; all checks happen on the server.
// All server/user text is set via textContent (never innerHTML) -> no XSS via usernames.

import type {
  ApiError,
  GameMode,
  GameView,
  LeaderboardView,
  Mark,
  MenuView,
  ProfileKey,
  ShareResponse,
} from '../shared/game';

const root = document.getElementById('app');
if (!root) throw new Error('#app missing');
const app: HTMLElement = root;

// ---------------------------------------------------------------------------
// tiny DOM helper

type Child = Node | string | null | false | undefined;
type Props = {
  class?: string;
  onclick?: () => void;
  disabled?: boolean;
};

const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.onclick) el.addEventListener('click', props.onclick);
  if (props.disabled && el instanceof HTMLButtonElement) el.disabled = true;
  for (const c of children) {
    if (c === null || c === false || c === undefined) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
};

const show = (...nodes: Child[]) => {
  app.replaceChildren(...nodes.filter((n): n is Node | string => !!n));
};

// ---------------------------------------------------------------------------
// API

const api = async <T>(path: string, body?: unknown): Promise<T> => {
  const res = await fetch(`/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) {
    const err: Partial<ApiError> = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Error ${res.status}`);
  }
  return res.json();
};

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

// ---------------------------------------------------------------------------
// state

let view: GameView | null = null;
let typed: string[] = [];
let cursor = -1;
let shift = false;
let busy = false;
let pendingUnlock: ProfileKey | null = null;
let message = '';
let shared = false;

const isFixed = (i: number) => view?.progress.mask[i] != null;

const nextEmpty = (from: number): number => {
  const n = typed.length;
  for (let k = 0; k < n; k++) {
    const i = (from + k) % n;
    if (!isFixed(i) && typed[i] === '') return i;
  }
  return -1;
};

const resetInput = () => {
  const n = view?.puzzle.length ?? 0;
  typed = Array.from({ length: n }, () => '');
  cursor = nextEmpty(0);
};

const setView = (v: GameView) => {
  view = v;
  pendingUnlock = null;
  resetInput();
};

// ---------------------------------------------------------------------------
// input handling

const typeChar = (ch: string) => {
  if (!view || view.status !== 'playing' || cursor < 0) return;
  typed[cursor] = view.puzzle.mixedCase ? ch : ch.toUpperCase();
  cursor = nextEmpty(cursor + 1);
  message = '';
  renderGame();
};

const backspace = () => {
  if (!view || view.status !== 'playing') return;
  if (cursor >= 0 && typed[cursor] !== '') {
    typed[cursor] = '';
  } else {
    const start = cursor < 0 ? typed.length - 1 : cursor - 1;
    for (let i = start; i >= 0; i--) {
      if (!isFixed(i) && typed[i] !== '') {
        typed[i] = '';
        cursor = i;
        break;
      }
    }
  }
  renderGame();
};

const currentGuess = (): string | null => {
  if (!view) return null;
  const chars = view.progress.mask.map((m, i) => m ?? typed[i] ?? '');
  return chars.every((c) => c !== '') ? chars.join('') : null;
};

const submit = async () => {
  if (!view || busy || view.status !== 'playing') return;
  const guess = currentGuess();
  if (!guess) {
    message = 'Fill all empty fields first';
    renderGame();
    return;
  }
  busy = true;
  try {
    setView(await api<GameView>(`${view.mode}/guess`, { guess }));
    message = '';
  } catch (e) {
    message = errText(e);
  }
  busy = false;
  renderGame();
};

const unlock = async (key: ProfileKey) => {
  if (!view || busy) return;
  if (pendingUnlock !== key) {
    pendingUnlock = key; // first tap: ask, second tap: confirm
    renderGame();
    return;
  }
  busy = true;
  const keepTyped = typed;
  try {
    const v = await api<GameView>(`${view.mode}/unlock`, { key });
    setView(v);
    typed = keepTyped;
    cursor = nextEmpty(0);
  } catch (e) {
    message = errText(e);
  }
  busy = false;
  renderGame();
};

window.addEventListener('keydown', (e) => {
  if (!view || app.dataset.screen !== 'game' || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'Enter') void submit();
  else if (e.key === 'Backspace') backspace();
  else if (/^[A-Za-z0-9!?#@._]$/.test(e.key)) typeChar(e.key);
  else return;
  e.preventDefault();
});

// ---------------------------------------------------------------------------
// game screen

const LABEL: Record<GameMode, string> = { daily: 'DAILY', endless: 'ENDLESS' };

const cell = (ch: string, mark?: Mark, extra = '') =>
  h('span', { class: `cell ${mark ?? ''} ${extra}` }, ch);

const keyStates = (v: GameView): Map<string, Mark> => {
  const rank: Record<Mark, number> = { absent: 1, present: 2, correct: 3 };
  const out = new Map<string, Mark>();
  for (const g of v.guesses) {
    g.marks.forEach((m, i) => {
      const ch = g.guess[i] ?? '';
      const prev = out.get(ch);
      if (!prev || rank[m] > rank[prev]) out.set(ch, m);
    });
  }
  return out;
};

const renderProfile = (v: GameView) =>
  h(
    'section',
    { class: 'profile' },
    ...v.puzzle.fields.map((f) =>
      h(
        'div',
        { class: 'field' },
        h('span', { class: 'k' }, f.label),
        f.locked
          ? h(
              'button',
              {
                class: pendingUnlock === f.key ? 'confirm' : '',
                disabled: v.status !== 'playing',
                onclick: () => void unlock(f.key),
              },
              pendingUnlock === f.key ? `unlock? -${f.cost}` : `[locked] -${f.cost}`
            )
          : h('span', { class: 'v' }, f.value)
      )
    )
  );

const renderStatus = (v: GameView) =>
  h(
    'section',
    { class: 'status' },
    h('div', { class: 'mask' }, v.progress.mask.map((c) => c ?? '_').join(' ')),
    h('div', {}, h('span', { class: 'dim' }, 'in it, spot unclear: '), v.progress.present.join(' ') || '-'),
    h('div', {}, h('span', { class: 'dim' }, 'not in it: '), v.progress.excluded.join(' ') || '-')
  );

const renderHistory = (v: GameView) =>
  h(
    'section',
    { class: 'history' },
    v.guesses.length === 0 &&
      h('p', { class: 'hint dim' }, 'Use the profile. Type the password and press ENTER.'),
    ...v.guesses.map((g) => h('div', { class: 'row' }, ...[...g.guess].map((ch, i) => cell(ch, g.marks[i]))))
  );

const renderInput = (v: GameView) => {
  const row = h(
    'div',
    { class: 'row' },
    ...v.progress.mask.map((fixed, i) => {
      if (fixed !== null) return cell(fixed, undefined, 'fixed');
      const el = cell(typed[i] ?? '', undefined, i === cursor ? 'cursor' : '');
      el.addEventListener('click', () => {
        cursor = i;
        renderGame();
      });
      return el;
    })
  );
  const wrap = h('section', { class: 'input' }, row);
  wrap.style.setProperty('--n', String(v.puzzle.length));
  return wrap;
};

const renderKeys = (v: GameView) => {
  const states = keyStates(v);
  const letters = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  const upper = !v.puzzle.mixedCase || shift;
  const key = (ch: string) =>
    h('button', { class: states.get(ch) ?? '', onclick: () => typeChar(ch) }, ch);
  const wide = (label: string, onclick: () => void, cls = '') =>
    h('button', { class: `wide ${cls}`, onclick }, label);

  const rows = letters.map((r) => [...(upper ? r.toUpperCase() : r)].map(key));
  if (v.puzzle.mixedCase) {
    rows[2]?.unshift(wide('SHIFT', () => ((shift = !shift), renderGame()), shift ? 'on' : ''));
  }
  rows[2]?.push(wide('DEL', backspace));
  return h(
    'section',
    { class: 'keys' },
    h('div', { class: 'krow' }, ...[...'1234567890'].map(key)),
    ...rows.map((r) => h('div', { class: 'krow' }, ...r)),
    h('div', { class: 'krow' }, ...[...'!?#@._'].map(key), wide(busy ? '...' : 'ENTER', () => void submit()))
  );
};

const share = async () => {
  if (busy || shared) return;
  busy = true;
  try {
    await api<ShareResponse>('daily/share', {});
    shared = true;
    message = 'Result posted as a comment.';
  } catch (e) {
    message = errText(e);
  }
  busy = false;
  renderGame();
};

const renderResult = (v: GameView) => {
  const won = v.status === 'won';
  const btns: HTMLElement[] = [];
  if (v.mode === 'daily') {
    btns.push(h('button', { onclick: () => void openLeaderboard() }, 'LEADERBOARD'));
  } else {
    btns.push(h('button', { onclick: () => void nextLevel() }, won ? 'NEXT LEVEL' : 'NEW RUN'));
  }
  btns.push(h('button', { onclick: () => void openMenu() }, 'MENU'));

  return h(
    'section',
    { class: 'result' },
    h('h2', {}, won ? 'ACCESS GRANTED' : 'ACCESS DENIED'),
    v.reveal && h('div', {}, h('span', { class: 'dim' }, 'password: '), h('span', { class: 'pw' }, v.reveal.password)),
    h('div', {}, won ? `+${v.score ?? 0} pts` : 'no points', v.runScore !== null ? ` · run: ${v.runScore}` : ''),
    v.reveal && h('div', { class: 'dim' }, `pattern: ${v.reveal.recipe}`),
    v.reveal?.lesson && h('p', { class: 'lesson' }, '> SECURITY TIP: ', v.reveal.lesson),
    h('div', { class: 'btns' }, ...btns),
    v.mode === 'daily' &&
      h(
        'div',
        { class: 'share' },
        h('button', { disabled: shared || busy, onclick: () => void share() }, shared ? 'SHARED' : 'COMMENT MY RESULT'),
        h('span', { class: 'dim' }, 'posts your grid (no spoilers) from your account')
      )
  );
};

const renderGame = () => {
  const v = view;
  if (!v) return;
  app.dataset.screen = 'game';
  const playing = v.status === 'playing';
  show(
    h(
      'header',
      { class: 'top' },
      h('button', { onclick: () => void openMenu() }, '<'),
      h('span', { class: 'title' }, `${LABEL[v.mode]} ${v.label}`, h('span', { class: 'dim' }, ` ${v.puzzle.difficulty}`)),
      h('span', {}, `${v.attemptsLeft}/${v.puzzle.maxAttempts}`, h('span', { class: 'dim' }, ' tries'))
    ),
    h('div', { class: 'sec' }, `TARGET PROFILE${v.penalty ? ` · penalty -${v.penalty}` : ''}`),
    renderProfile(v),
    renderStatus(v),
    renderHistory(v),
    playing && renderInput(v),
    h('p', { class: 'msg' }, message),
    playing ? renderKeys(v) : renderResult(v)
  );
};

// ---------------------------------------------------------------------------
// screens

const loading = (text: string) => {
  app.dataset.screen = 'loading';
  show(h('p', { class: 'loading' }, `> ${text}_`));
};

const startGame = async (mode: GameMode) => {
  loading('connecting');
  try {
    setView(await api<GameView>(mode));
    message = '';
    renderGame();
  } catch (e) {
    void openMenu(errText(e));
  }
};

const nextLevel = async () => {
  loading('loading next target');
  try {
    setView(await api<GameView>('endless/next', {}));
    message = '';
    renderGame();
  } catch (e) {
    void openMenu(errText(e));
  }
};

const openLeaderboard = async () => {
  loading('loading');
  try {
    const lb = await api<LeaderboardView>('daily/leaderboard');
    app.dataset.screen = 'leaderboard';
    const line = (r: LeaderboardView['top'][number], me: boolean) =>
      h('div', { class: `line ${me ? 'me' : ''}` }, h('span', {}, `#${r.rank}`), h('span', { class: 'n' }, r.username), h('span', {}, String(r.score)));
    show(
      h('header', { class: 'top' }, h('button', { onclick: () => void openMenu() }, '<'), h('span', { class: 'title' }, `LEADERBOARD ${lb.date}`)),
      h(
        'section',
        { class: 'board' },
        lb.top.length === 0 && h('p', { class: 'dim hint' }, 'Nobody cracked today\'s password yet.'),
        ...lb.top.map((r) => line(r, r.username === lb.me?.username)),
        lb.me && lb.me.rank > lb.top.length && line(lb.me, true),
        h('p', { class: 'dim hint' }, `${lb.total} hacker${lb.total === 1 ? '' : 's'} today`)
      )
    );
  } catch (e) {
    void openMenu(errText(e));
  }
};

const openMenu = async (error = '') => {
  view = null;
  loading('connecting');
  let m: MenuView | null = null;
  try {
    m = await api<MenuView>('menu');
  } catch (e) {
    error ||= errText(e);
  }
  app.dataset.screen = 'menu';
  const loggedIn = !!m?.username;
  const d = m?.daily;
  const dailySub = !d || d.status === 'new' ? 'one target per day, same for everyone' : d.status === 'playing' ? 'in progress' : d.status === 'won' ? `cracked · +${d.score ?? 0} pts` : 'failed · see you tomorrow';
  const e = m?.endless;

  show(
    h(
      'section',
      { class: 'menu' },
      h('div', { class: 'logo' }, 'e', h('b', {}, 'X'), 'ploit'),
      h('p', { class: 'dim' }, '> guess the password of a fictional person'),
      h(
        'div',
        { class: 'legend' },
        h('span', {}, cell('A', 'correct'), 'right spot'),
        h('span', {}, cell('B', 'present'), 'wrong spot'),
        h('span', {}, cell('C', 'absent'), 'not in it')
      ),
      h('button', { class: 'big', disabled: !loggedIn, onclick: () => void startGame('daily') }, `DAILY ${m?.date ?? ''}`, h('small', {}, dailySub)),
      h('button', { class: 'big', disabled: !loggedIn, onclick: () => void startGame('endless') }, 'ENDLESS', h('small', {}, e ? `level ${e.level} · run ${e.runScore} pts · best level ${e.bestLevel}` : 'rising difficulty')),
      h('button', { class: 'big', onclick: () => void openLeaderboard() }, 'LEADERBOARD', h('small', {}, 'daily top 10')),
      !loggedIn && m && h('p', { class: 'msg' }, 'Log in to Reddit to play.'),
      error && h('p', { class: 'msg' }, `! ${error}`)
    )
  );
};

void openMenu();
