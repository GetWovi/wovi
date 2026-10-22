import { describe, expect, it } from "vitest";
import { rejectsCode } from "@/lib/accounts/test-helpers";
import { as, testApp } from "@/lib/app/test-helpers";
import { LAUNCH_SAMPLES } from "@/lib/launch/samples";
import { applyDecision, itemState, memberHandles, parseMentions, sourceOfPipeline, sourceOfRun } from "./rules";
import type { ItemRow } from "./types";

const gold = (id: string) => LAUNCH_SAMPLES[id].find((s) => s.label === "gold")!;
const DAY = 86_400_000;

/**
 * An agency: ada owns the workspace, with an admin, two editors and a viewer;
 * three example Brand Brains, two clients (Crumb and Co for Northside Bakery,
 * Night Owl Coffee for Night Owl), and Desk Stretch kept in house.
 */
async function agency(opts: Parameters<typeof testApp>[0] = {}) {
  const t = await testApp(opts);
  await t.seedTeamBrains();
  const brains = await t.brands.list(as(t.ada.id), t.team.id);
  const brain = (name: string) => brains.find((b) => b.name === name)!;
  const [al, ed, edna, vi] = [await t.join("al@example.com", "admin"), await t.join("ed@example.com", "editor"), await t.join("edna@example.com", "editor"), await t.join("vi@example.com", "viewer")];
  const team = t.teamReview;
  const northside = await team.createClient(as(t.ada.id), t.team.id, { name: "Northside Bakery", brandBrainIds: [brain("Crumb and Co").id] });
  const owl = await team.createClient(as(t.ada.id), t.team.id, { name: "Night Owl", brandBrainIds: [brain("Night Owl Coffee").id] });
  const run = async (who: string, brainName: string, agentId = "hook-writer") => {
    const r = await t.api.startRun(as(who), t.team.id, { agentId, inputs: gold(agentId).inputs, brandBrainId: brain(brainName).id });
    await t.engine.waitForRun(t.team.id, r.id);
    return r.id;
  };
  return { ...t, team, brain, al, ed, edna, vi, northside, owl, run, ws: t.team.id };
}

describe("review rules", () => {
  it("works out an item's state from its run and its row", () => {
    const auto = { autoSubmit: true };
    const manual = { autoSubmit: false };
    expect(sourceOfRun("queued")).toBe("running");
    expect(sourceOfRun("succeeded")).toBe("finished");
    expect(sourceOfRun("cancelled")).toBe("stopped");
    expect(sourceOfPipeline("waiting")).toBe("running");
    expect(sourceOfPipeline("ready")).toBe("finished");
    expect(itemState("running", null, null, auto)).toBe("draft");
    expect(itemState("finished", null, null, auto)).toBe("needs_review");
    expect(itemState("finished", null, null, manual)).toBe("draft");
    expect(itemState("finished", { status: "draft", submitOnFinish: true }, null, manual)).toBe("needs_review");
    expect(itemState("finished", { status: "needs_review", submitOnFinish: false }, null, manual)).toBe("needs_review");
    expect(itemState("running", { status: "needs_review", submitOnFinish: true }, null, auto)).toBe("draft");
    expect(itemState("finished", { status: "changes_requested", submitOnFinish: false }, "approved", auto)).toBe("changes_requested");
    // A phase 9 or 10 decision counts until the item has its own.
    expect(itemState("finished", null, "rejected", auto)).toBe("rejected");
  });

  it("counts yeses, closes the round on a no, and refuses the same yes twice", () => {
    const row: ItemRow = { id: "run_abcdef", workspaceId: "ws_a", kind: "run", status: "needs_review", makerId: null, submitOnFinish: false, sentBy: null, sentAt: null, assigneeId: null, approvals: [], round: 1, last: null, reRunOf: null, reRuns: [], createdAt: "", updatedAt: "" };
    const ada = { by: "usr_ada", name: "Ada", via: "member" as const };
    const bo = { by: "usr_bo", name: "Bo", via: "member" as const };
    const one = applyDecision(row, "needs_review", "approve", ada, "", 2, "t1");
    expect([one.kind, one.final, one.row.status, one.row.approvals.length]).toEqual(["approval_added", false, "needs_review", 1]);
    expect(() => applyDecision(one.row, "needs_review", "approve", ada, "", 2, "t2")).toThrow(/someone else/);
    const two = applyDecision(one.row, "needs_review", "approve", bo, "", 2, "t2");
    expect([two.kind, two.final, two.row.status, two.row.last?.by]).toEqual(["approved", true, "approved", "usr_bo"]);
    const no = applyDecision(one.row, "needs_review", "request_changes", bo, "Shorter", 2, "t3");
    expect([no.kind, no.row.status, no.row.approvals]).toEqual(["changes_requested", "changes_requested", []]);
    // Deciding on a closed round starts a new one.
    const again = applyDecision(two.row, "approved", "approve", ada, "", 2, "t4");
    expect([again.row.status, again.row.round, again.row.approvals.map((a) => a.by)]).toEqual(["needs_review", 2, ["usr_ada"]]);
  });

  it("gives every member one handle and finds @mentions in a comment", () => {
    const hs = memberHandles([
      { userId: "usr_1", name: "Ada Lovelace", email: "ada@example.com" },
      { userId: "usr_2", name: null, email: "ed@example.com" },
      { userId: "usr_3", name: "Ada King", email: "king@example.com" },
    ]);
    expect(hs.map((h) => h.handle)).toEqual(["ada", "ed", "ada2"]);
    expect(parseMentions("@ed can you look? cc @Ada2, and @ada. Not mail@ed or @nobody.", hs)).toEqual(["usr_2", "usr_3", "usr_1"]);
  });
});

