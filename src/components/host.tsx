import React, { useState } from "react";
import { api, errText } from "../lib/firebase";
import type { HostAction } from "../lib/engine";
import { membersOf, OTHER, pointsByPlayer, rolesForTurn, totalTurns } from "../lib/rules";
import type { Room, RoundRecord, TeamId } from "../lib/types";
import { TEAM } from "./ui";
import { S } from "../lib/strings";

/* ------------------------------------------------------------------ */
/* scoreboard                                                         */
/* ------------------------------------------------------------------ */

/**
 * One board, not two.
 *
 * Team total is the centred heading. During the game, per-player rows
 * appear only after that person has described. On the final screen
 * (`highlight` set) every roster name shows, the winning side gets a
 * trophy, and winners wear a gold medal.
 */
export function ScoreBoard({
  room, uid, rounds, highlight,
}: {
  room: Room;
  uid: string;
  rounds: RoundRecord[];
  /** Kept for call-site compatibility. */
  compact?: boolean;
  /** Winning team (or draw) — enables trophy / medals / full roster. */
  highlight?: TeamId | "draw" | null;
}) {
  const s = S(room.lang);
  const scored = pointsByPlayer(rounds);
  const total = totalTurns(room.settings);
  const finale = highlight != null;

  /**
   * Describers in the order they actually come up. The horizon runs past
   * the schedule in overtime, or a player who only described after the
   * last scheduled turn would bank points and never appear.
   */
  const order = (team: TeamId) => {
    const seen: string[] = [];
    const horizon = Math.max(total, room.turnIndex + 1);
    for (let i = 0; i < horizon; i++) {
      const r = rolesForTurn(room.players, i);
      if (r?.team === team && !seen.includes(r.clueGiverUid)) seen.push(r.clueGiverUid);
    }
    return seen;
  };

  const cellDim = (team: TeamId) =>
    finale && highlight !== "draw" && highlight !== team ? 0.42 : 1;

  /* ---- in-game: independent columns (only played rows) ---- */
  if (!finale) {
    const Column = ({ team }: { team: TeamId }) => {
      const hex = TEAM[team].hex;
      const rows = order(team).filter((u) => u in scored);
      return (
        <div className="flex min-w-0 flex-1 flex-col px-3 py-3">
          <div className="text-center">
            <div className="text-[11px] font-black" style={{ color: hex }}>
              {TEAM[team].emoji} {s.team[team]}
            </div>
            <div className="mt-0.5 font-display text-[28px] leading-none" style={{ color: hex }} dir="ltr">
              {room.scores[team]}
            </div>
          </div>
          {rows.length > 0 && (
            <div className="mt-2.5 flex flex-col gap-1">
              {rows.map((u) => (
                <div
                  key={u}
                  className="grid grid-cols-[1.25rem_minmax(0,1fr)_1.75rem] items-baseline gap-1 text-[12.5px] font-medium"
                  style={{ opacity: 0.85 }}
                >
                  <span />
                  <span className="truncate text-start">
                    {room.players[u]?.name ?? "…"}{u === uid ? s.you : ""}
                  </span>
                  <span className="tabular-nums text-end" dir="ltr">{scored[u]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    };
    return (
      <div className="mt-3 flex overflow-hidden rounded-[18px] bg-black/25">
        <Column team="mint" />
        <div className="w-px shrink-0 self-stretch bg-white/10" />
        <Column team="chili" />
      </div>
    );
  }

  /* ---- finale: one 2-col grid so every roster row shares a baseline ---- */
  const mintRows = membersOf(room.players, "mint");
  const chiliRows = membersOf(room.players, "chili");
  const rowCount = Math.max(mintRows.length, chiliRows.length);

  const Header = ({ team }: { team: TeamId }) => {
    const hex = TEAM[team].hex;
    const won = highlight === team;
    return (
      <div className="px-3 pb-2 pt-3 text-center" style={{ opacity: cellDim(team) }}>
        {/* Same geometry both sides: trophy slot always reserved. */}
        <div className="flex h-[30px] items-center justify-center gap-1.5">
          <span className={`text-[30px] leading-none ${won ? "" : "invisible"}`} aria-hidden={!won}>
            🏆
          </span>
          <span className="text-[30px] leading-none">{TEAM[team].emoji}</span>
        </div>
        <div className="mt-1.5 text-[17px] font-black" style={{ color: hex }}>
          {s.team[team]}
        </div>
        <div className="mt-0.5 font-display text-[34px] leading-none" style={{ color: hex }} dir="ltr">
          {room.scores[team]}
        </div>
      </div>
    );
  };

  const Row = ({ team, playerUid }: { team: TeamId; playerUid: string | undefined }) => {
    const won = highlight === team;
    if (!playerUid) {
      return <div className="h-[26px] px-3" style={{ opacity: cellDim(team) }} aria-hidden />;
    }
    const played = playerUid in scored;
    return (
      <div
        className="grid h-[26px] grid-cols-[1.25rem_minmax(0,1fr)_1.75rem] items-center gap-1 px-3 text-[12.5px] font-medium"
        style={{ opacity: cellDim(team) }}
      >
        <span className="text-center leading-none">{won ? "🥇" : ""}</span>
        <span className="truncate text-start" style={{ opacity: played ? 1 : 0.55 }}>
          {room.players[playerUid]?.name ?? "…"}{playerUid === uid ? s.you : ""}
        </span>
        <span className="tabular-nums text-end" dir="ltr" style={{ opacity: played ? 1 : 0.55 }}>
          {played ? scored[playerUid] : "–"}
        </span>
      </div>
    );
  };

  const winHex =
    highlight === "mint" || highlight === "chili" ? TEAM[highlight].hex : null;

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
            <Row team="mint" playerUid={mintRows[i]} />
            <Row team="chili" playerUid={chiliRows[i]} />
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

  const run = (action: HostAction) => {
    setErr(null);
    api.hostControl({ roomId: room.id, action })
      .then(() => {
        // Keep the menu open for score taps so the host can correct
        // more than once without reopening.
        if (action !== "plusGuess" && action !== "minusGuess") setOpen(false);
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
  const guessName = guessTeam ? s.team[guessTeam] : s.guessTeamFallback;

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
    <div className="mt-2 rounded-[16px] border border-white/10 bg-black/35 p-3">
      <div className="mb-2 flex items-center">
        <span className="text-[11px] font-black tracking-[.16em] text-muted">{s.hostMenu}</span>
        <button onClick={() => setOpen(false)} className="ms-auto text-[15px] text-muted">✕</button>
      </div>

      <div className="flex flex-col gap-2">
        {guessTeam && (
          <>
            <Ctl onClick={() => run("plusGuess")} label={s.plusGuess(guessName)} tone="#2FD6BC"
                 hint={s.guessHint} />
            <Ctl onClick={() => run("minusGuess")} label={s.minusGuess(guessName)} tone="#FF9A3C"
                 hint={s.guessHint} />
          </>
        )}
        {inTurn && (
          room.paused
            ? <Ctl onClick={() => run("resume")} label={s.resume} tone="#2FD6BC" />
            : <Ctl onClick={() => run("pause")} label={s.pause} tone="#FFD84D" />
        )}
        {inTurn && (
          <Ctl onClick={() => run("addTime")} label={s.addTime} tone="#FFD84D"
               hint={s.addTimeHint} />
        )}
        {inTurn && (
          <Ctl onClick={() => run("skipTurn")} label={s.skipTurn} tone="#FF9A3C"
               hint={s.skipTurnHint} />
        )}
        {kickable.length > 0 && (
          <div className="rounded-[13px] bg-black/30 px-3 py-2.5">
            <div className="text-[14.5px] font-black text-chili">{s.kickPlayer}</div>
            <small className="block text-[11px] font-normal text-muted">{s.kickHint}</small>
            <div className="mt-2 flex flex-col gap-1.5">
              {kickable.map(([u, p]) => (
                <button
                  key={u}
                  onClick={() => kick(u)}
                  className="flex items-center gap-2 rounded-[10px] bg-black/25 px-2.5 py-2 text-start"
                >
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold">
                    {p.name}
                    {p.team ? ` · ${TEAM[p.team].emoji}` : ""}
                  </span>
                  <span className="shrink-0 text-[12px] font-black text-chili">{s.kick}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <Ctl onClick={() => run("endGame")} label={s.endGame} tone="#FF4D79"
             hint={s.endGameHint} />
      </div>

      {err && <p className="mt-2 text-center text-[12px] font-bold text-chili">{err}</p>}
    </div>
  );
}

function Ctl({
  onClick, label, tone, hint,
}: { onClick: () => void; label: string; tone: string; hint?: string }) {
  return (
    <button
      onClick={onClick}
      className="rounded-[13px] bg-black/30 px-3 py-2.5 text-start"
      style={{ color: tone }}
    >
      <span className="text-[14.5px] font-black">{label}</span>
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
