/**
 * $WOVI on the site (phase 17): every setting, read from the environment.
 * Client-safe: no storage, no Node imports. Everything here is public
 * (addresses and numbers) except whether a keeper key is set; the key itself
 * is only ever read in keeper-chain.ts.
 *
 * With none of these set the site behaves exactly as before: no /token page,
 * no keeper, no holder badge, no holder credits, no paying with $WOVI.
 *
 *   WOVI_TOKEN_PAGE            on: show /token before the contracts exist; off: never. Empty: on once the burn pot is set
 *   WOVI_BURN_POT_ADDRESS      the burn pot (contracts/token-deploy.sh writes it)
 *   WOVI_SPLITTER_ADDRESS      the fee address (the splitter)
 *   WOVI_BURN_POT_BLOCK        the block the pot was deployed in: where burns are looked for
 *   WOVI_TOKEN_ADDRESS         $WOVI, once launched (read from the pot when empty)
 *   WOVI_TOKEN_RPC_URL         Robinhood Chain RPC for reads (falls back to WOVI_X402_RPC_URL, then the public node)
 *   WOVI_BUY_URL               where "How to buy" links to (https only; empty shows no link yet)
 *   WOVI_EXPLORER_URL          the explorer (Robinhood Chain's Blockscout by default)
 *
 *   WOVI_HOLDER_MIN            whole $WOVI across a person's linked wallets for the holder badge (1,000,000)
 *   WOVI_HOLDER_CREDITS        monthly holder credits per tier, "min:credits" pairs in whole $WOVI,
 *                              e.g. "1000000:100,10000000:400". Empty: no holder credits.
 *   WOVI_HOLDER_CHECK_HOURS    how often every linked wallet is read again for the badge (6)
 *
 *   WOVI_KEEPER                off: the keeper never runs, whatever else is set
 *   WOVI_KEEPER_KEY            the keeper wallet's key (gas only). Read in keeper-chain.ts alone
 *   WOVI_KEEPER_RPC_URL        a node for sending (falls back to the read RPC)
 *   WOVI_KEEPER_EVERY_MINUTES  how often it looks (15)
 *   WOVI_KEEPER_MIN_GAS_ETH    below this the keeper sends nothing and says so (0.0005)
 *   WOVI_KEEPER_MAX_GWEI       refused above this gas price (0.5)
 *   WOVI_KEEPER_DAILY_GAS      gas units a UTC day may use (8,000,000)
 *   WOVI_KEEPER_MIN_SWEEP_ETH  the least a sweep must move (0.0002)
 *
 *   WOVI_PAY_WITH_WOVI         on: a linked wallet may buy credits by sending $WOVI to the burn pot
 *   WOVI_PAY_TOKENS_PER_CREDIT a fixed price: whole $WOVI for one credit. Empty: priced from the market
 *   WOVI_TOKEN_ETH_USD_FEED    the Chainlink ETH/USD feed for market prices (Robinhood Chain's by default)
 */

export const ROBINHOOD_CHAIN_ID = 4663;
export const PUBLIC_RPC = "https://rpc.mainnet.chain.robinhood.com";
export const EXPLORER = "https://robinhoodchain.blockscout.com";
/** Chainlink ETH / USD on Robinhood Chain, 8 decimals. */
export const ETH_USD_FEED = "0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9";
/** The Pons launch factory that made $WOVI (contracts/lib.sh). */
export const PONS_FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";

export const WEI = BigInt("1000000000000000000");

export type HolderTier = { minWhole: string; minWei: bigint; credits: number };

export type TokenConfig = {
  /** Whether /token exists at all. */
  pageOn: boolean;
  token: string | null;
  pot: string | null;
  splitter: string | null;
  potBlock: number | null;
  rpcUrl: string;
  /** True when the read RPC is the public node (no RPC set). */
  publicRpc: boolean;
  buyUrl: string | null;
  explorer: string;
  chainId: number;
  holder: {
    /** On once the burn pot is set: the badge reads balances. */
    on: boolean;
    minWhole: string;
    minWei: bigint;
    /** Lowest first. Empty: no holder credits. */
    tiers: HolderTier[];
    checkHours: number;
  };
  keeper: {
    /** WOVI_KEEPER=off: never runs. */
    switchedOff: boolean;
    keySet: boolean;
    rpcUrl: string;
    everyMinutes: number;
    minGasWei: bigint;
    maxGwei: number;
    dailyGas: number;
    minSweepWei: bigint;
  };
  pay: {
    switchOn: boolean;
    /** A fixed price in $WOVI wei per credit, or null for the market price. */
    tokensPerCreditWei: bigint | null;
    ethUsdFeed: string;
    quoteSeconds: number;
    minConfirmations: number;
    packs: readonly number[];
  };
};

