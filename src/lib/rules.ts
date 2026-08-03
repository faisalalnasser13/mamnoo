/**
 * Pure game logic. No Firebase imports — that is what makes the
 * simulator in test/sim possible. Keep it that way.
 */

import type {
  LogEntry, Outcome, Player, RoundRecord, Settings, Stats, TeamId, Turn,
} from "./types";

export type { TeamId, Turn, Settings, LogEntry, Outcome, RoundRecord, Stats };

export const TEAMS: TeamId[] = ["mint", "chili"];
export const OTHER: Record<TeamId, TeamId> = { mint: "chili", chili: "mint" };

/** First team to this ends the game, whatever the round count says. */
export const TARGET_SCORE = 21;
/** Skips per turn. Free — the cost is that a skip kills the streak. */
export const SKIPS_PER_TURN = 3;
/** From this streak length onward, every correct card is worth double. */
export const HEAT_EVERY = 3;
/** The opposing team's window after time runs out mid-card. */
export const STEAL_MS = 10_000;

/**
 * Skip is locked for the last stretch of a turn.
 *
 * Without this, the steal is trivially defused: with seconds left the
 * describer skips, which burns the card the other team has been
 * listening to and deals a fresh one they've heard nothing about. The
 * steal then lands on a word with no clues attached and is unwinnable
 * by design. Locking skip means whatever card is on the table at 0:00
 * is one the describer actually chose to fight for.
 */
export const SKIP_LOCKOUT_MS = 10_000;

/**
 * A card must have been in play this long for a steal to be offered.
 *
 * Closes the other half: bank a card at 0:02, a fresh one deals, time
 * expires immediately, and the opponents are asked to guess something
 * nobody described. Below this threshold the turn simply ends.
 */
export const STEAL_MIN_CLUE_MS = 5_000;
/** Small skew so a slightly-fast phone isn't rejected at the true deadline. */
export const CLOCK_SKEW_MS = 250;
/** Hidden beat after the host starts a turn, before the visible clock drains. */
export const TIMER_START_GRACE_MS = 500;
/** Soft urgency — timer goes orange below this. */
export const TIMER_WARN_MS = 15_000;
/** Hard rush — timer goes red and blinks below this. */
export const TIMER_RUSH_MS = 10_000;
/** Hidden cushion after the visible clock hits 0:00, before the phase flips. */
export const TIMER_GRACE_MS = 1_000;
/** How long the ممنوع stamp sits on the burnt card before the next one. */
export const BUZZ_HOLD_MS = 900;

/** Player display name. Room ids stay shorter — they're said out loud. */
export const NAME_MAX = 20;

export const ROUND_SECS_OPTIONS = [45, 60, 90] as const;
export const ROUNDS_PER_TEAM_OPTIONS = [3, 4, 5] as const;

export const DEFAULTS: Settings = { roundSecs: 60, roundsPerTeam: 4 };

export function snapSetting(n: number, options: readonly number[]): number {
  let best = options[1] ?? options[0];
  let dist = Infinity;
  for (const opt of options) {
    const d = Math.abs(opt - n);
    if (d < dist) { best = opt; dist = d; }
  }
  return best;
}

export const totalTurns = (s: Settings) => s.roundsPerTeam * 2;

/* ------------------------------------------------------------------ */
/* turn order                                                         */
/* ------------------------------------------------------------------ */

export function membersOf(players: Record<string, Player>, team: TeamId): string[] {
  return Object.entries(players)
    .filter(([, p]) => p.team === team)
    .sort((a, b) => a[1].joinedAt - b[1].joinedAt)
    .map(([uid]) => uid);
}

/**
 * Who explains and who judges on turn `index`.
 *
 * Teams alternate every turn, so each side describes exactly
 * `roundsPerTeam` times. Within a team the describer rotates, and the
 * judge always comes from the other side — that's what keeps the
 * non-active team listening instead of checking their phone.
 *
 * Returns null when either side is empty; callers must treat that as
 * "can't start", never as "pick anyone".
 */
