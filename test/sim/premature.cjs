/**
 * The judge's buzz driver (and the giver's, if their tab was frozen)
 * calls advancePhase({ force: true }) to skip the stamp hold.
 *
 * force must only apply a pending buzz. A second call after the mark
 * is spent used to skip the expiry check and close a live turn with
 * time still on the clock — the "round ended early" report.
 */
const { join } = require("node:path");
const fs = require("./stubs/firestore.cjs");
const { api } = require(join(__dirname, "lib/engine.cjs"));
const R = require(join(__dirname, "lib/rules.cjs"));

const as = (uid) => fs.__setUser(uid);

let clockShift = 0;
const realNow = Date.now;
Date.now = () => realNow() + clockShift;
const advanceClock = (ms) => { clockShift += ms; };

(async () => {
  as("host");
  const { roomId } = await api.createRoom({ name: "سلمى", lang: "ar" });
  as("p2");
  await api.joinRoom({ roomId, name: "عمر" });

  as("host");
  await api.startGame({ roomId });
  await api.startTurn({ roomId });
  advanceClock(R.TIMER_START_GRACE_MS + 50);

  let room = await api.loadRoom(roomId);
  const giver = room.turn.clueGiverUid;
  const judge = room.turn.judgeUid;

  as(giver);
  await api.ensureCard({ roomId });
  room = await api.loadRoom(roomId);
  if (room.round.cardId === null) {
    console.error("✗ no card was dealt");
    process.exit(1);
  }

  as(judge);
  await api.buzz({ roomId, fromCardId: room.round.cardId });
  as(giver);
  await api.advancePhase({
    roomId, fromPhase: "live", fromTurn: room.turnIndex, force: true,
  });

  room = await api.loadRoom(roomId);
  if (room.phase !== "live") {
    console.error(`✗ first force left phase=${room.phase}, expected live`);
    process.exit(1);
  }
  if (room.round.buzzedAt !== null) {
    console.error("✗ first force did not spend the buzz");
    process.exit(1);
  }

  // Judge fallback / thawed giver timeout — same signature the hook uses.
  as(judge);
  await api.advancePhase({
    roomId, fromPhase: "live", fromTurn: room.turnIndex, force: true,
  });

  const after = await api.loadRoom(roomId);
  const left = (after.phaseEndsAt ?? 0) - Date.now();
  if (after.phase !== "live") {
    console.error(
      `✗ spent-buzz force ended the turn (phase=${after.phase}, ${left}ms left)`,
    );
    process.exit(1);
  }
  if (left < R.SKIP_LOCKOUT_MS) {
    console.error(`✗ clock was already in lockout (${left}ms) — test is inconclusive`);
    process.exit(1);
  }
  console.log("✓ spent-buzz force leaves the turn live");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
