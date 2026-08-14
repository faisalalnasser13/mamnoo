import React from "react";
import { api, errText } from "../lib/firebase";
import { useBuzzHaptic, useCountdown, useFlash, type LiveCard } from "../lib/hooks";
import {
  canSkip, computeStats, inLockout, membersOf, nextTurnFor, OTHER,
  rolesForTurn, SKIP_LOCKOUT_MS, totalTurns,
} from "../lib/rules";
import type { Room, RoundRecord, TeamId } from "../lib/types";
import { S, type Strings } from "../lib/strings";
import { Avatar, Btn, Flash, Label, TEAM, Waiting, YouChip } from "../components/ui";
import { HostControls, PausedBanner, ScoreBoard } from "../components/host";
import { Card, CardSkeleton, Feed, Heat, Hud, RunLine } from "../components/game";

type Ctx = {
  room: Room;
  uid: string;
  card: LiveCard | null;
  rounds: RoundRecord[];
};

const nameOf = (room: Room, uid: string) => room.players[uid]?.name ?? "…";
const myTeam = (room: Room, uid: string) => room.players[uid]?.team ?? null;

/** Names per side, for the recap scoreboard. */
const rosters = (room: Room): Record<TeamId, string[]> => ({
  mint: membersOf(room.players, "mint").map((u) => nameOf(room, u)),
  chili: membersOf(room.players, "chili").map((u) => nameOf(room, u)),
});

export function roleOf(room: Room, uid: string): "giver" | "judge" | "guesser" {
  if (room.turn?.clueGiverUid === uid) return "giver";
  if (room.turn?.judgeUid === uid) return "judge";
  return "guesser";
}

/* ------------------------------------------------------------------ */
/* live                                                               */
/* ------------------------------------------------------------------ */

