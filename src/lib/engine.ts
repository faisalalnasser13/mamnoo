/**
 * The game engine, running in the browser. No Cloud Functions — see
 * AGENTS.md for why that constraint exists and what it costs.
 *
 * Two things carry over from تشفير and matter just as much here:
 *
 *  1. Every state change is a Firestore transaction with an idempotency
 *     guard. Six phones can race to end the same turn; the first wins
 *     and the rest are no-ops. Without it, a round scores twice.
 *  2. Reads must all precede writes inside a transaction.
 *
 * Where this game is *stricter* than تشفير: the current card is sealed
 * from the guessers by security rules, not by convention. There, a peek
 * at the opponent's code is cheating at the margins; here, seeing the
 * card is the entire game, so it's worth the extra get() in the rules.
 */

import {
  doc, collection, getDoc, getDocs, deleteDoc, deleteField, runTransaction,
  writeBatch, Transaction,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import {
  OTHER, SKIPS_PER_TURN, STEAL_MS, CLOCK_SKEW_MS,
  TIMER_GRACE_MS, TIMER_START_GRACE_MS, BUZZ_HOLD_MS, DEFAULTS, NAME_MAX,
  ROUND_SECS_OPTIONS, ROUNDS_PER_TEAM_OPTIONS, snapSetting, rolesForTurn,
  pickBalancedTeam, shuffledTeams, resolveCard, applyPoints, isOver, winnerOf,
  drawFrom, membersOf, SKIP_LOCKOUT_MS, stealAllowed, liveStartPad,
} from "./rules";
import type { Lang, Outcome, Phase, Room, Settings, TeamId } from "./types";
import { deckFor, roomWordsFor } from "./decks";
import { S, asLang } from "./strings";

export { TIMER_GRACE_MS, BUZZ_HOLD_MS, STEAL_MS, SKIP_LOCKOUT_MS };

/** Mirrors HttpsError so the screens' error handling stays uniform. */
export class GameError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export function errText(e: unknown, lang: Lang = "ar"): string {
  if (e instanceof GameError) return e.message;
  const code = (e as { code?: string })?.code ?? "";
  const s = S(lang);
  if (code.includes("permission-denied")) return s.err.permission;
  if (code.includes("unavailable")) return s.err.network;
  return s.err.generic;
}

const roomRef = (id: string) => doc(db, "rooms", id);
/** The live card. Readable only by the clue-giver and the judge. */
const cardRef = (id: string) => doc(db, "rooms", id, "secret", "card");
const roundRef = (id: string, i: number) => doc(db, "rooms", id, "rounds", String(i));

function me(lang: Lang = "ar"): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new GameError("unauthenticated", S(lang).err.signIn);
  return uid;
}

function requireHost(room: Room, uid: string) {
  if (room.hostUid !== uid) throw new GameError("permission-denied", S(room.lang).err.hostOnly);
}

function requireMember(room: Room, uid: string) {
  if (!room.players[uid]) throw new GameError("permission-denied", S(room.lang).err.notInRoom);
}

async function loadRoom(id: string): Promise<Room> {
  const snap = await getDoc(roomRef(id));
  if (!snap.exists()) throw new GameError("not-found", S("ar").err.noSuchRoom);
  return asRoom(id, snap.data() as Record<string, unknown>);
}

/**
 * Every read inside a transaction goes through this.
 *
 * `round.log` missing is not hypothetical: a document written before
 * `log` existed returns undefined, and `writeRecap` then passes
 * undefined into `tx.set`, which Firestore rejects outright. The turn
 * never reaches recap and every player sits on a dead screen.
 */
function asRoom(id: string, raw: Record<string, unknown>): Room {
  const r = raw as Partial<Room>;
  const round = (r.round ?? {}) as Partial<Room["round"]>;
  return {
    ...(raw as unknown as Room),
    id,
    players: r.players ?? {},
    scores: { mint: r.scores?.mint ?? 0, chili: r.scores?.chili ?? 0 },
    usedCards: Array.isArray(r.usedCards) ? r.usedCards : [],
    lang: asLang(r.lang),
    round: {
      cardId: round.cardId ?? null,
      cardAt: round.cardAt ?? null,
      skipsLeft: round.skipsLeft ?? 0,
      streak: round.streak ?? 0,
      points: round.points ?? 0,
      buzzedAt: round.buzzedAt ?? null,
      stealEndsAt: round.stealEndsAt ?? null,
      log: Array.isArray(round.log) ? round.log : [],
    },
  };
}