describe("the review flow", () => {
  it("goes draft, needs review, approved; drafts wait for the maker when the workspace asks", async () => {
    const t = await agency({ fake: { latencyMs: 150 } });
    await t.team.saveSettings(as(t.ada.id), t.ws, { autoSubmit: false });
    const r = await t.api.startRun(as(t.ed.id), t.ws, { agentId: "hook-writer", inputs: gold("hook-writer").inputs, brandBrainId: t.brain("Crumb and Co").id });
    let [item] = await t.team.queue(as(t.ed.id), t.ws);
    expect([item.id, item.state, item.source, item.maker?.name]).toEqual([r.id, "draft", "running", "ed@example.com"]);
    await rejectsCode(t.team.send(as(t.ed.id), t.ws, r.id), "not_ready");
    await t.engine.waitForRun(t.ws, r.id);
    expect((await t.team.queue(as(t.ed.id), t.ws))[0].state).toBe("draft");
    item = await t.team.send(as(t.ed.id), t.ws, r.id);
    expect(item.state).toBe("needs_review");
    expect(item.client?.name).toBe("Northside Bakery");
    const { item: done } = await t.team.decide(as(t.ada.id), t.ws, r.id, "approve", "Post it Friday.");
    expect([done.state, done.last?.name, done.last?.note]).toEqual(["approved", "ada@example.com", "Post it Friday."]);
    await rejectsCode(t.team.send(as(t.ed.id), t.ws, r.id), "conflict");
    // The phase 9 decision follows, so History and the run page agree.
    expect((await t.api.run(as(t.ada.id), t.ws, r.id))!.state).toBe("approved");
    // Taking it back opens a new round.
    const back = await t.team.reopen(as(t.ada.id), t.ws, r.id);
    expect(back.state).toBe("needs_review");
    expect((await t.api.run(as(t.ada.id), t.ws, r.id))!.review).toBeNull();
  });

  it("records every step in the item's activity log, with who and when", async () => {
    const t = await agency();
    const id = await t.run(t.ed.id, "Crumb and Co");
    await t.team.assign(as(t.al.id), t.ws, id, t.edna.id);
    await t.team.comment(as(t.edna.id), t.ws, id, { body: "Hook 3 is the one." });
    await t.team.decide(as(t.al.id), t.ws, id, "reject", "Off brief.");
    await t.team.reopen(as(t.ada.id), t.ws, id);
    await t.team.decide(as(t.ada.id), t.ws, id, "approve");
    const d = (await t.team.item(as(t.vi.id), t.ws, id))!;
    expect(d.activity.map((a) => [a.kind, a.byName])).toEqual([
      ["made", "ed@example.com"],
      ["assigned", "al@example.com"],
      ["commented", "edna@example.com"],
      ["rejected", "al@example.com"],
      ["reopened", "ada@example.com"],
      ["approved", "ada@example.com"],
    ]);
    expect(d.activity[1].note).toBe("edna@example.com");
    expect(d.activity[3].note).toBe("Off brief.");
    expect(d.activity.every((a, i) => i === 0 || a.at >= d.activity[i - 1].at)).toBe(true);
  });

  it("asks for changes with a note and starts a linked re-run carrying that note", async () => {
    const t = await agency();
    const id = await t.run(t.ed.id, "Crumb and Co");
    await t.team.assign(as(t.ada.id), t.ws, id, t.edna.id);
    await rejectsCode(t.team.decide(as(t.al.id), t.ws, id, "request_changes", ""), "invalid_request");
    const { item, reRun } = await t.team.decide(as(t.al.id), t.ws, id, "request_changes", "Shorter, and name the oven.");
    expect(item.state).toBe("changes_requested");
    expect(reRun).toMatch(/^run_/);
    expect(item.reRuns).toEqual([reRun]);
    const next = await t.engine.waitForRun(t.ws, reRun!);
    expect(String(next.inputs.idea)).toContain("Note for this run: Changes asked for: Shorter, and name the oven.");
    expect(next.brandBrain?.id).toBe(t.brain("Crumb and Co").id);
    // The new draft goes to review on its own, for the same people, linked back.
    const fresh = (await t.team.item(as(t.ada.id), t.ws, reRun!))!;
    expect([fresh.item.state, fresh.item.reRunOf, fresh.item.assignee?.id, fresh.item.maker?.id]).toEqual(["needs_review", id, t.edna.id, t.ed.id]);
    expect(fresh.activity.map((a) => [a.kind, a.ref])).toEqual([["rerun_of", id]]);
    const old = (await t.team.item(as(t.ada.id), t.ws, id))!;
    expect(old.activity.find((a) => a.kind === "rerun_started")?.ref).toBe(reRun);
    // History shows the first draft as turned down, with the note.
    expect((await t.api.run(as(t.ada.id), t.ws, id))!.review?.note).toBe("Changes asked: Shorter, and name the oven.");
  });

  it("asks for changes on a pipeline run too: the note goes on the pipeline's main input", async () => {
    const t = await agency();
    const p = await t.api.startPipeline(as(t.ed.id), t.ws, { pipelineId: "repurpose-post", inputs: { post: "We burned 40 croissants so you would not have to. Here is what we learned.", posted_on: "x", to: "tiktok" }, confirmations: { rights: true } });
    await t.pipelineEngine.waitUntilSettled(t.ws, p.id);
    expect((await t.team.queue(as(t.ada.id), t.ws, { what: "pipeline:repurpose-post" })).map((i) => [i.id, i.state, i.kind])).toEqual([[p.id, "needs_review", "pipeline"]]);
    const { reRun } = await t.team.decide(as(t.ada.id), t.ws, p.id, "request_changes", "Make it about the butter.");
    expect((await t.api.pipelineRun(as(t.ada.id), t.ws, p.id))!.run.status).toBe("rejected");
    const next = await t.pipelineEngine.waitUntilSettled(t.ws, reRun!);
    expect(String(next.inputs.post)).toContain("Changes asked for: Make it about the butter.");
    expect(next.createdBy).toBe(t.ada.id);
  });
});

