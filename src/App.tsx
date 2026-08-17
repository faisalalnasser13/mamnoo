import React, { useEffect, useState } from "react";
import { ensureAuth } from "./lib/firebase";
import {
  useCard, useCardDealer, useCountdown, usePhaseDriver, useBuzzDriver, useRoom, useRounds,
} from "./lib/hooks";
import { Home, Lobby } from "./screens/Lobby";
import {
  EndPhase, LivePhase, RecapPhase, StealPhase, TransitionPhase, roleOf,
} from "./screens/phases";
import { Backdrop } from "./components/Backdrop";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Btn, Label } from "./components/ui";

function hashRoom(): string {
  const h = decodeURIComponent(location.hash.replace(/^#/, "")).trim();
  return h;
}

export default function App() {
  const [uid, setUid] = useState<string | null>(null);
  const [authFailed, setAuthFailed] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(() => hashRoom() || null);

  useEffect(() => {
    ensureAuth().then((u) => setUid(u.uid)).catch(() => setAuthFailed(true));
  }, []);

  useEffect(() => {
    const onHash = () => setRoomId(hashRoom() || null);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const enter = (id: string) => { location.hash = encodeURIComponent(id); setRoomId(id); };

  const { room, missing } = useRoom(uid ? roomId : null);
  const me = room && uid ? room.players[uid] : null;

  useEffect(() => {
    const en = room?.lang === "en";
    document.documentElement.lang = en ? "en" : "ar";
    document.documentElement.dir = en ? "ltr" : "rtl";
    document.title = !room || !me
      ? "ممنوع · Banned"
      : en ? "Banned" : "ممنوع";
  }, [room, me]);

  // Only the people entitled to the card even open the listener.
  // Live: describer + judge. Steal: describer only — the original
  // judge is on the stealing team and must not keep seeing the word.
  const role = room && uid ? roleOf(room, uid) : "guesser";
  const card = useCard(
    room?.id ?? null,
    Boolean(room && (
      (room.phase === "live" && (role === "giver" || role === "judge"))
      || (room.phase === "steal" && role === "giver")
    )),
  );
  // Needed by the transition board as well as the final screen.
  const rounds = useRounds(
    room?.id ?? null,
    room?.phase === "over" || room?.phase === "transition" || room?.phase === "recap",
  );

  usePhaseDriver(room, uid);
  useBuzzDriver(room, uid);
  useCardDealer(room, uid);

  const { warn, rush } = useCountdown(room);
  const inClock = room?.phase === "live" || room?.phase === "steal";
  const cafe = room?.kit === "cafe";
  const glow =
    rush && inClock ? "glow-rush"
    : warn && inClock ? "glow-warn"
    : me?.team === "chili" ? (cafe ? "glow-tea" : "glow-chili")
    : me?.team === "mint" ? (cafe ? "glow-coffee" : "glow-mint")
    : "";

  let body: React.ReactNode;

  if (authFailed) {
    body = (
      <div className="shell justify-center">
        <p className="text-center font-display text-[24px]">ما قدرنا نتصل</p>
        <p className="mt-1 text-center font-display text-[18px] text-muted">Couldn't connect</p>
        <p className="mt-3 text-center text-[14px] leading-relaxed text-muted">
          تأكد أن «تسجيل الدخول المجهول» مفعّل في Firebase، ثم أعد التحميل.
          <br />
          Enable Anonymous sign-in in Firebase, then reload.
        </p>
        <div className="h-5" />
        <Btn variant="ghost" onClick={() => location.reload()}>أعد المحاولة · Retry</Btn>
      </div>
    );
  } else if (!uid) {
    body = <div className="shell justify-center"><Label>لحظة… · One sec…</Label></div>;
  } else if (!roomId) {
    body = <Home onEnter={enter} initialCode="" />;
  } else if (missing) {
    body = (
      <div className="shell justify-center">
        <p className="text-center font-display text-[24px]">الغرفة انتهت</p>
        <p className="mt-1 text-center font-display text-[18px] text-muted">Room's gone</p>
        <p className="mt-3 text-center text-[14px] text-muted">
          إمّا خرج آخر لاعب، أو الاسم غير صحيح.
          <br />
          Last player left, or the name is wrong.
        </p>
        <div className="h-5" />
        <Btn onClick={() => { location.hash = ""; setRoomId(null); }}>ارجع للبداية · Home</Btn>
      </div>
    );
  } else if (!room) {
    body = <div className="shell justify-center"><Label>جاري الدخول… · Joining…</Label></div>;
  } else if (!me) {
    // Known room, but we're not in it — the join form, prefilled.
    body = <Home onEnter={enter} initialCode={room.id} joinLang={room.lang} />;
  } else {
    const ctx = { room, uid, card, rounds };
    body =
      room.phase === "lobby" ? <Lobby room={room} uid={uid} />
      : room.phase === "transition" ? <TransitionPhase {...ctx} />
      : room.phase === "live" ? <LivePhase {...ctx} />
      : room.phase === "steal" ? <StealPhase {...ctx} />
      : room.phase === "recap" ? <RecapPhase {...ctx} />
      : <EndPhase {...ctx} />;
  }

  return (
    <>
      <Backdrop />
      <div className={`glow ${glow}`} aria-hidden />
      <ErrorBoundary>{body}</ErrorBoundary>
      <p
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[3] text-center text-[9px] leading-none tracking-[.04em] text-muted/35"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        dir="ltr"
      >
        AboMona Studios<span className="ms-0.5">™</span>
      </p>
    </>
  );
}
