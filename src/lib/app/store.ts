/**
 * The app's own small tables (phase 9): where a person is in onboarding, and
 * the human approve step on a run. On the same Collection interface as
 * accounts, the builder and Brand Brains: memory for tests, one JSON file in
 * .data/ for local work, a Postgres store later. Every row carries its
 * workspace id.
 */
import { jsonFileTables, memoryTables, type Collection } from "@/lib/accounts/store";
import type { OnboardingRow, ReviewRow } from "./types";

export * from "./types";

export type AppStore = {
  onboarding: Collection<OnboardingRow>;
  reviews: Collection<ReviewRow>;
};

const TABLES = ["onboarding", "reviews"] as const satisfies readonly (keyof AppStore)[];

export function memoryAppStore(): AppStore {
  return memoryTables<AppStore>(TABLES);
}

export function jsonFileAppStore(file: string): AppStore {
  return jsonFileTables<AppStore>(file, TABLES);
}
