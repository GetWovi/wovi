#!/bin/zsh
# The $WOVI launch from the launch page (/token/launch), rehearsed on a local fork of Robinhood Chain. Rerunnable;
# nothing reaches the real chain and no real key is used.
#
#   scripts/launch-rehearsal.sh               the whole rehearsal, with screenshots when Chrome is installed
#   scripts/launch-rehearsal.sh --no-screens  without the browser
#
# 1. anvil forks the live chain on 127.0.0.1:8652 (FORK_PORT to change it)
# 2. contracts/token-deploy.sh deploys the burn pot and the splitter onto the fork from a throwaway deployer (a key
#    made here for the fork, typed into forge's prompt by expect), with the real launcher wallet and a throwaway owner;
#    the shares come from contracts/split.local.json as on deploy day
# 3. the page's server pieces, against the fork (scripts/launch-rehearsal.ts before): every refusal, and the page's
#    call compared byte for byte with contracts/script/LaunchToken.s.sol's dry run
# 4. the page itself in headless Chrome against the fork (scripts/launch-screens.mjs pre): wrong wallet, short of
#    ETH, ready, and the button pressed on a snapshot that is rolled back
# 5. the launch: the page's server builds it, the launcher sends exactly that, impersonated by the fork
# 6. the checks after: token, dev buy, tax, a buy and a sell, the split to the wei, a burn, a second launch and
#    another wallet refused; then the page once more (scripts/launch-screens.mjs post)
#
# The owner is a throwaway unless REHEARSAL_OWNER names the real one.
# The dev buy is $30 at Chainlink's ETH price, as token-launch.sh reckons it (WOVI_REHEARSAL_BUY_WEI to set it).
# Screenshots go to ~/WOVI-launch-screens/.
ROOT=$(cd "$(dirname "$0")/.." && pwd)
export PATH="$HOME/.foundry/bin:$PATH"
LIVE=https://rpc.mainnet.chain.robinhood.com
PORT=${FORK_PORT:-8652}
FORK=http://127.0.0.1:$PORT
WEB_PORT=${WEB_PORT:-3911}
LAUNCHER=0x78ad50C84A1C58bf56BE8fD86D779e454f180FcD
ETH_USD_FEED=0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9
SCREENS=1; [ "${1:-}" = "--no-screens" ] && SCREENS=
[ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ] || SCREENS=
WORK=$(mktemp -d -t wovi-launch-rehearsal)
ANVIL_PID=; WEB_PID=
cleanup() {
  [ -n "$WEB_PID" ] && kill $WEB_PID 2>/dev/null
  [ -n "$ANVIL_PID" ] && kill $ANVIL_PID 2>/dev/null
  rm -rf "$WORK"
}
trap cleanup EXIT
die() { echo; echo "STOPPED: $1"; exit 1; }
step() { echo; echo "== $1"; }

step "1/6 a fork of Robinhood Chain on $FORK"
lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1 && die "port $PORT is taken (FORK_PORT to use another)"
anvil --fork-url $LIVE --port $PORT --block-time 2 --block-base-fee-per-gas 20000000 > "$WORK/anvil.log" 2>&1 &
ANVIL_PID=$!
for i in {1..60}; do cast chain-id --rpc-url $FORK >/dev/null 2>&1 && break; sleep 1; done
[ "$(cast chain-id --rpc-url $FORK 2>/dev/null)" = 4663 ] || { tail -5 "$WORK/anvil.log"; die "the fork did not start"; }
echo "  forked at block $(cast block-number --rpc-url $FORK)"