export function LivePhase({ room, uid, card }: Ctx) {
  const { remaining, pct, warn, rush } = useCountdown(room);
  const { msg, flash } = useFlash();
  const s = S(room.lang);
  const role = roleOf(room, uid);
  const team = myTeam(room, uid);
  const buzzed = room.round.buzzedAt !== null;
  const cardId = room.round.cardId;
  const locked = inLockout(remaining);
  // A turn that is well underway with no card means the describer's
  // device never dealt one.
  const stalled = room.round.cardId === null
    && remaining !== null && remaining < (room.settings.roundSecs * 1000) - 6000;

  // Only the describer is holding the phone that matters here.
  useBuzzHaptic(role === "giver", room.round.buzzedAt);

  const call = (p: Promise<unknown>) => p.catch((e) => flash(errText(e, room.lang)));

  /* A live phase with no turn on it can only come from a document an
     older deploy wrote. Every branch below needs the team at minimum,
     and reading it off null is exactly the white-screen the render
     smoke test exists to stop. */
  const turn = room.turn;
  if (!turn) {
    return (
      <div className="shell justify-center">
        <Label>{s.waitingCard}</Label>
      </div>
    );
  }

  /* ---- describer ---- */
  if (role === "giver") {
    const own = room.scores[turn.team];
    const opp = room.scores[OTHER[turn.team]];
    const gap = own - opp;
    // No tatweel (ـ) anywhere in the UI — it renders as a gap in Tajawal.
    const gapText = gap > 0 ? s.aheadBy(gap)
      : gap < 0 ? s.behindBy(-gap) : s.tied;

    return (
      <div className="shell">
        {team && <YouChip team={team} extra={s.chipExplain} />}
        <div className="h-2.5" />
        <Hud remaining={remaining} pct={pct} warn={warn} rush={rush} scores={room.scores} />
        <div className="h-3.5" />

        {card
          ? <Card word={card.word} taboo={card.taboo} stamp={s.stamp}
              kicker={buzzed ? "…" : rush ? s.hurry : s.explainIt} buzzed={buzzed} />
          : <CardSkeleton note={s.drawing} unknown={s.unknownCard} />}

        <Heat streak={room.round.streak}
          note={buzzed ? s.heatOff
            : room.round.streak >= 2 ? s.heatNext
            : undefined} />

        <RunLine red={buzzed}>
          {buzzed ? s.burned : s.thisRound(room.round.points, gapText)}
        </RunLine>

        {room.paused && <PausedBanner lang={room.lang} />}
        <Flash msg={msg} />
        <div className="flex-1" />
        {room.hostUid === uid && <HostControls room={room} />}
        <div className="mt-2 flex flex-col gap-3">
          <Btn variant="mint" disabled={buzzed || cardId === null}
            onClick={() => cardId !== null && call(api.resolve({ roomId: room.id, res: "ok", fromCardId: cardId }))}>
            {s.correct}
          </Btn>
          <Btn variant="ghost"
            disabled={buzzed || cardId === null || !canSkip(remaining)}
            onClick={() => cardId !== null && call(api.resolve({ roomId: room.id, res: "skip", fromCardId: cardId }))}>
            {locked
              ? s.skipLocked(SKIP_LOCKOUT_MS / 1000)
              : <>{s.skip} <span className="text-chili">−0.5</span></>}
          </Btn>
        </div>
      </div>
    );
  }

  /* ---- judge ---- */
  if (role === "judge") {
    return (
      <div className="shell">
        {team && <YouChip team={team} extra={s.chipJudge} />}
        <div className="h-2.5" />
        <Hud remaining={remaining} pct={pct} warn={warn} rush={rush} scores={room.scores} />
        <div className="h-3.5" />
        {card
          ? <Card word={card.word} taboo={card.taboo} buzzed={buzzed} small stamp={s.stamp} />
          : <CardSkeleton note={s.waitingCard} unknown={s.unknownCard} />}
        {/* Only the describer's device deals. If theirs is asleep or its
            tab crashed, no card ever arrives and the clock can't rescue
            the turn — so say so instead of showing a silent spinner. */}
        {!card && stalled && (
          <p className="mt-3 text-center text-[12.5px] leading-relaxed text-muted">
            {s.stalled(nameOf(room, turn.clueGiverUid))}
          </p>
        )}
        {room.paused && <PausedBanner lang={room.lang} />}
        <Flash msg={msg} />
        <div className="flex-1" />
        {room.hostUid === uid && <HostControls room={room} />}
        <Btn variant="chili" huge disabled={buzzed || cardId === null}
          onClick={() => cardId !== null && call(api.buzz({ roomId: room.id, fromCardId: cardId }))}>
          {s.buzz}
        </Btn>
        <div className="h-2.5" />
        <Label>{s.buzzHint}</Label>
      </div>
    );
  }

  /* ---- the buzz, seen from the floor ----

     The judge and describer both get a stamped card and a shake. Without
     this branch the guessers get nothing at all for ~900ms and then a
     line quietly appears in a list — the loudest moment in the game,
     invisible to most of the table. */
  if (buzzed) {
    return (
      <div className="shell">
        {team && <YouChip team={team} />}
        <div className="h-2.5" />
        <Hud remaining={remaining} pct={pct} warn={warn} rush={rush} scores={room.scores} />
        <div className="flex-1" />
        <p className="text-center font-display text-[64px] leading-none text-chili">{s.floorBuzz}</p>
        <p className="mt-3 text-center text-[15px] font-bold text-muted">
          {s.saidTaboo(nameOf(room, turn.clueGiverUid))}
        </p>
        <p className="mt-1 text-center text-[13px] text-muted">
          {mineTurn(room, uid) ? s.burnedUs : s.burnedThem}
        </p>
        <div className="flex-1" />
      </div>
    );
  }

  /* ---- my team is guessing ---- */
  const mine = team === turn.team;

  if (mine) {
    return (
      <div className="shell">
        {team && <YouChip team={team} extra={s.chipGuess} />}
        <div className="h-2.5" />
        <Hud remaining={remaining} pct={pct} warn={warn} rush={rush} scores={room.scores} />
        <div className="h-5" />
        <Label>{s.explainingNow}</Label>
        <p className="mt-1 text-center font-display text-[32px]">
          {nameOf(room, turn.clueGiverUid)} 🎤
        </p>
        <Heat streak={room.round.streak} />
        {/* A long turn banks a dozen cards; without a cap the list pushes
            the rest of the screen off the bottom. */}
        <div className="max-h-[34vh] overflow-y-auto">
          <Feed log={room.round.log} newestFirst lang={room.lang} />
        </div>
        {room.paused && <PausedBanner lang={room.lang} />}
        <div className="flex-1" />
        {room.hostUid === uid && <HostControls room={room} />}
        <Label>{s.shoutAnswer}</Label>
      </div>
    );
  }

  /* ---- the other team: idle, and that's the problem ----

     These players have no button for a whole minute. Framing the wait as
     preparation for the steal is the only thing that makes listening
     rational rather than polite — so this screen leads with what they
     stand to take, not with what the opponents are scoring. */
  return (
    <div className="shell">
      {team && <YouChip team={team} extra={s.chipListen} />}
      <div className="h-2.5" />
      <Hud remaining={remaining} pct={pct} warn={warn} rush={rush} scores={room.scores} />
      <div className="h-5" />
      <Label>{s.theirTurn}</Label>
      <p className="mt-1 text-center font-display text-[28px]">
        {s.explaining(nameOf(room, turn.clueGiverUid))}
      </p>

      {/* Once skip locks, the card on the table is the one that will be
          stolen. Telling the idle team that turns a dead minute into a
          ten-second countdown they have a reason to watch. */}
      <div className={`mt-5 rounded-[18px] border-2 px-4 py-4 text-center transition ${
        locked ? "border-chili bg-chili/20" : "border-chili/30 bg-chili/10"
      }`}>
        <p className="font-display text-[19px] text-chili">
          {locked ? s.skipLockedIdle : s.rememberClues}
        </p>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
          {locked ? s.lastCardYours : s.stealIfTime}
        </p>
      </div>

      <div className="mt-4 rounded-[16px] bg-black/25 px-4 py-3 text-center">
        <span className="text-[13px] font-bold text-muted">{s.theyScored}</span>
        <p className="font-display text-[30px]" style={{ color: TEAM[turn.team].hex }}>
          +{room.round.points}
        </p>
      </div>

      {room.paused && <PausedBanner lang={room.lang} />}
      <div className="flex-1" />
      {room.hostUid === uid && <HostControls room={room} />}
      <Label>{s.judgingForYou(nameOf(room, turn.judgeUid))}</Label>
    </div>
  );
}

