/* Rewrite the three pages that say results are posted by the commissioner
 * alone, for the deploy that makes that untrue.
 *
 *   node scripts/oracle-copy.mjs
 *
 * RUN THIS IN THE SAME COMMIT THAT DEPLOYS THE WORKER, and not before. The
 * site's rule, learned the hard way on the fee copy, is that it describes what
 * the chain and the operator actually do in the present tense. Until the
 * results oracle is named on mainnet and the worker is running, "the
 * commissioner alone posts results" is true and this script would make the
 * site lie in the other direction.
 *
 * Every replacement is anchored on the exact sentence it replaces, and the
 * script refuses if an anchor has moved. Same shape as mainnet-copy.mjs.
 */

import fs from "node:fs";

let changed = 0;

function edit(file, pairs) {
  let s = fs.readFileSync(file, "utf8");
  for (const [from, to] of pairs) {
    if (!s.includes(from)) {
      console.error(`${file}: anchor not found:\n  ${from.slice(0, 100)}`);
      process.exit(1);
    }
    s = s.replace(from, to);
    changed++;
  }
  fs.writeFileSync(file, s);
}

/** Replace a whole <p>…</p> that begins with `prefix`. */
function paragraph(file, prefix, replacement) {
  const s = fs.readFileSync(file, "utf8");
  const start = s.indexOf(prefix);
  if (start < 0) {
    console.error(`${file}: paragraph not found:\n  ${prefix.slice(0, 100)}`);
    process.exit(1);
  }
  const end = s.indexOf("</p>", start);
  fs.writeFileSync(file, s.slice(0, start) + replacement + s.slice(end + 4));
  changed++;
}

// ------------------------------------------------------------------ terms
const TERMS = "src/app/terms/page.tsx";
edit(TERMS, [
  [
    `<li>{"posts the week's results, or in a league posts the payout sheet."}</li>`,
    `<li>{"can post the week's results, which the automated poster described below usually does for them, or in a league posts the payout sheet. No software posts a payout sheet."}</li>`,
  ],
]);
paragraph(
  TERMS,
  `<p><strong>{"The commissioner alone posts results."}</strong>`,
  `<p><strong>{"Results are usually posted automatically, and the commissioner can always post them by hand."}</strong>{" We operate an automated poster. After a week's last game it reads two independent public scoreboards and posts the week only when both report every game as final and both name the same winner in every game. If they disagree, if either is unavailable, or if a game is postponed or otherwise unsettled, it posts nothing and the commissioner posts instead. Whichever way a week is posted, it goes through the same dispute window and the same member veto described below; nothing about the window or the veto changes. The scoreboards are provided by third parties, may be wrong, late or unavailable, and we do not guarantee them. A wrong result that both scoreboards agreed on is corrected the same way as a wrong result a commissioner typed: by the veto, and only by the veto. The automated poster cannot move funds, cannot change a pool and cannot finalize anything. It can only propose a week's results, and once a posting is struck down it does not propose that week again; from then on the commissioner posts it."}</p>`,
);

// ------------------------------------------------------------------- risk
const RISK = "src/app/risk/page.tsx";
edit(RISK, [
  [
    `<h2>{"The commissioner posts results, and can post them wrong"}</h2>`,
    `<h2>{"Results are posted by software or by the commissioner, and either can be wrong"}</h2>`,
  ],
  [
    `<p>{"Commish does not automatically determine outcomes. Your commissioner posts results and, in a league dues pool, posts the payout sheet that decides who can claim which prize slot."}</p>`,
    `<p>{"Commish posts a week's results automatically when two independent public scoreboards agree on every game, and otherwise leaves the week for the commissioner to post. Two scoreboards can be wrong in the same direction, and a commissioner can be wrong on their own. In a league dues pool the commissioner posts the payout sheet that decides who can claim which prize slot, and no software decides that for them."}</p>`,
  ],
  [
    `<p>{"If your commissioner posts a wrong result, the veto is the only remedy the software gives you.`,
    `<p>{"If a wrong result is posted, by the software or by your commissioner, the veto is the only remedy the software gives you.`,
  ],
]);

// -------------------------------------------------------------------- how
const HOW = "src/app/how/page.tsx";
edit(HOW, [
  [
    `<p>{"Picks lock at the first kickoff of the week. Games are played. The commissioner posts the results, and members get a window to vote down a result they believe is wrong.`,
    `<p>{"Picks lock at the first kickoff of the week. Games are played. The results are posted, usually automatically once two independent scoreboards agree on every game, and otherwise by the commissioner. Members then get a window to vote down a result they believe is wrong.`,
  ],
  [
    `<p>{"The dispute window exists because a commissioner posts the results by hand. It is the members' check on that, and it is enforced by the program rather than by anybody's good manners."}</p>`,
    `<p>{"The dispute window exists because results are posted by scoreboards and by people, and both can be wrong. It is the members' check on whatever was posted, and it is enforced by the program rather than by anybody's good manners."}</p>`,
  ],
]);

// --------------------------------------------------------------- the check
for (const [file, stale] of [
  [TERMS, "The commissioner alone posts results"],
  [RISK, "does not automatically determine outcomes"],
  [HOW, "commissioner posts the results by hand"],
]) {
  if (fs.readFileSync(file, "utf8").includes(stale)) {
    console.error(`${file} still says "${stale}"`);
    process.exit(1);
  }
}
console.log(`${changed} passages rewritten; no page still says the commissioner posts alone`);
