/**
 * The backdrop.
 *
 * This replaced a scattered "wall of words" — real Arabic words, some
 * struck through — which was thematically neat and, in practice,
 * competing for attention with the card. On a phone, anything legible
 * behind the content is something the eye keeps trying to read.
 *
 * What's left is the same idea reduced to a texture: a soft warm bloom
 * at the top for depth, and a very faint grid of dots that reads as
 * paper rather than as content. Nothing here is legible, so nothing
 * here can distract.
 */
export function Backdrop() {
  return <div className="backdrop" aria-hidden />;
}
