/**
 * The pipeline templates: one-click chains of the launch agents, so a person
 * never builds a pipeline from scratch.
 *
 * 1. Idea to ready post: the product doc's example. The person's idea (or
 *    Idea Generator's, when they ask for ideas first) into Hook Writer, the
 *    picked hook into Script Writer, the script into Caption Writer, the best
 *    caption into Hashtag Optimizer. Every writing step is brand-checked with
 *    the rewrite loop, and a person approves at the end.
 * 2. Repurpose a post that worked: Platform Repurposer, then Hashtag
 *    Optimizer for the new platform.
 * 3. Caption and tags for a clip: Caption Writer, the person picks a caption,
 *    then Hashtag Optimizer.
 *
 * Agents are named by id at "current", so tuning in the builder reaches the
 * templates; every run pins the versions it used, and a change that breaks a
 * template is refused at submit with a clear message. Installed by
 * `npm run agents:launch` (install.ts).
 */
import { PLATFORM_CREATOR_ID } from "@/lib/agents/seeds";
import type { PipelineCreateInput } from "./registry";

const owner = { kind: "platform", creatorId: PLATFORM_CREATOR_ID } as const;
const brandCheck = { when: "brand", rewrite: true, then: "review" } as const;

const VIDEO_PLATFORMS = [
  { value: "tiktok", label: "TikTok" },
  { value: "shorts", label: "YouTube Shorts" },
  { value: "reels", label: "Instagram Reels" },
];
const ALL_PLATFORMS = [{ value: "x", label: "X" }, ...VIDEO_PLATFORMS];

const brandInput = {
  key: "brand",
  label: "Brand Brain",
  type: "profile" as const,
  required: false,
  help: "Which brand or client this is for. Uses your default Brand Brain when left empty.",
};

