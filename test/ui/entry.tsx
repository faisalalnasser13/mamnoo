/**
 * Renders every screen for every role against a set of room shapes and
 * reports anything that throws.
 *
 * The simulator proves the *engine* is correct; nothing proved the
 * screens could survive the data the engine produces. A single
 * `undefined.length` in a component white-screens that player's tab —
 * and if it's the describer's tab, nobody deals a card and the whole
 * table stalls waiting. That is exactly the failure this exists to catch.
 *
 * Deliberately includes rooms missing optional fields, because a room
 * document written by a previous deploy is the realistic case: it will
 * not have fields added since, and it stays in the database.
 */

import { renderToString } from "react-dom/server";
import type { ReactElement } from "react";
import { Lobby } from "../../src/screens/Lobby";
import {
  EndPhase, LivePhase, RecapPhase, StealPhase, TransitionPhase,
} from "../../src/screens/phases";
import type { Room, RoundRecord, TeamId } from "../../src/lib/types";
import type { LiveCard } from "../../src/lib/hooks";

const UIDS = ["a", "b", "c", "x", "y", "z"];
const NAMES: Record<string, string> = {
  a: "سلمى", b: "نورة", c: "ياسر", x: "عمر", y: "ليان", z: "فهد",
};

function players(): Room["players"] {
  const out: Room["players"] = {};
  UIDS.forEach((u, i) => {
    out[u] = {
      name: NAMES[u],
      team: (i < 3 ? "mint" : "chili") as TeamId,
      joinedAt: 1000 + i,
    };
  });
  return out;
}

const CARD: LiveCard = {
  cardId: 0, word: "قهوة عربية", taboo: ["دلة", "فنجان", "هيل", "مرّة", "ضيوف"],
};

/** The English deck's longest shape — the case that overflowed the card. */
const CARD_EN: LiveCard = {
  cardId: 1, word: "AIR CONDITIONER",
  taboo: ["COLD", "SUMMER", "REMOTE", "WINDOW", "ELECTRICITY"],
};

function room(over: Partial<Room> = {}): Room {
  const now = Date.now();
  return {
    id: "قهوة",
    hostUid: "a",
    phase: "live",
    turnIndex: 0,
    paused: false,
    phaseStartedAt: now - 20_000,
    phaseEndsAt: now + 40_000,
    settings: { roundSecs: 60, roundsPerTeam: 4 },
    players: players(),
    scores: { mint: 7, chili: 5 },
    turn: { team: "mint", clueGiverUid: "a", judgeUid: "x" },
    round: {
      cardId: 0, cardAt: now - 8000, skipsLeft: 2, streak: 2, points: 3,
      buzzedAt: null, stealEndsAt: null,
      log: [
        { w: "مطر", res: "ok", pts: 1, t: 4000 },
        { w: "بحر", res: "ok", pts: 1, t: 9000 },
        { w: "خريطة", res: "skip", pts: 0, t: 14000 },
      ],
    },
    usedCards: [0, 1, 2],
    lang: "ar",
    kit: "classic",
    winner: null,
    endReason: null,
    createdAt: now - 100_000,
    updatedAt: now,
    ...over,
  };
}

const ROUNDS: RoundRecord[] = [
  {
    index: 0, team: "mint", clueGiverUid: "a", judgeUid: "x", points: 5, at: 1,
    log: [
      { w: "مطر", res: "ok", pts: 1, t: 4000 },
      { w: "مقلوبة", res: "buzz", pts: -1, t: 26000 },
    ],
  },
  {
    index: 1, team: "chili", clueGiverUid: "x", judgeUid: "b", points: 4, at: 2,
    log: [{ w: "نخلة", res: "ok", pts: 1, t: 3000 }],
  },
];

interface Case { name: string; el: ReactElement }

