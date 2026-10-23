import { describe, expect, it } from "vitest";
import { rejectsCode } from "@/lib/accounts/test-helpers";
import { analyzePosts, heuristicProfile, openingKind } from "./profile";
import { as, bakery, testBrands } from "./test-helpers";
import { Credits } from "@/lib/credits/credits";
import { testPaymentProvider } from "@/lib/credits/payments";
import { memoryCreditStore } from "@/lib/credits/store";

/** Lowercase, short, emoji, no hashtags, talks to "you". */
const CASUAL = [
  "ok you need to hear this 😭 the croissants burned again. third time this week.",
  "you ever wake up at 4 and smell butter? that's the job 🥐",
  "we tried rye today. you're not ready. honestly the best loaf we've made 🔥",
  "no recipe today. just the starter, the oven and you 🫶",
];

/** Long, formal sentences, hashtags at the end, no emoji. */
const FORMAL = [
  "Our quarterly review of supply chain resilience shows that regional suppliers recovered faster than global networks in every category we measured.\n\n#SupplyChain #Logistics #Operations",
  "Procurement teams that invested in supplier relationships during calm periods were better placed to protect their supply chain when disruption arrived, according to our quarterly review.\n\n#Procurement #SupplyChain",
  "The most resilient logistics operations we studied shared one trait: they treated inventory buffers as strategy rather than waste, and they checked their supply chain every quarter.\n\n#Logistics #SupplyChain #Strategy",
];

/** Lists and questions, one line per point. */
const LISTS = [
  "5 stretches for desk workers:\n1. Neck rolls\n2. Wrist circles\n3. Seated twist\n4. Hip opener\n5. Shoulder shrugs\nWhich one do you skip?",
  "3 mistakes in your morning stretch:\n1. Rushing\n2. Holding your breath\n3. Skipping the hips\nGuilty of any?",
  "7 minutes is all your back needs.\nStart with the hips.\nThen the spine.\nThen breathe.\nReady to try it tomorrow?",
];

describe("reading past posts", () => {
  it("reads a casual voice: lowercase, short, emoji, no hashtags, talks to you", () => {
    const s = analyzePosts(CASUAL);
    expect(s.lowercaseShare).toBeGreaterThan(0.8);
    expect(s.wordsPerSentence).toBeLessThan(10);
    expect(s.emojiPerPost).toBeGreaterThanOrEqual(1);
    expect(s.hashtagsPerPost).toBe(0);
    expect(s.youShare).toBe(1);
    const { profile } = heuristicProfile(CASUAL);
    expect(profile.voice.tone).toEqual(expect.arrayContaining(["punchy", "casual", "playful", "direct"]));
    expect(profile.voice.description).toMatch(/Mostly lowercase/);
    expect(profile.donts).toEqual(expect.arrayContaining(["No hashtags.", "No exclamation marks."]));
    expect(profile.donts).not.toContain("No emoji.");
    expect(profile.dos.some((d) => /emoji/.test(d))).toBe(true);
    expect(profile.voice.samples[0]).toBe("ok you need to hear this 😭 the croissants burned again.");
  });

  it("reads a formal voice: long sentences, hashtags, no emoji, recurring topics", () => {
    const s = analyzePosts(FORMAL);
    expect(s.wordsPerSentence).toBeGreaterThan(18);
    expect(s.hashtagsPerPost).toBeGreaterThanOrEqual(2);
    expect(s.emojiPerPost).toBe(0);
    expect(s.hashtags[0]).toBe("supply chain");
    const { profile } = heuristicProfile(FORMAL);
    expect(profile.voice.tone).toEqual(expect.arrayContaining(["thoughtful", "calm"]));
    expect(profile.voice.tone).not.toContain("playful");
    expect(profile.topics.slice(0, 2)).toEqual(["supply chain", "logistics"]);
    expect(profile.dos).toEqual(expect.arrayContaining([expect.stringMatching(/^Add 3 hashtags at the end/), expect.stringMatching(/^Take your time/)]));
    expect(profile.donts).toEqual(expect.arrayContaining(["No emoji."]));
    expect(profile.donts).not.toContain("No hashtags.");
    expect(profile.voice.use).toContain("supply chain");
  });

  it("reads lists and questions: number openings, line breaks, questions", () => {
    const s = analyzePosts(LISTS);
    expect(s.opening).toEqual({ kind: "number", count: 3 });
    expect(s.questionShare).toBe(1);
    expect(s.linesPerPost).toBeGreaterThan(4);
    const { profile } = heuristicProfile(LISTS);
    expect(profile.voice.tone).toEqual(expect.arrayContaining(["practical", "curious"]));
    expect(profile.dos[0]).toBe("Open with a number or a list, like 3 of your 3 posts do.");
    expect(profile.dos).toEqual(expect.arrayContaining([expect.stringMatching(/^Break lines often/)]));
  });

  it("does not count list items as sentences", () => {
    expect(analyzePosts(["1. Rain\n2. Oil\nThree things kill a chain every winter."]).wordsPerSentence).toBe(7);
  });

  it("classifies openings", () => {
    expect(openingKind("Why does nobody talk about this?")).toBe("question");
    expect(openingKind("3 things I learned")).toBe("number");
    expect(openingKind("I quit my job today")).toBe("personal");
    expect(openingKind("Stop doing this")).toBe("command");
    expect(openingKind('"Bread is time," my gran said')).toBe("quote");
    expect(openingKind("The oven is on")).toBe("statement");
  });

  it("suggests avoiding generic words only when the posts never use them", () => {
    const { profile } = heuristicProfile(["This journey was long.", "Our journey continues.", "Every journey ends."]);
    expect(profile.voice.avoid).not.toContain("journey");
    expect(profile.voice.avoid).toContain("game-changer");
  });
});

