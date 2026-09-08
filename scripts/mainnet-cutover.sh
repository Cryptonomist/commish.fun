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
# WHAT IS ABOUT TO BE WRITTEN, SHOWN BEFORE IT IS PERMANENT. Every pool copies
# the treasury and the fee at creation, so neither can be corrected afterwards
# for a pool that already exists. Read these two lines before --go.
TREASURY="${FEE_TREASURY:-$(grep -oE 'const FEE_TREASURY = "[^"]+"' scripts/init-config.ts | grep -oE '"[^"]+"' | tr -d '"')}"
FEEBPS=$(grep -oE 'const FEE_BPS = [0-9]+' scripts/init-config.ts | grep -oE '[0-9]+')
say "   fee treasury  $TREASURY"
say "   platform fee  ${FEEBPS} bps"
[ -n "$TREASURY" ] || bad "no fee treasury: set FEE_TREASURY or fix scripts/init-config.ts"
case "$TREASURY" in
  HoYb6BCszJUY89WhKt2itTpxtLHMJKuoEwXwQPdbhtVu)
    bad "the treasury is the DEPLOY KEY. That key already holds the upgrade authority and the config admin; do not add the money to it." ;;
esac

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

say "5. Let the site be found again"

# While the program was on devnet the site asked search engines to stay away,
# because the pages describe buy-ins and pots in the present tense and a
# stranger arriving from a search result would read a money product and find
# play money. On mainnet that reverses: a launched product nobody can find is a
# bug that announces itself with complete silence, and nothing will fail to
# make it obvious.
run "rm -f src/app/robots.ts"
run "sed -i '/robots: { index: false, follow: false, nocache: true },/d' src/app/layout.tsx"
if [ "$GO" = "--go" ]; then
  grep -q "index: false" src/app/layout.tsx \
    && bad "the noindex tag is still in layout.tsx" \
    || ok "noindex removed from layout.tsx"
  [ -f src/app/robots.ts ] && bad "src/app/robots.ts still exists" || ok "robots.ts removed"
fi

say "6. Point the RPC proxy at mainnet"

run "sed -i 's/\"HELIUS_CLUSTER\": \"devnet\"/\"HELIUS_CLUSTER\": \"mainnet\"/' workers/rpc-proxy/wrangler.jsonc"
warn "the worker's HELIUS_API_KEY must be a key valid for mainnet"

# PROGRAM_ID IS SET AT DEPLOY, and this step used to deploy without it.
#
# It is the allowlist for getProgramAccounts. With it unset the guard in the
# worker degrades to "the scan must carry filters" (index.ts:135-140), which
# means anybody who finds the proxy can enumerate ANY program on Solana through
# our Helius key, as long as they attach a filter. On devnet that is somebody
# else's free tier being rude. On mainnet it is our paid key indexing the chain
# for a stranger, and the bill is ours.
#
# wrangler.jsonc leaves it commented out on purpose — the id belongs with the
# deploy rather than in the file — so the deploy is where it has to be passed.
run "(cd workers/rpc-proxy && npx wrangler deploy --var PROGRAM_ID:$PROGRAM_ID)"

if [ "$GO" = "--go" ]; then
  grep -q '"HELIUS_CLUSTER": "mainnet"' workers/rpc-proxy/wrangler.jsonc \
    && ok "worker points at mainnet" \
    || bad "HELIUS_CLUSTER is still not mainnet"

  # ASK THE PROXY WHICH CHAIN IT REACHES, rather than trusting the config we
  # just wrote. Two things can be true at once: the variable says mainnet and
  # the key does not work there. The worker uses ONE HELIUS_API_KEY for both
  # clusters and only swaps the hostname, so a devnet-only key produces a worker
  # that looks correctly configured and answers nothing useful — and it would
  # surface two steps later, at Vercel, looking like a Vercel problem.
  #
  # The mainnet USDC mint is the discriminator, and it needs no extra RPC
  # method. That address exists on BOTH chains, which is why "is it there" is
  # not the test: on mainnet it is a real SPL Mint, 82 bytes owned by the token
  # program; on devnet it is an empty account, 0 bytes owned by the system
  # program, because somebody once sent lamports to it.
  say "   asking the proxy which chain it reaches"
  PROXY_URL="${PROXY_URL:-https://commish-rpc.therealcryptonomist.workers.dev}"
  PROBE=$(curl -s --max-time 25 -X POST "$PROXY_URL"     -H "content-type: application/json"     -H "Origin: https://commish.fun"     -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getAccountInfo\",\"params\":[\"$MAINNET_USDC\",{\"encoding\":\"base64\",\"dataSlice\":{\"offset\":0,\"length\":0}}]}"     2>/dev/null || true)

  case "$PROBE" in
    *TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA*)
      ok "the proxy is serving mainnet" ;;
    *'"space":0'*)
      bad "the proxy answered from DEVNET. HELIUS_CLUSTER says mainnet, so the Helius key is almost certainly devnet-only. Fix the key before touching Vercel." ;;
    *'"error"'*)
      printf "  %s
" "$PROBE" | cut -c1-200
      bad "the proxy refused the probe. If it names a method, add it to ALLOWED_METHODS; if it names CORS, the Origin allowlist is wrong." ;;
    "")
      bad "the proxy returned nothing. Check the worker deployed and that HELIUS_API_KEY is set on it." ;;
    *)
      printf "  %s
" "$PROBE" | cut -c1-200
      bad "could not tell which chain the proxy is on. Do not continue to Vercel until this reads mainnet." ;;
  esac
fi

say "7. Check it still builds"

if [ "$GO" = "--go" ]; then
  npx tsc --noEmit || bad "tsc failed"
  npx eslint src --max-warnings 0 || bad "eslint failed"
  ok "tsc and eslint clean"
  # RISK/PAGE.TSX WAS MISSING FROM THIS LIST, and it is the page with the most
  # devnet prose on it — a whole section under its own heading. The rewriter
  # left "Treat anything you do today as a rehearsal" there, and this check
  # looked at three files, none of them that one, and reported the copy clean.
  #
  # "devnet" alone is also not the whole claim. A page can stop naming the
  # network and still tell somebody their money is play money.
  if grep -rEiq "devnet|test tokens?|\brehearsal\b|no real money" \
       src/app/terms/page.tsx src/app/privacy/page.tsx \
       src/app/risk/page.tsx src/app/play/page.tsx; then
    grep -rEin "devnet|test tokens?|\brehearsal\b|no real money" \
      src/app/terms/page.tsx src/app/privacy/page.tsx \
      src/app/risk/page.tsx src/app/play/page.tsx | cut -c1-160
    bad "a legal page still tells the reader the money is not real"
  fi
  ok "no devnet or test-token claim left in the legal copy"
fi

say "8. Set these in Vercel yourself, then redeploy"
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
