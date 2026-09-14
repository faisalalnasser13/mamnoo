import React, { useEffect, useState } from "react";
import type { Kit, LogEntry, Lang, TeamId } from "../lib/types";
import { HEAT_EVERY } from "../lib/rules";
import { tabooFor } from "../lib/decks";
import { S } from "../lib/strings";
import { Tally } from "./ui";

/* ------------------------------------------------------------------ */

/**
 * Step the word down instead of letting it wrap to three lines. The
 * English deck has entries twice the length of a typical Arabic one.
 */
function wordSize(word: string, small?: boolean, mini?: boolean): number {
  const n = word.length;
  if (mini) return n > 18 ? 18 : n > 12 ? 20 : 22;
  if (small) return n > 18 ? 22 : n > 12 ? 25 : 28;
  return n > 18 ? 29 : n > 12 ? 35 : 42;
}

/**
 * The card. Everything else on screen is quiet so this can be loud.
 * `small` is the judge's variant — they need to read it, not perform it.
 */
export function Card({
  word, taboo, kicker, buzzed, small, stamp, mini,
}: {
  word: string;
  taboo: string[];
  kicker?: string;
  buzzed?: boolean;
  small?: boolean;
  stamp?: string;
  /** Flat embed — recap peek. No tilt, no deal-in. */
  mini?: boolean;
}) {
  const compact = Boolean(small || mini);
  return (
    <div
      className={`card ${buzzed ? "card-buzzed" : ""} ${mini ? "card-mini" : ""}`}
      style={small && !mini ? { padding: "18px 16px 16px" } : undefined}
    >
      {kicker && (
        <span
          className="inline-block rounded-full px-3 py-1 text-[10px] font-black tracking-[.2em]"
          style={{
            background: buzzed ? "#E1584F" : "var(--kicker)",
            color: buzzed ? "#fff" : "var(--plate-ink)",
          }}
        >
          {kicker}
        </span>
      )}
      <div
        className="card-word"
        style={{ fontSize: wordSize(word, compact, mini), margin: compact ? "6px 0 11px" : "9px 0 13px" }}
      >
        {word}
      </div>
      <div className="card-rule mb-3" />
      <div className="rail">
        {taboo.map((t) => (
          <b key={t} style={{ fontSize: mini ? 13.5 : compact ? 16 : 17.5 }}>{t}</b>
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
 * Urgency steps: calm accent → soft orange at 15s → red at 10s.
 * The digits stay one size and never fade — growing them and blinking
 * opacity at the 15s step left a composited 0:16 under the orange clock.
 * The bar width snaps (no CSS transition); a lagged strip used to read
 * as a second timer trailing the real one. Blink lives on the bar and
 * the screen wash, not on the number.
 */
export function Hud({
  remaining, pct, warn, rush, scores, right, loud, kit,
}: {
  remaining: number | null;
  pct: number;
  warn?: boolean;
  rush?: boolean;
  scores?: Record<TeamId, number>;
  right?: React.ReactNode;
  /** Spectator size — the tick is the event when there's no card. */
  loud?: boolean;
  kit?: Kit;
}) {
  const secs = Math.ceil((remaining ?? 0) / 1000);
  const text = remaining == null ? "—" : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const bar =
    rush ? "bg-minus bar-rush"
    : warn ? "bg-tang bar-warn"
    : "bg-lemon";
  const color = rush ? "#E1584F" : warn ? "#FF9A3C" : "var(--lemon)";
  return (
    <div>
      <div className="h-[9px] overflow-hidden rounded-full bg-black/30">
        <div
          className={`h-full rounded-full ${bar}`}
          style={{ width: `${Math.round(pct * 100)}%` }}
        />
      </div>
      <div className="mt-2.5 flex items-center justify-between">
        <span className="clock" style={{ color }}>
          {text}
        </span>
        {right ?? (scores && <Tally scores={scores} loud={loud} kit={kit ?? "classic"} />)}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Heat — option I.
 *
 * Three fuse slots, always, with ×2 beside them from streak 0. Empty is
 * a circle; lit is 🔥 the same size, extras after ×2 included. The
 * emoji licks (stretch + sway from the base). Fire is the streak, not
 * the team.
 */
export function Heat({ streak }: { streak: number }) {
  const lit = Math.min(HEAT_EVERY, Math.max(0, streak));
  const extra = Math.max(0, streak - HEAT_EVERY);
  const hot = streak >= HEAT_EVERY;
  const flame = (key: string, delay: number) => (
    <i key={key} className="heat-flame">
      <span style={{ animationDelay: `${delay}s` }}>🔥</span>
    </i>
  );
  return (
    <div className="heat" aria-hidden>
      {Array.from({ length: HEAT_EVERY }, (_, i) =>
        i < lit ? flame(String(i), i * 0.11) : <i key={i} className="heat-ash" />,
      )}
      <span className={`heat-x2 ${hot ? "heat-x2-on" : ""}`}>×2</span>
      {Array.from({ length: extra }, (_, i) => flame(`e${i}`, (HEAT_EVERY + i) * 0.11))}
    </div>
  );
}

/** Banked this turn, under the card. Sign is the colour — no gap copy. */
export function RunLine({ children, tone }: { children: React.ReactNode; tone: "plus" | "minus" }) {
  const minus = tone === "minus";
  return (
    <div
      className="mt-3 rounded-full px-3 py-2 text-center text-[14px] font-black"
      style={minus
        ? { background: "rgba(225,88,79,.18)", color: "#E1584F" }
        : { background: "rgba(76,190,123,.16)", color: "#4CBE7B" }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const OUTCOME: Record<LogEntry["res"], { sym: string; cls: string; label: (p: number) => string }> = {
  ok:    { sym: "✓", cls: "bg-plus text-[#10322D]", label: (p) => (p === 2 ? "+2 🔥" : "+1") },
  buzz:  { sym: "✕", cls: "bg-minus text-white",    label: () => "ممنوع −1" },
  skip:  { sym: "↷", cls: "bg-white/15 text-muted", label: () => "تخطي −0.5" },
  steal: { sym: "⚡", cls: "chip-plate", label: () => "سرقة +1" },
  // Word is already "host +1" / "host −1"; no trailing label.
  host:  { sym: "★", cls: "chip-plate", label: () => "" },
  left:  { sym: "○", cls: "bg-white/15 text-muted", label: () => "باقي" },
};

/**
 * What has happened this turn. The guessers see this live — it's what
 * keeps them in the game while they wait, and it never leaks the card
 * currently in play, only cards that have already left it.
 *
 * `peek` lets a tap open a spent card's taboo list — recap, and the
 * idle side during live. Guessers' live feed stays inert.
 */
export function Feed({
  log, newestFirst, lang, peek,
}: {
  log?: LogEntry[];
  newestFirst?: boolean;
  lang?: Lang;
  peek?: boolean;
}) {
  const safe = log ?? [];
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => { setOpen(null); }, [safe.length]);
  if (!safe.length) return null;
  const s = S(lang);
  const label = (res: LogEntry["res"], p: number) => {
    if (res === "ok") return p === 2 ? s.feedOk2 : s.feedOk;
    if (res === "buzz") return s.feedBuzz;
    if (res === "skip") return s.feedSkip;
    if (res === "steal") return s.feedSteal;
    if (res === "left") return s.feedLeft;
    return "";
  };
  const items = newestFirst ? [...safe].reverse() : safe;
  return (
    <div className="mt-3.5 flex flex-col gap-2">
      {items.map((e, i) => {
        const o = OUTCOME[e.res];
        const taboo = peek && lang && (e.res === "ok" || e.res === "skip" || e.res === "buzz" || e.res === "steal" || e.res === "left")
          ? tabooFor(lang, e.w)
          : null;
        const opened = open === i && !!taboo;
        const row = (
          <div className="flex items-center gap-3 px-3.5 py-2.5 text-[14.5px]">
            <span className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-[12px] font-black ${o.cls}`}>
              {o.sym}
            </span>
            {e.w}
            <span className="ms-auto text-[12.5px] font-bold text-muted">{label(e.res, e.pts)}</span>
          </div>
        );
        if (taboo) {
          return (
            <button
              key={`${e.w}-${i}`}
              type="button"
              aria-expanded={opened}
              className="w-full rounded-[15px] bg-black/25 text-start"
              style={{ border: 0, color: "inherit", font: "inherit" }}
              onClick={() => setOpen(opened ? null : i)}
            >
              {row}
              {opened && (
                <div className="px-3 pb-3">
                  <Card word={e.w} taboo={taboo} mini />
                </div>
              )}
            </button>
          );
        }
        return (
          <div key={`${e.w}-${i}`} className="rounded-[15px] bg-black/25">
            {row}
          </div>
        );
      })}
    </div>
  );
}
