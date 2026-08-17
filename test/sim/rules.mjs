/**
 * Edge cases in the pure rules, plus the deck invariants.
 * Run: node test/sim/run.mjs rules.mjs
 */

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const R = require(join(here, "lib/rules.cjs"));
const { DECK, ROOM_WORDS } = require(join(here, "lib/deck.cjs"));
const { DECK_EN, ROOM_WORDS_EN } = require(join(here, "lib/deck.en.cjs"));

let pass = 0;
const fails = [];
function ok(label, cond) {
  if (cond) { pass += 1; } else { fails.push(label); }
}
function eq(label, a, b) {
  ok(`${label} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`,
     JSON.stringify(a) === JSON.stringify(b));
}

/* ---------------- deck ---------------- */

ok("deck is non-trivial", DECK.length >= 900);
ok("room words outnumber a realistic concurrent load", ROOM_WORDS.length >= 30);
eq("room words are unique", new Set(ROOM_WORDS).size, ROOM_WORDS.length);
eq("card answers are unique", new Set(DECK.map((c) => c.w)).size, DECK.length);

ok("english deck is non-trivial", DECK_EN.length >= 600);
ok("english room words outnumber a realistic concurrent load", ROOM_WORDS_EN.length >= 30);
ok("english room words are unique", new Set(ROOM_WORDS_EN).size === ROOM_WORDS_EN.length);
eq("english card answers are unique", new Set(DECK_EN.map((c) => c.w)).size, DECK_EN.length);
for (const c of DECK_EN) {
  ok(`«${c.w}» has five taboo words`, c.t.length === 5);
  ok(`«${c.w}» taboo words are distinct`, new Set(c.t).size === 5);
}

for (const c of DECK) {
  ok(`«${c.w}» has five taboo words`, c.t.length === 5);
  ok(`«${c.w}» taboo words are distinct`, new Set(c.t).size === 5);
}

/* ---------------- heat ---------------- */

{
  let streak = 0;
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const r = R.resolveCard("ok", streak, 3);
    streak = r.streak;
    pts.push(r.pts);
  }
  eq("3rd and every correct after doubles", pts, [1, 1, 2, 2, 2, 2]);
}

eq("a skip kills the streak", R.resolveCard("skip", 2, 3).streak, 0);
eq("a skip does not spend a limited skip", R.resolveCard("skip", 2, 3).skipsLeft, 3);
eq("a skip costs half a point", R.resolveCard("skip", 2, 3).pts, -0.5);
eq("a buzz costs a point", R.resolveCard("buzz", 2, 3).pts, -1);
eq("a buzz kills the streak", R.resolveCard("buzz", 2, 3).streak, 0);

eq("heat pips grow with the streak", [0, 1, 2, 3, 4, 5].map(R.heatPips), [0, 1, 2, 3, 4, 5]);
eq("a buzz at zero goes negative", R.applyPoints(0, -1), -1);
eq("points otherwise add", R.applyPoints(7, 2), 9);
eq("negatives keep stacking", R.applyPoints(-1, -1), -2);

/* ---------------- turn order ---------------- */

const players = (mint, chili) => {
  const p = {};
  mint.forEach((n, i) => { p[n] = { name: n, team: "mint", joinedAt: i }; });
  chili.forEach((n, i) => { p[n] = { name: n, team: "chili", joinedAt: i }; });
  return p;
};

{
  const p = players(["a", "b"], ["x", "y"]);
  const turns = [0, 1, 2, 3, 4, 5].map((i) => R.rolesForTurn(p, i));
  eq("teams alternate every turn", turns.map((t) => t.team),
     ["mint", "chili", "mint", "chili", "mint", "chili"]);
  eq("describers rotate inside a team", turns.map((t) => t.clueGiverUid),
     ["a", "x", "b", "y", "a", "x"]);
  ok("the judge is always from the other side",
     turns.every((t) => p[t.judgeUid].team !== t.team));
  ok("nobody judges their own clue", turns.every((t) => t.judgeUid !== t.clueGiverUid));
}

{
  // Uneven sides must still work — this is the common case at a real table.
  const p = players(["a"], ["x", "y", "z"]);
  const turns = Array.from({ length: 8 }, (_, i) => R.rolesForTurn(p, i));
  ok("uneven teams still deal a describer every turn", turns.every((t) => t !== null));
  ok("the solo player describes every one of their team's turns",
     turns.filter((t) => t.team === "mint").every((t) => t.clueGiverUid === "a"));
}

