# eXploit

**Guess the password of a fictional person, using only their profile.**

eXploit is a daily puzzle game for Reddit, styled like an old black-and-white terminal. Every round shows the profile of a made-up person: first name, birth year, city, pet, hobby, favorite team, and so on. Somewhere in there is their password. You get **6 tries** to crack it.

The game has a serious side: it shows how easy it is to guess passwords built from personal information. After each daily puzzle, players get a short security tip on why that password was weak and what to do instead.

All people in the game are fictional. Names, cities, pets and hobbies are combined at random, and the teams are invented. The game never deals with real accounts or real personal data.

## How to play

1. Open the post and tap **START HACK**.
2. Choose **DAILY** (one puzzle per day, the same for everyone) or **ENDLESS** (one level after another, getting harder).
3. Read the target profile. The number of boxes shows how long the password is.
4. Type a guess with the on-screen keypad or your keyboard, then press **ENTER**.
5. Each character gets feedback, like Wordle but in black and white:
   - **white box**: right character in the right spot
   - **white outline**: the character is in the password, but somewhere else
   - **dark box**: the character is not in the password
6. Characters you have found are filled in automatically. You only type the empty boxes.
7. Some profile details are **locked**. Tap one twice to unlock it. This costs points, but you keep the same number of tries.

**Passwords** combine profile details in typical ways. Examples: pet name + birth year, name + birthday (MMDD), leetspeak (a=4, e=3, i=1, o=0, s=5), a reversed word, a city code (first 3 letters), initials, or a symbol from `! ? # @ . _`. Easy and medium passwords use capital letters only. Hard ones mix upper and lower case.

**Points**: easy 100, medium 200, hard 300. You get +25 for every try you don't use, minus the cost of unlocks.

**Daily**: a new puzzle every day at 00:00 UTC. Mondays and Tuesdays are easy, Wednesdays and Thursdays medium, Fridays to Sundays hard. Every player who solves it goes on the daily leaderboard. When you're done, you can choose to post your result grid as a comment. It shows only the boxes, no letters, so nothing is spoiled. It is posted only when you press the button.

**Endless**: difficulty goes up with each level. The same password pattern never comes back within 3 levels. If you fail a level, your run starts again at level 1. You get a security tip every 10 levels.

You need to be logged in to Reddit to play. Logged-out visitors can still see the start screen and the leaderboard.

## For moderators: setup

1. Install the app in your subreddit.
2. When the app is installed, it creates its first game post automatically. Moderators can make more from the subreddit menu with **Create eXploit post**.
3. A new **Daily eXploit** post is created automatically every day at 00:00 UTC.
4. Nothing else to configure. The daily puzzle works right away (see the secret below).

## Fair play and security

The game is built like a CTF target, because players will try to break it:

- Passwords are created and checked **on the server only**. The client gets the profile, the password length and the feedback. It never gets the answer (only after the round is over).
- Feedback, score, unlocks and the leaderboard are all calculated on the server. The client cannot submit a score.
- The daily puzzle comes from a **secret** combined with the date. The source code is public, but the secret is not, so nobody can work out future puzzles. The secret is the `dailySeed` app setting. If it is not set, the server creates a random secret once per installation and keeps it in Redis.
- Endless levels use a random seed created on the server for each level.
- Requests are locked per user, so sending parallel requests does not give extra tries.

## For developers

Tech: Devvit Web, Hono (server), vanilla TypeScript + Vite (client). No AI: puzzles come from fixed rules plus randomness.

```
src/server/game/     generator, feedback logic, sessions (server-only)
src/server/routes/   API (/api/...), scheduler, menu, triggers
src/shared/game.ts   types the client may see (no password fields)
src/client/          splash.html (start screen), index.html (game)
```

```
npm install
npm run test:unit          # unit tests
npm run gen                # print sample puzzles (shows passwords, dev only)
npm run gen -- --play      # play in the terminal
npm run dev                # playtest on Reddit
```

Optional: set the daily secret (once, after the first `devvit upload` or playtest). Without it, each subreddit gets its own random secret, so the daily puzzle differs between subreddits. With it, every subreddit gets the same daily puzzle:

```
openssl rand -hex 32           # generate a value
npx devvit settings set dailySeed
```

Never commit the secret. Changing it changes every daily puzzle, including today's.

## License

BSD-3-Clause, based on Reddit's Devvit template. See `LICENSE`.
