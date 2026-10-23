/**
 * Topping up credits with a stablecoin or ETH on Robinhood Chain: every
 * setting, read from the environment. Client-safe: no storage, no Node
 * imports. Everything here is public (addresses and numbers).
 *
 *   WOVI_PAY_TO                 the receiving address. Empty: WOVI_X402_PAY_TO. Both empty: off
 *   WOVI_STABLECOIN_ADDRESS     the stablecoin, one to one with the US dollar. Empty: USDG, the stablecoin on
 *                               Robinhood Chain's official token page. off: no stablecoin
 *   WOVI_USDC_ADDRESS           the older name for WOVI_STABLECOIN_ADDRESS, still read when that one is empty
 *   WOVI_STABLECOIN_SYMBOL      optional: the symbol the token must report on chain (else it is not offered)
 *   WOVI_STABLECOIN_DECIMALS    optional: the decimals it must report on chain
 *   WOVI_PAY_ETH                off: no ETH (on by default)
 *   WOVI_PAY_RPC_URL            Robinhood Chain RPC for the checks (then WOVI_TOKEN_RPC_URL, WOVI_X402_RPC_URL,
 *                               then the public node)
 *   WOVI_PAY_ETH_USD_FEED       the Chainlink ETH/USD feed (Robinhood Chain's by default)
 *   WOVI_PAY_MIN_CONFIRMATIONS  blocks on top of the payment's before it counts (3)
 *
 * The stablecoin's symbol and decimals are never taken from settings: they
 * are read from the token on chain when the server starts and checked
 * (stablecoinCheck below) before anything is priced in it.
 */

export const CHAIN_ID = 4663;
export const PUBLIC_RPC = "https://rpc.mainnet.chain.robinhood.com";
/** Chainlink ETH / USD on Robinhood Chain, 8 decimals. */
export const ETH_USD_FEED = "0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9";
/** EIP-7528: the address that stands for ETH itself. */
export const NATIVE_ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
/** USDG on Robinhood Chain, from the chain's official token page (docs.robinhood.com/chain/contracts). 6 decimals on chain. */
export const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

/** stable: the configured stablecoin (USDG by default). eth: ETH itself. */
export type PayAsset = "stable" | "eth";

/** An asset as screens show it. */
export type AssetInfo = {
  asset: PayAsset;
  symbol: string;
  /** The token contract, or NATIVE_ETH. Null when no stablecoin is set. */
  token: string | null;
  decimals: number;
  /** False while it cannot be used: no stablecoin, one that failed its check, or ETH switched off. */
  available: boolean;
  /** Why not, in plain words. */
  note: string | null;
};

export type StablecoinConfig = {
  /** Null when switched off. */
  token: string | null;
  /** Which setting gave the address. */
  from: "default" | "WOVI_STABLECOIN_ADDRESS" | "WOVI_USDC_ADDRESS" | "off";
  expectSymbol: string | null;
  expectDecimals: number | null;
  /** A bad address in the setting: the stablecoin is off and the owner's page says why. */
  badSetting: string | null;
};

export type ChainPayConfig = {
  payTo: string | null;
  /** Where payTo came from, for the owner's page. */
  payToFrom: "WOVI_PAY_TO" | "WOVI_X402_PAY_TO" | null;
  rpcUrl: string;
  publicRpc: boolean;
  chainId: number;
  ethUsdFeed: string;
  /** A feed reading older than this is not used for a price. */
  feedMaxAgeSec: number;
  stable: StablecoinConfig;
  eth: AssetInfo;
  quoteSeconds: number;
  /** A transaction mined this long before its price was made still counts (clock skew). */
  skewSeconds: number;
  /** How long after a price ends its payment can still be checked: a late one is then owed back. */
  claimDays: number;
  minConfirmations: number;
  packs: readonly number[];
};

export const isAddress = (v: unknown): v is string => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);
export const sameAddress = (a: string | null | undefined, b: string | null | undefined) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());
const addr = (v: string | undefined) => (isAddress(v?.trim()) ? v!.trim() : null);
const rpc = (v: string | undefined) => (/^https?:\/\/\S+$/.test(v?.trim() ?? "") ? v!.trim() : null);

function stableFromEnv(env: Record<string, string | undefined>): StablecoinConfig {
  const own = env.WOVI_STABLECOIN_ADDRESS?.trim() ?? "";
  const alias = env.WOVI_USDC_ADDRESS?.trim() ?? "";
  const sym = env.WOVI_STABLECOIN_SYMBOL?.trim() ?? "";
  const dec = Number(env.WOVI_STABLECOIN_DECIMALS);
  const expect = { expectSymbol: sym ? sym.slice(0, 16) : null, expectDecimals: env.WOVI_STABLECOIN_DECIMALS?.trim() && Number.isInteger(dec) ? dec : null };
  if (own === "off") return { token: null, from: "off", badSetting: null, ...expect };
  const raw = own || alias;
  const from = own ? "WOVI_STABLECOIN_ADDRESS" : alias ? "WOVI_USDC_ADDRESS" : "default";
  if (!raw) return { token: USDG, from: "default", badSetting: null, ...expect };
  const token = addr(raw);
  return token ? { token, from, badSetting: null, ...expect } : { token: null, from, badSetting: `${from} is not a 0x address with 40 hex characters.`, ...expect };
}

