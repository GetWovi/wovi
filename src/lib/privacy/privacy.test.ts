/**
 * Phase 18: privacy (export, deletion, consent, retention), notice and
 * action, and the right of withdrawal. Memory stores and the fake provider.
 */
import { describe, expect, it } from "vitest";
import type { Accounts } from "@/lib/accounts/accounts";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import { as, testApp } from "@/lib/app/test-helpers";
import { memoryCreditStore } from "@/lib/credits/store";
import { LAUNCH_SAMPLES } from "@/lib/launch/samples";
import { PURCHASE_CONSENT } from "@/lib/legal/operator";
import { Withdrawals } from "@/lib/legal/withdrawals";
import { QualityService } from "@/lib/quality/service";
import { memoryRunStore } from "@/lib/runs/store";
import { Reports } from "@/lib/safety/reports";
import { memorySafetyStore } from "@/lib/safety/store";
import { memoryTokenStore } from "@/lib/token/store";
import { memoryWebhookStore } from "@/lib/webhooks/store";
import { DELETED_NAME, Privacy, RETENTION, anonymousId } from "./privacy";

const DAY = 86_400_000;
const hookInputs = (idea: string) => ({ ...LAUNCH_SAMPLES["hook-writer"].find((x) => x.label === "gold")!.inputs, idea });

async function setup(fund = true) {
  const creditStore = memoryCreditStore();
  const runStore = memoryRunStore();
  const t = await testApp({ credits: { store: creditStore }, engine: { store: runStore } });
  const token = memoryTokenStore();
  const webhooks = memoryWebhookStore();
  const safety = memorySafetyStore();
  const privacy = new Privacy({
    accounts: t.accounts,
    runs: runStore,
    brand: t.brandStore,
    app: t.store,
    team: t.teamStore,
    credits: creditStore,
    balance: (ws) => t.credits!.balance(ws),
    pipelines: t.pipelineStore,
    token,
    webhooks,
    safety,
    email: t.email,
    now: () => new Date(t.clock.t),
  });
  if (fund) await t.guardedCredits!.topUp(as(t.ada.id), t.team.id, 1000, "setup");
  return { ...t, creditStore, runStore, token, webhooks, safety, privacy };
}

/** A builder who owns the platform workspace: one of WOVI's owners. */
async function platformOwner(accounts: Accounts) {
  await accounts.ensurePlatform();
  const u = await accounts.createPasskeyOnlyUserWithId("usr_owner00000000000", "Owner", true);
  await accounts.syncPlatform(u);
  return u;
}

describe("consent to use edits", () => {
  it("is off until the person turns it on, and off is as easy as on", async () => {
    const s = await setup();
    expect(await s.privacy.consent(s.ada.id)).toBeNull();
    expect(await s.privacy.improves(s.ada.id)).toBe(false);
    await s.privacy.setConsent(s.ada.id, true);
    expect(await s.privacy.improves(s.ada.id)).toBe(true);
    const off = await s.privacy.setConsent(s.ada.id, false);
    expect(off.improveAgents).toBe(false);
    expect(off.history.map((h) => h.on)).toEqual([true, false]);
    expect(off.version).toBeTruthy();
  });

  it("decides what builders see in the roll-up: counts always, words and drafts only with consent", async () => {
    const s = await setup();
    const run = await s.api.startRun(as(s.ada.id), s.team.id, { agentId: "hook-writer", inputs: hookInputs("Gerald the sourdough starter turns nine on Saturday and gets his own cake") });
    await s.engine.waitForRun(s.team.id, run.id);
    await s.teamReview.decide(as(s.ada.id), s.team.id, run.id, "request_changes", "Make it shorter and name Gerald first");
    let consent = false;
    const quality = new QualityService({ runs: s.engine, reviews: s.store.reviews, items: s.teamStore.items, activity: s.teamStore.activity, ratings: { find: async () => [] }, requireBuilder: async () => undefined, mayLearnFrom: async () => consent });
    const off = (await quality.rollup(as(s.ada.id), PLATFORM_WORKSPACE_ID, "hook-writer"))[0];
    expect(off.decisions.changes).toBe(1);
    expect(off.changeRequests).toEqual([]);
    expect(off.examples).toEqual([]);
    consent = true;
    const on = (await quality.rollup(as(s.ada.id), PLATFORM_WORKSPACE_ID, "hook-writer"))[0];
    expect(on.changeRequests[0].note).toContain("Make it shorter");
  });
});

