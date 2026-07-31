/**
 * Bundles the screens with Firebase stubbed out and renders them all.
 *   node test/ui/run.mjs
 */

import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, rmSync } from "node:fs";
import * as esbuild from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const outdir = join(here, "build");

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

/** Screens import Firebase transitively; none of it runs under SSR. */
const stub = {
  name: "stub-firebase",
  setup(build) {
    build.onResolve({ filter: /^firebase\// }, () => ({
      path: join(here, "stubs/firestore.ts"),
    }));
    build.onResolve({ filter: /(^|\/)firebase$/ }, (args) => {
      // Only our own lib/firebase, not the npm package.
      if (args.path.startsWith(".")) return { path: join(here, "stubs/firebase.ts") };
      return null;
    });
  },
};

await esbuild.build({
  entryPoints: [join(here, "entry.tsx")],
  bundle: true,
  outfile: join(outdir, "entry.cjs"),
  platform: "node",
  format: "cjs",
  jsx: "automatic",
  target: "node18",
  external: ["react", "react-dom", "react/jsx-runtime"],
  absWorkingDir: root,
  logLevel: "warning",
  plugins: [stub],
});

const require = createRequire(import.meta.url);
const { run } = require(join(outdir, "entry.cjs"));

const results = run();
const failed = results.filter((r) => r.error);

if (failed.length) {
  console.error(`\n✗ ${failed.length} of ${results.length} screens threw while rendering\n`);
  const seen = new Set();
  for (const f of failed) {
    const key = f.error;
    if (seen.has(key)) continue;
    seen.add(key);
    console.error(`  · ${f.error}`);
    console.error(`    first seen in: ${f.name}`);
    const others = failed.filter((x) => x.error === key).length;
    if (others > 1) console.error(`    (and ${others - 1} more screens)`);
  }
  process.exit(1);
}

console.log(`✓ ui: ${results.length} screen renders, no throws`);
