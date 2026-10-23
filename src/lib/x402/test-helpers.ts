/**
 * x402 for tests: the API on the fake provider with credits on, x402 on the
 * fake verifier and a pretend chain in memory, and a payer wallet made in
 * memory for the test only. No network, no chain, no money.
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { testApi } from "@/lib/api/test-helpers";
import { RestApi } from "@/lib/api/rest";
import type { FakeOptions } from "@/lib/runs/providers/fake";
import { DEFAULT_X402, type X402Config } from "./config";
import { X402Http } from "./http";
import { encodePaymentHeader, signMessage } from "./protocol";
import { X402 } from "./service";
import { memoryX402Store } from "./store";
import type { PaymentRequirements } from "./types";
import { fakeVerifier, type PaymentVerifier } from "./verifier";

export const PAY_TO = "0x4020000000000000000000000000000000000402";

export async function testX402(opts: { cfg?: Partial<X402Config>; verifier?: "fake" | "none"; local?: boolean; fake?: FakeOptions; usedElsewhere?: (paymentId: string) => Promise<boolean> } = {}) {
  const t = await testApi({ ...(opts.fake ? { fake: opts.fake } : {}) });
  const store = memoryX402Store();
  const cfg: X402Config = {
    ...DEFAULT_X402,
    payTo: PAY_TO,
    verifier: "fake",
    assets: [{ ...DEFAULT_X402.assets[0], price: { kind: "fixed", usd: "2500" } }],
    ...opts.cfg,
  };
  const verifier: PaymentVerifier | null = opts.verifier === "none" ? null : fakeVerifier(store.fakeTransfers);
  const x402 = new X402({ cfg, local: opts.local ?? true, verifier, store, accounts: t.accounts, api: t.api, credits: t.credits!, engine: t.engine, pipelines: t.pipelineEngine, appUrl: "http://localhost:3900", now: () => t.clock.t, log: () => undefined, ...(opts.usedElsewhere ? { usedElsewhere: opts.usedElsewhere } : {}) });
  const off = x402.wire();
  const http = new X402Http(x402, { appUrl: "http://localhost:3900", maxBodyBytes: t.limits.maxBodyBytes, log: () => undefined });
  const rest = new RestApi({ api: t.api, accounts: t.accounts, appUrl: "http://localhost:3900", now: () => t.clock.t, log: () => undefined, x402: http });

  const call = async (method: string, path: string, o: { key?: string | null; body?: unknown; headers?: Record<string, string> } = {}) => {
    const headers: Record<string, string> = { ...(o.key ? { authorization: `Bearer ${o.key}` } : {}), ...o.headers };
    let body: string | undefined;
    if (o.body !== undefined) {
      body = typeof o.body === "string" ? o.body : JSON.stringify(o.body);
      headers["content-type"] ??= "application/json";
    }
    const res = await rest.handle(new Request(`http://localhost:3900/api/v1${path}`, { method, headers, body }));
    const text = await res.text();
    return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
  };

  /** A wallet made in memory for this test only. */
  const wallet = () => privateKeyToAccount(generatePrivateKey());
  const payer = wallet();

  /**
   * Pays a quote on the pretend chain and builds X-PAYMENT, like a client
   * would. Every part can be bent to test the checks.
   */
  const pay = async (
    req: PaymentRequirements,
    o: { amount?: string; to?: string; chainId?: number; asset?: string; confirmations?: number; minedAt?: number; success?: boolean; from?: ReturnType<typeof wallet>; signer?: ReturnType<typeof wallet>; txHash?: string; nonce?: string } = {},
  ) => {
    const from = o.from ?? payer;
    let txHash = o.txHash;
    if (!txHash) {
      txHash = (await x402.fakeTransfer({ from: from.address, amount: o.amount ?? req.maxAmountRequired, ...(o.to ? { to: o.to } : {}), ...(o.asset ? { asset: o.asset } : {}), ...(o.chainId ? { chainId: o.chainId } : {}), ...(o.confirmations !== undefined ? { confirmations: o.confirmations } : {}), ...(o.minedAt ? { minedAt: o.minedAt } : {}), ...(o.success === false ? { success: false } : {}) })).txHash;
    }
    const nonce = o.nonce ?? req.extra.nonce;
    const signature = await (o.signer ?? from).signMessage({ message: signMessage(nonce, txHash, req.extra.chainId) });
    const header = encodePaymentHeader({ x402Version: 1, scheme: req.scheme, network: req.network, payload: { nonce, txHash, payer: from.address, asset: req.asset, signature } });
    return { header, txHash };
  };

  return { ...t, store, cfg, x402, http, rest, call, wallet, payer, pay, offX402: off };
}