function emptyRound() {
  return {
    cardId: null as number | null,
    cardAt: null as number | null,
    skipsLeft: SKIPS_PER_TURN,
    streak: 0,
    points: 0,
    buzzedAt: null as number | null,
    stealEndsAt: null as number | null,
    log: [] as Room["round"]["log"],
  };
}

const rand = () => Math.random();

/* ------------------------------------------------------------------ */
/* lobby                                                              */
/* ------------------------------------------------------------------ */

/**
 * A room nobody has touched in this long is fair game to overwrite.
 * Without this the named-room pool leaks: every abandoned tab holds a
 * word forever, and there's no server to sweep them up.
 */
export const STALE_ROOM_MS = 6 * 60 * 60 * 1000;

/**
 * Candidate room names, best first: the plain words shuffled, then the
 * same words with a digit. 50 words × 9 suffixes is far more concurrent
 * rooms than this will ever need, and every name is still sayable out
 * loud on a call — which is the entire reason they aren't random codes.
 */
function nameCandidates(lang: Lang): string[] {
  const base = [...roomWordsFor(lang)].sort(() => rand() - 0.5);
  const out = [...base];
  for (let n = 2; n <= 9; n++) for (const w of base) out.push(`${w}${n}`);
  return out;
}

async function createRoom({ name, lang }: { name: string; lang: Lang }) {
  const L = asLang(lang);
  const uid = me(L);
  const clean = name.trim().slice(0, NAME_MAX);
  if (!clean) throw new GameError("invalid-argument", S(L).err.writeName);

  for (const id of nameCandidates(L)) {
    const created = await runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef(id));
      if (snap.exists()) {
        const prev = snap.data() as { updatedAt?: number };
        if (Date.now() - (prev.updatedAt ?? 0) < STALE_ROOM_MS) return false;
        // Stale: take it over. tx.set replaces the document wholesale,
        // so no stray field from the old game survives.
      }
      const t = Date.now();
      tx.set(roomRef(id), {
        hostUid: uid,
        lang: L,
        phase: "lobby" as Phase,
        turnIndex: 0,
        paused: false,
        phaseStartedAt: t,
        phaseEndsAt: null,
        settings: { ...DEFAULTS },
        players: { [uid]: { name: clean, team: "mint" as TeamId, joinedAt: t } },
        scores: { mint: 0, chili: 0 },
        turn: null,
        round: emptyRound(),
        usedCards: [],
        winner: null,
        endReason: null,
        createdAt: t,
        updatedAt: t,
      });
      return true;
    });
    if (created) return { roomId: id };
  }
  throw new GameError("resource-exhausted", S(L).err.namesBusy);
}

async function joinRoom({ roomId, name }: { roomId: string; name: string }) {
  const uid = me();
  const clean = name.trim().slice(0, NAME_MAX);
  if (!clean) throw new GameError("invalid-argument", S("ar").err.writeName);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(roomId));
    if (!snap.exists()) throw new GameError("not-found", S("ar").err.noSuchRoom);
    const room = asRoom(roomId, snap.data() as Record<string, unknown>);

    if (room.players[uid]) {
      tx.update(roomRef(roomId), { [`players.${uid}.name`]: clean, updatedAt: Date.now() });
      return;
    }
    if (room.phase !== "lobby") {
      throw new GameError("failed-precondition", S(room.lang).err.gameStarted);
    }
    if (Object.keys(room.players).length >= 12) {
      throw new GameError("resource-exhausted", S(room.lang).err.roomFull);
    }
    const mintN = membersOf(room.players, "mint").length;
    const chiliN = membersOf(room.players, "chili").length;
    tx.update(roomRef(roomId), {
      [`players.${uid}`]: {
        name: clean,
        team: pickBalancedTeam(mintN, chiliN, uid),
        joinedAt: Date.now(),
      },
      updatedAt: Date.now(),
    });
  });
  return { ok: true };
}

