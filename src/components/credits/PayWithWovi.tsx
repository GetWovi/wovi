"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { woviClaim, woviQuote } from "@/app/app/credits/actions";
import { injectedWallet, metamaskLink, METAMASK_DOWNLOAD, onPhone, toRobinhoodChain, transferData, walletError } from "@/components/account/wallet-browser";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { creditWords, priceWords } from "@/lib/credits/config";
import type { PayQuote } from "@/lib/token/pay";
import { shortAddress, wholeWords } from "@/lib/token/words";
import { Coin } from "./CreditParts";
import { PurchaseConsent } from "@/components/safety/PurchaseConsent";
import styles from "./Credits.module.css";

type Stage = "quote" | "connect" | "chain" | "send" | "wait" | null;

const STAGE_WORDS: Record<Exclude<Stage, null>, string> = {
  quote: "Getting a price",
  connect: "Open your wallet to connect",
  chain: "Switching your wallet to Robinhood Chain",
  send: "Confirm the transfer in your wallet",
  wait: "Waiting for Robinhood Chain",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Buying credits with $WOVI (phase 17): a price for a pack, one plain $WOVI
 * transfer to the burn pot from a linked wallet (signed in the person's own
 * wallet), then the transaction is checked on chain and the credits land.
 * The burn pot burns that $WOVI with its next burn.
 */
export function PayWithWovi({ csrf, packs, wallets, source, explorer }: { csrf: string; packs: readonly number[]; wallets: string[]; source: "fixed" | "market"; explorer: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [quote, setQuote] = useState<PayQuote | null>(null);
  const [stage, setStage] = useState<Stage>(null);
  const [error, setError] = useState<string | null>(null);
  const [tx, setTx] = useState("");
  const [consent, setConsent] = useState(false);

  async function price(pack: number) {
    setError(null);
    // Phase 18: the same request and acceptance as a card purchase, never ticked in advance.
    if (!consent) return setError("Tick the box above the packs first.");
    setStage("quote");
    const r = await woviQuote(csrf, pack, consent);
    setStage(null);
    if (!r.ok) return setError(r.error);
    setQuote(r.value);
  }

  async function claim(hash: string, q: PayQuote) {
    setStage("wait");
    for (let i = 0; i < 60; i++) {
      const r = await woviClaim(csrf, q.id, hash);
      if (!r.ok) {
        setStage(null);
        return setError(r.error);
      }
      const c = r.value;
      if (c.ok) {
        setStage(null);
        setQuote(null);
        setTx("");
        toast({ tone: "success", title: `${creditWords(c.credits)} added`, description: "Paid with $WOVI. It burns with the next burn." });
        router.refresh();
        return;
      }
      if (!c.pending) {
        setStage(null);
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
    let hash: string;
    try {
      hash = (await eth.request({ method: "eth_sendTransaction", params: [{ from, to: quote.token, data: transferData(quote.pot, BigInt(quote.tokensWei)), value: "0x0" }] })) as string;
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

  return (
    <div className={styles.wovi}>
      {!quote ? (
        <>
          <PurchaseConsent checked={consent} onChange={setConsent} />
          <div className={styles.packs}>
            {packs.map((pack) => (
              <button key={pack} type="button" className={styles.pack} onClick={() => price(pack)} disabled={busy} aria-label={`Pay for ${creditWords(pack)} with $WOVI`}>
                <span className={styles.packAmount}>
                  <Coin size={14} /> {pack.toLocaleString("en-US")}
                </span>
                <span className={styles.packPrice}>{priceWords(pack)} in $WOVI</span>
                <span className={styles.packCta}>
                  {stage === "quote" ? "Pricing" : "Get the price"} <Icon name="arrow-right" size={14} />
                </span>
              </button>
            ))}
          </div>
          <p className={styles.woviFine}>{source === "market" ? "Priced from the market when you ask, and held for ten minutes." : "At a fixed rate set by WOVI."} One credit is always one cent.</p>
        </>
      ) : (
        <div className={styles.woviQuote}>
          <div className={styles.woviSend}>
            <span>Send</span>
            <b>{wholeWords(quote.tokensWei)} $WOVI</b>
            <span>
              for {creditWords(quote.credits)}, to the burn pot{" "}
              <a href={`${explorer}/address/${quote.pot}`} target="_blank" rel="noreferrer" className={styles.woviAddr}>
                {shortAddress(quote.pot)}
              </a>
              , by {new Date(quote.expiresAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC
            </span>
          </div>
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
