/* THE SCRIPTS THAT HAVE TO STAY EXECUTABLE.
 *
 * This repository lives on the WSL filesystem and is worked on from both sides
 * of it. Linux keeps an executable bit on every file; Windows cannot see that
 * bit through the \\wsl.localhost share at all, so to Git for Windows every
 * executable script looks like it has lost it. That once showed all four of
 * these as permanently "modified", which trains everybody to ignore the list —
 * and ignoring the list is how someone runs `git add -A` from Windows and
 * commits them as ordinary files. The next checkout then refuses to run them,
 * and one of them is the mainnet upgrade.
 *
 * It has happened for real: commit 540f4ed exists to put the bit back on the
 * upgrade script after a rewrite from Windows took it away.
 *
 * The configuration now makes each side tell the truth. Windows Git is told to
 * ignore executable bits (`core.fileMode false`, globally, because it genuinely
 * cannot see them), and the repository no longer pins the setting, so Linux Git
 * falls back to its default and tracks them. What neither setting can stop is a
 * brand-new script committed without its bit, or one explicitly set back with
 * `--chmod=-x`. These tests catch both, before a push rather than at a prompt.
 *
 * READ FROM GIT'S INDEX, not from the disk. The index records each file's mode
 * explicitly, so this answers the same from Windows or Linux, and it checks
 * what would actually be committed and cloned rather than one machine's copy.
 */

import { expect } from "chai";
import { execFileSync } from "child_process";

/** The mode git records for every tracked file under scripts/. */
function indexedModes(): Map<string, string> | null {
  let out: string;
  try {
    out = execFileSync("git", ["ls-files", "--stage", "--", "scripts"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
  const modes = new Map<string, string>();
  for (const line of out.split("\n")) {
    // "100755 <sha> 0\tscripts/upgrade-mainnet.sh"
    const m = line.match(/^(\d{6}) [0-9a-f]+ \d+\t(.+)$/);
    if (m) modes.set(m[2], m[1]);
  }
  return modes;
}

const EXECUTABLE = "100755";

/** Run by path, and so needing the bit. Kept explicit so removing one from
 *  this list is a deliberate act in a diff, not a silent loss. */
const MUST_BE_EXECUTABLE = [
  "scripts/deploy-mainnet.sh",
  "scripts/local-usdc.ts",
  "scripts/mainnet-cutover.sh",
  "scripts/upgrade-mainnet.sh",
];

describe("scripts that are run by path", () => {
  let modes: Map<string, string> | null;

  before(function () {
    modes = indexedModes();
    /* Outside a git checkout there is no index to read. Skipped visibly
     * rather than passed silently, so it shows as pending in the output. */
    if (!modes || modes.size === 0) this.skip();
  });

  it("are committed as executable, the upgrade script above all", () => {
    for (const path of MUST_BE_EXECUTABLE) {
      expect(modes!.get(path), `${path} is not tracked`).to.not.equal(undefined);
      expect(modes!.get(path), `${path} lost its executable bit`).to.equal(EXECUTABLE);
    }
  });

  /* A new shell script is run by path by definition, and from Windows it would
   * be committed without the bit because Windows cannot see it. So every one
   * is checked, not only the ones that exist today. */
  it("includes every shell script, including ones added later", () => {
    const shell = [...modes!.keys()].filter((p) => p.endsWith(".sh"));
    expect(shell.length, "no shell scripts found under scripts/").to.be.above(0);
    for (const path of shell) {
      expect(
        modes!.get(path),
        `${path} is committed without its executable bit. Fix it with: ` +
          `git update-index --chmod=+x ${path}`,
      ).to.equal(EXECUTABLE);
    }
  });
});
