import { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { db, api } from "./firebase";
import {
  CLOCK_SKEW_MS, TIMER_GRACE_MS, TIMER_WARN_MS, TIMER_RUSH_MS,
  BUZZ_HOLD_MS, liveStartPad,
} from "./rules";
import type { Room, RoundRecord, TeamId } from "./types";

/**
 * Fill in anything a room document might be missing.
 *
 * Firestore returns exactly what was written. A room created by an
 * earlier deploy has no `round.cardAt`, and a round mid-write has no
 * `log` — and a component that does `log.length` on undefined
 * white-screens that player's tab. If it's the describer's tab, nobody
 * deals a card and the entire table sits waiting on a turn that will
 * never start.
 *
 * Normalising once here is far safer than guarding at every read site,
 * because the next new field will be missing from old documents too.
 */
function normalizeRoom(id: string, raw: Record<string, unknown>): Room {
  const r = raw as Partial<Room>;
  const round = (r.round ?? {}) as Partial<Room["round"]>;
  return {
    id,
    hostUid: r.hostUid ?? "",
    phase: r.phase ?? "lobby",
    turnIndex: r.turnIndex ?? 0,
    paused: r.paused ?? false,
    phaseStartedAt: r.phaseStartedAt ?? Date.now(),
    phaseEndsAt: r.phaseEndsAt ?? null,
    settings: {
      roundSecs: r.settings?.roundSecs ?? 60,
      roundsPerTeam: r.settings?.roundsPerTeam ?? 4,
    },
    players: r.players ?? {},
    scores: { mint: r.scores?.mint ?? 0, chili: r.scores?.chili ?? 0 },
    turn: r.turn ?? null,
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
    usedCards: Array.isArray(r.usedCards) ? r.usedCards : [],
    winner: r.winner ?? null,
    endReason: r.endReason ?? null,
    createdAt: r.createdAt ?? 0,
    updatedAt: r.updatedAt ?? 0,
  };
}

/** Same idea for a finished turn: `log` must always be an array. */
function normalizeRound(raw: Record<string, unknown>): RoundRecord {
  const r = raw as Partial<RoundRecord>;
  return {
    index: r.index ?? 0,
    team: r.team ?? "mint",
    clueGiverUid: r.clueGiverUid ?? "",
    judgeUid: r.judgeUid ?? "",
    points: r.points ?? 0,
    log: Array.isArray(r.log) ? r.log : [],
    at: r.at ?? 0,
  };
}

/* ------------------------------------------------------------------ */
/* subscriptions                                                      */
/* ------------------------------------------------------------------ */

export function useRoom(roomId: string | null) {
  const [room, setRoom] = useState<Room | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!roomId) { setRoom(null); setMissing(false); return; }
    return onSnapshot(
      doc(db, "rooms", roomId),
      (s) => {
        if (!s.exists()) { setMissing(true); setRoom(null); return; }
        setMissing(false);
        setRoom(normalizeRoom(s.id, s.data() as Record<string, unknown>));
      },
      () => setMissing(true),
    );
  }, [roomId]);

  return { room, missing };
}

export interface LiveCard { cardId: number; word: string; taboo: string[] }

/**
 * The card in play. Security rules make this unreadable to anyone but
 * the clue-giver and the judge, so a guesser opening devtools gets a
 * permission error, not the answer.
 *
 * Retries on error: a permission blip at the moment roles flip used to
 * kill the listener until refresh.
 */
export function useCard(roomId: string | null, allowed: boolean) {
  const [card, setCard] = useState<LiveCard | null>(null);

  useEffect(() => {
    if (!roomId || !allowed) { setCard(null); return; }

    let cancelled = false;
    let unsub: (() => void) | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const subscribe = () => {
      if (cancelled) return;
      unsub = onSnapshot(
        doc(db, "rooms", roomId, "secret", "card"),
        (s) => {
          attempt = 0;
          setCard(s.exists() ? (s.data() as LiveCard) : null);
        },
        () => {
          setCard(null);
          if (cancelled) return;
          const delay = Math.min(8000, 300 * 2 ** attempt);
          attempt += 1;
          retry = setTimeout(() => { unsub?.(); subscribe(); }, delay);
        },
      );
    };

    subscribe();
    return () => { cancelled = true; if (retry) clearTimeout(retry); unsub?.(); };
  }, [roomId, allowed]);

  return card;
}

