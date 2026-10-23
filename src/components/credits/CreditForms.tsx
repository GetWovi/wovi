"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setLimits, topUp, withdrawPurchase } from "@/app/app/credits/actions";
import { PurchaseConsent } from "@/components/safety/PurchaseConsent";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { creditWords, priceWords } from "@/lib/credits/config";
import { Coin } from "./CreditParts";
import styles from "./Credits.module.css";

/** One key per press, so a double click or a retry of the same press adds the pack once. */
function pressKey(pack: number): string {
  return `topup-${pack}-${crypto.randomUUID()}`;
}

/** The packs. With the test provider every button says so, and nothing is paid. */
export function TopUpPacks({ csrf, packs, test }: { csrf: string; packs: number[]; test: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<number | null>(null);
  const [consent, setConsent] = useState(false);
  const [needConsent, setNeedConsent] = useState(false);

  async function buy(pack: number) {
    // Phase 18: never ticked for the buyer, and nothing is bought without it.
    if (!consent) return setNeedConsent(true);
    setBusy(pack);
    const r = await topUp(csrf, pack, pressKey(pack), consent);
    setBusy(null);
    if (!r.ok) return toast({ tone: "warning", title: r.error });
    toast({ tone: "success", title: `${creditWords(r.value.credits)} added`, description: r.value.test ? "A test top-up: no money moved." : undefined });
    router.refresh();
  }

  return (
    <>
    <PurchaseConsent
      checked={consent}
      onChange={(v) => {
        setConsent(v);
        if (v) setNeedConsent(false);
      }}
      error={needConsent ? "Tick this first." : null}
    />
    <div className={styles.packs}>
      {packs.map((pack) => (
        <button key={pack} type="button" className={styles.pack} onClick={() => buy(pack)} disabled={busy !== null} aria-label={`${test ? "Test top-up" : "Top up"}: ${creditWords(pack)} for ${priceWords(pack)}`}>
          <span className={styles.packAmount}>
            <Coin size={14} /> {pack.toLocaleString("en-US")}
          </span>
          <span className={styles.packPrice}>
            {priceWords(pack)}
            {test ? ", test, not charged" : ""}
          </span>
          <span className={styles.packCta}>
            {busy === pack ? "Adding" : test ? "Add as a test" : `Buy and pay ${priceWords(pack)}`} <Icon name="arrow-right" size={14} />
          </span>
        </button>
      ))}
    </div>
    <p className={styles.packNote}>The price shown is the total you pay, taxes included.</p>
    </>
  );
}

export type WithdrawRow = { id: string; credits: number; price: string; boughtAt: string; until: string; test: boolean; withdrawn: { credits: number; price: string } | null };

/**
 * Phase 18, the right of withdrawal (Consumer Rights Directive Art. 11a):
 * every purchase still inside its 14 days, with "Withdraw from this
 * purchase" and a confirm step.
 */
export function WithdrawList({ csrf, rows }: { csrf: string; rows: WithdrawRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm(id: string) {
    setBusy(true);
    const r = await withdrawPurchase(csrf, id);
    setBusy(false);
    setAsking(null);
    if (!r.ok) return toast({ tone: "warning", title: r.error });
    toast({ tone: "success", title: `Withdrawn: ${creditWords(r.value.credits)} left your balance`, description: r.value.test ? "A test top-up: no money moves." : `We pay back ${priceWords(r.value.credits)} within 14 days. A receipt is in your email.` });
    router.refresh();
  }

  return (
    <ul className={styles.withdrawList}>
      {rows.map((w) => (
        <li key={w.id} className={styles.withdrawRow}>
          <span className={styles.limitWho}>
            <b>
              {creditWords(w.credits)} for {w.price}
              {w.test ? ", test" : ""}
            </b>
            <span>{w.withdrawn ? `Withdrawn: ${creditWords(w.withdrawn.credits)} back, ${w.withdrawn.price} owed to you.` : `Bought ${w.boughtAt}. You can withdraw until ${w.until}.`}</span>
          </span>
          {!w.withdrawn &&
            (asking === w.id ? (
              <span className={styles.withdrawAsk}>
                <span>The credits from it you have not used leave your balance. Sure?</span>
                <Button size="sm" variant="ghost" onClick={() => setAsking(null)} disabled={busy}>
                  Keep it
                </Button>
                <Button size="sm" onClick={() => confirm(w.id)} loading={busy}>
                  Confirm withdrawal
                </Button>
              </span>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setAsking(w.id)}>
                Withdraw from this purchase
              </Button>
            ))}
        </li>
      ))}
    </ul>
  );
}

export type LimitMember = { userId: string; name: string; role: string; used: number; limit: number | null };

const parse = (v: string): number | null | "bad" => {
  const t = v.replace(/[\s,]/g, "");
  if (!t) return null;
  return /^\d+$/.test(t) ? Number(t) : "bad";
};

/** The workspace's monthly limit and one per member. Empty means no limit. */
export function LimitsForm({ csrf, monthly, used, members }: { csrf: string; monthly: number | null; used: number; members: LimitMember[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [ws, setWs] = useState(monthly === null ? "" : String(monthly));
  const [each, setEach] = useState<Record<string, string>>(() => Object.fromEntries(members.map((m) => [m.userId, m.limit === null ? "" : String(m.limit)])));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const w = parse(ws);
    const out: Record<string, number | null> = {};
    for (const m of members) {
      const v = parse(each[m.userId] ?? "");
      if (v === "bad") return setError(`${m.name}: use a whole number of credits, or leave it empty for no limit.`);
      out[m.userId] = v;
    }
    if (w === "bad") return setError("The workspace limit is a whole number of credits, or empty for no limit.");
    setError(null);
    setBusy(true);
    const r = await setLimits(csrf, { monthly: w, members: out });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast({ tone: "success", title: "Limits saved" });
    router.refresh();
  }

  const pct = monthly ? Math.min(100, Math.round((used / monthly) * 100)) : 0;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className={styles.limitRow}>
        <span className={[styles.coin, styles.limitIcon].join(" ")} aria-hidden>
          <Icon name="coin" size={18} />
        </span>
        <span className={styles.limitWho}>
          <b>The whole workspace</b>
          <span>{monthly === null ? `${creditWords(used)} used this month, no limit` : `${used.toLocaleString("en-US")} of ${creditWords(monthly)} used this month`}</span>
          {monthly !== null && (
            <span className={styles.limitBar} aria-hidden>
              <span style={{ width: `${pct}%` }} />
            </span>
          )}
        </span>
        <input className={styles.limitInput} inputMode="numeric" aria-label="Monthly limit for the workspace, in credits" placeholder="No limit" value={ws} onChange={(e) => setWs(e.target.value)} />
      </div>
      {members.map((m) => (
        <div key={m.userId} className={styles.limitRow}>
          <Avatar name={m.name} size={40} />
          <span className={styles.limitWho}>
            <b>{m.name}</b>
            <span>
              {m.role}, {creditWords(m.used)} this month
            </span>
          </span>
          <input className={styles.limitInput} inputMode="numeric" aria-label={`Monthly limit for ${m.name}, in credits`} placeholder="No limit" value={each[m.userId] ?? ""} onChange={(e) => setEach((all) => ({ ...all, [m.userId]: e.target.value }))} />
        </div>
      ))}
      {error && (
        <p className={styles.limitError} role="alert">
          {error}
        </p>
      )}
      <div className={styles.limitFoot}>
        <span>Per calendar month. A run that would pass a limit does not start. Empty means no limit.</span>
        <Button type="submit" variant="secondary" loading={busy}>
          Save limits
        </Button>
      </div>
    </form>
  );
}
