/**
 * Topping up credits with USDC or ETH on Robinhood Chain: every setting, read
 * from the environment. Client-safe: no storage, no Node imports. Everything
 * here is public (addresses and numbers).
 *
 *   WOVI_PAY_TO                 the receiving address. Empty: WOVI_X402_PAY_TO. Both empty: off
 *   WOVI_USDC_ADDRESS           USDC on Robinhood Chain. Empty: USDC shows as not available yet
 *   WOVI_PAY_ETH                off: no ETH (on by default)
 *   WOVI_PAY_RPC_URL            Robinhood Chain RPC for the checks (then WOVI_TOKEN_RPC_URL, WOVI_X402_RPC_URL,
 *                               then the public node)
 *   WOVI_PAY_ETH_USD_FEED       the Chainlink ETH/USD feed (Robinhood Chain's by default)
 *   WOVI_PAY_MIN_CONFIRMATIONS  blocks on top of the payment's before it counts (3)
 *
 * Circle does not list USDC for Robinhood Chain, and Robinhood Chain's own
 * token page lists WETH and USDG but no USDC, so there is no default USDC
 * address: the owner sets one once it exists (docs/credits.md).
 */

export const CHAIN_ID = 4663;
export const PUBLIC_RPC = "https://rpc.mainnet.chain.robinhood.com";
/** Chainlink ETH / USD on Robinhood Chain, 8 decimals. */
export const ETH_USD_FEED = "0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9";
/** EIP-7528: the address that stands for ETH itself. */
export const NATIVE_ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

export type PayAsset = "usdc" | "eth";

export type AssetInfo = {
  asset: PayAsset;
  symbol: string;
  /** The token contract, or NATIVE_ETH. Null for USDC until its address is set. */
  token: string | null;
  decimals: number;
  /** False while it cannot be used: USDC with no address, or ETH switched off. */
  available: boolean;
  /** Why not, in plain words. */
  note: string | null;
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
  usdc: AssetInfo;
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

export function chainPayConfigFromEnv(env: Record<string, string | undefined> = process.env): ChainPayConfig {
  const own = addr(env.WOVI_PAY_TO);
  const x402 = addr(env.WOVI_X402_PAY_TO);
  const payTo = own ?? x402;
  const readRpc = rpc(env.WOVI_PAY_RPC_URL) ?? rpc(env.WOVI_TOKEN_RPC_URL) ?? rpc(env.WOVI_X402_RPC_URL);
  const usdc = addr(env.WOVI_USDC_ADDRESS);
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
    usdc: { asset: "usdc", symbol: "USDC", token: usdc, decimals: 6, available: usdc !== null, note: usdc ? null : "Not available yet" },
    eth: { asset: "eth", symbol: "ETH", token: NATIVE_ETH, decimals: 18, available: ethOn, note: ethOn ? null : "Switched off" },
    quoteSeconds: 600,
    skewSeconds: 120,
    claimDays: 7,
    minConfirmations: Number.isInteger(conf) && conf >= 1 && conf <= 1000 ? conf : 3,
    packs: [500, 1000, 2500, 5000],
  };
}

export type ChainPayStatus = { on: boolean; missing: string[]; assets: AssetInfo[] };

/** On once a receiving address is set and at least one asset can be used. */
export function chainPayStatus(c: ChainPayConfig): ChainPayStatus {
  const missing: string[] = [];
  if (!c.payTo) missing.push("A receiving address (WOVI_PAY_TO, or WOVI_X402_PAY_TO).");
  if (!c.usdc.available && !c.eth.available) missing.push("An asset: USDC's address (WOVI_USDC_ADDRESS), or ETH left on (WOVI_PAY_ETH).");
  return { on: missing.length === 0, missing, assets: [c.usdc, c.eth] };
}
