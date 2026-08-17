import React, { useState } from "react";
import { api, errText } from "../lib/firebase";
import { useFlash, useLocal } from "../lib/hooks";
import {
  membersOf, NAME_MAX, OTHER, ROUND_SECS_OPTIONS, ROUNDS_PER_TEAM_OPTIONS, totalTurns,
} from "../lib/rules";
import type { Lang, Room, TeamId } from "../lib/types";
import { Avatar, Btn, Flash, Label, look, TeamMark, Waiting, Wordmark, YouChip } from "../components/ui";
import { QR } from "../components/QR";
import { S } from "../lib/strings";

/**
 * Guarded because test/ui renders these components in Node, where
 * `location` doesn't exist — and a screen that throws during render is
 * exactly what that harness exists to catch.
 */
export function joinUrl(roomId: string): string {
  const origin = typeof location === "undefined" ? "" : location.origin;
  return `${origin}/#${encodeURIComponent(roomId)}`;
}

/* ------------------------------------------------------------------ */
/* home                                                               */
/* ------------------------------------------------------------------ */

export function Home({
  onEnter, initialCode, joinLang,
}: {
  onEnter: (id: string) => void;
  initialCode: string;
  /** Set when opening a known room — join UI follows that room's language. */
  joinLang?: Lang;
}) {
  const [name, setName] = useLocal("mamnou3:name", "");
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const { msg, flash } = useFlash();
  const joining = Boolean(joinLang);
  const flashLang: Lang = joinLang ?? "ar";

  const run = async (fn: () => Promise<string>, lang: Lang) => {
    if (busy) return;
    if (!name.trim()) return flash(S(lang).err.writeName);
    setBusy(true);
    try { onEnter(await fn()); }
    catch (e) { flash(errText(e, lang)); }
    finally { setBusy(false); }
  };

  if (picking && !joining) {
    return (
      <div className="shell">
        <div className="h-7" />
        <Wordmark size={44} />
        <p className="mt-5 text-center text-[14.5px] leading-relaxed text-muted">
          اختر لغة الغرفة · Pick the room language
        </p>
        <p className="mt-1 text-center text-[12px] leading-relaxed text-muted/70">
          البطاقات والشاشات كلها بهذه اللغة · Cards and screens both follow it
        </p>
        <div className="h-7" />
        <Btn variant="lemon" disabled={busy}
          onClick={() => run(async () => (await api.createRoom({ name, lang: "ar" })).roomId, "ar")}>
          ممنوع · عربي
        </Btn>
        <div className="h-3" />
        <Btn variant="tang" disabled={busy}
          onClick={() => run(async () => (await api.createRoom({ name, lang: "en" })).roomId, "en")}>
          Banned · English
        </Btn>
        <div className="h-3.5" />
        <Btn variant="ghost" disabled={busy} onClick={() => setPicking(false)}>
          رجوع · Back
        </Btn>
        <Flash msg={msg} />
      </div>
    );
  }

  /* ---- opened someone's link ----

     This screen used to lead with the title alone at 62px, which in an
     English room is one huge white word and nothing else — people read
     that as a page that failed to load, not as an invitation. So it
     leads with the room they were invited to, in the same orange card
     they'll see in the lobby a second later, and the wordmark shrinks to
     a mark. */
  if (joining) {
    const s = S(joinLang);
    const enter = () => run(async () => {
      await api.joinRoom({ roomId: code.trim(), name });
      return code.trim();
    }, flashLang);

    return (
      <div className="shell">
        <div className="h-6" />
        <Wordmark size={30} lang={joinLang} />

        <div className="mt-6 rotate-[1deg] rounded-[20px] bg-tang px-3.5 py-3 text-center text-[#3A1D00] shadow-[0_6px_0_#CC6F1B]">
          <small className="text-[11px] font-black tracking-[.18em] opacity-75">{s.invitedTo}</small>
          <div className="font-display text-[34px] leading-tight">{code}</div>
        </div>

        <p className="mt-4 text-center text-[13.5px] leading-relaxed text-muted">{s.tagline}</p>

        <div className="h-5" />
        <input
          className="field" maxLength={NAME_MAX} autoFocus
          autoComplete="off" spellCheck={false} enterKeyHint="go"
          placeholder={s.yourNamePh}
          value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") enter(); }}
        />
        <div className="h-3" />
        <Btn variant="lemon" disabled={busy} onClick={enter}>{s.joinCta}</Btn>
        <Flash msg={msg} />

        <div className="flex-1" />
        <Btn variant="ghost" onClick={() => { location.hash = ""; }}>{s.otherRoom}</Btn>
      </div>
    );
  }

  const joinByName = () => run(async () => {
    const id = code.trim();
    if (!id) throw new Error(S("ar").err.writeRoom);
    await api.joinRoom({ roomId: id, name });
    return id;
  }, "ar");

  return (
    <div className="shell">
      <div className="h-7" />
      <Wordmark size={58} />
      <p className="mt-4 text-center text-[14.5px] leading-relaxed text-muted">
        اشرح الكلمة… بدون الكلمات الخمس
        <br />
        Describe the word… without the five forbidden ones
      </p>

      <div className="h-7" />
      <input
        className="field" maxLength={NAME_MAX} placeholder="سعد بن صالح · your name"
        autoComplete="off" spellCheck={false} enterKeyHint="next"
        value={name} onChange={(e) => setName(e.target.value)}
      />
      <div className="h-3.5" />
      <Btn variant="lemon" disabled={busy} onClick={() => {
        if (!name.trim()) return flash("اكتب اسمك أولًا. · Enter your name first.");
        setPicking(true);
      }}>
        افتح غرفة · Open a room
      </Btn>

      <div className="h-6" />
      <Label>أو ادخل باسم الغرفة · Or join by name</Label>
      <div className="h-2.5" />
      <input
        className="field font-display text-[26px] tracking-[.1em] text-lemon"
        maxLength={12} placeholder="قهوة · coffee"
        autoComplete="off" spellCheck={false} enterKeyHint="go"
        value={code} onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") joinByName(); }}
      />
      <div className="h-2.5" />
      <Btn variant="ghost" disabled={busy} onClick={joinByName}>
        ادخل · Join
      </Btn>

      <Flash msg={msg} />
      <div className="flex-1" />
      <Label>كل لاعب على جواله · everyone on their own phone</Label>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* lobby                                                              */
/* ------------------------------------------------------------------ */

function Chips({
  value, options, onPick, disabled, compact,
}: {
  value: number; options: readonly number[]; onPick: (n: number) => void; disabled: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`flex ${compact ? "gap-1" : "gap-1.5"}`}>
      {options.map((o) => (
        <button
          key={o} disabled={disabled} onClick={() => onPick(o)}
          className={`min-w-0 flex-1 border-2 font-black transition ${
            compact ? "rounded-[10px] py-1.5 text-[12px]" : "rounded-[13px] py-2.5 text-[14px]"
          } ${
            value === o
              ? "border-lemon bg-lemon text-night"
              : "border-transparent bg-black/25 text-muted"
          } ${disabled ? "opacity-60" : ""}`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/**
 * One side of the lobby, and the switch for it.
 *
 * The whole panel is the target: tapping the side you're not on moves
 * you there. Before this the only way to switch was a tap on your own
 * name — a target the width of the text, on a panel that gave no sign of
 * which side you were already on, so a tap that did nothing (your own
 * panel) and a tap that moved you looked identical. The side you're on
 * is now lit in its own colour and says so, and the other side says what
 * a tap will do.
 *
 * The host's per-player ⇄ and ✕ stop propagation, or moving someone else
 * would also move the host.
 */
function TeamPanel({
  team, room, isHost, me, mine, onKick, onMove,
}: {
  team: TeamId; room: Room; isHost: boolean; me: string; mine: boolean;
  onKick: (uid: string) => void; onMove: (uid: string, t: TeamId) => void;
}) {
  const t = look(room.kit, team);
  const s = S(room.lang);
  const members = membersOf(room.players, team);
  const join = () => onMove(me, team);

  return (
    <div
      role={mine ? undefined : "button"}
      tabIndex={mine ? undefined : 0}
      aria-label={mine ? undefined : `${s.team[room.kit][team]} — ${s.tapToSwitch}`}
      onClick={mine ? undefined : join}
      onKeyDown={mine ? undefined : (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); join(); }
      }}
      className={`min-h-[104px] flex-1 rounded-[18px] border-2 p-3 transition ${
        mine ? "" : "border-dashed border-white/10 bg-black/25"
      }`}
      style={mine ? { borderColor: t.hex, background: `${t.hex}1F` } : undefined}
    >
      <div className="mb-2.5 flex items-baseline gap-1.5">
        <h4 className="flex items-center gap-1 text-[12.5px] font-black" style={{ color: t.hex }}>
          <TeamMark kit={room.kit} team={team} size={14} /> {s.team[room.kit][team]}
        </h4>
        <span
          className="ms-auto shrink-0 text-[9.5px] font-black tracking-[.1em]"
          style={{ color: mine ? t.hex : "#A99BC4" }}
        >
          {mine ? s.youAreHere : s.tapToSwitch}
        </span>
      </div>

      {members.length === 0 && (
        <p className="text-[12px] font-bold text-muted/70">{s.nobodyYet}</p>
      )}

      {members.map((uid) => (
        <div key={uid} className="mb-2 flex items-center gap-2 text-[14px]">
          <Avatar name={room.players[uid].name} team={team} kit={room.kit} />
          <span className="min-w-0 truncate text-start">
            {room.players[uid].name}{uid === me ? s.you : ""}
          </span>
          {isHost && uid !== me && (
            <span className="ms-auto flex shrink-0 items-center gap-0.5">
              <button
                className="px-1 text-[13px] font-black text-muted"
                onClick={(e) => { e.stopPropagation(); onMove(uid, OTHER[team]); }}
                aria-label={s.moveAria}
              >⇄</button>
              <button
                className="px-1 text-[15px] font-black text-minus"
                onClick={(e) => { e.stopPropagation(); onKick(uid); }}
                aria-label={s.kickAria}
              >✕</button>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function Lobby({ room, uid }: { room: Room; uid: string }) {
  const isHost = room.hostUid === uid;
  const { msg, flash } = useFlash();
  const [showQr, setShowQr] = useState(false);
  const me = room.players[uid];
  const s = S(room.lang);
  const url = joinUrl(room.id);

  const call = (p: Promise<unknown>) => p.catch((e) => flash(errText(e, room.lang)));

  const share = async () => {
    const text = s.shareText(room.id, url);
    if (navigator.share) { try { await navigator.share({ text }); return; } catch { /* cancelled */ } }
    try { await navigator.clipboard.writeText(text); flash(s.copied, true); }
    catch { flash(url); }
  };

  return (
    <div className="shell">
      {me?.team && <YouChip team={me.team} kit={room.kit} />}
      <div className="h-2" />

      <div className="rotate-[1deg] rounded-[20px] bg-tang px-3.5 py-3 text-center text-[#3A1D00] shadow-[0_6px_0_#CC6F1B]">
        <small className="text-[11px] font-black tracking-[.18em] opacity-75">{s.roomName}</small>
        <div className="font-display text-[34px] leading-tight">{room.id}</div>
      </div>

      <Btn variant="ghost" className="mt-2.5" onClick={() => setShowQr((v) => !v)}>
        {showQr ? s.hideQr : s.showQr}
      </Btn>
      {showQr && (
        <div className="mt-2.5 flex flex-col items-center gap-1.5">
          <QR url={url} />
          <span className="text-[11px] font-bold text-muted">{s.scanToJoin}</span>
        </div>
      )}

      <div className="mt-3.5 flex gap-2.5">
        {(["mint", "chili"] as const).map((t) => (
          <TeamPanel key={t} team={t} room={room} isHost={isHost} me={uid}
            mine={me?.team === t}
            onKick={(u) => call(api.kickPlayer({ roomId: room.id, uid: u }))}
            onMove={(u, to) => call(api.setTeam({ roomId: room.id, uid: u, team: to }))} />
        ))}
      </div>
      <p className="mt-1.5 text-center text-[11px] text-muted/70">{s.teamsHint}</p>

      {isHost && (
        <Btn variant="ghost" className="mt-2.5"
          onClick={() => call(api.shuffleTeams({ roomId: room.id }))}>
          {s.shuffle}
        </Btn>
      )}

      <div className="mt-3.5">
        <div className="mb-2 flex justify-between text-[12px] font-bold text-muted">
          <span>{s.roundLength}</span><span>{s.seconds}</span>
        </div>
        <Chips value={room.settings.roundSecs} options={ROUND_SECS_OPTIONS} disabled={!isHost}
          onPick={(n) => call(api.updateSettings({ roomId: room.id, settings: { roundSecs: n } }))} />
      </div>

      <div className="mt-3.5">
        <div className="mb-2 flex justify-between text-[12px] font-bold text-muted">
          <span>{s.roundsPerTeam}</span>
          <span>{s.totalRounds(totalTurns(room.settings))}</span>
        </div>
        <Chips value={room.settings.roundsPerTeam} options={ROUNDS_PER_TEAM_OPTIONS} disabled={!isHost}
          compact
          onPick={(n) => call(api.updateSettings({ roomId: room.id, settings: { roundsPerTeam: n } }))} />
        <p className="mt-1.5 text-center text-[11px] leading-relaxed text-muted">
          {s.roundsHint(room.settings.roundsPerTeam, totalTurns(room.settings))}
        </p>
      </div>

      <Flash msg={msg} />
      <div className="flex-1" />

      <div className="flex flex-col gap-3">
        {isHost
          ? <Btn variant="lemon" onClick={() => call(api.startGame({ roomId: room.id }))}>{s.startPlay}</Btn>
          : <Waiting>{s.waitingHostBegin}</Waiting>}
        <Btn variant="ghost" onClick={share}>{s.sendLink}</Btn>
        <Btn variant="ghost" onClick={() => call(api.leaveRoom({ roomId: room.id }).then(() => { location.hash = ""; location.reload(); }))}>
          {s.leave}
        </Btn>
      </div>
    </div>
  );
}
