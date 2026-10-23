/**
 * SERVER ONLY. The real email senders behind EMAIL_PROVIDER:
 *
 *   resend  Resend's HTTP API (RESEND_API_KEY). Retries a 5xx, a 429 and a
 *           dropped or timed-out request, with the same Idempotency-Key, so a
 *           retry never sends a mail twice.
 *   smtp    Any SMTP server through nodemailer (SMTP_URL, or SMTP_HOST,
 *           SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE). A fallback.
 *
 * Both send the plain text and a simple HTML version (email-html.ts) of every
 * mail, from EMAIL_FROM (default "WOVI <hello@wovi.fun>") with an optional
 * REPLY_TO. Neither ever logs a mail's body, so sign-in codes and links stay
 * out of the logs; an error names the status and nothing from the mail.
 */
import { randomUUID } from "node:crypto";
import type { EmailMessage, EmailSender } from "./email";
import { htmlFromText } from "./email-html";

export const DEFAULT_FROM = "WOVI <hello@wovi.fun>";

/** "WOVI <hello@wovi.fun>" or "hello@wovi.fun": a plain address with an optional display name. */
export function cleanFrom(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  return /^([^<>@\r\n]{1,80} )?<[^\s<>@]+@[^\s<>@]+\.[a-z]{2,}>$/i.test(s) || /^[^\s<>@]+@[^\s<>@]+\.[a-z]{2,}$/i.test(s) ? s : null;
}

export class EmailSendError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "EmailSendError";
  }
}

export type ResendOptions = {
  apiKey: string;
  from?: string;
  replyTo?: string | null;
  /** Tests hand in their own. */
  fetch?: typeof fetch;
  /** Per try. */
  timeoutMs?: number;
  /** Tries after the first. */
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
  endpoint?: string;
};

const sleeper = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** How long to wait before try `n` (1-based), honouring Retry-After up to 30 seconds. */
function backoff(n: number, retryAfter: string | null): number {
  const s = Number(retryAfter);
  if (Number.isFinite(s) && s > 0) return Math.min(30_000, s * 1000);
  return Math.min(8_000, 500 * 2 ** (n - 1));
}

