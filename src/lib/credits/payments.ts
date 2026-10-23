/**
 * Payment providers for top-ups, behind one small interface. The test
 * provider says "paid" at once and moves no money, and every top-up it makes
 * is marked as a test in the ledger and on screen. Stripe (card, stripe.ts)
 * implements the same two methods; USDC and ETH on Robinhood Chain are
 * checked on chain instead (src/lib/chainpay).
 *
 * The test provider is on for a local app only (WOVI_APP_URL on localhost,
 * the default) or when WOVI_TEST_PAYMENTS=on. Anywhere else, with no real
 * provider set up, top-ups are closed, so a deployed site never hands out
 * credits for nothing.
 */

export type CheckoutRequest = {
  topUpId: string;
  workspaceId: string;
  credits: number;
  amountCents: number;
  currency: "usd";
};

export type CheckoutResult =
  /** Paid now (the test provider). */
  | { status: "paid"; providerRef: string }
  /** The person pays on the provider's page; confirm() lands later from its webhook. */
  | { status: "pending"; providerRef: string; redirectUrl: string }
  | { status: "failed"; error: string };

export interface PaymentProvider {
  id: string;
  /** Shown beside the buttons: "Test payments" for the test provider. */
  label: string;
  /** True when no real money moves. Every screen says so. */
  test: boolean;
  checkout(req: CheckoutRequest): Promise<CheckoutResult>;
  /** Whether a pending checkout was paid, for the webhook or a poll. */
  confirm(providerRef: string): Promise<"paid" | "pending" | "failed">;
}

/** Instant success, no money, no network. */
export function testPaymentProvider(opts: { fail?: boolean } = {}): PaymentProvider {
  return {
    id: "test",
    label: "Test payments",
    test: true,
    async checkout(req) {
      if (opts.fail) return { status: "failed", error: "The test provider was told to fail." };
      return { status: "paid", providerRef: `test_${req.topUpId}` };
    },
    async confirm() {
      return opts.fail ? "failed" : "paid";
    },
  };
}

function isLocalUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

/**
 * The test provider for this process, or null. On for a local app; with
 * WOVI_TEST_PAYMENTS=on also on a server that is not running in production;
 * never on a production server off localhost, whatever the switch says. A
 * real provider (Stripe, stripe.ts) takes its place when it is set up.
 */
export function paymentProviderFromEnv(env: Record<string, string | undefined> = process.env): PaymentProvider | null {
  const flag = env.WOVI_TEST_PAYMENTS;
  if (flag === "off") return null;
  if (isLocalUrl(env.WOVI_APP_URL ?? "http://localhost:3900")) return testPaymentProvider();
  if (flag === "on" && env.NODE_ENV !== "production") return testPaymentProvider();
  return null;
}