async function leaveRoom({ roomId }: { roomId: string }) {
  const uid = me();
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(roomId));
    if (!snap.exists()) return;
    const room = asRoom(roomId, snap.data() as Record<string, unknown>);
    const rest = Object.keys(room.players).filter((u) => u !== uid);
    if (!rest.length) { tx.delete(roomRef(roomId)); return; }
    const patch: Record<string, unknown> = {
      [`players.${uid}`]: deleteField(),
      updatedAt: Date.now(),
    };
    // Hand the room over rather than orphaning it.
    if (room.hostUid === uid) patch.hostUid = rest[0];
    tx.update(roomRef(roomId), patch);
  });
  return { ok: true };
}

async function kickPlayer({ roomId, uid: target }: { roomId: string; uid: string }) {
  const uid = me();
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(roomId));
    if (!snap.exists()) throw new GameError("not-found", S("ar").err.roomMissing);
    const room = asRoom(roomId, snap.data() as Record<string, unknown>);
    requireHost(room, uid);
    if (target === uid) throw new GameError("invalid-argument", S(room.lang).err.kickSelf);
    if (!room.players[target]) return;

    const remaining = { ...room.players };
    delete remaining[target];
    const rest = Object.keys(remaining);
    const t = Date.now();

    if (!rest.length) {
      tx.delete(cardRef(roomId));
      tx.delete(roomRef(roomId));
      return;
    }

    const mintLeft = membersOf(remaining, "mint").length;
    const chiliLeft = membersOf(remaining, "chili").length;
    const sideEmptied = mintLeft === 0 || chiliLeft === 0;

    // Mid-game with an empty side — the table can't continue.
    if (room.phase !== "lobby" && sideEmptied) {
      tx.update(roomRef(roomId), {
        [`players.${target}`]: deleteField(),
        phase: "over" as Phase,
        winner: mintLeft > 0 ? "mint" : chiliLeft > 0 ? "chili" : winnerOf(room.scores),
        endReason: "abandoned",
        phaseEndsAt: null,
        updatedAt: t,
      });
      tx.delete(cardRef(roomId));
      return;
    }

    // Kicking the describer mid-turn would leave the table stuck waiting
    // for a card that never comes — close the turn the same way skipTurn does.
    const stuckDescriber =
      (room.phase === "live" || room.phase === "steal")
      && room.turn?.clueGiverUid === target;
    if (stuckDescriber) {
      writeRecap(tx, room, {});
      tx.update(roomRef(roomId), {
        [`players.${target}`]: deleteField(),
        updatedAt: t,
      });
      return;
    }

    const patch: Record<string, unknown> = {
      [`players.${target}`]: deleteField(),
      updatedAt: t,
    };

    // Rebind the current turn if it still points at the kicked player
    // (e.g. judge kicked on the transition screen).
    if (
      room.phase !== "lobby"
      && room.turn
      && (room.turn.clueGiverUid === target || room.turn.judgeUid === target)
    ) {
      const turn = rolesForTurn(remaining, room.turnIndex);
      if (turn) patch.turn = turn;
    }

    tx.update(roomRef(roomId), patch);
  });
  return { ok: true };
}

async function updateSettings({ roomId, settings }: { roomId: string; settings: Partial<Settings> }) {
  const uid = me();
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(roomId));
    if (!snap.exists()) throw new GameError("not-found", S("ar").err.roomMissing);
    const room = asRoom(roomId, snap.data() as Record<string, unknown>);
    requireHost(room, uid);
    if (room.phase !== "lobby") throw new GameError("failed-precondition", S(room.lang).err.settingsLobby);
    const next: Settings = {
      roundSecs: snapSetting(settings.roundSecs ?? room.settings.roundSecs, ROUND_SECS_OPTIONS),
      roundsPerTeam: snapSetting(settings.roundsPerTeam ?? room.settings.roundsPerTeam, ROUNDS_PER_TEAM_OPTIONS),
    };
    tx.update(roomRef(roomId), { settings: next, updatedAt: Date.now() });
  });
  return { ok: true };
}

async function shuffleTeams({ roomId }: { roomId: string }) {
  const uid = me();
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(roomId));
    if (!snap.exists()) throw new GameError("not-found", S("ar").err.roomMissing);
    const room = asRoom(roomId, snap.data() as Record<string, unknown>);
    requireHost(room, uid);
    if (room.phase !== "lobby") throw new GameError("failed-precondition", S(room.lang).err.shuffleLobby);
    const teams = shuffledTeams(Object.keys(room.players), rand);
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [u, t] of Object.entries(teams)) patch[`players.${u}.team`] = t;
    tx.update(roomRef(roomId), patch);
  });
  return { ok: true };
}

