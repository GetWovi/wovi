"use client";

import { useState } from "react";
import { walletLink, walletMessage } from "@/app/account/actions";
import { Button } from "@/components/ui/Button";
import styles from "./Account.module.css";

type Eip1193 = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };

/**
 * Links a wallet by signing a message. It only ever asks the wallet for its
 * address, its network id and one signature over plain text: never a
 * transaction. On a phone without a wallet in the browser it opens the page in
 * MetaMask's browser instead.
 */
export function WalletLink({ csrf }: { csrf: string }) {
  const [note, setNote] = useState<{ ok?: string; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function link() {
    setNote(null);
    const eth = (window as unknown as { ethereum?: Eip1193 }).ethereum;
    if (!eth) {
      if (/Android|iPhone|iPad/.test(navigator.userAgent)) {
        window.location.href = `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}`;
        return;
      }
      return setNote({ error: "No wallet found in this browser." });
    }
    setBusy(true);
    try {
      const [address] = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      const chainId = parseInt((await eth.request({ method: "eth_chainId" })) as string, 16);
      const msg = await walletMessage(csrf, address, chainId);
      if ("error" in msg) return setNote({ error: msg.error });
      const signature = (await eth.request({ method: "personal_sign", params: [utf8Hex(msg.message), address] })) as string;
      setNote(await walletLink(csrf, msg.challengeId, signature));
    } catch {
      setNote({ error: "The wallet request was closed or failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.inline}>
      <Button variant="secondary" size="sm" onClick={link} loading={busy}>
        Link a wallet
      </Button>
      {note?.error && (
        <span role="alert" className={styles.error}>
          {note.error}
        </span>
      )}
      {note?.ok && (
        <span role="status" className={styles.ok}>
          {note.ok}
        </span>
      )}
    </div>
  );
}

/** personal_sign takes the message as hex-encoded UTF-8. */
function utf8Hex(text: string): string {
  return `0x${Array.from(new TextEncoder().encode(text), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
