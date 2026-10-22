/**
 * A deterministic stand-in for a model. Tests and local dev use it, so no run
 * ever needs a key or spends money.
 *
 * By default it answers with the JSON example from the output format in the
 * prompt, with every "<placeholder>" string filled by words taken from the
 * run's own input data blocks. The same request always gets the same answer. Tests
 * can script any answer, error or delay with `respond` and `latencyMs`.
 */
import { estimateTokens } from "../prices";
import { ProviderError, type CompletionRequest, type CompletionResult, type ModelProvider } from "./types";

/** A string is the answer, an Error is thrown, undefined means the default answer. */
export type FakeReply = string | Error | undefined;

export type FakeOptions = {
  id?: string;
  /** Delay before answering, in ms. Stops early when the request is aborted. */
  latencyMs?: number;
  /** Called for every request with its 1-based number. */
  respond?: (req: CompletionRequest, n: number) => FakeReply | Promise<FakeReply>;
};

export type FakeProvider = ModelProvider & { readonly requests: CompletionRequest[] };

export function fakeProvider(opts: FakeOptions = {}): FakeProvider {
  const requests: CompletionRequest[] = [];
  return {
    id: opts.id ?? "fake",
    requests,
    async complete(req): Promise<CompletionResult> {
      requests.push(req);
      if (opts.latencyMs) await sleep(opts.latencyMs, req.signal);
      if (req.signal.aborted) throw new ProviderError("aborted", "Request aborted.");
      const reply = opts.respond ? await opts.respond(req, requests.length) : undefined;
      if (reply instanceof Error) throw reply;
      const text = reply ?? defaultAnswer(req);
      const prompt = req.messages.map((m) => m.content).join("\n");
      return { text, tokensIn: estimateTokens(prompt), tokensOut: Math.min(estimateTokens(text), req.maxOutputTokens) };
    },
  };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new ProviderError("aborted", "Request aborted."));
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new ProviderError("aborted", "Request aborted."));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/* ---------- The default answer ---------- */

const EXAMPLE = /```json\n([\s\S]*?)\n```/g;
const DATA_BLOCK = /<data name="([^"]*)">\n?([\s\S]*?)\n?<\/data>/g;
const STOP = new Set(
  "this that with from your have will they them their there what when which about into only than then were been being also just like more most some such very over each every other these those does done make made".split(
    " ",
  ),
);

export function defaultAnswer(req: CompletionRequest): string {
  const system = req.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
  const examples = [...system.matchAll(EXAMPLE)];
  if (!examples.length) return "No output format was given.";
  const example: unknown = JSON.parse(examples[examples.length - 1][1]);

  const userText = req.messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
  const pool = wordPool(userText);
  const seed = hash(userText);
  const used = new Set<string>();
  let leaf = 0;

  const fill = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(fill);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v)]));
    }
    if (typeof value === "string" && value.startsWith("<") && value.endsWith(">")) {
      return phrase(value, pool, seed + leaf++ * 7, used);
    }
    return value;
  };
  return JSON.stringify(fill(example), null, 2);
}

function wordPool(text: string): string[] {
  const words: string[] = [];
  for (const block of text.matchAll(DATA_BLOCK)) {
    // Only the run's inputs, not the Brand Brain or a quality note, the way a model would write about the idea.
    if (block[1].startsWith("brand.") || block[1].startsWith("quality.")) continue;
    for (const w of block[2].toLowerCase().match(/[a-z][a-z']{3,}/g) ?? []) {
      if (!STOP.has(w) && !words.includes(w)) words.push(w);
    }
  }
  return words.length >= 2 ? words : ["fresh", "draft", "today", "notes"];
}

function phrase(placeholder: string, pool: string[], start: number, used: Set<string>): string {
  const maxWords = Number(/max (\d+) words/.exec(placeholder)?.[1] ?? 8);
  const maxChars = Number(/max (\d+) chars/.exec(placeholder)?.[1] ?? 5000);
  const n = Math.max(1, Math.min(maxWords, 6));
  let text = "";
  for (let stride = 1; stride <= pool.length + 1; stride++) {
    const words = Array.from({ length: n }, (_, i) => pool[(start + i * stride) % pool.length]);
    if (stride > pool.length) words[n - 1] = `v${used.size + 1}`;
    text = words.join(" ");
    text = (text[0].toUpperCase() + text.slice(1)).slice(0, maxChars).trim();
    if (!used.has(text)) break;
  }
  used.add(text);
  return text;
}

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0) % 100000;
}
