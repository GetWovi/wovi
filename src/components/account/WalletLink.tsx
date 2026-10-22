"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { walletLink, walletMessage } from "@/app/account/actions";
import { Button } from "@/components/ui/Button";
import styles from "./Account.module.css";
import { METAMASK_DOWNLOAD, injectedWallet, metamaskLink, onPhone, utf8Hex, walletError } from "./wallet-browser";

type Stage = "connect" | "sign" | "check" | null;

const STAGE_WORDS: Record<Exclude<Stage, null>, string> = {
  connect: "Open your wallet to connect",
  sign: "Sign the message in your wallet",
  check: "Checking the signature",
};

/**
 * Links a wallet by signing a message. It only ever asks the wallet for its
 * address, its network id and one signature over plain text: never a
 * transaction. On a phone without a wallet in the browser it opens this page
 * in MetaMask's browser, where the link starts again (`?link=wallet`); on a
 * desktop without one it opens MetaMask's download page.
 */
export function WalletLink({ csrf, label = "Link a wallet", variant = "secondary" }: { csrf: string; label?: string; variant?: "primary" | "secondary" }) {
  const router = useRouter();
  const [note, setNote] = useState<{ ok?: string; error?: string } | null>(null);
  const [stage, setStage] = useState<Stage>(null);
  const started = useRef(false);

  const link = useCallback(async () => {
    setNote(null);
    const eth = injectedWallet();
    if (!eth) {
      if (onPhone()) {
        window.location.href = metamaskLink("wallet");
        return;
      }
      window.open(METAMASK_DOWNLOAD, "_blank", "noopener");
      return setNote({ error: "No wallet in this browser. Install MetaMask, then come back and link it." });
    }
    try {
      setStage("connect");
      let address: string;
      try {
        const list = (await eth.request({ method: "eth_requestAccounts" })) as unknown;
        address = Array.isArray(list) && typeof list[0] === "string" ? list[0] : "";
      } catch (err) {
        return setNote({ error: walletError(err, "connect").message });
      }
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return setNote({ error: "The wallet gave no address. Unlock it and try again." });
      const chainId = parseInt(String(await eth.request({ method: "eth_chainId" })), 16);
      const msg = await walletMessage(csrf, address, chainId);
      if ("error" in msg) return setNote({ error: msg.error });
      setStage("sign");
      let signature: string;
      try {
        signature = (await eth.request({ method: "personal_sign", params: [utf8Hex(msg.message), address] })) as string;
      } catch (err) {
        return setNote({ error: walletError(err, "sign").message });
      }
      setStage("check");
      const r = await walletLink(csrf, msg.challengeId, signature);
      setNote(r);
      if (r?.ok) router.refresh();
    } catch {
      setNote({ error: "The wallet request was closed or failed." });
    } finally {
      setStage(null);
    }
  }, [csrf, router]);

  // Arrived from the phone's deep link: start again here, once, inside the wallet's browser.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (started.current || params.get("link") !== "wallet" || !injectedWallet()) return;
    const t = setTimeout(() => {
      if (started.current) return;
      started.current = true;
      params.delete("link");
      const q = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`);
      void link();
    }, 0);
    return () => clearTimeout(t);
  }, [link]);

  return (
    <div className={styles.inline}>
      <Button variant={variant} size="sm" onClick={link} loading={stage !== null}>
        {label}
      </Button>
      {stage && (
        <span role="status" className={styles.ok}>
          {STAGE_WORDS[stage]}
        </span>
      )}
      {note?.error && (
        <span role="alert" className={styles.error}>
          {note.error}
        </span>
      )}
      {note?.ok && !stage && (
        <span role="status" className={styles.ok}>
          {note.ok}
        </span>
      )}
    </div>
  );
}
