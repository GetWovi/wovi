import { describe, expect, it } from "vitest";
import { hasVoice, welcomeWords } from "./onboarding";
import { POSTS, as, testApp } from "./test-helpers";

describe("the welcome after onboarding", () => {
  it("says the Brand Brain is in only when it has a voice; after skipping the posts it says what is missing", async () => {
    const { api, brands, ada, team } = await testApp();
    await api.saveOnboarding(as(ada.id), team.id, { name: "Curl & Co", niche: "Hair salon", platforms: ["tiktok"] });
    await api.finishOnboarding(as(ada.id), team.id, { name: "Curl & Co", niche: "Hair salon", platforms: ["tiktok"] });
    const [basics] = await brands.list(as(ada.id), team.id);
    expect(hasVoice(basics)).toBe(false);
    const empty = welcomeWords({ voiced: hasVoice(basics) });
    expect(empty.title).toBe("You are in");
    expect(`${empty.title} ${empty.description}`).not.toMatch(/Brand Brain is in|reads it first/);
    expect(empty.description).toMatch(/only has the basics/);

    const full = await testApp();
    await full.api.saveOnboarding(as(full.ada.id), full.team.id, { name: "Spoke and Chain", posts: POSTS });
    await full.api.readOnboardingPosts(as(full.ada.id), full.team.id);
    await full.api.finishOnboarding(as(full.ada.id), full.team.id);
    const [voiced] = await full.brands.list(as(full.ada.id), full.team.id);
    expect(hasVoice(voiced)).toBe(true);
    expect(welcomeWords({ voiced: true })).toEqual({ title: "Your Brand Brain is in", description: "Every agent reads it first." });
    expect(welcomeWords(null).title).toBe("You are in");
  });
});
