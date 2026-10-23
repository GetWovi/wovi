# Credits (phase 13)

From the product doc: pay-per-run credits, one currency inside the product, card top-ups for owners, "Show cost in credits before running anything expensive", "Budget per run", "automatic credit refund when a run fails", and "Non-holders (decided for now): no free credits". Swapping credits and paying out tokens wait for the legal check, so neither exists here.

This phase builds that on the run engine (3), accounts and the policy (4), the builder's bench (6), the app (9), pipelines (10), review (11) and the quality gate (12). Nothing here calls a real model, takes a real payment or moves money. Tests and screenshots run on the fake provider and the test payment provider.

The code lives in `src/lib/credits/`.

| File | What it holds |
|---|---|
| `config.ts` | Every decision in one object, `CREDITS`, plus words for amounts and prices. Client-safe. |
| `pricing.ts` | The math: credits for a cost, the estimate, the charge, the month. Whole numbers only. |
| `types.ts` | The ledger entry, top-up, limits, a run's and a pipeline's credits, and the charge as screens show it. Client-safe. |
| `credits.ts` | `Credits`: the ledger, holds, the engine's hooks, pipelines, top-ups, grants, support entries, history. |
| `payments.ts` | The `PaymentProvider` interface and the test provider. |
| `guard.ts` | `GuardedCredits`: every call names its caller; the phase 4 policy decides. |
| `store.ts` | Three tables on the shared `Collection` interface (`.data/credits.json`): `ledger`, `topUps`, `limits`. |
| `local.ts`, `server.ts` | One service per process, shared by the run engine and pipelines; the guarded one for the app. |
| `credits.test.ts` | The tests (below). |

The engine side is `src/lib/runs/billing.ts` (the `RunBilling` hook); the pipeline side is `PipelineBilling` in `src/lib/pipelines/engine.ts`. Engines without a hook bill nothing, as before.

## The decisions (config.ts)

| Setting | Default | Meaning |
|---|---|---|
| `microUsdPerCredit` | 10,000 | One credit is a fixed $0.01. No floating price. |
| `marginMultiplier` | 2.5 | A run costs its real model cost times this. |
| `minCreditsPerRun` | 1 | Every finished run costs at least this. |
| `estimateHeadroom` | 1.5 | The estimate is the typical cost times this. |
| `typicalCost` | 5 runs, last 50 | The typical cost is the middle cost of the agent's last 50 finished runs once it has 5; before that, one full answer at its main model. |
| `chargeFailedRuns` | false | Failed and cancelled runs give back everything. |
| `packs` | 500, 1,000, 2,500, 5,000 | Top-up packs in credits. |
| `minTopUpCredits` | 500 | The smallest top-up: $5. Anything smaller is refused with "The smallest top-up is 500 credits ($5.00)." |
| `maxMonthlyLimit` | 10,000,000 | The highest limit an owner can set. |
| `swappable` | false | Credits never turn into tokens or money, either way. |
| `starterCredits` | 0 | Non-holders get no free credits. |
| `holderSpendOrder` | `after_paid` | Which pool a run takes from first (phase 17). `WOVI_HOLDER_CREDITS_ORDER=before_paid` spends holder credits first. |
| `enabled` | true | Off (or `WOVI_CREDITS=off`) turns billing off for the local app. |

## Pricing

```
credits for a cost = max(1, ceil(cost in micro-dollars x 2.5 / 10,000))
estimate           = credits for min(spend cap, typical cost x 1.5)
charge             = min(estimate held, credits for the real cost)
```

So a run that really cost $0.004 is 1 credit, and $0.004001 is 2. A Hook Writer run on the fake provider shows "About 4 credits" and is charged 2.

**The estimate is a ceiling.** The form shows it before the run. The form sends the number it showed (`quotedCredits`), and the run holds the lower of that and the current estimate, so a run is never charged more than what the person saw. When a run costs more (a long answer, quality-gate rewrites, a repair), the charge stops at the estimate; when it costs less, the rest comes back.

## The ledger

Append-only, per workspace. The balance is the sum of the entries.

