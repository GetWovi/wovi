import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/app/CopyButton";
import { Mascot } from "@/components/brand/Mascot";
import { SiteFooter, SiteHeader } from "@/components/site/SiteHeader";
import { LaunchPanel, LaunchSummaryCard } from "@/components/token/LaunchPanel";
import l from "@/components/token/Launch.module.css";
import { Icon } from "@/components/ui/Icon";
import { tokenConfigFromEnv } from "@/lib/token/config";
import { launchPageOn, launchStatus } from "@/lib/token/launch";
import { launchDeps } from "@/lib/token/launch-server";
import { ethExact, wholeWords } from "@/lib/token/words";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Launch $WOVI",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

/**
 * /token/launch: where Funkai launches $WOVI from his own MetaMask. Linked from nowhere, and a 404 unless
 * WOVI_LAUNCH_PAGE=on. Every check is read from the chain on each load (src/lib/token/launch.ts); any that fails is
 * one sentence and no button.
 */
export default async function LaunchPage() {
  if (!launchPageOn()) notFound();
  const explorer = tokenConfigFromEnv().explorer;
  const status = await launchStatus(launchDeps());

  return (
    <>
      <SiteHeader />
      <main className={["container", l.main].join(" ")}>
        <section className={l.hero} aria-label="Launch $WOVI">
          <span className="eyebrow">$WOVI on Robinhood Chain</span>
          <h1 className={l.h1}>
            Launch <em>$WOVI</em>
          </h1>
          <p className={l.lead}>One transaction from your own MetaMask. This page builds it, checks it against the chain and runs it once on the network before you sign. Your key never leaves your wallet.</p>
        </section>

        {status.kind === "blocked" || status.kind === "no_dev_buy" ? (
          <section className={l.section}>
            <div className={l.stop} role="alert">
              <Icon name="warning" size={24} />
              <div>
                <b>{status.kind === "no_dev_buy" ? "Not ready" : "Stopped"}</b>
                <p>{status.problem}</p>
                <p className={l.fine}>Nothing can be sent from this page until this is fixed. Reload to check again.</p>
              </div>
            </div>
          </section>
        ) : status.kind === "launched" ? (
          <section className={l.section}>
            <div className={l.done} aria-label="$WOVI is launched">
              <div className={l.doneHead}>
                <Mascot pose="done" size={88} label="Wovi, celebrating" />
                <div>
                  <span className={l.eyebrowSm}>Already launched</span>
                  <h2>$WOVI is live</h2>
                  <p>The burn pot launched it. A second launch is not possible.</p>
                </div>
              </div>
              <div className={l.rows}>
                <div className={l.row}>
                  <span>Token</span>
                  <b className={l.mono}>{status.launched.token}</b>
                  <CopyButton text={status.launched.token} label="Copy" />
                </div>
                <div className={l.row}>
                  <span>Dev buy</span>
                  <b>
                    {wholeWords(status.launched.openingBuyTokens)} $WOVI for {ethExact(status.launched.openingBuyEth)} ETH
                  </b>
                  <span />
                </div>
              </div>
              <div className={l.links}>
                <a className={l.linkPill} href={`https://ponsfamily.com/launchpad/${status.launched.token}`} target="_blank" rel="noreferrer">
                  <Icon name="link" size={16} /> Pons page
                </a>
                <a className={l.linkPill} href={`${explorer}/address/${status.launched.token}`} target="_blank" rel="noreferrer">
                  <Icon name="link" size={16} /> Explorer
                </a>
              </div>
            </div>
          </section>
        ) : (
          <section className={[l.section, l.two].join(" ")}>
            <LaunchSummaryCard summary={status.summary} />
            <LaunchPanel summary={status.summary} explorer={explorer} />
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
