import React, { useState } from "react";
import { api, errText } from "../lib/firebase";
import { useFlash, useLocal } from "../lib/hooks";
import { membersOf, NAME_MAX, ROUND_SECS_OPTIONS, ROUNDS_PER_TEAM_OPTIONS, totalTurns } from "../lib/rules";
import type { Lang, Room, TeamId } from "../lib/types";
import { Avatar, Btn, Flash, Label, TEAM, Waiting, YouChip } from "../components/ui";
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
        <h1 className="text-center font-display text-[42px] leading-none">ممنوع</h1>
        <p className="mt-1 text-center font-display text-[28px] leading-none text-muted">Banned</p>
        <p className="mt-4 text-center text-[14.5px] leading-relaxed text-muted">
          اختر لغة الغرفة · Pick the room language
        </p>
        <div className="h-7" />
        <Btn variant="chili" disabled={busy}
          onClick={() => run(async () => (await api.createRoom({ name, lang: "ar" })).roomId, "ar")}>
          ممنوع · عربي
        </Btn>
        <div className="h-3" />
        <Btn variant="mint" disabled={busy}
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

  if (joining) {
    const s = S(joinLang);
    return (
      <div className="shell">
        <div className="h-7" />
        <h1 className="text-center font-display text-[62px] leading-none">{s.title}</h1>
        <p className="mt-2.5 text-center text-[14.5px] leading-relaxed text-muted">
          {joinLang === "en"
            ? "Describe the word… without the five forbidden ones"
            : "اشرح الكلمة… بدون الكلمات الخمس"}
        </p>
        <div className="h-7" />
        <input
          className="field" maxLength={NAME_MAX}
          placeholder={joinLang === "en" ? "Your name" : "سعد بن صالح"}
          value={name} onChange={(e) => setName(e.target.value)}
        />
        <div className="h-3.5" />
        <input
          className="field font-display text-[26px] tracking-[.1em] text-lemon"
          maxLength={12} value={code} readOnly
        />
        <div className="h-2.5" />
        <Btn variant="ghost" disabled={busy}
          onClick={() => run(async () => {
            await api.joinRoom({ roomId: code.trim(), name });
            return code.trim();
          }, flashLang)}>
          {joinLang === "en" ? "Join" : "ادخل"}
        </Btn>
        <Flash msg={msg} />
      </div>
    );
  }

  return (
    <div className="shell">
      <div className="h-7" />
      <h1 className="text-center font-display text-[62px] leading-none">ممنوع</h1>
      <p className="mt-1 text-center font-display text-[32px] leading-none text-lemon">Banned</p>
      <p className="mt-3 text-center text-[14.5px] leading-relaxed text-muted">
        اشرح الكلمة… بدون الكلمات الخمس
        <br />
        Describe the word… without the five forbidden ones
      </p>

      <div className="h-7" />
      <input
        className="field" maxLength={NAME_MAX} placeholder="سعد بن صالح · your name"
        value={name} onChange={(e) => setName(e.target.value)}
      />
      <div className="h-3.5" />
      <Btn variant="chili" disabled={busy} onClick={() => {
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
        value={code} onChange={(e) => setCode(e.target.value)}
      />
      <div className="h-2.5" />
      <Btn variant="ghost" disabled={busy}
        onClick={() => run(async () => {
          const id = code.trim();
          if (!id) throw new Error(S("ar").err.writeRoom);
          await api.joinRoom({ roomId: id, name });
          return id;
        }, "ar")}>
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
  value, options, onPick, disabled,
}: { value: number; options: readonly number[]; onPick: (n: number) => void; disabled: boolean }) {
  return (
    <div className="flex gap-1.5">
      {options.map((o) => (
        <button
          key={o} disabled={disabled} onClick={() => onPick(o)}
          className={`flex-1 rounded-[13px] border-2 py-2.5 text-[14px] font-black transition ${
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

function TeamColumn({
  team, room, isHost, me, onKick, onMove,
}: {
  team: TeamId; room: Room; isHost: boolean; me: string;
  onKick: (uid: string) => void; onMove: (uid: string, t: TeamId) => void;
}) {
  const t = TEAM[team];
  const s = S(room.lang);
  return (
    <div className="min-h-[96px] flex-1 rounded-[18px] bg-black/25 p-3">
      <h4 className="mb-2.5 text-[12.5px] font-black" style={{ color: t.hex }}>
        {t.emoji} {s.team[team]}
      </h4>
      {membersOf(room.players, team).map((uid) => (
        <div key={uid} className="mb-2 flex items-center gap-2 text-[14px]">
          <Avatar name={room.players[uid].name} team={team} />
          <button
            className="truncate text-start"
            onClick={() => (isHost || uid === me) && onMove(uid, team === "mint" ? "chili" : "mint")}
          >
            {room.players[uid].name}
          </button>
          {isHost && uid !== me && (
            <button
              className="ms-auto px-1 text-[15px] font-black text-chili"
              onClick={() => onKick(uid)}
              aria-label={s.kickAria}
            >✕</button>
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
    try { await navigator.clipboard.writeText(text); flash(s.copied); }
    catch { flash(url); }
  };

  return (
    <div className="shell">
      {me?.team && <YouChip team={me.team} />}
      <div className="h-3" />

      <div className="rotate-[1deg] rounded-[20px] bg-tang px-3.5 py-3 text-center text-[#3A1D00] shadow-[0_6px_0_#CC6F1B]">
        <small className="text-[11px] font-black tracking-[.18em] opacity-75">{s.roomName}</small>
        <div className="font-display text-[34px] leading-tight">{room.id}</div>
      </div>

      <Btn variant="ghost" className="mt-2.5" onClick={() => setShowQr((v) => !v)}>
        {showQr ? s.hideQr : s.showQr}
      </Btn>
      {showQr && (
        <div className="mt-2.5 flex justify-center">
          <QR url={url} />
        </div>
      )}

      <div className="mt-3.5 flex gap-2.5">
        <TeamColumn team="mint" room={room} isHost={isHost} me={uid}
          onKick={(u) => call(api.kickPlayer({ roomId: room.id, uid: u }))}
          onMove={(u, t) => call(api.setTeam({ roomId: room.id, uid: u, team: t }))} />
        <TeamColumn team="chili" room={room} isHost={isHost} me={uid}
          onKick={(u) => call(api.kickPlayer({ roomId: room.id, uid: u }))}
          onMove={(u, t) => call(api.setTeam({ roomId: room.id, uid: u, team: t }))} />
      </div>

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
          onPick={(n) => call(api.updateSettings({ roomId: room.id, settings: { roundsPerTeam: n } }))} />
        <p className="mt-1.5 text-center text-[11px] leading-relaxed text-muted">
          {s.roundsHint(room.settings.roundsPerTeam, totalTurns(room.settings))}
        </p>
      </div>

      <Flash msg={msg} />
      <div className="flex-1" />

      <div className="flex flex-col gap-3">
        {isHost
          ? <Btn variant="mint" onClick={() => call(api.startGame({ roomId: room.id }))}>{s.startPlay}</Btn>
          : <Waiting>{s.waitingHostBegin}</Waiting>}
        <Btn variant="ghost" onClick={share}>{s.sendLink}</Btn>
        <Btn variant="ghost" onClick={() => call(api.leaveRoom({ roomId: room.id }).then(() => { location.hash = ""; location.reload(); }))}>
          {s.leave}
        </Btn>
      </div>
    </div>
  );
}
