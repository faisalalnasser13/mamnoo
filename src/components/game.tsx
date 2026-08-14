import React from "react";
import type { LogEntry, Lang, TeamId } from "../lib/types";
import { HEAT_EVERY, heatPips } from "../lib/rules";
import { S } from "../lib/strings";
import { Tally } from "./ui";

/* ------------------------------------------------------------------ */

/**
 * Step the word down instead of letting it wrap to three lines. The
 * English deck has entries twice the length of a typical Arabic one.
 */
function wordSize(word: string, small?: boolean): number {
  const n = word.length;
  if (small) return n > 18 ? 22 : n > 12 ? 25 : 28;
  return n > 18 ? 29 : n > 12 ? 35 : 42;
}

/**
 * The card. Everything else on screen is quiet so this can be loud.
 * `small` is the judge's variant — they need to read it, not perform it.
 */
export function Card({
  word, taboo, kicker, buzzed, small, stamp,
}: {
  word: string;
  taboo: string[];
  kicker?: string;
  buzzed?: boolean;
  small?: boolean;
  stamp?: string;
}) {
  return (
    <div className={`card ${buzzed ? "card-buzzed" : ""}`} style={small ? { padding: "18px 16px 16px" } : undefined}>
      {kicker && (
        <span
          className="inline-block rounded-full px-3 py-1 text-[10px] font-black tracking-[.2em] text-white"
          style={{ background: buzzed ? "#FF4D79" : "#FF9A3C" }}
        >
          {kicker}
        </span>
      )}
      <div
        className="card-word"
        style={{ fontSize: wordSize(word, small), margin: small ? "6px 0 11px" : "9px 0 13px" }}
      >
        {word}
      </div>
      <div className="card-rule mb-3" />
      <div className="rail">
        {taboo.map((t) => (
          <b key={t} style={{ fontSize: small ? 16 : 17.5 }}>{t}</b>
        ))}
      </div>
      {buzzed && <div className="stamp">{stamp ?? "ممنوع"}</div>}
    </div>
  );
}

/** Placeholder while the describer's device is dealing. */
export function CardSkeleton({ note, unknown }: { note: string; unknown?: string }) {
  return (
    <div className="card">
      <div className="card-word" style={{ fontSize: 38, margin: "18px 0" }}>{unknown ?? "؟ ؟ ؟"}</div>
      <p className="text-[13px] font-bold text-[#8a7f6a]">{note}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Clock + both scores.
 *
 * Urgency steps: calm lemon → soft orange at 15s → red blink at 10s.
 * The bar width snaps with the clock (no CSS transition) — a lagged
 * width animation read as a second timer strip trailing the real one.
 */
export function Hud({
  remaining, pct, warn, rush, scores, right,
}: {
  remaining: number | null;
  pct: number;
  warn?: boolean;
  rush?: boolean;
  scores?: Record<TeamId, number>;
  right?: React.ReactNode;
}) {
  const secs = Math.ceil((remaining ?? 0) / 1000);
  const text = remaining == null ? "—" : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const bar =
    rush ? "bg-chili bar-rush"
    : warn ? "bg-tang bar-warn"
    : "bg-lemon";
  const color = rush ? "#FF4D79" : warn ? "#FF9A3C" : "#FFD84D";
  const size = rush ? 34 : warn ? 30 : 26;
  return (
    <div>
      <div className="h-[9px] overflow-hidden rounded-full bg-black/30">
        <div
          className={`h-full rounded-full ${bar}`}
          style={{ width: `${Math.round(pct * 100)}%` }}
        />
      </div>
      <div className="mt-2.5 flex items-center justify-between">
        <span
          className={`clock ${rush ? "clock-rush" : warn ? "clock-warn" : ""}`}
          style={{ fontSize: size, color }}
        >
          {text}
        </span>
        {right ?? (scores && <Tally scores={scores} />)}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Heat pips under the card. Three empty slots to start; once the 3rd
 * correct lands, an empty next slot is always waiting — so at 3 you see
 * ●●●○, at 4 ●●●●○, and so on.
 */
export function Heat({ streak, note }: { streak: number; note?: string }) {
  const on = heatPips(streak);
  const slots = Math.max(HEAT_EVERY, on + 1);
  return (
    <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
      {Array.from({ length: slots }, (_, i) => (
        <i
          key={i}
          className="h-3 w-3 rounded-full"
          style={
            i < on
              ? { background: "#FF9A3C", boxShadow: "0 0 14px rgba(255,154,60,.75)" }
              : { background: "rgba(255,246,233,.15)" }
          }
        />
      ))}
      {note && <span className="ms-1.5 text-[12px] font-bold text-tang">{note}</span>}
    </div>
  );
}

/** The lemon strip under the card: what you've banked, and the gap. */
export function RunLine({ children, red }: { children: React.ReactNode; red?: boolean }) {
  return (
    <div
      className="mt-3 rounded-full px-3 py-2 text-center text-[14px] font-black"
      style={red
        ? { background: "rgba(255,77,121,.18)", color: "#FF4D79" }
        : { background: "rgba(255,216,77,.12)", color: "#FFD84D" }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const OUTCOME: Record<LogEntry["res"], { sym: string; cls: string; label: (p: number) => string }> = {
  ok:    { sym: "✓", cls: "bg-mint text-[#10322D]", label: (p) => (p === 2 ? "+2 🔥" : "+1") },
  buzz:  { sym: "✕", cls: "bg-chili text-white",    label: () => "ممنوع −1" },
  skip:  { sym: "↷", cls: "bg-white/15 text-muted", label: () => "تخطي −0.5" },
  steal: { sym: "⚡", cls: "bg-chili text-white",    label: () => "سرقة +1" },
  // Word is already "host +1" / "host −1"; no trailing label.
  host:  { sym: "★", cls: "bg-tang text-[#241638]", label: () => "" },
};

/**
 * What has happened this turn. The guessers see this live — it's what
 * keeps them in the game while they wait, and it never leaks the card
 * currently in play, only cards that have already left it.
 */
export function Feed({
  log, newestFirst, lang,
}: {
  log?: LogEntry[];
  newestFirst?: boolean;
  lang?: Lang;
}) {
  const safe = log ?? [];
  if (!safe.length) return null;
  const s = S(lang);
  const label = (res: LogEntry["res"], p: number) => {
    if (res === "ok") return p === 2 ? s.feedOk2 : s.feedOk;
    if (res === "buzz") return s.feedBuzz;
    if (res === "skip") return s.feedSkip;
    if (res === "steal") return s.feedSteal;
    return "";
  };
  const items = newestFirst ? [...safe].reverse() : safe;
  return (
    <div className="mt-3.5 flex flex-col gap-2">
      {items.map((e, i) => {
        const o = OUTCOME[e.res];
        return (
          <div key={`${e.w}-${i}`} className="flex items-center gap-3 rounded-[15px] bg-black/25 px-3.5 py-2.5 text-[14.5px]">
            <span className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-[12px] font-black ${o.cls}`}>
              {o.sym}
            </span>
            {e.w}
            <span className="ms-auto text-[12.5px] font-bold text-muted">{label(e.res, e.pts)}</span>
          </div>
        );
      })}
    </div>
  );
}