step "2/6 the burn pot and the splitter, deployed onto the fork with contracts/token-deploy.sh"
# cast prints "<address>\t<key>" when it is not talking to a terminal
cast wallet new 2>/dev/null | head -1 > "$WORK/deployer.txt"
DEPLOYER=$(cut -f1 "$WORK/deployer.txt")
OWNER=${REHEARSAL_OWNER:-$(cast wallet new 2>/dev/null | head -1 | cut -f1)}
[[ "$DEPLOYER" =~ '^0x[0-9a-fA-F]{40}$' && "$OWNER" =~ '^0x[0-9a-fA-F]{40}$' ]] || die "could not make the throwaway wallets"
cast rpc anvil_setBalance $DEPLOYER 0xDE0B6B3A7640000 --rpc-url $FORK >/dev/null
echo "  throwaway deployer $DEPLOYER, throwaway owner $OWNER, launcher $LAUNCHER"
rm -f "$ROOT/contracts/broadcast/token.fork.env"
# forge asks for the deployer's key at its own prompt; expect types the throwaway key in, from the environment
DEPLOY_KEY=$(cut -f2 "$WORK/deployer.txt") WOVI_DEPLOY_RPC=$FORK \
  expect -c "
    set timeout 900
    spawn $ROOT/contracts/token-deploy.sh $DEPLOYER $LAUNCHER $OWNER
    expect {
      -re {Enter private key} { send \"\$env(DEPLOY_KEY)\r\"; exp_continue }
      eof
    }
    catch wait r
    exit [lindex \$r 3]
  " > "$WORK/deploy.log" 2>&1 || { tail -20 "$WORK/deploy.log"; die "the deploy onto the fork failed"; }
grep -E "^ *(OK:|burn pot |splitter |owner |launcher )" "$WORK/deploy.log" | sort -u | sed 's/^ */  /'
rm -f "$WORK/deployer.txt"
ENV_FILE="$ROOT/contracts/broadcast/token.fork.env"
POT=$(grep "^WOVI_BURN_POT_ADDRESS=" "$ENV_FILE" | cut -d= -f2)
SPLITTER=$(grep "^WOVI_SPLITTER_ADDRESS=" "$ENV_FILE" | cut -d= -f2)
[[ "$POT" =~ '^0x[0-9a-fA-F]{40}$' && "$SPLITTER" =~ '^0x[0-9a-fA-F]{40}$' ]] || die "the deploy wrote no addresses"

if [ -n "${WOVI_REHEARSAL_BUY_WEI:-}" ]; then
  BUY=$WOVI_REHEARSAL_BUY_WEI
else
  USD=$(cast call $ETH_USD_FEED "latestRoundData()(uint80,int256,uint256,uint256,uint80)" --rpc-url $FORK | sed -n 2p | cut -d' ' -f1)
  BUY=$(python3 -c "print(30 * 10**26 // int('$USD'))")
fi
echo "  dev buy for the rehearsal: $BUY wei"

# The site's own settings, pointed at the fork.
export WOVI_TOKEN_RPC_URL=$FORK WOVI_BURN_POT_ADDRESS=$POT WOVI_SPLITTER_ADDRESS=$SPLITTER WOVI_LAUNCH_PAGE=on \
  WOVI_LAUNCH_OPENING_BUY_WEI=$BUY FORK_LAUNCHER=$LAUNCHER FORK_RPC=$FORK FORK_STATE="$WORK/state.json"
cd "$ROOT"

step "3/6 the page's server against the fork, before the launch"
npx tsx scripts/launch-rehearsal.ts before || die "a check before the launch failed"

if [ -n "$SCREENS" ]; then
  step "4/6 the page in a browser against the fork"
  lsof -iTCP:$WEB_PORT -sTCP:LISTEN >/dev/null 2>&1 && die "port $WEB_PORT is taken (WEB_PORT to use another)"
  mkdir -p "$WORK/data"
  WOVI_DATA_DIR="$WORK/data" WOVI_KEEPER=off npx next dev -p $WEB_PORT > "$WORK/web.log" 2>&1 &
  WEB_PID=$!
  for i in {1..120}; do curl -s -o /dev/null -m 60 "http://localhost:$WEB_PORT/token/launch" && break; sleep 1; done
  BASE=http://localhost:$WEB_PORT node scripts/launch-screens.mjs pre || { tail -20 "$WORK/web.log"; die "the browser run failed"; }
else
  step "4/6 the browser run is skipped (--no-screens, or no Chrome)"
fi

step "5/6 the launch"
npx tsx scripts/launch-rehearsal.ts launch || die "the launch failed"

step "6/6 after the launch"
npx tsx scripts/launch-rehearsal.ts after || die "a check after the launch failed"
if [ -n "$SCREENS" ]; then
  BASE=http://localhost:$WEB_PORT node scripts/launch-screens.mjs post || die "the browser run after the launch failed"
fi

echo
echo "DONE. The rehearsal passed on the fork: burn pot $POT, splitter $SPLITTER."
if [ -n "$SCREENS" ]; then echo "Screenshots in ~/WOVI-launch-screens/."; fi