describe("the profile flow", () => {
  it("proposes on the fake provider without saving anything, and is the same every time", async () => {
    const { brands, ada, team, fake, store } = await testBrands();
    const p = await brands.propose(as(ada.id), team.id, { name: "Crumb", niche: "Bakery", platforms: ["x", "fax"], posts: CASUAL });
    expect(p).toMatchObject({ status: "open", source: "fake", name: "Crumb", niche: "Bakery", platforms: ["x"] });
    expect(p.profile).toEqual(heuristicProfile(CASUAL).profile);
    expect(p.tokensIn).toBeGreaterThan(0);
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0].messages[1].content).toContain('<data name="post_1">');
    expect(await store.brains.find({})).toEqual([]);
    const again = await brands.propose(as(ada.id), team.id, { posts: CASUAL });
    expect(again.profile).toEqual(p.profile);
  });

  it("asks for 3 to 5 posts", async () => {
    const { brands, ada, team } = await testBrands();
    await rejectsCode(brands.propose(as(ada.id), team.id, { posts: ["one", "two"] }), "invalid_request");
    await rejectsCode(brands.propose(as(ada.id), team.id, { posts: ["1", "2", "3", "4", "5", "6"] }), "invalid_request");
    await rejectsCode(brands.propose(as(ada.id), team.id, { posts: ["a", "b", "x".repeat(3001)] }), "invalid_request");
  });

  it("keeps links as references without reading them when no fetcher is set up", async () => {
    const { brands, ada, team } = await testBrands();
    const p = await brands.propose(as(ada.id), team.id, { posts: [...CASUAL.slice(0, 2), "https://x.com/crumb/status/1"] });
    expect(p.posts[2]).toEqual({ text: "", url: "https://x.com/crumb/status/1" });
    expect(p.unread).toEqual(["https://x.com/crumb/status/1: links are not read yet, so it is kept as a reference only."]);
    await rejectsCode(brands.propose(as(ada.id), team.id, { posts: ["https://a.com/1", "https://a.com/2", "https://a.com/3"] }), "invalid_request");
  });

  it("reads links through a fetcher when one is set up", async () => {
    const seen: string[] = [];
    const { brands, ada, team } = await testBrands({ fetcher: { fetchText: async (url) => (seen.push(url), url.endsWith("/1") ? CASUAL[3] : null) } });
    const p = await brands.propose(as(ada.id), team.id, { posts: [CASUAL[0], "https://a.com/1", "https://a.com/2"] });
    expect(seen).toEqual(["https://a.com/1", "https://a.com/2"]);
    expect(p.posts[1].text).toBe(CASUAL[3]);
    expect(p.unread).toEqual(["https://a.com/2: no text could be read."]);
  });

  it("saves only what the person reviewed, with their edits, once", async () => {
    const { brands, ada, team, store } = await testBrands();
    const p = await brands.propose(as(ada.id), team.id, { name: "Crumb", posts: CASUAL });
    const edited = { ...p.profile.voice, tone: ["warm", "dry"], avoid: [...p.profile.voice.avoid, "artisanal"] };
    const saved = await brands.accept(as(ada.id), team.id, p.id, { name: "Crumb and Co", voice: edited, donts: ["No hashtags.", "Never use \"artisanal\""], idea: "Honest baking" });
    expect(saved.body).toMatchObject({ name: "Crumb and Co", idea: "Honest baking", topics: p.profile.topics, dos: p.profile.dos });
    expect(saved.body.voice.tone).toEqual(["warm", "dry"]);
    expect(saved.body.voice.avoid).toContain("artisanal");
    expect(saved.body.donts).toEqual(["No hashtags.", 'Never use "artisanal"']);
    expect(saved.body.references.map((r) => [r.text, r.note])).toEqual(CASUAL.map((t) => [t, "Past post"]));
    expect(saved.version.note).toBe("Built from 4 past posts");
    expect((await store.proposals.get(p.id))).toMatchObject({ status: "saved", savedBrainId: saved.brain.id });
    await rejectsCode(brands.accept(as(ada.id), team.id, p.id), "invalid_request");
  });

  it("leaves a proposal open when an edit does not pass, so it can be fixed", async () => {
    const { brands, ada, team, store } = await testBrands();
    const p = await brands.propose(as(ada.id), team.id, { posts: CASUAL });
    await rejectsCode(brands.accept(as(ada.id), team.id, p.id, { name: "" }), "invalid_body");
    expect((await store.proposals.get(p.id))?.status).toBe("open");
    expect(await store.brains.find({})).toEqual([]);
    await brands.accept(as(ada.id), team.id, p.id, { name: "Fixed" });
  });

  it("rebuilds an existing Brand Brain as a new version and adds the new posts as references", async () => {
    const { brands, ada, team } = await testBrands();
    const { brain, body } = await brands.create(as(ada.id), team.id, bakery());
    const p = await brands.propose(as(ada.id), team.id, { brainId: brain.id, posts: LISTS });
    expect(p).toMatchObject({ brainId: brain.id, name: "Crumb and Co", niche: "Small bakery in Leeds" });
    const v = await brands.accept(as(ada.id), team.id, p.id);
    expect(v.version).toMatchObject({ version: 2, note: "Rebuilt from 3 past posts" });
    expect(v.body.references).toHaveLength(body.references.length + 3);
    expect(v.body.moodBoard).toEqual(body.moodBoard);
    expect(v.body.idea).toBe(body.idea);
  });

  it("takes a real model's improved answer, and falls back to the counts when the answer never fits", async () => {
    const better = { voice: { description: "Sleepy baker energy.", tone: ["warm"], use: ["loaf"], avoid: ["artisanal"], samples: ["you ever wake up at 4 and smell butter?"] }, topics: ["bread"], dos: ["Talk at 5 a.m."], donts: ["No hashtags"] };
    const good = await testBrands({ fake: { id: "model", respond: () => JSON.stringify(better) } });
    // A provider that is not the fake stands in for a real model.
    const p = await good.brands.propose(as(good.ada.id), good.team.id, { posts: CASUAL });
    expect(p.source).toBe("model");
    expect(p.profile).toEqual(better);

    const bad = await testBrands({ fake: { id: "model", respond: () => "not json" } });
    const q = await bad.brands.propose(as(bad.ada.id), bad.team.id, { posts: CASUAL });
    expect(q.source).toBe("heuristics");
    expect(q.profile).toEqual(heuristicProfile(CASUAL).profile);
    expect(bad.fake.requests).toHaveLength(2);
    expect(q.notes.join(" ")).toMatch(/repair/);
  });
});

