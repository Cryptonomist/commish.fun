/* Which binary is the suite about to test?
 *
 * `addProgramFromFile` loads whatever `target/deploy/commish.so` happens to be,
 * and that is whatever was built last. Build with `--features devnet` for a
 * local validator, forget, and every test that creates a pool dies with
 * WrongMint under a screenful of program logs — twenty failures, none of which
 * mentions a build flag. That is an hour spent looking in the wrong place.
 *
 * THE SUITE IS NOT WRONG TO REFUSE, and that is worth being clear about: it
 * only ever passes against the binary that would actually ship, which is the
 * property you want. What it lacked was a diagnosis. This says it in one line
 * before anything else runs.
 *
 * IT ALSO RULES OUT FASTCLOCK, which is the more dangerous build to test
 * against: that one drops the posting floor from three hours to sixty seconds,
 * while the boundary tests in workspace.ts assert the three-hour one. It cannot
 * reach here, because `fastclock` refuses to compile without `devnet` (the
 * compile_error in constants.rs) and `devnet` is what this rejects.
 *
 * The features come from cargo's own fingerprint rather than from the bytes.
 * Scanning the .so was the obvious idea and it does not work: `pubkey!` leaves
 * no contiguous 32-byte literal to find, so neither mint appears in the file
 * at all.
 */

import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const SO = path.resolve(ROOT, "target/deploy/commish.so");

/** Cargo writes one fingerprint per feature combination. The newest is the one
 *  that produced the current .so. Both SBF target directory spellings are
 *  checked, because the toolchain renamed it. */
function featuresOfLastBuild(): string[] | null {
  const roots = ["sbpf-solana-solana", "sbf-solana-solana"].map((t) =>
    path.resolve(ROOT, "target", t, "release/.fingerprint"),
  );

  let newest: { at: number; features: string[] } | null = null;
  for (const dir of roots) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      if (!entry.startsWith("commish-")) continue;
      const file = path.join(dir, entry, "lib-commish.json");
      if (!fs.existsSync(file)) continue;
      try {
        const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
          features?: string;
        };
        const features = JSON.parse(raw.features ?? "[]") as string[];
        const at = fs.statSync(file).mtimeMs;
        if (!newest || at > newest.at) newest = { at, features };
      } catch {
        /* A fingerprint we cannot parse tells us nothing; keep looking. */
      }
    }
  }
  return newest?.features ?? null;
}

before(function () {
  if (!fs.existsSync(SO)) {
    throw new Error(
      `No program at ${SO}.\nThe suite runs against a built binary. Run:  anchor build`,
    );
  }

  const features = featuresOfLastBuild();
  if (!features) {
    // Not fatal. The suite is still safe — it simply fails loudly and
    // unhelpfully instead of quickly and helpfully.
    console.log(
      "  build-guard: could not read cargo's fingerprint; testing whatever is in target/deploy",
    );
    return;
  }

  const named = features.filter((f) => f !== "default");
  if (features.includes("devnet") || features.includes("fastclock")) {
    throw new Error(
      [
        "",
        `  This suite is pointed at a build with: ${named.join(", ")}`,
        "",
        "  Those are local-validator builds. `devnet` pins the devnet USDC mint,",
        "  which every test here would fail against, and `fastclock` shortens the",
        "  posting floor from three hours to sixty seconds — which is exactly what",
        "  the boundary tests in workspace.ts exist to check.",
        "",
        "  These tests validate the binary that would actually ship. Build it:",
        "",
        "      anchor build",
        "      npx ts-mocha -p ./tsconfig.json -t 1000000 'tests/**/*.ts'",
        "",
        "  Then put the local one back when you are done:",
        "",
        "      anchor build -- --features devnet,fastclock",
        "      anchor deploy --provider.cluster localnet",
        "",
      ].join("\n"),
    );
  }

  console.log(
    `  build-guard: testing a production build${named.length ? ` (${named.join(", ")})` : " (no features)"}`,
  );
});