/**
 * Buzz the describer's phone when the judge stamps their card.
 *
 * This is `navigator.vibrate`, a browser API — nothing to do with
 * Firebase. It works on Android Chrome and is **silently absent on iOS
 * Safari**, which has never shipped it; there is no polyfill, so an
 * iPhone describer gets the shake and the stamp and no haptic. Treated
 * as an enhancement, never as the only signal.
 */
export function useBuzzHaptic(active: boolean, at: number | null) {
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!active || at === null || last.current === at) return;
    last.current = at;
    try {
      // Two sharp pulses read as "stop", where one reads as a notification.
      navigator.vibrate?.([90, 60, 140]);
    } catch { /* unsupported or blocked by a permissions policy */ }
  }, [active, at]);
}

export function useRounds(roomId: string | null, enabled: boolean) {
  const [rounds, setRounds] = useState<RoundRecord[]>([]);
  useEffect(() => {
    if (!roomId || !enabled) { setRounds([]); return; }
    return onSnapshot(
      query(collection(db, "rooms", roomId, "rounds"), orderBy("index")),
      (s) => setRounds(s.docs.map((d) => normalizeRound(d.data() as Record<string, unknown>))),
      () => setRounds([]),
    );
  }, [roomId, enabled]);
  return rounds;
}

/* ------------------------------------------------------------------ */
/* countdown                                                          */
/* ------------------------------------------------------------------ */

/**
 * Counts down against the absolute `phaseEndsAt`. The clock is never
 * written during a turn — only the deadline is — so a 60-second round
 * costs one write, not sixty.
 *
 * `rush` is the last ten seconds: that's what turns the timer red and
 * makes the screen edges pulse.
 */
export function useCountdown(room: Room | null) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  if (!room || room.phaseEndsAt == null) {
    return {
      remaining: null, total: null, pct: 1, expired: false,
      warn: false, rush: false, inStartGrace: false,
    };
  }

  // A live turn's wall span is start-grace + roundSecs. Anything shorter
  // (a resume mid-turn) has already spent the silent beat.
  const span = room.phaseEndsAt - room.phaseStartedAt;
  const startPad = liveStartPad(
    room.phase, room.phaseStartedAt, room.phaseEndsAt, room.settings.roundSecs,
  );
  const total = Math.max(1, span - startPad);
  const inStartGrace = !room.paused && now < room.phaseStartedAt + startPad;
  const remaining = inStartGrace
    ? total
    : Math.max(0, Math.min(total, room.phaseEndsAt - now));
  const ticking = !room.paused && !inStartGrace && remaining > 0;

  return {
    remaining: room.paused ? null : remaining,
    total,
    pct: Math.max(0, Math.min(1, remaining / total)),
    expired: !room.paused && now + CLOCK_SKEW_MS >= room.phaseEndsAt + TIMER_GRACE_MS,
    warn: ticking && remaining <= TIMER_WARN_MS && remaining > TIMER_RUSH_MS,
    rush: ticking && remaining <= TIMER_RUSH_MS,
    inStartGrace,
  };
}

/* ------------------------------------------------------------------ */
/* drivers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Drives the clock-based transitions (live → steal → recap).
 *
 * The clue-giver fires the instant the clock runs out — they're the one
 * device guaranteed to be awake and looking at the screen. Everyone else
 * waits two seconds and fires as a backstop, so a locked phone can't
 * freeze the table. Duplicates are no-ops.
 *
 * `fired` marks an in-flight or completed attempt. A cancelled timeout
 * must clear it, or a room snapshot arriving between arming and firing
 * leaves the phase stuck until refresh.
 */
export function usePhaseDriver(room: Room | null, uid: string | null) {
  const { expired } = useCountdown(room);
  const fired = useRef("");
  const inFlight = useRef(false);

  const roomId = room?.id ?? null;
  const phase = room?.phase ?? null;
  const turnIndex = room?.turnIndex ?? null;
  const paused = room?.paused ?? false;
  const giverUid = room?.turn?.clueGiverUid ?? null;

  useEffect(() => {
    if (!roomId || !uid || !expired || paused) return;
    if (phase !== "live" && phase !== "steal") return;
    if (turnIndex == null) return;

    const stamp = `${phase}:${turnIndex}`;
    if (fired.current === stamp) return;
    fired.current = stamp;

    const delay = giverUid === uid ? 0 : 2000;
    let started = false;
    const t = setTimeout(() => {
      started = true;
      inFlight.current = true;
      api.advancePhase({ roomId, fromPhase: phase, fromTurn: turnIndex })
        .catch(() => { fired.current = ""; })
        .finally(() => { inFlight.current = false; });
    }, delay);

    return () => {
      clearTimeout(t);
      if (!started && !inFlight.current && fired.current === stamp) fired.current = "";
    };
  }, [roomId, phase, turnIndex, paused, giverUid, uid, expired]);
}

