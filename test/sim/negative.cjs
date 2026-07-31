// Negative control: prove the stub really rejects a read after a write
// inside a transaction. If this ever passes silently, every "reads
// before writes" guarantee in the sim is worthless.
const fs = require("./stubs/firestore.cjs");
const db = fs.getFirestore();
fs.__setUser("u1");
(async () => {
  let threw = false;
  try {
    await fs.runTransaction(db, async (tx) => {
      tx.set(fs.doc(db, "rooms", "r1"), { a: 1 });
      await tx.get(fs.doc(db, "rooms", "r2"));   // illegal
    });
  } catch (e) { threw = true; }
  if (!threw) { console.error("✗ the read-after-write detector did NOT fire"); process.exit(1); }
  console.log("✓ negative control: read-after-write is detected");
})();