describe("the AI read of past posts costs credits (no general free trial)", () => {
  const better = { voice: { description: "Sleepy baker energy.", tone: ["warm"], use: ["loaf"], avoid: ["artisanal"], samples: ["you ever wake up at 4 and smell butter?"] }, topics: ["bread"], dos: ["Talk at 5 a.m."], donts: ["No hashtags"] };

  async function paid(opts: { respond?: () => string | Error; topUp?: number; holder?: number } = {}) {
    const credits = new Credits({ store: memoryCreditStore(), payments: testPaymentProvider() });
    const t = await testBrands({ fake: { id: "model", respond: opts.respond ?? (() => JSON.stringify(better)) }, billing: credits, freeModelReads: false });
    if (opts.topUp) await credits.topUp(t.team.id, { credits: opts.topUp, by: t.ada.id });
    if (opts.holder) await credits.grantHolder(t.team.id, { credits: opts.holder, period: new Date().toISOString().slice(0, 7), sourceId: "snap_1", by: "system" });
    return { ...t, credits };
  }

  it("shows the cost first, and reads with plain counts for free unless the person asks for the AI", async () => {
    const t = await paid({ topUp: 500 });
    const quote = await t.brands.readQuote(as(t.ada.id), t.team.id);
    expect(quote).toMatchObject({ mode: "credits", available: 500 });
    expect(quote.mode === "credits" && quote.credits).toBeGreaterThan(0);
    const p = await t.brands.propose(as(t.ada.id), t.team.id, { posts: CASUAL });
    expect(p.source).toBe("heuristics");
    expect(p.charge).toBeUndefined();
    expect(t.fake.requests).toHaveLength(0);
    expect((await t.credits.balance(t.team.id)).available).toBe(500);
  });

  it("charges the real cost of an AI read, never more than the estimate shown, from paid credits", async () => {
    const t = await paid({ topUp: 500 });
    const quote = await t.brands.readQuote(as(t.ada.id), t.team.id, CASUAL);
    const credits = quote.mode === "credits" ? quote.credits : 0;
    const p = await t.brands.propose(as(t.ada.id), t.team.id, { posts: CASUAL, useModel: true, quotedCredits: credits });
    expect(p.source).toBe("model");
    expect(p.charge).toMatchObject({ estimate: credits, state: "charged" });
    expect(p.charge!.charged).toBeGreaterThan(0);
    expect(p.charge!.charged).toBeLessThanOrEqual(credits);
    expect((await t.credits.balance(t.team.id)).available).toBe(500 - p.charge!.charged);
    const charge = (await t.credits.ledger(t.team.id)).find((e) => e.kind === "charge")!;
    expect(charge).toMatchObject({ ref: { type: "job", id: p.id }, label: "Read past posts for a Brand Brain" });
    expect(charge.costMicroUsd).toBe(p.costMicroUsd);
  });

  it("without enough paid credits reads with plain counts and calls no model; holder credits never pay for it", async () => {
    const t = await paid({ holder: 500 });
    expect(await t.brands.readQuote(as(t.ada.id), t.team.id)).toMatchObject({ mode: "credits", available: 0 });
    const p = await t.brands.propose(as(t.ada.id), t.team.id, { posts: CASUAL, useModel: true });
    expect(p.source).toBe("heuristics");
    expect(p.notes.join(" ")).toMatch(/holder credits are for agent runs only/);
    expect(t.fake.requests).toHaveLength(0);
    expect((await t.credits.balance(t.team.id)).available).toBe(500);
  });

  it("gives the hold back when the model never answers in shape", async () => {
    const t = await paid({ topUp: 500, respond: () => "not json" });
    const p = await t.brands.propose(as(t.ada.id), t.team.id, { posts: CASUAL, useModel: true });
    expect(p.source).toBe("heuristics");
    expect(p.charge).toMatchObject({ charged: 0, state: "refunded" });
    expect((await t.credits.balance(t.team.id)).available).toBe(500);
  });

  it("limits AI reads per person, even with credits", async () => {
    const t = await paid({ topUp: 5_000 });
    for (let i = 0; i < 10; i++) await t.brands.propose(as(t.ada.id), t.team.id, { posts: CASUAL, useModel: true });
    await rejectsCode(t.brands.propose(as(t.ada.id), t.team.id, { posts: CASUAL, useModel: true }), "limit");
    // Plain counts stay free and unlimited.
    expect((await t.brands.propose(as(t.ada.id), t.team.id, { posts: CASUAL })).source).toBe("heuristics");
  });

  it("on a server without billing, no model reads for free: plain counts only", async () => {
    const t = await testBrands({ fake: { id: "model", respond: () => JSON.stringify(better) }, freeModelReads: false });
    expect(await t.brands.readQuote(as(t.ada.id), t.team.id)).toEqual({ mode: "off" });
    const p = await t.brands.propose(as(t.ada.id), t.team.id, { posts: CASUAL, useModel: true });
    expect(p.source).toBe("heuristics");
    expect(t.fake.requests).toHaveLength(0);
  });
});