async function setTeam({ roomId, uid: target, team }: { roomId: string; uid: string; team: TeamId }) {
  const uid = me();
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(roomId));
    if (!snap.exists()) throw new GameError("not-found", S("ar").err.roomMissing);
    const room = asRoom(roomId, snap.data() as Record<string, unknown>);
    if (room.hostUid !== uid && target !== uid) {
      throw new GameError("permission-denied", S(room.lang).err.moveOthers);
    }
    if (room.phase !== "lobby") throw new GameError("failed-precondition", S(room.lang).err.switchLobby);
    tx.update(roomRef(roomId), { [`players.${target}.team`]: team, updatedAt: Date.now() });
  });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* starting                                                           */
/* ------------------------------------------------------------------ */

async function startGame({ roomId }: { roomId: string }) {
  const uid = me();
  // Clear any leftovers from a previous game before the transaction —
  // deletes can't be batched into it and they're safe to repeat.
  await wipeSubcollections(roomId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(roomId));
    if (!snap.exists()) throw new GameError("not-found", S("ar").err.roomMissing);
    const room = asRoom(roomId, snap.data() as Record<string, unknown>);
    requireHost(room, uid);
    if (room.phase !== "lobby") return; // idempotent: someone already started

    const turn = rolesForTurn(room.players, 0);
    if (!turn) throw new GameError("failed-precondition", S(room.lang).err.needPlayer);

    // Keep usedCards across rematches in the same room so the table
    // doesn't see the same words again until the deck recycles.
    tx.update(roomRef(roomId), {
      phase: "transition" as Phase,
      turnIndex: 0,
      turn,
      scores: { mint: 0, chili: 0 },
      round: emptyRound(),
      usedCards: room.usedCards ?? [],
      winner: null,
      endReason: null,
      phaseStartedAt: Date.now(),
      phaseEndsAt: null,
      updatedAt: Date.now(),
    });
  });
  return { ok: true };
}

/**
 * Host-only, from the transition screen. This is the one deliberate
 * pause in the game: the table reads who's up, then someone taps.
 */
async function startTurn({ roomId }: { roomId: string }) {
  const uid = me();
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(roomId));
    if (!snap.exists()) throw new GameError("not-found", S("ar").err.roomMissing);
    const room = asRoom(roomId, snap.data() as Record<string, unknown>);
    requireHost(room, uid);
    if (room.phase !== "transition") return; // idempotent
    if (!room.turn) throw new GameError("failed-precondition", S(room.lang).err.noTurn);

    const t = Date.now();
    // Bake the silent start beat into the deadline so the table still
    // gets a full roundSecs of visible countdown after it.
    tx.update(roomRef(roomId), {
      phase: "live" as Phase,
      round: emptyRound(),
      phaseStartedAt: t,
      phaseEndsAt: t + TIMER_START_GRACE_MS + room.settings.roundSecs * 1000,
      updatedAt: t,
    });
  });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* the card                                                           */
/* ------------------------------------------------------------------ */

/**
 * Puts a card in play. Only the clue-giver may call it — they're the
 * only one allowed to write the sealed card document anyway.
 *
 * Idempotent on `round.cardId`: if a card is already up, this is a
 * no-op, so the ensure-on-subscribe pattern in hooks.ts can fire freely.
 */