export function cases(): Case[] {
  const out: Case[] = [];
  const add = (name: string, el: ReactElement) => out.push({ name, el });

  const phase = (
    label: string,
    r: Room,
    card: LiveCard | null,
    rounds: RoundRecord[],
    Comp: (p: { room: Room; uid: string; card: LiveCard | null; rounds: RoundRecord[] }) => ReactElement | null,
  ) => {
    for (const uid of UIDS) {
      add(`${label} · ${NAMES[uid]}`, <Comp room={r} uid={uid} card={card} rounds={rounds} />);
    }
  };

  /* ---- lobby ---- */
  for (const uid of UIDS) {
    add(`lobby · ${NAMES[uid]}`, <Lobby room={room({ phase: "lobby", turn: null })} uid={uid} />);
    add(`lobby en · ${NAMES[uid]}`,
      <Lobby room={room({ phase: "lobby", turn: null, lang: "en" })} uid={uid} />);
    add(`lobby cafe · ${NAMES[uid]}`,
      <Lobby room={room({ phase: "lobby", turn: null, kit: "cafe" })} uid={uid} />);
    // Nobody should be teamless, but the type allows it and the panels
    // have to decide which side is "mine" without one.
    add(`lobby · no team · ${NAMES[uid]}`, <Lobby uid={uid} room={room({
      phase: "lobby", turn: null,
      players: (() => {
        const p = players();
        p.c = { ...p.c, team: null as unknown as TeamId };
        return p;
      })(),
    })} />);
  }

  /* ---- turn 0 and turn 1: the roles swap, which is when it broke ---- */
  const turn0 = room();
  const turn1 = room({
    turnIndex: 1,
    turn: { team: "chili", clueGiverUid: "x", judgeUid: "b" },
    round: { ...room().round, log: [] },
  });

  phase("live t0", turn0, CARD, [], LivePhase as never);
  phase("live t1", turn1, CARD, [], LivePhase as never);
  phase("live t1 · no card yet", turn1, null,
    [], LivePhase as never);
  phase("live · buzzed", room({ round: { ...room().round, buzzedAt: Date.now() - 200 } }),
    CARD, [], LivePhase as never);
  phase("live · lockout", room({ phaseEndsAt: Date.now() + 6000 }), CARD, [], LivePhase as never);
  phase("live · empty log", room({ round: { ...room().round, log: [] } }),
    CARD, [], LivePhase as never);

  phase("steal", room({
    phase: "steal", phaseEndsAt: Date.now() + 6000,
    round: { ...room().round, stealEndsAt: Date.now() + 6000 },
  }), null, [], StealPhase as never);
  phase("steal · hinter has card", room({
    phase: "steal", phaseEndsAt: Date.now() + 6000,
    round: { ...room().round, stealEndsAt: Date.now() + 6000 },
  }), CARD, [], StealPhase as never);

  phase("recap", room({ phase: "recap", phaseEndsAt: null }), null, ROUNDS, RecapPhase as never);
  phase("recap · no rounds yet", room({ phase: "recap", phaseEndsAt: null }),
    null, [], RecapPhase as never);
  phase("live · paused", room({ paused: true }), CARD, [], LivePhase as never);
  phase("live · stalled, no card", room({
    round: { ...room().round, cardId: null, cardAt: null },
    phaseEndsAt: Date.now() + 20_000,
  }), null, [], LivePhase as never);

  phase("live en · long word", room({ lang: "en" }), CARD_EN, [], LivePhase as never);
  phase("live cafe", room({ kit: "cafe" }), CARD, [], LivePhase as never);
  // A live turn with no `turn` on it: only an older deploy writes that,
  // and every branch of the screen reads the team off it.
  phase("live · turn missing", room({ turn: null }), CARD, [], LivePhase as never);

  phase("transition t1", room({
    phase: "transition", phaseEndsAt: null, turnIndex: 1,
    turn: { team: "chili", clueGiverUid: "x", judgeUid: "b" },
  }), null, ROUNDS, TransitionPhase as never);

  phase("transition en", room({
    phase: "transition", phaseEndsAt: null, turnIndex: 2, lang: "en",
    turn: { team: "mint", clueGiverUid: "b", judgeUid: "y" },
  }), null, ROUNDS, TransitionPhase as never);

  // Past the schedule and tied: the wheel must draw no turns below the
  // one on the table, because overtime is dealt one turn at a time.
  phase("transition · overtime", room({
    phase: "transition", phaseEndsAt: null, turnIndex: 8,
    scores: { mint: 12, chili: 12 },
    turn: { team: "mint", clueGiverUid: "a", judgeUid: "x" },
  }), null, ROUNDS, TransitionPhase as never);

  phase("transition t0 · no rounds yet", room({
    phase: "transition", phaseEndsAt: null,
  }), null, [], TransitionPhase as never);

  phase("end · mint wins", room({
    phase: "over", phaseEndsAt: null, winner: "mint", endReason: "target",
    scores: { mint: 21, chili: 17 },
  }), null, ROUNDS, EndPhase as never);

  phase("end · draw", room({
    phase: "over", phaseEndsAt: null, winner: "draw", endReason: "rounds",
    scores: { mint: 18, chili: 18 },
  }), null, ROUNDS, EndPhase as never);

  phase("end · no rounds recorded", room({
    phase: "over", phaseEndsAt: null, winner: "chili", endReason: "rounds",
  }), null, [], EndPhase as never);

  /* ---- rooms written by an older deploy: fields that don't exist yet ---- */
  const partial = room({
    round: {
      cardId: 0, skipsLeft: 2, streak: 1, points: 2,
      buzzedAt: null, stealEndsAt: null,
      // `cardAt` and `log` were added after the first deploy. A room
      // created before it will simply not have them.
    } as Room["round"],
  });
  phase("live · legacy round (no log, no cardAt)", partial, CARD, [], LivePhase as never);
  phase("recap · legacy round", { ...partial, phase: "recap", phaseEndsAt: null },
    null, [], RecapPhase as never);

  const legacyRounds = [
    { index: 0, team: "mint", clueGiverUid: "a", judgeUid: "x", points: 3, at: 1 },
  ] as unknown as RoundRecord[];
  phase("end · legacy round records", room({
    phase: "over", phaseEndsAt: null, winner: "mint", endReason: "rounds",
  }), null, legacyRounds, EndPhase as never);
  phase("transition · legacy round records", room({
    phase: "transition", phaseEndsAt: null, turnIndex: 1,
    turn: { team: "chili", clueGiverUid: "x", judgeUid: "b" },
  }), null, legacyRounds, TransitionPhase as never);

  /* ---- a player who left mid-game is still referenced by turn ---- */
  const orphaned = room({
    players: (() => { const p = players(); delete p.x; return p; })(),
  });
  phase("live · judge left the room", orphaned, CARD, [], LivePhase as never);
  phase("transition · describer left the room", {
    ...orphaned, phase: "transition", phaseEndsAt: null,
  }, null, ROUNDS, TransitionPhase as never);

  return out;
}

export function run() {
  const results: Array<{ name: string; error: string | null }> = [];
  for (const c of cases()) {
    try {
      renderToString(c.el);
      results.push({ name: c.name, error: null });
    } catch (e) {
      results.push({ name: c.name, error: (e as Error).message });
    }
  }
  return results;
}
