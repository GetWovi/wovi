/** Accounts for tests: memory store, captured emails, a clock the test moves. */
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";
import { isoCBOR } from "@simplewebauthn/server/helpers";
import { Accounts, type AccountsOptions } from "./accounts";
import { memoryEmailSender } from "./email";
import { memoryAccountStore } from "./store";

export const START = Date.UTC(2026, 9, 21, 12, 0, 0);

export function testAccounts(config: AccountsOptions["config"] = {}) {
  const clock = { t: START };
  const email = memoryEmailSender();
  const store = memoryAccountStore();
  const accounts = new Accounts({
    store,
    email,
    secret: randomBytes(32).toString("hex"),
    now: () => new Date(clock.t),
    config,
  });
  const advance = (ms: number) => {
    clock.t += ms;
  };
  /** The link token and code from the last email to an address (sign-in or invite). */
  const lastMail = (to: string) => {
    const mail = [...email.sent].reverse().find((m) => m.to === to);
    if (!mail) throw new Error(`no email to ${to}`);
    return {
      token: /token=([A-Za-z0-9_-]+)/.exec(mail.text)?.[1] ?? "",
      code: /code: (\d{6})/.exec(mail.text)?.[1] ?? "",
      text: mail.text,
    };
  };
  /** Signs a user in through the email code, making the account on first use. */
  const signUp = async (address: string, ip = "10.0.0.1") => {
    await accounts.signIn.request({ email: address, ip });
    return accounts.signIn.verifyCode({ email: address, code: lastMail(address).code, ip });
  };
  return { accounts, store, email, clock, advance, lastMail, signUp };
}

export async function rejectsCode(p: Promise<unknown>, code: string): Promise<Error & { code: string }> {
  const err = await p.then(
    () => {
      throw new Error(`expected a ${code} error`);
    },
    (e: unknown) => e as Error & { code: string },
  );
  if (err.code !== code) throw new Error(`expected ${code}, got ${err.code}: ${err.message}`);
  return err;
}

/* ---------- A software passkey, enough for WebAuthn's "none" attestation ---------- */

const b64u = (b: Uint8Array | Buffer) => Buffer.from(b).toString("base64url");
const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest();

export class SoftPasskey {
  readonly credentialId = randomBytes(16);
  private readonly privateKey: KeyObject;
  private readonly cose: Uint8Array;
  private counter = 0;

  constructor(
    private readonly rpId: string,
    private readonly origin: string,
  ) {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    this.privateKey = privateKey;
    const jwk = publicKey.export({ format: "jwk" });
    const coseKey = new Map<number, number | Uint8Array>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, Buffer.from(jwk.x!, "base64url")],
      [-3, Buffer.from(jwk.y!, "base64url")],
    ]);
    this.cose = isoCBOR.encode(coseKey);
  }

  get id() {
    return b64u(this.credentialId);
  }

  private authData(flags: number, attested: boolean): Buffer {
    const count = Buffer.alloc(4);
    count.writeUInt32BE(this.counter);
    const parts = [sha(this.rpId), Buffer.from([flags]), count];
    if (attested) {
      const len = Buffer.alloc(2);
      len.writeUInt16BE(this.credentialId.length);
      parts.push(Buffer.alloc(16), len, this.credentialId, Buffer.from(this.cose));
    }
    return Buffer.concat(parts);
  }

  private clientData(type: string, challenge: string, origin = this.origin) {
    return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  }

  register(challenge: string, opts: { origin?: string } = {}) {
    const attestationObject = isoCBOR.encode(new Map<string, unknown>([
      ["fmt", "none"],
      ["attStmt", new Map()],
      ["authData", this.authData(0x45, true)],
    ]) as never);
    return {
      id: this.id,
      rawId: this.id,
      type: "public-key" as const,
      response: {
        clientDataJSON: b64u(this.clientData("webauthn.create", challenge, opts.origin)),
        attestationObject: b64u(attestationObject),
        transports: ["internal" as const],
      },
      clientExtensionResults: {},
    };
  }

  authenticate(challenge: string, userId: string) {
    this.counter += 1;
    const authData = this.authData(0x05, false);
    const clientDataJSON = this.clientData("webauthn.get", challenge);
    const signature = sign("sha256", Buffer.concat([authData, sha(clientDataJSON)]), this.privateKey);
    return {
      id: this.id,
      rawId: this.id,
      type: "public-key" as const,
      response: {
        clientDataJSON: b64u(clientDataJSON),
        authenticatorData: b64u(authData),
        signature: b64u(signature),
        userHandle: b64u(Buffer.from(userId)),
      },
      clientExtensionResults: {},
    };
  }
}
