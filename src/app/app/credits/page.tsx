import type { Metadata } from "next";
import styles from "@/components/app/App.module.css";
import { AppShell } from "@/components/app/AppShell";
import { Mascot } from "@/components/brand/Mascot";
import { currentTime } from "@/components/builder/labels";
import { ActivityList } from "@/components/credits/ActivityList";
import { LimitsForm, TopUpPacks, WithdrawList, type WithdrawRow } from "@/components/credits/CreditForms";
import { appWithdrawals } from "@/lib/safety/server";
import c from "@/components/credits/Credits.module.css";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatTile } from "@/components/ui/StatTile";
import { accounts } from "@/lib/accounts/server";
import { appPage } from "@/lib/app/server";
import { CREDITS, creditWords, priceWords } from "@/lib/credits/config";
import { appCredits } from "@/lib/credits/server";
import { PayWithWovi } from "@/components/credits/PayWithWovi";
import { HolderBadge } from "@/components/token/HolderBadge";
import { tokenServices } from "@/lib/token/local";
import { utcWords } from "@/lib/token/words";

export const metadata: Metadata = { title: "Credits", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CreditsPage() {
  const { info, me, workspaceId, csrf } = await appPage("/app/credits");
  const g = appCredits();
  const summary = await g.summary(me, workspaceId);
  const { balance, mine, limits, payments, packs } = summary;
  const members = await accounts().workspaces.members(me, workspaceId);
  const names = new Map(members.map((m) => [m.userId, m.name ?? m.email ?? "Someone"]));
  const [activity, usage] = summary.seesCosts ? await Promise.all([g.activity(me, workspaceId, { limit: 40 }), g.usage(me, workspaceId, members.map((m) => m.userId))]) : [[], {} as Record<string, number>];
  const now = currentTime();
  const low = balance.available < 10;
  // $WOVI (phase 17): holder credits beside paid credits, and paying with $WOVI. Both off unless switched on.
  const ts = tokenServices();
  const holderView = ts.config.holder.on ? await ts.holders.view(info.user.id) : null;
  const showHolder = balance.holder.available > 0 || Boolean(holderView?.creditsOn);
  const pay = ts.pay?.status().on ? ts.pay.status() : null;
  const myWallets = pay ? (await accounts().wallets.list(info.user.id)).map((w) => w.address) : [];
  // Phase 18: purchases still inside their 14 days to withdraw, for people who top up.
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const withdrawable: WithdrawRow[] = summary.canManage
    ? (await appWithdrawals().list(me, workspaceId)).map((w) => ({ id: w.topUp.id, credits: w.topUp.credits, price: priceWords(w.topUp.credits), boughtAt: day(w.topUp.completedAt ?? w.topUp.createdAt), until: day(w.until), test: w.topUp.test, withdrawn: w.withdrawn ? { credits: w.withdrawn.credits, price: priceWords(w.withdrawn.credits) } : null }))
    : [];

  return (
    <AppShell info={info} active="credits">
      <div className={styles.head}>
        <div className={styles.headText}>
          <span className="eyebrow">Credits</span>
          <h1 className={styles.h1}>What runs cost, and what is left</h1>
          <p className={styles.lead}>One credit is one cent. A run holds its estimate while it works, then costs what it really used, never more than the estimate you saw.</p>
        </div>
        {summary.canManage && payments && (
          <ButtonLink href="#top-up" leading={<Icon name="plus" size={18} />}>
            Top up
          </ButtonLink>
        )}
      </div>

      <div className={c.tiles}>
        <StatTile label="Available" value={balance.available.toLocaleString("en-US")} hint={low ? "Low: runs may not start" : balance.holder.available > 0 ? `${balance.paid.toLocaleString("en-US")} paid, ${balance.holder.available.toLocaleString("en-US")} holder credits` : "credits to spend"} emphasis />
        <StatTile label="Held for runs in progress" value={balance.held.toLocaleString("en-US")} hint={balance.held ? "comes back if a run uses less" : "nothing running"} />
        <StatTile
          label={summary.seesCosts ? "Used this month" : "You used this month"}
          value={(summary.seesCosts ? balance.usedThisMonth : mine.used).toLocaleString("en-US")}
          hint={summary.seesCosts ? (limits?.monthly != null ? `of a ${creditWords(limits.monthly)} limit` : "no monthly limit") : mine.limit !== null ? `of your ${creditWords(mine.limit)} limit` : "no limit for you"}
        />
      </div>

      <div className={c.layout}>
        <div className={styles.stack}>
          <section id="top-up" className={[styles.panel, styles.stack].join(" ")} aria-label="Top up">
            <div className={c.panelHead}>
              <div>
                <h2>Top up</h2>
                <p>From {priceWords(summary.minTopUp)} ({creditWords(summary.minTopUp)}). One credit is always one cent.</p>
              </div>
              {payments?.test && (
                <span className={c.testBadge}>
                  <Icon name="info" size={14} /> {payments.label}
                </span>
              )}
            </div>
            {!payments ? (
              <p className={styles.muted}>Top-ups are not open yet.</p>
            ) : summary.canManage ? (
              <>
                {payments.test && (
                  <div className={c.testNote}>
                    <Icon name="info" size={18} />
                    <span>Test mode. No card, no real money: a test top-up adds credits at once so the whole flow can be tried here. Real payments plug in later.</span>
                  </div>
                )}
                <TopUpPacks csrf={csrf} packs={packs} test={payments.test} />
              </>
            ) : (
              <div className={[styles.panelAlt, styles.panelTight, styles.wovi, styles.panel].join(" ")}>
                <Mascot pose="wait" size={84} label="Wovi, waiting" />
                <b>Owners and admins top up</b>
                <span>Ask one of them when the balance runs low.</span>
              </div>
            )}
          </section>

          {pay && summary.canManage && (
            <section id="pay-wovi" className={[styles.panel, styles.stack].join(" ")} aria-label="Pay with $WOVI">
              <div className={c.panelHead}>
                <div>
                  <h2>Pay with $WOVI</h2>
                  <p>Send $WOVI from a linked wallet to the burn pot. It is burned with the next burn, and the credits land here.</p>
                </div>
              </div>
              {myWallets.length ? (
                <PayWithWovi csrf={csrf} packs={pay.packs} wallets={myWallets} source={pay.source} explorer={ts.config.explorer} />
              ) : (
                <p className={styles.muted}>
                  Link a wallet on <a href="/account#wovi">your account</a> first: the $WOVI has to come from a wallet linked to you.
                </p>
              )}
            </section>
          )}

          {withdrawable.length > 0 && (
            <section id="withdraw" className={[styles.panel, styles.stack].join(" ")} aria-label="Withdraw from a purchase">
              <div className={c.panelHead}>
                <div>
                  <h2>Withdraw from a purchase</h2>
                  <p>
                    Within 14 days of buying. The credits from it you have not used come off your balance and we pay them back. <a href="/terms#withdrawal">How it works</a>.
                  </p>
                </div>
              </div>
              <WithdrawList csrf={csrf} rows={withdrawable} />
            </section>
          )}

          <section className={[styles.panel, styles.stack].join(" ")} aria-label="History">
            <div className={c.panelHead}>
              <div>
                <h2>History</h2>
                <p>{summary.seesCosts ? "Every run with what it held and what it cost, and every top-up." : "Owners and admins see what each run cost."}</p>
              </div>
            </div>
            {summary.seesCosts && activity.length > 0 ? (
              <ActivityList items={activity} names={names} now={now} />
            ) : (
              <div className={[styles.panelAlt, styles.panelTight, styles.wovi, styles.panel].join(" ")}>
                <Mascot pose="hello" size={84} label="Wovi, saying hello" />
                <b>{summary.seesCosts ? "Nothing yet" : `You used ${creditWords(mine.used)} this month`}</b>
                <span>{summary.seesCosts ? "Top up, then run an agent: it shows here with what it cost." : "Your runs still show their estimate before you start them."}</span>
              </div>
            )}
          </section>
        </div>

        <div className={styles.stack}>
          {showHolder && (
            <section id="holder-credits" className={[styles.panel, styles.stack].join(" ")} aria-label="Holder credits">
              <div className={c.panelHead}>
                <div>
                  <h2>Holder credits</h2>
                  <p>A monthly perk for $WOVI holders, kept apart from paid credits.</p>
                </div>
                {holderView?.holder && <HolderBadge />}
              </div>
              <div className={c.holderPool}>
                <div className={c.holderNum}>
                  <b>{balance.holder.available.toLocaleString("en-US")}</b>
                  <span>holder credits left, until {utcWords(Date.parse(balance.holder.expiresAt))}</span>
                </div>
                <div className={c.split}>
                  <div>
                    <span>Paid credits</span>
                    <b>{balance.paid.toLocaleString("en-US")}</b>
                  </div>
                  <div>
                    <span>Holder credits</span>
                    <b>{balance.holder.available.toLocaleString("en-US")}</b>
                  </div>
                </div>
                <ul className={c.rules}>
                  <li>
                    <b>For runs only.</b> They pay for agents and nothing else: never moved, swapped or paid out.
                  </li>
                  <li>
                    <b>Used {g.credits.cfg.holderSpendOrder === "after_paid" ? "after" : "before"} paid credits.</b> A run takes {g.credits.cfg.holderSpendOrder === "after_paid" ? "paid credits first, then holder credits" : "holder credits first, then paid credits"}, and anything it gives back returns to the pool it came from.
                  </li>
                  <li>
                    <b>Gone at the end of the month.</b> What is left expires; the next month&apos;s come from a new snapshot.
                  </li>
                </ul>
                {holderView && !holderView.holder && (
                  <p className={styles.muted}>
                    Link a wallet holding $WOVI on <a href="/account#wovi">your account</a> to get them in your personal workspace each month.
                  </p>
                )}
              </div>
            </section>
          )}

          <section id="limits" className={[styles.panel, styles.stack].join(" ")} aria-label="Monthly limits">
            <div className={c.panelHead}>
              <div>
                <h2>Monthly limits</h2>
                <p>{summary.canManage ? "Cap what the workspace and each person can spend in a month." : "Set by owners and admins."}</p>
              </div>
            </div>
            {summary.canManage && limits ? (
              <LimitsForm csrf={csrf} monthly={limits.monthly} used={balance.usedThisMonth} members={members.map((m) => ({ userId: m.userId, name: names.get(m.userId) ?? "Someone", role: m.role, used: usage[m.userId] ?? 0, limit: limits.members[m.userId] ?? null }))} />
            ) : (
              <p className={styles.muted}>{mine.limit !== null ? `Your limit is ${creditWords(mine.limit)} a month. You used ${creditWords(mine.used)}.` : "You have no limit of your own. The workspace's balance is the limit."}</p>
            )}
          </section>

          <section className={[styles.panel, styles.panelAlt, styles.stack].join(" ")} aria-label="How credits work">
            <div className={c.panelHead}>
              <h2>How it works</h2>
            </div>
            <ul className={c.rules}>
              <li>
                <b>See it first.</b> Every agent and pipeline shows about what it costs before you run it.
              </li>
              <li>
                <b>Pay what it used.</b> A run is charged its real cost, rounded up to whole credits, at least {creditWords(CREDITS.minCreditsPerRun)}. Never more than the estimate.
              </li>
              <li>
                <b>Failed runs are free.</b> A run that fails or is stopped gives back everything it held.
              </li>
              <li>
                <b>Pipelines hold once.</b> The whole chain is held at the start; each step is charged inside it and the rest comes back at the end.
              </li>
              <li>
                <b>Only for runs.</b> Credits pay for agents here and nothing else. They cannot be cashed out or moved.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
