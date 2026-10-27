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
import { MediaFailure, fakeVideoMedia, openRouterMedia, type VideoMedia } from "./media";
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
  return { provider: "none", estimate: { imageMicroUsd: 80_000, speechMicroUsdPerChar: 20 }, image: off, speech: off, duration: off, cut: off };
}

export function appVideo(): VideoStudio {
  if (!g.__woviVideo) {
    const dir = dataDirFromEnv();
    g.__woviVideo = new VideoStudio({
      accounts: accounts(),
      store: jsonFileVideoStore(join(dir, "videos.json")),
      files: localFileStorage(join(dir, "files")),
      media: mediaFromEnv(),
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
