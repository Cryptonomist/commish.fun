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
#   ./scripts/upgrade-mainnet.sh            dry run: check everything, upgrade nothing
#   ./scripts/upgrade-mainnet.sh --go       upgrade, when the CLI key is the upgrade authority
#   ./scripts/upgrade-mainnet.sh --buffer   write the binary to a buffer and hand it to the
#                                           upgrade authority, when that is a multisig
#   ./scripts/upgrade-mainnet.sh --verify   after a multisig executed the upgrade: prove
#                                           the chain holds this binary, vendor the IDL
#
# TWO WAYS TO UPGRADE, BECAUSE THE AUTHORITY MOVED. The first upgrades were
# signed by the CLI key, which was the upgrade authority; --go is that path
# and still works while it is. The security review of 2026-09-08 put the
# authority on a multisig, and a multisig cannot run `solana program deploy`.
# What it can do is execute an upgrade from a buffer it owns. So --buffer does
# everything --go does up to the moment of signing — the same feature guard,
# the same tests, the same size check — then writes the buffer, gives it to
# the authority, and stops. The upgrade itself is proposed and approved in the
# multisig. --verify is the half of --go that comes after: compare the chain to
# the local build byte for byte, and only then vendor the IDL.
#
# Needs: MAINNET_RPC set to an RPC that will accept a 500KB buffer. The public
# one dropped the first deploy with -32002 halfway through; a Helius URL did
# not. For --go, the upgrade authority as the CLI's default key, or as a file
# named in UPGRADE_AUTHORITY_KEYPAIR (a cold key on a USB stick) while the CLI
# key pays. For --buffer, any funded CLI key: the buffer's rent comes back when
# the upgrade closes it.
#
# A RUN THAT FAILS PART WAY IS RESUMED, NOT REPEATED. Every mode looks for a
# buffer the authority already owns that holds this exact binary and uses it:
# the upload is the expensive, flaky part, and the rent in it is the wallet's.
# See the note above find_buffer for the run that taught this.
#
# THIS SCRIPT NEVER PRINTS THE RPC URL. A Helius URL carries the API key, and
# an earlier version echoed it inside a "next, run this" hint, where a terminal
# rendered it as a link and it ended up in a chat. Every hint below says
# "$MAINNET_RPC" literally and lets the shell fill it in.
#
set -euo pipefail

# The CLI's standard install location, used only if `solana` is not already
# on PATH: a shell without the installer's profile line, or a cron.
command -v solana >/dev/null 2>&1 \
  || PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

RPC="${MAINNET_RPC:-https://api.mainnet-beta.solana.com}"
MODE="${1:-}"
BIN="target/deploy/commish.so"
KEYPAIR="target/deploy/commish-keypair.json"

case "$MODE" in
  ""|--go|--buffer|--verify) ;;
  *) printf 'unknown mode %s. One of: (none) --go --buffer --verify\n' "$MODE"; exit 2 ;;
esac

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

case "$MODE" in
  --go|--buffer)
    npx ts-mocha -p ./tsconfig.json -t 1000000 "tests/**/*.ts" >/tmp/upgrade-tests.log 2>&1 \
      || { tail -30 /tmp/upgrade-tests.log; bad "the suite failed; see /tmp/upgrade-tests.log"; }
    ok "$(grep -o '[0-9]* passing' /tmp/upgrade-tests.log | head -1) against the production binary"
    ;;
  --verify)
    warn "skipped: --verify proves bytes, and the bytes were tested before the buffer was written"
    ;;
  *)
    warn "skipped in dry run (--go and --buffer run them)"
    ;;
esac

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