async function ensureCard({ roomId }: { roomId: string }) {
  const uid = me();
  let picked: { id: number; recycled: boolean } | null = null;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(roomId));
    if (!snap.exists()) throw new GameError("not-found", S("ar").err.roomMissing);
    const room = asRoom(roomId, snap.data() as Record<string, unknown>);
    if (room.phase !== "live") return;
    if (room.turn?.clueGiverUid !== uid) return;
    if (room.round.cardId !== null) return;   // already dealt
    if (room.round.buzzedAt !== null) return; // stamp still showing
    if (room.phaseEndsAt === null) return;
    // Don't burn the first card during the silent start beat.
    const pad = liveStartPad(
      room.phase, room.phaseStartedAt, room.phaseEndsAt, room.settings.roundSecs,
    );
    if (Date.now() < room.phaseStartedAt + pad) return;

    const deck = deckFor(room.lang);
    picked = drawFrom(deck.length, room.usedCards ?? [], rand);
    const used = picked.recycled ? [picked.id] : [...(room.usedCards ?? []), picked.id];

    tx.set(cardRef(roomId), {
      cardId: picked.id,
      word: deck[picked.id].w,
      taboo: deck[picked.id].t,
      turnIndex: room.turnIndex,
      at: Date.now(),
    });
    tx.update(roomRef(roomId), {
      "round.cardId": picked.id,
      "round.cardAt": Date.now(),
      usedCards: used,
      updatedAt: Date.now(),
    });
  });
  return { ok: true, cardId: picked ? (picked as { id: number }).id : null };
}

/**
 * The clue-giver banks or burns the card in play.
 *
 * `fromCardId` is the idempotency guard: a double-tap on "صح" carries
 * the id the button was rendered with, and the second one is a no-op.
 */
async function resolve({
  roomId, res, fromCardId,
}: { roomId: string; res: Exclude<Outcome, "steal">; fromCardId: number }) {
  const uid = me();
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(roomId));
    if (!snap.exists()) throw new GameError("not-found", S("ar").err.roomMissing);
    const room = asRoom(roomId, snap.data() as Record<string, unknown>);
    if (room.phase !== "live") return;
    if (room.round.cardId !== fromCardId) return; // already resolved
    if (room.turn?.clueGiverUid !== uid) {
      throw new GameError("permission-denied", S(room.lang).err.giverOnly);
    }
    if (res === "skip") {
      // The button is disabled during the lockout, but a stale render or
      // a queued tap must not slip through — this is the rule that keeps
      // the steal winnable, so it's enforced here too.
      const left = (room.phaseEndsAt ?? 0) - Date.now();
      if (left <= SKIP_LOCKOUT_MS) {
        throw new GameError("failed-precondition", S(room.lang).err.skipLocked);
      }
    }

    const card = deckFor(room.lang)[fromCardId];
    if (!card) return;
    const r = resolveCard(res, room.round.streak, room.round.skipsLeft);
    const team = room.turn.team;
    const t = Date.now();

    tx.update(roomRef(roomId), {
      "round.cardId": null,
      "round.cardAt": null,
      "round.buzzedAt": null,
      "round.streak": r.streak,
      "round.skipsLeft": r.skipsLeft,
      "round.points": room.round.points + r.pts,
      "round.log": [
        ...room.round.log,
        { w: card.w, res, pts: r.pts, t: t - room.phaseStartedAt },
      ],
      [`scores.${team}`]: applyPoints(room.scores[team], r.pts),
      updatedAt: t,
    });
    tx.delete(cardRef(roomId));
  });
  return { ok: true };
}

/**
 * The judge presses ممنوع. This only *marks* the card — the clue-giver's
 * device turns the mark into a resolution after the stamp animation, so
 * there is exactly one writer for the score.
 */
async function buzz({ roomId, fromCardId }: { roomId: string; fromCardId: number }) {
  const uid = me();
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(roomId));
    if (!snap.exists()) throw new GameError("not-found", S("ar").err.roomMissing);
    const room = asRoom(roomId, snap.data() as Record<string, unknown>);
    if (room.phase !== "live") return;
    if (room.round.cardId !== fromCardId) return;
    if (room.round.buzzedAt !== null) return; // already buzzed
    if (room.turn?.judgeUid !== uid) {
      throw new GameError("permission-denied", S(room.lang).err.judgeBuzz);
    }
    tx.update(roomRef(roomId), { "round.buzzedAt": Date.now(), updatedAt: Date.now() });
  });
  return { ok: true };
}

/** The judge awards the steal. Credits the other team, then ends the turn. */
async function claimSteal({ roomId }: { roomId: string }) {
  const uid = me();
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(roomId));
    if (!snap.exists()) throw new GameError("not-found", S("ar").err.roomMissing);
    const room = asRoom(roomId, snap.data() as Record<string, unknown>);
    if (room.phase !== "steal") return; // idempotent
    if (room.turn?.judgeUid !== uid) {
      throw new GameError("permission-denied", S(room.lang).err.judgeSteal);
    }
    const thief = OTHER[room.turn.team];
    writeRecap(tx, room, {
      extraLog: { w: S(room.lang).stealWord, res: "steal" as Outcome, pts: 1, t: room.settings.roundSecs * 1000 },
      stealTo: thief,
    });
  });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* phase machine                                                      */