describe("approval rules", () => {
  it("lets any editor decide by default, never a viewer, and never an API key", async () => {
    const t = await agency();
    const id = await t.run(t.ed.id, "Desk Stretch");
    await rejectsCode(t.team.decide(as(t.vi.id), t.ws, id, "approve"), "forbidden");
    await rejectsCode(t.team.reopen(as(t.vi.id), t.ws, id), "forbidden");
    expect((await t.team.item(as(t.vi.id), t.ws, id))!.can).toMatchObject({ decide: false, comment: true, send: false, assign: false });
    const { key } = await t.accounts.apiKeys.create(as(t.ada.id), t.ws, { name: "bot", role: "admin" });
    const bot = (await t.accounts.apiKeys.authenticate(key))!;
    await rejectsCode(t.team.decide(bot, t.ws, id, "approve"), "forbidden");
    await t.team.comment(bot, t.ws, id, { body: "Posted a draft for you." });
    expect((await t.team.decide(as(t.edna.id), t.ws, id, "approve")).item.state).toBe("approved");
  });

  it("can keep decisions to admins and owners", async () => {
    const t = await agency();
    const id = await t.run(t.ed.id, "Desk Stretch");
    await rejectsCode(t.team.saveSettings(as(t.ed.id), t.ws, { approvers: "admins" }), "forbidden");
    await t.team.saveSettings(as(t.al.id), t.ws, { approvers: "admins" });
    const err = await rejectsCode(t.team.decide(as(t.edna.id), t.ws, id, "approve"), "forbidden");
    expect(err.message).toBe("Only admins and owners decide in this workspace.");
    await rejectsCode(t.api.review(as(t.edna.id), t.ws, id, "approved"), "forbidden");
    expect((await t.team.decide(as(t.al.id), t.ws, id, "approve")).item.state).toBe("approved");
  });

  it("needs two different people when the workspace asks for two approvals", async () => {
    const t = await agency();
    await t.team.saveSettings(as(t.ada.id), t.ws, { approvalsNeeded: 2 });
    const id = await t.run(t.ed.id, "Desk Stretch");
    const first = await t.team.decide(as(t.ed.id), t.ws, id, "approve", "Fine by me.");
    expect([first.item.state, first.item.approvals.map((a) => a.by), first.item.approvalsNeeded]).toEqual(["needs_review", [t.ed.id], 2]);
    await rejectsCode(t.team.decide(as(t.ed.id), t.ws, id, "approve"), "conflict");
    // The phase 9 approve answers null until the second yes.
    expect(await t.api.review(as(t.ed.id), t.ws, id, "approved").catch((e) => e.code)).toBe("conflict");
    expect((await t.api.run(as(t.ada.id), t.ws, id))!.review).toBeNull();
    const second = await t.team.decide(as(t.edna.id), t.ws, id, "approve");
    expect([second.item.state, second.item.approvals.length]).toEqual(["approved", 2]);
    expect((await t.api.run(as(t.ada.id), t.ws, id))!.state).toBe("approved");
    // A no from anyone closes the round at once.
    const other = await t.run(t.ed.id, "Desk Stretch");
    await t.team.decide(as(t.ed.id), t.ws, other, "approve");
    expect((await t.team.decide(as(t.al.id), t.ws, other, "reject", "Not this week.")).item).toMatchObject({ state: "rejected", approvals: [] });
  });
});

