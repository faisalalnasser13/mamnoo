/**
 * Rebuild decks from JSON sources.
 *   node scripts/build-deck.mjs
 *
 * Arabic: taboo_deck.json → src/lib/deck.ts
 * English: taboo_deck_680_us.json → src/lib/deck.en.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function linesOf(deck) {
  return deck.map(
    (c) => `  { w: ${JSON.stringify(c.w)}, t: [${c.t.map((x) => JSON.stringify(x)).join(", ")}] },`,
  );
}

/* ---- Arabic ---- */
{
  const json = JSON.parse(readFileSync(join(root, "taboo_deck.json"), "utf8"));
  const deck = json.map((c) => ({
    w: String(c.word).trim(),
    t: (c.banned || []).map((x) => String(x).trim()),
  }));

  const roomSrc = readFileSync(join(root, "src/lib/deck.ts"), "utf8");
  const roomMatch = roomSrc.match(/export const ROOM_WORDS: string\[\] = (\[[\s\S]*?\]);\s*$/m);
  if (!roomMatch) throw new Error("could not find ROOM_WORDS in deck.ts");
  const roomWords = Function(`return ${roomMatch[1]}`)();

  const out = `/**
 * The deck. Built straight from taboo_deck.json — every card kept.
 * Each card has five taboo words (asserted in test/sim/rules.mjs).
 */
export interface Card { w: string; t: string[] }

export const DECK: Card[] = [
${linesOf(deck).join("\n")}
];

/** Rooms are named, not coded — a real word survives being said out loud on a call. */
export const ROOM_WORDS: string[] = [
  ${roomWords.map((w) => JSON.stringify(w)).join(", ")},
];
`;
  writeFileSync(join(root, "src/lib/deck.ts"), out);
  console.log("ar", JSON.stringify({ total: json.length, kept: deck.length }));
}

/* ---- English ---- */
{
  const json = JSON.parse(readFileSync(join(root, "taboo_deck_680_us.json"), "utf8"));
  const cards = json.cards || json;
  const deck = cards.map((c) => ({
    w: String(c.word).trim(),
    t: (c.taboo || c.banned || []).map((x) => String(x).trim()),
  }));

  // Sayable room names: short single words, lowercased so they survive a call.
  const roomWords = [];
  const seen = new Set();
  for (const c of deck) {
    const w = c.w.toLowerCase();
    if (w.includes(" ") || w.length > 10 || seen.has(w)) continue;
    seen.add(w);
    roomWords.push(w);
    if (roomWords.length >= 50) break;
  }

  const out = `import type { Card } from "./deck";

/**
 * English deck. Built straight from taboo_deck_680_us.json — every card kept.
 */
export const DECK_EN: Card[] = [
${linesOf(deck).join("\n")}
];

/** Rooms are named, not coded — a real word survives being said out loud on a call. */
export const ROOM_WORDS_EN: string[] = [
  ${roomWords.map((w) => JSON.stringify(w)).join(", ")},
];
`;
  writeFileSync(join(root, "src/lib/deck.en.ts"), out);
  console.log("en", JSON.stringify({ total: cards.length, kept: deck.length, rooms: roomWords.length }));
}
