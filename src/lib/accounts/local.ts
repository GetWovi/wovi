/**
 * Accounts for local work: the JSON store in .data/accounts.json, the dev
 * email sender, and a server secret from WOVI_SECRET or, in development, one
 * generated once into .data/secret (git-ignored, never committed).
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Accounts, builderEmailsFromEnv } from "./accounts";
import { emailSenderFromEnv } from "./email";
import { jsonFileAccountStore } from "./store";

/** True when the app runs on this machine only (localhost), where dev secrets and the dev mailer are fine. */
export function isLocalApp(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV !== "production") return true;
  const host = new URL(env.WOVI_APP_URL ?? "http://localhost:3900").hostname;
  return host === "localhost" || host === "127.0.0.1";
}

export function dataDirFromEnv(): string {
  return process.env.WOVI_DATA_DIR ?? join(process.cwd(), ".data");
}

/** WOVI_SECRET, or on a local app a random secret kept in .data/secret. */
export function serverSecret(dataDir = dataDirFromEnv(), env: NodeJS.ProcessEnv = process.env): string {
  if (env.WOVI_SECRET) return env.WOVI_SECRET;
  if (!isLocalApp(env)) {
    throw new Error("Set WOVI_SECRET (32 or more random characters) before running in production.");
  }
  const file = join(dataDir, "secret");
  try {
    return readFileSync(file, "utf8").trim();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  mkdirSync(dataDir, { recursive: true });
  const secret = randomBytes(32).toString("base64url");
  writeFileSync(file, secret + "\n", { mode: 0o600, flag: "wx" });
  return secret;
}

export function localAccounts(dataDir = dataDirFromEnv(), env: NodeJS.ProcessEnv = process.env): Accounts {
  return new Accounts({
    store: jsonFileAccountStore(join(dataDir, "accounts.json")),
    email: emailSenderFromEnv(dataDir, env, isLocalApp(env)),
    secret: serverSecret(dataDir, env),
    config: {
      appUrl: env.WOVI_APP_URL ?? "http://localhost:3900",
      builderEmails: builderEmailsFromEnv(env),
    },
  });
}
