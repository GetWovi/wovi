"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { chainClaim, chainQuote } from "@/app/app/credits/actions";
import { injectedWallet, metamaskLink, METAMASK_DOWNLOAD, onPhone, toRobinhoodChain, transferData, walletError } from "@/components/account/wallet-browser";
import { PurchaseConsent } from "@/components/safety/PurchaseConsent";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import type { PayAsset } from "@/lib/chainpay/config";
import type { ChainQuote } from "@/lib/chainpay/pay";
import { creditWords, priceWords } from "@/lib/credits/config";
import { shortAddress } from "@/lib/token/words";
import { Coin } from "./CreditParts";
import styles from "./Credits.module.css";

type Stage = "quote" | "connect" | "chain" | "send" | "wait" | null;

const STAGE_WORDS: Record<Exclude<Stage, null>, string> = {
  quote: "Getting a price",
  connect: "Open your wallet to connect",
  chain: "Switching your wallet to Robinhood Chain",
  send: "Confirm the payment in your wallet",
  wait: "Waiting for Robinhood Chain",
};

export type ChainAssetView = { asset: PayAsset; symbol: string; available: boolean; note: string | null };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** An exact amount in its smallest unit, in whole units with every digit that matters: "0.002076118" ETH, "5" USDG. */
function units(amount: string, decimals: number): string {
  const v = BigInt(amount);
  const base = BigInt(10) ** BigInt(decimals);
  const frac = (v % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${(v / base).toLocaleString("en-US")}${frac ? `.${frac}` : ""}`;
}

/**
 * Buying credits with a stablecoin (USDG by default) or ETH on Robinhood Chain: a price for a pack, one
 * plain payment from a linked wallet to WOVI's address (signed in the
 * person's own wallet), then the transaction is checked on chain and the
 * credits land. A phone with no wallet opens this page inside MetaMask.
 */
export function PayWithChain({ csrf, packs, wallets, assets, explorer }: { csrf: string; packs: readonly number[]; wallets: string[]; assets: ChainAssetView[]; explorer: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const first = assets.find((a) => a.available)?.asset ?? "eth";
  const [asset, setAsset] = useState<PayAsset>(first);
  const [quote, setQuote] = useState<ChainQuote | null>(null);
  const [stage, setStage] = useState<Stage>(null);
  const [error, setError] = useState<string | null>(null);
  const [tx, setTx] = useState("");
  const [consent, setConsent] = useState(false);
  const [paid, setPaid] = useState<{ credits: number; amount: string; symbol: string; decimals: number; tx: string } | null>(null);
  const chosen = assets.find((a) => a.asset === asset)!;

  async function price(pack: number) {
    setError(null);
    // Phase 18: never ticked for the buyer, and nothing is priced without it.
    if (!consent) return setError("Tick the box above the packs first.");
    setStage("quote");
    const r = await chainQuote(csrf, pack, asset, consent);
    setStage(null);
    if (!r.ok) return setError(r.error);
    setQuote(r.value);
  }

  async function claim(hash: string, q: ChainQuote) {
    setStage("wait");
    for (let i = 0; i < 90; i++) {
      const r = await chainClaim(csrf, q.id, hash);
      if (!r.ok) {
        setStage(null);
        return setError(r.error);
      }
      const c = r.value;
      if (c.ok) {
        setStage(null);
        setQuote(null);
        setTx("");
        setPaid({ credits: c.credits, amount: c.amount, symbol: c.symbol, decimals: q.decimals, tx: hash });
        toast({ tone: "success", title: `${creditWords(c.credits)} added`, description: `Paid with ${c.symbol} on Robinhood Chain.` });
        router.refresh();
        return;
      }
      if (!c.pending) {
        setStage(null);
        if (c.owed) {
          setQuote(null);
          router.refresh();
        }
        return setError(c.message);
      }
      await sleep(2000);
    }
    setStage(null);
    setError("Robinhood Chain has not included it yet. Paste the transaction below in a minute and press Check.");
    setTx(hash);
  }

  async function send() {
    if (!quote) return;
    setError(null);
    const eth = injectedWallet();
    if (!eth) {
      if (onPhone()) {
        window.location.href = metamaskLink("pay");
        return;
      }
      window.open(METAMASK_DOWNLOAD, "_blank", "noopener");
      return setError("No wallet in this browser. Install MetaMask, link it on your account page, then come back.");
    }
    setStage("connect");
    let from = "";
    try {
      const list = (await eth.request({ method: "eth_requestAccounts" })) as unknown;
      from = Array.isArray(list) && typeof list[0] === "string" ? list[0] : "";
    } catch (err) {
      setStage(null);
      return setError(walletError(err, "connect").message);
    }
    if (!wallets.some((w) => w.toLowerCase() === from.toLowerCase())) {
      setStage(null);
      return setError(`Your wallet is on ${shortAddress(from)}, which is not linked to your account. Switch to a linked wallet, or link this one first.`);
    }
    setStage("chain");
    try {
      await toRobinhoodChain(eth);
    } catch (err) {
      setStage(null);
      return setError(walletError(err, "send").cancelled ? "The wallet stayed on another network. Nothing was sent." : "The wallet did not switch to Robinhood Chain. Nothing was sent.");
    }
    setStage("send");
    const amount = BigInt(quote.amount);
    const request = quote.asset === "eth" ? { from, to: quote.payTo, value: `0x${amount.toString(16)}` } : { from, to: quote.token, data: transferData(quote.payTo, amount), value: "0x0" };
    let hash: string;
    try {
      hash = (await eth.request({ method: "eth_sendTransaction", params: [request] })) as string;
    } catch (err) {
      setStage(null);
      return setError(walletError(err, "send").message);
    }
    if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) {
      setStage(null);
      return setError("The wallet did not say which transaction it sent. If it was sent, paste it below from your wallet's activity.");
    }
    setTx(hash);
    await claim(hash, quote);
  }

  const busy = stage !== null;

  if (paid) {
    return (
      <div className={styles.wovi}>
        <div className={styles.chainPaid} role="status">
          <span className={styles.chainPaidIcon} aria-hidden>
            <Icon name="check-circle" size={24} />
          </span>
          <span className={styles.chainPaidText}>
            <b>{creditWords(paid.credits)} added</b>
            <span>
              Paid {units(paid.amount, paid.decimals)} {paid.symbol} on Robinhood Chain.{" "}
              <a href={`${explorer}/tx/${paid.tx}`} target="_blank" rel="noreferrer">
                See the transaction
              </a>
            </span>
          </span>
        </div>
        <div className={styles.woviActions}>
          <Button variant="secondary" size="sm" onClick={() => setPaid(null)}>
            Buy another pack
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wovi}>
      {!quote ? (
        <>
          <div className={styles.assetPick} role="radiogroup" aria-label="Pay with">
            {assets.map((a) => (
              <button
                key={a.asset}
                type="button"
                role="radio"
                aria-checked={asset === a.asset}
                disabled={!a.available || busy}
                className={[styles.assetChoice, asset === a.asset ? styles.assetOn : ""].join(" ")}
                onClick={() => {
                  setAsset(a.asset);
                  setError(null);
                }}
              >
                <b>{a.symbol}</b>
                <span>{a.available ? (a.asset === "stable" ? "A stablecoin, one to one with the dollar" : "At Chainlink's ETH price") : (a.note ?? "Not available")}</span>
              </button>
            ))}
          </div>
          <PurchaseConsent checked={consent} onChange={setConsent} />
          <div className={styles.packs}>
            {packs.map((pack) => (
              <button key={pack} type="button" className={styles.pack} onClick={() => price(pack)} disabled={busy || !chosen.available} aria-label={`Pay for ${creditWords(pack)} with ${chosen.symbol}`}>
                <span className={styles.packAmount}>
                  <Coin size={14} /> {pack.toLocaleString("en-US")}
                </span>
                <span className={styles.packPrice}>
                  {priceWords(pack)} in {chosen.symbol}
                </span>
                <span className={styles.packCta}>
                  {stage === "quote" ? "Pricing" : "Get the price"} <Icon name="arrow-right" size={14} />
                </span>
              </button>
            ))}
          </div>
          <p className={styles.woviFine}>{asset === "stable" ? `One ${chosen.symbol} is one dollar, so 500 credits are 5 ${chosen.symbol}.` : "Priced from Chainlink's ETH/USD when you ask, and held for ten minutes."} One credit is always one cent. The price shown is the total you pay; the network fee is paid by your wallet.</p>
        </>
      ) : (
        <div className={styles.woviQuote}>
          <div className={styles.woviSend}>
            <span>Send</span>
            <b>
              {units(quote.amount, quote.decimals)} {quote.symbol}
            </b>
            <span>
              for {creditWords(quote.credits)}, to WOVI{" "}
              <a href={`${explorer}/address/${quote.payTo}`} target="_blank" rel="noreferrer" className={styles.woviAddr}>
                {shortAddress(quote.payTo)}
              </a>{" "}
              on Robinhood Chain, by {new Date(quote.expiresAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC
            </span>
          </div>
          <p className={styles.woviFine}>From a wallet linked to your account. Less than this adds fewer credits; after the time it is not added and is sent back to you.</p>
          <div className={styles.woviActions}>
            <Button onClick={send} loading={busy && stage !== "wait"} disabled={busy} leading={<Icon name="wallet" size={18} />}>
              Send from my wallet
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setQuote(null)} disabled={busy}>
              Another pack
            </Button>
          </div>
          <div className={styles.woviPaste}>
            <Input label="Already sent it? The transaction" name="tx" placeholder="0x..." value={tx} onChange={(e) => setTx(e.target.value.trim())} />
            <Button variant="secondary" size="sm" onClick={() => claim(tx, quote)} disabled={busy || !/^0x[0-9a-fA-F]{64}$/.test(tx)}>
              Check
            </Button>
          </div>
        </div>
      )}
      {stage && stage !== "quote" && (
        <p role="status" className={styles.woviStage}>
          <Icon name="clock" size={16} /> {STAGE_WORDS[stage]}
        </p>
      )}
      {error && (
        <p role="alert" className={styles.woviError}>
          {error}
        </p>
      )}
    </div>
  );
}
