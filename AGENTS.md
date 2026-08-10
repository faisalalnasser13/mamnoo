# AGENTS.md

Instructions for AI coding agents working on this repo. Read this before
changing anything.

*(This file is the single source of truth. If you create `.cursorrules` or
`.cursor/rules/*.mdc`, point them here.)*

---

## What this is

**ممنوع** — an Arabic online adaptation of Taboo, phone-first. Two teams
of 1–6. Each turn one player describes a word while the opposing team's
judge watches for the five forbidden words. Everyone is on their own
phone; the talking happens on a voice call the app knows nothing about.

Stack: React 18 + Vite + TypeScript + Tailwind, Firebase (Firestore +
anonymous Auth + Hosting). **No backend.** The game engine runs in the
browser.

Sibling project: **تشفير** (Decrypto). Same stack, same constraints, and
most of the plumbing here was lifted from it deliberately — `run.mjs`,
the Firestore stub, `arabic.ts`, `version.ts`. If you're fixing something
structural, check whether تشفير already solved it.

---

## Hard constraints — do not violate without asking the user

### 1. No Cloud Functions. Ever.

This project deliberately has no server. Cloud Functions require the
Blaze plan, which requires a credit card; the user chose to stay on the
free Spark plan.

**Do not** suggest, scaffold, or add a `functions/` directory. If
something seems to need a server, it doesn't — read `src/lib/engine.ts`
to see how it's done in a transaction instead.

### 2. Every state change is a Firestore transaction with an idempotency guard

Six phones race to end the same turn. Without the guard, the turn scores
twice. The pattern in `advancePhase`:

```ts
if (fromPhase && (room.phase !== fromPhase || room.turnIndex !== fromTurn)) return;
```

The caller says what it thinks it's advancing *from*. If someone already
advanced, this is a no-op.

Card actions use the same idea with a different key: `resolve` and `buzz`
take `fromCardId` and bail when `room.round.cardId` has moved on, which
is what makes a double-tap on صح harmless.

**Never remove these.** Never replace a transaction with a plain
`updateDoc` in the phase machine.

### 3. Reads before writes inside a transaction

Firestore rejects a `tx.get()` that happens after any `tx.set()` /
`tx.update()`. The stub in `test/sim/stubs/firestore.cjs` enforces the
same rule, and `test/sim/negative.cjs` proves the detector actually
fires — so "the sim passed" means something.

If you add a transaction, gather **all** reads first, then write.

### 4. The live card is sealed at the database layer

This is the one place ممنوع is stricter than تشفير, and the difference is
not stylistic.

In تشفير, a player who opens devtools mid-round can read the opponent's
code. That's cheating at the margins and the rules let it go. Here,
seeing the card **is** the game — a guesser who reads it has nothing left
to play. So `rooms/{id}/secret/card` is readable only by
`turn.clueGiverUid` and `turn.judgeUid`, and **created/updated** only by
the clue-giver. Any room member may **delete** it — clearing a spent card
is not a leak (the word is already in the public log), and the judge,
host, and clock backstops all need to delete it inside the transaction
that ends the turn.

Consequences you must preserve:

- `useCard` only opens the listener when the local player holds one of
  those two roles. Don't "simplify" it into an always-on subscription —
  guessers would spray permission errors into the console.
- The clue-giver is the only creator, so there is exactly one dealer.
- Never put the current card's word on the room document. `round.log`
  only ever receives a word **after** the card has left play.

### 5. Digits are always 0–9

Arabic-Indic numerals (٠١٢٣٤) were explicitly rejected by the user, as in
تشفير. There is no setting. Don't reintroduce one.

### 6. RTL is done with logical properties, not flips

Use `ms-`/`me-`/`ps-`/`pe-`, `inset-inline`, `text-start`/`text-end`.
Never `ml-`/`mr-`/`left`/`right`, never `flex-row-reverse`.

### 7. `src/lib/rules.ts` has zero Firebase imports

That's what makes the 300-game simulator possible. It also means
`types.ts` is **declaration-only** — `TEAMS` and `OTHER` live in
`rules.ts` precisely so `import type` erases completely and `rules.ts`
compiles to a module with no imports at all. If you add a runtime
constant to `types.ts`, the simulator stops loading.

### 8. Don't "fix" the trust model

The clue-giver taps صح for their own team. Any of them could tap it
without earning it. **This is intentional**, the same call the user made
in تشفير: this is a game among friends on a voice call, and the social
cost of cheating is doing it in front of five people who can hear you.

Do not move scoring to the judge, add confirmation steps, or
server-verify anything.

---

## Deploying

```bash
npm install
cp .env.example .env          # user fills in six VITE_FB_* values

firebase login
firebase use --add            # pick the project

firebase deploy --only firestore:rules
npm run build
firebase deploy --only hosting
```

