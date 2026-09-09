#!/usr/bin/env bash
#
# Upgrade the program that is already on mainnet, in place, and prove it.
#
# `deploy-mainnet.sh` was the first deploy. This is every deploy after it: the
# same address, the same pools, new code. It refuses more than it does, for
# the same reason that one does — every check below is something that, skipped,
# either strands the program at a size it cannot grow into, ships a binary
# built with the wrong features against real money, or leaves nobody sure that
# what is on the chain is what is in the repository.
#
#   ./scripts/upgrade-mainnet.sh          dry run: check everything, upgrade nothing
#   ./scripts/upgrade-mainnet.sh --go     upgrade
#
# Needs: the upgrade authority as the CLI's default key, and MAINNET_RPC set
# to an RPC that will accept a 440KB buffer. The public one dropped the first
# deploy with -32002 halfway through; a Helius URL did not.
#
set -euo pipefail

RPC="${MAINNET_RPC:-https://api.mainnet-beta.solana.com}"
GO="${1:-}"
BIN="target/deploy/commish.so"
KEYPAIR="target/deploy/commish-keypair.json"

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32mok\033[0m   %s\n' "$*"; }
bad()  { printf '  \033[31mNO\033[0m   %s\n' "$*"; exit 1; }
warn() { printf '  \033[33m!\033[0m    %s\n' "$*"; }

say "1. The binary is the one that ships"

[ -f "$BIN" ] || bad "No $BIN. Run: anchor build"

# THE FEATURE GUARD, read from cargo's own fingerprint, newest wins, both
# spellings of the SBF target directory. It has to say exactly [default]: a
# devnet build pins the wrong mint, a fastclock build drops the posting floor
# to sixty seconds, and either against real money is a different catastrophe.
FEATURES=$(node -e '
  const fs = require("fs"), path = require("path");
  let best = null;
  for (const t of ["sbpf-solana-solana", "sbf-solana-solana"]) {
    const dir = path.resolve("target", t, "release/.fingerprint");
    if (!fs.existsSync(dir)) continue;
    for (const e of fs.readdirSync(dir)) {
      if (!e.startsWith("commish-")) continue;
      const f = path.join(dir, e, "lib-commish.json");
      if (!fs.existsSync(f)) continue;
      try {
        const raw = JSON.parse(fs.readFileSync(f, "utf8"));
        const at = fs.statSync(f).mtimeMs;
        if (!best || at > best.at) best = { at, features: JSON.parse(raw.features ?? "[]") };
      } catch {}
    }
  }
  if (!best) process.exit(3);
  process.stdout.write(best.features.join(","));
') || bad "cannot read cargo's fingerprint for commish. Run: anchor build"
[ "$FEATURES" = "default" ] \
  || bad "built with features [$FEATURES]; mainnet ships [default] and nothing else. Run: anchor build"
ok "cargo's own fingerprint says features = [default]"

STALE=$(find programs -name '*.rs' -newer "$BIN" -print -quit 2>/dev/null || true)
[ -z "$STALE" ] || bad "$STALE is newer than $BIN. Run: anchor build"
ok "binary is newer than every file in programs/"

awk '/#\[cfg\(not\(feature = "devnet"\)\)\]/ { getline
       if ($0 ~ /EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/) found = 1 }
     END { exit !found }' programs/commish/src/constants.rs \
  || bad "mainnet USDC is not the mint behind cfg(not(feature = \"devnet\"))"
ok "mainnet USDC is what a default build pins"

SIZE=$(stat -c%s "$BIN")
LOCAL_SHA=$(sha256sum "$BIN" | awk '{print $1}')
ok "binary $SIZE bytes, sha256 $LOCAL_SHA"

say "2. The tests pass against THIS binary"

if [ "$GO" = "--go" ]; then
  npx ts-mocha -p ./tsconfig.json -t 1000000 "tests/**/*.ts" >/tmp/upgrade-tests.log 2>&1 \
    || { tail -30 /tmp/upgrade-tests.log; bad "the suite failed; see /tmp/upgrade-tests.log"; }
  ok "$(grep -o '[0-9]* passing' /tmp/upgrade-tests.log | head -1) against the production binary"
else
  warn "skipped in dry run (--go runs them)"
fi

say "3. What is on the chain now"

PROGRAM_ID=$(solana address -k "$KEYPAIR")
DECLARED=$(grep -o 'declare_id!("[^"]*")' programs/commish/src/lib.rs | sed 's/.*("//; s/")$//')
[ "$PROGRAM_ID" = "$DECLARED" ] || bad "keypair $PROGRAM_ID != declare_id! $DECLARED"
ok "program id $PROGRAM_ID matches declare_id!"

SHOW=$(solana program show "$PROGRAM_ID" --url "$RPC" 2>&1) \
  || bad "$PROGRAM_ID is not on mainnet. This script upgrades; deploy-mainnet.sh deploys."
DATALEN=$(printf '%s' "$SHOW" | awk '/Data Length/{print $3}')
AUTHORITY=$(printf '%s' "$SHOW" | awk '/Authority/{print $2}')
[ -n "$DATALEN" ] || bad "could not read the deployed data length"
ok "deployed data length $DATALEN, authority $AUTHORITY"

# THE ONE CHECK THE FIRST DEPLOY LEFT US NEEDING. It went out with --max-len
# equal to the binary, so the ProgramData account has no room to grow, and a
# larger binary is refused by the loader with an error that does not say so.
# Extending costs rent on the extra bytes and needs the same authority.
if [ "$SIZE" -gt "$DATALEN" ]; then
  EXTRA=$(( SIZE - DATALEN ))
  bad "the new binary is $EXTRA bytes larger than the ProgramData account. First run:
       solana program extend $PROGRAM_ID $(( EXTRA + 65536 )) --url $RPC
       (the 64KB on top is so the next upgrade does not land here again)"
fi
ok "new binary fits: $SIZE <= $DATALEN"

PAYER=$(solana address)
[ "$PAYER" = "$AUTHORITY" ] \
  || bad "the CLI key $PAYER is not the upgrade authority $AUTHORITY"
ok "CLI key is the upgrade authority"

say "4. Funds"

# An upgrade writes the whole program into a buffer account first, which has
# to be rent-exempt for its size until the upgrade closes it and returns the
# lamports. So the wallet needs the buffer's rent plus fees for a moment, and
# gets nearly all of it back.
NEED=$(solana rent "$SIZE" --url "$RPC" 2>/dev/null | awk '/Rent-exempt minimum/{print $3}')
BALANCE=$(solana balance --url "$RPC" | awk '{print $1}')
[ -n "$NEED" ] || bad "could not ask the cluster what a $SIZE byte buffer costs"
if awk "BEGIN{exit !($BALANCE < $NEED + 0.05)}"; then
  bad "wallet has $BALANCE SOL; the buffer needs $NEED SOL plus fees while the upgrade runs. Nearly all of it comes back."
fi
ok "wallet $BALANCE SOL covers the $NEED SOL buffer (returned after the upgrade)"

case "$RPC" in
  *api.mainnet-beta.solana.com*)
    warn "RPC is the public endpoint. It dropped the first deploy mid-buffer with -32002; set MAINNET_RPC to a Helius URL." ;;