describe("download my data", () => {
  it("holds the account, sign-ins, consents and each workspace: content where they own it, their part elsewhere", async () => {
    const s = await setup();
    const ed = await s.join("ed@example.com", "editor");
    const run = await s.api.startRun(as(ed.id), s.team.id, { agentId: "hook-writer", inputs: hookInputs("Gerald the sourdough starter turns nine on Saturday and gets his own cake") });
    await s.engine.waitForRun(s.team.id, run.id);
    await s.teamReview.comment(as(ed.id), s.team.id, run.id, { body: "The third one is my pick." });
    await s.privacy.setConsent(ed.id, true);
    const data = (await s.privacy.export(ed.id)) as Record<string, unknown> & { account: { email: string }; workspaces: { id: string; role: string; content?: unknown; yours?: { comments: unknown[]; runsYouStarted: { aiGenerated: boolean }[] } }[] };
    expect(data.account.email).toBe("ed@example.com");
    expect((data.consents as { improveAgents: { improveAgents: boolean } }).improveAgents.improveAgents).toBe(true);
    expect((data.sessions as unknown[]).length).toBeGreaterThan(0);
    const team = data.workspaces.find((w) => w.id === s.team.id)!;
    expect(team.role).toBe("editor");
    expect(team.content).toBeUndefined();
    expect(team.yours!.comments).toHaveLength(1);
    expect(team.yours!.runsYouStarted[0].aiGenerated).toBe(true);
    const personal = data.workspaces.find((w) => w.role === "owner")!;
    expect(personal.content).toBeDefined();
    expect(JSON.stringify(data)).not.toContain("tokenHash");
  });
});

