# $WOVI: the contracts

Two contracts in `contracts/`, built with Foundry, no OpenZeppelin, nothing upgradeable and no admin.

| Contract | What it does |
|---|---|
| `WoviBurnPot` | Launches $WOVI on Pons (once, by the launcher wallet only), then buys $WOVI with the ETH it holds and burns it with the token's own `burn()`, so the total supply falls. No withdraw, no owner. |
| `WoviSplitter` | The address $WOVI's trading fees are paid to. Splits every fee two ways: the owner wallet and the burn pot. |

## What is fixed at launch

- A 3% creator tax on every trade (`CREATOR_TAX_BPS = 300` in the burn pot, forced at launch and read back).
- ETH pair, buyback off, the fees paid to the splitter: all forced by the burn pot at launch and read back. A launch
  that comes out any other way reverts.
- The two shares of the fees, set when the splitter is deployed and immutable. They come from
  `contracts/split.local.json` on the deploying machine, never from git.
- The launcher's opening buy happens inside the launch transaction, so nothing can trade ahead of it.

## What can change

Only one thing: the owner wallet can hand its own share of future fees to another address, in two steps (it
proposes, the new address accepts; `contracts/owner-payee.sh`). Nobody else can change anything in either contract.

## How the burn works

- Anyone may call `burn()`; WOVI's keeper does on a schedule (below, "The keeper").
- At most once every 30 minutes, at most 1% of the market's ETH depth per burn, and on the pool a hard price limit,
  so buying before a burn and selling after it loses money.
- Small amounts (under 0.001 ETH) wait, but never more than 24 hours.
- It buys on the Pons bonding curve before graduation and in the Uniswap v4 pool after.
- Every burn checks that the total supply fell by exactly what was burned, or it reverts.

## Commands (on deploy day, phase 21)

Each asks for one key, at forge's own prompt, where nothing shows. Arguments are public addresses.

```
contracts/token-deploy.sh <deployer> <launcher> <owner>      # the burn pot and the splitter, checked
contracts/token-launch.sh                                    # launches $WOVI from the launcher wallet
contracts/owner-payee.sh                                     # only if the owner wallet ever moves its share
```

`WOVI_DRY=1` stops each one before the key (a dry run with the cost). `WOVI_DEPLOY_RPC=<a local fork>` rehearses on a
fork.

The deployer wallet deploys both contracts and has no power over them afterwards. The launcher wallet is the only one
that can launch the token, and the opening buy lands in it; it has no other power. The owner wallet receives
the owner share.

## Before launch

- `contracts/launch.json`: the name, ticker, logo, description and links. The website and X links are placeholders
  until the real domain and account exist (phase 20).
- The site needs the two addresses and the keeper (below). Set them, restart, and see `/token` say the contracts are
  live before the launcher runs `token-launch.sh`.

## Tests

```
cd contracts && forge test
```

Unit tests for both contracts, invariant tests under random call sequences, and a fork test that launches $WOVI on a
copy of Robinhood Chain against the real Pons: the tax, the split reaching both destinations, and the supply falling
after a burn. `RPC_URL=""` skips the fork test.

# $WOVI on the site (phase 17)

The token page, the keeper, holder status and holder credits, and paying for credits with $WOVI. With none of the
settings below the site behaves exactly as before: no `/token`, no keeper, no badge, no holder credits, no paying with
$WOVI. Nothing here moves money on its own except the keeper's gas.

The code lives in `src/lib/token/`.

