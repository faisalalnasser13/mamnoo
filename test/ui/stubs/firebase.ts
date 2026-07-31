// Stand-in for src/lib/firebase.ts under the render smoke test.
// Effects never run in renderToString, so none of this is called —
// it only has to satisfy the imports.
export const db = {} as never;
export const auth = { currentUser: null } as never;
export const app = {} as never;
export const ensureAuth = async () => ({ uid: "u1" });
export const api = new Proxy({}, { get: () => async () => ({ ok: true }) }) as never;
export const errText = (_e: unknown) => "خطأ";
export class GameError extends Error {}
