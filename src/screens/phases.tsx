import React from "react";
import { api, errText } from "../lib/firebase";
import { useBuzzHaptic, useCountdown, useFlash, type LiveCard } from "../lib/hooks";
import {
  canSkip, computeStats, inLockout, membersOf, nextTurnFor, OTHER,
  SKIP_LOCKOUT_MS, TARGET_SCORE, totalTurns,
} from "../lib/rules";
import type { Room, RoundRecord, TeamId } from "../lib/types";
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

  const call = (p: Promise<unknown>) => p.catch((e) => flash(errText(e)));

  /* ---- describer ---- */
  if (role === "giver" && room.turn) {
    const own = room.scores[room.turn.team];
    const opp = room.scores[OTHER[room.turn.team]];
    const gap = own - opp;
    // No tatweel (ـ) anywhere in the UI — it renders as a gap in Tajawal.
    const gapText = gap > 0 ? `فريقك متقدّم بفارق ${gap}`
      : gap < 0 ? `فريقك متأخر بفارق ${-gap}` : "تعادل";

    return (
      <div className="shell">
        {team && <YouChip team={team} extra="اشرح!" />}
        <div className="h-2.5" />
        <Hud remaining={remaining} pct={pct} warn={warn} rush={rush} scores={room.scores} />
        <div className="h-3.5" />

        {card
          ? <Card word={card.word} taboo={card.taboo} kicker={buzzed ? "…" : rush ? "بسرعة!" : "اشرحها"} buzzed={buzzed} />
          : <CardSkeleton note="جاري السحب…" />}

        <Heat streak={room.round.streak}
          note={buzzed ? "💧 انطفأ الحماس" : room.round.streak % 3 === 2 ? "🔥 القادمة بنقطتين" : undefined} />

        <RunLine red={buzzed}>
          {buzzed ? "−1 · البطاقة محروقة" : `+${room.round.points} هذه الجولة · ${gapText}`}
        </RunLine>

        {room.paused && <PausedBanner />}
        <Flash msg={msg} />
        <div className="flex-1" />
        {room.hostUid === uid && <HostControls room={room} />}
        <div className="mt-2 flex flex-col gap-3">
          <Btn variant="mint" disabled={buzzed || cardId === null}
            onClick={() => cardId !== null && call(api.resolve({ roomId: room.id, res: "ok", fromCardId: cardId }))}>
            صح ✓
          </Btn>
          <Btn variant="ghost"
            disabled={buzzed || cardId === null || !canSkip(room.round.skipsLeft, remaining)}
            onClick={() => cardId !== null && call(api.resolve({ roomId: room.id, res: "skip", fromCardId: cardId }))}>
            {locked
              ? `🔒 ما في تبديل في آخر ${SKIP_LOCKOUT_MS / 1000} ثوانٍ`
              : `تخطي · بقي ${room.round.skipsLeft}`}
          </Btn>
        </div>
      </div>
    );
  }

  /* ---- judge ---- */
  if (role === "judge") {
    return (
      <div className="shell">
        {team && <YouChip team={team} extra="حكم هذه الجولة 👀" />}
        <div className="h-2.5" />
        <Hud remaining={remaining} pct={pct} warn={warn} rush={rush} scores={room.scores} />
        <div className="h-3.5" />
        {card
          ? <Card word={card.word} taboo={card.taboo} buzzed={buzzed} small />
          : <CardSkeleton note="بانتظار البطاقة…" />}
        {/* Only the describer's device deals. If theirs is asleep or its
            tab crashed, no card ever arrives and the clock can't rescue
            the turn — so say so instead of showing a silent spinner. */}
        {!card && stalled && (
          <p className="mt-3 text-center text-[12.5px] leading-relaxed text-muted">
            ما وصلت البطاقة. جهاز {nameOf(room, room.turn?.clueGiverUid ?? "")} قد يكون نايم —
            المضيف يقدر ينهي الجولة من ⚙︎ تحكّم المضيف.
          </p>
        )}
        {room.paused && <PausedBanner />}
        <Flash msg={msg} />
        <div className="flex-1" />
        {room.hostUid === uid && <HostControls room={room} />}
        <Btn variant="chili" huge disabled={buzzed || cardId === null}
          onClick={() => cardId !== null && call(api.buzz({ roomId: room.id, fromCardId: cardId }))}>
          ممنوع!
        </Btn>
        <div className="h-2.5" />
        <Label>اضغط إذا قال إحدى الخمس</Label>
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
        <p className="text-center font-display text-[64px] leading-none text-chili">ممنوع!</p>
        <p className="mt-3 text-center text-[15px] font-bold text-muted">
          {nameOf(room, room.turn?.clueGiverUid ?? "")} قال كلمة ممنوعة
        </p>
        <p className="mt-1 text-center text-[13px] text-muted">
          {mineTurn(room, uid) ? "−1 عليكم · البطاقة محروقة" : "−1 عليهم · البطاقة محروقة"}
        </p>
        <div className="flex-1" />
      </div>
    );
  }

  /* ---- my team is guessing ---- */
  const mine = team === room.turn?.team;

  if (mine) {
    return (
      <div className="shell">
        {team && <YouChip team={team} extra="خمّن! 📣" />}
        <div className="h-2.5" />
        <Hud remaining={remaining} pct={pct} warn={warn} rush={rush} scores={room.scores} />
        <div className="h-5" />
        <Label>يشرح الآن</Label>
        <p className="mt-1 text-center font-display text-[32px]">
          {nameOf(room, room.turn?.clueGiverUid ?? "")} 🎤
        </p>
        <Heat streak={room.round.streak} />
        <Feed log={room.round.log} newestFirst />
        {room.paused && <PausedBanner />}
        <div className="flex-1" />
        {room.hostUid === uid && <HostControls room={room} />}
        <Label>صيحوا بالإجابة في المكالمة 📣</Label>
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
      {team && <YouChip team={team} extra="استمعوا 👂" />}
      <div className="h-2.5" />
      <Hud remaining={remaining} pct={pct} warn={warn} rush={rush} scores={room.scores} />
      <div className="h-5" />
      <Label>دور الخصم</Label>
      <p className="mt-1 text-center font-display text-[28px]">
        {nameOf(room, room.turn?.clueGiverUid ?? "")} يشرح
      </p>

      {/* Once skip locks, the card on the table is the one that will be
          stolen. Telling the idle team that turns a dead minute into a
          ten-second countdown they have a reason to watch. */}
      <div className={`mt-5 rounded-[18px] border-2 px-4 py-4 text-center transition ${
        locked ? "border-chili bg-chili/20" : "border-chili/30 bg-chili/10"
      }`}>
        <p className="font-display text-[19px] text-chili">
          {locked ? "🔒 ما يقدر يبدّل — ركّزوا" : "احفظوا الشرح"}
        </p>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
          {locked
            ? "هذه البطاقة هي الأخيرة. إن لم يخمّنوها، فهي لكم."
            : "إذا انتهى الوقت وبقيت بطاقة، لكم عشر ثوانٍ لسرقتها — ونقطة إن خمّنتموها."}
        </p>
      </div>

      <div className="mt-4 rounded-[16px] bg-black/25 px-4 py-3 text-center">
        <span className="text-[13px] font-bold text-muted">جابوا هذه الجولة</span>
        <p className="font-display text-[30px]" style={{ color: TEAM[room.turn!.team].hex }}>
          +{room.round.points}
        </p>
      </div>

      {room.paused && <PausedBanner />}
      <div className="flex-1" />
      {room.hostUid === uid && <HostControls room={room} />}
      <Label>{nameOf(room, room.turn?.judgeUid ?? "")} يحكم عنكم 🚨</Label>
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

  const thief = OTHER[room.turn.team];
  const team = myTeam(room, uid);
  const mine = team === thief;
  // There is no defence. Only the opposing judge can award the steal;
  // the describing team just watches the clock. Don't tell them to
  // "defend" — they have no button and no veto.

  return (
    <div className="shell">
      {team && <YouChip team={team} extra={mine ? "فرصتكم!" : "انتهت جولتكم"} />}
      <div className="h-2.5" />
      <Hud remaining={remaining} pct={pct} warn={warn} rush={rush} scores={room.scores} />
      <div className="h-5" />
      <Label>انتهى وقت {TEAM[room.turn.team].name} على هذه البطاقة</Label>
      <p className="mt-1 text-center font-display text-[42px] text-chili">سرقة!</p>
      <p className="mt-2 text-center text-[14.5px] leading-relaxed text-muted">
        {mine
          ? "خمّنوا من الشرح الذي سمعتموه — الحكم يضغط إن صحّت"
          : "ما في دفاع. حكم الخصم يقرر إن سرقوا البطاقة"}
      </p>

      <div className="flex-1" />
      <div className="card" style={{ rotate: "1.5deg", padding: "24px 18px" }}>
        <div className="card-word" style={{ fontSize: 38, margin: 0 }}>؟ ؟ ؟</div>
      </div>
      {room.paused && <PausedBanner />}
      <Flash msg={msg} />
      <div className="flex-1" />
      {room.hostUid === uid && <HostControls room={room} />}

      {roleOf(room, uid) === "judge"
        ? (
          <Btn variant="chili"
            onClick={() => api.claimSteal({ roomId: room.id }).catch((e) => flash(errText(e)))}>
            خمّنّاها — نقطة لنا
          </Btn>
        )
        : <Waiting>{nameOf(room, room.turn.judgeUid)} يحكم على السرقة…</Waiting>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* recap                                                              */
/* ------------------------------------------------------------------ */

export function RecapPhase({ room, uid, rounds }: Ctx) {
  const { msg, flash } = useFlash();
  if (!room.turn) return null;
  const team = myTeam(room, uid);
  const mine = team === room.turn.team;
  const pts = room.round.points;

  return (
    <div className="shell">
      {team && <YouChip team={team} extra={mine ? "جولتكم" : "جولتهم"} />}
      <div className="h-3" />
      <Label>شرحها {nameOf(room, room.turn.clueGiverUid)}</Label>
      <p className="mt-0.5 text-center font-display text-[68px] leading-none"
         style={{ color: pts >= 0 ? "#2FD6BC" : "#FF4D79" }}>
        {pts >= 0 ? "+" : ""}{pts}
      </p>
      <ScoreBoard room={room} uid={uid} rounds={rounds} />
      <Feed log={room.round.log} />
      <Flash msg={msg} />
      <div className="flex-1" />
      {room.hostUid === uid && <HostControls room={room} />}
      {room.hostUid === uid
        ? (
          <Btn className="mt-2" onClick={() => api.advancePhase({
              roomId: room.id, fromPhase: "recap", fromTurn: room.turnIndex,
            }).catch((e) => flash(errText(e)))}>
            تمام
          </Btn>
        )
        : <Waiting>بانتظار {nameOf(room, room.hostUid)}… ⏳</Waiting>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* transition                                                         */
/* ------------------------------------------------------------------ */

/**
 * The one deliberate pause. It answers four questions at once: who's
 * describing, who's judging, how many rounds are left, and what the
 * score is — then waits for the host, so nobody starts talking into a
 * round half the table hasn't looked at yet.
 */
export function TransitionPhase({ room, uid, rounds }: Ctx) {
  const { msg, flash } = useFlash();
  if (!room.turn) return null;

  const total = totalTurns(room.settings);
  const team = myTeam(room, uid);
  const oppTeam = OTHER[room.turn.team];
  const mineAt = nextTurnFor(room.players, room.turnIndex, total, uid);

  const yourTurnNote =
    mineAt === null ? null
    : mineAt === room.turnIndex ? "دورك الآن! 🎤"
    : `دورك أنت في الجولة ${mineAt + 1}`;

  const Side = ({ t, role, who }: { t: TeamId; role: string; who: string }) => (
    <div className="flex-1 rounded-[20px] bg-black/25 px-2 py-3.5 text-center">
      <div className="mb-2 text-[10.5px] font-black tracking-[.16em]" style={{ color: TEAM[t].hex }}>
        {role}
      </div>
      <div className="mx-auto mb-1.5 w-fit"><Avatar name={who} team={t} big /></div>
      <div className="text-[16.5px] font-black">{who}</div>
      <div className="mt-0.5 text-[11.5px] text-muted">{TEAM[t].emoji} {TEAM[t].name}</div>
    </div>
  );

  const oursNext = team === room.turn.team;

  return (
    <div className="shell">
      {team && <YouChip team={team} extra={oursNext ? "دوركم" : "دورهم"} />}
      <div className="h-3" />
      <Label>الجولة {room.turnIndex + 1} من {total}</Label>

      <div className="mt-3.5 flex gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <i key={i} className="h-[7px] flex-1 rounded-full"
             style={{
               background: i < room.turnIndex ? "#FFD84D" : i === room.turnIndex ? "#FF9A3C" : "rgba(255,246,233,.15)",
               boxShadow: i === room.turnIndex ? "0 0 12px rgba(255,154,60,.7)" : undefined,
             }} />
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2.5">
        <Side t={room.turn.team} role="يشرح" who={nameOf(room, room.turn.clueGiverUid)} />
        <span className="font-display text-[21px] text-lemon">ضد</span>
        <Side t={oppTeam} role="يحكم" who={nameOf(room, room.turn.judgeUid)} />
      </div>

      <ScoreBoard room={room} uid={uid} rounds={rounds} />
      {yourTurnNote && (
        <>
          <div className="h-3.5" />
          <Label tone="#FF9A3C">{yourTurnNote}</Label>
        </>
      )}

      <Flash msg={msg} />
      <div className="flex-1" />

      {room.hostUid === uid
        ? (
          <>
            <Btn variant="tang"
              onClick={() => api.startTurn({ roomId: room.id }).catch((e) => flash(errText(e)))}>
              ابدأ جولة {nameOf(room, room.turn.clueGiverUid)} ▸
            </Btn>
            <div className="h-2.5" />
            <Label>أنت المضيف — الجميع بانتظارك</Label>
          </>
        )
        : <Waiting>بانتظار {nameOf(room, room.hostUid)} ليبدأ… ⏳</Waiting>}
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
  const stats = computeStats(rounds);
  const win = room.winner;
  const draw = win === "draw" || !win;

  const rows: Array<{ em: string; gloss: string; title: string; sub: string }> = [];
  if (stats.talker) {
    rows.push({
      em: "🎤", gloss: "أكثر من شرح",
      title: nameOf(room, stats.talker.uid),
      sub: `${stats.talker.n} بطاقة`,
    });
  }
  if (stats.buzzer) {
    rows.push({
      em: "🚨", gloss: "أشد حكم",
      title: nameOf(room, stats.buzzer.uid),
      sub: `${stats.buzzer.n} مرة`,
    });
  }
  if (stats.longest) {
    rows.push({
      em: "🐢", gloss: "أطول كلمة",
      title: stats.longest.word,
      sub: `${Math.round(stats.longest.ms / 1000)} ثانية`,
    });
  }
  if (stats.streak) {
    rows.push({
      em: "🔥", gloss: "أطول سلسلة",
      title: nameOf(room, stats.streak.uid),
      sub: `${stats.streak.n} متتالية`,
    });
  }

  const reason =
    draw ? "🤝 تعادل"
    : room.endReason === "target" ? `أول من وصل ${TARGET_SCORE}`
    : room.endReason === "abandoned" ? "أنهاها المضيف"
    : "انتهت الجولات";

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
  return (
    <div className="flex flex-col gap-3">
      {room.hostUid === uid && (
        <Btn variant="tang" onClick={() => api.rematch({ roomId: room.id }).catch((e) => flash(errText(e)))}>
          مرة ثانية بنفس الفرق
        </Btn>
      )}
      <Btn variant="ghost"
        onClick={() => api.leaveRoom({ roomId: room.id }).finally(() => { location.hash = ""; location.reload(); })}>
        خروج
      </Btn>
    </div>
  );
}