export function chainPayConfigFromEnv(env: Record<string, string | undefined> = process.env): ChainPayConfig {
  const own = addr(env.WOVI_PAY_TO);
  const x402 = addr(env.WOVI_X402_PAY_TO);
  const payTo = own ?? x402;
  const readRpc = rpc(env.WOVI_PAY_RPC_URL) ?? rpc(env.WOVI_TOKEN_RPC_URL) ?? rpc(env.WOVI_X402_RPC_URL);
  const ethOn = env.WOVI_PAY_ETH?.trim() !== "off";
  const conf = Number(env.WOVI_PAY_MIN_CONFIRMATIONS);
  return {
    payTo,
    payToFrom: own ? "WOVI_PAY_TO" : x402 ? "WOVI_X402_PAY_TO" : null,
    rpcUrl: readRpc ?? PUBLIC_RPC,
    publicRpc: readRpc === null,
    chainId: CHAIN_ID,
    ethUsdFeed: addr(env.WOVI_PAY_ETH_USD_FEED) ?? ETH_USD_FEED,
    feedMaxAgeSec: 26 * 3600,
    stable: stableFromEnv(env),
    eth: { asset: "eth", symbol: "ETH", token: NATIVE_ETH, decimals: 18, available: ethOn, note: ethOn ? null : "Switched off" },
    quoteSeconds: 600,
    skewSeconds: 120,
    claimDays: 7,
    minConfirmations: Number.isInteger(conf) && conf >= 1 && conf <= 1000 ? conf : 3,
    packs: [500, 1000, 2500, 5000],
  };
}

/** What the stablecoin reported on chain, or why it cannot be used. */
export type StablecoinState = { ok: true; token: string; symbol: string; decimals: number } | { ok: false; token: string | null; note: string; reason: string };

/**
 * The checks a stablecoin's own answers must pass before anything is priced
 * in it: the RPC is Robinhood Chain, the symbol is a short plain word, the
 * decimals are 2 to 18 (so a cent is a whole number of units), and both match
 * the optional settings.
 */
export function stablecoinCheck(c: ChainPayConfig, read: { chainId: number; symbol: unknown; decimals: unknown }): StablecoinState {
  const token = c.stable.token!;
  const no = (reason: string): StablecoinState => ({ ok: false, token, note: "Not available right now", reason });
  if (read.chainId !== c.chainId) return no(`The RPC answers for chain ${read.chainId}, not Robinhood Chain (${c.chainId}).`);
  const symbol = typeof read.symbol === "string" ? read.symbol.trim() : "";
  if (!/^[A-Za-z0-9.$-]{1,11}$/.test(symbol)) return no("The token's symbol() is not a short plain word.");
  const decimals = Number(read.decimals);
  if (!Number.isInteger(decimals) || decimals < 2 || decimals > 18) return no(`The token reports ${String(read.decimals)} decimals; 2 to 18 are taken.`);
  if (c.stable.expectSymbol && c.stable.expectSymbol !== symbol) return no(`The token reports ${symbol}, not ${c.stable.expectSymbol} (WOVI_STABLECOIN_SYMBOL).`);
  if (c.stable.expectDecimals !== null && c.stable.expectDecimals !== decimals) return no(`The token reports ${decimals} decimals, not ${c.stable.expectDecimals} (WOVI_STABLECOIN_DECIMALS).`);
  return { ok: true, token, symbol, decimals };
}

/** The stablecoin as screens show it, from its checked state. */
export function stableAsset(c: ChainPayConfig, s: StablecoinState | null): AssetInfo {
  if (!c.stable.token) return { asset: "stable", symbol: "Stablecoin", token: null, decimals: 6, available: false, note: c.stable.badSetting ? "Not set up right" : "Switched off" };
  if (!s) return { asset: "stable", symbol: "Stablecoin", token: c.stable.token, decimals: 6, available: false, note: "Being checked" };
  if (!s.ok) return { asset: "stable", symbol: c.stable.expectSymbol ?? "Stablecoin", token: c.stable.token, decimals: 6, available: false, note: s.note };
  return { asset: "stable", symbol: s.symbol, token: s.token, decimals: s.decimals, available: true, note: null };
}

export type ChainPayStatus = { on: boolean; missing: string[] };

/** On once a receiving address is set and an asset could be used (a stablecoin is set, or ETH is on). */
export function chainPayStatus(c: ChainPayConfig): ChainPayStatus {
  const missing: string[] = [];
  if (!c.payTo) missing.push("A receiving address (WOVI_PAY_TO, or WOVI_X402_PAY_TO).");
  if (!c.stable.token && !c.eth.available) missing.push("An asset: a stablecoin (USDG unless WOVI_STABLECOIN_ADDRESS=off), or ETH left on (WOVI_PAY_ETH).");
  return { on: missing.length === 0, missing };
}
