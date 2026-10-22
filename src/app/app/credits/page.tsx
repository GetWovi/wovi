import type { Metadata } from "next";
import styles from "@/components/app/App.module.css";
import { AppShell } from "@/components/app/AppShell";
import { Mascot } from "@/components/brand/Mascot";
import { currentTime } from "@/components/builder/labels";
import { ActivityList } from "@/components/credits/ActivityList";
import { LimitsForm, TopUpPacks } from "@/components/credits/CreditForms";
import c from "@/components/credits/Credits.module.css";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatTile } from "@/components/ui/StatTile";
import { accounts } from "@/lib/accounts/server";
import { appPage } from "@/lib/app/server";
import { CREDITS, creditWords, priceWords } from "@/lib/credits/config";
import { appCredits } from "@/lib/credits/server";

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
        <StatTile label="Available" value={balance.available.toLocaleString("en-US")} hint={low ? "Low: runs may not start" : "credits to spend"} emphasis />
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