describe("delete my account", () => {
  it("deletes what only they had, leaves shared work with the team as Deleted member, and keeps the books without a name", async () => {
    const s = await setup();
    const ed = await s.join("ed@example.com", "editor");
    const personal = ed.personalWorkspaceId;
    // Ed's own workspace: a top-up, a run, a Brand Brain.
    await s.guardedCredits!.topUp(as(ed.id), personal, 500, "ed-1");
    const own = await s.api.startRun(as(ed.id), personal, { agentId: "hook-writer", inputs: hookInputs("Gerald the sourdough starter turns nine on Saturday and gets his own cake"), quotedCredits: 50 });
    await s.engine.waitForRun(personal, own.id);
    // The team: a run Ed made, his comment, his yes, and a key he made.
    await s.guardedCredits!.topUp(as(s.ada.id), s.team.id, 500, "ada-1");
    const shared = await s.api.startRun(as(ed.id), s.team.id, { agentId: "hook-writer", inputs: hookInputs("Gerald the sourdough starter turns nine on Saturday and gets his own cake"), quotedCredits: 50 });
    await s.engine.waitForRun(s.team.id, shared.id);
    await s.teamReview.comment(as(ed.id), s.team.id, shared.id, { body: "Mine." });
    await s.teamReview.decide(as(ed.id), s.team.id, shared.id, "approve", "Good");
    await s.accounts.store.members.update({ ...(await s.accounts.store.members.get(`${s.team.id}:${ed.id}`))!, role: "admin" });
    await s.accounts.apiKeys.create(as(ed.id), s.team.id, { name: "ed's bot", role: "editor" });

    const plan = await s.privacy.deletionPlan(ed.id);
    expect(plan.blocked).toBe(false);
    expect(plan.workspaces.find((w) => w.id === personal)).toMatchObject({ action: "delete" });
    expect(plan.workspaces.find((w) => w.id === s.team.id)).toMatchObject({ action: "leave" });
    const paid = plan.workspaces.find((w) => w.id === personal)!.paidCredits!;
    expect(paid).toBeGreaterThan(0);

    await expect(s.privacy.deleteAccount(ed.id, "someone@else.com")).rejects.toMatchObject({ code: "invalid_input" });
    const done = await s.privacy.deleteAccount(ed.id, "ED@example.com");
    expect(done).toMatchObject({ workspacesDeleted: 1, workspacesLeft: 1, owedCredits: paid });

    const anon = anonymousId(ed.id);
    expect(await s.accounts.store.users.get(ed.id)).toBeNull();
    expect(await s.accounts.store.sessions.find({ userId: ed.id })).toEqual([]);
    expect(await s.accounts.store.workspaces.get(personal)).toBeNull();
    expect(await s.runStore.list(personal)).toEqual([]);
    expect(await s.accounts.store.members.get(`${s.team.id}:${ed.id}`)).toBeNull();
    expect((await s.accounts.store.apiKeys.find({ workspaceId: s.team.id }))[0].revokedAt).toBeTruthy();
    const comment = (await s.teamStore.comments.find({ workspaceId: s.team.id }))[0];
    expect(comment).toMatchObject({ authorId: anon, authorName: DELETED_NAME, body: "Mine." });
    const item = (await s.teamStore.items.get(shared.id))!;
    expect(item.makerId).toBeNull();
    expect(JSON.stringify(item)).not.toContain(ed.id);
    // The team's run and the books stay; the person's id is gone from them.
    expect(await s.runStore.get(s.team.id, shared.id)).not.toBeNull();
    const ledger = await s.creditStore.ledger.find();
    expect(ledger.some((e) => e.workspaceId === personal)).toBe(true);
    expect(JSON.stringify(ledger)).not.toContain(ed.id);
    expect(JSON.stringify(await s.creditStore.topUps.find())).not.toContain(ed.id);
    // Money owed back, and a receipt by email.
    const owed = await s.safety.owed.find({ kind: "account_deleted" });
    expect(owed).toHaveLength(1);
    expect(owed[0]).toMatchObject({ credits: paid, contact: "ed@example.com", status: "owed", test: true });
    expect(s.email.sent.at(-1)).toMatchObject({ to: "ed@example.com", subject: "Your WOVI account is deleted" });
    expect(await s.safety.deletions.get(anon)).toMatchObject({ workspacesDeleted: 1 });
    // The team carries on.
    expect((await s.api.runs(as(s.ada.id), s.team.id)).length).toBe(1);
  });

  it("asks the last owner of a shared workspace to hand it over first", async () => {
    const s = await setup();
    await s.join("ed@example.com", "editor");
    const plan = await s.privacy.deletionPlan(s.ada.id);
    expect(plan.blocked).toBe(true);
    expect(plan.workspaces.find((w) => w.id === s.team.id)!.why).toContain("Make one of them an owner first");
    await expect(s.privacy.deleteAccount(s.ada.id, "ada@example.com")).rejects.toMatchObject({ code: "blocked" });
    expect(await s.accounts.store.users.get(s.ada.id)).not.toBeNull();
  });
});

