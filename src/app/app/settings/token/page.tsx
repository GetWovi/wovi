import { appUrlFromEnv } from "@/lib/runtime";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/account/ActionForm";
import s from "@/components/api/Api.module.css";
import { CodeBlock } from "@/components/api/CodeBlock";
import styles from "@/components/app/App.module.css";
import { AppShell } from "@/components/app/AppShell";
import { Mascot } from "@/components/brand/Mascot";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import x from "@/components/x402/X402.module.css";
import { accounts } from "@/lib/accounts/server";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import { appPage } from "@/lib/app/server";
import { creditWords, monthWords } from "@/lib/credits/config";
import { keeperStatus, payStatus } from "@/lib/token/config";
import { keeperRecord } from "@/lib/token/keeper";
import { tokenServices } from "@/lib/token/local";
import { ethWords, shortAddress, utcWords, wholeWords } from "@/lib/token/words";
import { chainPayConfigFromEnv, chainPayStatus } from "@/lib/chainpay/config";
import { chainPay } from "@/lib/chainpay/local";
import { stripeSettingsFromEnv } from "@/lib/credits/stripe";
import { unitsWords } from "@/lib/x402/money";
import { checkHoldersNow, runKeeperNow } from "./actions";

export const metadata: Metadata = { title: "$WOVI", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const SWITCH_ON = {
  title: "Switch the keeper on",
  where: "Environment of the server, then restart",
  code: [
    "# The two contracts (contracts/token-deploy.sh writes them).",
    "WOVI_BURN_POT_ADDRESS=0xTheBurnPot",
    "WOVI_SPLITTER_ADDRESS=0xTheFeeAddress",
    "WOVI_BURN_POT_BLOCK=<the block the pot was deployed in>",
    "# A fresh wallet that only ever holds a little ETH for gas.",
    "WOVI_KEEPER_KEY=<its private key>",
    "WOVI_TOKEN_RPC_URL=https://your-robinhood-chain-rpc",
  ].join("\n"),
  note: "Optional: WOVI_KEEPER_EVERY_MINUTES (15), WOVI_KEEPER_MIN_GAS_ETH (0.0005), WOVI_KEEPER_MAX_GWEI (0.5), WOVI_KEEPER_DAILY_GAS, WOVI_KEEPER_MIN_SWEEP_ETH. WOVI_KEEPER=off stops it whatever else is set. See docs/token.md.",
};

export default async function TokenOwnerPage() {
  const { info, me, csrf } = await appPage("/app/settings/token");
  // Platform matters: the owner of WOVI only (owners of the platform workspace), like x402.
  if ((await accounts().roleIn(me, PLATFORM_WORKSPACE_ID)) !== "owner") notFound();
  const ts = tokenServices();
  const c = ts.config;
  const ks = keeperStatus(c);
  const k = await keeperRecord(ts.store);
  const panel = c.pot ? await ts.panels.panel() : null;
  const hs = await ts.holders.summary();
  const paySum = ts.pay ? await ts.pay.summary() : null;
  const ps = payStatus(c);
  const today = new Date().toISOString().slice(0, 10);
  const gasToday = k.gasByDay[today] ?? 0;
  const gas = k.gasBalanceWei === null ? null : BigInt(k.gasBalanceWei);
  const lowGas = gas !== null && gas < c.keeper.minGasWei;
  const txLink = (tx: string) => `${c.explorer}/tx/${tx}`;
  // The other ways to pay for credits: card (Stripe) and a stablecoin (USDG by default) or ETH on Robinhood Chain.
  const stripe = stripeSettingsFromEnv();
  const cpc = chainPayConfigFromEnv();
  const cps = chainPayStatus(cpc);
  const cp = chainPay();
  const cpSum = cps.on && cp ? await cp.summary() : null;
  // The stablecoin as it answered on chain at start: its real symbol and decimals, or why it is not offered.
  const st = cp && cpc.stable.token ? await cp.stablecoin() : null;
  const stSymbol = st?.ok ? st.symbol : "Stablecoin";
  const names = `${stSymbol} and ETH`;
  const webhookUrl = `${process.env.WOVI_APP_URL?.trim() ? appUrlFromEnv() : "(set WOVI_APP_URL)"}/api/stripe/webhook`;

  return (
    <AppShell info={info} active="settings">
      <div className={styles.head}>
        <div className={styles.headText}>
          <Link href="/app/settings" className={styles.crumb}>
            <Icon name="arrow-left" size={16} /> Settings
          </Link>
          <h1 className={styles.h1}>$WOVI</h1>
          <p className={styles.lead}>The keeper that sweeps fees and burns $WOVI on a schedule, the holder checks, $WOVI paid for credits, and card, stablecoin and ETH payments. Only you see this page.</p>
        </div>
        <div className={styles.actions}>
          {c.pageOn && (
            <ButtonLink href="/token" variant="secondary" size="sm" leading={<Icon name="flame" size={16} />}>
              The public page
            </ButtonLink>
          )}
          <ButtonLink href="/app/settings/x402" variant="secondary" size="sm" leading={<Icon name="coin" size={16} />}>
            x402 payments
          </ButtonLink>
        </div>
      </div>

      <div className={x.top}>
        <div className={styles.stack}>
          <section className={[styles.panel, styles.stack].join(" ")} aria-label="The keeper">
            <div className={x.status}>
              <span className={[x.light, ks.on ? x.on : ""].join(" ")}>{ks.on ? "On" : "Off"}</span>
              <span className={x.statusText}>
                <b>{ks.on ? `The keeper looks every ${c.keeper.everyMinutes} minutes` : "The keeper is off"}</b>
                <span>{ks.on ? "It calls sweep() when the fees are worth it and burn(0) when the burn pot says ready. It never holds or moves funds; it only pays gas." : "Nothing is swept or burned by WOVI. Anyone can still call both contracts."}</span>
              </span>
            </div>
            {!ks.on && (
              <ul className={x.missing} aria-label="What it needs">
                {ks.missing.map((m) => (
                  <li key={m}>
                    <Icon name="x-circle" size={18} />
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className={x.tiles}>
              <div className={[x.tile, lowGas ? x.tileHot : ""].join(" ")}>
                <span>Gas wallet</span>
                <b>{gas === null ? "Not read" : `${ethWords(gas, 5)} ETH`}</b>
                <small>{lowGas ? `Under the floor of ${ethWords(c.keeper.minGasWei)} ETH: top it up` : `Floor ${ethWords(c.keeper.minGasWei)} ETH`}</small>
              </div>
              <div className={x.tile}>
                <span>Last run</span>
                <b>{k.lastRunAt ? utcWords(k.lastRunAt).replace(" UTC", "") : "Never"}</b>
                <small>{k.lastResult ?? "No run yet"}</small>
              </div>
              <div className={x.tile}>
                <span>Sweeps</span>
                <b>{k.sweeps.toLocaleString("en-US")}</b>
                <small>{k.lastSweep ? `Last ${utcWords(k.lastSweep.at)}` : "None yet"}</small>
              </div>
              <div className={x.tile}>
                <span>Burns sent</span>
                <b>{k.burns.toLocaleString("en-US")}</b>
                <small>{k.lastBurn ? `Last ${utcWords(k.lastBurn.at)}` : "None yet"}</small>
              </div>
            </div>
            {ks.on && (
              <ActionForm action={runKeeperNow} csrf={csrf}>
                <Button type="submit" size="sm" variant="secondary" leading={<Icon name="refresh" size={16} />}>
                  Run the keeper now
                </Button>
              </ActionForm>
            )}
          </section>
          {!ks.on && <CodeBlock snippet={SWITCH_ON} />}
        </div>

        <section className={[styles.panel, styles.stack].join(" ")} aria-label="Keeper details">
          <div className={s.panelHead}>
            <h2>Details</h2>
          </div>
          <div className={x.rows}>
            <div className={x.row}>
              <span>Keeper wallet</span>
              <span className={x.mono}>{k.account ?? (c.keeper.keySet ? "Read at the first run" : "No key set")}</span>
            </div>
            <div className={x.row}>
              <span>Last sweep</span>
              <span>
                {k.lastSweep ? (
                  <a href={txLink(k.lastSweep.tx)} target="_blank" rel="noreferrer" className={x.mono}>
                    {shortAddress(k.lastSweep.tx, 10, 6)}
                  </a>
                ) : (
                  "None yet"
                )}
              </span>
            </div>
            <div className={x.row}>
              <span>Last burn</span>
              <span>
                {k.lastBurn ? (
                  <a href={txLink(k.lastBurn.tx)} target="_blank" rel="noreferrer" className={x.mono}>
                    {shortAddress(k.lastBurn.tx, 10, 6)}
                  </a>
                ) : (
                  "None yet"
                )}
              </span>
            </div>
            <div className={x.row}>
              <span>Waiting on</span>
              <span>{k.pending ? `A ${k.pending.kind} sent ${utcWords(k.pending.sentAt)}` : "Nothing"}</span>
            </div>
            <div className={x.row}>
              <span>Swept in all</span>
              <span>{ethWords(k.sweptWei)} ETH</span>
            </div>
            <div className={x.row}>
              <span>Gas today</span>
              <span>
                {gasToday.toLocaleString("en-US")} of {c.keeper.dailyGas.toLocaleString("en-US")} units
              </span>
            </div>
            <div className={x.row}>
              <span>Rules</span>
              <span>
                Gas price up to {c.keeper.maxGwei} gwei; a sweep from {ethWords(c.keeper.minSweepWei)} ETH; nothing sent while a transaction is out
              </span>
            </div>
            <div className={x.row}>
              <span>Problems</span>
              <span>{k.failures ? `${k.failures}. Last: ${k.lastError ?? "unknown"}` : "None"}</span>
            </div>
          </div>
        </section>
      </div>

      <div className={x.bottom}>
        <section className={[styles.panel, styles.stack].join(" ")} aria-label="Holders">
          <div className={s.panelHead}>
            <div>
              <h2>Holders</h2>
              <p>People who linked a wallet, read every {c.holder.checkHours} hours. The badge shows from {Number(c.holder.minWhole).toLocaleString("en-US")} $WOVI.</p>
            </div>
          </div>
          {!c.holder.on ? (
            <div className={styles.wovi}>
              <Mascot pose="wait" size={72} label="Wovi, waiting" />
              <b>Off until the burn pot is set</b>
              <span>Holder checks read $WOVI through the burn pot.</span>
            </div>
          ) : (
            <>
              <div className={x.rows}>
                <div className={x.row}>
                  <span>Linked</span>
                  <span>
                    {hs.people} {hs.people === 1 ? "person" : "people"}, {hs.holders} holding enough for the badge
                  </span>
                </div>
                <div className={x.row}>
                  <span>Last check</span>
                  <span>{hs.lastCheck ? utcWords(Date.parse(hs.lastCheck)) : "Not yet"}</span>
                </div>
                <div className={x.row}>
                  <span>Holder credits</span>
                  <span>{c.holder.tiers.length ? c.holder.tiers.map((t) => `${Number(t.minWhole).toLocaleString("en-US")} $WOVI: ${creditWords(t.credits)}`).join("; ") : "Off (WOVI_HOLDER_CREDITS is empty)"}</span>
                </div>
                <div className={x.row}>
                  <span>This month</span>
                  <span>
                    {hs.snapshot
                      ? `${monthWords(hs.snapshot.period)}: snapshot at block ${hs.snapshot.block.toLocaleString("en-US")}, ${hs.snapshot.users.length} ${hs.snapshot.users.length === 1 ? "person" : "people"}, ${creditWords(hs.snapshot.credits)}`
                      : c.holder.tiers.length
                        ? "No snapshot yet; the hourly check takes it"
                        : "Nothing to grant"}
                  </span>
                </div>
              </div>
              <ActionForm action={checkHoldersNow} csrf={csrf}>
                <Button type="submit" size="sm" variant="secondary" leading={<Icon name="refresh" size={16} />}>
                  Check holders now
                </Button>
              </ActionForm>
            </>
          )}
        </section>

        <section className={[styles.panel, styles.panelAlt, styles.stack].join(" ")} aria-label="Token and payments">
          <div className={s.panelHead}>
            <div>
              <h2>The token</h2>
              <p>What the public page shows, from the same reading.</p>
            </div>
          </div>
          <div className={x.rows}>
            <div className={x.row}>
              <span>Stage</span>
              <span>{!panel ? "No burn pot set" : panel.stage === "live" ? "Live" : "Deployed, not launched"}</span>
            </div>
            <div className={x.row}>
              <span>Burned</span>
              <span>{panel?.burned ? `${wholeWords(panel.burned)} $WOVI in ${panel.count} burns, ${ethWords(panel.ethSpent ?? "0")} ETH` : "Nothing yet"}</span>
            </div>
            <div className={x.row}>
              <span>Next burn</span>
              <span>{panel?.next ? (panel.next.ready ? "Ready now" : panel.next.at ? utcWords(panel.next.at) : "Waiting") : "Nothing waiting"}</span>
            </div>
            <div className={x.row}>
              <span>Paid in $WOVI</span>
              <span>{ps.on ? (paySum ? `${paySum.payments} ${paySum.payments === 1 ? "payment" : "payments"}, ${creditWords(paySum.credits)}, ${wholeWords(paySum.tokensWei)} $WOVI to the burn pot` : "Credits are off on this server") : "Off (WOVI_PAY_WITH_WOVI)"}</span>
            </div>
            <div className={x.row}>
              <span>Reads through</span>
              <span>{c.publicRpc ? "The public Robinhood Chain node (set WOVI_TOKEN_RPC_URL for a paid one)" : "Your RPC"}</span>
            </div>
          </div>
        </section>
      </div>

      <div className={x.bottom}>
        <section className={[styles.panel, styles.stack].join(" ")} aria-label="Card payments">
          <div className={x.status}>
            <span className={[x.light, stripe.on ? x.on : ""].join(" ")}>{stripe.on ? (stripe.test ? "Test" : "On") : "Off"}</span>
            <span className={x.statusText}>
              <b>{stripe.on ? (stripe.test ? "Cards through Stripe, in test mode" : "Cards through Stripe") : "Card payments are off"}</b>
              <span>{stripe.on ? "Stripe's own page takes the card. Credits land only from Stripe's signed webhook." : "No card button shows. Set the two Stripe settings to switch it on (docs/credits.md)."}</span>
            </span>
          </div>
          {!stripe.on && (
            <ul className={x.missing} aria-label="What it needs">
              {stripe.missing.map((m) => (
                <li key={m}>
                  <Icon name="x-circle" size={18} />
                  <span>{m}</span>
                </li>
              ))}
            </ul>
          )}
          <div className={x.rows}>
            <div className={x.row}>
              <span>Webhook</span>
              <span className={x.mono}>{webhookUrl}</span>
            </div>
            <div className={x.row}>
              <span>Events</span>
              <span>checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, checkout.session.expired, charge.refunded</span>
            </div>
            <div className={x.row}>
              <span>On the statement</span>
              <span>Your shortened descriptor, then {stripe.descriptor}</span>
            </div>
            <div className={x.row}>
              <span>Refunds</span>
              <span>
                Withdrawals from card purchases have a refund button in <Link href="/app/settings/safety">Reports and refunds</Link>.
              </span>
            </div>
          </div>
        </section>

        <section className={[styles.panel, styles.stack].join(" ")} aria-label="Stablecoin and ETH payments">
          <div className={x.status}>
            <span className={[x.light, cps.on ? x.on : ""].join(" ")}>{cps.on ? "On" : "Off"}</span>
            <span className={x.statusText}>
              <b>{cps.on ? `${names} on Robinhood Chain` : `${names} are off`}</b>
              <span>{cps.on ? "Sent from a linked wallet to your address, checked on chain read only, once per transaction." : "Set a receiving address to switch it on."}</span>
            </span>
          </div>
          {!cps.on && (
            <ul className={x.missing} aria-label="What it needs">
              {cps.missing.map((m) => (
                <li key={m}>
                  <Icon name="x-circle" size={18} />
                  <span>{m}</span>
                </li>
              ))}
            </ul>
          )}
          <div className={x.rows}>
            <div className={x.row}>
              <span>Receiving address</span>
              <span className={x.mono}>{cpc.payTo ? `${cpc.payTo} (${cpc.payToFrom})` : "Not set"}</span>
            </div>
            <div className={x.row}>
              <span>Stablecoin</span>
              <span>
                {!cpc.stable.token ? (
                  cpc.stable.badSetting ?? "Switched off (WOVI_STABLECOIN_ADDRESS=off)"
                ) : (
                  <>
                    {st?.ok ? `${st.symbol}, ${st.decimals} decimals as read on chain, one to one with the dollar (${cpc.stable.from === "default" ? "the default" : cpc.stable.from})` : `Not offered: ${st && !st.ok ? st.reason : "not read yet"}`}
                    <br />
                    <span className={x.mono}>{cpc.stable.token}</span>
                  </>
                )}
              </span>
            </div>
            <div className={x.row}>
              <span>ETH</span>
              <span>{cpc.eth.available ? "On, priced from Chainlink's ETH/USD" : "Switched off (WOVI_PAY_ETH=off)"}</span>
            </div>
            <div className={x.row}>
              <span>Paid so far</span>
              <span>
                {cpSum
                  ? `${cpSum.payments} ${cpSum.payments === 1 ? "payment" : "payments"}, ${creditWords(cpSum.credits)}: ${unitsWords(cpSum.byAsset.stable, st?.ok ? st.decimals : 6)} ${stSymbol} and ${unitsWords(cpSum.byAsset.eth, 18)} ETH. ${cpSum.owed} owed back.`
                  : "Nothing yet"}
              </span>
            </div>
            <div className={x.row}>
              <span>Checks</span>
              <span>
                {cpc.minConfirmations} confirmations, through {cpc.publicRpc ? "the public node (set WOVI_PAY_RPC_URL for a paid one)" : "your RPC"}
              </span>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