| File | What it holds |
|---|---|
| `config.ts` | Every setting from the environment, exact amounts in wei, the holder tiers, `keeperStatus`, `payStatus`. Client-safe. |
| `chain.ts` | The read side on viem: the pot's numbers and `preview()`, the supply, `Burned` logs in 100,000-block spans halved on a refusal, balances through Multicall3 at one block, a transaction's $WOVI transfers, the market price (the Pons curve's reserves, or the v4 pool's price after graduation). `TokenReader` is the interface; tests give their own. |
| `panel.ts` | What `/token` shows, with one cache per process. |
| `keeper.ts`, `keeper-chain.ts` | The keeper's decisions, and its one chain side that reads `WOVI_KEEPER_KEY`. |
| `holders.ts` | Holder status, the monthly snapshot and holder credits, the month-end write-off. |
| `pay.ts` | Paying for credits with $WOVI: the price, and the read-only check of a payment. |
| `local.ts`, `jobs.ts` | One set of services per process; the in-process jobs, started from `src/instrumentation.ts`. |
| `store.ts` | Seven tables in `.data/token.json`: `burns`, `scan`, `keeper`, `holders`, `snapshots`, `quotes`, `payments`. |
| `words.ts` | Amounts and times in words for screens. |

Screens: `/token` (`src/app/token/`), the holder card on `/account`, holder credits and Pay with $WOVI on
`/app/credits`, the holder mark on the avatar, and the owner's page `/app/settings/token`.

## Switching each part on

| Part | Needs | On when |
|---|---|---|
| `/token` | `WOVI_TOKEN_PAGE=on` (before anything is deployed), or `WOVI_BURN_POT_ADDRESS` | The burn pot is set, or the switch is on. `WOVI_TOKEN_PAGE=off` hides it whatever else is set. |
| Reading the chain | `WOVI_TOKEN_RPC_URL` | Falls back to `WOVI_X402_RPC_URL`, then the public node. On a host use a paid node: the public one turns servers away. |
| The keeper | `WOVI_KEEPER_KEY`, `WOVI_BURN_POT_ADDRESS`, `WOVI_SPLITTER_ADDRESS` | All three set and `WOVI_KEEPER` is not `off`. |
| Holder badge | `WOVI_BURN_POT_ADDRESS` | The burn pot is set (the token is read from it). |
| Holder credits | `WOVI_HOLDER_CREDITS` | The tiers are set and credits are on. Empty: no holder credits. |
| Pay with $WOVI | `WOVI_PAY_WITH_WOVI=on` | Switched on, the burn pot set and credits on. |

| Setting | Default | Meaning |
|---|---|---|
| `WOVI_TOKEN_PAGE` | empty | `on` shows `/token` before the contracts exist; `off` never. |
| `WOVI_BURN_POT_ADDRESS`, `WOVI_SPLITTER_ADDRESS` | empty | The two contracts (`contracts/broadcast/token.env`). |
| `WOVI_BURN_POT_BLOCK` | empty | The pot's deploy block: where the burn logs are read from. |
| `WOVI_TOKEN_ADDRESS` | empty | $WOVI. Read from the pot when empty. |
| `WOVI_TOKEN_RPC_URL` | the public node | Robinhood Chain RPC for every read. |
| `WOVI_BUY_URL` | empty | The "How to buy" link (https only). Empty: "Buy link coming". |
| `WOVI_EXPLORER_URL` | `https://robinhoodchain.blockscout.com` | Where addresses and transactions link. |
| `WOVI_KEEPER` | empty | `off` stops the keeper whatever else is set. |
| `WOVI_KEEPER_KEY` | empty | The keeper wallet's key. A fresh wallet holding a little ETH for gas, nothing else. |
| `WOVI_KEEPER_RPC_URL` | the read RPC | A node for sending. |
| `WOVI_KEEPER_EVERY_MINUTES` | 15 | How often it looks. |
| `WOVI_KEEPER_MIN_GAS_ETH` | 0.0005 | The gas floor: under it the keeper sends nothing and the owner's card says so. |
| `WOVI_KEEPER_MAX_GWEI` | 0.5 | Refused above this gas price. |
| `WOVI_KEEPER_DAILY_GAS` | 8,000,000 | Gas units a UTC day may use. |
| `WOVI_KEEPER_MIN_SWEEP_ETH` | 0.0002 | The least a sweep must move. |
| `WOVI_HOLDER_MIN` | 1,000,000 | Whole $WOVI across a person's linked wallets for the badge. |
| `WOVI_HOLDER_CREDITS` | empty | Monthly holder credits per tier: `min:credits` pairs in whole $WOVI, no thousands separators, for example `1000000:100,10000000:400`. One bad pair turns the whole list off. |
| `WOVI_HOLDER_CREDITS_ORDER` | `after_paid` | `before_paid` spends holder credits before paid credits. |
| `WOVI_HOLDER_CHECK_HOURS` | 6 | How often every linked wallet is read again for the badge. |
| `WOVI_PAY_WITH_WOVI` | empty | `on` opens Pay with $WOVI. |
| `WOVI_PAY_TOKENS_PER_CREDIT` | empty | A fixed price in whole $WOVI per credit. Empty: priced from the market. |
| `WOVI_TOKEN_ETH_USD_FEED` | Chainlink ETH/USD on Robinhood Chain | For market prices. |
| `WOVI_PAY_MIN_CONFIRMATIONS` | 3 | Blocks before a payment counts. |

