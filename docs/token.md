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

- Anyone may call `burn()`; WOVI's keeper does on a schedule (the keeper is part of phase 17).
- At most once every 30 minutes, at most 1% of the market's ETH depth per burn, and on the pool a hard price limit,
  so buying before a burn and selling after it loses money.
- Small amounts (under 0.001 ETH) wait, but never more than 24 hours.
- It buys on the Pons bonding curve before graduation and in the Uniswap v4 pool after.
- Every burn checks that the total supply fell by exactly what was burned, or it reverts.

## Commands (on deploy day, phase 21)

Each asks for one key, at forge's own prompt, where nothing shows. Arguments are public addresses.

```
contracts/token-deploy.sh <launcher wallet> <owner wallet>   # the burn pot and the splitter, checked
contracts/token-launch.sh                                    # launches $WOVI from the launcher wallet
contracts/owner-payee.sh                                     # only if the owner wallet ever moves its share
```

`WOVI_DRY=1` stops each one before the key (a dry run with the cost). `WOVI_DEPLOY_RPC=<a local fork>` rehearses on a
fork.

The launcher wallet deploys both contracts and launches the token; it has no other power. The owner wallet receives
the owner share.

## Before launch

- `contracts/launch.json`: the name, ticker, logo, description and links. The website and X links are placeholders
  until the real domain and account exist (phase 20).
- The site needs the two addresses and the keeper (phase 17).

## Tests

```
cd contracts && forge test
```

Unit tests for both contracts, invariant tests under random call sequences, and a fork test that launches $WOVI on a
copy of Robinhood Chain against the real Pons: the tax, the split reaching both destinations, and the supply falling
after a burn. `RPC_URL=""` skips the fork test.