esac

say "5. Upgrade"

if [ "$GO" != "--go" ]; then
  warn "dry run. Re-run with --go to upgrade."
  exit 0
fi

solana program deploy "$BIN" \
  --program-id "$KEYPAIR" \
  --url "$RPC" \
  --commitment finalized \
  || bad "the upgrade did not complete. If a buffer was left behind: solana program show --buffers, then close it or resume with --buffer."
ok "upgrade transaction finalized"

say "6. Prove the chain holds this binary"

# The loader stores the program bytes after a header; `program dump` strips
# it and pads to the data length. The sizes are compared first because a
# padded dump of a smaller program would still hash differently and say
# nothing useful.
AFTER=$(solana program show "$PROGRAM_ID" --url "$RPC" 2>&1)
NEWLEN=$(printf '%s' "$AFTER" | awk '/Data Length/{print $3}')
SLOT=$(printf '%s' "$AFTER" | awk '/Last Deployed In Slot/{print $5}')
ok "deployed in slot $SLOT, data length $NEWLEN"

solana program dump "$PROGRAM_ID" /tmp/onchain-commish.so --url "$RPC" >/dev/null
CHAIN_SHA=$(head -c "$SIZE" /tmp/onchain-commish.so | sha256sum | awk '{print $1}')
[ "$CHAIN_SHA" = "$LOCAL_SHA" ] \
  || bad "the chain holds $CHAIN_SHA and the repository built $LOCAL_SHA. Do not proceed until you know why."
ok "sha256 of the on-chain program equals the local build: $LOCAL_SHA"

say "7. Vendor the IDL"
cp target/idl/commish.json src/idl/commish.json
ok "src/idl/commish.json from target/idl/commish.json"

say "8. Name the oracle, then deploy the worker"
cat <<NEXT
  The program now has a second door for results. Nothing walks through it
  until the admin names a key. In this order:

  a. A key for the worker and nothing else. NOT the admin, NOT this wallet:
       solana-keygen new --no-bip39-passphrase -o target/deploy/oracle-poster.json
       solana address -k target/deploy/oracle-poster.json

  b. Name it on chain (the CLI key is the config admin):
       ORACLE_POSTER=<that address> RPC_URL='$RPC' npx tsx scripts/set-oracle.ts

  c. Give it fee money. It signs a few transactions a week:
       solana transfer <that address> 0.05 --allow-unfunded-recipient --url '$RPC'

  d. The worker's secrets, then deploy it pointed at mainnet:
       cd workers/results-oracle
       npx wrangler secret put HELIUS_API_KEY
       npx wrangler secret put ORACLE_KEYPAIR      < paste the JSON array from the file in (a)
       npx wrangler secret put APISPORTS_KEY
       npx wrangler secret put ALERT_WEBHOOK       (optional)
       npx wrangler deploy --var HELIUS_CLUSTER:mainnet

  e. Now, and only now, stop the site saying the commissioner posts alone:
       node scripts/oracle-copy.mjs
     It rewrites the terms, risk and how pages in the present tense and
     refuses if a sentence it expects has moved. Then:
       npx tsc --noEmit && npm run test:web
       git add -A && git commit -m 'Results oracle live: IDL vendored, worker deployed, copy rewritten'
       git push

  Vercel rebuilds on the push, which is what puts the new copy in front of
  people. Its environment variables need nothing: the program id did not
  change and the site's own builders are additive.
NEXT