describe("comments, assignments and notifications", () => {
  it("threads comments, keeps answers one level deep and notifies the people mentioned", async () => {
    const t = await agency();
    const id = await t.run(t.ed.id, "Crumb and Co");
    const d0 = (await t.team.item(as(t.ada.id), t.ws, id))!;
    const handle = (u: string) => d0.members.find((m) => m.userId === u)!.handle;
    const root = await t.team.comment(as(t.ada.id), t.ws, id, { body: `@${handle(t.edna.id)} and @${handle(t.al.id)}: the third hook, or the first?` });
    expect(root.mentions).toEqual([t.edna.id, t.al.id]);
    const answer = await t.team.comment(as(t.edna.id), t.ws, id, { body: "The third.", parentId: root.id });
    const deeper = await t.team.comment(as(t.al.id), t.ws, id, { body: "Agreed.", parentId: answer.id });
    expect(deeper.parentId).toBe(root.id);
    await rejectsCode(t.team.comment(as(t.ada.id), t.ws, id, { body: "  " }), "invalid_request");
    const d = (await t.team.item(as(t.vi.id), t.ws, id))!;
    expect(d.threads.map((th) => [th.id, th.replies.map((r) => r.body)])).toEqual([[root.id, ["The third.", "Agreed."]]]);
    expect(d.item.comments).toBe(3);
    const edna = await t.team.notifications(as(t.edna.id), t.ws);
    expect(edna.map((n) => [n.kind, n.actorName])).toEqual([["mentioned", "ada@example.com"]]);
    // The maker hears about comments on their work; the author never hears about their own.
    expect((await t.team.notifications(as(t.ed.id), t.ws)).map((n) => n.kind)).toEqual(["comment", "comment", "comment"]);
    expect(await t.team.notifications(as(t.ada.id), t.ws)).toEqual([]);
    // Mentions also go out through the email sender (the memory one in tests).
    expect(t.email.sent.some((m) => m.to === "edna@example.com" && m.subject.startsWith("ada@example.com mentioned you on"))).toBe(true);
  });

  it("assigns to members only and tells the assignee", async () => {
    const t = await agency();
    const id = await t.run(t.ed.id, "Night Owl Coffee");
    await rejectsCode(t.team.assign(as(t.vi.id), t.ws, id, t.edna.id), "forbidden");
    await rejectsCode(t.team.assign(as(t.ada.id), t.ws, id, t.eve.id), "invalid_request");
    const item = await t.team.assign(as(t.ada.id), t.ws, id, t.edna.id);
    expect(item.assignee).toEqual({ id: t.edna.id, name: "edna@example.com" });
    expect((await t.team.queue(as(t.edna.id), t.ws, { assignee: "me" })).map((i) => i.id)).toEqual([id]);
    expect((await t.team.queue(as(t.edna.id), t.ws, { assignee: "none" })).map((i) => i.id)).not.toContain(id);
    const [n] = await t.team.notifications(as(t.edna.id), t.ws);
    expect([n.kind, n.itemId, n.readAt]).toEqual(["assigned", id, null]);
    // Assigning yourself makes no noise.
    await t.team.assign(as(t.ada.id), t.ws, id, t.ada.id);
    expect(await t.team.unreadCount(as(t.ada.id), t.ws)).toBe(0);
    expect((await t.team.assign(as(t.ada.id), t.ws, id, null)).assignee).toBeNull();
  });

  it("tells the maker and the assignee about changes asked and approvals, and marks notifications read", async () => {
    const t = await agency();
    const id = await t.run(t.ed.id, "Crumb and Co");
    await t.team.assign(as(t.ada.id), t.ws, id, t.edna.id);
    const { reRun } = await t.team.decide(as(t.al.id), t.ws, id, "request_changes", "Less flour talk.");
    await t.engine.waitForRun(t.ws, reRun!);
    await t.team.decide(as(t.al.id), t.ws, reRun!, "approve", "Better.");
    const ed = await t.team.notifications(as(t.ed.id), t.ws);
    expect(ed.map((n) => [n.kind, n.text])).toEqual([
      ["approved", "Better."],
      ["changes_requested", "Less flour talk."],
    ]);
    expect((await t.team.notifications(as(t.edna.id), t.ws)).map((n) => n.kind)).toEqual(["approved", "changes_requested", "assigned"]);
    expect(await t.team.markRead(as(t.ed.id), t.ws, [ed[0].id])).toBe(1);
    expect(await t.team.unreadCount(as(t.ed.id), t.ws)).toBe(1);
    expect(await t.team.markRead(as(t.ed.id), t.ws, "all")).toBe(1);
    expect(await t.team.unreadCount(as(t.ed.id), t.ws)).toBe(0);
    // Off by setting: in the app only, no emails.
    await t.team.saveSettings(as(t.ada.id), t.ws, { emailNotifications: false });
    const before = t.email.sent.length;
    await t.team.assign(as(t.ada.id), t.ws, id, t.ed.id);
    expect(t.email.sent.length).toBe(before);
    expect(await t.team.unreadCount(as(t.ed.id), t.ws)).toBe(1);
  });
});