export function rolesForTurn(
  players: Record<string, Player>,
  index: number,
): Turn | null {
  const mint = membersOf(players, "mint");
  const chili = membersOf(players, "chili");
  if (!mint.length || !chili.length) return null;

  const team: TeamId = index % 2 === 0 ? "mint" : "chili";
  const own = team === "mint" ? mint : chili;
  const opp = team === "mint" ? chili : mint;
  const lap = Math.floor(index / 2);

  return {
    team,
    clueGiverUid: own[lap % own.length],
    // Offset the chili lap so the same pair doesn't face off every time.
    judgeUid: opp[(lap + (team === "mint" ? 0 : 1)) % opp.length],
  };
}

/** The next turn index at which `uid` describes, or null. */
export function nextTurnFor(
  players: Record<string, Player>,
  from: number,
  total: number,
  uid: string,
): number | null {
  for (let i = from; i < total; i++) {
    if (rolesForTurn(players, i)?.clueGiverUid === uid) return i;
  }
  return null;
}

/** Prefer the smaller side; on a tie, derive from uid so it's txn-safe. */
export function pickBalancedTeam(mintN: number, chiliN: number, uid: string): TeamId {
  if (mintN < chiliN) return "mint";
  if (chiliN < mintN) return "chili";
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h + uid.charCodeAt(i) * (i + 1)) % 2;
  return h === 0 ? "mint" : "chili";
}

/** Even a shuffle must leave both sides playable, so it deals alternately. */
export function shuffledTeams(uids: string[], rand: () => number): Record<string, TeamId> {
  const order = [...uids];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const out: Record<string, TeamId> = {};
  order.forEach((uid, i) => { out[uid] = i % 2 === 0 ? "mint" : "chili"; });
  return out;
}

/* ------------------------------------------------------------------ */
/* scoring                                                            */
/* ------------------------------------------------------------------ */

export interface Resolution {
  streak: number;
  pts: number;
  skipsLeft: number;
}

/**
 * What one card outcome does to the round.
 *
 * `ok` grows the streak. The 3rd correct and every one after it are
 * worth 2 — heat stays on until a skip or buzz kills it. That's the
 * whole tension of the skip button: free in points, expensive in
 * momentum.
 */
export function resolveCard(
  res: Outcome,
  streak: number,
  skipsLeft: number,
): Resolution {
  if (res === "ok") {
    const next = streak + 1;
    return { streak: next, pts: next >= HEAT_EVERY ? 2 : 1, skipsLeft };
  }
  if (res === "skip") {
    return { streak: 0, pts: 0, skipsLeft: Math.max(0, skipsLeft - 1) };
  }
  if (res === "buzz") return { streak: 0, pts: -1, skipsLeft };
  return { streak: 0, pts: 1, skipsLeft }; // steal — credited to the other team
}

/** Skip is available until the lockout window opens. */
export function canSkip(skipsLeft: number, remainingMs: number | null): boolean {
  if (skipsLeft <= 0) return false;
  if (remainingMs === null) return true;
  return remainingMs > SKIP_LOCKOUT_MS;
}

/** Is the describer inside the no-swap window? */
export function inLockout(remainingMs: number | null): boolean {
  return remainingMs !== null && remainingMs > 0 && remainingMs <= SKIP_LOCKOUT_MS;
}

/**
 * A steal is only worth offering when the opponents actually heard the
 * card described. `cardAt` is when it was dealt.
 */
export function stealAllowed(cardAt: number | null, now: number): boolean {
  if (cardAt === null) return false;
  return now - cardAt >= STEAL_MIN_CLUE_MS;
}

/**
 * Silent start pad baked into a live turn's wall clock.
 * Resume mid-turn has a shorter span, so the pad collapses to 0.
 */
export function liveStartPad(
  phase: string,
  phaseStartedAt: number,
  phaseEndsAt: number,
  roundSecs: number,
): number {
  if (phase !== "live") return 0;
  const span = phaseEndsAt - phaseStartedAt;
  const nominal = roundSecs * 1000;
  return Math.min(TIMER_START_GRACE_MS, Math.max(0, span - nominal));
}

