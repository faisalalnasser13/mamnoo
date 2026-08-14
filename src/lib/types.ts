export type TeamId = "mint" | "chili";

export type Lang = "ar" | "en";

export type Phase = "lobby" | "transition" | "live" | "steal" | "recap" | "over";

/** How a card left play — or a host score correction on the call. */
export type Outcome = "ok" | "skip" | "buzz" | "steal" | "host";

// TEAMS / OTHER live in rules.ts: this file stays declaration-only so
// `import type` from it erases completely and rules.ts compiles to a
// module with no imports, which is what lets the simulator load it.

export interface Player {
  name: string;
  team: TeamId | null;
  joinedAt: number;
}

export interface Settings {
  /** 45 | 60 | 90 */
  roundSecs: number;
  /** 3–8 — turns per team, so total turns = roundsPerTeam * 2 */
  roundsPerTeam: number;
}

export interface Turn {
  team: TeamId;
  clueGiverUid: string;
  judgeUid: string;
}

export interface LogEntry {
  /** The card's word. Only written once the card has left play. */
  w: string;
  res: Outcome;
  pts: number;
  /** ms from round start — the only thing "أسرع تخمين" is computed from. */
  t: number;
}

export interface RoundState {
  cardId: number | null;
  /** When the current card was dealt — the steal eligibility clock. */
  cardAt: number | null;
  /** Legacy seed; skips are unlimited — kept so old rooms normalize cleanly. */
  skipsLeft: number;
  /** Consecutive correct. From the 3rd onward worth 2. Reset by skip or buzz. */
  streak: number;
  points: number;
  /** Set by the judge; the clue-giver's device turns it into a resolution. */
  buzzedAt: number | null;
  stealEndsAt: number | null;
  log: LogEntry[];
}

export interface Room {
  id: string;
  hostUid: string;
  /** Locked at create — never changes mid-game. Old rooms default to ar. */
  lang: Lang;
  phase: Phase;
  /** 0-based. Even turns belong to mint, odd to chili. */
  turnIndex: number;
  paused: boolean;
  /** Milliseconds banked when the host paused, restored on resume. */
  pausedLeft?: number | null;
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  settings: Settings;
  players: Record<string, Player>;
  scores: Record<TeamId, number>;
  turn: Turn | null;
  round: RoundState;
  usedCards: number[];
  winner: TeamId | "draw" | null;
  endReason: "target" | "rounds" | "abandoned" | null;
  createdAt: number;
  updatedAt: number;
}

/** One finished turn, kept for the end-of-game stats. */
export interface RoundRecord {
  index: number;
  team: TeamId;
  clueGiverUid: string;
  judgeUid: string;
  points: number;
  log: LogEntry[];
  at: number;
}

/** End-of-game stats, derived from round records after the fact. */
export interface Stats {
  /** Most cards explained. */
  talker: { uid: string; n: number } | null;
  /** Most ممنوع presses. */
  buzzer: { uid: string; n: number } | null;
  /**
   * The card that sat on the table longest before it was resolved.
   *
   * This replaced "the word that fell most often", which was dead on
   * arrival: no word repeats inside a game, so nothing could ever fall
   * twice and the stat was always null.
   */
  longest: { word: string; ms: number } | null;
  /** Longest consecutive صح run inside a single turn. */
  streak: { uid: string; n: number } | null;
}