The homepage is built ahead of time, so its `$WOVI` link in the header follows the settings at build time; `/token`
itself reads them on every request.

## The page (`/token`)

Three states, from the chain:

- **Before the contracts** (`WOVI_TOKEN_PAGE=on`, no burn pot): coming soon, how the burn works, the own-risk line.
- **Deployed, not launched** (the burn pot set, its `token()` still zero): the burn pot and the fee address with copy
  and explorer links, "Not launched yet" for the token, no numbers.
- **Live**: burned so far (tokens and ETH spent), the number of burns, supply now and at launch, the burned share,
  the next burn from `preview()` (ETH and $WOVI waiting, when, or ready now), the latest burns with links to their
  transactions, the three addresses, what $WOVI does in the app (only the parts switched on), how to buy, and the
  own-risk line.

The copy says only that part of every trade's fee buys $WOVI on the market and burns it, so the supply only goes
down. It never shows how the fees are shared and never names the launchpad. The own-risk line: crypto is volatile,
nothing is financial advice, $WOVI gives no ownership, profit share or other rights, credits are for running agents
only.

**Light on the node.** The pot's numbers and the supply are read at most once a minute for every visitor together,
one read in flight. The burn logs are read only when the pot's `burnCount` says there is a burn not seen yet, from
where the last read stopped (`WOVI_BURN_POT_BLOCK` the first time), at most 20 spans of 100,000 blocks a look, a span
halved when the node refuses it. The newest 50 burns are kept. When the node does not answer, the last good reading
is shown for up to six hours, marked as being refreshed; with none, the page says the chain did not answer. Never
zeros for something that has not started.

**Supply at launch** is the supply first read before any burn; read later, today's supply plus what the pot has
burned (anyone else burning their own $WOVI would make that lower than the real launch supply).

## The keeper

An in-process job (`src/instrumentation.ts` starts `jobs.ts` when the burn pot is set) that keeps fees moving and
burns happening. It sends exactly two calls, both with no value: `sweep()` on the fee address and `burn(0)` on the
burn pot. It never holds or moves funds other than paying gas, and the wallet has no power over either contract.

Every run, one at a time:

1. A transaction sent before and not seen mined is looked up first. After 30 minutes without a receipt it is written
   off as lost. While one is out nothing new is sent.
2. The node must be Robinhood Chain (4663), the keeper wallet must hold at least the gas floor, and the gas price must
   be under the cap.
3. Sweep: what `sweep()` would split now is asked with a call (nothing sent); from the sweep minimum up it is sent.
4. Burn: when `preview()` says ready, `burn(0)` is sent. The pot caps it at 1% of the market's depth and keeps its own
   30 minutes between burns.

Each transaction's gas is the node's estimate plus a quarter, refused past the day's gas cap or the wallet's balance;
the fee is the block's base fee, at most twice it, no tip. It is signed and written down with its hash before it is
broadcast, so a crash never sends twice. A send the node refuses outright is forgotten at once. Nothing new is sent
while the server is stopping. The key is read only in `keeper-chain.ts`; it is never logged, shown or put in an error,
and every message is scrubbed of node addresses and anything key-like.