describe("retention", () => {
  it("deletes only logs past their time and never the books", async () => {
    const s = await setup();
    await s.guardedCredits!.topUp(as(s.ada.id), s.team.id, 500, "k");
    const old = new Date(s.clock.t - (RETENTION.webhookDeliveries + 1) * DAY).toISOString();
    const fresh = new Date(s.clock.t - DAY).toISOString();
    for (const [id, at] of [["d_old", old], ["d_new", fresh]] as const) {
      await s.webhooks.deliveries.insert({ id, workspaceId: s.team.id, endpointId: "wh_1", eventId: id, type: "run.finished", body: "{}", status: "delivered", attempts: [], nextAttemptAt: null, createdAt: at, updatedAt: at } as never);
    }
    const readLongAgo = new Date(s.clock.t - (RETENTION.readNotifications + 1) * DAY).toISOString();
    await s.teamStore.notifications.insert({ id: "n_old", workspaceId: s.team.id, userId: s.ada.id, kind: "comment", itemId: "x", actorName: "A", title: "t", text: "x", createdAt: readLongAgo, readAt: readLongAgo });
    await s.teamStore.notifications.insert({ id: "n_unread", workspaceId: s.team.id, userId: s.ada.id, kind: "comment", itemId: "x", actorName: "A", title: "t", text: "x", createdAt: readLongAgo, readAt: null });
    const decidedLongAgo = new Date(s.clock.t - (RETENTION.reportContacts + 1) * DAY).toISOString();
    await s.safety.reports.insert({ id: "rep_1", ref: "R-1", target: { kind: "other", id: null, workspaceId: null, given: "x" }, reason: "other", details: "something wrong here", reporterName: "Sam", reporterEmail: "sam@example.com", reporterUserId: null, goodFaith: true, status: "decided", decision: { outcome: "no_action", ground: "No breach found", note: "", by: "usr_x", at: decidedLongAgo, automated: false }, notified: { receiptAt: null, decisionAt: null, affectedAt: null }, createdAt: decidedLongAgo, updatedAt: decidedLongAgo });
    const ledgerBefore = await s.creditStore.ledger.find();

    const swept = await s.privacy.sweep();
    expect(swept).toMatchObject({ webhookDeliveries: 1, readNotifications: 1, reportContacts: 1 });
    expect((await s.webhooks.deliveries.find()).map((d) => d.id)).toEqual(["d_new"]);
    expect((await s.teamStore.notifications.find()).map((n) => n.id)).toEqual(["n_unread"]);
    expect(await s.safety.reports.get("rep_1")).toMatchObject({ reporterEmail: null, reporterName: null, details: "something wrong here" });
    expect(await s.creditStore.ledger.find()).toEqual(ledgerBefore);
  });
});

describe("notice and action", () => {
  async function reportsSetup() {
    const s = await setup();
    const owner = await platformOwner(s.accounts);
    const reports = new Reports({ store: s.safety, accounts: s.accounts, email: s.email, runs: { findRun: (id) => s.engine.findRun(id), withhold: (ws, id, info) => s.engine.withhold(ws, id, info) }, comments: s.teamStore.comments, now: () => new Date(s.clock.t) });
    const run = await s.api.startRun(as(s.ada.id), s.team.id, { agentId: "hook-writer", inputs: hookInputs("Gerald the sourdough starter turns nine on Saturday and gets his own cake") });
    await s.engine.waitForRun(s.team.id, run.id);
    return { ...s, owner, reports, runId: run.id };
  }

  it("takes a report from anyone, checks it, finds the content and sends a receipt", async () => {
    const s = await reportsSetup();
    await expect(s.reports.submit({ given: "", reason: "nope", details: "short", goodFaith: false })).rejects.toMatchObject({ code: "invalid_input" });
    const row = await s.reports.submit({ given: `http://localhost:3900/app/review/${s.runId}`, reason: "copyright", details: "This caption copies my blog post word for word.", email: "Sam@Example.com", goodFaith: true });
    expect(row.ref).toMatch(/^R-[0-9A-F]{6}$/);
    expect(row.target).toMatchObject({ kind: "run", id: s.runId, workspaceId: s.team.id });
    expect(row.reporterEmail).toBe("sam@example.com");
    expect(s.email.sent.at(-1)).toMatchObject({ to: "sam@example.com" });
    expect(s.email.sent.at(-1)!.text).toContain(row.ref);
    const anon = await s.reports.submit({ given: "something on a page", reason: "other", details: "It was rude to me in a review thread.", goodFaith: true });
    expect(anon.target.kind).toBe("other");
  });

  it("shows the queue only to WOVI's owners, and a decision takes the output down and tells everyone", async () => {
    const s = await reportsSetup();
    const row = await s.reports.submit({ given: s.runId, reason: "impersonation", details: "This speaks as me, a real person, without asking.", email: "sam@example.com", goodFaith: true });
    await expect(s.reports.list(as(s.ada.id))).rejects.toMatchObject({ code: "not_found" });
    expect((await s.reports.list(as(s.owner.id))).map((r) => r.id)).toEqual([row.id]);
    await s.reports.markReviewing(as(s.owner.id), row.id);
    await expect(s.reports.decide(as(s.owner.id), row.id, { outcome: "removed", ground: "", note: "" })).rejects.toMatchObject({ code: "invalid_input" });
    const decided = await s.reports.decide(as(s.owner.id), row.id, { outcome: "removed", ground: "Terms 6: content rules (fake reviews, impersonation, deepfakes, false claims)", note: "It named a real person." });
    expect(decided.status).toBe("decided");
    expect(decided.decision).toMatchObject({ outcome: "removed", automated: false });
    const view = (await s.api.run(as(s.ada.id), s.team.id, s.runId))!;
    expect(view.run.output).toBeNull();
    expect(view.run.withheld).toMatchObject({ reason: expect.stringContaining("Terms 6") });
    const mails = s.email.sent.slice(-2);
    expect(mails[0]).toMatchObject({ to: "sam@example.com" });
    expect(mails[0].text).toContain("A person decided this");
    expect(mails[1]).toMatchObject({ to: "ada@example.com" });
    expect(mails[1].text).toContain("If you think this is wrong");
  });

  it("deletes a reported comment", async () => {
    const s = await reportsSetup();
    const c = await s.teamReview.comment(as(s.ada.id), s.team.id, s.runId, { body: "Something nasty" });
    const row = await s.reports.submit({ given: c.id, reason: "hate_harassment", details: "This comment attacks me for who I am.", goodFaith: true });
    expect(row.target).toMatchObject({ kind: "comment", id: c.id });
    await s.reports.decide(as(s.owner.id), row.id, { outcome: "removed", ground: "Terms 6: content rules (hate, harassment, sexual content, unsafe advice)", note: "" });
    expect(await s.teamStore.comments.get(c.id)).toBeNull();
  });
});

