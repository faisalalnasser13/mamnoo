import React, { useState } from "react";
import { api, errText } from "../lib/firebase";
import type { HostAction } from "../lib/engine";
import { OTHER } from "../lib/rules";
import type { Room, RoundRecord, TeamId } from "../lib/types";
import { look, TeamMark } from "./ui";
import { S } from "../lib/strings";

/* ------------------------------------------------------------------ */
/* scoreboard                                                         */
/* ------------------------------------------------------------------ */

/**
 * A describer's own total, signed.
 *
 * Independent green / red, not the team palette: these rows sit under a
 * heading that is already mint or chili, and they appear on recap,
 * transition and the finale — polarity has to read the same in every
 * column. A skip costs half a point, so these are not always whole numbers.
 */
function Points({ n }: { n: number }) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  // Off the team palette so a chili −2 is still "lost points", not
  // "chili's colour". Bright enough to survive the 42% dim on the
  // losing column of the finale.
  const color = n > 0 ? "#4CBE7B" : n < 0 ? "#E1584F" : "var(--muted)";
  return (
    <b className="tabular-nums font-black" dir="ltr" style={{ color }}>
      {sign}{Math.abs(n)}
    </b>
  );
}

/**
 * One board, not two.
 *
 * Team total is the centred heading. Under it, one row per finished
 * turn — not one row per hinter. A player who describes twice shows
 * twice, each with that turn's points, so a later turn cannot rewrite
 * an earlier one. On the final screen (`highlight` set) the winning
 * side gets a trophy, and each of its turn rows wears a gold medal.
 */
