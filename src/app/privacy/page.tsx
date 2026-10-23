import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, legalStyles as s, type LegalSection } from "@/components/safety/LegalPage";
import { MODEL_ROUTES } from "@/lib/agents/catalog";
import { CONTACT_EMAIL, IMPROVE_CONSENT, operatorLine } from "@/lib/legal/operator";
import { RETENTION } from "@/lib/privacy/privacy";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What WOVI collects, why, who helps us run it, how long we keep it and how to get a copy or delete it.",
};

const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

/** The companies whose models the agents use, from the model routes in code. */
const MODEL_MAKERS: Record<string, string> = { openai: "OpenAI", anthropic: "Anthropic", google: "Google" };
const makers = [...new Set(MODEL_ROUTES.filter((r) => r.provider === "openrouter" && r.model).map((r) => MODEL_MAKERS[r.model!.split("/")[0]] ?? r.model!.split("/")[0]))];

const ROWS: { what: string; why: string; basis: string; kept: string }[] = [
  { what: "Your email, name, passkeys (public keys only) and sign-ins (device, times)", why: "Your account and signing you in safely", basis: "Our agreement with you; security is our legitimate interest", kept: "While you have an account. A session ends after 30 days at most." },
  { what: "What you put in a workspace: Brand Brains, posts you paste, mood board files, what you type in forms, the drafts, comments and decisions", why: "Running the agents for you and your team", basis: "Our agreement with you", kept: "Until you delete it, the workspace or your account" },
  { what: "Credits, top-ups and payments", why: "Selling credits and keeping the books", basis: "The law (bookkeeping)", kept: "Seven years after the end of the year they belong to. After an account is deleted, without your name." },
  { what: "Wallets you link and the $WOVI they hold", why: "The holder badge and holder credits", basis: "Our agreement with you, when you link one", kept: "Until you unlink the wallet" },
  { what: "Your answer to \"Use my edits to improve agents\"", why: "Letting builders read your notes and drafts", basis: "Your consent", kept: "Until you turn it off or delete your account" },
  { what: "Your confirmation that you own an upload", why: "Handling copyright claims", basis: "Our legitimate interest", kept: "As long as the file" },
  { what: "Reports you send us", why: "Handling them, as the Digital Services Act asks", basis: "The law", kept: `Your name and email ${Math.round(RETENTION.reportContacts / 30)} months after the decision, the report itself longer` },
  { what: "Webhook delivery logs", why: "Showing a workspace what was sent", basis: "Our agreement with you", kept: `${RETENTION.webhookDeliveries} days` },
  { what: "Read notifications", why: "Your list of what happened", basis: "Our agreement with you", kept: `${RETENTION.readNotifications} days after you read them` },
  { what: "Sign-in links and codes, rate limits", why: "Security", basis: "Our legitimate interest", kept: "Until used or expired (minutes)" },
];