**Prerequisites the user must do in the console (you cannot):**

1. **Authentication → Sign-in method → Anonymous → enable.** Without
   this the app shows "ما قدرنا نتصل" and nothing else works. This is the
   single most common setup failure.
2. **Firestore Database → Create** (production mode). The region choice
   is permanent.

Full walkthrough in `SETUP.md`.

---

## Testing

```bash
npm test              # everything below, ~5s
npm run test:units    # pure rules and deck invariants
npm run test:negative # proves the read-after-write detector fires
npm run test:sim      # 300 simulated games through the real engine
npm run test:ui       # renders every screen for every role
```

`test/sim/run.mjs` compiles `src/lib/{engine,rules,arabic,deck}.ts` to
CommonJS against a stubbed Firebase web SDK, then runs the harness. No
emulator, no network.

The simulator drives six independent "phones" that race on purpose:
duplicate `ensureCard` calls, double-buzzes, double-taps on صح, every
phone firing `advancePhase` at the deadline, a non-host trying to advance
the recap. It asserts, among other things, that the sealed card never
outlives its turn, no turn index repeats, the judge is never on the
describer's team, and a correct card scores 1 or 2 — never 0, never 3.

**Run `npm test` after any change to `engine.ts`, `rules.ts` or
`deck.ts`.** Run it after touching any screen too — `test:ui` is what
catches a component that throws.

### Why the render smoke test exists

The simulator proves the *engine* is correct. Nothing proved the
*screens* could survive the data the engine produces, and that gap
shipped a real bug: a room document written before `round.log` existed
returned `undefined`, `Feed` called `.length` on it, and that player's
tab white-screened. When it hit the describer's tab it took the whole
table down with it — the describer's device is the only one that deals a
card, so the turn could never start and everyone else sat on
"بانتظار البطاقة" forever.

`test/ui/run.mjs` renders every screen for every role across 138
combinations, deliberately including **rooms missing fields that a later
deploy added**. That's the realistic case: old documents stay in the
database and do not grow new fields.

Two defences came out of it, and both must stay:

1. `normalizeRoom` / `normalizeRound` in `hooks.ts`, and `asRoom` in
   `engine.ts`. Every document read passes through one of these. Guard at
   the boundary, not at each read site — the next field you add will be
   missing from old documents too.
2. `ErrorBoundary` in `App.tsx`. A blank screen is the worst possible
   failure for a party game: nobody can tell whether it's the app or
   their connection. Never remove it.

### The deck is tested, not just typed

`rules.mjs` asserts every card has five distinct taboo words. The deck is
built straight from `taboo_deck.json` via `scripts/build-deck.mjs`.

---

## Layout of the code

```
src/lib/rules.ts      pure logic: turn order, scoring, heat, end, stats. No Firebase.
src/lib/engine.ts     every state transition, as a guarded transaction
src/lib/hooks.ts      live subscriptions, countdown, phase/buzz/deal drivers
src/lib/deck.ts       ~994 cards (from taboo_deck.json) + 50 room-name words
src/lib/arabic.ts     normalisation (from تشفير)
src/screens/          Home + Lobby, and phases.tsx for everything in-game
src/components/       ui.tsx (primitives), game.tsx (card/HUD/heat/feed), Wall.tsx
firestore.rules       what's still enforced at the database layer
```

---

## The phase machine

```
lobby ──ابدأ اللعب (host)──▶ transition ──ابدأ الجولة (host)──▶ live
                                  ▲                              │
                                  │                   time up, card still in play
                                  │                              ▼
                             recap ◀──────────────────────────  steal
                                  │
                        21 points or all turns ──▶ over
```

**Who owns each transition.** Without a server this must be decided
explicitly or clients fight:

| Transition | Owner |
|---|---|
| start game, start turn, تمام, rematch | host, on a tap |
| live → steal, steal → recap | clue-giver's device on the clock; everyone else 2s later as a backstop |
| buzz mark → the actual −1 | clue-giver's device after `BUZZ_HOLD_MS`; judge as fallback |
| dealing the next card | clue-giver only (they're the only permitted writer) |

The timer is **never written during a turn**. Only `phaseEndsAt` is,
once, at turn start. A 60-second round costs one write, not sixty.

---

## Things that will look like bugs but aren't

| Looks wrong | Why it's right |
|---|---|
| The judge is on the *other* team | That's the design. It's what keeps the non-active team listening instead of checking their phone |
| The same judge decides the steal | They're the one already holding the card. Giving it to a third role adds a screen and saves nothing |
| A skip costs −0.5 and is unlimited | Correct. It also kills the streak; only the last 10s lock it |
| The third correct and every one after are worth 2 | Heat stays on until skip/buzz. A 6-streak scores 1,1,2,2,2,2 — pips keep growing past three |
| The idle team's screen leads with the steal, not the score | Those players have no button for a whole minute. Framing the wait as preparation is the only thing that makes listening rational rather than polite |
| Guessers get a full-screen "ممنوع!" | The judge and describer both get a stamped card. Without this branch the rest of the table saw *nothing* for 900ms, then a quiet line in a list — the loudest moment in the game, invisible to most of the room |
| Skip is disabled in the last 10 seconds | `SKIP_LOCKOUT_MS`. Without it the steal is trivially defused: with seconds left the describer skips, burning the card the opponents were listening to and dealing one they've heard nothing about. Enforced in `resolve()`, not just by greying the button |
| A steal sometimes doesn't happen when time expires mid-card | `STEAL_MIN_CLUE_MS`. A card dealt 2 seconds before the buzzer was never described, so guessing it is a coin flip. Below the threshold the turn just ends |
| The idle team's panel changes colour at 0:10 | That's the skip lockout. The card on the table is now the one they'll get to steal, which turns a dead minute into a countdown worth watching |
| «أطول كلمة» instead of «الكلمة المستحيلة» | The old stat counted words that fell more than once — impossible, since no word repeats inside a game. It was always null. Time-on-table is the thing players actually remember |
| No tatweel (ـ) anywhere in the UI | It renders as a visible gap in Tajawal. Write «بفارق 3», never «بـ 3» |
| The stamp is centred with `inset-inline: 0` + `margin-inline: auto` | Not `inset-inline-start: 50%` + `translateX(-50%)`: `translate` is physical, so under RTL that pair throws the stamp off the card |
| End stats include hottest streak | Consecutive صح inside one turn — not total cards. "Fastest guess" stayed cut: gaps between log timestamps are arithmetic nobody at the table can verify |
| `wipeSubcollections` iterates `.docs`, not `forEach` | Both exist on a real QuerySnapshot, but `.docs` is a plain array and can't be missing. A silent `catch` around `forEach` once hid a broken wipe, which let a reused room name carry the previous game's records into the next game's final screen. Don't reintroduce the swallow |
| The backdrop is a dot grid, not the "wall of words" | The wall was readable Arabic, and on a phone the eye keeps trying to read anything legible. It was competing with the card for exactly the attention the card needs |
| The host can end a turn mid-play | `hostControl({ action: "skipTurn" })`. It's the only way out of a turn whose describer dropped off: the card is dealt by their device, and a round with no card can't be ended by the clock either |
| Pausing banks the remaining time | `pausedLeft`. Resuming from a fresh full timer would hand out free seconds |
| One scoreboard, not two | Team total and per-player breakdown are the same information at two zoom levels, so the total is the heading of the list that produces it |
| A buzz at zero makes the score −1 | `applyPoints` does not floor. A free pass at 0 made ممنوع cost nothing when you were already losing |
| Games end before the round counter runs out | 21 points ends it early. Half the simulated games end this way |
| Room names get a digit suffix | The 50 words ran out. Better than a random code, which nobody can say on a call |
| A 6-hour-old room gets overwritten | `STALE_ROOM_MS`. There's no server to sweep abandoned rooms, so `createRoom` reclaims them |
| The guesser's screen shows guessed words | Only cards that have already left play. The live card is never on the room doc |
| Sub-300ms gaps don't count as "أسرع تخمين" | That's a double-tap on صح, not telepathy |

---

## Known gaps

- **No screen has been rendered on a real device.** It typechecks, builds
  and the engine is heavily simulated, but expect spacing to need nudging.
  The `shell` class assumes `100dvh`; check iOS Safari with the URL bar.
- **`public/manifest.webmanifest` has an empty `icons` array.** Add PWA icons.
- **Mid-game disconnects are unhandled**, as in تشفير. A player who leaves
  is gone. If a *describer* leaves mid-turn, the backstop driver still
  ends the turn, but `rolesForTurn` may then hand their team's next turn
  to someone else — acceptable, untested against a real dropout.
- **Haptics are Android-only.** `useBuzzHaptic` uses `navigator.vibrate`,
  which iOS Safari has never shipped and no polyfill can supply. iPhone
  describers get the stamp and the shake, no buzz. Never make a haptic the
  only signal for anything.
- **No presence indicator.** Firestore has no `onDisconnect`. If this
  matters, it's the one thing worth a Realtime Database instance
  alongside — Spark allows both.
- **~994 cards** (from taboo_deck.json, kept as-is). A single game uses about
  27 and never repeats one. `usedCards` is written in the same transaction
  that deals the card, and rematches in the same room keep that list so
  words don't reshuffle until the deck recycles.
