#!/usr/bin/env bash
#
# The mainnet deploy, as a script rather than a paragraph in a document.
#
# It refuses more than it does. Every check below is something that, skipped,
# either wastes real SOL or produces a program nobody can use, and the point of
# writing it down is that the checks run the same way every time instead of
# depending on somebody remembering at 2am.
#
#   ./scripts/deploy-mainnet.sh          dry run: check everything, deploy nothing
#   ./scripts/deploy-mainnet.sh --go     actually deploy
#
set -euo pipefail

RPC="${MAINNET_RPC:-https://api.mainnet-beta.solana.com}"
GO="${1:-}"
BIN="target/deploy/commish.so"
KEYPAIR="target/deploy/commish-keypair.json"

# 1.25x the binary. The default is 2x, which costs twice the rent for headroom
# this program is unlikely to need; exactly 1x saves more but means any larger
# upgrade needs a NEW ADDRESS, stranding every pool at the old one. 25% covers
# the five specced-but-unbuilt instructions.
HEADROOM_NUM=5
HEADROOM_DEN=4

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32mok\033[0m   %s\n' "$*"; }
bad()  { printf '  \033[31mNO\033[0m   %s\n' "$*"; exit 1; }
warn() { printf '  \033[33m!\033[0m    %s\n' "$*"; }

say "1. The binary is the one that ships"

[ -f "$BIN" ] || bad "No $BIN. Run: anchor build"

# The devnet feature swaps the USDC mint; fastclock shortens the timing floors
# from hours to seconds. Either one on mainnet is a catastrophe of a different
# shape, so this reads the fingerprint the same way tests/00-build-guard.ts
# does rather than trusting that whoever built it used the right command.
FEATURES=$(find target -name '*.json' -path '*fingerprint*' -newer Cargo.toml 2>/dev/null \
  | xargs grep -l '"commish"' 2>/dev/null \
  | xargs grep -ho '"features":"[^"]*"' 2>/dev/null | sort -u || true)
if printf '%s' "$FEATURES" | grep -q 'devnet\|fastclock'; then
  bad "This binary was built WITH features: $FEATURES"
fi
ok "no devnet or fastclock feature detected"

grep -q 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' programs/commish/src/constants.rs \
  || bad "constants.rs does not contain the mainnet USDC mint"
ok "mainnet USDC is the pinned mint"

SIZE=$(stat -c%s "$BIN")
MAXLEN=$(( SIZE * HEADROOM_NUM / HEADROOM_DEN ))
ok "binary $SIZE bytes, deploying with --max-len $MAXLEN"

say "2. The tests pass against THIS binary"

if [ "$GO" = "--go" ]; then
  npx ts-mocha -p ./tsconfig.json -t 1000000 "tests/**/*.ts" >/tmp/mainnet-tests.log 2>&1 \
    || { tail -30 /tmp/mainnet-tests.log; bad "the suite failed; see /tmp/mainnet-tests.log"; }
  ok "$(grep -o '[0-9]* passing' /tmp/mainnet-tests.log | head -1) against the production binary"
else
  warn "skipped in dry run (--go runs them)"
fi

say "3. Identity and funds"

PROGRAM_ID=$(solana address -k "$KEYPAIR")
DECLARED=$(grep -o 'declare_id!("[^"]*")' programs/commish/src/lib.rs | sed 's/.*("//; s/")$//')
[ "$PROGRAM_ID" = "$DECLARED" ] || bad "keypair $PROGRAM_ID != declare_id! $DECLARED"
ok "program id $PROGRAM_ID matches declare_id!"

# Deploying over a live program is an UPGRADE, not a fresh deploy, and it costs
# nothing in rent. Worth knowing which one is about to happen.
if solana program show "$PROGRAM_ID" --url "$RPC" >/dev/null 2>&1; then
  warn "this address is ALREADY DEPLOYED on mainnet: this would be an upgrade"
else
  ok "address is free; this is a first deploy"
fi

PAYER=$(solana address)
BALANCE=$(solana balance --url "$RPC" | awk '{print $1}')

# Ask the CLUSTER what it charges, never a constant.
#
# The documented formula is (128 + bytes) * 3480 * 2, and for this program that
# gives 3.829 SOL. The cluster was returning exactly that, then started
# returning 3.484 for the identical query, stable across ten calls each time.
# Whatever moved, the chain is the authority on what it will charge and a
# number pasted in from documentation is not. Hence the live query, and hence
# the margin below rather than an exact figure.
NEEDED=$(solana rent $(( 45 + MAXLEN )) --url "$RPC" | grep -o '[0-9.]*')
ok "payer $PAYER"
ok "needs ~$NEEDED SOL, has $BALANCE SOL"

if awk "BEGIN{exit !($BALANCE < $NEEDED + 0.05)}"; then
  bad "not enough SOL. Send at least $(awk "BEGIN{printf \"%.2f\", $NEEDED + 0.1 - $BALANCE}") more to $PAYER"
fi
ok "balance covers the deploy"

say "4. Deploy"

if [ "$GO" != "--go" ]; then
  printf '\n  Dry run only. Everything above passed.\n'
  printf '  Run with --go to deploy for real.\n\n'
  exit 0
fi

solana program deploy "$BIN" \
  --program-id "$KEYPAIR" \
  --max-len "$MAXLEN" \
  --url "$RPC"

say "5. What still has to happen, in this order"
cat <<'NEXT'
  a. Vendor the IDL so the client and the chain agree:
       cp target/idl/commish.json src/idl/commish.json

  b. Initialise Config on mainnet:
       RPC_URL="<mainnet rpc>" npx tsx scripts/init-config.ts

  c. CREATE THE FEE TREASURY'S USDC ATA. This is the one that bites.
     advance_week takes fee_treasury_ata as a required account with
     constraints, even though season one runs at fee_bps == 0. Nothing
     transfers, but the account must EXIST. Without it, pools collect
     buy-ins and then cannot settle:
       spl-token create-account EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v \
         --owner <fee_treasury> --url <mainnet rpc>

  d. Point the frontend at mainnet, in Vercel, then redeploy:
       NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta
       NEXT_PUBLIC_USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
       NEXT_PUBLIC_PROGRAM_ID=<the id above>
       NEXT_PUBLIC_FAST_CLOCK=        (must be empty)

  e. Switch the RPC proxy to mainnet and redeploy it:
       workers/rpc-proxy/wrangler.jsonc -> HELIUS_CLUSTER: "mainnet"
       and RPC_URL in Vercel -> a mainnet Helius URL

  f. THE LEGAL PAGES CURRENTLY SAY THERE IS NO REAL MONEY. On mainnet that
     is false, and it is the kind of false that matters. Fix before anyone
     joins:
       src/app/play/page.tsx    "currently deployed to Solana devnet using
                                 test tokens, which have no value"
       src/app/privacy/page.tsx "devnet with test tokens only, so no real
                                 money is involved at the moment"
NEXT