export const isAddress = (v: unknown): v is string => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);
export const sameAddress = (a: string | null | undefined, b: string | null | undefined) => Boolean(a && b && isAddress(a) && isAddress(b) && a.toLowerCase() === b.toLowerCase());
const addr = (v: string | undefined) => (isAddress(v?.trim()) ? v!.trim() : null);
const https = (v: string | undefined) => (/^https:\/\/\S+$/.test(v?.trim() ?? "") ? v!.trim() : null);
const rpc = (v: string | undefined) => (/^https?:\/\/\S+$/.test(v?.trim() ?? "") ? v!.trim() : null);
const int = (v: string | undefined, d: number, min: number, max: number) => {
  const n = Number((v ?? "").replace(/[,_\s]/g, ""));
  return v !== undefined && v.trim() !== "" && Number.isInteger(n) && n >= min && n <= max ? n : d;
};

/**
 * A decimal string of ETH or whole tokens to wei, on the digits, never
 * through a float: "0.0005" is 500,000,000,000,000. Null when it is not a
 * plain positive decimal with at most 18 places.
 */
export function toWei(v: string | undefined | null): bigint | null {
  const m = /^(\d{1,30})(?:\.(\d{1,18}))?$/.exec((v ?? "").replace(/[,_\s]/g, ""));
  if (!m) return null;
  return BigInt(m[1]) * WEI + BigInt((m[2] ?? "").padEnd(18, "0"));
}

/** Whole tokens ("1000000", "1,000,000") as a plain digit string, or null. */
function wholeTokens(v: string | undefined | null): string | null {
  const s = (v ?? "").replace(/[,_\s]/g, "");
  return /^\d{1,24}$/.test(s) && BigInt(s) > BigInt(0) ? BigInt(s).toString() : null;
}

/** "1000000:100,10000000:400" to tiers, lowest first. A bad pair drops the whole list, so a typo never grants. */
export function parseTiers(v: string | undefined): HolderTier[] {
  const raw = (v ?? "").trim();
  if (!raw) return [];
  const out: HolderTier[] = [];
  for (const part of raw.split(",")) {
    const [min, credits] = part.split(":").map((x) => x?.trim());
    const minWhole = wholeTokens(min);
    const n = Number(credits);
    if (!minWhole || !Number.isInteger(n) || n < 0 || n > 1_000_000) return [];
    out.push({ minWhole, minWei: BigInt(minWhole) * WEI, credits: n });
  }
  out.sort((a, b) => (a.minWei < b.minWei ? -1 : a.minWei > b.minWei ? 1 : 0));
  // Two tiers at one minimum would leave which applies to chance.
  for (let i = 1; i < out.length; i++) if (out[i].minWei === out[i - 1].minWei) return [];
  return out.filter((t) => t.credits > 0);
}

