import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // No test ever sees a real model key: the fake provider only.
  test: { include: ["src/**/*.test.ts"], environment: "node", env: { OPENROUTER_API_KEY: "" } },
});
