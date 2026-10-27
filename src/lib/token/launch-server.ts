/**
 * SERVER ONLY. The launch page's pieces for this server: the settings, the
 * reader on the configured node and contracts/launch.json, read from disk on
 * every call so the page and contracts/token-launch.sh always see the same
 * file. No Next.js imports, so the fork rehearsal (scripts/launch-rehearsal.ts)
 * runs exactly these.
 *
 *   WOVI_LAUNCH_PAGE              on: /token/launch exists. Anything else: 404
 *   WOVI_LAUNCH_OPENING_BUY_WEI   the dev buy, whole wei, digits only (10000000000000000 is 0.01 ETH)
 *   WOVI_BURN_POT_ADDRESS, WOVI_SPLITTER_ADDRESS, WOVI_TOKEN_RPC_URL, WOVI_EXPLORER_URL   as for /token
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tokenConfigFromEnv } from "./config";
import { launchSettingsFromEnv, type LaunchDeps } from "./launch";
import { viemLaunchReader } from "./launch-chain";

export const LAUNCH_FILE = () => join(process.cwd(), "contracts", "launch.json");

/** contracts/launch.json as parsed JSON, or a marker the checks turn into a sentence. */
export function readLaunchFile(path = LAUNCH_FILE()): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function launchDeps(env: Record<string, string | undefined> = process.env): LaunchDeps {
  const config = tokenConfigFromEnv(env);
  return { reader: viemLaunchReader(config.rpcUrl), settings: launchSettingsFromEnv(env, config.explorer), launchFile: readLaunchFile() };
}
