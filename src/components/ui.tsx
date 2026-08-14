import React from "react";
import type { FlashMsg } from "../lib/hooks";
import type { Lang, TeamId } from "../lib/types";

export const TEAM: Record<TeamId, { emoji: string; hex: string }> = {
  mint:  { emoji: "🌿", hex: "#2FD6BC" },
  chili: { emoji: "🌶️", hex: "#FF4D79" },
};

/**
 * A wooden court gavel. Unicode has a claw hammer and a robed judge,
 * neither of which is this — so it's drawn, not an emoji.
 *
 * The silhouette is the one people know: round head, short handle,
 * sounding block. Reads at 12px because the three parts stay separate
 * shapes, not carved grain.
 */
export function Gavel({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" aria-hidden
      style={{ display: "block", flexShrink: 0 }}
    >
      {/* sounding block */}
      <rect x="2.5" y="18.2" width="13" height="3.6" rx="0.9" fill="#5A3010" />
      <rect x="3" y="18.2" width="12" height="1.15" rx="0.5" fill="#7A4A1C" />
      <g transform="rotate(-36 13 12)">
        {/* handle */}
        <rect x="11.15" y="8.2" width="2.7" height="12.4" rx="1.25" fill="#6B3A14" />
        <rect x="11.45" y="9" width="0.7" height="10" rx="0.35" fill="#8B5A2B" opacity=".55" />
        {/* head */}
        <rect x="5.6" y="5" width="13.8" height="5.6" rx="1.7" fill="#C4894A" />
        <rect x="5.6" y="5" width="2.4" height="5.6" rx="1.2" fill="#8B4E22" />
        <rect x="17" y="5" width="2.4" height="5.6" rx="1.2" fill="#8B4E22" />
        <rect x="8" y="6.05" width="8.8" height="1.15" rx="0.5" fill="#E0B27A" opacity=".55" />
      </g>
    </svg>
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
  variant?: "lemon" | "mint" | "chili" | "tang" | "ghost";
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

/** Both scores, always visible — including mid-clue. */
export function Tally({ scores }: { scores: Record<TeamId, number> }) {
  return (
    <div className="flex gap-1.5" dir="ltr">
      <span className="flex items-center gap-1 rounded-full bg-mint px-3 py-1 text-[14px] font-black text-[#10322D]">
        🌿 {scores.mint}
      </span>
      <span className="flex items-center gap-1 rounded-full bg-chili px-3 py-1 text-[14px] font-black text-white">
        🌶️ {scores.chili}
      </span>
    </div>
  );
}

export function Flash({ msg }: { msg: FlashMsg | null }) {
  if (!msg) return null;
  return (
    <p className={`mt-2 text-center text-[13px] font-bold ${msg.ok ? "text-mint" : "text-chili"}`}>
      {msg.text}
    </p>
  );
}