export const PIPELINE_TEMPLATES: PipelineCreateInput[] = [
  {
    id: "idea-to-post",
    version: "1.0.0",
    name: "Idea to ready post",
    job: "Takes one idea to a hook, a script, a caption and tags for a short video, in your voice, ready for your yes.",
    inputs: [
      {
        key: "start",
        label: "Where to start",
        type: "choice",
        required: true,
        options: [
          { value: "my_idea", label: "I have an idea" },
          { value: "ideas", label: "Give me ideas first" },
        ],
        default: "my_idea",
        help: "With ideas first, Idea Generator gives you seven and you pick one.",
      },
      { key: "platform", label: "Platform", type: "choice", required: true, options: VIDEO_PLATFORMS, default: "tiktok", help: "Where the video goes." },
      {
        key: "idea",
        label: "Your idea",
        type: "long_text",
        required: true,
        limits: { minLength: 10, maxLength: 300 },
        help: "One or two sentences with the real details: names, numbers, what happens. With ideas first, say what to post about.",
      },
      {
        key: "length",
        label: "Length",
        type: "choice",
        required: true,
        options: [
          { value: "s15", label: "15 seconds" },
          { value: "s30", label: "30 seconds" },
          { value: "s60", label: "60 seconds" },
        ],
        default: "s30",
      },
      {
        key: "details",
        label: "Facts to include",
        type: "text",
        required: false,
        limits: { maxLength: 300 },
        help: "Anything the caption must get exactly right, like a date, a price or a name.",
      },
      {
        key: "footage",
        label: "What you can film",
        type: "long_text",
        required: false,
        limits: { maxLength: 400 },
        help: "Places, things and people you can actually film, like: the counter, the oven, my hands.",
      },
      brandInput,
    ],
    brand: { input: "brand" },
    steps: [
      {
        id: "ideas",
        label: "Find the idea",
        agent: { id: "idea-generator", version: "current" },
        runIf: { input: "start", equals: "ideas" },
        inputs: { topic: { from: "input", key: "idea" }, platform: { from: "input", key: "platform" } },
        choose: { kind: "ask", label: "Pick the idea to make" },
        onFail: brandCheck,
      },
      {
        id: "hooks",
        label: "Write the hooks",
        agent: { id: "hook-writer", version: "current" },
        inputs: { idea: { from: "template", text: "{{steps.ideas.picked.idea|inputs.idea}}" }, platform: { from: "input", key: "platform" } },
        choose: { kind: "ask", label: "Pick the hook you like best" },
        onFail: brandCheck,
      },
      {
        id: "script",
        label: "Write the script",
        agent: { id: "script-writer", version: "current" },
        inputs: {
          idea: { from: "template", text: "Open with this hook: {{steps.hooks.picked}}\n\nThe idea: {{steps.ideas.picked.idea|inputs.idea}}" },
          length: { from: "input", key: "length" },
          footage: { from: "input", key: "footage" },
        },
        onFail: brandCheck,
      },
      {
        id: "caption",
        label: "Write the caption",
        agent: { id: "caption-writer", version: "current" },
        inputs: { post: { from: "step", step: "script", take: "all" }, platforms: { from: "input", key: "platform" }, details: { from: "input", key: "details" } },
        choose: { kind: "best_brand_fit" },
        onFail: brandCheck,
      },
      {
        id: "tags",
        label: "Pick the tags",
        agent: { id: "hashtag-picker", version: "current" },
        inputs: { caption: { from: "step", step: "caption", take: "picked" }, platform: { from: "input", key: "platform" } },
      },
    ],
    package: [
      { step: "ideas", label: "Idea", take: "picked" },
      { step: "hooks", label: "Hook", take: "picked" },
      { step: "script", label: "Script", take: "all" },
      { step: "caption", label: "Caption", take: "picked" },
      { step: "tags", label: "Tags and search words", take: "all" },
    ],
    approve: { label: "Happy with it? Approve it and it is ready to post." },
    maxCostUsd: 1,
    owner,
    status: "live",
    visibility: "public",
  },
  {
    id: "repurpose-post",
    version: "1.0.0",
    name: "Repurpose a post that worked",
    job: "Turns one post that worked into a native version for another platform, with the tags to go with it.",
    inputs: [
      {
        key: "post",
        label: "The post that worked",
        type: "long_text",
        required: true,
        limits: { minLength: 20, maxLength: 5000 },
        help: "Paste the post, caption or script as it ran. Only use work you own or have the rights to.",
      },
      {
        key: "posted_on",
        label: "Where it was posted",
        type: "choice",
        required: true,
        options: [...ALL_PLATFORMS, { value: "other", label: "Somewhere else, like a blog or newsletter" }],
      },
      { key: "to", label: "Make a version for", type: "choice", required: true, options: ALL_PLATFORMS, help: "The platform you want the new version for." },
      {
        key: "keep",
        label: "Must stay the same",
        type: "long_text",
        required: false,
        limits: { maxLength: 300 },
        help: "Lines, names or facts to keep word for word. Leave empty if none.",
      },
      brandInput,
    ],
    brand: { input: "brand" },
    steps: [
      {
        id: "version",
        label: "Make the new version",
        agent: { id: "repurposer", version: "current" },
        inputs: {
          post: { from: "input", key: "post" },
          posted_on: { from: "input", key: "posted_on" },
          to: { from: "input", key: "to" },
          keep: { from: "input", key: "keep" },
        },
        choose: { kind: "item", index: 0 },
        onFail: brandCheck,
      },
      {
        id: "tags",
        label: "Pick the tags",
        agent: { id: "hashtag-picker", version: "current" },
        inputs: { caption: { from: "step", step: "version", take: "picked" }, platform: { from: "input", key: "to" } },
      },
    ],
    package: [
      { step: "version", label: "New version", take: "picked" },
      { step: "tags", label: "Tags and search words", take: "all" },
    ],
    approve: { label: "Happy with it? Approve it and it is ready to post." },
    maxCostUsd: 0.5,
    owner,
    status: "live",
    visibility: "public",
  },
  {
    id: "caption-and-tags",
    version: "1.0.0",
    name: "Caption and tags for a clip",
    job: "Writes captions for a clip you already have, lets you pick one, then adds the tags and search words.",
    inputs: [
      {
        key: "post",
        label: "What the clip shows",
        type: "long_text",
        required: true,
        limits: { minLength: 10, maxLength: 2000 },
        help: "Describe the clip or photo, or paste the script.",
      },
      { key: "platform", label: "Platform", type: "choice", required: true, options: ALL_PLATFORMS, default: "tiktok" },
      { key: "location", label: "Where you are", type: "text", required: false, limits: { maxLength: 80 }, help: "Town or area, if your customers are local." },
      {
        key: "details",
        label: "Facts to include",
        type: "long_text",
        required: false,
        limits: { maxLength: 300 },
        help: "Anything the caption must get exactly right, like a date, a price or a name.",
      },
      brandInput,
    ],
    brand: { input: "brand" },
    steps: [
      {
        id: "caption",
        label: "Write the captions",
        agent: { id: "caption-writer", version: "current" },
        inputs: { post: { from: "input", key: "post" }, platforms: { from: "input", key: "platform" }, details: { from: "input", key: "details" } },
        choose: { kind: "ask", label: "Pick the caption you like best" },
        onFail: brandCheck,
      },
      {
        id: "tags",
        label: "Pick the tags",
        agent: { id: "hashtag-picker", version: "current" },
        inputs: { caption: { from: "step", step: "caption", take: "picked" }, platform: { from: "input", key: "platform" }, location: { from: "input", key: "location" } },
      },
    ],
    package: [
      { step: "caption", label: "Caption", take: "picked" },
      { step: "tags", label: "Tags and search words", take: "all" },
    ],
    approve: { label: "Happy with it? Approve it and it is ready to post." },
    maxCostUsd: 0.3,
    owner,
    status: "live",
    visibility: "public",
  },
];

/** The change note each template is saved with. */
export const TEMPLATE_NOTE = "Pipeline template";
