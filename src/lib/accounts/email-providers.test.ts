/**
 * Real email: Resend's HTTP API with a stubbed fetch (retries, the timeout,
 * one idempotency key per mail, nothing from the mail in errors or logs), the
 * SMTP fallback with a stubbed transport, the HTML version of every mail, and
 * the provider switch. No test sends a mail or reaches the network.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { emailSenderFromEnv, memoryEmailSender } from "./email";
import { htmlFromText, signInHtml } from "./email-html";
import { cleanFrom, DEFAULT_FROM, resendSender, smtpSender, type MailTransport } from "./email-providers";
import { testAccounts } from "./test-helpers";

const KEY = "re_TestKey_1234567890";
const mail = { to: "ada@example.com", subject: "Your WOVI sign-in code: 123456", text: "Sign in to WOVI with this link:\nhttps://wovi.fun/sign-in/verify?token=SECRET\n\nOr enter this code: 123456" };

function fakeFetch(answers: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init! });
    const next = answers.shift();
    if (!next) throw new Error("no more answers");
    if (next instanceof Error) throw next;
    return next;
  });
  return { f: f as unknown as typeof fetch, calls };
}
const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

afterEach(() => vi.restoreAllMocks());

describe("Resend", () => {
  it("posts the text, the HTML, the sender and the reply-to with the key, and is done on a 200", async () => {
    const { f, calls } = fakeFetch([json(200, { id: "em_1" })]);
    await resendSender({ apiKey: KEY, replyTo: "help@wovi.fun", fetch: f }).send(mail);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({ from: DEFAULT_FROM, to: ["ada@example.com"], subject: mail.subject, text: mail.text, reply_to: "help@wovi.fun" });
    expect(body.html).toContain('href="https://wovi.fun/sign-in/verify?token=SECRET"');
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it("retries a 5xx, a 429 (after its Retry-After) and a dropped request with the same key, then succeeds", async () => {
    const waits: number[] = [];
    const { f, calls } = fakeFetch([json(500, { name: "internal_server_error" }), json(429, { name: "rate_limit_exceeded" }, { "retry-after": "2" }), new TypeError("fetch failed"), json(200, { id: "em_1" })]);
    await resendSender({ apiKey: KEY, fetch: f, sleep: async (ms) => void waits.push(ms) }).send(mail);
    expect(calls).toHaveLength(4);
    expect(new Set(calls.map((c) => (c.init.headers as Record<string, string>)["Idempotency-Key"])).size).toBe(1);
    expect(waits).toEqual([500, 2000, 2000]);
  });

  it("gives up after its retries, does not retry a 4xx, and never puts the code, the link or the key in the error or the logs", async () => {
    const log = vi.spyOn(console, "log");
    const err = vi.spyOn(console, "error");
    const many = fakeFetch([json(503, {}), json(503, {}), json(503, {}), json(503, {})]);
    const e1 = await resendSender({ apiKey: KEY, fetch: many.f, sleep: async () => {} }).send(mail).catch((e: Error) => e);
    expect(many.calls).toHaveLength(4);
    expect(String(e1)).toContain("HTTP 503");
    const bad = fakeFetch([json(422, { name: "validation_error", message: `Invalid 'to' for ${mail.text}` })]);
    const e2 = await resendSender({ apiKey: KEY, fetch: bad.f, sleep: async () => {} }).send(mail).catch((e: Error) => e);
    expect(bad.calls).toHaveLength(1);
    expect(String(e2)).toBe("EmailSendError: The email provider refused the mail: HTTP 422 (validation_error).");
    for (const e of [e1, e2]) for (const secret of ["123456", "SECRET", KEY]) expect(String((e as Error).message)).not.toContain(secret);
    expect(log).not.toHaveBeenCalled();
    expect(err).not.toHaveBeenCalled();
  });

  it("stops a request that hangs at its timeout and tries again", async () => {
    let n = 0;
    const f = (async (_url: string, init: RequestInit) => {
      n++;
      if (n === 1) {
        return new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "TimeoutError" }))));
      }
      return json(200, { id: "em_1" });
    }) as unknown as typeof fetch;
    await resendSender({ apiKey: KEY, fetch: f, timeoutMs: 30, sleep: async () => {} }).send(mail);
    expect(n).toBe(2);
    const hang = (async (_u: string, init: RequestInit) => new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "TimeoutError" }))))) as unknown as typeof fetch;
    await expect(resendSender({ apiKey: KEY, fetch: hang, timeoutMs: 20, retries: 1, sleep: async () => {} }).send(mail)).rejects.toThrow(/did not answer within/);
  });
});

describe("SMTP", () => {
  it("sends the text and the HTML through the transport, and an error keeps only the server's code", async () => {
    const sent: Parameters<MailTransport["sendMail"]>[0][] = [];
    const transport: MailTransport = { sendMail: async (m) => void sent.push(m) };
    await smtpSender({ transport, from: "WOVI <hello@wovi.fun>", replyTo: "help@wovi.fun" }).send(mail);
    expect(sent[0]).toMatchObject({ from: "WOVI <hello@wovi.fun>", to: "ada@example.com", subject: mail.subject, text: mail.text, replyTo: "help@wovi.fun" });
    expect(sent[0].html).toContain("<!doctype html>");
    const failing: MailTransport = { sendMail: async () => Promise.reject(Object.assign(new Error(`550 rejected: ${mail.text}`), { responseCode: 550 })) };
    const e = await smtpSender({ transport: failing }).send(mail).catch((x: Error) => x);
    expect(String(e)).toBe("EmailSendError: The SMTP server did not take the mail: SMTP 550.");
  });
});

describe("the switch", () => {
  it("picks Resend or SMTP, refuses a missing key without sending, and keeps refusing in production with no provider", async () => {
    const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;
    const noKey = emailSenderFromEnv("/tmp/none", env({ EMAIL_PROVIDER: "resend", NODE_ENV: "production" }), false);
    await expect(noKey.send(mail)).rejects.toThrow(/RESEND_API_KEY/);
    const badFrom = emailSenderFromEnv("/tmp/none", env({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: KEY, EMAIL_FROM: "not an address" }), false);
    await expect(badFrom.send(mail)).rejects.toThrow(/EMAIL_FROM/);
    await expect(emailSenderFromEnv("/tmp/none", env({ EMAIL_PROVIDER: "smtp" }), false).send(mail)).rejects.toThrow(/SMTP_URL/);
    expect(() => emailSenderFromEnv("/tmp/none", env({ EMAIL_PROVIDER: "carrier-pigeon" }))).toThrow(/not wired up. Known: resend, smtp/);
    await expect(emailSenderFromEnv("/tmp/none", env({ NODE_ENV: "production" }), false).send(mail)).rejects.toThrow(/No email provider/);

    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      return json(200, { id: "em_1" });
    });
    await emailSenderFromEnv("/tmp/none", env({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: KEY, NODE_ENV: "production" }), false).send(mail);
    expect(calls).toEqual(["https://api.resend.com/emails"]);
    vi.unstubAllGlobals();
    expect(cleanFrom("WOVI <hello@wovi.fun>")).toBe("WOVI <hello@wovi.fun>");
    expect(cleanFrom("hello@wovi.fun")).toBe("hello@wovi.fun");
    expect(cleanFrom("WOVI <hello@wovi.fun>\r\nBcc: x@y.z")).toBeNull();
  });
});

describe("the HTML of every mail", () => {
  it("escapes the text, makes links tappable, turns a lone link into a button, and ends with WOVI and the contact address only", () => {
    const html = htmlFromText("A <b>test</b>", "Hello <script>alert(1)</script> & you.\n\nAccept here:\nhttps://wovi.fun/invite?token=abc\n\nMore at https://wovi.fun/terms.\n\nWOVI. hello@wovi.fun");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; you.");
    expect(html).not.toContain("<script>");
    expect(html).toContain('<a href="https://wovi.fun/invite?token=abc" style="display:inline-block');
    expect(html).toContain('<a href="https://wovi.fun/terms" style="color:#0B1230;text-decoration:underline">https://wovi.fun/terms</a>.');
    expect(html).toContain("<title>A &lt;b&gt;test&lt;/b&gt;</title>");
    expect(html.match(/hello@wovi\.fun/g)).toHaveLength(2); // the footer's mailto and its text, not the body's copy
    expect(html).not.toMatch(/hello@wovi\.app/);
    const sign = signInHtml({ subject: "s", link: "https://wovi.fun/sign-in/verify?token=t", code: "123456", minutes: 15 });
    expect(sign).toContain(">123456</p>");
    expect(sign).toContain("expire in 15 minutes");
  });

  it("is sent with the sign-in mail, which shows the code large, and the plain text stays the same", async () => {
    const t = testAccounts();
    await t.accounts.signIn.request({ email: "ada@example.com", ip: "10.0.0.1" });
    const m = t.email.sent.at(-1)!;
    expect(m.text).toContain(`Or enter this code: ${t.lastMail("ada@example.com").code}`);
    expect(m.html).toContain(`${t.lastMail("ada@example.com").code}</p>`);
    expect(memoryEmailSender()).toBeTruthy();
  });
});