if [ "$MODE" = "--verify" ]; then
  say "4. Prove the chain holds this binary"
  # The loader stores the program bytes after a header; `program dump` strips
  # it and pads to the data length. The size is compared through the hash: a
  # padded dump of a smaller program hashes differently and says so.
  SLOT=$(printf '%s' "$SHOW" | awk '/Last Deployed In Slot/{print $5}')
  ok "last deployed in slot $SLOT"
  solana program dump "$PROGRAM_ID" /tmp/onchain-commish.so --url "$RPC" >/dev/null
  CHAIN_SHA=$(head -c "$SIZE" /tmp/onchain-commish.so | sha256sum | awk '{print $1}')
  [ "$CHAIN_SHA" = "$LOCAL_SHA" ] \
    || bad "the chain holds $CHAIN_SHA and the repository built $LOCAL_SHA. The upgrade has not executed, or executed a different buffer."
  ok "sha256 of the on-chain program equals the local build: $LOCAL_SHA"

  say "5. Vendor the IDL"
  cp target/idl/commish.json src/idl/commish.json
  ok "src/idl/commish.json from target/idl/commish.json"
  cat <<NEXT

  Then:
    npx tsc --noEmit && npm run test:web
    git add -A && git commit -m 'Upgrade verified on mainnet: IDL vendored'
    git push
NEXT
  exit 0
fi

# THE ONE CHECK THE FIRST DEPLOY LEFT US NEEDING. It went out with --max-len
# equal to the binary, so the ProgramData account has no room to grow, and a
# larger binary is refused by the loader with an error that does not say so.
# Extending costs rent on the extra bytes. It does not need the authority:
# the loader lets anyone pay to extend an upgradeable program, so this works
# from the CLI key whoever holds the authority.
if [ "$SIZE" -gt "$DATALEN" ]; then
  EXTRA=$(( SIZE - DATALEN ))
  bad "the new binary is $EXTRA bytes larger than the ProgramData account. First run:
       solana program extend $PROGRAM_ID $(( EXTRA + 65536 )) --url \"\$MAINNET_RPC\"
       (the 64KB on top is so the next upgrade does not land here again)"
fi
ok "new binary fits: $SIZE <= $DATALEN"

PAYER=$(solana address)
case "$MODE" in
  --go)
    if [ -n "${UPGRADE_AUTHORITY_KEYPAIR:-}" ]; then
      [ -f "$UPGRADE_AUTHORITY_KEYPAIR" ] || bad "UPGRADE_AUTHORITY_KEYPAIR=$UPGRADE_AUTHORITY_KEYPAIR is not a file"
      AUTH_KEY=$(solana address -k "$UPGRADE_AUTHORITY_KEYPAIR")
      [ "$AUTH_KEY" = "$AUTHORITY" ] \
        || bad "UPGRADE_AUTHORITY_KEYPAIR holds $AUTH_KEY, not the upgrade authority $AUTHORITY"
      ok "UPGRADE_AUTHORITY_KEYPAIR is the upgrade authority; the CLI key $PAYER pays"
    else
      [ "$PAYER" = "$AUTHORITY" ] \
        || bad "the CLI key $PAYER is not the upgrade authority $AUTHORITY. Set UPGRADE_AUTHORITY_KEYPAIR to its file, or use --buffer for a multisig."
      ok "CLI key is the upgrade authority"
    fi
    ;;
  --buffer)
    if [ "$PAYER" = "$AUTHORITY" ]; then
      warn "the CLI key is still the upgrade authority; --go would upgrade directly. Continuing with a buffer anyway."
    else
      ok "authority $AUTHORITY is not this key; the buffer will be handed to it"
    fi
    ;;
  *)
    if [ "$PAYER" = "$AUTHORITY" ]; then
      ok "CLI key is the upgrade authority: --go upgrades directly"
    else
      ok "authority is $AUTHORITY, not this key: --buffer, then upgrade through the authority"
    fi
    ;;
esac

