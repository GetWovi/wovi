/**
 * Who processes data for WOVI and how people can pay, read from the same
 * settings the app runs on, so the privacy notice and the terms always say
 * what is really switched on. Server only (it reads the environment).
 *
 * The list names the vendors, what each one gets and where the vendor
 * processes it. It never names who runs WOVI or where.
 */
import { MODEL_ROUTES } from "@/lib/agents/catalog";
import { chainPayConfigFromEnv, chainPayStatus } from "@/lib/chainpay/config";
import { stripeSettingsFromEnv } from "@/lib/credits/stripe";
import { trendConfigFromEnv } from "@/lib/runs/tools/trend-lookup";
import { isLocalApp } from "@/lib/runtime";
import { payStatus, tokenConfigFromEnv } from "@/lib/token/config";
import { x402ConfigFromEnv, x402Status } from "@/lib/x402/config";

type Env = Record<string, string | undefined>;

/** The ways to buy credits that are on. */
export type PaymentWays = { card: boolean; stablecoin: boolean; eth: boolean; wovi: boolean; x402: boolean };

export function paymentWaysFromEnv(env: Env = process.env): PaymentWays {
  const cp = chainPayConfigFromEnv(env);
  const chain = chainPayStatus(cp).on;
  return {
    card: stripeSettingsFromEnv(env).on,
    stablecoin: chain && Boolean(cp.stable.token),
    eth: chain && cp.eth.available,
    wovi: payStatus(tokenConfigFromEnv(env)).on,
    x402: x402Status(x402ConfigFromEnv(env), isLocalApp(env as NodeJS.ProcessEnv)).on,
  };
}

/** The crypto ways in plain words: "a stablecoin such as USDG, ETH or $WOVI". Empty when none is on. */
export function cryptoWaysWords(w: PaymentWays): string {
  const ways = [w.stablecoin ? "a stablecoin such as USDG" : null, w.eth ? "ETH" : null, w.wovi ? "$WOVI" : null].filter(Boolean) as string[];
  return ways.length <= 1 ? (ways[0] ?? "") : `${ways.slice(0, -1).join(", ")} or ${ways.at(-1)}`;
}

export type Processor = {
  /** The vendor's name. */
  name: string;
  /** What it does for WOVI. */
  role: string;
  /** What it gets. */
  data: string;
  /** Where the vendor processes it. */
  where: string;
};

const MODEL_MAKERS: Record<string, string> = { openai: "OpenAI", anthropic: "Anthropic", google: "Google" };
const ENGINES: Record<string, string> = { parallel: "Parallel", exa: "Exa", perplexity: "Perplexity" };

/** Names for the RPC and SMTP hosts we know; anything else is named by its host. */
const HOSTS: [RegExp, string][] = [
  [/(^|\.)alchemy\.com$/, "Alchemy"],
  [/(^|\.)infura\.io$/, "Infura"],
  [/(^|\.)quiknode\.pro$|(^|\.)quicknode\.com$/, "QuickNode"],
  [/(^|\.)chain\.robinhood\.com$/, "Robinhood Chain's public node"],
  [/(^|\.)resend\.com$/, "Resend"],
  [/(^|\.)sendgrid\.net$/, "SendGrid"],
  [/(^|\.)mailgun\.org$/, "Mailgun"],
  [/(^|\.)postmarkapp\.com$/, "Postmark"],
  [/(^|\.)amazonaws\.com$/, "Amazon SES"],
  [/(^|\.)gmail\.com$|(^|\.)google\.com$/, "Google"],
];

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return /^[a-z0-9.-]+$/i.test(url) ? url.toLowerCase() : null;
  }
}

function vendorOf(host: string | null): string | null {
  if (!host) return null;
  return HOSTS.find(([re]) => re.test(host))?.[1] ?? null;
}

/** The text models the agents use, by maker: "OpenAI and Anthropic". */
export function modelMakers(): string[] {
  return [...new Set(MODEL_ROUTES.filter((r) => r.provider === "openrouter" && r.model && r.modality === "text").map((r) => MODEL_MAKERS[r.model!.split("/")[0]] ?? r.model!.split("/")[0]))];
}

const and = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** Every processor that is switched on, in the order a request meets them. */
export function processorsFromEnv(env: Env = process.env): Processor[] {
  const out: Processor[] = [];
  out.push({
    name: "Railway",
    role: "Hosts WOVI: the app, its stored data and its backups.",
    data: "Everything WOVI keeps (accounts, workspaces, Brand Brains, runs, credits) and the address each request comes from, in its logs.",
    where: "Its EU West region (Amsterdam, the Netherlands).",
  });

  if (env.OPENROUTER_API_KEY?.trim()) {
    const trend = trendConfigFromEnv(env);
    const engine = ENGINES[trend.engine] ?? null;
    out.push({
      name: "OpenRouter",
      role: `Passes each run to the AI model that writes it. Today those models come from ${and(modelMakers())}.${engine ? ` Trend Scout's live trend search runs through it on ${engine}'s search.` : ""}`,
      data: `What you typed in the run's form, the parts of your Brand Brain the agent reads, and the agent's own examples. A trend search sends only the niche and the platform${engine ? `, which OpenRouter passes on to ${engine}` : ""}. When you ask the AI to read your past posts, those posts.`,
      where: "The United States, as are the model makers.",
    });
  }

  if (stripeSettingsFromEnv(env).on) {
    out.push({
      name: "Stripe",
      role: "Takes the card on its own page when you pay by card, and handles refunds to the card.",
      data: "Your card details, typed on Stripe's page (we never see the card number), the pack and its price, and a reference to the top-up. Stripe tells us whether the payment went through.",
      where: "The United States, and other countries where Stripe works.",
    });
  }

  const mail = env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (mail === "resend") {
    out.push({ name: "Resend", role: "Sends WOVI's email: sign-in links and codes, receipts, invites and notices.", data: "Your email address and the email itself.", where: "The United States." });
  } else if (mail === "smtp") {
    const host = hostOf(env.SMTP_URL?.trim() || env.SMTP_HOST?.trim() || null);
    const name = vendorOf(host) ?? (host ? `The email service at ${host}` : "An email service (SMTP)");
    out.push({ name, role: "Sends WOVI's email: sign-in links and codes, receipts, invites and notices.", data: "Your email address and the email itself.", where: "Where that service runs its mail servers." });
  }

  const rpc = chainPayConfigFromEnv(env).rpcUrl || tokenConfigFromEnv(env).rpcUrl;
  const host = hostOf(rpc);
  out.push({
    name: vendorOf(host) ?? (host ? `The Robinhood Chain node at ${host}` : "A Robinhood Chain node"),
    role: "Answers WOVI's reads of Robinhood Chain: $WOVI holdings for the holder badge, and payments in a stablecoin, ETH or $WOVI.",
    data: "The wallet addresses linked to accounts and the transactions WOVI checks. These are public on the chain already.",
    where: "Where that node provider runs its servers.",
  });
  return out;
}
