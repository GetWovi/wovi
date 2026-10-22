# Accounts and workspaces (phase 4)

Who someone is, which workspaces they belong to, and what they may do there. Phase 2 and 3 took a workspace id as a plain string; phase 4 makes those ids real records and checks every call against them. The code lives in `src/lib/accounts/`; the pages are in `src/app/sign-in`, `src/app/invite` and `src/app/account`.

| File | What it holds |
|---|---|
| `accounts.ts` | `Accounts`: config, users, the builder allowlist, the platform records, `roleIn` and `authorize`. The parts below hang off it. |
| `sign-in.ts` | Email sign-in with a link and a six-digit code. |
| `sessions.ts` | Sessions behind the cookie: lookup, rotation, expiry, sign out, sign out everywhere, the current workspace. |
| `workspaces.ts` | Workspaces, members, roles, invites, leaving, the last-owner rule. |
| `api-keys.ts` | Keys for MCP and REST (phase 14): create, list, revoke, authenticate. |
| `passkeys.ts` | WebAuthn through `@simplewebauthn/server`: add a passkey, sign in with it. |
| `builder-codes.ts` | One-time builder codes and the passkey-only join. |
| `wallets.ts` | Wallet links by signature (Sign-In With Ethereum message, checked offline with viem). |
| `policy.ts` | The permission table. Pure functions. |
| `guard.ts` | `GuardedAgents` and `GuardedRuns`: the registry and the engine with a caller on every call. |
| `csrf.ts` | Same-origin check and session-bound CSRF tokens. |
| `rate-limit.ts` | Fixed-window counters kept in the store. |
| `email.ts` | The `EmailSender` interface, the dev sender, the provider switch. |
| `store.ts` | The `AccountStore` interface, a memory store and the JSON file store. |
| `local.ts` | `localAccounts()`: JSON store in `.data/accounts.json`, dev mail, dev secret. |
| `server.ts` | The Next.js side: one instance per process, the cookie, `actionSession`. |

## The model

| Record | Key fields | Workspace id |
|---|---|---|
| User | `id`, `email` (lowercased, unique; null for a passkey-only builder), `name`, `builder`, `personalWorkspaceId` | belongs to a person, spans workspaces |
| Builder code | `codeHash`, `suffix`, `label`, `expiresAt`, `usedAt`, `usedBy`, `revokedAt` | none; made on the command line |
| Workspace | `id`, `name`, `personal`, `plan` (`free`; credits since phase 13 live in their own ledger, [credits.md](credits.md)) | is one |
| Member | `workspaceId`, `userId`, `role` | yes |
| Invite | `workspaceId`, `email`, `role`, `tokenHash`, `expiresAt`, `acceptedAt`, `revokedAt` | yes |
| API key | `workspaceId`, `name`, `prefix`, `keyHash`, `role`, `lastUsedAt`, `revokedAt` | yes |
| Creator | `id`, `workspaceId`, `kind` (`platform` or `creator`) | yes |
| Session | `tokenHash`, `userId`, `workspaceId` (the current one), `expiresAt`, `lastSeenAt` | the current one |
| Sign-in request | `email`, `tokenHash`, `codeHash`, `expiresAt`, `attempts`, `usedAt` | belongs to a person |
| Passkey | credential `id`, `userId`, `publicKey`, `counter` | belongs to a person |
| Wallet link | lowercase address as `id`, `userId`, `address`, `chainId` | belongs to a person |
| Challenge | `kind`, `userId`, `value`, `meta`, `expiresAt`, `usedAt` | short-lived |

Everything a workspace owns carries its `workspaceId`, like agents and runs, so teams and agencies need no migration. Identity records belong to a person and span their workspaces.

No secret is stored in the clear: session tokens, link tokens, invite tokens, builder codes and API keys are stored as sha256 (they are 256-bit random values), and sign-in codes as an HMAC with the server secret.

## Sign-in

**Email, no password.** `signIn.request({ email, ip, next })` mails a link and a six-digit code together. Either one signs in, once, within 15 minutes. A new request replaces the last. An email that has no account yet gets one: the user and a personal workspace named "Personal" are made at that moment, so sign-up and sign-in are the same flow.

- The link lands on `/sign-in/verify?token=...`, which shows the address and a "Continue" button. Pressing it uses the link. Opening the link alone does not, so mail scanners that fetch links cannot burn it.
- The code goes into the sign-in page, which switches to a code field after the email is sent.
- `next` (a local path only) carries a destination through sign-in, for example back to an invite.

Limits (all in `DEFAULT_CONFIG`): 5 requests per address and 20 per IP per 15 minutes; 30 code or link checks per IP per 15 minutes; 5 wrong codes per request, after which it is used up even for the right code. Answers never say whether an address has an account.

**Passkeys.** A signed-in user adds one from the account page. After that, "Sign in with a passkey" works with no email (discoverable credentials). Each ceremony uses a server challenge that lives 5 minutes and works once; origin and relying party id come from `WOVI_APP_URL`.