**The owner's card** (`/app/settings/token`, owners of WOVI only, next to x402 in Settings): on or off and what is
missing, the gas wallet's balance against the floor (blaze when it is under), the last run and what it did, sweeps
and burns with their last transactions, a transaction still out, ETH swept, gas today against the cap, failures and
the last error, "Run the keeper now"; the holders (people linked, holders, last check, this month's snapshot) with
"Check holders now"; and the token as the public page reads it, with what was paid in $WOVI.

## Holders

A person links wallets to their account by signing a message (no transaction; [accounts.md](accounts.md)). Their
holding is the $WOVI across all their linked wallets, read with `balanceOf`, exact in wei.

- **The badge** shows from `WOVI_HOLDER_MIN`. It is read when a wallet is linked or unlinked and again for everyone
  every `WOVI_HOLDER_CHECK_HOURS`, all wallets at one block. Pages read the stored status, never the chain. Others
  see only the badge (a sparkle on the avatar, "$WOVI holder" on the account and credits pages); the balance is shown
  to the person alone. A wallet the node did not answer for counts as nothing that time, so a gap never makes someone
  a holder.
- **Holder credits** (with `WOVI_HOLDER_CREDITS`): once a month, a snapshot reads every linked wallet at ONE block, so
  a token sits in exactly one wallet and counts once however it is moved around. Each person's total picks the
  highest tier it reaches (the top tier is the cap); that many credits go into their personal workspace as holder
  credits for the month, one grant per person and month. The month's snapshot is the first hourly check in it that
  finds someone at a tier; until then nothing is kept. Someone who links after it waits for the next month, because
  a second read could count tokens already counted in another wallet. The snapshot is written before any grant, so a
  crash halfway finishes from the same numbers. Many wallets on one account add up to one allocation.
- **At a month's end** the hourly job writes off what is left of the last month's holder credits.

Holder credits are a perk for using WOVI, never a return for holding: they run agents and nothing else, never move,
swap or pay out, and expire at the end of their month ([credits.md](credits.md)).

## Paying for credits with $WOVI

From the product doc's "$WOVI or stablecoin for crypto users". No custody: WOVI never holds the tokens.

1. **The price.** An owner or admin picks a pack (500 to 5,000 credits). It is priced in $WOVI at the fixed rate, or
   from the market: the Pons curve's reserves (or the v4 pool's price after graduation) times Chainlink's ETH/USD,
   rounded up to the wei:
   `wei = ceil(credits x 10,000 micro-dollars x 10^38 / (wei of ETH per $WOVI x USD per ETH with 8 decimals))`.
   One credit stays one cent, so a run's price never moves with $WOVI. The price is single use and lasts ten minutes.
2. **The transfer.** Their own wallet sends one plain $WOVI transfer to the burn pot (the wallet is moved to Robinhood
   Chain first, added when it does not know it). The pot burns every $WOVI it holds with its next burn.
3. **The check**, read only, like x402: the transaction is on Robinhood Chain and succeeded, has enough
   confirmations, was mined inside the price's window (two minutes of clock skew before, fifteen of grace after for
   the check itself), and holds $WOVI Transfers from one of the person's linked wallets to the burn pot. The credits
   are the price's credits for what was sent at the price's own rate, rounded down (less than one credit is refused).
   Each transaction counts once ever (its id is the chain and the hash) and each price once; the same claim again
   answers the same and writes nothing new. A node that does not answer, a transaction not mined yet and too few
   confirmations say "try again" and the screen asks again every two seconds; a transaction hash can also be pasted.
4. The credits land as paid credits ("Paid with $WOVI") in the workspace the price was made for.

A transfer that came too late or too early is refused and stays with the burn pot (it burns); the screen says to
contact support with the transaction.

## Wallets on phones

A phone browser has no wallet in it. The wallet buttons then open the same page inside MetaMask's own browser
(`https://metamask.app.link/dapp/<host><path>?link=wallet`, the path and query carried over), where a wallet link
starts again by itself; the person signs in there with their email code first. Pay with $WOVI opens the credits page
there the same way. A desktop with no wallet opens MetaMask's download page. A phone
is a coarse pointer and a phone's user agent together, read at the tap.

## Tests