/* ------------------------------------------------------------------ */

/**
 * Any client may call this. The transaction re-reads the room and bails
 * if someone already advanced, so six phones racing produces one
 * transition, not six.
 */
async function advancePhase({
  roomId, fromPhase, fromTurn, force,
}: { roomId: string; fromPhase?: Phase; fromTurn?: number; force?: boolean }) {
  const uid = me();
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(roomId));
    if (!snap.exists()) throw new GameError("not-found", S("ar").err.roomMissing);
    const room = asRoom(roomId, snap.data() as Record<string, unknown>);

    requireMember(room, uid);
    if (room.paused) return;
    if (fromPhase && (room.phase !== fromPhase || room.turnIndex !== fromTurn)) return;

    const expired =
      room.phaseEndsAt !== null
      && Date.now() + CLOCK_SKEW_MS >= room.phaseEndsAt + TIMER_GRACE_MS;

    if (room.phase === "live") {
      // A pending buzz outranks the clock: the card is already dead.
      if (room.round.buzzedAt !== null) {
        if (Date.now() - room.round.buzzedAt < BUZZ_HOLD_MS && !force) return;
        applyBuzz(tx, room);
        return;
      }
      if (!expired && !force) return;
      // Time is up. A card still in play is worth one steal attempt —
      // but only if the opponents actually heard it described.
      if (room.round.cardId !== null && stealAllowed(room.round.cardAt, Date.now())) {
        tx.update(roomRef(roomId), {
          phase: "steal" as Phase,
          "round.stealEndsAt": Date.now() + STEAL_MS,
          phaseStartedAt: Date.now(),
          phaseEndsAt: Date.now() + STEAL_MS,
          updatedAt: Date.now(),
        });
        return;
      }
      writeRecap(tx, room, {});
      return;
    }

    if (room.phase === "steal") {
      if (!expired && !force) return;
      writeRecap(tx, room, {});
      return;
    }

    // transition / recap advance on a host tap, never on a clock.
    if (room.phase === "recap") { requireHost(room, uid); nextTurnIn(tx, room); return; }
  });
  return { ok: true };
}

/** Turns a judge's mark into the actual −1, from inside a transaction. */
function applyBuzz(tx: Transaction, room: Room) {
  const id = room.round.cardId;
  if (id === null || !room.turn) return;
  const card = deckFor(room.lang)[id];
  if (!card) return;
  const r = resolveCard("buzz", room.round.streak, room.round.skipsLeft);
  const t = Date.now();
  tx.update(roomRef(room.id), {
    "round.cardId": null,
    "round.cardAt": null,
    "round.buzzedAt": null,
    "round.streak": r.streak,
    "round.points": room.round.points + r.pts,
    "round.log": [
      ...room.round.log,
      { w: card.w, res: "buzz" as Outcome, pts: r.pts, t: t - room.phaseStartedAt },
    ],
    [`scores.${room.turn.team}`]: applyPoints(room.scores[room.turn.team], r.pts),
    updatedAt: t,
  });
  tx.delete(cardRef(room.id));
}

/** Freeze the turn into a round record and show the recap. */
function writeRecap(
  tx: Transaction,
  room: Room,
  opts: { extraLog?: Room["round"]["log"][number]; stealTo?: TeamId },
) {
  if (!room.turn) return;
  const log = opts.extraLog ? [...room.round.log, opts.extraLog] : room.round.log;
  const t = Date.now();

  const scores = { ...room.scores };
  if (opts.stealTo) scores[opts.stealTo] = applyPoints(scores[opts.stealTo], 1);

  tx.set(roundRef(room.id, room.turnIndex), {
    index: room.turnIndex,
    team: room.turn.team,
    clueGiverUid: room.turn.clueGiverUid,
    judgeUid: room.turn.judgeUid,
    points: room.round.points,
    log,
    at: t,
  });
  tx.update(roomRef(room.id), {
    phase: "recap" as Phase,
    "round.log": log,
    "round.cardId": null,
    "round.cardAt": null,
    "round.buzzedAt": null,
    "round.stealEndsAt": null,
    scores,
    phaseStartedAt: t,
    phaseEndsAt: null,
    updatedAt: t,
  });
  tx.delete(cardRef(room.id));
}