/** Resend's HTTP API: POST /emails with the text and the HTML. */
export function resendSender(o: ResendOptions): EmailSender {
  const f = o.fetch ?? fetch;
  const from = o.from ?? DEFAULT_FROM;
  const timeoutMs = o.timeoutMs ?? 10_000;
  const retries = o.retries ?? 3;
  const wait = o.sleep ?? sleeper;
  const endpoint = o.endpoint ?? "https://api.resend.com/emails";
  return {
    async send(message: EmailMessage) {
      const body = JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html ?? htmlFromText(message.subject, message.text),
        ...(o.replyTo ? { reply_to: o.replyTo } : {}),
      });
      // One key for every try of this mail: Resend sends it once whatever the retries.
      const key = randomUUID();
      let last: EmailSendError | null = null;
      for (let attempt = 0; attempt <= retries; attempt++) {
        let retryAfter: string | null = null;
        try {
          const res = await f(endpoint, {
            method: "POST",
            headers: { Authorization: `Bearer ${o.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": key, "User-Agent": "wovi-mail" },
            body,
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (res.ok) return;
          retryAfter = res.headers.get("retry-after");
          // Only Resend's error name, never its message or anything from the mail.
          let name = "";
          try {
            const j = (await res.json()) as { name?: unknown };
            if (typeof j?.name === "string" && /^[a-z_]{1,60}$/.test(j.name)) name = ` (${j.name})`;
          } catch {
            /* no body */
          }
          const retryable = res.status === 429 || res.status >= 500;
          last = new EmailSendError(`The email provider refused the mail: HTTP ${res.status}${name}.`, res.status, retryable);
          if (!retryable) throw last;
        } catch (err) {
          if (err instanceof EmailSendError && !err.retryable) throw err;
          if (!(err instanceof EmailSendError)) {
            const timedOut = (err as Error)?.name === "TimeoutError" || (err as Error)?.name === "AbortError";
            last = new EmailSendError(timedOut ? `The email provider did not answer within ${Math.round(timeoutMs / 1000)} seconds.` : "The email provider could not be reached.", null, true);
          }
        }
        if (attempt < retries) await wait(backoff(attempt + 1, retryAfter));
      }
      throw last ?? new EmailSendError("The mail was not sent.", null, true);
    },
  };
}

/** What sendMail needs from a nodemailer transport. Tests hand in their own. */
export type MailTransport = { sendMail(mail: { from: string; to: string; subject: string; text: string; html: string; replyTo?: string }): Promise<unknown> };

export type SmtpOptions = {
  /** smtp(s)://user:pass@host:port */
  url?: string | null;
  host?: string | null;
  port?: number | null;
  user?: string | null;
  pass?: string | null;
  secure?: boolean;
  from?: string;
  replyTo?: string | null;
  timeoutMs?: number;
  /** Tests hand in a transport; otherwise nodemailer makes one on the first mail. */
  transport?: MailTransport;
};

/** Any SMTP server through nodemailer. Nothing is logged, nothing is sent until the first mail. */
export function smtpSender(o: SmtpOptions): EmailSender {
  let transport: Promise<MailTransport> | null = o.transport ? Promise.resolve(o.transport) : null;
  const make = async (): Promise<MailTransport> => {
    const nodemailer = await import("nodemailer");
    const t = o.timeoutMs ?? 15_000;
    const common = { logger: false, debug: false, connectionTimeout: t, greetingTimeout: t, socketTimeout: t * 2 };
    let { host, port, user, pass, secure } = o;
    if (o.url) {
      const u = new URL(o.url);
      host = u.hostname;
      port = u.port ? Number(u.port) : u.protocol === "smtps:" ? 465 : 587;
      user = u.username ? decodeURIComponent(u.username) : null;
      pass = u.password ? decodeURIComponent(u.password) : null;
      secure = u.protocol === "smtps:";
    }
    return nodemailer.createTransport({
      host: host ?? undefined,
      port: port ?? 587,
      secure: secure ?? port === 465,
      auth: user ? { user, pass: pass ?? "" } : undefined,
      ...common,
    }) as unknown as MailTransport;
  };
  return {
    async send(message) {
      transport ??= make();
      try {
        await (await transport).sendMail({
          from: o.from ?? DEFAULT_FROM,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html ?? htmlFromText(message.subject, message.text),
          ...(o.replyTo ? { replyTo: o.replyTo } : {}),
        });
      } catch (err) {
        // nodemailer's errors can quote the server's reply; keep only its code.
        const code = (err as { code?: unknown; responseCode?: unknown }) ?? {};
        const what = typeof code.responseCode === "number" ? `SMTP ${code.responseCode}` : typeof code.code === "string" && /^[A-Z_]{2,40}$/.test(code.code) ? code.code : "an error";
        throw new EmailSendError(`The SMTP server did not take the mail: ${what}.`, typeof code.responseCode === "number" ? code.responseCode : null, false);
      }
    },
  };
}

/** The settings each provider reads, and what is missing. */
export function providerFromEnv(name: string, env: NodeJS.ProcessEnv): EmailSender | { missing: string } | null {
  const from = cleanFrom(env.EMAIL_FROM) ?? DEFAULT_FROM;
  const rawReply = env.REPLY_TO?.trim();
  const replyTo = rawReply ? cleanFrom(rawReply) : null;
  if (rawReply && !replyTo) return { missing: "REPLY_TO is not an email address." };
  if (env.EMAIL_FROM?.trim() && !cleanFrom(env.EMAIL_FROM)) return { missing: 'EMAIL_FROM is not an address like "WOVI <hello@wovi.fun>".' };
  if (name === "resend") {
    const apiKey = env.RESEND_API_KEY?.trim();
    if (!apiKey || !/^re_[A-Za-z0-9_]{8,}$/.test(apiKey)) return { missing: "EMAIL_PROVIDER=resend needs RESEND_API_KEY (it starts with re_)." };
    return resendSender({ apiKey, from, replyTo });
  }
  if (name === "smtp") {
    const url = env.SMTP_URL?.trim() || null;
    const host = env.SMTP_HOST?.trim() || null;
    if (url && !/^smtps?:\/\/\S+$/.test(url)) return { missing: "SMTP_URL must start with smtp:// or smtps://." };
    if (!url && !host) return { missing: "EMAIL_PROVIDER=smtp needs SMTP_URL, or SMTP_HOST with SMTP_PORT, SMTP_USER and SMTP_PASS." };
    const port = Number(env.SMTP_PORT);
    return smtpSender({
      url,
      host,
      port: Number.isInteger(port) && port > 0 && port < 65536 ? port : null,
      user: env.SMTP_USER?.trim() || null,
      pass: env.SMTP_PASS ?? null,
      secure: env.SMTP_SECURE?.trim() === "true" ? true : env.SMTP_SECURE?.trim() === "false" ? false : undefined,
      from,
      replyTo,
    });
  }
  return null;
}
