/**
 * Rebuild src/lib/deck.ts from taboo_deck.json — every card kept as-is.
 *   node scripts/build-deck.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const json = JSON.parse(readFileSync(join(root, "taboo_deck.json"), "utf8"));
const deck = json.map((c) => ({
  w: String(c.word).trim(),
  t: (c.banned || []).map((x) => String(x).trim()),
}));

const roomSrc = readFileSync(join(root, "src/lib/deck.ts"), "utf8");
const roomMatch = roomSrc.match(/export const ROOM_WORDS: string\[\] = (\[[\s\S]*?\]);\s*$/m);
if (!roomMatch) throw new Error("could not find ROOM_WORDS in deck.ts");
const roomWords = Function(`return ${roomMatch[1]}`)();

const lines = deck.map(
  (c) => `  { w: ${JSON.stringify(c.w)}, t: [${c.t.map((x) => JSON.stringify(x)).join(", ")}] },`,
);

const out = `/**
 * The deck. Built straight from taboo_deck.json — every card kept.
 * Each card has five taboo words (asserted in test/sim/rules.mjs).
 */
export interface Card { w: string; t: string[] }

export const DECK: Card[] = [
${lines.join("\n")}
];

/** Rooms are named, not coded — a real word survives being said out loud on a call. */
export const ROOM_WORDS: string[] = [
  ${roomWords.map((w) => JSON.stringify(w)).join(", ")},
];
`;

writeFileSync(join(root, "src/lib/deck.ts"), out);
console.log(JSON.stringify({ total: json.length, kept: deck.length }, null, 2));
