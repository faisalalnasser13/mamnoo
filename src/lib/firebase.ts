import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged, User } from "firebase/auth";
import {
  getFirestore, connectFirestoreEmulator, doc, setDoc, getDocFromServer,
  serverTimestamp, Timestamp,
} from "firebase/firestore";
import { setClockOffset } from "./clock";

const config = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_MSG_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
};

export const app = initializeApp(config);
export const auth = getAuth(app);
export const db = getFirestore(app);

// `npm run dev` with the emulators running picks them up automatically.
if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATOR === "1") {
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

/** Resolves once we have an anonymous session. Persists across reloads. */
export function ensureAuth(): Promise<User> {
  return new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(
      auth,
      (u) => {
        if (u) { stop(); resolve(u); }
        else signInAnonymously(auth).catch(reject);
      },
      reject,
    );
  });
}

/**
 * Measure how far this phone's wall clock is from Firestore server time
 * and stash that as the game-clock offset.
 *
 * Writes `serverTimestamp()`, reads it back from the server (not the
 * cache), and treats the midpoint of the round-trip as "when the server
 * stamped". Typical error is tens of milliseconds — phones that were
 * 3–4s apart then agree on `phaseEndsAt`.
 *
 * One write per call, on a per-uid doc, never the room. Failures leave
 * the previous offset in place.
 */
export async function syncClock(): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const ref = doc(db, "clock", uid);
  const sent = Date.now();
  await setDoc(ref, { t: serverTimestamp() });
  const snap = await getDocFromServer(ref);
  const recv = Date.now();
  const t = snap.data()?.t;
  if (!(t instanceof Timestamp)) return;
  setClockOffset(t.toMillis() - (sent + recv) / 2);
}

/** Re-sync when the tab wakes (NTP may have jumped) and every 5 minutes. */
export function watchClockSync(): () => void {
  const onVis = () => {
    if (document.visibilityState === "visible") void syncClock().catch(() => {});
  };
  document.addEventListener("visibilitychange", onVis);
  const id = window.setInterval(() => { void syncClock().catch(() => {}); }, 5 * 60_000);
  return () => {
    document.removeEventListener("visibilitychange", onVis);
    window.clearInterval(id);
  };
}

// The engine runs in the browser — see engine.ts. Re-exported here so
// every screen imports `api` from one place.
export { api, errText, GameError } from "./engine";
