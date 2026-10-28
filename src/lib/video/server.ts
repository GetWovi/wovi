/**
 * The Next.js side of Make a video: one studio per server process on the
 * local stores, and who may see it (WOVI_VIDEO, builders only by default).
 */
import { join } from "node:path";
import type { User } from "@/lib/accounts/types";
import { dataDirFromEnv } from "@/lib/accounts/local";
import { accounts } from "@/lib/accounts/server";
import { localFileStorage } from "@/lib/builder/storage";
import { creditsEnabled, processCredits } from "@/lib/credits/local";
import { isLocalApp } from "@/lib/runtime";
import { providersFromEnv } from "@/lib/runs/providers";
import { svgPng } from "./finish";
import { MediaFailure, fakeVideoMedia, openRouterMedia, type VideoMedia } from "./media";
import { endCardSvg } from "./motion";
import { renderMotion } from "./motion-render";
import { fakePlanner, modelPlanner, type Planner } from "./planner";
import { fakeProposer, modelProposer, type Proposer } from "./proposal";
import { brandPalette, type BrandLook } from "./styles";
import { VideoStudio, jsonFileVideoStore, videoAccess } from "./studio";

const g = globalThis as { __woviVideo?: VideoStudio };

/** The real media with a key; the fake on a local app without one; otherwise every call says it is not set up. */
function mediaFromEnv(): VideoMedia {
  const key = process.env.OPENROUTER_API_KEY;
  if (key) return openRouterMedia({ apiKey: key, appUrl: process.env.WOVI_APP_URL });
  if (isLocalApp()) return fakeVideoMedia();
  const off = async (): Promise<never> => {
    throw new MediaFailure("Pictures and voice are not set up on this server yet.");
  };
  return { provider: "none", estimate: { imageMicroUsd: 80_000, speechMicroUsdPerChar: 20 }, image: off, speech: off, duration: off, cut: off, finish: off };
}

/** The planner on OpenRouter with a key, the fake on a local app without one. */
function plannerFromEnv(): Planner | null {
  const providers = providersFromEnv();
  if (providers.openrouter) return modelPlanner(providers.openrouter);
  return isLocalApp() ? fakePlanner() : null;
}

/** The proposal on OpenRouter's text-fast route with a key, the fake on a local app without one. */
function proposerFromEnv(): Proposer | null {
  const providers = providersFromEnv();
  if (providers.openrouter) return modelProposer(providers.openrouter);
  return isLocalApp() ? fakeProposer() : null;
}

/** The brand's end card as a PNG: its name, its colours and its logo, drawn by resvg with the brand fonts. */
async function endCard(brand: BrandLook, width: number, height: number): Promise<Uint8Array> {
  const p = brandPalette(brand.colors);
  const logo = brand.logo ? `data:${brand.logo.mimeType};base64,${Buffer.from(brand.logo.bytes).toString("base64")}` : null;
  return new Uint8Array(svgPng(endCardSvg({ name: brand.name, dark: p.dark, light: p.light, accent: p.accent ?? p.light }, width, height, 1, logo), width));
}

export function appVideo(): VideoStudio {
  if (!g.__woviVideo) {
    const dir = dataDirFromEnv();
    g.__woviVideo = new VideoStudio({
      accounts: accounts(),
      store: jsonFileVideoStore(join(dir, "videos.json")),
      files: localFileStorage(join(dir, "files")),
      media: mediaFromEnv(),
      planner: plannerFromEnv(),
      proposer: proposerFromEnv(),
      animate: renderMotion,
      card: endCard,
      billing: creditsEnabled() ? processCredits() : null,
    });
  }
  return g.__woviVideo;
}

/** May this person see Make a video? Everyone when WOVI_VIDEO=on, builders only by default, nobody when off. */
export function videoAllowed(user: Pick<User, "email" | "builder">): boolean {
  const access = videoAccess();
  return access === "on" || (access === "builders" && accounts().isBuilder(user));
}