/**
 * Turns the judge's ممنوع mark into the actual −1 once the stamp has
 * had its moment. Only the clue-giver drives it, so the score has a
 * single writer; the judge is the fallback if the giver's phone dies.
 */
export function useBuzzDriver(room: Room | null, uid: string | null) {
  const fired = useRef("");

  useEffect(() => {
    const buzzedAt = room?.round?.buzzedAt ?? null;
    if (!room || !uid || buzzedAt == null || room.phase !== "live") return;

    const stamp = `${room.turnIndex}:${buzzedAt}`;
    if (fired.current === stamp) return;

    const isGiver = room.turn?.clueGiverUid === uid;
    const isJudge = room.turn?.judgeUid === uid;
    if (!isGiver && !isJudge) return;

    const wait = Math.max(0, buzzedAt + BUZZ_HOLD_MS - Date.now()) + (isGiver ? 0 : 1500);
    const t = setTimeout(() => {
      fired.current = stamp;
      api.advancePhase({
        roomId: room.id, fromPhase: "live", fromTurn: room.turnIndex, force: true,
      }).catch(() => { fired.current = ""; });
    }, wait);
    return () => clearTimeout(t);
  }, [room?.id, room?.phase, room?.turnIndex, room?.round?.buzzedAt, room?.turn?.clueGiverUid, room?.turn?.judgeUid, uid]);
}

/**
 * Keeps a card on the table. Only the clue-giver deals, and `ensureCard`
 * is idempotent on `round.cardId`, so this can fire as often as it likes.
 */
export function useCardDealer(room: Room | null, uid: string | null) {
  useEffect(() => {
    if (!room || !uid) return;
    if (room.phase !== "live") return;
    if (room.turn?.clueGiverUid !== uid) return;
    if (room.round.cardId !== null || room.round.buzzedAt !== null) return;
    if (room.phaseEndsAt === null) return;
    if (Date.now() >= room.phaseEndsAt) return;

    // Hold the first card through the silent start beat — dealing during
    // grace burns description time the table hasn't started watching yet.
    const pad = liveStartPad(
      room.phase, room.phaseStartedAt, room.phaseEndsAt, room.settings.roundSecs,
    );
    const wait = Math.max(0, room.phaseStartedAt + pad - Date.now());

    let alive = true;
    const deal = () => { if (alive) api.ensureCard({ roomId: room.id }).catch(() => {}); };
    const start = setTimeout(deal, wait);
    // One retry covers a transaction that lost a race with the judge.
    const retry = setTimeout(deal, wait + 1200);
    return () => { alive = false; clearTimeout(start); clearTimeout(retry); };
  }, [
    room?.id, room?.phase, room?.phaseStartedAt, room?.phaseEndsAt,
    room?.settings.roundSecs, room?.round?.cardId, room?.round?.buzzedAt,
    room?.turn?.clueGiverUid, uid,
  ]);
}

/* ------------------------------------------------------------------ */
/* local identity                                                     */
/* ------------------------------------------------------------------ */

function readLocal<T>(key: string, initial: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : initial;
  } catch { return initial; }
}

export function useLocal<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => readLocal(key, initial));
  const [storedKey, setStoredKey] = useState(key);
  if (key !== storedKey) { setStoredKey(key); setV(readLocal(key, initial)); }
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ }
  }, [key, v]);
  return [v, setV] as const;
}

/** Short-lived error line under the buttons. */
export function useFlash() {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const flash = useMemo(
    () => (m: string) => {
      setMsg(m);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setMsg(null), 2600);
    },
    [],
  );
  useEffect(() => () => clearTimeout(timer.current), []);
  return { msg, flash };
}

export type { TeamId };
