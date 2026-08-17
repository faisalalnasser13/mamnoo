/**
 * Plays whole games through the real engine against the in-memory
 * Firestore stub. No emulator, no network.
 *
 *   node test/sim/run.mjs sim.cjs 300
 *
 * What it is actually checking: the engine is driven by six independent
 * "phones" that race each other, exactly as at a real table. Every
 * invariant below is one that a missing idempotency guard, or a write
 * placed before a read, would break.
 */

const { join } = require("node:path");
const fs = require("./stubs/firestore.cjs");
const { api } = require(join(__dirname, "lib/engine.cjs"));
const R = require(join(__dirname, "lib/rules.cjs"));
const { DECK } = require(join(__dirname, "lib/deck.cjs"));

const GAMES = Number(process.argv[2] || 100);

/* ------------------------------------------------------------------ */

let seed = 20260731;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const as = (uid) => fs.__setUser(uid);
const roomOf = async (id) => (await api.loadRoom(id));

/** Fake the clock forward — the engine reads Date.now() for deadlines. */
let clockShift = 0;
const realNow = Date.now;
Date.now = () => realNow() + clockShift;
const advanceClock = (ms) => { clockShift += ms; };

/* ------------------------------------------------------------------ */

const problems = [];
function invariant(label, cond, ctx) {
  if (!cond) problems.push(`${label}${ctx ? ` — ${ctx}` : ""}`);
}