ok("an empty side cannot start", R.rolesForTurn(players([], ["x"]), 0) === null);
ok("an empty opposing side cannot start", R.rolesForTurn(players(["a"], []), 0) === null);

{
  const p = players(["a", "b"], ["x", "y"]);
  eq("a player is told their next turn", R.nextTurnFor(p, 0, 8, "b"), 2);
  eq("no upcoming turn reads as null", R.nextTurnFor(p, 5, 6, "b"), null);
}

/* ---------------- balancing ---------------- */

eq("a joiner fills the smaller side", R.pickBalancedTeam(3, 1, "u"), "chili");
eq("a joiner fills the smaller side (mirrored)", R.pickBalancedTeam(0, 2, "u"), "mint");
{
  const t1 = R.pickBalancedTeam(2, 2, "same-uid");
  const t2 = R.pickBalancedTeam(2, 2, "same-uid");
  eq("a tie-break is stable for the same uid (transaction-safe)", t1, t2);
}

{
  const uids = ["a", "b", "c", "d", "e"];
  let n = 0;
  const out = R.shuffledTeams(uids, () => { n = (n * 9301 + 49297) % 233280; return n / 233280; });
  const mint = Object.values(out).filter((t) => t === "mint").length;
  ok("a shuffle never empties a side", mint > 0 && mint < uids.length);
  ok("a shuffle keeps sides within one of each other",
     Math.abs(mint - (uids.length - mint)) <= 1);
  eq("a shuffle assigns everyone", Object.keys(out).length, uids.length);
}

/* ---------------- ending ---------------- */

const S = { roundSecs: 60, roundsPerTeam: 4 };
eq("total turns is per-team times two", R.totalTurns(S), 8);
eq("scheduled turns still running are not over", R.isOver({ mint: 21, chili: 3 }, 2, S), null);
eq("running out of turns with a lead ends it", R.isOver({ mint: 5, chili: 4 }, 8, S), "rounds");
eq("mid-game is not over", R.isOver({ mint: 5, chili: 4 }, 3, S), null);
eq("a tie past the round count extends", R.isOver({ mint: 21, chili: 21 }, 8, S), null);
eq("overtime ends once someone leads", R.isOver({ mint: 22, chili: 21 }, 10, S), "rounds");
eq("winner reads the score", R.winnerOf({ mint: 9, chili: 4 }), "mint");
eq("a level score is a draw", R.winnerOf({ mint: 4, chili: 4 }), "draw");

/* ---------------- drawing ---------------- */

{
  const seen = new Set();
  let used = [];
  for (let i = 0; i < DECK.length; i++) {
    const { id, recycled } = R.drawFrom(DECK.length, used, Math.random);
    ok(`draw ${i} is fresh`, !seen.has(id) && !recycled);
    seen.add(id);
    used = [...used, id];
  }
  const after = R.drawFrom(DECK.length, used, Math.random);
  ok("an exhausted deck recycles instead of hanging", after.recycled === true);
  ok("the recycled draw is still a real card", after.id >= 0 && after.id < DECK.length);
}

/* ---------------- skip lockout & steal eligibility ---------------- */

ok("skip is available early in a turn", R.canSkip(40000));
ok("skip is locked in the final stretch", !R.canSkip(9000));
ok("skip is locked exactly at the boundary", !R.canSkip(R.SKIP_LOCKOUT_MS));
ok("a null clock (paused) does not lock skip", R.canSkip(null));

ok("lockout is off early", !R.inLockout(40000));
ok("lockout is on late", R.inLockout(4000));
ok("lockout is off once time is gone", !R.inLockout(0));
ok("lockout is off with no clock", !R.inLockout(null));

/* ---------------- stats ---------------- */