describe("clients and share links", () => {
  it("ties each Brand Brain to one client and filters the queue by client, brand, agent and state", async () => {
    const t = await agency();
    const a = await t.run(t.ed.id, "Crumb and Co");
    const b = await t.run(t.ed.id, "Night Owl Coffee", "caption-writer");
    const c = await t.run(t.ed.id, "Desk Stretch");
    await rejectsCode(t.team.createClient(as(t.ada.id), t.ws, { name: "Copycat", brandBrainIds: [t.brain("Crumb and Co").id] }), "conflict");
    await rejectsCode(t.team.createClient(as(t.ed.id), t.ws, { name: "Nope" }), "forbidden");
    await rejectsCode(t.team.updateClient(as(t.ada.id), t.ws, t.owl.id, { defaultBrandBrainId: t.brain("Desk Stretch").id }), "invalid_request");
    const ids = async (f: Parameters<typeof t.team.queue>[2]) => (await t.team.queue(as(t.vi.id), t.ws, f)).map((i) => i.id);
    expect(await ids({ clientId: t.northside.id })).toEqual([a]);
    expect(await ids({ clientId: t.owl.id })).toEqual([b]);
    expect(await ids({ brandBrainId: t.brain("Desk Stretch").id })).toEqual([c]);
    expect(await ids({ what: "agent:caption-writer" })).toEqual([b]);
    await t.team.decide(as(t.ada.id), t.ws, a, "approve");
    expect(await ids({ state: "approved" })).toEqual([a]);
    expect(await ids({ state: "open" })).toEqual([c, b]);
    const clients = await t.team.clients(as(t.ada.id), t.ws);
    expect(clients.map((x) => [x.name, x.brands.map((y) => y.name), x.defaultBrand?.name, x.counts])).toEqual([
      ["Night Owl", ["Night Owl Coffee"], "Night Owl Coffee", { needsReview: 1, approved: 0, total: 1 }],
      ["Northside Bakery", ["Crumb and Co"], "Crumb and Co", { needsReview: 0, approved: 1, total: 1 }],
    ]);
    // Viewers see the clients but not their links.
    await t.team.createShareLink(as(t.ada.id), t.ws, t.owl.id, { label: "Sam at Night Owl" });
    expect((await t.team.clients(as(t.vi.id), t.ws)).every((x) => x.links.length === 0)).toBe(true);
  });

  it("lets a client see and decide only their own items, sent to review", async () => {
    const t = await agency();
    await t.team.saveSettings(as(t.ada.id), t.ws, { autoSubmit: false });
    const mine = await t.run(t.ed.id, "Crumb and Co");
    const draft = await t.run(t.ed.id, "Crumb and Co");
    const theirs = await t.run(t.ed.id, "Night Owl Coffee");
    const inHouse = await t.run(t.ed.id, "Desk Stretch");
    for (const id of [mine, theirs, inHouse]) await t.team.send(as(t.ed.id), t.ws, id);
    await t.team.comment(as(t.ada.id), t.ws, mine, { body: "Client is picky about the oven.", internal: true });
    await t.team.comment(as(t.ada.id), t.ws, mine, { body: "Here is the first round." });
    const { token, url } = await t.team.createShareLink(as(t.ada.id), t.ws, t.northside.id, { label: "Maya at Northside" });
    expect(url).toBe(`http://localhost:3900/client/${token}`);

    const session = (await t.team.openLink(token))!;
    expect([session.client.name, session.workspaceName, session.link.label]).toEqual(["Northside Bakery", "Team", "Maya at Northside"]);
    expect((await t.team.clientItems(token)).map((i) => i.id)).toEqual([mine]);
    // Not another client's, not the agency's own, not a draft.
    for (const id of [theirs, inHouse, draft, "run_doesnotexist0"]) await rejectsCode(t.team.clientItem(token, id), "not_found");
    await rejectsCode(t.team.clientDecide(token, theirs, "approve"), "not_found");
    await rejectsCode(t.team.clientComment(token, inHouse, { body: "hi" }), "not_found");

    const detail = await t.team.clientItem(token, mine);
    expect(detail.threads.map((c) => c.body)).toEqual(["Here is the first round."]);
    expect(detail.item.comments).toBe(1);
    expect(detail.output?.kind).toBe("list");
    expect(JSON.stringify(detail)).not.toContain("Client is picky");
    expect(JSON.stringify(detail)).not.toMatch(/checks|assignee|maker|Night Owl|Desk Stretch/);

    await t.team.clientComment(token, mine, { body: "Love number two." });
    const decided = await t.team.clientDecide(token, mine, "approve", "Go.");
    expect([decided.state, decided.last?.name]).toEqual(["approved", "Maya at Northside"]);
    const log = (await t.team.item(as(t.ada.id), t.ws, mine))!.activity.map((a) => [a.kind, a.byName]);
    expect(log.slice(-2)).toEqual([
      ["commented", "Maya at Northside"],
      ["approved", "Maya at Northside"],
    ]);
    // The client sees only the client side of the log.
    expect((await t.team.clientItem(token, mine)).activity.map((a) => a.kind)).toEqual(["sent", "approved"]);
  });

  it("counts a client's yes as one of two, and a look-only link cannot decide", async () => {
    const t = await agency();
    await t.team.saveSettings(as(t.ada.id), t.ws, { approvalsNeeded: 2 });
    const id = await t.run(t.ed.id, "Crumb and Co");
    const { token } = await t.team.createShareLink(as(t.ada.id), t.ws, t.northside.id, { label: "Maya" });
    const look = await t.team.createShareLink(as(t.ada.id), t.ws, t.northside.id, { label: "Viewer", canApprove: false });
    await rejectsCode(t.team.clientDecide(look.token, id, "approve"), "forbidden");
    expect((await t.team.clientDecide(token, id, "approve")).state).toBe("needs_review");
    await rejectsCode(t.team.clientDecide(token, id, "approve"), "conflict");
    expect((await t.team.decide(as(t.ed.id), t.ws, id, "approve")).item.state).toBe("approved");
    await rejectsCode(t.team.clientDecide(token, id, "reject" as never), "invalid_request");
  });

  it("lets a client ask for changes, which starts a re-run the client sees when it lands", async () => {
    const t = await agency();
    const id = await t.run(t.ed.id, "Crumb and Co");
    const { token } = await t.team.createShareLink(as(t.ada.id), t.ws, t.northside.id, { label: "Maya" });
    await t.team.clientDecide(token, id, "request_changes", "Mention the rye.");
    const item = (await t.team.item(as(t.ada.id), t.ws, id))!.item;
    await t.engine.waitForRun(t.ws, item.reRuns[0]);
    expect((await t.team.clientItems(token)).map((i) => [i.id, i.state])).toEqual([
      [item.reRuns[0], "needs_review"],
      [id, "changes_requested"],
    ]);
    expect((await t.team.notifications(as(t.ed.id), t.ws)).map((n) => [n.kind, n.actorName])).toEqual([["changes_requested", "Maya"]]);
  });

  it("expires and withdraws links, and removing a client closes its links", async () => {
    const t = await agency();
    const id = await t.run(t.ed.id, "Crumb and Co");
    await rejectsCode(t.team.createShareLink(as(t.ada.id), t.ws, t.northside.id, { label: "Maya", days: 3 }), "invalid_request");
    const week = await t.team.createShareLink(as(t.ada.id), t.ws, t.northside.id, { label: "Maya", days: 7 });
    const month = await t.team.createShareLink(as(t.ada.id), t.ws, t.northside.id, { label: "Maya", days: 30 });
    expect(await t.team.openLink(week.token)).not.toBeNull();
    t.advance(7 * DAY + 1000);
    expect(await t.team.openLink(week.token)).toBeNull();
    await rejectsCode(t.team.clientItems(week.token), "invalid_link");
    await rejectsCode(t.team.clientDecide(week.token, id, "approve"), "invalid_link");
    expect((await t.team.clientItems(month.token)).map((i) => i.id)).toEqual([id]);
    await rejectsCode(t.team.revokeShareLink(as(t.ed.id), t.ws, month.link.id), "forbidden");
    await t.team.revokeShareLink(as(t.al.id), t.ws, month.link.id);
    await rejectsCode(t.team.clientItem(month.token, id), "invalid_link");
    expect((await t.team.client(as(t.ada.id), t.ws, t.northside.id))!.links.map((l) => l.open)).toEqual([false, false]);
    // A made-up or mangled token opens nothing.
    expect(await t.team.openLink("wovi_client_" + "x".repeat(43))).toBeNull();
    expect(await t.team.openLink("nope")).toBeNull();
    const last = await t.team.createShareLink(as(t.ada.id), t.ws, t.northside.id, { label: "Maya" });
    await t.team.removeClient(as(t.ada.id), t.ws, t.northside.id);
    expect(await t.team.openLink(last.token)).toBeNull();
  });
});