# A FAILED RUN LEAVES ITS BUFFER BEHIND, holding the whole binary and about
# 3 SOL of rent. The first --go of the handover upgrade did exactly that:
# "5 write transactions failed", the CLI gave up before the Upgrade
# instruction, and a dump afterwards showed every byte had in fact landed —
# the writes were confirmed late, not lost. The hint at the time said to close
# the buffer, which throws the upload away, and the wallet was left with 0.15
# SOL, which the funds check below would then have refused. Resuming from a
# complete buffer is one transaction, and the CLI takes the buffer by ADDRESS:
# the ephemeral keypair whose seed phrase it prints is only needed while the
# account is being created.
#
# So look before writing. --go deploys from a matching buffer, --buffer hands
# one over instead of writing a second, and the dry run reports one. A buffer
# holding different bytes is named and left alone: it is somebody's decision,
# not this script's, whether that upload was wanted.
RESUME_BUFFER=""
RESUME_OWNER=""
find_buffer() {
  local owner="$1" list b have
  list=$(solana program show --buffers --buffer-authority "$owner" --url "$RPC" 2>/dev/null \
    | awk '$2 == "|" && $3 ~ /^[1-9A-HJ-NP-Za-km-z]+$/ && length($1) >= 32 {print $1}' || true)
  for b in $list; do
    solana program dump "$b" /tmp/leftover-buffer.so --url "$RPC" >/dev/null 2>&1 || continue
    have=$(head -c "$SIZE" /tmp/leftover-buffer.so | sha256sum | awk '{print $1}')
    if [ "$have" = "$LOCAL_SHA" ]; then
      RESUME_BUFFER="$b"
      RESUME_OWNER="$owner"
      ok "buffer $b already holds this exact binary: it will be used, not rewritten"
      return 0
    fi
    warn "buffer $b (authority $owner) holds different bytes. Left alone; its rent comes back with: solana program close $b --url \"\$MAINNET_RPC\""
  done
  return 0
}
if [ "$MODE" != "--verify" ]; then
  find_buffer "$AUTHORITY"
  [ -n "$RESUME_BUFFER" ] || [ "$PAYER" = "$AUTHORITY" ] || find_buffer "$PAYER"
fi

say "4. Funds"

if [ -n "$RESUME_BUFFER" ]; then
  # The rent is already paid, by the run that wrote the buffer. Fees only.
  BALANCE=$(solana balance --url "$RPC" | awk '{print $1}')
  if awk "BEGIN{exit !($BALANCE < 0.02)}"; then
    bad "wallet has $BALANCE SOL. Resuming needs only transaction fees, but more than that; send 0.05 SOL."
  fi
  ok "wallet $BALANCE SOL covers the fees; the buffer's rent comes back after the upgrade"
else
  # An upgrade writes the whole program into a buffer account first, which
  # has to be rent-exempt for its size until the upgrade closes it and returns
  # the lamports. So the wallet needs the buffer's rent plus fees for a
  # moment, and gets nearly all of it back — to the buffer's authority, so
  # with --buffer the rent returns to the multisig's vault, not to this key.
  NEED=$(solana rent "$SIZE" --url "$RPC" 2>/dev/null | awk '/Rent-exempt minimum/{print $3}')
  BALANCE=$(solana balance --url "$RPC" | awk '{print $1}')
  [ -n "$NEED" ] || bad "could not ask the cluster what a $SIZE byte buffer costs"
  if awk "BEGIN{exit !($BALANCE < $NEED + 0.05)}"; then
    bad "wallet has $BALANCE SOL; the buffer needs $NEED SOL plus fees while the upgrade runs. Nearly all of it comes back."
  fi
  ok "wallet $BALANCE SOL covers the $NEED SOL buffer (returned after the upgrade)"
fi

# HOW THE WRITES ARE SENT. The default path hands ~130 write transactions to
# validator TPUs over QUIC from this machine, and from a WSL2 network that is
# where "5 write transactions failed" came from. --use-rpc sends them through
# the configured RPC instead, which is what a Helius URL is for, and a higher
# sign-attempt ceiling keeps the CLI re-signing across blockhash expiry rather
# than giving up with the buffer written and the upgrade not done.
SEND_ARGS=(--use-rpc --max-sign-attempts 25)

case "$RPC" in
  *api.mainnet-beta.solana.com*)
    warn "RPC is the public endpoint. It dropped the first deploy mid-buffer with -32002; set MAINNET_RPC to a Helius URL." ;;
esac

if [ "$MODE" = "" ]; then
  say "5. Upgrade"
  warn "dry run. Re-run with --go (CLI key is the authority) or --buffer (a multisig is)."
  exit 0
fi