`src/lib/token/token.test.ts`, `src/lib/token/holders.test.ts`, `src/lib/credits/holder-credits.test.ts` and the wallet
tests in `src/lib/accounts/wallets.test.ts`, all on a pretend chain and memory stores:

- settings: all off with nothing set, the page switch, amounts on the digits, tiers parsed and refused whole, holder
  thresholds and tiers exact to one wei, the keeper's switch and what it needs, scrubbing;
- the page: the three states, a read at most once a minute for everyone, logs only for a new burn, the last reading
  when the chain is silent, spans halved on a refusal;
- the keeper: a sweep and a burn written down before they are sent, gas plus a quarter and the fee cap, nothing below
  the sweep minimum or before `preview()` says ready or before the launch, another chain, a gas price over the cap and
  a wallet under its floor refused, the day's gas cap, a transaction still out and one lost after half an hour, a
  refused send forgotten, one run at a time;
- holders: status from all linked wallets exact to one wei, linking and unlinking (addresses in any case), nothing
  before the launch or while the chain is silent; holder credits from one snapshot at one block, a token counted once
  however it moves, a snapshot finished from its own numbers after a crash, no snapshot kept while nobody reaches a
  tier, last month written off and the new month granted;
- paying: exact prices both ways, off and its refusals, a payment counted once at the price's rate (the same claim
  again, another price, another transaction), the fixed rate, every refusal (not mined, too few confirmations,
  another chain, failed, another wallet, another address, another token, too early, too late, too little, someone
  else's price, junk, a silent chain) with the price still usable after, a part payment and an old price;
- holder credits in the ledger: one grant per person and month, spend order both ways, give-backs to their pool,
  refusals, corrections and x402 on paid credits only, refunds to their month, expiry at the month's end with holds
  across it, every balance adding up, runs and pipelines on holder credits through the app;
- wallets: a replayed signature refused, one message per challenge, the same wallet in any case.

## Rehearsal on a fork (how the screenshots were made)

```
anvil --fork-url https://rpc.mainnet.chain.robinhood.com --port 8652 --block-time 2 --block-base-fee-per-gas 20000000
# throwaway wallets, funded with anvil_setBalance; the keeper given 0.01 ETH
WOVI_DEPLOY_RPC=http://127.0.0.1:8652 contracts/token-deploy.sh <deployer> <launcher> <owner>
# the server with WOVI_TOKEN_RPC_URL=http://127.0.0.1:8652, the two addresses, a throwaway WOVI_KEEPER_KEY,
# WOVI_HOLDER_CREDITS, WOVI_PAY_WITH_WOVI=on and WOVI_BUILDER_EMAILS=maya@example.com
node scripts/token-screens.mjs deployed
WOVI_DEPLOY_RPC=http://127.0.0.1:8652 WOVI_LAUNCH_FILE=<launch.json with https links> contracts/token-launch.sh
# trades on the curve (buy(uint256,uint256,address) on splitter.curve()), and the "user" wallet buys some $WOVI
FORK_RPC=http://127.0.0.1:8652 FORK_KEYS=<the throwaway key list> node scripts/token-screens.mjs pay
# evm_increaseTime past 30 minutes, the keeper (Run the keeper now, or the schedule), more trades, again
FORK_RPC=http://127.0.0.1:8652 FORK_KEYS=<the throwaway key list> node scripts/token-screens.mjs live
```

The script drives a wallet injected into the page, answered by the throwaway key on the local fork only, and checks
that a phone with no wallet is sent to MetaMask's link. Paying runs before the clock is moved forward: a payment is
checked against its price's window by the block's time. Screenshots go to `~/WOVI-token-screens/`. Kill anvil when
done.

## Later

- Holding time in the tiers (the doc's "tiered by holding size and holding time") and per-person caps across accounts
  (linking is one wallet to one account; one person with several accounts is not caught).
- A snapshot day the owner picks instead of the first hourly check of the month.
- Swapping credits to $WOVI and creator payouts, after the legal check.
- Smart contract wallets (EIP-1271) for linking.
- The `$WOVI` header link following the settings without a rebuild.