/** Is the turn in progress my team's? */
function mineTurn(room: Room, uid: string) {
  return room.players[uid]?.team === room.turn?.team;
}

/* ------------------------------------------------------------------ */
/* steal                                                              */
/* ------------------------------------------------------------------ */

export function StealPhase({ room, uid }: Ctx) {
  const { remaining, pct, warn, rush } = useCountdown(room);
  const { msg, flash } = useFlash();
  if (!room.turn) return null;
  const s = S(room.lang);

  const thief = OTHER[room.turn.team];
  const team = myTeam(room, uid);
  const mine = team === thief;
  // There is no defence. Only the opposing judge can award the steal;
  // the describing team just watches the clock. Don't tell them to
  // "defend" — they have no button and no veto.

  return (
    <div className="shell">
      {team && <YouChip team={team} extra={mine ? s.chipSteal : s.chipTurnOver} />}
      <div className="h-2.5" />
      <Hud remaining={remaining} pct={pct} warn={warn} rush={rush} scores={room.scores} />
      <div className="h-5" />
      <Label>{s.timeUpOn(s.team[room.turn.team])}</Label>
      <p className="mt-1 text-center font-display text-[42px] text-chili">{s.stealYell}</p>
      <p className="mt-2 text-center text-[14.5px] leading-relaxed text-muted">
        {mine ? s.stealYours : s.stealTheirs}
      </p>

      <div className="flex-1" />
      <div className="card" style={{ rotate: "1.5deg", padding: "24px 18px" }}>
        <div className="card-word" style={{ fontSize: 38, margin: 0 }}>{s.unknownCard}</div>
      </div>
      {room.paused && <PausedBanner lang={room.lang} />}
      <Flash msg={msg} />
      <div className="flex-1" />
      {room.hostUid === uid && <HostControls room={room} />}

      {roleOf(room, uid) === "judge"
        ? (
          <Btn variant="chili"
            onClick={() => api.claimSteal({ roomId: room.id }).catch((e) => flash(errText(e, room.lang)))}>
            {s.stealAward}
          </Btn>
        )
        : <Waiting>{s.waitingSteal(nameOf(room, room.turn.judgeUid))}</Waiting>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* recap                                                              */
/* ------------------------------------------------------------------ */

export function RecapPhase({ room, uid, rounds }: Ctx) {
  const { msg, flash } = useFlash();
  if (!room.turn) return null;
  const s = S(room.lang);
  const team = myTeam(room, uid);
  const mine = team === room.turn.team;
  const pts = room.round.points;

  return (
    <div className="shell">
      {team && <YouChip team={team} extra={mine ? s.chipYourTurn : s.chipTheirTurn} />}
      <div className="h-3" />
      <Label>{s.recapExplained(nameOf(room, room.turn.clueGiverUid))}</Label>
      <p className="mt-0.5 text-center font-display text-[68px] leading-none"
         style={{ color: pts >= 0 ? "#2FD6BC" : "#FF4D79" }}>
        {pts >= 0 ? "+" : ""}{pts}
      </p>
      <ScoreBoard room={room} uid={uid} rounds={rounds} />
      <div className="max-h-[36vh] overflow-y-auto">
        <Feed log={room.round.log} lang={room.lang} />
      </div>
      <Flash msg={msg} />
      <div className="flex-1" />
      {room.hostUid === uid && <HostControls room={room} />}
      {room.hostUid === uid
        ? (
          <Btn className="mt-2" onClick={() => api.advancePhase({
              roomId: room.id, fromPhase: "recap", fromTurn: room.turnIndex,
            }).catch((e) => flash(errText(e, room.lang)))}>
            {s.recapOk}
          </Btn>
        )
        : <Waiting>{s.waitingHost(nameOf(room, room.hostUid))}</Waiting>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* transition                                                         */
/* ------------------------------------------------------------------ */

/**
 * The turn order as a drum, with this turn in the window.
 *
 * A flat «X ضد Y» answered who's up but not *where in the game* that is:
 * it looked the same on turn 2 and turn 7, and it never showed anyone
 * their own turn coming. Tilting the neighbours onto a receding surface
 * and fading them says the order is a wheel that keeps moving — the row
 * below is who follows, and a player who sees themselves there has a
 * reason to pay attention to this turn.
 *
 * Past rows come from the round records where they exist, because a
 * roster that changed mid-game makes a recomputed past a lie. Below the
 * schedule nothing is drawn: overtime turns are dealt one at a time, so
 * the next describer genuinely isn't known yet.
 *
 * Empty slots still take their height. Otherwise the matchup jumps up
 * and down the screen between turns as neighbours appear and vanish.
 */
function Wheel({
  room, s, turn, rounds,
}: { room: Room; s: Strings; turn: NonNullable<Room["turn"]>; rounds: RoundRecord[] }) {
  const i = room.turnIndex;
  const horizon = Math.max(totalTurns(room.settings), i + 1);
  const played = new Map(rounds.map((r) => [r.index, r]));

  const at = (k: number) => {
    if (k < 0 || k >= horizon) return null;
    const rec = played.get(k);
    if (rec) return { team: rec.team, clueGiverUid: rec.clueGiverUid, judgeUid: rec.judgeUid };
    return rolesForTurn(room.players, k);
  };

  /**
   * Depth is carried by the row's own opacity, not by a mask over the
   * stack: the two compounded, and the far row came out at a couple of
   * percent — indistinguishable from a rendering artefact.
   */
  const Ghost = ({ k, far }: { k: number; far?: boolean }) => {
    const row = at(k);
    const height = far ? 24 : 30;
    // An empty slot keeps its height so the matchup doesn't walk up and
    // down the screen between turns, and carries a hairline so the gap
    // on the first turn reads as the end of the wheel, not as a hole.
    if (!row) {
      return (
        <div className="flex items-center justify-center" style={{ height }} aria-hidden>
          <i className="h-[2px] w-5 rounded-full bg-white/[.06]" />
        </div>
      );
    }
    const above = k < i;
    return (
      <div
        aria-hidden
        className="flex items-center justify-center gap-2 overflow-hidden whitespace-nowrap font-bold"
        style={{
          height,
          fontSize: far ? 11.5 : 13,
          opacity: far ? 0.28 : 0.55,
          // rotateX only: translate and skew are physical, so anything
          // horizontal here would lean the wrong way under LTR.
          transform: `perspective(340px) rotateX(${above ? "" : "-"}${far ? 54 : 32}deg) scale(${far ? 0.88 : 0.95})`,
          transformOrigin: above ? "bottom center" : "top center",
        }}
      >
        <span className="tabular-nums text-muted/70" dir="ltr">{k + 1}</span>
        <span style={{ color: TEAM[row.team].hex }}>🎤 {nameOf(room, row.clueGiverUid)}</span>
        <span style={{ color: TEAM[OTHER[row.team]].hex }}>👀 {nameOf(room, row.judgeUid)}</span>
      </div>
    );
  };

  const Side = ({ t, role, who }: { t: TeamId; role: string; who: string }) => (
    <div className="flex-1 rounded-[18px] bg-black/25 px-2 py-3 text-center">
      <div className="mb-2 text-[10.5px] font-black tracking-[.16em]" style={{ color: TEAM[t].hex }}>
        {role}
      </div>
      <div className="mx-auto mb-1.5 w-fit"><Avatar name={who} team={t} big /></div>
      <div className="text-[16.5px] font-black">{who}</div>
      <div className="mt-0.5 text-[11.5px] text-muted">{TEAM[t].emoji} {s.team[t]}</div>
    </div>
  );

  return (
    <div className="mt-3">
      <div>
        <Ghost k={i - 2} far />
        <Ghost k={i - 1} />
      </div>

      <div
        className="my-1.5 flex items-center gap-2.5 rounded-[22px] p-1.5"
        style={{ boxShadow: "0 0 0 2px rgba(255,216,77,.16)" }}
      >
        <Side t={turn.team} role={s.roleExplain} who={nameOf(room, turn.clueGiverUid)} />
        <span className="font-display text-[21px] text-lemon">{s.vs}</span>
        <Side t={OTHER[turn.team]} role={s.roleJudge} who={nameOf(room, turn.judgeUid)} />
      </div>

      <div>
        <Ghost k={i + 1} />
        <Ghost k={i + 2} far />
      </div>
    </div>
  );
}

/**
 * The one deliberate pause. It answers four questions at once: who's
 * describing, who's judging, how many rounds are left, and what the
 * score is — then waits for the host, so nobody starts talking into a
 * round half the table hasn't looked at yet.
 */
export function TransitionPhase({ room, uid, rounds }: Ctx) {
  const { msg, flash } = useFlash();
  if (!room.turn) return null;
  const s = S(room.lang);

  const total = totalTurns(room.settings);
  const overtime = room.turnIndex >= total;
  const team = myTeam(room, uid);
  const horizon = Math.max(total, room.turnIndex + total);
  const mineAt = nextTurnFor(room.players, room.turnIndex, horizon, uid);
  const pipCount = Math.max(total, room.turnIndex + 1);

  const yourTurnNote =
    mineAt === null ? null
    : mineAt === room.turnIndex ? s.yourTurnNow
    : s.yourTurnAt(mineAt + 1);

  const oursNext = team === room.turn.team;

  return (
    <div className="shell">
      {team && <YouChip team={team} extra={oursNext ? s.ourTurn : s.theirTurnChip} />}
      <div className="h-3" />
      <Label>
        {overtime
          ? s.overtimeRound(room.turnIndex + 1)
          : s.roundOf(room.turnIndex + 1, total)}
      </Label>

      <div className="mt-3.5 flex gap-1.5">
        {Array.from({ length: pipCount }, (_, i) => (
          <i key={i} className="h-[7px] flex-1 rounded-full"
             style={{
               background: i < room.turnIndex ? "#FFD84D" : i === room.turnIndex ? "#FF9A3C" : "rgba(255,246,233,.15)",
               boxShadow: i === room.turnIndex ? "0 0 12px rgba(255,154,60,.7)" : undefined,
             }} />
        ))}
      </div>

      <Wheel room={room} s={s} turn={room.turn} rounds={rounds} />

      <ScoreBoard room={room} uid={uid} rounds={rounds} />
      {yourTurnNote && (
        <>
          <div className="h-3.5" />
          <Label tone="#FF9A3C">{yourTurnNote}</Label>
        </>
      )}

      <Flash msg={msg} />
      <div className="flex-1" />

      {room.hostUid === uid && <HostControls room={room} />}

      {room.hostUid === uid
        ? (
          <>
            <Btn variant="tang"
              onClick={() => api.startTurn({ roomId: room.id }).catch((e) => flash(errText(e, room.lang)))}>
              {s.startTurn(nameOf(room, room.turn.clueGiverUid))}
            </Btn>
            <div className="h-2.5" />
            <Label>{s.youAreHost}</Label>
          </>
        )
        : <Waiting>{s.waitingHostStart(nameOf(room, room.hostUid))}</Waiting>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* end                                                                */
/* ------------------------------------------------------------------ */

/**
 * The reveal, on one screen without scrolling.
 *
 * The scoreboard is the hero — winning side gets a trophy and gold
 * medals on every name. Stats sit under it in one panel.
 */
export function EndPhase({ room, uid, rounds }: Ctx) {
  const { msg, flash } = useFlash();
  const s = S(room.lang);
  const stats = computeStats(rounds);
  const win = room.winner;
  const draw = win === "draw" || !win;

  const rows: Array<{ em: string; gloss: string; title: string; sub: string }> = [];
  if (stats.talker) {
    rows.push({
      em: "🎤", gloss: s.mostExplained,
      title: nameOf(room, stats.talker.uid),
      sub: s.cardsN(stats.talker.n),
    });
  }
  if (stats.buzzer) {
    rows.push({
      em: "🚨", gloss: s.harshestJudge,
      title: nameOf(room, stats.buzzer.uid),
      sub: s.timesN(stats.buzzer.n),
    });
  }
  if (stats.longest) {
    rows.push({
      em: "🐢", gloss: s.longestWord,
      title: stats.longest.word,
      sub: s.secondsN(Math.round(stats.longest.ms / 1000)),
    });
  }
  if (stats.streak) {
    rows.push({
      em: "🔥", gloss: s.longestStreak,
      title: nameOf(room, stats.streak.uid),
      sub: s.streakN(stats.streak.n),
    });
  }

  const reason =
    draw ? s.reasonDraw
    : room.endReason === "abandoned" ? s.reasonHost
    : room.turnIndex + 1 > totalTurns(room.settings) ? s.reasonOvertime
    : s.reasonRounds;

  return (
    <div className="shell">
      <div className="h-2" />
      <Label>{reason}</Label>

      <ScoreBoard
        room={room}
        uid={uid}
        rounds={rounds}
        highlight={draw ? "draw" : win}
      />

      {rows.length > 0 && (
        <div className="mt-3 rounded-[18px] bg-black/25 px-3.5 py-3">
          <div className="flex flex-col gap-2.5">
            {rows.map((r) => (
              <div key={r.gloss + r.title} className="flex items-center gap-2.5">
                <span className="w-7 shrink-0 text-center text-[20px] leading-none">{r.em}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold text-muted">{r.gloss}</div>
                  <div className="truncate text-[14px] font-black">{r.title}</div>
                </div>
                <span className="shrink-0 text-[12px] font-bold text-muted" dir="ltr">{r.sub}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Flash msg={msg} />
      <div className="flex-1" />
      <EndButtons room={room} uid={uid} flash={flash} />
    </div>
  );
}

function EndButtons({
  room, uid, flash,
}: { room: Room; uid: string; flash: (m: string) => void }) {
  const s = S(room.lang);
  return (
    <div className="flex flex-col gap-3">
      {room.hostUid === uid && (
        <Btn variant="tang" onClick={() => api.rematch({ roomId: room.id }).catch((e) => flash(errText(e, room.lang)))}>
          {s.rematch}
        </Btn>
      )}
      <Btn variant="ghost"
        onClick={() => api.leaveRoom({ roomId: room.id }).finally(() => { location.hash = ""; location.reload(); })}>
        {s.leave}
      </Btn>
    </div>
  );
}
