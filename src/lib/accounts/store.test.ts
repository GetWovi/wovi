import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Accounts } from "./accounts";
import { checkCsrfToken, csrfTokenFor, sameOrigin } from "./csrf";
import { devEmailSender, emailSenderFromEnv } from "./email";
import { serverSecret } from "./local";
import { jsonFileAccountStore } from "./store";

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "wovi-accounts-"));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("local storage, secrets and mail", () => {
  it("keeps accounts in a JSON file across instances", async () => {
    const dir = tmp();
    const file = join(dir, "accounts.json");
    const mails: string[] = [];
    const make = () => new Accounts({ store: jsonFileAccountStore(file), email: devEmailSender(join(dir, "mail"), (l) => mails.push(l)), secret: "s".repeat(40) });
    await make().signIn.request({ email: "ada@example.com", ip: "ip" });
    const code = /code: (\d{6})/.exec(mails[0])![1];
    const { token } = await make().signIn.verifyCode({ email: "ada@example.com", code, ip: "ip" });
    expect((await make().sessions.get(token))?.user.email).toBe("ada@example.com");
    expect(readdirSync(join(dir, "mail"))).toHaveLength(1);
    expect(readFileSync(file, "utf8")).not.toContain(code);
  });

  it("generates a dev secret once into the data folder, and wants WOVI_SECRET off localhost", () => {
    const dir = tmp();
    const env = { NODE_ENV: "development" } as NodeJS.ProcessEnv;
    const first = serverSecret(dir, env);
    expect(first.length).toBeGreaterThanOrEqual(40);
    expect(serverSecret(dir, env)).toBe(first);
    expect(serverSecret(dir, { ...env, WOVI_SECRET: "x".repeat(40) })).toBe("x".repeat(40));
    expect(() => serverSecret(dir, { NODE_ENV: "production", WOVI_APP_URL: "https://wovi.app" } as NodeJS.ProcessEnv)).toThrow(/WOVI_SECRET/);
  });

  it("never mails for real unless a provider is wired, and refuses off localhost without one", async () => {
    const dir = tmp();
    expect(() => emailSenderFromEnv(dir, { EMAIL_PROVIDER: "someone" } as unknown as NodeJS.ProcessEnv)).toThrow(/not wired/);
    const prod = emailSenderFromEnv(dir, { NODE_ENV: "production" } as NodeJS.ProcessEnv, false);
    await expect(prod.send({ to: "a@example.com", subject: "s", text: "t" })).rejects.toThrow(/No email provider/);
  });

  it("ties CSRF tokens to the session and checks the origin", () => {
    const secret = "s".repeat(40);
    const token = csrfTokenFor(secret, "ses_1");
    expect(checkCsrfToken(secret, "ses_1", token)).toBe(true);
    expect(checkCsrfToken(secret, "ses_2", token)).toBe(false);
    expect(checkCsrfToken(secret, "ses_1", undefined)).toBe(false);
    expect(checkCsrfToken("t".repeat(40), "ses_1", token)).toBe(false);
    expect(sameOrigin("http://localhost:3900", "localhost:3900")).toBe(true);
    expect(sameOrigin("https://evil.example", "localhost:3900")).toBe(false);
    expect(sameOrigin(null, "localhost:3900")).toBe(false);
  });
});