describe("the phase 9 and 10 buttons", () => {
  it("go through the same rules: a viewer cannot approve a run, and a pipeline waits for its second yes", async () => {
    const t = await agency();
    const id = await t.run(t.ed.id, "Desk Stretch");
    await rejectsCode(t.api.review(as(t.vi.id), t.ws, id, "approved"), "forbidden");
    await rejectsCode(t.api.clearReview(as(t.vi.id), t.ws, id), "forbidden");
    expect((await t.api.review(as(t.ed.id), t.ws, id, "approved"))?.decision).toBe("approved");
    expect((await t.team.item(as(t.ada.id), t.ws, id))!.item.state).toBe("approved");

    await t.team.saveSettings(as(t.ada.id), t.ws, { approvalsNeeded: 2 });
    const p = await t.api.startPipeline(as(t.ed.id), t.ws, { pipelineId: "repurpose-post", inputs: { post: "We burned 40 croissants so you would not have to. Here is what we learned.", posted_on: "x", to: "tiktok" }, confirmations: { rights: true } });
    await t.pipelineEngine.waitUntilSettled(t.ws, p.id);
    await rejectsCode(t.api.decidePipeline(as(t.vi.id), t.ws, p.id, "approved"), "forbidden");
    expect((await t.api.decidePipeline(as(t.ed.id), t.ws, p.id, "approved")).status).toBe("ready");
    expect((await t.api.decidePipeline(as(t.al.id), t.ws, p.id, "approved")).status).toBe("approved");
    const log = (await t.team.item(as(t.ada.id), t.ws, p.id))!.activity.map((a) => a.kind);
    expect(log).toEqual(["made", "approval_added", "approved"]);
  });
});