async function playOneGame(n) {
  clockShift += 60_000; // fresh window per game
  const names = ["سلمى", "عمر", "نورة", "فهد", "ليان", "ياسر"];
  const uids = names.map((_, i) => `u${n}_${i}`);

  as(uids[0]);
  const { roomId } = await api.createRoom({ name: names[0], lang: "ar" });
  for (let i = 1; i < uids.length; i++) {
    as(uids[i]);
    await api.joinRoom({ roomId, name: names[i] });
  }

  as(uids[0]);
  await api.updateSettings({
    roomId,
    settings: {
      roundSecs: pick([45, 60, 90]),
      roundsPerTeam: pick([3, 4, 5]),
    },
  });
  if (rand() < 0.5) await api.shuffleTeams({ roomId });

  let room = await roomOf(roomId);
  const mint = R.membersOf(room.players, "mint");
  const chili = R.membersOf(room.players, "chili");
  invariant("shuffle emptied a side", mint.length > 0 && chili.length > 0);

  as(uids[0]);
  await api.startGame({ roomId });

  let guard = 0;
  const seenTurns = new Set();
  let scoredCards = 0;

  while (guard++ < 4000) {
    room = await roomOf(roomId);
    if (room.phase === "over") break;

    if (room.phase === "transition") {
      invariant("a describer is missing at transition", Boolean(room.turn?.clueGiverUid));
      invariant("the judge sits on the describer's own team",
        room.players[room.turn.judgeUid].team !== room.turn.team,
        `turn ${room.turnIndex}`);
      invariant("a turn index repeated", !seenTurns.has(room.turnIndex), `turn ${room.turnIndex}`);
      seenTurns.add(room.turnIndex);

      as(room.hostUid);
      await api.startTurn({ roomId });
      continue;
    }

    if (room.phase === "live") {
      const giver = room.turn.clueGiverUid;
      const judge = room.turn.judgeUid;

      // Deal, sometimes racing two devices at the same card.
      if (room.round.cardId === null && room.round.buzzedAt === null) {
        as(giver);
        await api.ensureCard({ roomId });
        if (rand() < 0.3) await api.ensureCard({ roomId }); // duplicate call
        room = await roomOf(roomId);
        if (room.round.cardId === null) { advanceClock(5000); continue; }
      }

      // Guessers must never be handed the card.
      const cardDoc = fs.__peek(`rooms/${roomId}/secret/card`);
      if (cardDoc) {
        invariant("the sealed card lost its word", typeof cardDoc.word === "string");
        invariant("the sealed card disagrees with the room",
          cardDoc.cardId === room.round.cardId);
      }

      const before = { ...room.scores };
      const cardId = room.round.cardId;
      const roll = rand();

      if (roll < 0.12 && room.round.buzzedAt === null) {
        as(judge);
        await api.buzz({ roomId, fromCardId: cardId });
        if (rand() < 0.4) await api.buzz({ roomId, fromCardId: cardId }); // double-tap
        advanceClock(R.BUZZ_HOLD_MS + 50);
        as(giver);
        await api.advancePhase({ roomId, fromPhase: "live", fromTurn: room.turnIndex, force: true });
        const after = await roomOf(roomId);
        invariant("a double-buzz scored twice",
          before[room.turn.team] - after.scores[room.turn.team] <= 1,
          `turn ${room.turnIndex}`);
      } else if (roll < 0.24) {
        const left = (room.phaseEndsAt ?? 0) - Date.now();
        as(giver);
        let refused = false;
        await api.resolve({ roomId, res: "skip", fromCardId: cardId })
          .catch((e) => { refused = e.code === "failed-precondition"; });
        // The lockout is what keeps a steal winnable: without it the
        // describer swaps the card the opponents were listening to.
        if (left <= R.SKIP_LOCKOUT_MS) {
          invariant("a skip slipped through the lockout", refused,
            `${left}ms left`);
        } else {
          invariant("a legal skip was refused", !refused, `${left}ms left`);
        }
      } else {
        as(giver);
        await api.resolve({ roomId, res: "ok", fromCardId: cardId });
        // The same button pressed twice must not score twice.
        if (rand() < 0.35) {
          await api.resolve({ roomId, res: "ok", fromCardId: cardId }).catch(() => {});
        }
        scoredCards += 1;
        const after = await roomOf(roomId);
        const gained = after.scores[room.turn.team] - before[room.turn.team];
        invariant("a correct card scored more than 2", gained <= 2, `gained ${gained}`);
        invariant("a correct card scored nothing", gained >= 1, `gained ${gained}`);
      }

      // Sometimes run the clock out instead of playing on.
      if (rand() < 0.22) {
        advanceClock(
          R.TIMER_START_GRACE_MS + room.settings.roundSecs * 1000 + R.TIMER_GRACE_MS + 500,
        );
        // Every phone fires; only one should land.
        for (const u of uids) {
          as(u);
          await api.advancePhase({ roomId, fromPhase: "live", fromTurn: room.turnIndex });
        }
      }
      continue;
    }

    if (room.phase === "steal") {
      const before = { ...room.scores };
      const thief = R.OTHER[room.turn.team];
      // The original judge is on the stealing team and must not award.
      as(room.turn.judgeUid);
      await api.claimSteal({ roomId }).catch(() => {});
      const still = await roomOf(roomId);
      invariant("the original judge awarded a steal",
        still.phase === "steal", `turn ${room.turnIndex}`);
      const roll = rand();
      if (roll < 0.4) {
        as(room.turn.clueGiverUid);
        await api.claimSteal({ roomId });
        if (rand() < 0.4) await api.claimSteal({ roomId }).catch(() => {}); // double-tap
        const after = await roomOf(roomId);
        invariant("a steal did not credit the other team",
          after.scores[thief] === before[thief] + 1, `turn ${room.turnIndex}`);
        invariant("a steal credited the describing team",
          after.scores[room.turn.team] === before[room.turn.team], `turn ${room.turnIndex}`);
        invariant("a double steal scored twice",
          after.scores[thief] - before[thief] <= 1, `turn ${room.turnIndex}`);
      } else if (roll < 0.65) {
        as(room.turn.clueGiverUid);
        await api.denySteal({ roomId });
        if (rand() < 0.4) await api.denySteal({ roomId }).catch(() => {});
        const after = await roomOf(roomId);
        invariant("a missed steal still scored",
          after.scores[thief] === before[thief], `turn ${room.turnIndex}`);
        invariant("a missed steal left steal phase",
          after.phase === "recap", `turn ${room.turnIndex}`);
      } else {
        advanceClock(R.STEAL_MS + R.TIMER_GRACE_MS + 500);
        for (const u of uids) {
          as(u);
          await api.advancePhase({ roomId, fromPhase: "steal", fromTurn: room.turnIndex });
        }
      }
      continue;
    }

    if (room.phase === "recap") {
      const rec = fs.__peek(`rooms/${roomId}/rounds/${room.turnIndex}`);
      invariant("a finished turn left no record", Boolean(rec), `turn ${room.turnIndex}`);
      if (rec) {
        invariant("the round record lost its describer", Boolean(rec.clueGiverUid));
        invariant("the recap log disagrees with the record",
          rec.log.length === room.round.log.length, `turn ${room.turnIndex}`);
      }
      invariant("a card was left in play at recap", room.round.cardId === null);
      invariant("the sealed card outlived the turn",
        fs.__peek(`rooms/${roomId}/secret/card`) == null);

      // A non-host tapping "تمام" must not advance the table.
      const outsider = uids.find((u) => u !== room.hostUid);
      as(outsider);
      const idx = room.turnIndex;
      await api.advancePhase({ roomId, fromPhase: "recap", fromTurn: idx }).catch(() => {});
      const still = await roomOf(roomId);
      invariant("a non-host advanced the recap", still.turnIndex === idx && still.phase === "recap");

      // Then the host, twice.
      as(room.hostUid);
      await api.advancePhase({ roomId, fromPhase: "recap", fromTurn: idx });
      await api.advancePhase({ roomId, fromPhase: "recap", fromTurn: idx }).catch(() => {});
      const moved = await roomOf(roomId);
      invariant("a double host tap skipped a turn",
        moved.phase === "over" || moved.turnIndex === idx + 1,
        `${idx} → ${moved.turnIndex}`);
      continue;
    }

    break;
  }

  invariant("the game never ended", room.phase === "over", `after ${guard} steps`);

  /* ---- post-game ---- */
  const total = R.totalTurns(room.settings);
  invariant("more turns were played than the guard allows", room.turnIndex < total + 40,
    `${room.turnIndex} of ${total}`);
  // Scores may be negative — a buzz at 0 is −1 on purpose.
  invariant("the winner disagrees with the score",
    room.winner === R.winnerOf(room.scores));
  invariant("the game ended without a reason", Boolean(room.endReason));
  if (room.endReason === "rounds") {
    invariant("ended before the scheduled rounds finished",
      room.turnIndex + 1 >= total, `${room.turnIndex} of ${total}`);
    invariant("natural end left a tie", room.winner !== "draw");
  }

  // No word may repeat inside one game. usedCards is written in the same
  // transaction that deals the card, so two devices racing to deal cannot
  // both win. Rematches keep the list so a room doesn't reshuffle until
  // the deck is exhausted.
  const used = room.usedCards ?? [];
  invariant("a card repeated inside one game",
    used.length === new Set(used).size, `${used.length} used`);
  invariant("more cards were used than exist", used.length <= DECK.length);

  // The same, checked against what players actually saw rather than the
  // bookkeeping array: every word in every round log, across the game.
  const wordsSeen = [];
  for (let i = 0; i <= room.turnIndex; i++) {
    const rec = fs.__peek(`rooms/${roomId}/rounds/${i}`);
    if (!rec) continue;
    for (const e of rec.log) if (e.res !== "steal") wordsSeen.push(e.w);
  }
  invariant("a player saw the same word twice in one game",
    wordsSeen.length === new Set(wordsSeen).size,
    `${wordsSeen.length} words, ${new Set(wordsSeen).size} unique`);

  // A reused room name must not carry the previous game's records into
  // this one — that regression is invisible until the final screen.
  invariant("round records outlived the game they belong to",
    fs.__peek(`rooms/${roomId}/rounds/${room.turnIndex + 1}`) == null);

  return { turns: room.turnIndex, scored: scoredCards, reason: room.endReason };
}

/* ------------------------------------------------------------------ */

(async () => {
  const t0 = realNow();
  const reasons = {};
  let turns = 0, scored = 0;

  for (let i = 0; i < GAMES; i++) {
    const r = await playOneGame(i);
    turns += r.turns;
    scored += r.scored;
    reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
    if (problems.length > 40) break;
  }

  const secs = ((realNow() - t0) / 1000).toFixed(1);
  if (problems.length) {
    console.error(`\n✗ ${problems.length} invariant failures across ${GAMES} games\n`);
    for (const p of problems.slice(0, 40)) console.error("  ·", p);
    process.exit(1);
  }
  console.log(
    `✓ sim: ${GAMES} games in ${secs}s · `
    + `${(turns / GAMES).toFixed(1)} turns/game · ${(scored / GAMES).toFixed(1)} cards/game · `
    + Object.entries(reasons).map(([k, v]) => `${k}:${v}`).join(" "),
  );
})();
