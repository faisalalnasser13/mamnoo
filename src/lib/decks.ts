import type { Lang } from "./types";
import { DECK, ROOM_WORDS, type Card } from "./deck";
import { DECK_EN, ROOM_WORDS_EN } from "./deck.en";

/** The deck this room deals from. Indexes are only valid within one lang. */
export function deckFor(lang: Lang): Card[] {
  return lang === "en" ? DECK_EN : DECK;
}

export function roomWordsFor(lang: Lang): string[] {
  return lang === "en" ? ROOM_WORDS_EN : ROOM_WORDS;
}
