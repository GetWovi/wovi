# The app screens (phase 9)

The screens real users see, on Funkai's brand: night first and light as the alternate, Outfit, big rounded panels, orange eyebrows, cream headlines, stickers and sparkles, and Wovi's poses with meaning (hello on welcome and empty states, on the move while a run goes, waiting when idle, done when a result lands). Desktop and phone are both first-class: the nav becomes a tab bar at the bottom under 760px.

The product doc's user journey is the spine: onboarding (pick niche and platforms, paste 3 to 5 past posts, the platform builds a Brand Profile), "idea in, content out" through forms instead of prompts, and the human approve step. Everything runs on the phases before it: the agent specs and registry (2), the run engine (3, on the fake provider until a key exists), accounts and workspaces (4), the Brand Brain (7) and the launch agents (8). Nothing here calls a real model or spends money.

The code lives in `src/lib/app/` (the logic), `src/components/app/` (the screens' parts) and `src/app/app/` (the routes and server actions).

| File | What it holds |
|---|---|
| `src/lib/app/types.ts` | The onboarding row and the review row, with the fixed lists. No storage, so client code can import it. |
| `src/lib/app/store.ts` | The two tables (`onboarding`, `reviews`) on the shared `Collection` interface: memory for tests, `.data/app.json` for local work. |
| `src/lib/app/onboarding.ts` | The four steps, moving between them, cleaning a saved patch, "3 to 5 posts" before reading. Pure. |
| `src/lib/app/forms.ts` | The agent's form from its spec: one friendly field per typed input, limits in words, values to run inputs, the engine's own validation mapped back to fields. |
| `src/lib/app/results.ts` | A run as the screen shows it: the typed output as blocks and items, brand fit, every flagged check in plain words, one state per run, the run's title. |
| `src/lib/app/quick-edits.ts` | Shorter, punchier, more like my brand: the note that is added to the main input for a re-run. |
| `src/lib/app/lineup.ts` | The agents the app shows, in the doc's order, grouped by what a person wants to do. |
| `src/lib/app/api.ts` | `AppApi`: everything the server actions call, with the caller named on every call. |
| `src/lib/app/server.ts` | One `AppApi` per process, `appPage`, `appAction`, the onboarding redirect. |
| `src/lib/app/app.test.ts` | The tests (below). |

## Screens

| Path | What it is | Wovi |
|---|---|---|
| `/app/welcome` | Onboarding, four steps. Reachable later from Settings (`?restart=1` starts over). | hello |
| `/app` | Home: the workspace's Brand Brains, the agents, the latest runs, "Make something". A person with no Brand Brain and no decision on onboarding is sent to the welcome. | hello, wait, move or done, by what is going on |
| `/app/make` | The agents grouped by stage: get ideas, write the post, make it travel. | wait on each card |
| `/app/make/[agent]` | The agent's form, the run on the move, the result. `?run=<id>` opens that run. | wait, move, done |
| `/app/runs/[id]` | One run with what was asked for, the result and the decision. | done |
| `/app/history` | Every run with its state, search and filters, approve or reject in the list. | the state's pose on each row |
| `/app/settings` | Entry points: Brand Brains, workspace and members, API keys, sign-in and wallet, history, onboarding again; the Agent Builder for builders. | |
| `/account`, `/brand-brain/*` | The phase 4 and 7 pages, now inside the app chrome. Their logic is unchanged. | |

Signed-out people go to `/sign-in?next=...` and come back. Sign-in lands on `/app` by default. The hidden builder stays hidden: nothing in the app links to it except the Settings button a builder sees.

The chrome (`AppShell`): logo left, Home, Make, History (with how many runs wait for a decision), Brand Brain, Settings; the workspace switcher as a pill with the role beside it; the account; GitHub and X as the site chrome has them; the theme toggle. On a phone the nav is a tab bar at the bottom and the icons and role go.

## Onboarding

1. **Welcome.** Wovi waves. What the three steps are, "Let's go" or "Skip for now".
2. **Your brand.** Name, what you do, platforms. Skippable.
3. **Your posts.** Paste 3 to 5 posts (a link on its own line is kept as a reference). "Read my posts" runs the phase 7 profile proposal. "Skip, start without posts" makes a blank Brand Brain from the name when one was given.
4. **Your voice.** The proposed description, tone, words to use and avoid, sample lines, topics, dos and don'ts, and an optional idea, all editable, beside "What I noticed" from the plain counts. "Save and start" saves the first Brand Brain with the posts as references and lands on the home with Wovi celebrating.

Progress is saved after every step per person and workspace (`onboarding` rows), so a person can leave and come back. New posts drop a stale proposal. The review step cannot be opened without a proposal. Viewers see a hello and a note that someone with edit rights sets up the Brand Brain.

## The agent form

`formFields(spec)` turns every typed input into a field with a friendly label, the spec's help (or the limits in words when it has none), and the limits: text and long text with their character range, links, numbers with min, max and step, one choice as a select, several as chips, images and files with a picker that uploads through the workspace's file storage (the Brand Brain's image limits for images, the builder's text limits for files; video uploads wait for the media tools, like the engine does). The Brand Brain picker is drawn by the screen: a select of the workspace's Brand Brains with the default preselected, and "Build one" when there are none. Agents that read the brand idea get an optional idea for this run (`brandIdea` on the request). Agents with `rights_confirmed` or `voice_consent` get a checkbox each; the run is refused without it, as the engine already did.

"Fill with an example" fills the form from the agent's golden samples, the one written for the picked Brand Brain when there is one, so a first-time person never starts from a blank page.

Before a run starts, `checkForm` runs the engine's own `validateRunInputs` and puts each message under its field. A refusal from the engine comes back the same way ("idea: Must be at least 10 characters").

## The run

`startRun` goes through `GuardedRuns.submitRun`, so the phase 4 policy decides (viewers see the form and cannot run; the button says why). While the run is queued or running the screen polls it every second: Wovi on the move, the steps as the engine reports them (sent, in the queue, writing, checked), the seconds, what was asked for, and Stop. When it lands, the result.

The result, in its typed shape:

- **Lines** (hooks): numbered, one copy button each.
- **Cards** (ideas, tags and search words, trends): the lead field big, the rest as labelled parts; a tag card shows the term, where it goes and why.
- **Beats** (a script): hook, setup, turn, ending with the seconds, what to say and what is on screen.
- **Platforms** (captions, repurposed posts): one block per platform; a version written in the repurposer's `Hook:`, `Script:`, `On screen:`, `Caption:` layout is shown as labelled parts.
- **Copy everything** gives the whole result as plain text.

Above it: brand fit as one number with a plain reading (sounds like you, close to your voice, a little off, breaks a rule), and every flagged check in plain words with what was found: "Uses filler phrases", "Makes a claim it cannot back up", "Uses words your brand avoids", "Breaks a brand rule", "Could be about anyone", "Too long for the platform", plus the AI-label note. The fake provider writes filler from the inputs, so results on it are placeholder text; the shapes, checks and brand fit are real.

**Quick edits** (Shorter, Punchier, More like my brand) run the same job again with a note on the person's main input ("Note for this run: ..."), so the agent's instructions never change and the engine treats it as data like everything the person typed. A second edit replaces the note rather than piling up, and the note never counts as part of the run's title. "Make another" clears the form.

## Review and history

The human approve step from the doc, kept simple (full workspace review flows are phase 11): every finished run can be **approved** or **rejected** with a note by anyone who can run agents, once per run (deciding again replaces it, "Take it back" clears it). Viewers read.

One state per run: in the queue, running, failed, cancelled, needs review (a guardrail failed and nobody has decided), ready (clean, nobody has decided), approved, rejected. History lists every run newest first with search over the inputs, the result and the agent's name, a status filter (including "waiting for a decision"), and an agent filter, with Yes and No on the rows that wait. The History link in the nav counts the runs waiting.

WOVI posts nothing. Approve means the draft is ready for the person to use.

Since phase 11 these buttons go through the workspace's approval rules (who decides, one or two yeses), and the review queue, comments, assignments and clients live in `docs/review-and-teams.md`.

## The homepage cards

The agent cards on `/` now show the phase 8 lineup: Idea Generator, Hook Writer, Script Writer, Caption Writer, Hashtag Optimizer and Platform Repurposer live, Trend Scout as coming, Storyboarder and Voice and Cut as next. Nine cards in three rows of three. The seeds test ties the cards to the lineup people actually get (`npm run agents:launch`: the launch specs over the phase 2 seeds): names, jobs and statuses (live, coming is a draft, next is hidden). `SEED_AGENTS` itself stays the phase 2 base, because the launch set is saved as new versions on top of it and the launch tests depend on that.

## Commands

- `node scripts/app-screens.mjs [outDir]` takes the screenshots against a running build. It signs in through the real email flow (the dev mailer writes the code into `<dataDir>/mail/`), walks onboarding, seeds the example Brand Brains into the new workspace, runs three agents, makes one flagged run, approves one, and shoots desktop, light mode and phone:

  ```
  WOVI_DATA_DIR=/tmp/wovi-app-screens npm run agents:launch
  WOVI_DATA_DIR=/tmp/wovi-app-screens WOVI_FAKE_LATENCY_MS=4000 npm start
  WOVI_DATA_DIR=/tmp/wovi-app-screens node scripts/app-screens.mjs
  ```

- `npm test` covers onboarding (the steps, cleaning, the whole flow through the API: saved progress, the proposal, the first Brand Brain as default, skip, restart, outsiders), the form from a spec (every input type, defaults, run inputs, the engine's errors by field, examples, confirmations), the lineup (the doc's order, Trend Scout coming, grouping), the run lifecycle on the fake provider through the API layer the server actions call (start, wait, read back, field errors by key, the rights confirmation, quick edits with the note, a flagged run that needs review, approve and reject with a note, only finished runs, cancel, search and filters), access control (viewers look but cannot run or decide, outsiders get not found, another workspace sees nothing), the result view per output kind, checks in plain words, and the homepage cards in sync with the lineup.

## Not yet

- The server actions themselves are thin (origin, session, CSRF, one API call) and are exercised by the screenshot script against the built site, not by vitest.
- Pipelines are phase 10 ([pipelines.md](pipelines.md)): the nav, history and run pages gained them there. Full review flows and comments (phase 11), quality gates (phase 12), credits (phase 13, [credits.md](credits.md)) and MCP and REST (phase 14) are not here. The run page already carries everything they need: the typed output, the checks, the decision.

## Live stats

Under every result: Use it (copies the whole result), Edit (change it and keep your version, which is copied), Try again (the same job again) and the thumbs with an optional note. Copying any item, approving and asking for changes count too. Agent cards in the gallery and on the home show "Used as is", "Edited" and "Thumbs up" from real runs, and the agent page has a Live stats section with every number and what it was counted from; below 20 runs a number says New. See [stats.md](stats.md).

## Safety (phase 18)

The agent form shows each of the agent's platforms' rules beside it, asks for the rights box before a file can be picked, and shows "WOVI cannot make this" with the reasons when the content rules refuse a request. Every result has the AI-label reminder with its box (stored on the run) and a Report link. Legal links are in every footer. See [safety.md](safety.md).
