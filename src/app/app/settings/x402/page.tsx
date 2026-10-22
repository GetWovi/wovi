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
import { Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import x from "@/components/x402/X402.module.css";
import { accounts } from "@/lib/accounts/server";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import { appX402 } from "@/lib/api/server";
import { appPage } from "@/lib/app/server";
import { usdWords } from "@/lib/x402/money";
import { PAYMENT_WORDS, REFUND_WORDS, amountWords, shortHex } from "@/lib/x402/words";
import { markRefundPaid } from "./actions";

export const metadata: Metadata = { title: "x402 payments", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const SWITCH_ON = {
  title: "Switch it on",
  where: "Environment of the server, then restart",
  code: [
    "# Where payers send money. WOVI only receives.",
    "WOVI_X402_PAY_TO=0xYourReceivingAddress",
    "# Robinhood Chain RPC, to check each payment.",
    "WOVI_X402_RPC_URL=https://your-robinhood-chain-rpc",
    "# ETH in USD: a Chainlink feed, or WOVI_X402_ETH_USD.",
    "WOVI_X402_ETH_USD_FEED=0xChainlinkEthUsdFeed",
  ].join("\n"),
  note: "Optional: WOVI_X402_MIN_CONFIRMATIONS (3), WOVI_X402_QUOTE_SECONDS (600), WOVI_X402_REFUND_FROM_CREDITS (5), WOVI_X402_ASSETS to add a stablecoin. See docs/x402.md.",
};

export default async function X402Page() {
  const { info, me, csrf } = await appPage("/app/settings/x402");
  // Platform money: the owner of WOVI only (owners of the platform workspace).
  if ((await accounts().roleIn(me, PLATFORM_WORKSPACE_ID)) !== "owner") notFound();
  const sum = await appX402().summary(25);
  const st = sum.status;
  const eth = sum.totals[0] ?? null;
  const owedCount = sum.owed.length;
  const settled = sum.payments.filter((p) => p.status === "settled").length;
  const checks = [
    { ok: Boolean(sum.payTo) && !st.missing.some((m) => m.includes("receiving address")), text: "A receiving address" },
    { ok: !st.missing.some((m) => m.includes("RPC") || m.includes("fake verifier")), text: st.verifier === "fake" ? "The fake verifier, on this machine" : "A Robinhood Chain RPC to check payments" },
    { ok: !st.missing.some((m) => m.includes("USD price")), text: "A USD price for each asset" },
  ];

  return (
    <AppShell info={info} active="settings">
      <div className={styles.head}>
        <div className={styles.headText}>
          <Link href="/app/settings" className={styles.crumb}>
            <Icon name="arrow-left" size={16} /> Settings
          </Link>
          <h1 className={styles.h1}>x402 payments</h1>
          <p className={styles.lead}>Agents and software pay per call, with no account and no key. Each call is quoted from its estimate, paid on Robinhood Chain to your address, and never charged more than the quote.</p>
        </div>
        <div className={styles.actions}>
          <ButtonLink href="/app/settings/api/reference#x402" variant="secondary" size="sm" leading={<Icon name="link" size={16} />}>
            What payers see
          </ButtonLink>
        </div>
      </div>

      {st.test && st.on && (
        <div className={s.devNote}>
          <Icon name="info" size={18} />
          <span>Test mode: the fake verifier on this machine. No money moves, and nothing below is a real payment.</span>
        </div>
      )}

      <div className={x.top}>
        <div className={styles.stack}>
          <section className={[styles.panel, styles.stack].join(" ")} aria-label="Status">
            <div className={x.status}>
              <span className={[x.light, st.on ? x.on : ""].join(" ")}>{st.on ? "On" : "Off"}</span>
              <span className={x.statusText}>
                <b>{st.on ? "Taking payments per call" : "Not taking payments"}</b>
                <span>{st.on ? `Calls without a key get a price and pay ${st.assets.map((a) => a.symbol).join(" or ")} to your address.` : "Calls without a key get 401, as before. Nothing is quoted until all three are set."}</span>
              </span>
            </div>
            {!st.on && (
              <ul className={x.missing} aria-label="What it needs">
                {checks.map((c) => (
                  <li key={c.text} className={c.ok ? x.done : ""}>
                    <Icon name={c.ok ? "check-circle" : "x-circle"} size={18} />
                    <span>{c.text}</span>
                  </li>
                ))}
              </ul>
            )}
            {(st.on || sum.paymentCount > 0) && (
              <div className={x.tiles}>
                <div className={x.tile}>
                  <span>Payments</span>
                  <b>{sum.paymentCount.toLocaleString("en-US")}</b>
                  <small>{settled} settled</small>
                </div>
                <div className={x.tile}>
                  <span>Received</span>
                  <b>{eth ? amountWords(eth.received, eth.decimals, "").replace(/^about /, "").trim() : "0"}</b>
                  <small>{eth ? `${eth.symbol}, all payments` : "Nothing yet"}</small>
                </div>
                <div className={x.tile}>
                  <span>Owed back</span>
                  <b>{eth ? amountWords(eth.owed, eth.decimals, "").replace(/^about /, "").trim() : "0"}</b>
                  <small>{eth ? `${eth.symbol}, you send these` : "Nothing"}</small>
                </div>
                <a href="#refunds" className={[x.tile, owedCount ? x.tileHot : ""].join(" ")}>
                  <span>Refunds to send</span>
                  <b>{owedCount}</b>
                  <small>{owedCount ? "Listed below" : "None"}</small>
                </a>
              </div>
            )}
            {st.on && (
              <p className={x.foot}>
                <Icon name="link" size={16} />
                <span>
                  Endpoints and prices are public at <code className={x.mono}>/api/v1/x402</code> and <code className={x.mono}>/.well-known/x402</code>.
                </span>
              </p>
            )}
          </section>
          {!st.on && <CodeBlock snippet={SWITCH_ON} />}
        </div>

        <section className={[styles.panel, styles.stack].join(" ")} aria-label="Receiving">
          <div className={s.panelHead}>
            <h2>Receiving</h2>
          </div>
          <div className={x.rows}>
            <div className={x.row}>
              <span>Your address</span>
              <span className={x.mono}>{sum.payTo ?? "Not set"}</span>
            </div>
            <div className={x.row}>
              <span>Network</span>
              <span>
                Robinhood Chain <span className={x.mono}>({sum.network})</span>
              </span>
            </div>
            <div className={x.row}>
              <span>Payers pay in</span>
              <span>{st.assets.length ? st.assets.map((a) => a.symbol).join(", ") : "Nothing priced yet"}</span>
            </div>
            <div className={x.row}>
              <span>Checked by</span>
              <span>{st.verifier === "fake" ? "The fake verifier (this machine only, no money)" : sum.rpcSet ? "Reading the chain through your RPC" : "Nothing yet: no RPC set"}</span>
            </div>
            <div className={x.row}>
              <span>Rules</span>
              <span>
                A quote lasts {Math.round(sum.quoteSeconds / 60)} minutes; a run starts after {sum.minConfirmations} confirmations
              </span>
            </div>
            <div className={x.row}>
              <span>Unused, owed back</span>
              <span>From {sum.refundUnusedFromCredits} credits (${usdWords(BigInt(sum.refundUnusedFromCredits) * BigInt(10000))}) after a run that worked; all of it after one that failed or was stopped</span>
            </div>
            {!st.on && (
              <div className={x.row}>
                <span>Refunds</span>
                <span>Listed here for you to send from your own wallet. WOVI holds no keys and never sends money.</span>
              </div>
            )}
          </div>
        </section>
      </div>

      <section className={[styles.panel, styles.stack].join(" ")} aria-label="Recent payments">
        <div className={s.panelHead}>
          <div>
            <h2>Recent payments</h2>
            <p>Each one is a transfer to your address that paid for one call. Credits are what the call was quoted and what it was charged.</p>
          </div>
        </div>
        {sum.payments.length === 0 ? (
          <div className={styles.wovi}>
            <Mascot pose="wait" size={72} label="Wovi, waiting" />
            <b>No payments yet</b>
            <span>{st.on ? "The first agent that pays shows up here." : "Switch x402 on and the first agent that pays shows up here."}</span>
          </div>
        ) : (
          <div className={x.tableWrap}>
            <table className={x.table}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Call</th>
                  <th>Payer</th>
                  <th>Transaction</th>
                  <th>Paid</th>
                  <th>Credits</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {sum.payments.map((p) => (
                  <tr key={p.id}>
                    <td>{when(p.createdAt)}</td>
                    <td>
                      {p.targetName}
                      <span className={x.sub}>{p.kind === "run" ? "Run" : "Pipeline"}</span>
                    </td>
                    <td className={x.mono} title={p.payer}>
                      {shortHex(p.payer)}
                    </td>
                    <td className={x.mono} title={p.txHash}>
                      {shortHex(p.txHash, 8, 6)}
                    </td>
                    <td>
                      {amountWords(p.paid, p.decimals, p.symbol)}
                      <span className={x.sub}>${usdWords(p.usdMicro)} quoted</span>
                    </td>
                    <td>
                      {p.charged === null ? `${p.credits} held` : `${p.charged} of ${p.credits}`}
                      <span className={x.sub}>{p.charged === null ? "while it runs" : "charged"}</span>
                    </td>
                    <td>
                      <span className={[x.tag, x[`tag-${p.status}`]].join(" ")}>{PAYMENT_WORDS[p.status]}</span>
                      {p.refundId && <span className={x.sub}>Refund owed</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className={x.bottom}>
        <section id="refunds" className={[styles.panel, styles.stack].join(" ")} aria-label="Refunds to send">
          <div className={s.panelHead}>
            <div>
              <h2>Refunds to send</h2>
              <p>WOVI holds no keys, so it never sends money. When a run fails, is stopped or leaves enough unused, the payer is owed it back: send it from your own wallet, then paste the transaction here.</p>
            </div>
          </div>
          {sum.owed.length === 0 ? (
            <p className={x.empty}>Nothing to send.</p>
          ) : (
            <ul className={x.refunds}>
              {sum.owed.map((r) => (
                <li key={r.id} className={x.refund}>
                  <div className={x.refundTop}>
                    <span>
                      <b>{amountWords(r.amount, r.decimals, r.symbol)}</b>
                      <span className={x.sub}>
                        to <span className={x.mono}>{r.to}</span>
                      </span>
                    </span>
                    <span className={[x.tag, x["tag-owed"]].join(" ")}>{REFUND_WORDS[r.reason]}</span>
                  </div>
                  <span className={[styles.muted, styles.small].join(" ")}>
                    {r.note} {when(r.createdAt)}.{r.test ? " Test: nothing to send." : ""}
                  </span>
                  <ActionForm action={markRefundPaid} csrf={csrf} className={x.paidForm}>
                    <input type="hidden" name="id" value={r.id} />
                    <Input label="Your refund's transaction" name="txHash" placeholder="0x..." required pattern="^0x[0-9a-fA-F]{64}$" />
                    <Button type="submit" size="sm" variant="secondary">
                      Mark paid
                    </Button>
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={[styles.panel, styles.panelAlt, styles.stack].join(" ")} aria-label="How it works">
          <div className={s.panelHead}>
            <h2>How a payer pays</h2>
          </div>
          <ol className={x.steps}>
            <li>Calls a start endpoint with no key and gets a 402 with the price.</li>
            <li>Sends that amount to your address on Robinhood Chain.</li>
            <li>Calls again with X-PAYMENT: the transaction, signed by the same wallet.</li>
            <li>WOVI checks it on chain, starts the run and gives a receipt to read it.</li>
          </ol>
          <p className={[styles.muted, styles.small].join(" ")}>MCP stays on API keys. People who use the app keep paying with credits.</p>
        </section>
      </div>
    </AppShell>
  );
}
