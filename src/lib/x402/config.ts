/**
 * x402 settings (phase 15): every decision in one object, read from the
 * environment once per process. Client-safe: no storage, no Node imports.
 *
 * x402 is OFF unless the owner sets a receiving address and a way to check
 * payments: an RPC URL for Robinhood Chain (the on-chain verifier), or the
 * fake verifier on a local app for demos and tests. WOVI only receives:
 * there is no private key anywhere in this code, and refunds are recorded
 * for the owner to pay, never sent.
 */

/** EIP-7528: the address that stands for a chain's native coin (ETH here). */
export const NATIVE_ASSET = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

/** The one workspace every x402 run lives in. Runs record their payer. */
export const X402_WORKSPACE_ID = "ws_x402";
/** The account the guest runs count toward. Not a person; nobody signs in as it. */
export const X402_USER_ID = "usr_x402";

/**
 * Our payment scheme. The x402 "exact" scheme on EVM needs a token with
 * signed transfers (EIP-3009) and a facilitator with its own wallet to send
 * them. WOVI takes native ETH and holds no keys, so the payer sends the
 * transfer and X-PAYMENT carries the transaction hash, signed (EIP-191) by
 * the wallet that sent it, together with the quote's nonce. See docs/x402.md.
 */
export const X402_SCHEME = "tx-hash";
export const X402_VERSION = 1;

/** Where an asset's USD price comes from. Stablecoins are 1 USD by definition. */
export type PriceConfig =
  /** A fixed USD price per whole unit, as a decimal string ("2500.5"). Null: not set, so the asset is not offered. */
  | { kind: "fixed"; usd: string | null }
  | { kind: "stable" }
  /** A Chainlink USD feed on the same chain, read through the RPC. */
  | { kind: "chainlink"; feed: string; maxAgeSec: number };

export type X402Asset = {
  symbol: string;
  /** The token contract, or NATIVE_ASSET for ETH. */
  address: string;
  decimals: number;
  price: PriceConfig;
};

export type Window = { max: number; windowMs: number };

export type X402Config = {
  /** The owner's receiving address. Empty: x402 is off. */
  payTo: string | null;
  /** Robinhood Chain JSON-RPC, for the on-chain verifier. Empty: no on-chain checks, so off (unless the fake verifier is on locally). */
  rpcUrl: string | null;
  /** "onchain" for real payments, "fake" for tests and local demos (refused off this machine). */
  verifier: "onchain" | "fake";
  chainId: number;
  /** CAIP-2: eip155:<chain id>. */
  network: string;
  /** What a payer may pay in. A list, so a stablecoin can be added next to ETH. */
  assets: X402Asset[];
  /** How long a price quote stays open: the transfer must land on chain before it ends. */
  quoteSeconds: number;
  /** After a quote ends, how long the paid retry may still come in (waiting for confirmations). */
  graceSeconds: number;
  /** A transfer mined this long before the quote was made still counts (clock skew). */
  skewSeconds: number;
  minConfirmations: number;
  /**
   * After a run that succeeded, the part of the payment it did not use is
   * owed back only from this many credits up; less stays, since sending it
   * back would cost more than it is worth. Failed and stopped runs always
   * get everything they did not use back.
   */
  refundUnusedFromCredits: number;
  /** How long a receipt token reads its run. */
  receiptDays: number;
  /** The largest X-PAYMENT header, in bytes. */
  maxHeaderBytes: number;
  limits: {
    /** 402 quotes per address. */
    quotesPerIp: Window;
    /** Paid tries per address. */
    paidPerIp: Window;
    /** Paid tries per payer wallet. */
    paidPerPayer: Window;
    /** Receipt reads and picks per address. */
    readsPerIp: Window;
  };
};

const MIN = 60_000;

export const ROBINHOOD_CHAIN_ID = 4663;

export const DEFAULT_X402: X402Config = {
  payTo: null,
  rpcUrl: null,
  verifier: "onchain",
  chainId: ROBINHOOD_CHAIN_ID,
  network: `eip155:${ROBINHOOD_CHAIN_ID}`,
  assets: [{ symbol: "ETH", address: NATIVE_ASSET, decimals: 18, price: { kind: "fixed", usd: null } }],
  quoteSeconds: 600,
  graceSeconds: 900,
  skewSeconds: 120,
  minConfirmations: 3,
  refundUnusedFromCredits: 5,
  receiptDays: 30,
  maxHeaderBytes: 4096,
  limits: {
    quotesPerIp: { max: 60, windowMs: MIN },
    paidPerIp: { max: 30, windowMs: MIN },
    paidPerPayer: { max: 20, windowMs: MIN },
    readsPerIp: { max: 240, windowMs: MIN },
  },
};

export const isAddress = (v: unknown): v is string => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);
export const sameAddress = (a: string | null | undefined, b: string | null | undefined) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