| Kind | Amount | When |
|---|---|---|
| `top_up` | + | A payment provider said paid (Stripe's verified webhook for cards), an x402 payment (phase 15), $WOVI sent to the burn pot (phase 17), or a stablecoin (USDG by default) or ETH sent to WOVI's address. Test top-ups are marked `test`. |
| `grant` | + | Credits given, one per source id: support (paid credits), or a $WOVI holder's monthly holder credits (phase 17, `grantHolder` only). |
| `hold` | - | The estimate, held when a run or pipeline starts. |
| `release` | + | Gives a hold back: all of it when the run ends (paired with the charge), or part of a pipeline's hold per step. Its reason: settled, failed, cancelled, step, ended. |
| `charge` | - | What a finished run really cost, never more than it held. Keeps the real model cost for support. |
| `refund` | + | A charge given back afterwards, once per run (support). |
| `adjustment` | +/- | A correction with a note (support), a withdrawal (`withdraw:<top-up>`) or a card refund (`refund:<top-up>:<share>`). Paid credits only. |
| `expire` | - | Holder credits left at the end of their month (phase 17). |

A run that held 4 and cost 2 writes `hold -4`, then `release +4` and `charge -2` together: 2 spent, 2 back. A failed run writes `release +4` and nothing else.

- **Idempotent.** Every entry has a key that is unique in its workspace (`hold:run:<id>`, `charge:run:<id>`, `topup:<id>`, `grant:holder:<person>:<month>`, `wovi:<chain>:<transaction>`, `chain:<chain>:<transaction>`, `expire:holder:<month>:<n>`). Writing a key again returns the first entry; the same key with another amount is refused (`conflict`).
- **Never negative.** Writes for one workspace run one at a time, and the balance check and the write are one step. Any entry that would take the balance below zero refuses the whole write (`not_enough_credits`). Every entry stores the balance after it.
- In Postgres: a unique index on `(workspace_id, key)` and a row lock on the workspace per write.

## Holder credits (phase 17)

A second pool beside paid credits, never mixed with it. The product doc: "spendable on agents only, never swappable
or withdrawable, and they expire, so they cannot be cycled back into tokens." How holders get them is in
[token.md](token.md#holders); this is how the ledger keeps them.

- **Every entry carries its holder part.** `holder` is the part of `amount` that is holder credits (same sign, never
  more than the amount) and `period` the month it belongs to ("2026-10", UTC); the rest is paid. Rows from before
  phase 17 have none and are all paid. So the paid balance is the sum of `amount - holder`, and each month's holder
  balance the sum of `holder` for that month. `balanceAfter` stays the whole.
- **Only `grantHolder` brings them in**: one grant per person and month (`grant:holder:<person>:<month>`), for the
  current month only, into the person's personal workspace, with `expiresAt` at the month's end. The support grant
  refuses the holder source. Top-ups, x402, $WOVI payments, adjustments and refunds of paid charges are paid credits,
  so support can never take holder credits away or turn them into anything.
- **Spendable** is paid credits plus this month's holder credits. Holder credits from a month that has ended do not
  count, even before they are written off. Both pools together must cover a hold, and neither pool may ever go below
  zero (the write refuses it, like the whole balance).
- **Spend order.** A hold takes from the two pools in the configured order: after paid credits by default (paid first,
  holder credits for the rest), or before them (`WOVI_HOLDER_CREDITS_ORDER=before_paid`). The hold records its holder
  part and month.
- **Give-backs go home.** A run's release gives back each pool what it took; its charge takes from the hold's two
  parts in the same order. A pipeline step is charged inside the pipeline's hold the same way, and the end of a
  pipeline gives back what is left of each part. A refund of a charge returns to the pool and month the charge came
  from.
- **Expiry.** What is left of a month's holder credits is written off by an `expire` entry once the month has ended:
  before the next hold or holder grant in that workspace, and by the hourly holder job. A hold made in one month and
  ended in the next is charged from its own month's holder credits, and what it gives back is written off afterwards
  (a month can expire more than once, each with its own key).
- **On screens**: the Available tile says how much is paid and how much is holder credits; a Holder credits panel shows
  this month's, until when, the two pools side by side and the rules in plain words; history shows a grant ("Holder
  credits for October 2026"), an expiry, and how much of a run was holder credits. Holder credits count toward monthly
  limits like any spend.

## Paying with $WOVI (phase 17)

Owners and admins can buy a pack with $WOVI sent from a linked wallet to the burn pot, checked on chain read only
([token.md](token.md#paying-for-credits-with-wovi)). It lands as a `top_up` of paid credits keyed by the transaction
(`wovi:4663:<hash>`), once ever per transaction.

## Runs

1. **Submit.** After every other check (agent, inputs, Brand Brain, confirmations, spend cap), the engine asks billing to hold the estimate. Not enough credits (`not_enough_credits`: "This needs 4 credits. The workspace has 0 credits.") or a monthly limit (`over_limit`) refuses the run before anything is queued.
2. **End.** Succeeded: charged its real price up to what it held, the rest released. Failed or cancelled: everything released. Settling twice changes nothing.
3. **Recovery.** A run that ended but was never settled (a crash in between) is settled by `recover()` on the next start.

The quality gate's rewrites (phase 12) are calls inside the same run, so they are inside the same hold. Change requests (phase 11) start new runs, charged to the person who asked (a client's goes to the workspace). Quick edits are new runs like any other.

**Builder bench runs never cost credits.** The bench submits with `billing: { free: "bench" }`; only the bench sets it, and `GuardedRuns` drops whatever billing a caller passes except the quoted estimate.

## Pipelines

- **Submit** holds one estimate for the whole chain: every step's own estimate, twice for a step that may rewrite (`onFail.rewrite`), never above what the pipeline's spend cap allows plus a credit of rounding per run. Not enough credits or a limit refuses the pipeline before any step runs.
- **Per step.** Each step run reserves its part of the pipeline's hold (its own estimate, or what is left) and is charged inside it: a `release` of the charge from the pipeline's hold and the `charge`, together. A failed step costs nothing. The step's rewrite run is charged the same way, inside the same hold.
- **The end.** Ready, failed or cancelled: what the steps did not use comes back. Steps that finished keep their charge, since their output is kept and reused.
- **Retry** holds again, for the steps it still has to run. The run keeps every hold it made (`credits.holdIds`), and its totals add them up.

Total charged is never above the holds, and each hold is never above the estimate shown for it.

## Monthly limits

Owners and admins set, per calendar month (UTC):

- a limit for the whole workspace;
- a limit per member.

Use this month is charges minus refunds this month, plus whatever is held right now. Both limits are checked at submit, for runs and pipelines; a run that would pass one does not start ("This would pass your monthly limit of 300 credits. You have used 296 credits this month."). Pipeline steps are covered by the pipeline's hold, so they are not checked again. Empty means no limit. Only members of the workspace can have one.

## Top-ups

`PaymentProvider` has two methods: `checkout` (paid now, pending with a redirect, or failed) and `confirm` (for a webhook later). A top-up row records the pack, the price in cents, the provider, its reference, whether it is a test, and its status; the ledger entry lands once, when it is paid.

- **The test provider** says paid at once and moves no money. It is on for a local app (`WOVI_APP_URL` on localhost, the default), or with `WOVI_TEST_PAYMENTS=on` on a server that is not running in production, and off with `WOVI_TEST_PAYMENTS=off`. A production server off localhost never gets it, whatever the switch says. With no real provider there, top-ups are closed ("Top-ups are not open yet."), so a deployed site never hands out credits for nothing.
- Every test top-up says so: the "Test payments" badge, the test-mode note, "test, not charged" on each pack, "Test" in the history and "no money moved" in the toast.
- Packs only, from 500 credits. With an idempotency key (one per button press), a second call returns the first top-up.
- **Stripe** (card) is the real provider behind the same interface once it is set up; then the test provider is gone. A stablecoin (USDG by default) and ETH on Robinhood Chain are checked on chain instead (below).

## Card top-ups (Stripe)

From the product doc: "card or other fiat rails for owners with no wallet" and "Non-holders ... pay by card from their first job". The code is `src/lib/credits/stripe.ts` (settings, the provider, the webhook, the refund), `src/lib/credits/stripe-server.ts` and the route `src/app/api/stripe/webhook/route.ts`. It uses the official `stripe` package (23.0.0, API version `2026-09-30.endive`). Off until both secrets are set; with no key the card button does not show.

1. **Pay.** An owner or admin ticks the purchase consent (phase 18) and presses "Buy and pay $X". A pending top-up row is written with the consent, then a Checkout Session for that pack: mode `payment`, USD, the pack's price (inline, or the Stripe Price in `STRIPE_PRICE_<pack>`), the product line "WOVI credits: 1,000", the top-up id as `client_reference_id` and in the metadata with the workspace and the pack, the statement suffix, success and cancel links back to `/app/credits`, a 31-minute expiry, and Stripe's idempotency key `wovi-checkout-<top-up>` so a retry is one session. The buyer goes to Stripe's own page; no card number ever reaches WOVI.
2. **Back.** `/app/credits?paid=<session>` only says "your credits land as soon as Stripe confirms the payment" and looks again every two seconds for half a minute. Coming back grants nothing, and the provider's `confirm` never says paid.
3. **The webhook.** `POST /api/stripe/webhook` checks the `Stripe-Signature` header with `STRIPE_WEBHOOK_SECRET` (Stripe's own `constructEvent`, five minutes of tolerance) before anything else; a bad or missing signature, a changed body, another secret or an event from the other mode (live at a test key, or the other way) is a 400. Each event id is handled once (`.data/stripe.json`). `checkout.session.completed` (and `checkout.session.async_payment_succeeded`) with `payment_status: paid` lands the credits once per top-up (`topup:<id>`), after checking that the session is the top-up's own, a payment, in USD, for exactly the pack's amount and the pack's credits; anything else is written to the log and not counted. With Stripe's Adaptive Pricing the buyer may pay in another currency; the session then keeps the USD original in `currency_conversion`, which is what is checked, and the top-up keeps what was really charged (`payment`). `checkout.session.expired` and `checkout.session.async_payment_failed` fail a pending top-up; a paid one stays paid. A failure while handling answers 500, so Stripe sends the event again.
4. **Refunds.** A withdrawal within 14 days (phase 18) takes the unused credits off and writes the money down as owed. On Reports and refunds the owner presses "Refund to the card through Stripe": Stripe's refund API refunds the share of what the buyer paid for those credits (idempotency key `wovi-refund-<owed row>`), and the owed row is marked paid with Stripe's refund id. Stripe then sends `charge.refunded`, which takes the refunded share of the top-up's credits off the balance minus what a withdrawal or an earlier refund already took (`adjust:refund:<top-up>:<share>`), so a refund made from Stripe's dashboard is handled too and nothing is taken twice. Credits already spent stay spent and the note says how many; it never goes below zero. A later withdrawal from the same purchase only gives back what a refund did not.
5. **Words.** WOVI's pages and receipts say "WOVI" and the contact address only. The product line on Stripe's page uses `STRIPE_BUSINESS_NAME` (default "WOVI"); the card statement reads the account's shortened descriptor, then `STRIPE_STATEMENT_DESCRIPTOR` (default "WOVI") as the suffix (Stripe takes only a suffix for cards). Stripe errors are reduced to their type, code and status, never the key.

| Setting | Default | What it does |
|---|---|---|
| `STRIPE_SECRET_KEY` | empty: off | `sk_live_...`, or `sk_test_...` for test mode (every screen then says "Stripe test mode"). A restricted key (`rk_`) with Checkout Sessions and Refunds set to write also works. |
| `STRIPE_WEBHOOK_SECRET` | empty: off | The endpoint's signing secret, `whsec_...`. |
| `STRIPE_STATEMENT_DESCRIPTOR` | WOVI | The statement suffix: 2 to 22 characters, a letter at least, none of `< > \ ' " *`. Anything else falls back to WOVI. |
| `STRIPE_BUSINESS_NAME` | WOVI | The name on the product line of Stripe's page. |
| `STRIPE_PRICE_500`, `_1000`, `_2500`, `_5000` | empty: inline prices | Stripe Price ids per pack. The webhook still checks the amount against the pack. |
| `STRIPE_API_BASE` | empty | A stand-in for Stripe's API on this machine (the screenshot script, stripe-mock). Read only when `WOVI_APP_URL` is local. |

### Setting Stripe up (the owner, once)

1. **Public details** (Settings, Business, Public details): public business name `WOVI`, statement descriptor `WOVI`, shortened descriptor `WOVI`, support email `hello@wovi.fun`, website `https://wovi.fun`. Leave the optional support phone and address empty where Stripe allows it: Stripe prints public details on its page and receipts, and WOVI shows no name but WOVI. Card statements then read `WOVI* WOVI`; set `STRIPE_STATEMENT_DESCRIPTOR=CREDITS` for `WOVI* CREDITS`.
2. **Branding** (Settings, Branding): WOVI's icon and colours for Stripe's page.
3. **Payment methods** (Settings, Payments, Payment methods): cards on (Apple Pay and Google Pay ride on cards). Methods that confirm later also work (the async events), but cards are enough.
4. **Optional, euros and other currencies:** Settings, Payments, Adaptive Pricing on. Buyers see and pay their own currency; WOVI still prices and checks in USD.
5. **Customer emails** (Settings, Customer emails): turn on "Successful payments" and "Refunds" if Stripe should send its own receipts (with the public details above).
6. **API key** (Developers, API keys): copy the secret key, or make a restricted key with Checkout Sessions: write and Refunds: write.
7. **Webhook** (Developers, Webhooks, Add destination): your account's events, endpoint URL `https://wovi.fun/api/stripe/webhook` (the server's own `WOVI_APP_URL` plus `/api/stripe/webhook`), and these five events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`. Copy its signing secret.
8. **The server:** set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` (and any optional settings above), then restart. The owner's $WOVI page shows the card status, the webhook URL and the events.
9. **Try it in test mode first:** a `sk_test_` key, a test-mode webhook with its own secret (or locally `stripe listen --forward-to localhost:3900/api/stripe/webhook`, which prints a `whsec_`), and Stripe's test card 4242 4242 4242 4242 with any future date and any CVC. Then swap in the live key and the live webhook's secret.

## Stablecoin and ETH top-ups (Robinhood Chain)

From the product doc's "$WOVI or stablecoin (including x402) for crypto users". The code is `src/lib/chainpay/` (`config.ts`, `chain.ts`, `pay.ts`, `store.ts` in `.data/chainpay.json`, `local.ts`) and `src/components/credits/PayWithChain.tsx`. The same shape as paying with $WOVI and x402: no custody, no key, every check read only.

**The stablecoin is USDG out of the box.** Robinhood Chain's official token page (docs.robinhood.com/chain/contracts) lists one stablecoin, USDG at `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`, and no USDC, and the issuer's own list of USDC contract addresses does not include Robinhood Chain (both checked on 2026-10-23). So the stablecoin defaults to USDG on chain 4663, and another one (USDC once it exists there) is one setting away. Whatever it is, it is treated one to one with the US dollar, like USDC would be.

**Read and checked at start.** The stablecoin's symbol and decimals are never taken from settings. When the server starts (and before the first price), WOVI reads `symbol()` and `decimals()` from the token and the RPC's chain id, and offers the stablecoin only when the RPC is Robinhood Chain, the symbol is a short plain word, the decimals are 2 to 18 (so a cent is a whole number of units) and, when set, they match `WOVI_STABLECOIN_SYMBOL` and `WOVI_STABLECOIN_DECIMALS`. A good answer is kept; a failed one is logged with the reason, shown on the owner's page, and tried again after a minute. A page waits at most three seconds for the read. Until then the stablecoin shows "Not available right now" and ETH still works. Every screen, price, top-up, history line, receipt and owed row uses the symbol the token reported (USDG), and the section is called "Pay with USDG or ETH".

1. **The price.** An owner or admin ticks the purchase consent, picks the stablecoin or ETH and a pack (500 to 5,000 credits). The stablecoin is one to one with the dollar in its own decimals (USDG has six: 500 credits are 5,000,000 units, 5 USDG). ETH is priced from Chainlink's ETH/USD feed on Robinhood Chain (`0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9`, 8 decimals, refused when older than 26 hours), rounded up to a whole gwei so the amount is short enough to read: `wei = ceil(credits x 10,000 micro-dollars x 100 x 10^18 / USD per ETH with 8 decimals)`, then up to the next multiple of 10^9. The price is single use, lasts ten minutes and keeps the consent word for word, with the symbol and decimals it was made in.
2. **The payment.** The person's own wallet sends it from a linked wallet (MetaMask; a phone with no wallet opens the page inside MetaMask, like the other wallet buttons): a plain stablecoin `transfer` to WOVI's receiving address, or plain ETH to it. The wallet is moved to Robinhood Chain first. A transaction hash can also be pasted.
3. **The check**, read only: Robinhood Chain (4663), succeeded, at least `WOVI_PAY_MIN_CONFIRMATIONS` blocks, not mined more than two minutes before the price; for the stablecoin the token's Transfer logs from a linked wallet to the receiving address, for ETH the transaction's own value from a linked wallet straight to it. Each transaction counts once ever (`4663:<hash>`), and never if x402 already took it (both may use the same address; x402 also refuses a transaction counted here). Each price counts once. A node that does not answer, a transaction not mined yet and too few confirmations say "try again", and the screen asks every two seconds.
4. **What it becomes.** Mined inside the price's ten minutes: a paid top-up (`provider` stable or eth, the consent, the asset and its symbol, amount, wallet and transaction on `topUp.chain`) and one ledger entry (`chain:4663:<hash>`, "Paid with USDG, 500 credits"), for the price's credits for what was sent at the price's own rate, rounded down. Less than the price adds fewer credits, more adds more, as with $WOVI. Mined after the price ran out, or worth less than one credit: no credits, and the whole amount is written down as owed back to the wallet it came from (a `chain_payment` row in `safety.json`, on Reports and refunds with the exact amount, symbol and address). A price can still be checked for seven days after it ran out, so a payment made in time but checked late (a closed tab) still counts.
5. **Withdrawal.** Like any purchase, within 14 days: the unused credits leave, and the same asset in proportion is owed back to the paying wallet. The owner sends it from their own wallet and marks it paid.

| Setting | Default | What it does |
|---|---|---|
| `WOVI_PAY_TO` | empty: `WOVI_X402_PAY_TO`; both empty: off | WOVI's receiving address. |
| `WOVI_STABLECOIN_ADDRESS` | empty: USDG (`0x5fc5...d168`) | The stablecoin on Robinhood Chain. `off` offers none. A malformed address turns it off and the owner's page says why. |
| `WOVI_USDC_ADDRESS` | empty | The older name of `WOVI_STABLECOIN_ADDRESS`, still read when that one is empty. |
| `WOVI_STABLECOIN_SYMBOL` | empty: any | The symbol the token must report on chain (for example `USDC`), else it is not offered. |
| `WOVI_STABLECOIN_DECIMALS` | empty: any from 2 to 18 | The decimals it must report on chain. |
| `WOVI_PAY_ETH` | on | `off` hides ETH. |
| `WOVI_PAY_RPC_URL` | then `WOVI_TOKEN_RPC_URL`, `WOVI_X402_RPC_URL`, then the public node | Robinhood Chain RPC for the checks, the stablecoin's read and the feed. A paid node is better in production. |
| `WOVI_PAY_ETH_USD_FEED` | Chainlink ETH/USD on Robinhood Chain | Another feed with the same interface. |
| `WOVI_PAY_MIN_CONFIRMATIONS` | 3 | Blocks before a payment counts. |

To switch to USDC once its issuer or Robinhood Chain lists it: `WOVI_STABLECOIN_ADDRESS=<its address>` and `WOVI_STABLECOIN_SYMBOL=USDC`, then restart. Prices made before keep their own asset.

The owner's $WOVI page shows both: the card status with the webhook URL and the events, and the stablecoin and ETH with the receiving address, the stablecoin's address with the symbol and decimals read on chain (or why it is not offered), what was paid so far and how many are owed back.

## Who can do what

| | owner | admin | editor | viewer | API key |
|---|---|---|---|---|---|
| See the balance, the estimate before a run, their own limit | yes | yes | yes | yes | yes |
| See what each run was charged, the history, use per member (`see_costs`) | yes | yes | | | admin keys |
| Top up, set limits (`manage_credits`, new) | yes | yes | | | never |

`manage_credits` is new in `policy.ts`. A run's charge is in its public view (`charge`), and the guarded engine and pipelines blank it for anyone who may not see costs. A key's runs count toward the person who made the key.

## Screens

| Where | What |
|---|---|
| The header | The balance as a pill, linking to the credits page; outlined in blaze under 10. On a phone the account moves under Settings to make room. |
| `/app/credits` | Available, held for runs in progress, used this month with the limit; Top up with the packs and the test label; History, one line per run, pipeline run or top-up with what it held, what came back and who; Monthly limits for the workspace and each member; how it works in five lines. Editors and viewers see the balance, their own use and limit, and who to ask. |
| Agent and pipeline forms | "About N credits" beside the run button, and the balance. Without enough credits, or past a limit: a block that says so, with Top up or Change limits for owners and admins and "ask an owner or admin" for everyone else, and the run button off. |
| A result, a pipeline run | "Charged 2 credits of the 4 held, 2 back", "Nothing charged. The 13 credits held came back", or "27 credits held while it runs". |
| History | The credits each run and pipeline run cost, on its row. |
| Settings | A Credits card. |

## Commands

```
npm test                           # everything, on the fake provider
```

Screenshots of this phase (keep `OPENROUTER_API_KEY` empty):

```
WOVI_DATA_DIR=/tmp/wovi-credits-screens OPENROUTER_API_KEY= npm run agents:launch
WOVI_DATA_DIR=/tmp/wovi-credits-screens OPENROUTER_API_KEY= WOVI_FAKE_LATENCY_MS=2500 npm start
WOVI_DATA_DIR=/tmp/wovi-credits-screens OPENROUTER_API_KEY= node scripts/credits-screens.mjs
```

It signs in through the email flow, skips onboarding, runs `scripts/seed-credits.ts` (the team and the example Brand Brains), then does the rest through the screens: the not-enough state at 0, a test top-up, a run that is charged, a run that is stopped, a pipeline, a run left going, and limits. Output goes to `~/WOVI-credits-screens/`.

Screenshots of card, USDG and ETH top-ups (`scripts/pay-screens.mjs`, output in `~/WOVI-pay-screens/`), with throwaway keys only:

```
anvil --fork-url https://rpc.mainnet.chain.robinhood.com --port 8653 --block-time 1 --chain-id 4663
# fund a throwaway "user" wallet on the fork: ETH by anvil_setBalance, and real USDG sent from a holder impersonated
# with anvil_impersonateAccount (anvil_dealERC20 finds no balance slot for USDG; the fork only, nothing is sent on the real chain)
WOVI_PAY_TO=<a throwaway address> WOVI_PAY_RPC_URL=http://127.0.0.1:8653 \
  WOVI_APP_URL=http://localhost:3911 WOVI_BUILDER_EMAILS=maya@example.com npx next start -p 3911
BASE=http://localhost:3911 FORK_RPC=http://127.0.0.1:8653 FORK_USER_KEY=<the user key> WOVI_PAY_TO=<same> node scripts/pay-screens.mjs chain
# cards: a made-up sk_test_ key and whsec_ secret, Stripe's API answered by the script itself
STRIPE_SECRET_KEY=sk_test_<random> STRIPE_WEBHOOK_SECRET=whsec_<random> STRIPE_API_BASE=http://127.0.0.1:12111 ... npx next start -p 3911
BASE=http://localhost:3911 STRIPE_WEBHOOK_SECRET=<same> node scripts/pay-screens.mjs card
```

The fork is read only towards the real chain: every transaction goes to the local fork. Kill anvil when done.

The earlier phases' screenshot scripts run agents from a workspace with no credits. Start the server with `WOVI_CREDITS=off` for those.

## Tests

`src/lib/credits/credits.test.ts` (22 tests), `src/lib/credits/holder-credits.test.ts` (12, phase 17: the holder pool) and the policy table in `src/lib/accounts/policy.test.ts`:

- pricing: rounding up, the minimum, the margin, the estimate under the cap, the charge under the hold, the median; the fixed value, nothing swappable, nothing free, the words;
- the ledger: test top-ups once per key, the minimum and packs only, closed and failing providers, the test provider only locally; keys written once and refused with another amount, never below zero, the grant hook, every balance adding up; racing holds never spending more than the balance;
- runs: hold, charge, the rest back, settled once; refused without enough credits before anything is queued, and the form knowing first; everything back on failure and on cancel; never above the estimate shown, with quality-gate rewrites; the typical cost from finished runs; a run left holding settled after a restart;
- pipelines: one hold, each step charged inside it, the rest back; a step's rewrite inside the same hold; refused without enough credits; a failed step free with finished steps kept, and a retry holding again; cancel giving the hold back;
- limits and roles: workspace and member limits at submit counting holds, lifting them; owners and admins top up and set limits, editors and viewers and keys never; charges shown only to people who see costs; a key's runs counted toward its maker; a change request's new draft charged to the person who asked; bench runs free.

## Later

- Cards through Stripe and a stablecoin (USDG) or ETH on Robinhood Chain are in (above). Agents and software without an account pay per call with x402 since phase 15 ([x402.md](x402.md)): each paid call lands in the `ws_x402` workspace as a top-up of its quote and settles like any run.
- Card disputes (`charge.dispute.created`) are not handled yet: a dispute shows in Stripe's dashboard only. Taking the credits off on a dispute is the next step.
- Prices in euros of WOVI's own (a second price list). Today Stripe's Adaptive Pricing covers buyers who want to pay in their currency.
- The stablecoin from smart contract wallets works (it is a token transfer); ETH sent from inside a contract is not seen.
- Holder credits are in since phase 17 (above). One allocation per account; one person with several accounts is not caught yet.
- Swaps and creator payouts only after the legal check.
- A small starter pack or a low first top-up for new users outside crypto, as the doc says to revisit.
- Credits for MCP and REST calls (phase 14) go through the same guarded engine, so they are billed already.

## Tests for paying

- `src/lib/credits/stripe.test.ts` (13): the settings and descriptor rules; Stripe only when both secrets are set, the test provider never on a production server; the Checkout Session asked for (USD, the pack, WOVI's name and suffix, the links, the expiry, one per top-up by idempotency key, a Stripe Price when set, a refusal without the key in the message); the webhook with Stripe's own signature code (lands once however often it is sent, a bad, missing or foreign signature, a changed body, the other mode, off), a wrong amount, currency, pack, session, top-up or mode never counted, an unpaid session, Adaptive Pricing, expiry, a 500 that Stripe sends again; refunds from the owner's page (the share, once, its idempotency key, the owed row paid) with `charge.refunded` taking nothing more, a refund from Stripe's dashboard taken once and counted by a later withdrawal, spent credits never below zero, and no card refund of what was not paid by card.
- `src/lib/chainpay/chainpay.test.ts` (19): the settings with USDG by default, another stablecoin and the older `WOVI_USDC_ADDRESS`; the stablecoin read on chain once and kept, refused on another chain, a strange symbol or decimals, or a mismatch with the settings (ETH still working), tried again a minute after a silent chain, never holding a page for a slow node, switched off, and one with 18 decimals priced one to one; exact money; USDG and ETH prices with the consent, every refusal; a USDG and an ETH payment landing once with the consent, each transaction once (another price, another person, x402), under, over and less than a credit, late (owed back) and checked late (still counted), a price over a week old, every on-chain refusal with the price usable after, and withdrawal of such a top-up owing the same asset back.
- `src/lib/x402/x402.test.ts`: a transaction that topped up credits never pays a call.
- `src/lib/safety/phase17-compat.test.ts`: a phase 17 data dir reads unchanged with all of this in place, no new file appears until it is used, and a USDG top-up lands beside the old top-ups without changing them.

## Buying and withdrawing (phase 18)

- Before a top-up or a $WOVI price, the buyer ticks the request to start the credits at once and the withdrawal terms (`PURCHASE_CONSENT`). Without it the server refuses. The exact words and the time are stored on the top-up (`topUp.consent`); older top-ups have none. Pack buttons say "Buy and pay $X" and the price is the total, taxes included.
- For 14 days after a paid top-up, "Withdraw from this purchase" with a confirm: the unused credits from it (at most what is left of the paid balance) leave through one `adjustment`, the money is written down as owed in `safety.json`, and a receipt goes by email. Nothing is paid out by the app. See [safety.md](safety.md).