if [ "$MODE" = "--buffer" ]; then
  say "5. Write the buffer and hand it to the authority"

  if [ -n "$RESUME_BUFFER" ]; then
    BUFFER="$RESUME_BUFFER"
    ok "using buffer $BUFFER, written by an earlier run"
  else
    # The CLI's own output is scrubbed of the URL too: on a failure it quotes
    # the endpoint it was talking to.
    WROTE=$(solana program write-buffer "$BIN" "${SEND_ARGS[@]}" --url "$RPC" --commitment finalized 2>&1 | sed "s#$RPC#\$MAINNET_RPC#g") \
      || { printf '%s\n' "$WROTE"; bad "write-buffer did not complete. Re-run --buffer: a buffer it left behind is found and reused. Do not close it."; }
    BUFFER=$(printf '%s' "$WROTE" | awk '/Buffer:/{print $2}')
    [ -n "$BUFFER" ] || { printf '%s\n' "$WROTE"; bad "could not read the buffer address from write-buffer's output"; }
    ok "buffer $BUFFER holds the binary"
  fi

  if [ "$RESUME_OWNER" = "$AUTHORITY" ]; then
    ok "buffer authority is already $AUTHORITY"
  else
    solana program set-buffer-authority "$BUFFER" --new-buffer-authority "$AUTHORITY" --url "$RPC" >/dev/null \
      || bad "could not give buffer $BUFFER to $AUTHORITY. Re-run --buffer to try again; the buffer is kept."
    ok "buffer authority is now $AUTHORITY"
  fi

  cat <<NEXT

  The bytes are on the chain, owned by the upgrade authority, and nothing has
  changed yet. The upgrade is the authority's to execute:

    program   $PROGRAM_ID
    buffer    $BUFFER
    sha256    $LOCAL_SHA

  In Squads: Developers -> Programs -> the program above -> Upgrade -> paste
  the buffer address -> create -> approve from a second device -> execute.
  Squads checks the buffer's authority is the vault before it lets you.

  If the proposal is rejected, close the buffer to get its rent back; that
  also has to be executed by the authority, from the same screen.

  When it has executed:
    ./scripts/upgrade-mainnet.sh --verify
NEXT
  exit 0
fi

say "5. Upgrade"

AUTH_ARGS=()
[ -n "${UPGRADE_AUTHORITY_KEYPAIR:-}" ] && AUTH_ARGS=(--upgrade-authority "$UPGRADE_AUTHORITY_KEYPAIR")
RESUME_ARGS=()
[ -n "$RESUME_BUFFER" ] && RESUME_ARGS=(--buffer "$RESUME_BUFFER")

# With --buffer and the file both given, the CLI compares the buffer to the
# file, rewrites only the chunks that differ, and sends the Upgrade. The CLI
# quotes its endpoint in some failures; scrub it before it is shown.
solana program deploy "$BIN" \
  --program-id "$KEYPAIR" \
  "${AUTH_ARGS[@]}" \
  "${RESUME_ARGS[@]}" \
  "${SEND_ARGS[@]}" \
  --url "$RPC" \
  --commitment finalized 2>&1 | sed "s#$RPC#\$MAINNET_RPC#g" \
  || bad "the upgrade did not complete. The buffer it wrote is kept; re-run --go and it resumes from it. Do not close it."
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

say "8. After the upgrade"
cat <<NEXT
  The site's own builders are additive and the program id did not change, so
  Vercel needs nothing. Prove the client agrees with the chain, then commit:
    npx tsx scripts/check-instruction-encoding.ts
    npx tsc --noEmit && npm run test:web
    git add -A && git commit -m 'Upgrade verified on mainnet: IDL vendored'
    git push

  If this upgrade introduced the admin handover, the CLI key is still the
  admin until it proposes a successor and that successor accepts:
    RPC_URL="\$MAINNET_RPC" npx tsx scripts/admin-transfer.ts status
    NEW_ADMIN=<multisig vault or cold key> RPC_URL="\$MAINNET_RPC" npx tsx scripts/admin-transfer.ts propose
  then, from the successor:
    RPC_URL="\$MAINNET_RPC" KEYPAIR=<its keypair> npx tsx scripts/admin-transfer.ts accept
  or, for a multisig, propose the printed instruction inside it:
    RPC_URL="\$MAINNET_RPC" npx tsx scripts/admin-transfer.ts accept --print
NEXT