describe("client comments", () => {
  it("never land inside a team-only thread, and the team hears about them", async () => {
    const t = await agency();
    const id = await t.run(t.ed.id, "Crumb and Co");
    await t.team.assign(as(t.ada.id), t.ws, id, t.edna.id);
    const secret = await t.team.comment(as(t.ada.id), t.ws, id, { body: "They hate puns.", internal: true });
    const { token } = await t.team.createShareLink(as(t.ada.id), t.ws, t.northside.id, { label: "Maya" });
    const c = await t.team.clientComment(token, id, { body: "Can we add the rye?", parentId: secret.id });
    expect([c.parentId, c.internal, c.authorName]).toEqual([null, false, "Maya"]);
    await rejectsCode(t.team.clientComment(token, id, { body: "   " }), "invalid_request");
    // A client cannot mention anyone: @handles stay plain text.
    expect((await t.team.clientComment(token, id, { body: "@ada hello" })).mentions).toEqual([]);
    expect((await t.team.notifications(as(t.edna.id), t.ws)).filter((n) => n.kind === "comment").map((n) => n.actorName)).toEqual(["Maya", "Maya", "ada@example.com"]);
    // A link cannot read a comment id from another item.
    const other = await t.run(t.ed.id, "Crumb and Co");
    await rejectsCode(t.team.clientComment(token, other, { body: "hi", parentId: c.id }), "not_found");
  });
});

