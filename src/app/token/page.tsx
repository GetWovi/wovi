import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/app/CopyButton";
import { currentTime } from "@/components/builder/labels";
import { Sparkle, Sticker } from "@/components/brand/Accents";
import { Mascot } from "@/components/brand/Mascot";
import { SiteFooter, SiteHeader } from "@/components/site/SiteHeader";
import t from "@/components/token/Token.module.css";
import { ButtonLink } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { creditWords } from "@/lib/credits/config";
import { payStatus } from "@/lib/token/config";
import { tokenServices } from "@/lib/token/local";
import type { TokenPanel } from "@/lib/token/panel";
import { ethWords, percentWords, shortAddress, shortWords, untilWords, utcWords, wholeWords } from "@/lib/token/words";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "$WOVI",
  description: "$WOVI, the token of WOVI. Part of every trade's fee buys $WOVI on the market and burns it, so the supply only goes down.",
};

const STAGE_WORDS: Record<TokenPanel["stage"], string> = {
  soon: "Coming soon",
  deployed: "Contracts live, launch soon",
  live: "Live on Robinhood Chain",
};

function Address({ label, hint, value, explorer }: { label: string; hint: string; value: string | null; explorer: string }) {
  return (
    <div className={t.address}>
      <span>
        <b>{label}</b>
        <small>{hint}</small>
      </span>
      <span className={t.addressValue}>{value ?? "Not launched yet"}</span>
      {value ? (
        <span className={t.addressTools}>
          <CopyButton text={value} label="Copy" />
          <a className={t.explorer} href={`${explorer}/address/${value}`} target="_blank" rel="noreferrer">
            <Icon name="link" size={14} /> Explorer
          </a>
        </span>
      ) : (
        <span />
      )}
    </div>
  );
}