export function tokenConfigFromEnv(env: Record<string, string | undefined> = process.env): TokenConfig {
  const pot = addr(env.WOVI_BURN_POT_ADDRESS);
  const page = env.WOVI_TOKEN_PAGE?.trim();
  const readRpc = rpc(env.WOVI_TOKEN_RPC_URL) ?? rpc(env.WOVI_X402_RPC_URL);
  const block = Number(env.WOVI_BURN_POT_BLOCK);
  const holderMin = wholeTokens(env.WOVI_HOLDER_MIN) ?? "1000000";
  const fixed = wholeTokens(env.WOVI_PAY_TOKENS_PER_CREDIT);
  return {
    pageOn: page === "off" ? false : page === "on" || pot !== null,
    token: addr(env.WOVI_TOKEN_ADDRESS),
    pot,
    splitter: addr(env.WOVI_SPLITTER_ADDRESS),
    potBlock: Number.isSafeInteger(block) && block > 0 ? block : null,
    rpcUrl: readRpc ?? PUBLIC_RPC,
    publicRpc: readRpc === null,
    buyUrl: https(env.WOVI_BUY_URL),
    explorer: https(env.WOVI_EXPLORER_URL)?.replace(/\/+$/, "") ?? EXPLORER,
    chainId: ROBINHOOD_CHAIN_ID,
    holder: {
      on: pot !== null,
      minWhole: holderMin,
      minWei: BigInt(holderMin) * WEI,
      tiers: parseTiers(env.WOVI_HOLDER_CREDITS),
      checkHours: int(env.WOVI_HOLDER_CHECK_HOURS, 6, 1, 168),
    },
    keeper: {
      switchedOff: env.WOVI_KEEPER?.trim() === "off",
      keySet: /^0x[0-9a-fA-F]{64}$/.test(env.WOVI_KEEPER_KEY?.trim() ?? ""),
      rpcUrl: rpc(env.WOVI_KEEPER_RPC_URL) ?? readRpc ?? PUBLIC_RPC,
      everyMinutes: int(env.WOVI_KEEPER_EVERY_MINUTES, 15, 5, 24 * 60),
      minGasWei: toWei(env.WOVI_KEEPER_MIN_GAS_ETH) ?? toWei("0.0005")!,
      maxGwei: Number(env.WOVI_KEEPER_MAX_GWEI) > 0 && Number(env.WOVI_KEEPER_MAX_GWEI) <= 1000 ? Number(env.WOVI_KEEPER_MAX_GWEI) : 0.5,
      dailyGas: int(env.WOVI_KEEPER_DAILY_GAS, 8_000_000, 100_000, 1_000_000_000),
      minSweepWei: toWei(env.WOVI_KEEPER_MIN_SWEEP_ETH) ?? toWei("0.0002")!,
    },
    pay: {
      switchOn: env.WOVI_PAY_WITH_WOVI?.trim() === "on",
      tokensPerCreditWei: fixed ? BigInt(fixed) * WEI : null,
      ethUsdFeed: addr(env.WOVI_TOKEN_ETH_USD_FEED) ?? ETH_USD_FEED,
      quoteSeconds: 600,
      minConfirmations: int(env.WOVI_PAY_MIN_CONFIRMATIONS, 3, 1, 1000),
      packs: [500, 1000, 2500, 5000],
    },
  };
}

/** The keeper runs only when it is not switched off and its key and both contracts are set. */
export function keeperStatus(c: TokenConfig): { on: boolean; missing: string[] } {
  const missing: string[] = [];
  if (c.keeper.switchedOff) missing.push("Switched off (WOVI_KEEPER=off).");
  if (!c.keeper.keySet) missing.push("A keeper key (WOVI_KEEPER_KEY) for a wallet that holds a little ETH for gas.");
  if (!c.pot) missing.push("The burn pot (WOVI_BURN_POT_ADDRESS).");
  if (!c.splitter) missing.push("The fee address (WOVI_SPLITTER_ADDRESS).");
  return { on: missing.length === 0, missing };
}

/** Paying for credits with $WOVI: switched on, and the burn pot set (the token is read from it). */
export function payStatus(c: TokenConfig): { on: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!c.pay.switchOn) missing.push("Switched on (WOVI_PAY_WITH_WOVI=on).");
  if (!c.pot) missing.push("The burn pot (WOVI_BURN_POT_ADDRESS).");
  return { on: missing.length === 0, missing };
}

/** The tier a holding falls in: the highest whose minimum it reaches. Null below every tier. Exact, in wei. */
export function tierFor(tiers: HolderTier[], wei: bigint): HolderTier | null {
  let best: HolderTier | null = null;
  for (const t of tiers) if (wei >= t.minWei) best = t;
  return best;
}

/** Whether a holding reaches the badge threshold. Exact, in wei: one wei under is not a holder. */
export const isHolder = (c: TokenConfig, wei: bigint | null) => wei !== null && wei >= c.holder.minWei;