**Wallet linking.** A signed-in user may link a wallet so holder features can read it (phase 17, [token.md](token.md#holders)). The server writes an EIP-4361 message with a single-use nonce and the statement "Signing this message does not send funds or approve any transaction"; the wallet signs it with `personal_sign`; the server recovers the signer with viem, offline. Nothing ever asks a wallet for a transaction. One wallet links to one account. Plain key wallets only; smart contract wallets (EIP-1271) would need a chain call and are not supported yet.

- **Single use and any case.** Each challenge is the whole readable message, stored as is, and works once: a
  replayed signature, one signed for another person's challenge, or an old signature over a new message (a new nonce)
  is refused. Addresses are kept with a lower-case id and shown checksummed, so the same wallet typed in any case is
  one wallet linked to one account.
- **In the browser** (`WalletLink`, `wallet-browser.ts`): the wallet is asked for its address, its network id and one
  `personal_sign`, with each step on screen ("Open your wallet to connect", "Sign the message in your wallet",
  "Checking the signature"). On a phone (a coarse pointer and a phone's user agent, read at the tap) with no wallet in
  the browser, the button opens this page inside MetaMask's browser with `?link=wallet`, where linking starts again by
  itself after signing in there. On a desktop with no wallet it opens MetaMask's download page.
- **Holder status** (phase 17): after a link or an unlink the person's $WOVI is read again, and the account page shows
  a "$WOVI holder" card with the badge, their own holding (to them only), the holder credit tiers and this month's.

## Sessions

- The cookie (`wovi_session`, `__Host-wovi_session` in production) is httpOnly, SameSite=Lax, Secure in production, and holds a 256-bit random token.
- A session ends 30 days after sign-in, after 7 days without use, on sign out, or on "sign out everywhere".
- **Rotation:** once the token is 12 hours old, the next server action replaces it and sets the new cookie. The old token keeps working for one minute so requests already in flight do not fail, then stops. Pages never rotate, because a page cannot set a cookie.
- Signing in ends the session the browser had before.
- One workspace is current per session. It starts as the personal workspace; `switchWorkspace` changes it to any workspace the user belongs to. If access goes (removed, left), the session falls back to the personal workspace on its next read.

**CSRF.** Every state-changing server action runs `actionSession`: the Origin header must name this host, and the form must carry the session's CSRF token, an HMAC of the session id with the server secret. Next.js server actions also compare Origin and Host on their own. Actions before sign-in check the origin.

## Workspaces, roles and invites

Every user has a personal workspace and can make more for a team or a client. Each member has one role:

| Action | owner | admin | editor | viewer | API key |
|---|---|---|---|---|---|
| See the workspace, its agents and runs | yes | yes | yes | yes | yes |
| Run agents | yes | yes | yes | | editor and admin keys |
| Edit agents | yes | yes | yes | | editor and admin keys |
| Edit the Brand Brain (phase 7) | yes | yes | yes | | editor and admin keys |
| See costs | yes | yes | | | admin keys |
| Manage members and invites | yes | yes | | | never |
| Manage API keys | yes | yes | | | never |
| Rename the workspace | yes | | | | never |
| Manage webhooks (phase 14) | yes | yes | | | admin keys |

- Nobody gives or takes away a role above their own, so only owners make or unmake owners, and admins cannot remove owners.
- **The last owner rule:** a workspace always keeps at least one owner. The last owner cannot leave, be removed, or step down until someone else is an owner.
- **Invites** go by email with a link to `/invite?token=...`. They work once, only for the invited address, and expire after 7 days. A new invite to the same address replaces the open one; open invites can be withdrawn. At most 30 invites per workspace per day.
- A member who leaves or is removed takes their API keys with them.
- Someone outside a workspace gets `not_found`, never `forbidden`, so they learn nothing about it.

`policy.ts` holds this table as data (`MIN_ROLE`, `API_KEY_ACTIONS`); `accounts.authorize(caller, workspaceId, action)` applies it and returns the caller's role.

## API keys

For power users who call agents from their own software, Claude or ChatGPT, through the REST API and MCP (phase 14, [api.md](api.md) and [mcp.md](mcp.md)). Owners and admins make them on Settings, API and assistants (`/app/settings/api`) or on `/account`.

- `wovi_sk_` plus 43 random characters. Shown once at creation; listed by name, prefix, role, created and last used.
- One workspace and one role each (admin, editor or viewer; never owner). A key acts with the lower of its own role and its maker's current role, and stops working when it is revoked or its maker leaves the workspace.
- A key can never manage members, keys or the workspace, whatever its role.
- `apiKeys.authenticate(key)` returns a caller for the guarded registry and engine, or null. The key is looked up by its hash and compared in constant time.

## The registry and engine behind the policy

The raw `AgentRegistry` and `RunEngine` stay as they were, for seeds, scripts and tests. Callers (the web app, MCP and REST) get `GuardedAgents` and `GuardedRuns` (`appAgents()` and `appRuns()` in `server.ts`), where every call names its caller:

```ts
const agents = appAgents();
await agents.list(caller, workspaceId);                // members: every agent; others: public live only
await agents.update(caller, workspaceId, "hook-writer", { name: "..." }); // edit_agents
const runs = appRuns();
await runs.submitRun(caller, { workspaceId, agentWorkspaceId: "ws_wovi", agentId: "hook-writer", inputs }); // run_agents
await runs.costTotals(caller, workspaceId);            // see_costs
```

- Reads return public views: no routing, no instructions, no model calls. `getForEdit` returns the full spec to people who may edit.
- Another workspace's agents are visible and runnable only when public and live, as phase 3 already allowed.
- Only the platform workspace may hold agents owned by the platform, and a creator account on record owns agents only in its own workspace.

## The hidden builder

The platform role "builder" opens the Agent Builder (phase 5, [builder.md](builder.md)) and owns the platform workspace `ws_wovi` and the platform creator `creator_wovi`, which are real records made on first sign-in or by `npm run agents:seed`. Nobody's email sits in any config: the way in is a **builder code**.

**Builder codes** (`builder-codes.ts`, `scripts/builder-code.ts`):

```
npm run builder:code                      prints a new code (shown once)
npm run builder:code -- --label Funkai    the same, with a label for the list
npm run builder:code -- --list            every code: id, last characters, state, dates
npm run builder:code -- --revoke bcd_...  revokes an open code
```

- A code is `wovi_builder_` plus 43 random characters. Only its sha256 is stored. It works once, expires after 7 days, and can be revoked while open. A used code is never reopened.
- The hidden page `/builder/join` (nothing links to it) takes the code and a display name, then creates a **passkey** on that device. No email is involved at any step. The join is two steps like adding a passkey: `startJoin` checks the code and makes the passkey creation options for a user id that does not exist yet; `finishJoin` verifies the passkey first, then takes the code in one conditional write, then creates the user (no email, `builder: true`), the personal workspace, the passkey and the session. A passkey prompt that fails leaves the code open; two people racing with one code cannot both get in.
- A passkey-only account signs in from `/sign-in` with "Sign in with a passkey" and nothing else; it cannot ask for an email link and cannot accept email invites. The account page shows the name in place of the email.
- `user.builder` is the stored role. `accounts.isBuilder(user)` also reads the optional email allowlist `WOVI_BUILDER_EMAILS` (comma-separated, empty by default), so that path still works for a local setup; the allowlist is read on every check.

At each sign-in a builder becomes an owner of `ws_wovi`; anyone else loses any membership there. Nobody can invite people into `ws_wovi`. For anyone who is not a builder it does not exist (`not_found`), and every `/builder` page is a 404. Sessions start in the personal workspace even for builders.

## Email

Accounts only talk to `EmailSender`. In development the dev sender prints each mail to the console and writes it to `.data/mail/`, so links and codes can be read without any email account. A real provider plugs in behind `EMAIL_PROVIDER` (off by default; none is wired yet). Off localhost without a provider, sending refuses, so sign-in links never land in server logs.

## Settings and secrets

| Variable | Default | Meaning |
|---|---|---|
| `WOVI_APP_URL` | `http://localhost:3900` | Links in emails, the passkey origin, the wallet message domain. |
| `WOVI_SECRET` | generated into `.data/secret` on a local app | Server secret for code hashes and CSRF tokens. Required off localhost. |
| `WOVI_BUILDER_EMAILS` | empty | The optional builder email allowlist. Builder codes are the usual way in. |
| `EMAIL_PROVIDER` | off | A wired email provider. |
| `WOVI_DATA_DIR` | `.data` | Where the JSON stores, mail and the dev secret live. |

Rate limits use the first `X-Forwarded-For` hop, which is only trustworthy behind our own proxy; that is set at deploy.

## Storage

Each table is a `Collection` with `get`, `find(where)`, `insert`, `update`, `updateIf(id, where, patch)` and `delete`. `updateIf` is the one conditional write (single use of links, codes, invites, builder codes and challenges; token rotation), which maps to `UPDATE ... WHERE ... RETURNING` in SQL. `memoryAccountStore()` is for tests, `jsonFileAccountStore(file)` for local work (one process). The generic `memoryTables` and `jsonFileTables` behind them also serve the builder's own tables. A Postgres store implements the same interface with unique indexes on `users.email` and every `*_hash` column.

## Pages

Sign-in, the link landing and the invite are centered cards under the site header; the account page sits inside the app chrome since phase 9 ([app.md](app.md)), reached from Settings. None is linked from the homepage, and all are `noindex`.

- `/sign-in`: email, then the code; or a passkey.
- `/sign-in/verify`: the email link's landing.
- `/invite`: accept an invite (sign in first if needed).
- `/account`: current workspace (rename, create, leave), members and roles, invites, API keys, passkeys, wallets, sign out, sign out everywhere. The workspace switcher is in the app header.
- `/builder/join`: a builder code, a name and a passkey make a builder account. Hidden; nothing links to it.

## Tests

`npm test` runs them with the memory store, captured mail and a clock the test moves. Passkeys are tested against a software authenticator (P-256, "none" attestation) and wallets against a throwaway key made at test time.
