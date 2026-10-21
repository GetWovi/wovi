/**
 * Sending email. Accounts only talk to the EmailSender interface. In
 * development the dev sender prints each mail to the console and writes it to
 * .data/mail/, so sign-in links and invites can be opened without any email
 * account. A real provider plugs in behind EMAIL_PROVIDER, which is off by
 * default; none is wired yet.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type EmailMessage = { to: string; subject: string; text: string };

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/** Keeps every message in a list. Used by tests. */
export function memoryEmailSender(): EmailSender & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    sent,
    async send(message) {
      sent.push({ ...message });
    },
  };
}

/** Prints to the console and writes one text file per mail into `dir`. Never sends anything. */
export function devEmailSender(dir: string, log: (line: string) => void = console.log): EmailSender {
  return {
    async send({ to, subject, text }) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const file = join(dir, `${stamp}-${to.replace(/[^a-z0-9@._-]/gi, "_")}.txt`);
      writeFileSync(file, `To: ${to}\nSubject: ${subject}\n\n${text}\n`, { mode: 0o600 });
      log(`\n[dev email] to ${to}: ${subject}\n${text}\n(saved in ${file})\n`);
    },
  };
}

/**
 * Real providers, by EMAIL_PROVIDER value. Empty until the owner picks one;
 * an adapter reads its own key from the environment.
 */
const PROVIDERS: Record<string, () => EmailSender> = {};

/**
 * The dev sender unless EMAIL_PROVIDER names a wired provider. Off localhost
 * without a provider it refuses, so sign-in links never end up in server logs.
 */
export function emailSenderFromEnv(dataDir: string, env: NodeJS.ProcessEnv = process.env, local = env.NODE_ENV !== "production"): EmailSender {
  const name = env.EMAIL_PROVIDER?.trim();
  if (name) {
    const make = PROVIDERS[name];
    if (!make) throw new Error(`EMAIL_PROVIDER "${name}" is not wired up. Known: ${Object.keys(PROVIDERS).join(", ") || "none yet"}.`);
    return make();
  }
  if (!local) {
    return {
      async send() {
        throw new Error("No email provider is set up. Set EMAIL_PROVIDER before running in production.");
      },
    };
  }
  return devEmailSender(join(dataDir, "mail"));
}