{
  const rounds = [
    {
      index: 0, team: "mint", clueGiverUid: "a", judgeUid: "x", points: 4, at: 0,
      log: [
        { w: "بحر", res: "ok", pts: 1, t: 3000 },
        { w: "قمر", res: "ok", pts: 1, t: 5000 },
        { w: "مطر", res: "ok", pts: 2, t: 9000 },
        { w: "مقلوبة", res: "buzz", pts: -1, t: 31000 },
      ],
    },
    {
      index: 1, team: "chili", clueGiverUid: "x", judgeUid: "a", points: 1, at: 0,
      log: [
        { w: "خريطة", res: "skip", pts: 0, t: 5000 },
        { w: "شاي", res: "ok", pts: 1, t: 7000 },
      ],
    },
  ];
  const s = R.computeStats(rounds);
  eq("top describer counts only banked cards", s.talker, { uid: "a", n: 3 });
  eq("buzzes are credited to the judge who pressed", s.buzzer, { uid: "x", n: 1 });
  // مقلوبة sat from 9s to 31s — 22 seconds, the longest of any card.
  eq("longest card measures time on the table, not the timestamp",
     s.longest, { word: "مقلوبة", ms: 22000 });
  // a: ok,ok,ok then buzz — hottest run is 3.
  eq("hottest streak is the longest consecutive صح run", s.streak, { uid: "a", n: 3 });
  eq("exactly four stats are reported", Object.keys(s).sort(),
     ["buzzer", "longest", "streak", "talker"]);
}

{
  const s = R.computeStats([]);
  ok("no rounds yields no stats rather than throwing",
     s.talker === null && s.buzzer === null && s.longest === null && s.streak === null);
}

{
  // Sub-second gaps are double-taps on صح, not a card anyone struggled with.
  const s = R.computeStats([{
    index: 0, team: "mint", clueGiverUid: "a", judgeUid: "x", points: 2, at: 0,
    log: [
      { w: "أ", res: "ok", pts: 1, t: 200 },
      { w: "ب", res: "ok", pts: 1, t: 500 },
    ],
  }]);
  ok("a run of double-taps has no longest card", s.longest === null);
}

{
  // A steal has no card of its own; it must not become "أطول كلمة".
  const s = R.computeStats([{
    index: 0, team: "mint", clueGiverUid: "a", judgeUid: "x", points: 0, at: 0,
    log: [{ w: "سرقة", res: "steal", pts: 1, t: 60000 }],
  }]);
  ok("a steal never becomes the longest card", s.longest === null);
  ok("a steal is not counted as a card explained", s.talker === null);
}

{
  const s = R.computeStats([{
    index: 0, team: "mint", clueGiverUid: "a", judgeUid: "x", points: 1, at: 0,
    log: [
      { w: "بحر", res: "ok", pts: 1, t: 5000 },
      { w: "host +1", res: "host", pts: 1, t: 6000 },
    ],
  }]);
  ok("a host correction never becomes the longest card", s.longest?.word === "بحر");
  eq("a host correction does not count as a card explained", s.talker, { uid: "a", n: 1 });
}

{
  const rounds = [
    { index: 0, team: "mint", clueGiverUid: "a", judgeUid: "x", points: 4, at: 0, log: [] },
    { index: 1, team: "chili", clueGiverUid: "x", judgeUid: "a", points: 2, at: 0, log: [] },
    { index: 2, team: "mint", clueGiverUid: "a", judgeUid: "x", points: 3, at: 0, log: [] },
  ];
  eq("per-player points accumulate across a player's turns",
     R.pointsByPlayer(rounds), { a: 7, x: 2 });
  eq("a player who hasn't described yet is absent, not zero",
     R.pointsByPlayer(rounds).b, undefined);
}

/* ---------------- settings ---------------- */

eq("an odd timer snaps to the nearest option", R.snapSetting(50, R.ROUND_SECS_OPTIONS), 45);
eq("a huge timer clamps to the top option", R.snapSetting(9999, R.ROUND_SECS_OPTIONS), 90);
eq("a negative round count clamps to the bottom", R.snapSetting(-4, R.ROUNDS_PER_TEAM_OPTIONS), 3);
eq("eight turns per team is a real option", R.snapSetting(8, R.ROUNDS_PER_TEAM_OPTIONS), 8);

/* ---------------- report ---------------- */

if (fails.length) {
  console.error(`\n✗ ${fails.length} failed of ${pass + fails.length}\n`);
  for (const f of fails) console.error("  ·", f);
  process.exit(1);
}
console.log(`✓ rules: ${pass} assertions passed`);
