import { describe, expect, it } from "vitest";
import { cryptoWaysWords, paymentWaysFromEnv, processorsFromEnv } from "./processors";

const STRIPE = { STRIPE_SECRET_KEY: "sk_live_1234567890abcdef", STRIPE_WEBHOOK_SECRET: "whsec_1234567890abcdef" };
const PAY_TO = { WOVI_PAY_TO: "0x00000000000000000000000000000000000000a1" };
const names = (env: Record<string, string>) => processorsFromEnv({ NODE_ENV: "test", ...env }).map((p) => p.name);

describe("the privacy notice's processors follow the settings", () => {
  it("lists Stripe only when card payments are on", () => {
    expect(names({})).not.toContain("Stripe");
    expect(names({ STRIPE_SECRET_KEY: "sk_live_1234567890abcdef" })).not.toContain("Stripe");
    expect(names(STRIPE)).toContain("Stripe");
  });

  it("names the email provider that sends mail: Resend, or the SMTP service", () => {
    expect(names({})).not.toContain("Resend");
    expect(names({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_1234567890" })).toContain("Resend");
    expect(names({ EMAIL_PROVIDER: "smtp", SMTP_HOST: "smtp.postmarkapp.com" })).toContain("Postmark");
    expect(names({ EMAIL_PROVIDER: "smtp", SMTP_URL: "smtps://user:pass@mail.example.net:465" })).toContain("The email service at mail.example.net");
  });

  it("lists OpenRouter with the model makers and the search partner only with a key, and always the hosting and the chain node", () => {
    expect(names({})).toEqual(["Railway", "Robinhood Chain's public node"]);
    const withKey = processorsFromEnv({ NODE_ENV: "test", OPENROUTER_API_KEY: "sk-or-x" });
    const or = withKey.find((p) => p.name === "OpenRouter")!;
    expect(or.role).toMatch(/OpenAI and Anthropic/);
    expect(or.role).toMatch(/Parallel/);
    expect(or.data).toMatch(/only the niche and the platform/);
    expect(names({ WOVI_PAY_RPC_URL: "https://robinhood-mainnet.g.alchemy.com/v2/k" })).toContain("Alchemy");
  });

  it("names vendors only, and never uses an em dash", () => {
    const all = JSON.stringify(processorsFromEnv({ NODE_ENV: "test", OPENROUTER_API_KEY: "k", EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_1234567890", ...STRIPE }));
    expect(all).not.toContain("\u2014");
    // Each row is about a vendor: its name, its part, what it gets and where the vendor works. Nothing about who runs WOVI.
    expect(all).not.toMatch(/\b(?:operator|we are based|our office)\b/i);
  });
});

describe("the terms' ways to pay follow the settings", () => {
  it("offers card only when Stripe is set up, and the crypto ways that are on", () => {
    expect(paymentWaysFromEnv({ NODE_ENV: "test" })).toMatchObject({ card: false, stablecoin: false, eth: false, wovi: false, x402: false });
    expect(paymentWaysFromEnv({ NODE_ENV: "test", ...STRIPE }).card).toBe(true);
    const chain = paymentWaysFromEnv({ NODE_ENV: "test", ...PAY_TO });
    expect(chain).toMatchObject({ card: false, stablecoin: true, eth: true });
    expect(cryptoWaysWords(chain)).toBe("a stablecoin such as USDG or ETH");
    expect(cryptoWaysWords({ ...chain, wovi: true })).toBe("a stablecoin such as USDG, ETH or $WOVI");
    expect(cryptoWaysWords({ card: true, stablecoin: false, eth: false, wovi: false, x402: false })).toBe("");
  });
});