/** Recap → next transition, or the end of the game. */
function nextTurnIn(tx: Transaction, room: Room) {
  const next = room.turnIndex + 1;
  const reason = isOver(room.scores, next, room.settings);
  const t = Date.now();

  if (reason) {
    tx.update(roomRef(room.id), {
      phase: "over" as Phase,
      winner: winnerOf(room.scores),
      endReason: reason,
      phaseStartedAt: t,
      phaseEndsAt: null,
      updatedAt: t,
    });
    return;
  }
  const turn = rolesForTurn(room.players, next);
  if (!turn) {
    // A side emptied out mid-game. End it rather than dealing to nobody.
    tx.update(roomRef(room.id), {
      phase: "over" as Phase,
      winner: winnerOf(room.scores),
      endReason: "abandoned",
      updatedAt: t,
    });
    return;
  }
  tx.update(roomRef(room.id), {
    phase: "transition" as Phase,
    turnIndex: next,
    turn,
    round: emptyRound(),
    phaseStartedAt: t,
    phaseEndsAt: null,
    updatedAt: t,
  });
}

export type HostAction =
  | "pause" | "resume" | "skipTurn" | "endGame"
  | "addTime" | "plusGuess" | "minusGuess";

/**
 * Team the host ± buttons apply to.
 * Live → describers. Steal → thieves. Recap → whoever was guessing
 * that turn (thieves if the log ends in a steal, else describers),
 * until the host starts the next round.
 */
function guessingTeamOf(room: Room): TeamId | null {
  if (!room.turn) return null;
  if (room.phase === "steal") return OTHER[room.turn.team];
  if (room.phase === "live") return room.turn.team;
  if (room.phase === "recap") {
    const stole = (room.round.log ?? []).some((e) => e.res === "steal");
    return stole ? OTHER[room.turn.team] : room.turn.team;
  }
  return null;
}

/**
 * Mid-game host controls.
 *
 * `pause` is for the doorbell. `skipTurn` is the recovery hatch: if the
 * describer's phone dies or their tab crashes, no card is ever dealt and
 * the turn cannot end on its own — someone has to be able to move the
 * table on. `endGame` jumps to the final screen. `addTime` / ±guess are
 * table-side corrections the host makes out loud on the call.
 */
