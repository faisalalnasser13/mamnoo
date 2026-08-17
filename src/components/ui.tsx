import React, { useEffect, useRef, useState } from "react";
import type { FlashMsg } from "../lib/hooks";
import type { Lang, TeamId } from "../lib/types";

export const TEAM: Record<TeamId, { emoji: string; hex: string }> = {
  mint:  { emoji: "🌿", hex: "#2FD6BC" },
  chili: { emoji: "🌶️", hex: "#FF4D79" },
};

/**
 * Wooden court gavel, same box as the mic emoji next to it.
 *
 * Unicode has no gavel (only a claw hammer and a robed judge), so this
 * is the illustration the table picked — a 96px PNG so it stays sharp
 * at the 18px mark size.
 */
export function Gavel({ size = 18 }: { size?: number }) {
  return (
    <img
      src="/gavel.png"
      alt=""
      width={size}
      height={size}
      draggable={false}
      aria-hidden
      style={{ display: "block", flexShrink: 0, width: size, height: size, objectFit: "contain" }}
    />
  );
}

/**
 * The two names of the game, as one lockup.
 *
 * Both words are the same family, weight and colour, and the Latin one
 * is uppercased and tracked: Baloo's lowercase next to ممنوع reads as a
 * caption in a different voice, which is what made the pair look like
 * two unrelated bits of text. Caps at .58 of the Arabic size land on the
 * same optical weight, and the lemon rule between them says "same word,
 * two scripts" rather than "title and subtitle".
 *
 * `lang` leads with that language; unset shows the Arabic first, which
 * is the home screen where no room language has been chosen yet.
 */
export function Wordmark({ size = 58, lang }: { size?: number; lang?: Lang }) {
  const en = lang === "en";
  const lead = en ? { text: "BANNED", latin: true, size: size * 0.72 } : { text: "ممنوع", latin: false, size };
  const echo = en ? { text: "ممنوع", latin: false, size: size * 0.62 } : { text: "BANNED", latin: true, size: size * 0.52 };

  const Line = ({ text, latin, size: fs }: { text: string; latin: boolean; size: number }) => (
    <div
      className="font-display leading-none"
      style={{
        fontSize: fs,
        // Tracking is added on the trailing side only, so a centred
        // caps word doesn't sit visibly off-centre.
        letterSpacing: latin ? ".14em" : undefined,
        marginInlineStart: latin ? ".14em" : undefined,
      }}
    >
      {text}
    </div>
  );

  return (
    <div className="flex flex-col items-center gap-2 text-cream">
      <Line {...lead} />
      <i className="block h-[2px] w-8 rounded-full bg-lemon/40" />
      <Line {...echo} />
    </div>
  );
}

export function Btn({
  variant = "lemon", huge, className = "", ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "lemon" | "ok" | "ban" | "tang" | "ghost";
  huge?: boolean;
}) {
  return <button className={`btn btn-${variant} ${huge ? "btn-huge" : ""} ${className}`} {...rest} />;
}

/**
 * Which team am I on: the emoji alone, no pill and no caption.
 *
 * The glow already paints the screen in that colour, and the extra line
 * ("اشرح!", "دوركم") was a second heading competing with the one the
 * phase actually needs. A 16px mark is enough to glance at.
 */
export function YouChip({ team }: { team: TeamId }) {
  return (
    <div className="mx-auto leading-none" aria-hidden>
      <span className="text-[16px] leading-none">{TEAM[team].emoji}</span>
    </div>
  );
}

/**
 * A section heading with rules either side.
 *
 * Both rules fade at both ends so the pair is symmetric: a
 * `to-r`/`to-l` pair is physical and would flip the taper under RTL.
 * No letter-spacing — it prises apart the joins in Arabic.
 */
export function Title({ children, tone }: { children: React.ReactNode; tone?: string }) {
  const rule = (
    <i className="h-px min-w-4 flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
  );
  return (
    <div className="flex items-center gap-3">
      {rule}
      <h2 className="shrink-0 font-display text-[20px] leading-none" style={{ color: tone ?? "#FFF6E9" }}>
        {children}
      </h2>
      {rule}
    </div>
  );
}

export function Label({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return (
    <p className="text-center text-[11.5px] font-bold tracking-[.18em]"
       style={{ color: tone ?? "#A99BC4" }}>
      {children}
    </p>
  );
}

export function Waiting({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[20px] bg-black/25 px-4 py-4 text-center text-[15px] font-bold text-muted">
      {children}
    </div>
  );
}

export function Avatar({ name, team, big }: { name: string; team: TeamId; big?: boolean }) {
  const t = TEAM[team];
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-black text-night ${
        big ? "h-[50px] w-[50px] font-display text-[21px]" : "h-[26px] w-[26px] text-[11.5px]"
      }`}
      style={{ background: t.hex, color: team === "chili" ? "#fff" : "#241638" }}
    >
      {(name || "؟").trim().charAt(0)}
    </span>
  );
}

/**
 * Both scores, always visible — including mid-clue.
 *
 * When a total moves (صح, skip, buzz, or a host +/−), that pill plays
 * option C: a ring, an emoji punch, the new number fading in, and a
 * signed delta. Green/red are off the team palette so a chili plus
 * doesn't look like chili scoring and a mint minus doesn't look like
 * mint. `loud` is the spectator size — guessers have no card, so the
 * tick has room to be the event.
 */
export function Tally({
  scores, loud,
}: {
  scores: Record<TeamId, number>;
  loud?: boolean;
}) {
  const prev = useRef(scores);
  const gen = useRef(0);
  const [hit, setHit] = useState<Partial<Record<TeamId, { d: number; k: number }>>>({});

  useEffect(() => {
    const next: typeof hit = {};
    let any = false;
    (["mint", "chili"] as const).forEach((t) => {
      const d = scores[t] - prev.current[t];
      if (d !== 0) {
        gen.current += 1;
        next[t] = { d, k: gen.current };
        any = true;
      }
    });
    prev.current = scores;
    if (any) setHit(next);
  }, [scores.mint, scores.chili]);

  const Pill = ({ team, emoji, ink }: { team: TeamId; emoji: string; ink: string }) => {
    const h = hit[team];
    const up = h != null && h.d > 0;
    return (
      <span
        className={`tally-pill ${loud ? "tally-loud" : ""} ${h ? (up ? "tally-up" : "tally-down") : ""}`}
        style={{ background: TEAM[team].hex, color: ink }}
      >
        {h && <i key={`r${h.k}`} className="tally-ring" aria-hidden />}
        <span className="tally-em">{emoji}</span>
        <span className="tally-num">{scores[team]}</span>
        {h && (
          <span key={`g${h.k}`} className="tally-ghost" aria-hidden>
            {h.d > 0 ? "+" : "−"}{Math.abs(h.d)}
          </span>
        )}
      </span>
    );
  };

  return (
    <div className="flex gap-1.5" dir="ltr">
      <Pill team="mint" emoji="🌿" ink="#10322D" />
      <Pill team="chili" emoji="🌶️" ink="#fff" />
    </div>
  );
}

export function Flash({ msg }: { msg: FlashMsg | null }) {
  if (!msg) return null;
  return (
    <p className={`mt-2 text-center text-[13px] font-bold ${msg.ok ? "text-plus" : "text-minus"}`}>
      {msg.text}
    </p>
  );
}