/** Filled pips under the card: 0, 1 or 2. Three would have already scored. */
/** Lit heat slots — grows with the streak; UI keeps at least three. */
export const heatPips = (streak: number) => Math.max(0, streak);

/** Team totals can go negative — a buzz at 0 is −1, not a free pass. */
export const applyPoints = (score: number, pts: number) => score + pts;

export function isOver(
  scores: Record<TeamId, number>,
  nextIndex: number,
  settings: Settings,
): "target" | "rounds" | null {
  if (scores.mint >= TARGET_SCORE || scores.chili >= TARGET_SCORE) return "target";
  if (nextIndex >= totalTurns(settings)) return "rounds";
  return null;
}

export function winnerOf(scores: Record<TeamId, number>): TeamId | "draw" {
  if (scores.mint === scores.chili) return "draw";
  return scores.mint > scores.chili ? "mint" : "chili";
}

/* ------------------------------------------------------------------ */
/* cards                                                              */
/* ------------------------------------------------------------------ */

/**
 * Pick an unused card. When the deck runs dry the used list is cleared
 * and the caller is told so, so a long game recycles instead of hanging.
 */
export function drawFrom(
  deckSize: number,
  used: number[],
  rand: () => number,
): { id: number; recycled: boolean } {
  const taken = new Set(used);
  let pool = Array.from({ length: deckSize }, (_, i) => i).filter((i) => !taken.has(i));
  const recycled = pool.length === 0;
  if (recycled) pool = Array.from({ length: deckSize }, (_, i) => i);
  return { id: pool[Math.floor(rand() * pool.length)], recycled };
}

/* ------------------------------------------------------------------ */
/* end-of-game stats                                                  */
/* ------------------------------------------------------------------ */

/**
 * Everything on the final screen comes from the round records that
 * already exist. Nothing here is tracked separately during play.
 */
export function computeStats(rounds: RoundRecord[]): Stats {
  const talked: Record<string, number> = {};
  const buzzed: Record<string, number> = {};
  let longest: { word: string; ms: number } | null = null;
  let streak: { uid: string; n: number } | null = null;

  for (const rd of rounds) {
    // `t` is ms from the turn's start, so the time a card spent on the
    // table is the gap between it and the card before it.
    let prevT = 0;
    let run = 0;
    // A record written before `log` existed has none. Never assume.
    for (const e of rd.log ?? []) {
      if (e.res === "ok") {
        talked[rd.clueGiverUid] = (talked[rd.clueGiverUid] ?? 0) + 1;
        run += 1;
        if (!streak || run > streak.n) streak = { uid: rd.clueGiverUid, n: run };
      } else if (e.res !== "host") {
        run = 0;
      }
      if (e.res === "buzz") buzzed[rd.judgeUid] = (buzzed[rd.judgeUid] ?? 0) + 1;
      // Steal/host have no card on the table — skip time-on-table.
      if (e.res !== "steal" && e.res !== "host") {
        const ms = e.t - prevT;
        // Under a second is a double-tap, not a struggle.
        if (ms >= 1000 && (!longest || ms > longest.ms)) longest = { word: e.w, ms };
      }
      prevT = e.t;
    }
  }

  const top = (o: Record<string, number>) => {
    const e = Object.entries(o).sort((a, b) => b[1] - a[1])[0];
    return e ? { key: e[0], n: e[1] } : null;
  };
  const t = top(talked), b = top(buzzed);

  return {
    talker: t && { uid: t.key, n: t.n },
    buzzer: b && { uid: b.key, n: b.n },
    longest,
    // A lone صح is not a streak worth naming.
    streak: streak && streak.n >= 2 ? streak : null,
  };
}

/** Points banked by each player as describer, for the transition board. */
export function pointsByPlayer(rounds: RoundRecord[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const rd of rounds) {
    out[rd.clueGiverUid] = (out[rd.clueGiverUid] ?? 0) + rd.points;
  }
  return out;
}
