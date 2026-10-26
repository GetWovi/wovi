import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(join(process.cwd(), "src", f), "utf8");

describe("toasts on a phone", () => {
  it("sit above the app's tab bar, never over it", () => {
    const app = read("components/app/App.module.css");
    const bar = Number(/\.tabs \{[^}]*?height: (\d+)px/.exec(app)?.[1]);
    expect(bar).toBeGreaterThan(0);
    const toast = read("components/ui/Toast.module.css");
    const rule = /@media \(max-width: (\d+)px\) \{\s*:global\(body:has\(\[data-tab-bar\]\)\) \.region \{\s*bottom: calc\((\d+)px \+ var\(--s-3\)\);/.exec(toast);
    expect(rule).not.toBeNull();
    expect(Number(rule![2])).toBeGreaterThanOrEqual(bar);
    // The same breakpoint as the tab bar, and the bar carries the marker the rule looks for.
    expect(app).toContain(`@media (max-width: ${rule![1]}px)`);
    expect(read("components/app/AppShell.tsx")).toMatch(/<nav className=\{styles\.tabs\}[^>]*data-tab-bar/);
  });
});