export function ScoreBoard({
  room, uid, rounds, highlight, compact,
}: {
  room: Room;
  uid: string;
  rounds: RoundRecord[];
  compact?: boolean;
  /** Winning team (or draw) — enables trophy / medals. */
  highlight?: TeamId | "draw" | null;
}) {
  const s = S(room.lang);
  const finale = highlight != null;
  // Recap writes the round doc in the same transaction as the phase
  // flip, but the rounds listener can lag the room listener by a
  // snapshot. Until it lands, synthesise the turn that just ended so
  // the new row is on the board with the big number above it.
  const listed =
    room.phase === "recap" && room.turn && !rounds.some((r) => r.index === room.turnIndex)
      ? [...rounds, {
          index: room.turnIndex,
          team: room.turn.team,
          clueGiverUid: room.turn.clueGiverUid,
          judgeUid: room.turn.judgeUid,
          points: room.round.points,
          log: room.round.log,
          at: 0,
        }]
      : rounds;
  const of = (team: TeamId) => listed.filter((r) => r.team === team);

  const cellDim = (team: TeamId) =>
    finale && highlight !== "draw" && highlight !== team ? 0.42 : 1;

  const TurnRow = ({
    team, rd, medal, pad,
  }: {
    team: TeamId;
    rd: RoundRecord;
    medal?: boolean;
    pad?: boolean;
  }) => (
    <div
      className={`grid grid-cols-[1.25rem_minmax(0,1fr)_2.25rem] items-baseline gap-1 text-[12.5px] font-medium ${
        pad ? "h-[26px] items-center px-3" : ""
      }`}
      style={finale ? { opacity: cellDim(team) } : undefined}
    >
      <span className="text-center leading-none">{medal ? "🥇" : ""}</span>
      <span className="truncate text-start" style={{ opacity: 0.85 }}>
        {room.players[rd.clueGiverUid]?.name ?? "…"}{rd.clueGiverUid === uid ? s.you : ""}
      </span>
      <span className="text-end"><Points n={rd.points} /></span>
    </div>
  );

  /* ---- in-game: independent columns (only finished turns) ---- */
  if (!finale) {
    const Column = ({ team }: { team: TeamId }) => {
      const hex = look(room.kit, team).hex;
      const rows = of(team);
      return (
        <div className={`flex min-w-0 flex-1 flex-col px-3 ${compact ? "py-2" : "py-3"}`}>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-[11px] font-black" style={{ color: hex }}>
              <TeamMark kit={room.kit} team={team} size={12} /> {s.team[room.kit][team]}
            </div>
            <div className={`mt-0.5 font-display leading-none ${compact ? "text-[24px]" : "text-[28px]"}`} style={{ color: hex }} dir="ltr">
              {room.scores[team]}
            </div>
          </div>
          {rows.length > 0 && (
            <div className={`flex flex-col gap-1 ${compact ? "mt-1.5" : "mt-2.5"}`}>
              {rows.map((rd) => (
                <TurnRow key={rd.index} team={team} rd={rd} />
              ))}
            </div>
          )}
        </div>
      );
    };
    return (
      <div className={`flex overflow-hidden rounded-[18px] bg-black/25 ${compact ? "mt-1.5" : "mt-3"}`}>
        <Column team="mint" />
        <div className="w-px shrink-0 self-stretch bg-white/10" />
        <Column team="chili" />
      </div>
    );
  }

  /* ---- finale: one 2-col grid so every turn row shares a baseline ---- */
  const mintRows = of("mint");
  const chiliRows = of("chili");
  const rowCount = Math.max(mintRows.length, chiliRows.length);

  const Header = ({ team }: { team: TeamId }) => {
    const hex = look(room.kit, team).hex;
    const won = highlight === team;
    return (
      <div className="px-3 pb-2 pt-3 text-center" style={{ opacity: cellDim(team) }}>
        {/* Same geometry both sides: trophy slot always reserved. */}
        <div className="flex h-[30px] items-center justify-center gap-1.5">
          <span className={`text-[30px] leading-none ${won ? "" : "invisible"}`} aria-hidden={!won}>
            🏆
          </span>
          <TeamMark kit={room.kit} team={team} size={30} />
        </div>
        <div className="mt-1.5 text-[17px] font-black" style={{ color: hex }}>
          {s.team[room.kit][team]}
        </div>
        <div className="mt-0.5 font-display text-[34px] leading-none" style={{ color: hex }} dir="ltr">
          {room.scores[team]}
        </div>
      </div>
    );
  };

  const winHex =
    highlight === "mint" || highlight === "chili" ? look(room.kit, highlight).hex : null;

  return (
    <div className="relative mt-3 overflow-hidden rounded-[18px] bg-black/25">
      {/* Full-height column wash — not per-cell, so bottom padding stays filled. */}
      {winHex && highlight === "mint" && (
        <div
          className="pointer-events-none absolute inset-y-0 start-0 w-1/2"
          style={{ background: `${winHex}28` }}
        />
      )}
      {winHex && highlight === "chili" && (
        <div
          className="pointer-events-none absolute inset-y-0 end-0 w-1/2"
          style={{ background: `${winHex}28` }}
        />
      )}
      <div className="pointer-events-none absolute inset-y-0 start-1/2 w-px -translate-x-1/2 bg-white/10" />
      <div className="relative grid grid-cols-2 pb-3">
        <Header team="mint" />
        <Header team="chili" />
        {Array.from({ length: rowCount }, (_, i) => (
          <React.Fragment key={i}>
            {mintRows[i]
              ? <TurnRow team="mint" rd={mintRows[i]} medal={highlight === "mint"} pad />
              : <div className="h-[26px] px-3" style={{ opacity: cellDim("mint") }} aria-hidden />}
            {chiliRows[i]
              ? <TurnRow team="chili" rd={chiliRows[i]} medal={highlight === "chili"} pad />
              : <div className="h-[26px] px-3" style={{ opacity: cellDim("chili") }} aria-hidden />}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* host controls                                                      */
/* ------------------------------------------------------------------ */

/**
 * Collapsed behind one small button so it never competes with the game,
 * but reachable from every in-game screen.
 *
 * «أنهِ الجولة» is the important one: it's the only way out of a turn
 * whose describer has dropped off. Nothing else can end that turn,
 * because the card is dealt by the describer's device and the clock
 * can't expire a round that never got a card.
 */
export function HostControls({ room }: { room: Room }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const s = S(room.lang);

  const SCORE: HostAction[] = ["plusGuess", "plusHalf", "minusHalf", "minusGuess"];
  const run = (action: HostAction) => {
    setErr(null);
    api.hostControl({ roomId: room.id, action })
      .then(() => {
        // Keep the sheet open for score taps so the host can correct
        // more than once without reopening.
        if (!SCORE.includes(action)) setOpen(false);
      })
      .catch((e) => setErr(errText(e, room.lang)));
  };

  const kick = (target: string) => {
    setErr(null);
    api.kickPlayer({ roomId: room.id, uid: target })
      .catch((e) => setErr(errText(e, room.lang)));
  };

  const inTurn = room.phase === "live" || room.phase === "steal";
  // Live/steal/recap — until the host opens the next transition.
  const guessTeam =
    room.turn == null ? null
    : room.phase === "steal" ? OTHER[room.turn.team]
    : room.phase === "live" ? room.turn.team
    : room.phase === "recap"
      ? ((room.round.log ?? []).some((e) => e.res === "steal")
          ? OTHER[room.turn.team]
          : room.turn.team)
      : null;
  const guessName = guessTeam ? s.team[room.kit][guessTeam] : s.guessTeamFallback;

  const kickable = Object.entries(room.players)
    .filter(([u]) => u !== room.hostUid)
    .sort((a, b) => a[1].joinedAt - b[1].joinedAt);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mx-auto mt-2 block rounded-full px-3 py-1 text-[11px] font-bold text-muted/70"
      >
        ⚙︎ {s.hostMenu}
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-20 bg-black/55"
        onClick={() => setOpen(false)}
        aria-label={s.hostClose}
      />
      <div
        role="dialog"
        aria-label={s.hostMenu}
        className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-h-[88dvh] w-full max-w-[460px] flex-col rounded-t-[26px] border border-white/10 bg-black/80 p-4 pb-[calc(22px+var(--safe-b))]"
      >
        <div className="relative mb-4 min-h-[44px] pe-12">
          <h3 className="pt-1 font-display text-[24px] leading-tight">{s.hostMenu}</h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute end-0 top-0 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-[20px] font-black text-muted"
            aria-label={s.hostClose}
          >
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          {guessTeam && (
            <section>
              <p className="mb-2 text-[12px] font-black tracking-[.08em] text-muted">
                {s.scoreSection} · {guessName}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Pad onClick={() => run("plusGuess")} tone="#4CBE7B" label="+1" aria={s.plusGuess(guessName)} />
                <Pad onClick={() => run("plusHalf")} tone="#4CBE7B" label="+0.5" aria={s.plusHalf(guessName)} />
                <Pad onClick={() => run("minusHalf")} tone="#E1584F" label="−0.5" aria={s.minusHalf(guessName)} />
                <Pad onClick={() => run("minusGuess")} tone="#E1584F" label="−1" aria={s.minusGuess(guessName)} />
              </div>
              <p className="mt-1.5 text-[11px] text-muted">{s.guessHint}</p>
            </section>
          )}

          {inTurn && (
            <section>
              <p className="mb-2 text-[12px] font-black tracking-[.08em] text-muted">{s.turnSection}</p>
              <div className="grid grid-cols-2 gap-2">
                {room.paused
                  ? <Ctl onClick={() => run("resume")} label={s.resume} tone="#4CBE7B" />
                  : <Ctl onClick={() => run("pause")} label={s.pause} tone="var(--lemon)" />}
                <Ctl onClick={() => run("addTime")} label={s.addTime} tone="var(--lemon)"
                     hint={s.addTimeHint} />
              </div>
              <div className="mt-2">
                <Ctl onClick={() => run("skipTurn")} label={s.skipTurn} tone="#FF9A3C"
                     hint={s.skipTurnHint} />
              </div>
            </section>
          )}

          {kickable.length > 0 && (
            <section className="rounded-[16px] bg-white/5 px-3 py-3">
              <div className="text-[15px] font-black text-minus">{s.kickPlayer}</div>
              <small className="block text-[11px] font-normal text-muted">{s.kickHint}</small>
              <div className="mt-2.5 flex flex-col gap-1.5">
                {kickable.map(([u, p]) => (
                  <button
                    key={u}
                    onClick={() => kick(u)}
                    className="flex items-center gap-2 rounded-[12px] bg-black/30 px-3 py-2.5 text-start"
                  >
                    <span className="min-w-0 flex-1 truncate text-[15px] font-bold">
                      {p.name}
                      {p.team ? <span className="inline-flex items-center gap-1"> · <TeamMark kit={room.kit} team={p.team} size={14} /></span> : ""}
                    </span>
                    <span className="shrink-0 text-[13px] font-black text-minus">{s.kick}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <Ctl onClick={() => run("endGame")} label={s.endGame} tone="#E1584F"
               hint={s.endGameHint} />
        </div>

        {err && <p className="mt-3 text-center text-[12px] font-bold text-minus">{err}</p>}
      </div>
    </>
  );
}

function Pad({
  onClick, tone, label, aria,
}: { onClick: () => void; tone: string; label: string; aria: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={aria}
      className="rounded-[16px] bg-white/10 py-4 text-center font-display text-[26px] leading-none"
      style={{ color: tone }}
    >
      {label}
    </button>
  );
}

function Ctl({
  onClick, label, tone, hint,
}: { onClick: () => void; label: string; tone: string; hint?: string }) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-[16px] bg-white/10 px-3 py-3.5 text-start"
      style={{ color: tone }}
    >
      <span className="text-[16px] font-black">{label}</span>
      {hint && <small className="block text-[11px] font-normal text-muted">{hint}</small>}
    </button>
  );
}

/** Shown to everyone while the host has the game paused. */
export function PausedBanner({ lang }: { lang?: import("../lib/types").Lang }) {
  const s = S(lang);
  return (
    <div className="mt-3 rounded-[16px] border-2 border-lemon/40 bg-lemon/10 px-4 py-3 text-center">
      <p className="font-display text-[18px] text-lemon">{s.pausedTitle}</p>
      <p className="mt-1 text-[12.5px] text-muted">{s.pausedSub}</p>
    </div>
  );
}
