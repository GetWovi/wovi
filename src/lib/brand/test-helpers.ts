/** Brand Brains for tests: test accounts, memory tables and files, the proposer on the fake provider. */
import type { Principal } from "@/lib/accounts/accounts";
import { testAccounts } from "@/lib/accounts/test-helpers";
import { memoryFileStorage } from "@/lib/builder/storage";
import { fakeProvider, type FakeOptions } from "@/lib/runs/providers/fake";
import { BrandBrains } from "./brains";
import { ProfileProposer, type LinkFetcher } from "./profile";
import { memoryBrandStore } from "./store";
import type { BrainBody } from "./types";

export const as = (userId: string): Principal => ({ kind: "user", userId });

export async function testBrands(opts: { fake?: FakeOptions; fetcher?: LinkFetcher } = {}) {
  const t = testAccounts();
  let tick = 0;
  const now = () => new Date(t.clock.t + tick++ * 1000);
  const fake = fakeProvider(opts.fake);
  const store = memoryBrandStore();
  const files = memoryFileStorage();
  const brands = new BrandBrains({ accounts: t.accounts, store, files, proposer: new ProfileProposer({ providers: { fake }, providerOverride: "fake" }), fetcher: opts.fetcher, now });

  const ada = (await t.signUp("ada@example.com")).user;
  const eve = (await t.signUp("eve@example.com")).user;
  const team = await t.accounts.workspaces.create(as(ada.id), "Team");
  /** A member of the team with a role, through a real invite. */
  const join = async (email: string, role: "admin" | "editor" | "viewer") => {
    const user = (await t.signUp(email)).user;
    await t.accounts.workspaces.invite(as(ada.id), team.id, email, role);
    await t.accounts.workspaces.acceptInvite(user.id, t.lastMail(email).token);
    return user;
  };
  return { ...t, fake, store, files, brands, ada, eve, team, join };
}

/** A full Brand Brain for a small bakery. */
export function bakery(over: Partial<BrainBody> = {}): Partial<BrainBody> {
  return {
    name: "Crumb and Co",
    niche: "Small bakery in Leeds",
    platforms: ["x", "reels"],
    voice: {
      description: "Warm, dry humour, short sentences. Talks like the baker at 5 a.m.",
      tone: ["warm", "dry"],
      use: ["proper loaf", "Gerald"],
      avoid: ["artisanal", "mouthwatering"],
      samples: ["We burned 40 croissants so you would not have to.", "The starter is called Gerald. Gerald is nine."],
    },
    topics: ["sourdough", "early mornings"],
    references: [{ id: "", text: "We burned 40 croissants so you would not have to. Here is what we learned.", url: null, note: "Owns the mistake, then teaches" }],
    moodBoard: [
      { id: "", kind: "text", note: "The light we want", url: null, text: "flour dust in morning light", color: null, file: null },
      { id: "", kind: "swatch", note: "Crust", url: null, text: null, color: "#8a4b2a", file: null },
    ],
    dos: ["Show the hands and the process"],
    donts: ["No hashtags", "Never call anything artisanal", "No discounts in the first line"],
    idea: "Honest baking: show the mess behind every good loaf.",
    ...over,
  };
}
