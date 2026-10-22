# Review, approve and workspaces for teams (phase 11)

From the product doc: "Approval and publish: review queue; the user approves, then posts or schedules", "Humans approve publishing", "Mobile-first for review and approval", agencies with "many clients, repeated manual work", and "every table with a workspace ID from day one, so teams, agencies and multi-tenant features need no migration later."

This phase turns the phase 9 approve step and the phase 10 pipeline approve step into a review flow for teams and agencies, on the phase 4 accounts and policy. Nothing here calls a real model, fetches anything, sends a real email or spends money: tests, the seed script and the screenshots use the fake provider and the dev email sender, and vitest blanks `OPENROUTER_API_KEY` for every test.

The code lives in `src/lib/team/`.

| File | What it holds |
|---|---|
| `types.ts` | The record shapes and fixed lists: item states, decisions, settings, comments, activity, notifications, clients, share links. Client-safe. |
| `rules.ts` | Pure rules: an item's state from its run and its row, who may decide, what a decision does (yeses, rounds), @handles and mentions, share link expiry. |
| `team.ts` | `Team`: the queue, items, decisions, re-runs, comments, assignments, notifications, clients and share links. Every member call goes through `Accounts.authorize`. |
| `store.ts` | Seven tables on the shared `Collection` interface (`.data/team.json`): `items`, `comments`, `activity`, `notifications`, `clients`, `shareLinks`, `settings`. Every row has its workspace id. |
| `server.ts` | One `Team` per server process, sharing the app's run engine, pipelines and Brand Brains. |
| `client-filter.ts`, `brand-pick.ts` | "Working for one client": a per-workspace cookie that narrows the queue, History and the Brand Brain pickers. A convenience, not access control. |
| `team.test.ts` | The tests (below). |

## Items and states

An item is one thing to review: a run started from the app, or a pipeline run. A pipeline's own step runs are reviewed as part of their pipeline run, never alone. The item id is the run id, so links are short (`/app/review/run_...`).

| State | When |
|---|---|
| Draft | The run is still going, or it finished and the workspace waits for the maker to send it. |
| Needs review | Finished and sent, or sent on its own (the default), or a re-run from a change request. |
| Approved | Enough yeses in this round. |
| Changes asked | Someone asked for changes with a note. A new draft starts. |
| Rejected | Someone said no. |

Runs that failed or were stopped stay in History and are not in the queue.

An item row is made the first time someone acts on it (or when the app starts the run, to remember the maker). Until then the state is worked out from the run. A phase 9 or 10 decision made before this phase still counts.

**Rounds.** A yes adds an approval. The round closes when enough people said yes, or at once on a no or a change request. Deciding on a closed item starts a new round, so a decision can be replaced. "Take it back" reopens an item into a new round.

**Kept in step.** Every decision is mirrored into the phase 9 `reviews` table (runs) or the phase 10 pipeline decision, so History, the run page and the pipeline page show the same answer. A change request shows there as rejected with the note "Changes asked: ...". The phase 9 and 10 approve and reject buttons now go through the same rules; with two approvals, the first yes answers "Your yes is in. It needs one more."

## Approval rules (workspace settings)

| Setting | Values | Default |
|---|---|---|
| Who decides | Anyone who can edit (editors, admins, owners), or admins and owners only | Anyone who can edit |
| How many yeses | One, or two from different people (for agencies: a teammate and the client, or two teammates) | One |
| Send on their own | Finished results go to review on their own. Off: each stays a draft until its maker sends it. | On |
| Email notifications | Notifications also go out through the email sender | On |

Only admins and owners change the rules. The same person cannot say yes twice in one round. A client's link counts as one person.

## Asking for changes and the re-run

"Ask for changes" needs a note (3 to 500 characters). It closes the round as Changes asked and starts a new draft at once: the same agent (or pipeline), the same inputs, the same Brand Brain and idea, with the note added to the main text input the way a quick edit adds its note (`applyNote` in `src/lib/app/quick-edits.ts`, "Note for this run: Changes asked for: ..."). The note reaches the agent as data, never as instructions; a long note never takes more than half the field.

The new draft is linked both ways (`reRunOf`, `reRuns`), keeps the maker and the assignee, goes to review on its own when it lands, and both items log the link. If the form has no text input to carry the note, or the run cannot start, the activity log says so and no draft is made.

## Comments and mentions

Comments are threads one level deep: an answer to an answer joins the same thread. A member is mentioned with `@handle`, where the handle is the first word of their name or the part of their email before the @, lowercased, with a number when two clash. The composer shows the handles as chips. Mentions notify the people named; the maker and the assignee hear about other comments. Nobody is told about their own comment.

On client work a comment can be **Team only**: a client never sees it, and a client's answer to it becomes a new thread. Viewers can comment; so can API keys.

## Assignments and notifications

Editors and up assign an item to one member (or nobody). Only members can be assigned.