describe("workspace isolation", () => {
  it("refuses everything across workspaces", async () => {
    const t = await agency();
    const id = await t.run(t.ed.id, "Crumb and Co");
    const eve = as(t.eve.id);
    await rejectsCode(t.team.queue(eve, t.ws), "not_found");
    await rejectsCode(t.team.item(eve, t.ws, id), "not_found");
    await rejectsCode(t.team.decide(eve, t.ws, id, "approve"), "not_found");
    await rejectsCode(t.team.comment(eve, t.ws, id, { body: "hi" }), "not_found");
    await rejectsCode(t.team.clients(eve, t.ws), "not_found");
    await rejectsCode(t.team.createShareLink(eve, t.ws, t.northside.id, { label: "x" }), "not_found");
    // Her own workspace cannot reach the team's item, client or link either.
    const own = t.eve.personalWorkspaceId;
    expect(await t.team.item(eve, own, id)).toBeNull();
    await rejectsCode(t.team.decide(eve, own, id, "approve"), "not_found");
    await rejectsCode(t.team.assign(eve, own, id, t.eve.id), "not_found");
    await rejectsCode(t.team.updateClient(eve, own, t.northside.id, { name: "Mine" }), "not_found");
    const { link } = await t.team.createShareLink(as(t.ada.id), t.ws, t.northside.id, { label: "Maya" });
    await rejectsCode(t.team.revokeShareLink(eve, own, link.id), "not_found");
    await rejectsCode(t.team.createClient(eve, own, { name: "Steal", brandBrainIds: [t.brain("Crumb and Co").id] }), "invalid_request");
    // A step run of a pipeline is not an item of its own.
    const p = await t.api.startPipeline(as(t.ed.id), t.ws, { pipelineId: "repurpose-post", inputs: { post: "We burned 40 croissants so you would not have to. Here is what we learned.", posted_on: "x", to: "tiktok" }, confirmations: { rights: true } });
    const settled = await t.pipelineEngine.waitUntilSettled(t.ws, p.id);
    expect(await t.team.item(as(t.ada.id), t.ws, settled.steps[0].runId!)).toBeNull();
    expect(await t.team.notifications(eve, own)).toEqual([]);
  });
});
