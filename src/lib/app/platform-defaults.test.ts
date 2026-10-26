import { describe, expect, it } from "vitest";
import type { AgentSpec } from "@/lib/agents/spec";
import { LAUNCH_AGENTS } from "@/lib/launch/specs";
import { PIPELINE_TEMPLATES } from "@/lib/pipelines/templates";
import { initialValues, initialValuesFor, platformDefaults, switchPlatformDefaults } from "./forms";

const launch = (id: string) => LAUNCH_AGENTS.find((a) => a.id === id)! as unknown as Pick<AgentSpec, "inputs">;
const ideaToPost = () => PIPELINE_TEMPLATES.find((t) => t.id === "idea-to-post")! as unknown as Pick<AgentSpec, "inputs">;

describe("the platform a form opens on", () => {
  it("is the first of the brand's platforms on an agent's one-pick platform field", () => {
    const spec = launch("idea-generator");
    expect(initialValues(spec).platform).toBe("");
    expect(initialValuesFor(spec, ["reels", "tiktok"]).platform).toBe("reels");
    expect(initialValuesFor(spec, []).platform).toBe("");
    expect(initialValuesFor(spec, undefined).platform).toBe("");
  });

  it("skips platforms the field does not offer, and wins over the template's TikTok", () => {
    const spec = ideaToPost();
    expect(initialValues(spec).platform).toBe("tiktok");
    // The pipeline is for short video, so X is passed over for the next one.
    expect(initialValuesFor(spec, ["x", "shorts"]).platform).toBe("shorts");
    expect(initialValuesFor(spec, ["x"]).platform).toBe("tiktok");
  });

  it("leaves pick-several fields and choices that are not platforms alone", () => {
    const spec: Pick<AgentSpec, "inputs"> = {
      inputs: [
        { key: "to", label: "Make versions for", type: "choice", required: true, multiple: true, options: [{ value: "x", label: "X" }, { value: "reels", label: "Instagram Reels" }] },
        { key: "goal", label: "Goal", type: "choice", required: true, multiple: false, options: [{ value: "trust", label: "Build trust" }, { value: "x", label: "X marks" }], default: "trust" },
      ],
    };
    expect(platformDefaults(spec, ["reels"])).toEqual({});
  });

  it("follows another Brand Brain unless the person picked a platform", () => {
    const spec = launch("hook-writer");
    const start = initialValuesFor(spec, ["tiktok"]);
    expect(switchPlatformDefaults(spec, start, ["tiktok"], ["reels"]).platform).toBe("reels");
    expect(switchPlatformDefaults(spec, start, ["tiktok"], []).platform).toBe("");
    const picked = { ...start, platform: "x" };
    expect(switchPlatformDefaults(spec, picked, ["tiktok"], ["reels"]).platform).toBe("x");
  });
});
