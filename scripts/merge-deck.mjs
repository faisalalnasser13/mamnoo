/**
 * One-shot: rebuild src/lib/deck.ts from taboo_1050.json + leftover old cards.
 *   node scripts/merge-deck.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const TASHKEEL = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
function normalizeAr(input) {
  return (input || "")
    .trim()
    .replace(TASHKEEL, "")
    .replace(/\u0640/g, "")
    .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627")
    .replace(/\u0629/g, "\u0647")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0624/g, "\u0648")
    .replace(/\u0626/g, "\u064A")
    .replace(/[\u200B-\u200F\u202A-\u202E]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}
const normalizeKey = (s) => normalizeAr(s).replace(/^ال/, "");

function playable(w, t) {
  if (t.length !== 5 || new Set(t).size !== 5) return false;
  for (const x of t) {
    if (w.includes(x) || x.includes(w)) return false;
    const nw = normalizeKey(w);
    const nx = normalizeKey(x);
    if (!nw || !nx) return false;
    if (nw.includes(nx) || nx.includes(nw)) return false;
  }
  return true;
}

const src = readFileSync(join(root, "src/lib/deck.ts"), "utf8");
const oldMatch = src.match(/export const DECK: Card\[\] = (\[[\s\S]*?\]);\n/);
if (!oldMatch) throw new Error("could not parse DECK");
const oldDeck = Function(`return ${oldMatch[1]}`)();
const roomMatch = src.match(/export const ROOM_WORDS: string\[\] = (\[[\s\S]*?\]);\s*$/m);
if (!roomMatch) throw new Error("could not parse ROOM_WORDS");
const roomWords = Function(`return ${roomMatch[1]}`)();

const json = JSON.parse(readFileSync(join(root, "taboo_1050.json"), "utf8"));
const before = oldDeck.length;

const byKey = new Map();
let droppedBad = 0;
let droppedDup = 0;
for (const c of json) {
  const w = String(c.word).trim();
  const t = c.banned.map((x) => String(x).trim());
  if (!playable(w, t)) { droppedBad++; continue; }
  const k = normalizeKey(w);
  if (byKey.has(k)) { droppedDup++; continue; }
  byKey.set(k, { w, t });
}
const fromJson = byKey.size;

let overlaps = 0;
let keptOld = 0;
let oldBad = 0;
for (const c of oldDeck) {
  const k = normalizeKey(c.w);
  if (byKey.has(k)) { overlaps++; continue; }
  if (!playable(c.w, c.t)) { oldBad++; continue; }
  byKey.set(k, { w: c.w, t: c.t });
  keptOld++;
}

const deck = [...byKey.values()];
const after = deck.length;

const lines = deck.map(
  (c) => `  { w: ${JSON.stringify(c.w)}, t: [${c.t.map((x) => JSON.stringify(x)).join(", ")}] },`,
);

const out = `/**
 * The deck. Two invariants hold for every card:
 *   1. exactly five distinct taboo words
 *   2. no taboo word is a substring of the answer (or vice versa)
 * test/sim/rules.mjs asserts both, so a bad card fails \`npm test\`,
 * not the party.
 *
 * Built from taboo_1050.json as the base; overlapping answers from the
 * original deck were dropped in favour of the JSON versions. Unplayable
 * JSON cards (taboo ⊆ answer under Arabic normalisation) were excluded.
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
console.log(JSON.stringify({
  before,
  jsonTotal: json.length,
  fromJson,
  droppedBad,
  droppedDup,
  overlapsRemoved: overlaps,
  keptOldUnique: keptOld,
  oldBad,
  after,
}, null, 2));
