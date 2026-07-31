import React from "react";
import type { TeamId } from "../lib/types";

export const TEAM: Record<TeamId, { name: string; emoji: string; hex: string }> = {
  mint:  { name: "النعناع", emoji: "🌿", hex: "#2FD6BC" },
  chili: { name: "الفلفل",  emoji: "🌶️", hex: "#FF4D79" },
};

export function Btn({
  variant = "lemon", huge, className = "", ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "lemon" | "mint" | "chili" | "tang" | "ghost";
  huge?: boolean;
}) {
  return <button className={`btn btn-${variant} ${huge ? "btn-huge" : ""} ${className}`} {...rest} />;
}

/**
 * Which team am I on. The emoji carries it — spelling out "أنت في
 * النعناع" on every screen is a sentence nobody re-reads after the first
 * round, and the glow behind the whole screen already says it in colour.
 * `extra` is the only thing that actually changes turn to turn.
 */
export function YouChip({ team, extra }: { team: TeamId; extra?: string }) {
  const t = TEAM[team];
  return (
    <div
      className="mx-auto flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-black"
      style={{ background: `${t.hex}29`, color: t.hex }}
    >
      <span className="text-[15px] leading-none">{t.emoji}</span>
      {extra}
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

export function Flash({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p className="mt-2 text-center text-[13px] font-bold text-chili">{msg}</p>;
}
