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
| User | `id`, `email` (lowercased, unique), `personalWorkspaceId` | belongs to a person, spans workspaces |
| Workspace | `id`, `name`, `personal`, `plan` (`free` until billing in phase 13) | is one |
| Member | `workspaceId`, `userId`, `role` | yes |
| Invite | `workspaceId`, `email`, `role`, `tokenHash`, `expiresAt`, `acceptedAt`, `revokedAt` | yes |
| API key | `workspaceId`, `name`, `prefix`, `keyHash`, `role`, `lastUsedAt`, `revokedAt` | yes |
| Creator | `id`, `workspaceId`, `kind` (`platform` or `creator`) | yes |
| Session | `tokenHash`, `userId`, `workspaceId` (the current one), `expiresAt`, `lastSeenAt` | the current one |
| Sign-in request | `email`, `tokenHash`, `codeHash`, `expiresAt`, `attempts`, `usedAt` | belongs to a person |
| Passkey | credential `id`, `userId`, `publicKey`, `counter` | belongs to a person |
| Wallet link | lowercase address as `id`, `userId`, `address`, `chainId` | belongs to a person |
| Challenge | `kind`, `userId`, `value`, `expiresAt`, `usedAt` | short-lived |

Everything a workspace owns carries its `workspaceId`, like agents and runs, so teams and agencies need no migration. Identity records belong to a person and span their workspaces.

No secret is stored in the clear: session tokens, link tokens, invite tokens and API keys are stored as sha256 (they are 256-bit random values), and sign-in codes as an HMAC with the server secret.

## Sign-in

**Email, no password.** `signIn.request({ email, ip, next })` mails a link and a six-digit code together. Either one signs in, once, within 15 minutes. A new request replaces the last. An email that has no account yet gets one: the user and a personal workspace named "Personal" are made at that moment, so sign-up and sign-in are the same flow.

- The link lands on `/sign-in/verify?token=...`, which shows the address and a "Continue" button. Pressing it uses the link. Opening the link alone does not, so mail scanners that fetch links cannot burn it.
- The code goes into the sign-in page, which switches to a code field after the email is sent.
- `next` (a local path only) carries a destination through sign-in, for example back to an invite.

Limits (all in `DEFAULT_CONFIG`): 5 requests per address and 20 per IP per 15 minutes; 30 code or link checks per IP per 15 minutes; 5 wrong codes per request, after which it is used up even for the right code. Answers never say whether an address has an account.

**Passkeys.** A signed-in user adds one from the account page. After that, "Sign in with a passkey" works with no email (discoverable credentials). Each ceremony uses a server challenge that lives 5 minutes and works once; origin and relying party id come from `WOVI_APP_URL`.

**Wallet linking.** A signed-in user may link a wallet so holder features can read it later. The server writes an EIP-4361 message with a single-use nonce and the statement "Signing this message does not send funds or approve any transaction"; the wallet signs it with `personal_sign`; the server recovers the signer with viem, offline. Nothing ever asks a wallet for a transaction. One wallet links to one account. Plain key wallets only; smart contract wallets (EIP-1271) would need a chain call and are not supported yet. On a phone without a wallet in the browser, the button opens the page in MetaMask's browser.

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

- Nobody gives or takes away a role above their own, so only owners make or unmake owners, and admins cannot remove owners.
- **The last owner rule:** a workspace always keeps at least one owner. The last owner cannot leave, be removed, or step down until someone else is an owner.
- **Invites** go by email with a link to `/invite?token=...`. They work once, only for the invited address, and expire after 7 days. A new invite to the same address replaces the open one; open invites can be withdrawn. At most 30 invites per workspace per day.
- A member who leaves or is removed takes their API keys with them.
- Someone outside a workspace gets `not_found`, never `forbidden`, so they learn nothing about it.

`policy.ts` holds this table as data (`MIN_ROLE`, `API_KEY_ACTIONS`); `accounts.authorize(caller, workspaceId, action)` applies it and returns the caller's role.

## API keys

For power users who call agents from their own software, Claude or ChatGPT (MCP and REST arrive in phase 14).

- `wovi_sk_` plus 43 random characters. Shown once at creation; listed by name, prefix, role, created and last used.
- One workspace and one role each (admin, editor or viewer; never owner). A key acts with the lower of its own role and its maker's current role, and stops working when it is revoked or its maker leaves the workspace.
- A key can never manage members, keys or the workspace, whatever its role.
- `apiKeys.authenticate(key)` returns a caller for the guarded registry and engine, or null.

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

`WOVI_BUILDER_EMAILS` (comma-separated, empty by default) lists who holds the platform role "builder". The platform workspace `ws_wovi` and the platform creator `creator_wovi` are real records, made on first sign-in or by `npm run agents:seed`. At each sign-in, a builder becomes an owner of `ws_wovi`; anyone else loses any membership there. The allowlist is read on every check, so removing an email takes effect at once. Nobody can invite people into `ws_wovi`. Nothing links to it: for anyone not on the list it does not exist (`not_found`), and sessions start in the personal workspace even for builders.

## Email

Accounts only talk to `EmailSender`. In development the dev sender prints each mail to the console and writes it to `.data/mail/`, so links and codes can be read without any email account. A real provider plugs in behind `EMAIL_PROVIDER` (off by default; none is wired yet). Off localhost without a provider, sending refuses, so sign-in links never land in server logs.

## Settings and secrets

| Variable | Default | Meaning |
|---|---|---|
| `WOVI_APP_URL` | `http://localhost:3900` | Links in emails, the passkey origin, the wallet message domain. |
| `WOVI_SECRET` | generated into `.data/secret` on a local app | Server secret for code hashes and CSRF tokens. Required off localhost. |
| `WOVI_BUILDER_EMAILS` | empty | The builder allowlist. |
| `EMAIL_PROVIDER` | off | A wired email provider. |
| `WOVI_DATA_DIR` | `.data` | Where the JSON stores, mail and the dev secret live. |

Rate limits use the first `X-Forwarded-For` hop, which is only trustworthy behind our own proxy; that is set at deploy.

## Storage

Each table is a `Collection` with `get`, `find(where)`, `insert`, `update`, `updateIf(id, where, patch)` and `delete`. `updateIf` is the one conditional write (single use of links, codes, invites and challenges; token rotation), which maps to `UPDATE ... WHERE ... RETURNING` in SQL. `memoryAccountStore()` is for tests, `jsonFileAccountStore(file)` for local work (one process). A Postgres store implements the same interface with unique indexes on `users.email` and every `*_hash` column.

## Pages

Bare screens on the existing tokens and components; the real app screens are phase 9. None is linked from the homepage, and all are `noindex`.

- `/sign-in`: email, then the code; or a passkey.
- `/sign-in/verify`: the email link's landing.
- `/invite`: accept an invite (sign in first if needed).
- `/account`: current workspace (switch, rename, create, leave), members and roles, invites, API keys, passkeys, wallets, sign out, sign out everywhere.

## Tests

`npm test` runs them with the memory store, captured mail and a clock the test moves. Passkeys are tested against a software authenticator (P-256, "none" attestation) and wallets against a throwaway key made at test time.
