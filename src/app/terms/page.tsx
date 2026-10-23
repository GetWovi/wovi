import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, legalStyles as s, type LegalSection } from "@/components/safety/LegalPage";
import { CREDITS, creditWords, priceWords } from "@/lib/credits/config";
import { CONTACT_EMAIL, OPERATOR, PURCHASE_CONSENT, WITHDRAWAL_DAYS } from "@/lib/legal/operator";
import { CATEGORY_INFO, SAFETY_CATEGORIES } from "@/lib/safety/rules";

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms for using WOVI: what the agents do, credits and prices, your right of withdrawal, the content rules, your content and how reports are handled.",
};

const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

const sections: LegalSection[] = [
  {
    id: "who",
    title: "1. Who we are",
    body: (
      <>
        <p>
          This is <b>WOVI</b>. You reach a person at {mail}. That address is also our point of contact for authorities and for anyone using WOVI.
        </p>
        <p>These terms are an agreement between you and us when you use WOVI. If you use WOVI for a company, you accept them for that company. You need to be 18 or older.</p>
      </>
    ),
  },
  {
    id: "service",
    title: "2. What WOVI does",
    body: (
      <>
        <p>WOVI is a set of AI agents. Each one does one job for social posts: ideas, hooks, scripts, captions, hashtags and versions of a post for other platforms. You fill in a form and pick a Brand Brain; the agent writes a draft in your voice.</p>
        <ul>
          <li>
            <b>Every result is a draft written by AI.</b> AI models from other companies write it, reached through OpenRouter. Drafts can be wrong. Read and check every one before you use it.
          </li>
          <li>
            <b>WOVI never posts anything.</b> You copy a draft and post it yourself. Nothing likes, follows, comments or replies for you.
          </li>
          <li>
            <b>A person approves.</b> Results wait for a person to approve them. API keys and assistants connected over MCP can start runs, but only a person can approve.
          </li>
          <li>Every draft is checked before you see it: content rules, the quality checks and your Brand Brain. A draft that fails goes to review with the reasons.</li>
        </ul>
      </>
    ),
  },
  {
    id: "account",
    title: "3. Your account and workspaces",
    body: (
      <>
        <p>You sign in with a one-time link and code sent to your email, or with a passkey. Keep your email and devices safe; anything done with your sign-in counts as done by you.</p>
        <p>A workspace holds your Brand Brains, runs and credits. You can invite people as owner, admin, editor or viewer. Owners and admins decide who is in it and what they may do.</p>
      </>
    ),
  },
  {
    id: "credits",
    title: "4. Credits and prices",
    body: (
      <>
        <ul>
          <li>
            Running an agent costs credits. One credit is always <b>$0.01</b>. Credits come in packs from {creditWords(CREDITS.minTopUpCredits)} ({priceWords(CREDITS.minTopUpCredits)}): {CREDITS.packs.map((p) => `${p.toLocaleString("en-US")} for ${priceWords(p)}`).join(", ")}.
          </li>
          <li>The price shown on a pack is the total you pay, taxes included.</li>
          <li>Before a run starts you see its estimate. The run never costs more than that. A run that fails or that you stop costs nothing; the credits go back.</li>
          <li>
            Credits are only for running agents on WOVI. They have no cash value, cannot be moved to someone else, cannot be turned into $WOVI or money, and are not an investment. See <Link href="/own-risk">Own risk and $WOVI</Link>.
          </li>
          <li>If we change prices, the change applies to packs bought after it. Credits you already have keep their value.</li>
        </ul>
      </>
    ),
  },
  {
    id: "withdrawal",
    title: `5. Your right to withdraw (${WITHDRAWAL_DAYS} days)`,
    body: (
      <>
        <p>
          If you buy credits as a consumer, you can withdraw from the purchase within <b>{WITHDRAWAL_DAYS} days</b> without giving a reason. Credits run a service that starts as soon as you buy, so before you pay you tick this:
        </p>
        <div className={s.box}>
          <p>
            <b>&ldquo;{PURCHASE_CONSENT}&rdquo;</b>
          </p>
        </div>
        <ul>
          <li>If you withdraw, the credits from that purchase you have not used leave your balance and we pay them back to the way you paid, within 14 days.</li>
          <li>Credits you already used are paid for.</li>
          <li>Once every credit from a purchase is used, you can no longer withdraw from it.</li>
          <li>
            <b>How:</b> on the Credits page, press <b>Withdraw from this purchase</b> and confirm. You get a receipt by email. You can also write to {mail} with your name, the purchase and the date, or use this form:
          </li>
        </ul>
        <div className={s.box}>
          <p>
            To {OPERATOR.name}, {CONTACT_EMAIL}: I hereby give notice that I withdraw from my contract for the following service: [the credit pack]. Ordered on [date]. Name: [your name]. Email: [the email you sign in with]. Date: [today].
          </p>
        </div>
        <p>Holder credits and test top-ups are not bought, so nothing is paid back for them.</p>
      </>
    ),
  },
  {
    id: "content-rules",
    title: "6. Content rules",
    body: (
      <>
        <p>WOVI does not write any of the following, and you may not use it to try:</p>
        <ul>
          {SAFETY_CATEGORIES.map((c) => (
            <li key={c}>
              <b>{CATEGORY_INFO[c].label}.</b> {CATEGORY_INFO[c].refusal}
            </li>
          ))}
        </ul>
        <h3>How we enforce them</h3>
        <ul>
          <li>
            <b>Requests.</b> Automated rules read what you type before a run starts. A request that breaks them is refused at once, nothing runs and no credits are held. The refusal says which field and why.
          </li>
          <li>
            <b>Drafts.</b> The same rules read every draft. A draft with hate, harassment, sexual content or unsafe advice is sent back to be rewritten; if every draft keeps it, nothing is shown and nothing is charged. Claims that cannot be backed up, invented reviews and named songs go to a person with the reasons.
          </li>
          <li>Each agent can add its own blocked words. The rules are narrow and can miss things or catch the wrong thing; tell us at {mail} when they do.</li>
        </ul>
        <h3>Posting on social platforms</h3>
        <ul>
          <li>You post yourself and you follow each platform&apos;s rules. WOVI shows them next to every agent.</li>
          <li>Add the platform&apos;s AI label when what you post needs one. Every result reminds you and keeps your note.</li>
          <li>Use music only from the platform&apos;s own library, and use the platform&apos;s paid partnership label for paid or promoted posts.</li>
          <li>Do not use WOVI to like, follow, comment or reply in bulk, or to run bots.</li>
        </ul>
      </>
    ),
  },
  {
    id: "your-content",
    title: "7. Your content",
    body: (
      <>
        <ul>
          <li>What you put into WOVI stays yours, and so do the drafts made for you, as far as the law gives anyone rights in AI-made text.</li>
          <li>You may only upload or paste content you own or have the rights to use. Before a file is stored you confirm this, and we keep that confirmation with the file.</li>
          <li>You let us store and process your content only to run WOVI for you: to send it to the AI models for your runs, show it to your workspace and keep it until you delete it.</li>
          <li>
            Builders improve agents. Your notes and edits reach them only if you turn on <b>Use my edits to improve agents</b> in your account. It is off until you do.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "moderation",
    title: "8. Reports and what we do about them",
    body: (
      <>
        <p>
          Anyone can report content on WOVI, with or without an account, on the <Link href="/report">report page</Link> or the Report link next to a result. You get a reference number at once and, if you give an email, a receipt and our decision.
        </p>
        <ul>
          <li>A person at WOVI reads every report. No automated tool decides on a report.</li>
          <li>We can take a result&apos;s output down (kept only in case of a dispute), delete a comment, or restrict an account. We do it when content breaks these terms or the law.</li>
          <li>When we act on your content we tell the workspace&apos;s owners what we did, why, which rule it rests on and how to object.</li>
          <li>You can object by writing to {mail} within six months; a person looks again. You can also go to court.</li>
        </ul>
      </>
    ),
  },
  {
    id: "api",
    title: "9. The API, MCP and x402",
    body: (
      <ul>
        <li>API keys belong to a workspace. Keep them secret; a run started with a key is charged to that workspace.</li>
        <li>Keys and assistants can run agents and read results. They can never approve, reject, top up or change limits.</li>
        <li>With x402, software pays per call without an account. What a call does not use is written down as owed back to the paying wallet.</li>
      </ul>
    ),
  },
  {
    id: "liability",
    title: "10. Our responsibility",
    body: (
      <>
        <ul>
          <li>We work to keep WOVI running and the agents useful, but we cannot promise it never goes down or that a draft is right. You decide what you post.</li>
          <li>If you are a consumer, the law gives you rights when the service is not as described, such as a run again, credits back or ending the agreement. These terms do not take those rights away.</li>
          <li>We are responsible for harm we cause on purpose or by gross negligence, and for death or personal injury. Nothing here limits that.</li>
          <li>If you use WOVI for a business, and apart from the cases above, our total liability is limited to what you paid us in the 12 months before the claim.</li>
        </ul>
      </>
    ),
  },
  {
    id: "ending",
    title: "11. Ending",
    body: (
      <ul>
        <li>You can delete your account at any time under Account, Your data. Paid credits left in workspaces that are deleted with it are paid back.</li>
        <li>We can suspend or close an account that seriously or repeatedly breaks these terms or the law. We tell you why and how to object. Unused paid credits are paid back unless the account was used for fraud.</li>
        <li>If we close WOVI, we tell you at least 30 days before and pay back unused paid credits.</li>
      </ul>
    ),
  },
  {
    id: "changes",
    title: "12. Changes to these terms",
    body: <p>We may change these terms when the law changes, when we add or change features, or for security. We tell you by email and in the app at least 30 days before a change that matters to you. If you do not accept it, you can leave before it takes effect and get your unused paid credits back.</p>,
  },
  {
    id: "disputes",
    title: "13. Complaints and law",
    body: (
      <>
        <p>Write to {mail} first; we answer within 14 days.</p>
        <p>
          If you are a consumer, you keep the protection of the law where you live, and you can take a dispute to the consumer disputes body or the courts where you live.
        </p>
      </>
    ),
  },
];

export default function TermsPage() {
  return <LegalPage eyebrow="Legal" title="Terms" lead="The short version: agents write drafts, you approve and post them yourself, credits are for runs only, and WOVI will not write fakes, hate or anything unsafe. The full terms follow." sections={sections} />;
}
