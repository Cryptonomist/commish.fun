#!/usr/bin/env bash
#
# Everything after the program is on mainnet.
#
# `deploy-mainnet.sh` puts the binary on the chain. This does the rest, in the
# order that cannot be got wrong, and refuses at each step it cannot verify.
#
#   bash scripts/mainnet-cutover.sh          check everything, change nothing
#   bash scripts/mainnet-cutover.sh --go     do it
#
# It deliberately does NOT touch Vercel. The environment variables are printed
# at the end for you to paste, because a wrong one there points real wallets at
# the wrong chain and that should take a human deciding rather than a script
# assuming.
#
set -euo pipefail

RPC="${MAINNET_RPC:-https://api.mainnet-beta.solana.com}"
GO="${1:-}"
PROGRAM_ID="Adb5CFrY4vYiGQnTQ5qsaPPMUAWKyxwVAQtFHWcshjPa"
MAINNET_USDC="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32mok\033[0m   %s\n' "$*"; }
bad()  { printf '  \033[31mNO\033[0m   %s\n' "$*"; exit 1; }
warn() { printf '  \033[33m!\033[0m    %s\n' "$*"; }
run()  { if [ "$GO" = "--go" ]; then eval "$@"; else printf '  would run: %s\n' "$*"; fi; }

say "1. The program is actually on mainnet"

SHOW=$(solana program show "$PROGRAM_ID" --url "$RPC" 2>&1) \
  || bad "Program $PROGRAM_ID is not on mainnet. Run scripts/deploy-mainnet.sh --go first."

PROGRAM_DATA=$(printf '%s' "$SHOW" | awk '/ProgramData Address/{print $3}')
AUTHORITY=$(printf '%s' "$SHOW" | awk '/Authority/{print $2}')
[ -n "$PROGRAM_DATA" ] || bad "could not read the ProgramData address"
[ -n "$AUTHORITY" ]    || bad "could not read the upgrade authority"

ok "program id    $PROGRAM_ID"
ok "program data  $PROGRAM_DATA"
ok "authority     $AUTHORITY"

say "2. Vendor the IDL, so the client and the chain agree"

# The client reads the program id and every account layout out of this file. A
# stale copy is the failure where the site builds fine and decodes garbage.
if [ -f target/idl/commish.json ]; then
  run "cp target/idl/commish.json src/idl/commish.json"
  ok "src/idl/commish.json from target/idl/commish.json"
else
  warn "no target/idl/commish.json; run anchor build if the IDL has changed"
fi

say "3. Config, and the treasury token account"

# init-config.ts creates the fee treasury's USDC account as well as the config,
# and it is idempotent: run against an existing config it only fills in a
# missing token account. That account must exist or NO POOL CAN EVER SETTLE,
# because advance_week names it on every call even at a zero fee.
run "RPC_URL='$RPC' npx tsx scripts/init-config.ts"

if [ "$GO" = "--go" ]; then
  CONFIG=$(npx tsx -e "
    const {PublicKey}=require('@solana/web3.js');
    console.log(PublicKey.findProgramAddressSync([Buffer.from('config')], new PublicKey('$PROGRAM_ID'))[0].toBase58());
  ")
  solana account "$CONFIG" --url "$RPC" >/dev/null 2>&1 \
    && ok "config exists at $CONFIG" \
    || bad "config still missing at $CONFIG"
fi

say "4. Rewrite every sentence that says this is devnet"

# Six claims across the four legal pages tell the reader their money is not
# real. On mainnet each is false in the direction that matters most.
run "node scripts/mainnet-copy.mjs '$PROGRAM_ID' '$PROGRAM_DATA' '$AUTHORITY'"

say "5. Point the RPC proxy at mainnet"

run "sed -i 's/\"HELIUS_CLUSTER\": \"devnet\"/\"HELIUS_CLUSTER\": \"mainnet\"/' workers/rpc-proxy/wrangler.jsonc"
warn "the worker's HELIUS_API_KEY must be a key valid for mainnet"
run "(cd workers/rpc-proxy && npx wrangler deploy)"

say "6. Check it still builds"

if [ "$GO" = "--go" ]; then
  npx tsc --noEmit || bad "tsc failed"
  npx eslint src --max-warnings 0 || bad "eslint failed"
  ok "tsc and eslint clean"
  grep -rq "devnet" src/app/terms/page.tsx src/app/privacy/page.tsx src/app/play/page.tsx \
    && bad "a legal page still says devnet" || ok "no devnet claims left in the legal copy"
fi

say "7. Set these in Vercel yourself, then redeploy"
cat <<NEXT
  NEXT_PUBLIC_SOLANA_CLUSTER = mainnet-beta
  NEXT_PUBLIC_PROGRAM_ID     = $PROGRAM_ID
  NEXT_PUBLIC_USDC_MINT      = $MAINNET_USDC
  NEXT_PUBLIC_FAST_CLOCK     =            (must be EMPTY)
  NEXT_PUBLIC_RPC_URL        = https://commish-rpc.therealcryptonomist.workers.dev
  RPC_URL                    = a mainnet Helius URL, server side only

  NEXT_PUBLIC_ values are compiled in at build time, so changing them without a
  redeploy changes nothing.

  Then, before telling anybody the pool is open:
    - load a pool page and confirm the wallet is on mainnet
    - send one real transaction and watch it confirm, because confirmTransaction
      uses a websocket and a broken proxy upgrade shows up as a confirmation
      that hangs for a minute and then reports failure for a transaction that
      landed
    - rotate the old Helius key, which has been public in the bundle
NEXT
