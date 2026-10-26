WOVI: Project Documentation
Oct 21, 2026 · @Someone
Problems we solve
The product serves three kinds of users, and every feature in this document traces back to a problem below, stated in their own words. Anything that solves none of them is cut.
#
Who
Problem (their words)
Our answer
C1
Business owner
"I have ideas, but no creativity or time to make content."
Idea-in, content-out agents: the owner supplies the idea, agents do the execution
C2
Business owner
"I have money but don't want to hire people. I want it faster and cheaper."
Pay-per-run credits and pipelines that replace a freelancer or agency for routine content
C3
Business owner
"I don't know how to prompt."
Forms, templates and a Brand Brain instead of prompts; the user never writes one
C4
Business owner
"I don't know which model works for which task."
Hidden model routing: each agent is tuned for one task on the best-fit model, and the user never picks
C5
Business owner
"Most AI doesn't give what I specifically need."
One agent = one task, with typed inputs, so output matches the request
C6
Business owner
"Most AI is slop."
Anti-slop system: reference-anchored output, quality gates, scored agents (see below)
C7
Business owner
"I want to create from my vision, not a generated vision, but let AI execute it well."
Vision-first design: the user's references, mood board and ideas steer every run; agents execute, they don't invent direction
P1
Power user
"I want to use the agents with my Claude or ChatGPT."
Every agent exposed as an MCP server and tool, so any assistant can call it
P2
Power user
"I want to use the agents with my own software."
Public REST API, SDKs, webhooks, and API keys per workspace
P3
Power user
"I want to add the agent to my swarm."
Agent-to-agent protocol: callable by other agents with typed I/O, metered billing, and per-call limits
B1
Creator
"I want to build and sell my own AI agent."
Public Agent Builder plus a marketplace listing and distribution
B2
Creator
"I want to build it with only prompts, mood boards and sample works."
No-code builder: prompt, mood boards, sample works, and rules as the only inputs
B3
Creator
"I want credibility scores and reviews."
Verified score from real runs plus reviews from verified users only
B4
Creator
"I want my agent to keep improving as it gets employed."
Feedback and edits from live runs flow back into the builder as proposed improvements
B5
Creator
"I want my agent to get paid."
Revenue share, per-run pricing, and payouts with transparent earnings
What these problems change in the plan
1. Vision-first input is the core feature, not an extra. Every user has a Brand Brain (brand voice, mood board, reference posts, do and don't list, and the idea itself). Agents must anchor to it, which is also our main answer to "slop."
2. Anti-slop is a system. Reference anchoring, banned generic phrases, a specificity check, a brand-fit score, a human approve step, and per-agent quality scores shown to users.
3. Model choice is invisible. The platform routes each agent to the right model and can swap it without the user noticing.
4. Three audiences from the start. Consumers (web app), power users (MCP, API, swarm access), and creators (builder, reviews, payouts). Creators move earlier in the roadmap, because supply of good agents is what makes the marketplace work.
5. Agents learn on the job. Live feedback becomes training signal for the creator, with the creator approving changes before they ship.
1. Vision and product principles
We are building a marketplace of single-purpose AI agents for social media content, where each agent does exactly one job (write hooks, cut clips, write captions) and gets measurably better at it over time. Creators pick agents, chain them into pipelines, and judge them by real results. Unlike faiv, which bundles capabilities, every agent here is narrow, so it can be tuned, scored and priced on one outcome.
Principles
1. One agent = one task. A narrow scope makes quality measurable and the agent easy to replace or improve.
2. Consumer first. A non-technical creator can pick, run and chain agents in under 5 minutes, with no prompt writing required.
3. Measured, not claimed. Every agent shows live stats (acceptance rate, edit rate, engagement lift), never self-reported claims.
4. Tunable by conversation. We (and later creators and third parties) improve agents by describing changes in plain language and feeding sample work.
5. Humans approve publishing. Agents draft; people publish, which keeps us inside platform rules.
6. Built to expand. A standard agent spec means new agents, new platforms and new builders plug in without rewrites.
Phased scope
Phase
Who builds agents
Who uses them
Phase 1
Us only, via the internal Agent Builder
Creators, as preset agents
Phase 2
Vetted creators (invite-only), with reviews and payouts
Creators and small teams
Phase 3
Open to any creator
Open marketplace, with revenue share
2. Target users and jobs-to-be-done
The launch audience is solo creators and small social teams who post often and lose time on repetitive content work. Assumed from the brief; to be validated with 10 to 15 user interviews before launch.
User
Main pain
Job they hire us for
Solo creator
Too much time on editing, captions, ideas
Turn one idea or video into a week of posts
Small brand or SMM
Consistency across platforms and voice
Keep a steady, on-brand posting flow
Agency
Many clients, repeated manual work
Reusable pipelines per client
Faceless or niche channel
Needs volume without a camera
Script-to-post pipelines
Success looks like
• A new user runs their first agent within 3 minutes of signup.
• Over 60% of agent outputs are accepted with light or no edits (target to calibrate in beta).
• Users return weekly and chain 2 or more agents in a pipeline.
3. Preset agent catalog: essential content tasks
The launch catalog covers the full content cycle in 6 stages, with 24 agents. Each is one task. Priority P0 agents ship at MVP; P1 follow in v1; P2 later.
Stage
Agent (one task)
Input
Output
Priority
1. Research
Trend Scout
Niche, platform
Ranked trending topics, sounds, formats
P0
1. Research
Competitor Analyzer
Account handles
Top-performing content patterns
P1
1. Research
Audience Insight
Comments, analytics
Audience questions and pain points
P2
2. Ideation
Idea Generator
Niche, brand profile
List of post ideas
P0
2. Ideation
Content Calendar Planner
Ideas, goals, frequency
Weekly or monthly schedule
P1
3. Writing
Hook Writer
Topic
10 scroll-stopping opening lines
P0
3. Writing
Script Writer
Idea, length, tone
Short-form video script
P0
3. Writing
Caption Writer
Post content, platform
Platform-fit caption
P0
3. Writing
Thread and Carousel Writer
Topic
Slide-by-slide copy
P1
3. Writing
Call-to-Action Writer
Goal, post
CTA variants
P2
4. Production
Long-to-Short Clipper
Long video
Short clips with timestamps
P1
4. Production
Subtitle and Caption Burner
Video
Accurate styled subtitles
P1
4. Production
Thumbnail and Cover Generator
Post, brand style
Cover options
P1
4. Production
Voiceover Generator
Script, voice
Audio track
P1
4. Production
Image Post Designer
Text, brand kit
Branded graphic
P1
5. Optimization
Hashtag and Keyword Optimizer
Caption, platform
Tag and SEO set
P0
5. Optimization
Platform Repurposer
One post
Versions for each platform
P0
5. Optimization
Brand Voice Checker
Draft, voice profile
Pass or fix notes
P1
5. Optimization
Localizer and Translator
Post, language
Localized version
P2
6. Publish and grow
Scheduler (approval-based)
Approved posts
Queued posts, best times
P1
6. Publish and grow
Comment Reply Drafter
Comments
Draft replies for approval
P1
6. Publish and grow
Performance Reporter
Analytics
Weekly insights
P1
6. Publish and grow
A/B Test Runner
Variants
Winner and learnings
P2
6. Publish and grow
Content Recycler
Past top posts
Refreshed versions
P2
MVP set (P0, 7 agents): Trend Scout, Idea Generator, Hook Writer, Script Writer, Caption Writer, Hashtag Optimizer, Platform Repurposer. Together they cover idea to ready-to-post text for short-form video, the most common creator workflow. Video itself is added in stages, as described below.
Output rule: match the task, and stage the video
Each agent returns the output type its task needs: text tasks return text, image tasks return images, and video is never made in one jump. A video request runs in four stages, and the user approves each before the next one costs more:
1. Script (text): written from the user's idea and Brand Brain.
2. Storyboard (images): one image per scene, so the user sees the vision and can change it.
3. Approval and edits: the user adjusts scenes, wording or style, and picks a voice.
4. Voiceover and video render: the Voiceover Generator reads the approved script, then the Video Renderer assembles the video from the approved storyboard and audio. Cloned or celebrity voices need documented consent.
Why this order: changes are cheap until the final step, the user's vision stays in control (problem C7), expensive renders are rarely wasted, and credits are shown and charged per stage.
Two agents join the catalog for this: Storyboard Generator (script in, scene images out) and Video Renderer (approved storyboard in, video out). Long-to-Short Clipper and Subtitle Burner move to P1, since they edit existing footage and need heavy video processing.
4. Agent Builder (internal tool, later public)
The Agent Builder lets a non-engineer create and improve an agent by describing it in plain language, attaching sample work, and watching live stats. It is the most important backend deliverable, because every catalog agent, and later every third-party agent, is made with it.
Core capabilities
1. Create by prompt. Describe the task ("write TikTok hooks for fitness creators, punchy, under 12 words"). The builder generates a first agent draft: system prompt, input fields, output format, and default parameters.
2. Sample work library. Upload good examples (gold), bad examples (anti-patterns), mood boards and reference posts, each with notes on why. The builder uses them as few-shot examples and as the evaluation set.
3. Conversational tuning. Tell the builder what to change ("make hooks less clickbait", "always include a question"). It edits the agent's instructions and shows a before and after diff on the same test inputs.
4. Parameters panel. Expose adjustable settings: model choice, temperature, length limits, tone, banned words, number of variants, required output fields.
5. Test bench. Run the agent on a saved test set, compare versions side by side, and rate outputs with thumbs and short notes.
6. Stats dashboard. Live metrics per agent and per version: acceptance rate, edit distance, regenerate rate, latency, cost per run, and (when connected) downstream engagement.
7. Versioning and rollback. Every change creates a new immutable version. Publish, canary to 10% of traffic, or roll back in one click.
8. Guardrails. Per-agent rules for safety, brand and platform policy, enforced before output reaches the user.
The fine-tuning loop
1. Create the agent from a prompt and add 10 to 30 sample works.
2. Run the test bench and review outputs against the samples.
3. Give feedback in plain language; the builder proposes an instruction change.
4. Compare the new version against the old on the same test set and on live traffic.
5. Publish if scores improve; otherwise revise or roll back.
6. Weekly: review the stats dashboard, pick the weakest agents, repeat.
Tuning approach, in order of effort
Level
Method
When to use
1
Prompt and instruction edits
Default for every change
2
Few-shot examples from the sample library
Style and format consistency
3
Retrieval of top-performing past outputs
Niche or brand-specific quality
4
Model fine-tuning or distillation
Only for high-volume agents once data exists (thousands of rated outputs)
Start at levels 1 to 3. They are cheap, reversible and enough for the MVP.
Preset agents use the same builder. Our own agents are created, trained and tuned in the same Agent Builder that creators use, under a platform-owned creator account. They are scored on the same public scorecard and priced by the same rules, so creators can see what a strong agent looks like, and we can prove the builder works by using it ourselves. Internal extras (bulk evaluation, shared templates) can sit on top without changing the core flow.
5. Agent specification (the standard contract)
Every agent, preset or third-party, is defined by one versioned JSON spec. This is the key to scalability: the platform never needs agent-specific code, only the spec.
{
  "id": "hook-writer",
  "version": "1.4.0",
  "name": "Hook Writer",
  "task": "Write scroll-stopping opening lines",
  "category": "writing",
  "platforms": ["tiktok", "reels", "shorts"],
  "inputs": [
    {"name": "topic", "type": "text", "required": true},
    {"name": "brand_profile", "type": "profile", "required": false}
  ],
  "outputs": [
    {"name": "hooks", "type": "text[]", "count": 10}
  ],
  "instructions": "...system prompt...",
  "examples": ["sample_id_1", "sample_id_2"],
  "parameters": {"model": "default", "temperature": 0.8, "max_words": 12},
  "guardrails": ["no_misleading_claims", "brand_voice_check"],
  "tools": ["trend_lookup"],
  "pricing": {"unit": "run", "credits": 1}
}
Rules
• Typed inputs and outputs (text, text[], video, image, audio, profile, schedule) so agents can be chained with validation.
• Semantic versioning. Patch for tweaks, minor for new optional fields, major for output changes that could break pipelines.
• Immutable versions. Pipelines pin a version or follow "latest stable".
• Model-agnostic. The spec names a capability tier, and the platform maps it to a provider, so we can switch or mix models without touching agents.
• Tools are declared. An agent can only call tools listed in its spec (trend lookup, transcription, video cut), which keeps permissions and cost under control.
• Vision inputs. The spec declares which parts of the user's Brand Brain it reads (voice, mood board, references, do and don't list), so output is anchored to the user's direction.
• Interfaces. The same spec is served as a web form, an MCP tool, a REST endpoint and an agent-to-agent call. One definition, four ways in.
• Marketplace fields. Owner, price, revenue share, credibility score and review summary live beside the spec, not inside it, so score and money changes never create a new agent version.
6. Quality, evaluation and metrics
Agent quality is judged on three layers: did the user accept it, does it pass automatic checks, and did it perform after posting. Targets below are starting values to calibrate in beta, not measured results.
Metric
What it tells us
Source
Starting target
Acceptance rate
Output used without regenerating
In-app action
Above 60%
Edit rate
How much users change the output
Text or media diff
Below 30% changed
Regenerate rate
Output missed the mark
In-app action
Below 25%
Rating
Explicit thumbs up or down
In-app
Above 80% up
Spec compliance
Output matches format and constraints
Automatic validator
Above 98%
Brand-voice match
Fit with the user's profile
Reviewer agent
Above 85%
Engagement lift
Performance vs the creator's baseline
Connected analytics
Positive, tracked over time
Latency and cost
Speed and unit economics
Platform logs
Per-agent budget
How evaluation works
• Gold test set per agent: 30 to 50 curated inputs with reference outputs, rerun on every new version.
• LLM judge plus human spot checks: an automatic judge scores outputs against a rubric; humans audit a weekly sample so the judge does not drift.
• Regression gate: a new version cannot publish if it scores below the current version on the gold set.
• Canary release: new versions serve 10% of live traffic first, compared on acceptance and edit rate.
• Feedback to improvement: low-scoring outputs and user edits flow back into the sample library as candidate examples, reviewed before use.
7. Consumer experience
A creator should get a usable result in the first session and never need to write a prompt. Complexity stays hidden until they ask for it.
Key screens
1. Onboarding: pick niche and platforms, paste 3 to 5 past posts or links. The platform builds a Brand Profile (voice, topics, dos and don'ts) used by every agent.
2. Agent gallery: browse by stage or goal ("Get ideas", "Write the post", "Edit my video"), with live stats on each card.
3. Run screen: simple form from the agent's input spec, then results as cards with Use, Edit, Regenerate and rating.
4. Pipeline builder: drag agents into a chain (Trend Scout, Hook Writer, Caption Writer), or start from a template such as "Idea to ready post".
5. Project workspace: all outputs, drafts and approved posts for a campaign in one place.
6. Approval and publish: review queue; the user approves, then posts or schedules.
7. Insights: which agents and outputs actually performed, with suggestions.
8. Settings: brand profile, connected accounts, credits and billing.
UX rules
• Every result is editable inline, and edits teach the system (with user permission).
• One-click templates for common goals, so a beginner never starts from a blank page.
• Show cost in credits before running anything expensive (video work).
• Mobile-first for review and approval; desktop for batch work and pipelines.
• Clear "AI-generated" labeling support to match platform disclosure rules.
Launch platforms: X, TikTok, YouTube Shorts and Instagram Reels
Every agent output is shaped to the platform it is for: X favors text, while the three short-video platforms get script, storyboard and voice first. Start with export and copy, where the user posts manually, then add publishing through each platform's official API. Each platform has its own API access and review rules, so check them early, before building the publish step.
8. System architecture and tech stack
The system is built around one agent registry: the web app, MCP, the API and agent-to-agent calls all run the same versioned spec, so a new agent works everywhere with no extra code.
Every entry point passes the gateway for auth and credits. Runs go through a queue, so long video jobs never block the app, and the model router can swap providers without touching any agent.
Suggested stack (for the developer to confirm)
Layer
Suggestion
Why
Web app
React with TypeScript (Next.js)
Fast to build, mobile-friendly, large talent pool
Backend and workers
TypeScript or Python services behind one API
Matches the AI tooling ecosystem
Queue
Managed queue or Redis-based job queue
Long-running video and pipeline jobs, retries
Database
PostgreSQL, with vector search for sample retrieval
Relational data plus example lookup in one place
Assets
S3-compatible object storage with a CDN
Video, image and audio at scale
Media tools
FFmpeg workers and a transcription service
Clipping, subtitles
Models
Provider-agnostic gateway layer
No lock-in; route by cost and quality
MCP and API
Official MCP SDK plus a REST API with OpenAPI docs
Claude, ChatGPT and custom software access
Payments and payouts
Card and fiat top-up for owners, x402 and $WOVI for crypto users
Confirm facilitator support for the target chain and stablecoin
Scalability principles
• Stateless services and queue-based runs, so capacity scales by adding workers.
• Multi-tenant from day one: every record carries a workspace ID.
• Agents are data (specs), not code, so thousands can exist without deployments.
• Per-run cost tracking and caps, so margin is visible per agent.
• Full run logging, which also feeds evaluation and creator improvement loops.
9. Data model and APIs
The data model has 12 core entities. Design every table with a workspace ID from day one, so teams, agencies and multi-tenant features need no migration later.
Entity
Purpose
Key fields
User and Workspace
Accounts, teams, roles
id, plan, credits, role
Brand Profile
Voice, topics, dos and don'ts
workspace_id, voice, examples
Agent
Identity of an agent
id, owner, category, status
Agent Version
Immutable spec snapshot
agent_id, version, spec_json, eval_score
Sample
Gold or bad example work
agent_id, input, output, label, notes
Test Set and Test Run
Evaluation inputs and results
agent_version, scores, cost
Run
One execution of an agent
agent_version, input, output, status, cost, latency
Feedback
Accept, edit, regenerate, rating
run_id, action, diff, rating
Pipeline and Pipeline Run
Chained agents and executions
steps, pins, trigger, status
Asset
Files (video, image, audio)
owner, type, storage_url, metadata
Connected Account
Social platform links
platform, token_ref, scopes
Ledger
Credits and billing events
workspace_id, delta, reason, run_id
Core API surface (REST, versioned under /v1)
Area
Example endpoints
Agents
GET /agents, GET /agents/{id}, POST /agents (builder), POST /agents/{id}/versions
Runs
POST /agents/{id}/run, GET /runs/{id}, POST /runs/{id}/feedback
Builder
POST /builder/draft (from prompt), POST /builder/tune (instruction change), POST /builder/test
Samples and eval
POST /agents/{id}/samples, POST /agents/{id}/evals, GET /agents/{id}/stats
Pipelines
POST /pipelines, POST /pipelines/{id}/run, GET /pipeline-runs/{id}
Assets
POST /assets (signed upload), GET /assets/{id}
Accounts
POST /connections/{platform}, GET /connections
Billing
GET /credits, GET /usage
Long-running work (video) returns a run ID immediately; clients poll or subscribe to webhooks and server-sent events for progress.
10. Pipelines and agent-to-agent composition
A pipeline is a saved chain of agents where each step's typed output becomes the next step's input, and the user's idea and Brand Brain steer every step. The same engine serves the app, Claude or ChatGPT through MCP, custom software through the API, and other agents in a swarm.
The example is the "idea to ready post" template: a failed brand check sends the draft back for a rewrite, and a person approves before publishing.
How composition works
• Typed handoffs: the engine validates each output against the next agent's input spec, and stops with a clear error instead of passing bad data on.
• Version pinning: a pipeline pins agent versions or follows "latest stable", so an agent update never silently breaks a saved chain.
• Budget per run: every pipeline run has a credit cap, so a loop or a long chain cannot overspend.
• Failure handling: retry, fall back to an alternate agent, or return partial results with the failed step marked.
• Templates: common chains are one-click starting points, so beginners never build from scratch.
Swarm and external callers
• Each agent is callable as an MCP tool and a REST endpoint, with the same typed input and output.
• Calls carry the caller's identity, a spending limit and a depth limit, so agents calling agents cannot run away.
• Long jobs return a run ID and report back by webhook or event stream.
• Usage is metered on the same credit ledger, so creators are paid for calls from swarms too.
11. Safety, platform policy, copyright and compliance
The main risk is losing creators' accounts or inviting legal trouble, so these controls are built in, not added later. Legal review is needed before launch; this section is a product requirement list, not legal advice.
Area
Requirement
Platform rules
No auto-engagement bots (mass liking, following, commenting). Publishing and replies need human approval. Use official platform APIs only.
AI disclosure
Support and prompt users to apply each platform's AI-content labels where required.
Copyright
Clipper and repurposer work only on content the user owns or has rights to; user confirms this at upload. Music and sound use follows platform libraries.
Misleading content
Guardrails block fake testimonials, false claims, impersonation of real people, and deepfakes.
Brand and harmful content
Output filters for hate, harassment, sexual content and unsafe claims, with per-agent additions.
Prompt injection
Agents treat user-supplied text, comments and scraped pages as data, never instructions; tools are limited to those declared in the spec.
Privacy
Store tokens encrypted, collect minimum data, allow export and deletion, and ask consent before using a user's edits to improve agents. Review GDPR and local data laws for target markets.
Third-party agents (Phase 3)
Review before listing, sandboxed execution, no access to user data beyond the declared inputs, takedown process.
Audit
Log every run, version and publish approval for dispute handling.
12. Monetization and marketplace economics
Users pay per outcome with credits; creators earn a share of every run of their agent. Percentages and prices below are proposals to test, not validated figures.
Stream
How it works
Who pays
Notes
Credits
One credit pack buys runs; each agent lists its cost per run
Business owners, power users
Simple and predictable; show cost before running
Subscription
Monthly plan with included credits, saved pipelines, more workspace seats
Teams, agencies
Better margin and retention than credits alone
API and MCP usage
Metered per call, with workspace API keys
Power users, swarm builders
Same credit ledger as the app
Creator revenue share
Creator keeps a majority share of each run (proposal: 70%) and the platform keeps the rest after model costs
Paid out to creators
Must stay above the model cost per run or the agent is unprofitable
Listing and verification
Optional paid verification for a trust badge
Creators
Phase 3
Featured placement
Promoted agents in the gallery, clearly labeled
Creators
Only after reviews are trustworthy
Rules that keep it healthy
• Unit economics per run: price must exceed model, tool and storage cost plus the creator share. The dashboard shows margin per agent.
• Payouts: monthly, above a minimum balance, with a clear earnings dashboard. Paid in credits, with an optional swap to $WOVI; needs tax and compliance handling (see open questions).
• Credibility score: built from verified runs only (acceptance, edit rate, rating, spec compliance), shown with review count. Reviews require a real paid run, so they cannot be faked.
• Fraud control: block self-purchase loops, review swapping, and credit farming.
• Refunds: automatic credit refund when a run fails validation.
Payments with x402
x402 is an open standard that revives the HTTP 402 "Payment Required" code: a server answers a request with the price, the caller pays in stablecoin, and a facilitator verifies and settles it (explainer). Version 2 adds wallet-based identity, so a caller does not repay on every call, plus API discovery and support for more chains and fiat (Coinbase V2 coverage). Fit for this product:
• Swarms and API callers (P3): agents and software pay per call with no API keys or prepaid accounts, which suits pay-per-run pricing.
• Creator payouts: creators are paid in credits and can swap them to $WOVI (see section 13). x402 is for crypto-paying agents and power users who buy credits or pay per call.
• Business owners (C1 to C3): they should not need a wallet. Keep card top-up into credits for them, and use x402 behind the scenes and for power users.
• Open checks: whether facilitators support Robinhood Chain (otherwise settle on a supported chain), stablecoin choice, and tax, KYC and legal review of paying creators in stablecoin.
13. Credits, pricing and the $WOVI economy
Credits are the one currency inside the product: users hire agents with them, creators earn them, and they connect to card payments on one side and $WOVI on the other. Everything here is a proposal to confirm with legal counsel and your team.
Money comes in by card, crypto or the holder allocation, is spent on agent jobs, and creators earn credits they can swap to $WOVI.
Credit rules (proposed)
• Buy: card or other fiat rails for owners with no wallet; $WOVI or stablecoin (including x402) for crypto users.
• Spend: a fixed price per job, shown before it runs. Video stages are priced separately.
• Earn: creators receive credits for each completed job and can spend them, hold them, or swap them to $WOVI.
• Holder credits: $WOVI holders receive a credit allocation, funded by the holder allocation pool. These credits are spendable on agents only, never swappable or withdrawable, and they expire, so they cannot be cycled back into tokens. There is no general free trial.
• Stable job prices: prices are set in credits, and credits hold a steady value, so a $WOVI price swing does not change what a job costs.
• Swap: start with credits to $WOVI only, with per-account limits and a delay, to limit sudden selling.
Funding holder credits from Pons fees
Pons splits a 1% trading fee, and per CoinMarketCap the token creator receives 70% of it. If $WOVI is launched there, that creator share can flow into a treasury that funds credit allocations to $WOVI holders. Fee income moves with trading volume, so:
• Set the daily allocation budget from average income, not from peak days.
• Keep a reserve, and let allocations shrink first if income drops. Paid jobs and creator earnings must never depend on it.
• Never present the allocation or the token as an investment, or the credits as a return for holding.
Holder allocation (to design)
• Eligibility: a wallet holding at least a minimum amount of $WOVI, checked by snapshot.
• Amount: tiered by holding size and holding time, with a cap per wallet.
• Cadence and expiry: allocated on a regular schedule, and unused credits expire.
• Fake wallets: splitting one holding across many wallets must not multiply credits. Link allocations to one verified account per person where possible.
• Non-holders: the target business owners may not hold $WOVI, and for now they get no free credits. They pay by card from their first job. Revisit a small starter pack later, since it affects how easily new users outside crypto can try an agent.
• Legal flag: giving credits to token holders can be treated as a benefit of holding the token. Include it in the legal review.
Pricing: a fixed rate per job
Each job has one fixed price, quoted before it starts. The platform computes the price from these inputs:
Input
Effect on price
Cost floor
Model, tool and storage cost for the job, plus the platform share. The price never goes below it.
Agent score
Verified acceptance, edit rate and spec compliance. Higher score, higher price.
Reviews
Average and count from verified paid jobs. Counts only after a minimum number of reviews.
Reliability
Success rate, uptime and refund rate. Low reliability lowers the price.
Speed
Turnaround compared with the agent's own average.
Demand
Busy agents rise slowly, within a cap.
Job size
Length, number of variants, media type. Video stages priced separately.
Creator limits
The creator sets a minimum and maximum, and the automatic price stays inside them.
Pricing rules
• The quote is fixed before the job starts and never changes mid-job.
• Prices update between jobs, with a cap on weekly change (size to decide), so users are not surprised.
• New agents get an introductory price band, so they can earn their first verified reviews.
• The user can see why an agent is priced as it is, for example high score and strong verified reviews.
14. Roadmap
Build the engine first, launch to business owners next, then bring in power users and creators, and open the marketplace last. A phase starts only when the gate before it is passed.
No dates are set: timing depends on team size and the launch scope decided in the open questions below, and should be estimated with the developer after reviewing this document.
Build everything, reveal in drops. All three phases are built and working before public launch, then revealed one drop at a time, so the product visibly keeps evolving and each reveal is a marketing moment. This means:
• Every agent and feature ships behind a switch, live in production but hidden until its drop.
• The gates above decide when a drop is ready, not when the public launch happens.
• A reveal calendar is planned with marketing, and each drop must be fully usable, never a teaser.
• Building everything first delays real user feedback, so run a private alpha with invited business owners and creators while the drops are queued.
First steps for the developer
[ ] Review this document and list questions, risks and missing details
[ ] Confirm the stack and the model providers to start with
[ ] Build the agent spec, registry and run engine (Phase 0)
[ ] Build the Agent Builder v0 and create Hook Writer as the first agent
[ ] Set up the eval harness with a gold set for the first agent
[ ] Interview 10 to 15 target business owners to validate the problems and the Brand Brain
15. Risks and open questions
Risks
Risk
Why it matters
Mitigation
Output still feels like slop
Breaks the core promise (C6)
Brand Brain anchoring, quality gates, publish only above a score, human approve
Thin wrappers on the same model
No edge; easy to copy
Edge comes from proprietary feedback and performance data, plus curated samples
Marketplace cold start
Few agents, few buyers
We seed all preset agents first; invite-only creators next; reviews unlock open listing
Fake reviews and score gaming
Destroys trust
Verified-run reviews only, fraud checks, audit log
Model cost swings
Margin per run can turn negative
Model routing, per-agent cost caps, price floors
Platform rule changes
Breaks publish and analytics
Official APIs only, human approval, adapter layer per platform
Creator IP and copyright
Samples and mood boards may contain others' work
Rights confirmation at upload, takedown process, restricted reuse across agents
Quality drift as agents learn
Auto-improvement can make agents worse
Creator approval, regression gate, canary release, rollback
Decisions needed from you
[ ] Product name (decided): WOVI, also the coin name. Relationship to faiv: separate brand, or a section of faiv?
[ ] Social platforms (decided): X, TikTok, YouTube Shorts and Instagram Reels. Product home: Robinhood Chain and Pons.
[ ] Launch markets and languages (affects payments, payouts and compliance)
[ ] Launch scope (decided): output follows the task, and video is staged as script, storyboard images, then video
[ ] Creator revenue share proposal (70/30). Payout method chosen: credits, swappable to $WOVI, with x402 for agent and crypto payments.
[ ] Which AI providers or models to start with, and whether to allow creators to bring their own keys
[ ] Whether the swarm protocol uses an existing standard (such as MCP) only, or a custom spec as well
[ ] Budget and team size for the dev: one developer or a small team?
[ ] Legal advice on $WOVI, swapping credits to $WOVI, and paying creators in credits or tokens (needed before any public launch)
[ ] Credit design: fixed value per credit or floating, swap direction (credits to $WOVI only, or both ways), and limits per account
[ ] Holder allocation: tiers, cap per wallet, expiry, and what happens if Pons fee income drops
[ ] Wallet-free onboarding for non-crypto users: which embedded or custodial wallet approach
[ ] Consumer-facing name (decided): Brand Brain, formerly called the Vision Kit
[ ] Non-holders (decided for now): no free credits. Revisit a small starter pack or low-cost first card top-up later
16. Brand identity and design system
WOVI looks like a flowing wordmark where the w is the mascot, and the product is night-first: dark mode is the default and light mode is the alternate. Build the interface from the tokens below rather than picking colours by eye.
Source artboards for the logo, mascot poses and palette: WOVI logo and mascot canvas.
Design tokens
Token
Night (default)
Light
Use
Background
#0B1230
#FFF4DC
App ground
Surface
#141D44
#FFFFFF
Cards, panels, sheets
Line
#2A3668
#E8D9B5
Borders, dividers
Text
#FFF4DC
#0B1230
Body and headings
Text muted
#A9B3D9
#3A4468
Captions, helper text
Blaze (primary)
#FF5A1F
#FF5A1F
Logo, primary buttons, key moments
Cobalt (accent)
#1F4DFF
#1F4DFF
Fills, secondary buttons, highlights
Cobalt Glow
#7C97FF
#1F4DFF
Cobalt used as text or links on night
Contrast rules (approximate ratios, checked by hand; run an automated check at build):
• Text on a Blaze button is Night #0B1230, about 5.6:1. Cream on Blaze is about 2.9:1 and must not be used for text.
• Cobalt as text on Night is about 2.9:1, so use Cobalt Glow, about 6.3:1.
• Cream on a Cobalt fill is about 5.4:1.
Logo
Version
Colours
Where
Primary
Blaze on Night
App header, splash, social banners
Light mode
Blaze on Cream
Light theme, documents
Colour variants
Night on Blaze, Cream on Cobalt
Campaign graphics, merch
Mascot only
The w alone
Below 80 px wide, avatars, app icon, favicon
The letters overlap slightly so the word reads as one flowing line: the w tucks into the o, the o touches the v, and the v touches a tall capital I. Never respace, outline, stretch or recolour the wordmark, and keep the height of the o free on every side.
Mascot: the w is Wovi
Wovi is a rounded w with a closed-eye smile and cheeks, with thin arms and legs that appear in poses. Each pose maps to a product state, so the developer can reuse it.
Pose
Product state
Walking
A job is running or loading
Waving hello
Onboarding, welcome, empty states
Sleeping
An agent is waiting for a job, idle
Celebrating
A job is done, a credit reward lands
Type and style
• Typeface: Outfit (Regular, Medium, SemiBold, Bold) for headlines and interface. Load it from Google Fonts or self-host it.
• Shapes are round and bold: large corner radii, thick strokes, no thin hairline icons.
• Limbs and outlines on night use Cream; on light surfaces use Night.
• Motion: Wovi may bob or wave, but never blocks a job. Respect reduced-motion settings.
Brand asset hand-off
[ ] Export final SVGs: wordmark (4 versions), mascot (4 poses), icon, favicon
[ ] Ship the tokens as a theme file for both night and light
[ ] Search and clear the WOVI name and logo as a trademark before launch
[ ] Decide whether the mascot appears in agent avatars or only in system states