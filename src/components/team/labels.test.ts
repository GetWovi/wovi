import { describe, expect, it } from "vitest";
import { STATE_LABELS } from "@/lib/app/results";
import { itemTag } from "./labels";

describe("the review row's tag", () => {
  it("says Ready for a clean result waiting for a decision, as History does, and Needs review only when a check flagged it", () => {
    expect(itemTag("needs_review", false)).toEqual({ tone: "ready", label: STATE_LABELS.ready });
    expect(itemTag("needs_review", true)).toEqual({ tone: "needs_review", label: STATE_LABELS.needs_review });
    expect(STATE_LABELS.ready).toBe("Ready");
  });

  it("keeps the review state's own words for every other state", () => {
    expect(itemTag("approved", false)).toEqual({ tone: "approved", label: "Approved" });
    expect(itemTag("draft", true)).toEqual({ tone: "draft", label: "Draft" });
    expect(itemTag("changes_requested", false)).toEqual({ tone: "changes_requested", label: "Changes asked" });
  });
});
