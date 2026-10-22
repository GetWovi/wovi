/**
 * Where webhook deliveries go out. The service only talks to WebhookSender.
 *
 * - The dev sender (local default) logs each delivery to the console and
 *   writes it into <dataDir>/webhooks/. It never opens a connection and
 *   answers as if the endpoint said 200, so the whole flow can be seen here.
 * - The memory sender is for tests: it keeps every request and answers what
 *   the test scripts. No network.
 * - The HTTP sender posts for real. It is only picked off localhost, or with
 *   WOVI_WEBHOOK_SENDER=http, and refuses addresses inside the network.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type WebhookRequest = { url: string; headers: Record<string, string>; body: string };
export type WebhookResponse = { status: number | null; ms: number; error?: string };

export interface WebhookSender {
  /** Shown in the delivery log: "dev", "memory", "http". */
  readonly name: string;
  send(req: WebhookRequest): Promise<WebhookResponse>;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return LOCAL_HOSTS.has(h) || h.endsWith(".localhost") || /^127\.\d+\.\d+\.\d+$/.test(h);
}

/** Hosts that point inside a network: never a target for a deployed server. */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isLocalHost(h) || h === "0.0.0.0" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^0\./.test(h)) return true;
  const m = /^172\.(\d+)\./.exec(h);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (/^(fc|fd|fe80)[0-9a-f]*:/.test(h)) return true;
  // A plain name with no dot is a name inside a network.
  return !h.includes(".") && !h.includes(":");
}

/**
 * Whether a URL may be registered: https anywhere public; http only to this
 * machine and only while the app runs locally. Null when fine, else why not.
 */
export function checkWebhookUrl(raw: unknown, opts: { local: boolean }): string | null {
  if (typeof raw !== "string" || !raw.trim()) return "Give the URL to send to.";
  const text = raw.trim();
  if (text.length > 2048) return "The URL is longer than 2048 characters.";
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return "That is not a full URL. Start it with https://.";
  }
  if (url.username || url.password) return "Leave the user name and password out of the URL. Check the signature instead.";
  if (url.hash) return "Leave the # part out of the URL.";
  const local = isLocalHost(url.hostname);
  if (url.protocol === "http:") {
    if (!(opts.local && local)) return "Use https://. Plain http only works to localhost while the app runs on this machine.";
  } else if (url.protocol !== "https:") {
    return "Use an https:// URL.";
  }
  if (!opts.local && isPrivateHost(url.hostname)) return "That address is inside a private network. Use a public https:// URL.";
  return null;
}

/** Logs and saves each delivery on this machine. Never makes a network call. */
export function devWebhookSender(dir: string, log: (line: string) => void = console.log): WebhookSender {
  return {
    name: "dev",
    async send({ url, headers, body }) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const file = join(dir, `${stamp}-${headers["Wovi-Delivery"] ?? "delivery"}.json`);
      writeFileSync(file, JSON.stringify({ url, headers, body: JSON.parse(body) }, null, 2) + "\n", { mode: 0o600 });
      log(`[dev webhook] ${headers["Wovi-Event"] ?? "event"} for ${url} logged, not sent (${file})`);
      return { status: 200, ms: 0 };
    },
  };
}

/** For tests: keeps every request and answers with what `respond` says (200 by default). No network. */
export function memoryWebhookSender(respond: (req: WebhookRequest, n: number) => number | null | Error = () => 200) {
  const sent: WebhookRequest[] = [];
  const sender: WebhookSender & { sent: WebhookRequest[] } = {
    name: "memory",
    sent,
    async send(req) {
      sent.push(req);
      const r = respond(req, sent.length);
      if (r instanceof Error) return { status: null, ms: 1, error: r.message };
      return { status: r, ms: 1 };
    },
  };
  return sender;
}

/**
 * Posts for real, with a timeout and no redirects. Off this machine it
 * refuses addresses inside the network. Never used by tests or locally.
 */
export function httpWebhookSender(opts: { timeoutMs?: number; local: boolean; fetchImpl?: typeof fetch }): WebhookSender {
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    name: "http",
    async send({ url, headers, body }) {
      const started = Date.now();
      const refused = checkWebhookUrl(url, { local: opts.local });
      if (refused) return { status: null, ms: 0, error: refused };
      try {
        const res = await doFetch(url, { method: "POST", headers, body, redirect: "manual", signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000) });
        // Read a little of the answer so the connection closes, and keep nothing of it.
        await res.body?.cancel().catch(() => undefined);
        return { status: res.status, ms: Date.now() - started };
      } catch (err) {
        const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
        return { status: null, ms: Date.now() - started, error: timeout ? "No answer in time." : "Could not connect." };
      }
    },
  };
}

/**
 * The dev sender while the app runs on this machine, the HTTP sender
 * anywhere else. WOVI_WEBHOOK_SENDER=dev or http picks one by hand.
 */
export function webhookSenderFromEnv(dataDir: string, local: boolean, env: NodeJS.ProcessEnv = process.env): WebhookSender {
  const pick = env.WOVI_WEBHOOK_SENDER?.trim();
  if (pick === "http") return httpWebhookSender({ local });
  if (pick === "dev" || local) return devWebhookSender(join(dataDir, "webhooks"));
  return httpWebhookSender({ local });
}
