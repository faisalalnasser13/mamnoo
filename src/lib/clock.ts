/**
 * Shared game clock.
 *
 * Deadlines are stored as absolute millis (`phaseEndsAt`). Every phone
 * then counts `phaseEndsAt - now()`. If `now()` is the device's wall
 * clock, two phones whose clocks disagree by 3s show 3s apart — which
 * is common on a table of mixed iOS/Android. `offsetMs` is the
 * Firestore-server correction from `syncClock()` in firebase.ts, so
 * `now()` is the same instant on every device.
 *
 * No Firebase import: the simulator bundles this through engine.ts and
 * patches `Date.now`. Offset stays 0 there.
 */
let offsetMs = 0;

export function now(): number {
  return Date.now() + offsetMs;
}

export function setClockOffset(ms: number): void {
  offsetMs = ms;
}