export default async function TokenPage() {
  const s = tokenServices();
  if (!s.config.pageOn) notFound();
  const p = await s.panels.panel();
  const now = currentTime();
  const live = p.stage === "live";
  const burnedShare = live && p.burned && p.launchSupply ? percentWords(p.burned, p.launchSupply) : null;
  const holderCredits = s.config.holder.tiers.length > 0;
  const payOn = payStatus(s.config).on;

  const perks: { icon: IconName; title: string; text: string }[] = [
    { icon: "check-circle", title: "A holder badge", text: `Link a wallet to your WOVI account by signing a message (no transaction). From ${Number(s.config.holder.minWhole).toLocaleString("en-US")} $WOVI across your linked wallets, your account shows a holder badge.` },
  ];
  if (holderCredits) {
    perks.push({ icon: "coin", title: "Monthly holder credits", text: `Once a month, holders get credits for running agents, from ${creditWords(s.config.holder.tiers[0].credits)}. They work on agents only, never move, swap or pay out, and expire at the end of the month.` });
  }
  if (payOn) {
    perks.push({ icon: "flame", title: "Pay for credits in $WOVI", text: "Buy credits by sending $WOVI from a linked wallet to the burn pot. That $WOVI is burned with the next burn. One credit is always one cent." });
  }

  return (
    <>
      <SiteHeader
        active="token"
        links={[...(live ? [{ href: "#burns", label: "Burns" }] : []), { href: "#how", label: "How it works" }, ...(p.stage !== "soon" ? [{ href: "#addresses", label: "Addresses" }] : [])]}
      />
      <main className={["container", t.main].join(" ")}>
        <section className={t.hero} aria-label="$WOVI">
          <div className={t.copy}>
            <span className={[t.stage, live ? t.stageLive : ""].join(" ")}>{STAGE_WORDS[p.stage]}</span>
            <span className="eyebrow">$WOVI, the token of WOVI</span>
            <h1 className={t.h1}>
              The supply only <em>goes down.</em>
            </h1>
            <p className={t.lead}>Part of every trade&apos;s fee buys $WOVI on the market and burns it, so the supply only goes down. Every burn is on Robinhood Chain for anyone to check.</p>
            <div className={t.actions}>
              {p.buyUrl && live ? (
                <ButtonLink href={p.buyUrl} size="lg" leading={<Icon name="coin" size={20} />} target="_blank" rel="noreferrer">
                  How to buy
                </ButtonLink>
              ) : (
                <span className={t.soonBuy}>
                  <Icon name="clock" size={18} /> {live ? "Buy link coming" : "Buying opens at launch"}
                </span>
              )}
              <ButtonLink href={live ? "#burns" : "#how"} variant="secondary" size="lg">
                {live ? "See the burns" : "How it works"}
              </ButtonLink>
            </div>
          </div>

          {live && p.burned ? (
            <div className={t.counter} aria-label="Burned so far">
              <span className={t.counterLabel}>Burned so far</span>
              <span className={t.counterNum}>
                {shortWords(p.burned)}
                <small>$WOVI</small>
              </span>
              <span className={t.counterText}>
                In {p.count.toLocaleString("en-US")} burn{p.count === 1 ? "" : "s"}, {ethWords(p.ethSpent ?? "0")} ETH spent buying it on the market.
              </span>
              <Sticker tone="cream" tilt={8} className={t.counterSticker}>
                gone for good
              </Sticker>
              <Sparkle size={30} color="var(--on-blaze)" className={t.counterSparkle} />
              <span className={t.counterDisc}>
                <Mascot pose="done" size={104} label="Wovi, celebrating a burn" />
              </span>
            </div>
          ) : (
            <div className={[t.counter, t.counterCalm].join(" ")} aria-label="Before the first burn">
              <span className={t.counterLabel}>{live ? "Burned so far" : p.stage === "deployed" ? "The contracts are live" : "Before launch"}</span>
              <span className={t.counterNum}>
                0<small>$WOVI</small>
              </span>
              <span className={t.counterText}>{live ? "The first burn comes once trading fees have built up. It shows here the minute it lands." : p.stage === "deployed" ? "The burn pot and the fee address are on Robinhood Chain. $WOVI launches from them; the first burn follows the first trades." : "The burn pot, the fee address and $WOVI come next. This page fills in from the chain as they do."}</span>
              <Sticker tone="cream" tilt={-7} className={t.counterSticker}>
                {live ? "first burn soon" : "soon"}
              </Sticker>
              <Mascot pose="wait" size={150} ink="cream" className={t.counterMascot} label="Wovi, waiting" />
            </div>
          )}
        </section>

        {p.stale && (
          <section className={t.section}>
            <div className={t.stale} role="status">
              <Icon name="info" size={18} />
              <span>{p.problem ?? `Robinhood Chain did not answer just now. These numbers are the last reading, from ${utcWords(p.readAt)}; they refresh on the next look.`}</span>
            </div>
          </section>
        )}

        {live && p.supply && (
          <section className={t.section} aria-label="Supply">
            <div className={t.tiles}>
              <div className={t.tile}>
                <span>Supply now</span>
                <b>{shortWords(p.supply)}</b>
                <small>{wholeWords(p.supply)} $WOVI</small>
              </div>
              <div className={t.tile}>
                <span>Supply at launch</span>
                <b>{p.launchSupply ? shortWords(p.launchSupply) : "Not read yet"}</b>
                <small>{p.launchSupply ? `${wholeWords(p.launchSupply)} $WOVI` : ""}</small>
              </div>
              <div className={t.tile}>
                <span>Burned share</span>
                <b>{burnedShare ?? "0.00%"}</b>
                <div className={t.bar} aria-hidden="true">
                  <i style={{ width: burnedShare ? `max(4px, ${burnedShare})` : "0" }} />
                </div>
              </div>
              <div className={t.tile}>
                <span>Burns</span>
                <b>{p.count.toLocaleString("en-US")}</b>
                <small>{p.lastBurnAt ? `Last one ${utcWords(p.lastBurnAt)}` : "None yet"}</small>
              </div>
            </div>
          </section>
        )}

        <section id="how" className={t.section}>
          <div className={t.two}>
            {live && (
              <div className={t.panel} aria-label="The next burn">
                <div className={t.panelHead}>
                  <div>
                    <span className={t.eyebrowSm}>The next burn</span>
                    <h2>{p.next ? (p.next.ready ? "Ready now" : p.next.at ? `Due ${untilWords(p.next.at, now)}` : "Waiting") : "Nothing waiting yet"}</h2>
                    <p>{p.next ? (p.next.ready ? "The burn can go through now. Anyone can call it; WOVI's keeper does on a schedule." : p.next.at ? `Not before ${utcWords(p.next.at)}. Burns are at least 30 minutes apart, and a small amount waits for more, never longer than a day.` : "It goes when the burn pot allows it.") : "Fees from trades collect in the burn pot until the next burn."}</p>
                  </div>
                  <Mascot pose={p.next?.ready ? "move" : "wait"} size={84} label="" />
                </div>
                {p.next && (
                  <div className={t.pairs}>
                    <div className={t.pair}>
                      <span>ETH waiting to buy $WOVI</span>
                      <b>{ethWords(p.next.eth)} ETH</b>
                    </div>
                    <div className={t.pair}>
                      <span>$WOVI waiting to burn</span>
                      <b>{wholeWords(p.next.tokens)}</b>
                    </div>
                  </div>
                )}
                <p className={t.fine}>A burn spends at most 1% of the market&apos;s depth at a time. What is left waits for the next one.</p>
              </div>
            )}
            <div className={[t.panel, live ? t.panelAlt : ""].join(" ")} aria-label="How the burn works">
              <div className={t.panelHead}>
                <div>
                  <span className={t.eyebrowSm}>How the burn works</span>
                  <h2>Four steps, all on chain</h2>
                </div>
              </div>
              <ol className={t.steps}>
                <li>
                  <span>
                    <b>Every trade pays a fee</b>
                    <span>Part of each $WOVI trade&apos;s fee goes to the burn pot, a contract with no owner and no way to withdraw.</span>
                  </span>
                </li>
                <li>
                  <span>
                    <b>It buys $WOVI on the market</b>
                    <span>The burn pot spends its ETH buying $WOVI, at most 1% of the market&apos;s depth per burn, at most every 30 minutes.</span>
                  </span>
                </li>
                <li>
                  <span>
                    <b>It burns what it bought</b>
                    <span>With the token&apos;s own burn(): the total supply falls by exactly that amount, and the burn checks that it did.</span>
                  </span>
                </li>
                <li>
                  <span>
                    <b>Anyone can check it</b>
                    <span>Every burn is a transaction on Robinhood Chain, listed below with a link to the explorer.</span>
                  </span>
                </li>
              </ol>
            </div>
            {!live && (
              <div className={t.panel} aria-label="Where things stand">
                <div className={t.panelHead}>
                  <div>
                    <span className={t.eyebrowSm}>Where things stand</span>
                    <h2>{p.stage === "deployed" ? "Deployed, not launched" : "Before the contracts"}</h2>
                    <p>{p.stage === "deployed" ? "The burn pot and the fee address are deployed. The token's address appears here the moment it launches." : "Nothing is deployed yet. The addresses appear here when it is, read from the chain."}</p>
                  </div>
                  <Mascot pose="hello" size={84} label="" />
                </div>
                <div className={t.empty}>
                  <Icon name="clock" size={22} />
                  <span>
                    <b>No burns before launch</b>
                    <span>The first burn follows the first trades.</span>
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>

        {live && (
          <section id="burns" className={t.section}>
            <div className={t.panel} aria-label="Recent burns">
              <div className={t.panelHead}>
                <div>
                  <span className={t.eyebrowSm}>Recent burns</span>
                  <h2>Every burn, newest first</h2>
                  <p>Read from the burn pot&apos;s own events on Robinhood Chain.</p>
                </div>
              </div>
              {p.latest.length === 0 ? (
                <div className={t.empty}>
                  <Mascot pose="wait" size={56} label="" />
                  <span>
                    <b>No burns yet</b>
                    <span>The first one lands once fees have built up in the burn pot.</span>
                  </span>
                </div>
              ) : (
                <div className={t.tableWrap}>
                  <table className={t.table}>
                    <thead>
                      <tr>
                        <th>Burn</th>
                        <th>When</th>
                        <th>$WOVI burned</th>
                        <th>ETH spent</th>
                        <th>Transaction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.latest.map((b) => (
                        <tr key={b.n}>
                          <td>
                            <span className={t.num}>{b.n}</span>
                          </td>
                          <td data-label="When:">{utcWords(b.at)}</td>
                          <td data-label="$WOVI burned:">
                            <b>{wholeWords(b.tokens)}</b>
                          </td>
                          <td data-label="ETH spent:">{ethWords(b.eth)} ETH</td>
                          <td>
                            <a className={t.explorer} href={`${p.explorer}/tx/${b.tx}`} target="_blank" rel="noreferrer">
                              <span className={t.mono}>{shortAddress(b.tx, 8, 6)}</span> <Icon name="link" size={14} />
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {p.stage !== "soon" && (
          <section id="addresses" className={t.section}>
            <div className={t.panel} aria-label="Addresses">
              <div className={t.panelHead}>
                <div>
                  <span className={t.eyebrowSm}>Addresses</span>
                  <h2>The contracts, on Robinhood Chain</h2>
                  <p>Check them on the explorer before you do anything with them.</p>
                </div>
              </div>
              <div className={t.addresses}>
                <Address label="$WOVI" hint="The token" value={p.token} explorer={p.explorer} />
                <Address label="Burn pot" hint="Buys $WOVI and burns it" value={p.pot} explorer={p.explorer} />
                <Address label="Fee address" hint="Where trading fees arrive" value={p.splitter} explorer={p.explorer} />
              </div>
            </div>
          </section>
        )}

        {live && (
          <section className={t.section}>
            <div className={[t.panel, t.panelAlt].join(" ")} aria-label="$WOVI on WOVI">
              <div className={t.panelHead}>
                <div>
                  <span className={t.eyebrowSm}>On WOVI</span>
                  <h2>What $WOVI does in the app</h2>
                  <p>Small perks for using WOVI. Credits only ever pay for running agents.</p>
                </div>
              </div>
              <div className={t.perks}>
                {perks.map((k) => (
                  <div key={k.title} className={t.perk}>
                    <span className={t.perkIcon}>
                      <Icon name={k.icon} size={22} />
                    </span>
                    <h3>{k.title}</h3>
                    <p>{k.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className={t.section}>
          <div className={t.risk} role="note">
            <Icon name="warning" size={24} />
            <div>
              <b>Your own risk</b>
              <p>Crypto is volatile and $WOVI can lose all its value. Nothing here is financial advice. $WOVI gives no ownership of WOVI, no share of its profits and no other rights. Credits are for running agents and nothing else. Use at your own risk.</p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