const sections: LegalSection[] = [
  {
    id: "who",
    title: "1. Who is responsible",
    body: (
      <p>
        <b>{operatorLine()}</b> decides how your data is used for WOVI and is responsible for it. Write to {mail} about anything in this notice; a person answers.
      </p>
    ),
  },
  {
    id: "what",
    title: "2. What we collect, why, and for how long",
    body: (
      <>
        <p>We collect only what WOVI needs to work. No ads, no selling data, and no analytics or advertising cookies: the only cookies are the one that keeps you signed in and one that remembers which client you are working for.</p>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>What</th>
                <th>Why</th>
                <th>Legal basis</th>
                <th>How long</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.what}>
                  <td data-label="What">{r.what}</td>
                  <td data-label="Why">{r.why}</td>
                  <td data-label="Legal basis">{r.basis}</td>
                  <td data-label="How long">{r.kept}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>You need to give your email to have an account; without it we cannot sign you in (a passkey-only account is the exception). Everything else is up to you.</p>
      </>
    ),
  },
  {
    id: "ai",
    title: "3. AI and your data",
    body: (
      <ul>
        <li>When an agent runs, what you typed and the parts of your Brand Brain it reads are sent to an AI model to write the draft. Nothing else is sent.</li>
        <li>No decision about you with legal or similar effects is made by automated means. Automated rules do read requests and drafts for the content rules in the terms.</li>
        <li>
          <b>{IMPROVE_CONSENT.label}.</b> {IMPROVE_CONSENT.text} You change it under <Link href="/account#your-data">Account, Your data</Link>. Without it, builders see counts and scores only.
        </li>
      </ul>
    ),
  },
  {
    id: "who-helps",
    title: "4. Who helps us run WOVI",
    body: (
      <>
        <p>These companies process data for us under data processing agreements, only to provide their part:</p>
        <ul>
          <li>
            <b>Railway</b> hosts WOVI and its data, in its EU West region (Amsterdam, the Netherlands).
          </li>
          <li>
            <b>OpenRouter</b> (United States) passes each run to the AI model that writes it. Today those models come from {makers.join(", ")}.
          </li>
          <li>
            <b>Stripe</b> takes the card on its own page when you pay by card. We never see the card number; Stripe tells us whether the payment went through, and handles refunds to the card.
          </li>
          <li>When we start sending email through a provider, it will be named here before it starts.</li>
        </ul>
        <p>
          OpenRouter and the model makers are in the United States. Data goes there under the European Commission&apos;s Standard Contractual Clauses in OpenRouter&apos;s data processing agreement, or under the EU-US Data Privacy Framework for companies certified under it. Ask us at {mail} for a copy of the safeguards.
        </p>
        <p>Wallet addresses and payments in $WOVI, stablecoins and ETH are on Robinhood Chain, a public blockchain, where anyone can read them. We only read from it.</p>
      </>
    ),
  },
  {
    id: "rights",
    title: "5. Your rights",
    body: (
      <>
        <ul>
          <li>
            <b>A copy of your data</b>, in a file you can take elsewhere: <Link href="/account#your-data">Account, Your data, Download my data</Link>.
          </li>
          <li>
            <b>Deleting your account</b>: <Link href="/account#your-data">Account, Your data, Delete my account</Link>. It shows what happens to each workspace before anything is deleted.
          </li>
          <li>Correcting your data, restricting or objecting to how we use it, and withdrawing a consent at any time. Withdrawing does not undo what was done before.</li>
        </ul>
        <p>For anything the buttons do not cover, write to {mail}. We answer within one month, for free.</p>
        <p>
          You can complain to the data protection authority where you live or work.
        </p>
      </>
    ),
  },
  {
    id: "deleting",
    title: "6. What deleting your account does",
    body: (
      <ul>
        <li>Workspaces where you are the only member are deleted with everything in them. Paid credits left in them are paid back.</li>
        <li>Shared workspaces stay with the team. You leave them, your name on comments and decisions becomes &ldquo;Deleted member&rdquo;, and API keys you made stop working. If you are the only owner of a shared workspace, you make someone else an owner first.</li>
        <li>Your sign-in, passkeys, wallets, holder reading, notifications and consents are deleted.</li>
        <li>Records of credits and payments stay for the books, as bookkeeping law asks, without your name.</li>
      </ul>
    ),
  },
  {
    id: "security",
    title: "7. How we keep it safe",
    body: (
      <ul>
        <li>Sign-in tokens, API keys and share links are stored only as hashes; webhook secrets are sealed. Passkeys keep their private key on your device.</li>
        <li>Every workspace is kept apart: one workspace never sees another&apos;s data.</li>
      </ul>
    ),
  },
  {
    id: "changes",
    title: "8. Changes",
    body: <p>When this notice changes in a way that matters, we tell you by email and in the app before it takes effect.</p>,
  },
];

export default function PrivacyPage() {
  return <LegalPage eyebrow="Legal" title="Privacy" lead="We collect what WOVI needs to write drafts for you, keep it in the EU, send it to an AI model only for your own runs, and never sell it. You can download it or delete it yourself." sections={sections} />;
}
