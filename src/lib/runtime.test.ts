import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { localRegistry } from "@/lib/agents/registry";
import { PLATFORM_WORKSPACE_ID, seedPlatformAgents } from "@/lib/agents/seeds";
import { localEngine } from "@/lib/runs/engine";
import { localAccounts, serverSecret } from "@/lib/accounts/local";
import { emailSenderFromEnv } from "@/lib/accounts/email";
import { clipProviderFromEnv } from "@/lib/clips/local";
import { paymentProviderFromEnv } from "@/lib/credits/payments";
import { localStripeApiBase } from "@/lib/credits/stripe";
import { providersFromEnv } from "@/lib/runs/providers";
import { toolsFromEnv } from "@/lib/runs/tools";
import { webhookSenderFromEnv } from "@/lib/webhooks/sender";
import { ProductionConfigError, appUrlFromEnv, isLocalApp, isProductionServer, productionProblems } from "./runtime";

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "wovi-runtime-"));
  dirs.push(d);
  return d;
};
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
afterEach(() => vi.unstubAllEnvs());

const PROD = { NODE_ENV: "production" } as NodeJS.ProcessEnv;
const SERVER = { NODE_ENV: "production", WOVI_APP_URL: "https://wovi.app" } as NodeJS.ProcessEnv;
const PROD_LOCAL = { NODE_ENV: "production", WOVI_APP_URL: "http://localhost:3900" } as NodeJS.ProcessEnv;
const DEV = { NODE_ENV: "development" } as NodeJS.ProcessEnv;

describe("production fails closed", () => {
  it("counts production without WOVI_APP_URL as a server, never as localhost", () => {
    expect(isLocalApp(DEV)).toBe(true);
    expect(isLocalApp(PROD_LOCAL)).toBe(true);
    expect(isLocalApp(SERVER)).toBe(false);
    expect(isLocalApp(PROD)).toBe(false);
    expect(isLocalApp({ NODE_ENV: "production", WOVI_APP_URL: "not a url" })).toBe(false);
    expect(isProductionServer(PROD)).toBe(true);
    // `next build` renders pages on the build machine; it serves nobody.
    expect(isLocalApp({ ...PROD, NEXT_PHASE: "phase-production-build" })).toBe(true);
    expect(isLocalApp({ ...PROD, NEXT_PHASE: "phase-production-server" })).toBe(false);
    expect(appUrlFromEnv(DEV)).toBe("http://localhost:3900");
    expect(appUrlFromEnv({ ...SERVER, WOVI_APP_URL: "https://wovi.app/" })).toBe("https://wovi.app");
    expect(() => appUrlFromEnv(PROD)).toThrow(ProductionConfigError);
  });

  it("refuses to start accounts without WOVI_APP_URL or WOVI_SECRET, and never generates a secret on a server", () => {
    expect(() => localAccounts(tmp(), { ...PROD, WOVI_SECRET: "x".repeat(40), EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_1234567890" })).toThrow(/WOVI_APP_URL/);
    expect(() => serverSecret(tmp(), PROD)).toThrow(/WOVI_SECRET/);
    expect(() => serverSecret(tmp(), SERVER)).toThrow(/WOVI_SECRET/);
    expect(serverSecret(tmp(), DEV)).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  });

  it("never sends sign-in mail through the dev mailer on a server: without a provider it refuses", async () => {
    const mail = emailSenderFromEnv(tmp(), PROD, isLocalApp(PROD));
    await expect(mail.send({ to: "a@example.com", subject: "s", text: "t" })).rejects.toThrow(/No email provider is set up/);
  });

  it("never offers test payments (free credits) in production off localhost, whatever the switch says", () => {
    expect(paymentProviderFromEnv(PROD)).toBeNull();
    expect(paymentProviderFromEnv({ ...PROD, WOVI_TEST_PAYMENTS: "on" })).toBeNull();
    expect(paymentProviderFromEnv({ ...SERVER, WOVI_TEST_PAYMENTS: "on" })).toBeNull();
    expect(paymentProviderFromEnv(PROD_LOCAL)?.test).toBe(true);
    expect(paymentProviderFromEnv(DEV)?.test).toBe(true);
    expect(localStripeApiBase({ ...PROD, STRIPE_API_BASE: "http://localhost:12111" })).toBeNull();
    expect(localStripeApiBase({ ...PROD_LOCAL, STRIPE_API_BASE: "http://localhost:12111" })).toBe("http://localhost:12111");
  });

  it("never reaches the fake model, the fake trend lookup, the fake clip reader or the dev webhook sender on a server", () => {
    for (const env of [PROD, SERVER]) {
      expect(Object.keys(providersFromEnv(env))).toEqual([]);
      expect(Object.keys(providersFromEnv({ ...env, OPENROUTER_API_KEY: "sk-or-x" }))).toEqual(["openrouter"]);
      expect(toolsFromEnv(env).tools).toEqual({});
      expect(clipProviderFromEnv({ ...env, WOVI_CLIP_PROVIDER: "fake" })).toBeNull();
      expect(webhookSenderFromEnv(tmp(), isLocalApp(env), { ...env, WOVI_WEBHOOK_SENDER: "dev" }).name).toBe("http");
    }
    expect(Object.keys(providersFromEnv(DEV))).toEqual(["fake"]);
    expect(clipProviderFromEnv({ ...DEV, WOVI_CLIP_PROVIDER: "fake" })?.id).toBe("fake");
  });

  it("runs no agent on a server without a key: the engine refuses instead of answering with filler", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WOVI_APP_URL", "https://wovi.app");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const dir = tmp();
    await seedPlatformAgents(localRegistry(dir));
    const engine = localEngine({ dataDir: dir });
    await expect(engine.submitRun({ workspaceId: PLATFORM_WORKSPACE_ID, agentId: "hook-writer", inputs: { topic: "Gerald the starter turns nine" } })).rejects.toMatchObject({ code: "not_runnable", message: expect.stringContaining("Set OPENROUTER_API_KEY") });
  });

  it("says at start what a server is missing", () => {
    expect(productionProblems(DEV)).toEqual([]);
    expect(productionProblems(PROD_LOCAL)).toEqual([]);
    expect(productionProblems(PROD).join(" ")).toMatch(/WOVI_APP_URL is not set/);
    const server = productionProblems(SERVER).join(" ");
    for (const v of ["WOVI_SECRET", "EMAIL_PROVIDER", "OPENROUTER_API_KEY"]) expect(server).toContain(v);
    expect(productionProblems({ ...SERVER, WOVI_SECRET: "s", EMAIL_PROVIDER: "resend", OPENROUTER_API_KEY: "k" })).toEqual([]);
  });
});