| Notification | Who gets it |
|---|---|
| Assigned to you | The assignee (not when you assign yourself). |
| You were mentioned | Each member mentioned. |
| Changes asked | The maker, the assignee and whoever sent it, but not the person who asked. |
| Approved | The same people, when the round closes as approved. |
| New comment | The maker and the assignee (and whoever sent it, for a client's comment). |

They show under the bell in the header with an unread count, on `/app/notifications`, and go out through the existing email sender when the workspace has email on. Locally that is the dev sender, which writes files into `.data/mail/`; nothing leaves the machine. Only members of the workspace are notified.

## Clients (agencies)

A workspace can hold clients. Each client is tied to one or more Brand Brains, and a Brand Brain belongs to one client at most, so an item belongs to the client of its Brand Brain. Brands with no client stay in house. A client has a default brand (one of theirs), pre-picked in the agent and pipeline forms while working for that client.

The client switch in the header (desktop) narrows the review queue, History and the Brand Brain pickers to one client. It is a view filter in a cookie; members still see every client.

Owners and admins manage clients and their links. Everyone in the workspace can see the clients and their counts; only managers see the links.

## The client view (share links)

A client gets a link, not an account: `/client/<token>`. It is made per client with a label ("Maya at Northside"), lasts 1, 7, 14, 30 or 90 days, and can be withdrawn at any time. The token is shown once; only its sha256 is stored. Removing a client withdraws all of its links. Pages under `/client` send no referrer and are not indexed.

Through a link a client sees only items whose Brand Brain is theirs, and only once they are in review or decided (never drafts). They see the result (without the internal checks, brand fit numbers or flags), the comments that are not Team only, and the client side of the activity log (sent, yeses, decisions, re-runs). They can comment, approve and ask for changes, unless the link was made "look and comment" only. Rejecting stays with the team. Every client action checks the origin, the link (open, not expired, not withdrawn) and the item, and is rate limited per link.

Strict isolation: another client's items, the agency's in-house brands, drafts, other workspaces, made-up ids and comment ids from other items all answer "not found".

## Access control

Six new actions in the phase 4 policy (`src/lib/accounts/policy.ts`):

| Action | Minimum role | API keys |
|---|---|---|
| `comment` | viewer | yes |
| `send_for_review` | editor | yes |
| `assign` | editor | yes |
| `decide` | editor (raised to admin by the approval rules) | never: people approve |
| `manage_review_rules` | admin | no |
| `manage_clients` | admin | no |

Viewing the queue, an item, clients and notifications needs `view`. Every call names its workspace and refuses items, comments, clients and links from another one. Members' roles are changed on the team settings page through the phase 4 rules (nobody hands out a role above their own; the last owner stays).

## Screens

| Path | What it shows |
|---|---|
| `/app/review` | The queue: state tabs with counts (Needs review, Draft, Changes asked, Approved, Rejected, Everything), filters for client, brand, agent or pipeline, assignee and a search, each item with its client, brand, maker, yeses so far, assignee and a quick Approve. On a phone: the six states in two rows, search and client. |
| `/app/review/[id]` | One item: the result in its typed shape (or the pipeline package), the decision panel (approve, ask for changes with a note, reject, the yeses so far, take it back, send a draft), the assignee, the activity log, and the comment threads with mentions and Team only. A re-run links back to the first draft. |
| `/app/notifications` | The list, newest first, with mark read and mark all read. |
| `/app/clients` | Each client with counts, Brand Brains and default, links (made, shown once, withdrawn), and a new client form. |
| `/app/settings/team` | The approval rules, members and roles, clients and their default brand. |
| `/client/[token]`, `/client/[token]/[id]` | The client view: what waits for them, what is decided, and one item with the result, the decision and comments. |

The header gained Review (with the waiting count), the bell and the client switch. The phone tab bar has seven tabs; Pipelines reads "Chains" there.

## Commands

```
npm test                           # everything, on the fake provider
```

Screenshots of this phase (keep `OPENROUTER_API_KEY` empty):

```
WOVI_DATA_DIR=/tmp/wovi-team-screens OPENROUTER_API_KEY= npm run agents:launch
WOVI_DATA_DIR=/tmp/wovi-team-screens OPENROUTER_API_KEY= WOVI_FAKE_LATENCY_MS=2500 npm start
WOVI_DATA_DIR=/tmp/wovi-team-screens OPENROUTER_API_KEY= node scripts/team-screens.mjs
```

It signs in through the email flow, skips onboarding, then runs `scripts/seed-team.ts`, which makes the workspace a small agency (Loop Studio: an owner, an admin, two editors and a viewer; two clients; two approvals) with work in every state, comments, an assignment and a re-run. Then it shoots the queue, an item with comments and the decision, a reply with a mention, asking for changes and the new draft, notifications, the clients page and a new link, the client's view and item, the approval rules, and two phone views. Output goes to `~/WOVI-team-screens/`.

## Tests

`src/lib/team/team.test.ts` (21 tests) and the policy table in `src/lib/accounts/policy.test.ts`:

- rules: the state from the run and the row; yeses, a no closing the round, the same yes twice refused, a new round after a decision; handles and mentions;
- the flow: draft, sent, approved, taking it back, the phase 9 decision following; the activity log with who and when; asking for changes needs a note and starts a linked re-run with the note on the main input, for the same people, going to review on its own; the same on a pipeline run;
- approval rules: editors by default, never a viewer or an API key; admins and owners only; two approvals from different people, the phase 9 button waiting for the second yes, a no closing the round; the phase 9 and 10 buttons going through the same rules;
- comments, assignments and notifications: threads one level deep, mentions notified and emailed through the sender, the maker hearing about comments, assignments to members only, changes asked and approved notified, mark read, email off;
- clients and links: a Brand Brain belongs to one client, filters by client, brand, agent and state, counts; a client sees only their own items in review (not drafts, not another client's, not in-house), no internal comments, checks or names of other brands; a client's comment and yes signed with the link's label; a client yes counting as one of two; look-only links; a client's change request starting a re-run they see; client comments never inside a Team only thread; expiry, withdrawal, made-up tokens, removing a client;
- isolation: an outsider gets nothing, another workspace cannot reach an item, client or link, a pipeline's step run is not an item.

## Later

- Scheduling and publishing approved posts through each platform's official API (the doc's step 6), with the approval recorded for disputes.
- A client role inside the workspace for clients who want an account; the link already holds the rules.
- Real email delivery when the app is deployed; the sender interface is already in place.
- Notifications over webhooks and the event stream (phase 14).
