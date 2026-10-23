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
| `top_up` | + | A payment provider said paid, an x402 payment (phase 15), or $WOVI sent to the burn pot (phase 17). Test top-ups are marked `test`. |
| `grant` | + | Credits given, one per source id: support (paid credits), or a $WOVI holder's monthly holder credits (phase 17, `grantHolder` only). |
| `hold` | - | The estimate, held when a run or pipeline starts. |
| `release` | + | Gives a hold back: all of it when the run ends (paired with the charge), or part of a pipeline's hold per step. Its reason: settled, failed, cancelled, step, ended. |
| `charge` | - | What a finished run really cost, never more than it held. Keeps the real model cost for support. |
| `refund` | + | A charge given back afterwards, once per run (support). |
| `adjustment` | +/- | A correction with a note (support). Paid credits only. |
| `expire` | - | Holder credits left at the end of their month (phase 17). |

A run that held 4 and cost 2 writes `hold -4`, then `release +4` and `charge -2` together: 2 spent, 2 back. A failed run writes `release +4` and nothing else.

- **Idempotent.** Every entry has a key that is unique in its workspace (`hold:run:<id>`, `charge:run:<id>`, `topup:<id>`, `grant:holder:<person>:<month>`, `wovi:<chain>:<transaction>`, `expire:holder:<month>:<n>`). Writing a key again returns the first entry; the same key with another amount is refused (`conflict`).
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

- **The test provider** says paid at once and moves no money. It is on for a local app (`WOVI_APP_URL` on localhost, the default) or with `WOVI_TEST_PAYMENTS=on`, and off with `WOVI_TEST_PAYMENTS=off`. Anywhere else, with no real provider, top-ups are closed ("Top-ups are not open yet."), so a deployed site never hands out credits for nothing.
- Every test top-up says so: the "Test payments" badge, the test-mode note, "test, not charged" on each pack, "Test" in the history and "no money moved" in the toast.
- Packs only, from 500 credits. With an idempotency key (one per button press), a second call returns the first top-up.
- Stripe (card) or an on-chain checkout plug in behind the same interface later.

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

The earlier phases' screenshot scripts run agents from a workspace with no credits. Start the server with `WOVI_CREDITS=off` for those.

## Tests

`src/lib/credits/credits.test.ts` (22 tests), `src/lib/credits/holder-credits.test.ts` (12, phase 17: the holder pool) and the policy table in `src/lib/accounts/policy.test.ts`:

- pricing: rounding up, the minimum, the margin, the estimate under the cap, the charge under the hold, the median; the fixed value, nothing swappable, nothing free, the words;
- the ledger: test top-ups once per key, the minimum and packs only, closed and failing providers, the test provider only locally; keys written once and refused with another amount, never below zero, the grant hook, every balance adding up; racing holds never spending more than the balance;
- runs: hold, charge, the rest back, settled once; refused without enough credits before anything is queued, and the form knowing first; everything back on failure and on cancel; never above the estimate shown, with quality-gate rewrites; the typical cost from finished runs; a run left holding settled after a restart;
- pipelines: one hold, each step charged inside it, the rest back; a step's rewrite inside the same hold; refused without enough credits; a failed step free with finished steps kept, and a retry holding again; cancel giving the hold back;
- limits and roles: workspace and member limits at submit counting holds, lifting them; owners and admins top up and set limits, editors and viewers and keys never; charges shown only to people who see costs; a key's runs counted toward its maker; a change request's new draft charged to the person who asked; bench runs free.

## Later

- A real payment provider: Stripe for cards (owners do not need a wallet). Agents and software without an account pay per call with x402 since phase 15 ([x402.md](x402.md)): each paid call lands in the `ws_x402` workspace as a top-up of its quote and settles like any run.
- Holder credits are in since phase 17 (above). One allocation per account; one person with several accounts is not caught yet.
- Swaps and creator payouts only after the legal check.
- A small starter pack or a low first top-up for new users outside crypto, as the doc says to revisit.
- Credits for MCP and REST calls (phase 14) go through the same guarded engine, so they are billed already.

## Buying and withdrawing (phase 18)

- Before a top-up or a $WOVI price, the buyer ticks the request to start the credits at once and the withdrawal terms (`PURCHASE_CONSENT`). Without it the server refuses. The exact words and the time are stored on the top-up (`topUp.consent`); older top-ups have none. Pack buttons say "Buy and pay $X" and the price is the total, taxes included.
- For 14 days after a paid top-up, "Withdraw from this purchase" with a confirm: the unused credits from it (at most what is left of the paid balance) leave through one `adjustment`, the money is written down as owed in `safety.json`, and a receipt goes by email. Nothing is paid out by the app. See [safety.md](safety.md).