describe("the right of withdrawal", () => {
  it("keeps the buyer's consent, gives back the unused credits within 14 days, once, and writes down the money owed", async () => {
    const s = await setup(false);
    const top = await s.guardedCredits!.topUp(as(s.ada.id), s.team.id, 500, "buy-1", { at: new Date(s.clock.t).toISOString(), wording: PURCHASE_CONSENT });
    expect(top.consent).toMatchObject({ wording: PURCHASE_CONSENT });
    // Spend some.
    const run = await s.api.startRun(as(s.ada.id), s.team.id, { agentId: "hook-writer", inputs: hookInputs("Gerald the sourdough starter turns nine on Saturday and gets his own cake"), quotedCredits: 50 });
    await s.engine.waitForRun(s.team.id, run.id);
    const left = (await s.credits!.balance(s.team.id)).paid;
    expect(left).toBeLessThan(500);

    let now = s.clock.t + 3 * DAY;
    const w = new Withdrawals({ credits: s.credits!, accounts: s.accounts, safety: s.safety, email: s.email, now: () => new Date(now) });
    expect((await w.list(as(s.ada.id), s.team.id)).map((x) => x.topUp.id)).toEqual([top.id]);
    const editor = await s.join("ed@example.com", "editor");
    await expect(w.withdraw(as(editor.id), s.team.id, top.id)).rejects.toMatchObject({ code: "forbidden" });
    const owed = await w.withdraw(as(s.ada.id), s.team.id, top.id);
    expect(owed).toMatchObject({ kind: "withdrawal", credits: left, amountCents: left, test: true, status: "owed", contact: "ada@example.com" });
    expect((await s.credits!.balance(s.team.id)).paid).toBe(0);
    expect(s.email.sent.at(-1)).toMatchObject({ to: "ada@example.com", subject: "You withdrew from a WOVI purchase" });
    await expect(w.withdraw(as(s.ada.id), s.team.id, top.id)).rejects.toMatchObject({ code: "invalid_request" });

    // After 14 days, or with every credit used, it is no longer possible.
    const late = await s.guardedCredits!.topUp(as(s.ada.id), s.team.id, 500, "buy-2");
    now = s.clock.t + 20 * DAY;
    await expect(w.withdraw(as(s.ada.id), s.team.id, late.id)).rejects.toMatchObject({ message: expect.stringContaining("are over") });
  });
});
