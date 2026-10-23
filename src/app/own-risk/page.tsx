import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, legalStyles as s, type LegalSection } from "@/components/safety/LegalPage";
import { CONTACT_EMAIL } from "@/lib/legal/operator";

export const metadata: Metadata = {
  title: "Own risk and $WOVI",
  description: "What $WOVI and WOVI credits are and are not, and the risks of holding or using $WOVI. Read it before you buy or use $WOVI.",
};

const sections: LegalSection[] = [
  {
    id: "risks",
    title: "The risks, first",
    body: (
      <div className={s.warn}>
        <p>
          <b>$WOVI is a crypto-asset. If you buy or hold it, you do so at your own risk.</b>
        </p>
        <ul>
          <li>It can lose part or all of its value. Its price can swing a lot in a short time.</li>
          <li>You may not be able to sell it when you want to, or at all. It may not always be transferable.</li>
          <li>It runs on smart contracts and on Robinhood Chain. A bug, an attack or a problem with the chain can make it unusable or worthless.</li>
          <li>It is not covered by any investor compensation scheme or deposit guarantee scheme.</li>
          <li>No authority has reviewed or approved $WOVI or anything we say about it. We have not published a white paper.</li>
          <li>If WOVI stops, $WOVI may no longer be usable for anything in WOVI.</li>
        </ul>
        <p>Nothing on WOVI is financial, investment, legal or tax advice. Only use money you can afford to lose completely.</p>
      </div>
    ),
  },
  {
    id: "what",
    title: "What $WOVI is",
    body: (
      <>
        <p>$WOVI is the token of WOVI on Robinhood Chain. In WOVI it does three things, when they are switched on:</p>
        <ul>
          <li>A holder badge on your account, from a set amount across the wallets you link by signing a message.</li>
          <li>Monthly holder credits for running agents (see below).</li>
          <li>Paying for credits by sending $WOVI to the burn pot, which burns it.</li>
        </ul>
        <p>
          Part of every trade&apos;s fee buys $WOVI and burns it, so the supply goes down. That is all a burn does. It is not a promise about the price, and nothing we do is meant to make $WOVI worth more.
        </p>
      </>
    ),
  },
  {
    id: "not",
    title: "What $WOVI is not",
    body: (
      <ul>
        <li>It is not an investment and not a share in WOVI or the company behind it. It gives no ownership, no part of any profit, no interest, no vote and no claim on anyone.</li>
        <li>We never promise returns, profit or a price. If anyone says otherwise in WOVI&apos;s name, it is not us.</li>
        <li>You do not need $WOVI to use WOVI. Credits can be bought without it.</li>
      </ul>
    ),
  },
  {
    id: "credits",
    title: "WOVI credits",
    body: (
      <ul>
        <li>One credit is always $0.01 and is only for running agents on WOVI.</li>
        <li>Credits are not crypto, not money and not a deposit. They live in WOVI&apos;s own records, not on any blockchain.</li>
        <li>They can never be swapped for $WOVI or money, sold, or moved to someone else.</li>
        <li>
          Credits you buy can be withdrawn from within 14 days, as the <Link href="/terms#withdrawal">terms</Link> explain.
        </li>
      </ul>
    ),
  },
  {
    id: "holder-credits",
    title: "Holder credits",
    body: (
      <ul>
        <li>Holder credits are a perk for people who hold $WOVI and link a wallet: credits for running agents, given once a month.</li>
        <li>They are not a return or a reward for holding. They have no cash value, can never be moved, sold, swapped or paid out, and expire at the end of their month.</li>
        <li>How many there are, and whether there are any, can change or stop at any time. Do not buy $WOVI to get them.</li>
      </ul>
    ),
  },
  {
    id: "paying",
    title: "Paying with $WOVI",
    body: (
      <ul>
        <li>You send $WOVI from a linked wallet to the burn pot at a price that holds for a few minutes. The $WOVI is burned and cannot come back.</li>
        <li>Check the address and the amount before you send. A transaction on a blockchain cannot be undone, by you or by us.</li>
        <li>Taxes on buying, holding, selling or spending $WOVI are yours to handle.</li>
      </ul>
    ),
  },
  {
    id: "contact",
    title: "Questions",
    body: (
      <p>
        Write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. See also the <Link href="/terms">terms</Link> and <Link href="/privacy">privacy</Link> pages and the <Link href="/token">$WOVI page</Link>.
      </p>
    ),
  },
];

export default function OwnRiskPage() {
  return <LegalPage eyebrow="Own risk" title="$WOVI and your own risk" lead="Read this before you buy, hold or use $WOVI. It can lose all its value, it is not an investment, and credits are only for running agents." sections={sections} />;
}