async function hostControl({
  roomId, action,
}: { roomId: string; action: HostAction }) {
  const uid = me();
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(roomId));
    if (!snap.exists()) throw new GameError("not-found", S("ar").err.roomMissing);
    const room = asRoom(roomId, snap.data() as Record<string, unknown>);
    requireHost(room, uid);
    const t = Date.now();

    if (action === "pause") {
      if (room.paused || room.phaseEndsAt === null) return;
      // Bank the time left so resuming doesn't hand out free seconds.
      tx.update(roomRef(roomId), {
        paused: true,
        pausedLeft: Math.max(0, room.phaseEndsAt - t),
        updatedAt: t,
      });
      return;
    }

    if (action === "resume") {
      if (!room.paused) return;
      const left = (room as Room & { pausedLeft?: number }).pausedLeft ?? 0;
      tx.update(roomRef(roomId), {
        paused: false,
        pausedLeft: null,
        phaseStartedAt: t,
        phaseEndsAt: left > 0 ? t + left : null,
        updatedAt: t,
      });
      return;
    }

    if (action === "skipTurn") {
      if (room.phase !== "live" && room.phase !== "steal") return;
      // Whatever was on the table is abandoned, not scored.
      writeRecap(tx, room, {});
      return;
    }

    if (action === "addTime") {
      if (room.phase !== "live" && room.phase !== "steal") return;
      const bump = 5_000;
      if (room.paused) {
        const left = (room as Room & { pausedLeft?: number }).pausedLeft ?? 0;
        tx.update(roomRef(roomId), {
          pausedLeft: left + bump,
          updatedAt: t,
        });
        return;
      }
      if (room.phaseEndsAt === null) return;
      tx.update(roomRef(roomId), {
        phaseEndsAt: room.phaseEndsAt + bump,
        updatedAt: t,
      });
      return;
    }

    if (action === "plusGuess" || action === "minusGuess") {
      if (room.phase !== "live" && room.phase !== "steal" && room.phase !== "recap") return;
      const team = guessingTeamOf(room);
      if (!team || !room.turn) return;
      const delta = action === "plusGuess" ? 1 : -1;
      const entry = {
        w: delta > 0 ? S(room.lang).hostPlus : S(room.lang).hostMinus,
        res: "host" as Outcome,
        pts: delta,
        t: Math.max(0, t - room.phaseStartedAt),
      };
      const newLog = [...(room.round.log ?? []), entry];
      const patch: Record<string, unknown> = {
        [`scores.${team}`]: applyPoints(room.scores[team], delta),
        "round.log": newLog,
        updatedAt: t,
      };
      // Keep the recap big number in sync when the host corrects the
      // describing team of this turn.
      if (team === room.turn.team) {
        patch["round.points"] = room.round.points + delta;
      }
      tx.update(roomRef(roomId), patch);
      // Recap already froze a rounds/* record — rewrite its log too so
      // the feed and end-game stats agree on every phone.
      if (room.phase === "recap") {
        const roundPatch: Record<string, unknown> = { log: newLog };
        if (team === room.turn.team) {
          roundPatch.points = room.round.points + delta;
        }
        tx.update(roundRef(roomId, room.turnIndex), roundPatch);
      }
      return;
    }

    if (action === "endGame") {
      if (room.phase === "over" || room.phase === "lobby") return;
      tx.update(roomRef(roomId), {
        phase: "over" as Phase,
        winner: winnerOf(room.scores),
        endReason: "abandoned",
        paused: false,
        "round.cardId": null,
        "round.cardAt": null,
        "round.buzzedAt": null,
        "round.stealEndsAt": null,
        phaseStartedAt: t,
        phaseEndsAt: null,
        updatedAt: t,
      });
      // Drop any sealed card left mid-turn — same reason skipTurn does.
      tx.delete(cardRef(roomId));
    }
  });
  return { ok: true };
}

async function rematch({ roomId }: { roomId: string }) {
  const uid = me();
  await wipeSubcollections(roomId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(roomId));
    if (!snap.exists()) throw new GameError("not-found", S("ar").err.roomMissing);
    const room = asRoom(roomId, snap.data() as Record<string, unknown>);
    requireHost(room, uid);
    if (room.phase === "lobby") return;
    // Preserve usedCards — rematches in this room keep drawing fresh
    // words until drawFrom recycles the whole deck.
    tx.update(roomRef(roomId), {
      phase: "lobby" as Phase,
      turnIndex: 0,
      turn: null,
      scores: { mint: 0, chili: 0 },
      round: emptyRound(),
      usedCards: room.usedCards ?? [],
      winner: null,
      endReason: null,
      phaseStartedAt: Date.now(),
      phaseEndsAt: null,
      updatedAt: Date.now(),
    });
  });
  return { ok: true };
}

/**
 * Clears the previous game's round records and any card left on the table.
 *
 * This is not cosmetic. Deleting a document does not delete its
 * subcollections — neither in Firestore nor here — so a room name that
 * gets reused (after the last player leaves, or after STALE_ROOM_MS)
 * still carries the old `rounds/*`. Skip this and the next game's final
 * screen shows the previous game's stats.
 *
 * Iterate `.docs` rather than `snapshot.forEach`: both exist on a real
 * QuerySnapshot, but `.docs` is the plain array and can't be missing.
 * A silent `catch` here previously hid exactly that mistake for a while,
 * which is why the failure is now surfaced instead of swallowed.
 */
async function wipeSubcollections(roomId: string) {
  const rounds = await getDocs(collection(db, "rooms", roomId, "rounds"));
  if (rounds.docs.length) {
    const batch = writeBatch(db);
    for (const d of rounds.docs) batch.delete(d.ref);
    await batch.commit();
  }
  await deleteDoc(cardRef(roomId)).catch(() => {});
}

export const api = {
  createRoom, joinRoom, leaveRoom, kickPlayer, updateSettings, shuffleTeams,
  setTeam, startGame, startTurn, ensureCard, resolve, buzz, claimSteal,
  advancePhase, rematch, hostControl, loadRoom,
};