const int = (v: string | undefined, min: number, max: number): number | undefined => {
  if (v === undefined || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
};

/** A USD price as a decimal string, or null when it does not look like one. */
export function cleanUsd(v: string | undefined | null): string | null {
  const s = (v ?? "").trim();
  return /^\d{1,12}(\.\d{1,8})?$/.test(s) && Number(s) > 0 ? s : null;
}

/** Reads WOVI_X402_ASSETS: a JSON list of { symbol, address, decimals, price }. Bad entries are dropped. */
function assetsFromJson(raw: string): X402Asset[] | null {
  try {
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return null;
    const out: X402Asset[] = [];
    for (const a of list as Record<string, unknown>[]) {
      if (!a || typeof a.symbol !== "string" || !isAddress(a.address) || !Number.isInteger(a.decimals) || (a.decimals as number) < 0 || (a.decimals as number) > 36) continue;
      const p = (a.price ?? {}) as Record<string, unknown>;
      const price: PriceConfig | null =
        p.kind === "stable" ? { kind: "stable" } : p.kind === "chainlink" && isAddress(p.feed) ? { kind: "chainlink", feed: p.feed, maxAgeSec: Number(p.maxAgeSec) > 0 ? Number(p.maxAgeSec) : 26 * 3600 } : p.kind === "fixed" ? { kind: "fixed", usd: cleanUsd(String(p.usd ?? "")) } : null;
      if (!price) continue;
      out.push({ symbol: a.symbol.slice(0, 12), address: a.address, decimals: a.decimals as number, price });
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * The settings for this process:
 *
 *   WOVI_X402_PAY_TO        the receiving address (empty: off)
 *   WOVI_X402_RPC_URL       Robinhood Chain RPC (empty: off, unless the fake verifier runs locally)
 *   WOVI_X402_ETH_USD       a fixed ETH price in USD, or
 *   WOVI_X402_ETH_USD_FEED  a Chainlink ETH/USD feed address on the chain
 *   WOVI_X402_VERIFIER      onchain (default) or fake (local only)
 *   WOVI_X402_ASSETS        optional JSON list replacing the assets, to add a stablecoin
 *   WOVI_X402_CHAIN_ID, WOVI_X402_MIN_CONFIRMATIONS, WOVI_X402_QUOTE_SECONDS,
 *   WOVI_X402_REFUND_FROM_CREDITS
 */
export function x402ConfigFromEnv(env: Record<string, string | undefined> = process.env): X402Config {
  const chainId = int(env.WOVI_X402_CHAIN_ID, 1, 2 ** 40) ?? DEFAULT_X402.chainId;
  const feed = env.WOVI_X402_ETH_USD_FEED?.trim();
  const eth: X402Asset = { ...DEFAULT_X402.assets[0], price: isAddress(feed) ? { kind: "chainlink", feed, maxAgeSec: 26 * 3600 } : { kind: "fixed", usd: cleanUsd(env.WOVI_X402_ETH_USD) } };
  const custom = env.WOVI_X402_ASSETS?.trim() ? assetsFromJson(env.WOVI_X402_ASSETS) : null;
  const payTo = env.WOVI_X402_PAY_TO?.trim() || null;
  return {
    ...DEFAULT_X402,
    payTo,
    rpcUrl: env.WOVI_X402_RPC_URL?.trim() || null,
    verifier: env.WOVI_X402_VERIFIER?.trim() === "fake" ? "fake" : "onchain",
    chainId,
    network: `eip155:${chainId}`,
    assets: custom ?? [eth],
    minConfirmations: int(env.WOVI_X402_MIN_CONFIRMATIONS, 1, 1000) ?? DEFAULT_X402.minConfirmations,
    quoteSeconds: int(env.WOVI_X402_QUOTE_SECONDS, 60, 3600) ?? DEFAULT_X402.quoteSeconds,
    refundUnusedFromCredits: int(env.WOVI_X402_REFUND_FROM_CREDITS, 1, 1_000_000) ?? DEFAULT_X402.refundUnusedFromCredits,
  };
}

/** Whether an asset has a price, so it can be offered. */
export function priced(a: X402Asset): boolean {
  return a.price.kind !== "fixed" || a.price.usd !== null;
}

export type X402Status = {
  on: boolean;
  /** What is missing, in plain words, when it is off. */
  missing: string[];
  verifier: "onchain" | "fake";
  /** True with the fake verifier: no money moves, every screen says so. */
  test: boolean;
  /** The assets a payer may use now. */
  assets: X402Asset[];
};

/**
 * On only when a receiving address is set, payments can be checked (an RPC,
 * or the fake verifier on a local app) and at least one asset has a price.
 */
export function x402Status(cfg: X402Config, local: boolean): X402Status {
  const missing: string[] = [];
  if (!cfg.payTo) missing.push("A receiving address (WOVI_X402_PAY_TO).");
  else if (!isAddress(cfg.payTo)) missing.push("The receiving address is not a 0x address with 40 hex characters.");
  if (cfg.verifier === "fake") {
    if (!local) missing.push("The fake verifier only runs on this machine. Set WOVI_X402_RPC_URL and leave WOVI_X402_VERIFIER empty.");
  } else if (!cfg.rpcUrl) missing.push("A Robinhood Chain RPC URL (WOVI_X402_RPC_URL) to check payments.");
  else if (!/^https?:\/\//.test(cfg.rpcUrl)) missing.push("The RPC URL must start with https://.");
  const assets = cfg.assets.filter(priced);
  if (!assets.length) missing.push("A USD price for ETH (WOVI_X402_ETH_USD or WOVI_X402_ETH_USD_FEED), or a stablecoin in WOVI_X402_ASSETS.");
  return { on: missing.length === 0, missing, verifier: cfg.verifier, test: cfg.verifier === "fake", assets };
}
