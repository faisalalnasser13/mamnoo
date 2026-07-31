import React, { useState } from "react";
import { api, errText } from "../lib/firebase";
import { useFlash, useLocal } from "../lib/hooks";
import { membersOf, NAME_MAX, ROUND_SECS_OPTIONS, ROUNDS_PER_TEAM_OPTIONS, totalTurns } from "../lib/rules";
import type { Room, TeamId } from "../lib/types";
import { Avatar, Btn, Flash, Label, TEAM, Waiting, YouChip } from "../components/ui";

/* ------------------------------------------------------------------ */
/* home                                                               */
/* ------------------------------------------------------------------ */

export function Home({ onEnter, initialCode }: { onEnter: (id: string) => void; initialCode: string }) {
  const [name, setName] = useLocal("mamnou3:name", "");
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const { msg, flash } = useFlash();

  const run = async (fn: () => Promise<string>) => {
    if (busy) return;
    if (!name.trim()) return flash("اكتب اسمك أولًا.");
    setBusy(true);
    try { onEnter(await fn()); }
    catch (e) { flash(errText(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="shell">
      <div className="h-7" />
      <h1 className="text-center font-display text-[62px] leading-none">ممنوع</h1>
      <p className="mt-2.5 text-center text-[14.5px] leading-relaxed text-muted">
        اشرح الكلمة… بدون الكلمات الخمس
      </p>

      <div className="h-7" />
      <input
        className="field" maxLength={NAME_MAX} placeholder="سعد بن صالح"
        value={name} onChange={(e) => setName(e.target.value)}
      />
      <div className="h-3.5" />
      <Btn variant="chili" disabled={busy}
        onClick={() => run(async () => (await api.createRoom({ name })).roomId)}>
        افتح غرفة
      </Btn>

      <div className="h-6" />
      <Label>أو ادخل باسم الغرفة</Label>
      <div className="h-2.5" />
      <input
        className="field font-display text-[26px] tracking-[.1em] text-lemon"
        maxLength={12} placeholder="قهوة"
        value={code} onChange={(e) => setCode(e.target.value)}
      />
      <div className="h-2.5" />
      <Btn variant="ghost" disabled={busy}
        onClick={() => run(async () => {
          const id = code.trim();
          if (!id) throw new Error("اكتب اسم الغرفة");
          await api.joinRoom({ roomId: id, name });
          return id;
        })}>
        ادخل
      </Btn>

      <Flash msg={msg} />
      <div className="flex-1" />
      <Label>كل لاعب على جواله · افتحوا مكالمة معًا</Label>
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
  return (
    <div className="min-h-[96px] flex-1 rounded-[18px] bg-black/25 p-3">
      <h4 className="mb-2.5 text-[12.5px] font-black" style={{ color: t.hex }}>
        {t.emoji} {t.name}
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
            <button className="ms-auto px-1 text-[15px] font-black text-white/35"
              onClick={() => onKick(uid)} aria-label="اطرد">✕</button>
          )}
        </div>
      ))}
    </div>
  );
}

export function Lobby({ room, uid }: { room: Room; uid: string }) {
  const isHost = room.hostUid === uid;
  const { msg, flash } = useFlash();
  const me = room.players[uid];

  const call = (p: Promise<unknown>) => p.catch((e) => flash(errText(e)));

  const share = async () => {
    const url = `${location.origin}/#${encodeURIComponent(room.id)}`;
    const text = `العب معنا «ممنوع» — اسم الغرفة: ${room.id}\n${url}`;
    if (navigator.share) { try { await navigator.share({ text }); return; } catch { /* cancelled */ } }
    try { await navigator.clipboard.writeText(text); flash("انتسخ الرابط ✅"); }
    catch { flash(url); }
  };

  return (
    <div className="shell">
      {me?.team && <YouChip team={me.team} />}
      <div className="h-3" />

      <div className="rotate-[1deg] rounded-[20px] bg-tang px-3.5 py-3 text-center text-[#3A1D00] shadow-[0_6px_0_#CC6F1B]">
        <small className="text-[11px] font-black tracking-[.18em] opacity-75">اسم الغرفة</small>
        <div className="font-display text-[34px] leading-tight">{room.id}</div>
      </div>

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
          🔀 اخلط الفرق عشوائيًا
        </Btn>
      )}

      <div className="mt-3.5">
        <div className="mb-2 flex justify-between text-[12px] font-bold text-muted">
          <span>مدة الجولة</span><span>ثانية</span>
        </div>
        <Chips value={room.settings.roundSecs} options={ROUND_SECS_OPTIONS} disabled={!isHost}
          onPick={(n) => call(api.updateSettings({ roomId: room.id, settings: { roundSecs: n } }))} />
      </div>

      <div className="mt-3.5">
        <div className="mb-2 flex justify-between text-[12px] font-bold text-muted">
          <span>جولات لكل فريق</span>
          <span>الإجمالي {totalTurns(room.settings)}</span>
        </div>
        <Chips value={room.settings.roundsPerTeam} options={ROUNDS_PER_TEAM_OPTIONS} disabled={!isHost}
          onPick={(n) => call(api.updateSettings({ roomId: room.id, settings: { roundsPerTeam: n } }))} />
        <p className="mt-1.5 text-center text-[11px] leading-relaxed text-muted">
          كل رقم = جولات فريقك. الفريقان يتناوبان، فـ{room.settings.roundsPerTeam} لكل فريق
          = {totalTurns(room.settings)} جولة إجمالًا.
        </p>
      </div>

      <Flash msg={msg} />
      <div className="flex-1" />

      <div className="flex flex-col gap-3">
        {isHost
          ? <Btn variant="mint" onClick={() => call(api.startGame({ roomId: room.id }))}>ابدأ اللعب</Btn>
          : <Waiting>بانتظار المضيف ليبدأ… ⏳</Waiting>}
        <Btn variant="ghost" onClick={share}>📲 أرسل الرابط</Btn>
        <Btn variant="ghost" onClick={() => call(api.leaveRoom({ roomId: room.id }).then(() => { location.hash = ""; location.reload(); }))}>
          خروج
        </Btn>
      </div>
    </div>
  );
}
