/** Deterministic sample runs for the hero's live demo. Illustrative copy only. */

import { curlSnippets, mcpSnippets } from "@/lib/api/snippets";
import { SITE_URL } from "@/lib/site";

export type DemoRun = {
  idea: string;
  hooks: string[];
  caption: string;
  /** Script Writer's beats after the hook: setup, turn and ending, each with what is on screen. */
  frames: { label: string; text: string }[];
  /** Short on-screen text for each beat. */
  onScreen: string[];
  fit: number;
};

export const DEMO_RUNS: DemoRun[] = [
  {
    idea: "We stopped doing custom cakes at the bakery. Here is why.",
    hooks: ["The day I said no to a wedding cake order", "Custom cakes were our best seller. We cut them anyway.", "Three words that saved my bakery: no custom cakes"],
    caption: "Custom cakes were paying the rent and eating the team. Here is what we chose instead, and what happened to the queue on Saturday.",
    frames: [
      { label: "Setup", text: "Hands boxing a plain loaf. On screen: We stopped." },
      { label: "Turn", text: "Empty cake display, early light." },
      { label: "Ending", text: "Saturday queue out the door." },
    ],
    onScreen: ["We stopped.", "5:40am", "Saturday"],
    fit: 94,
  },
  {
    idea: "A personal trainer explaining why she stopped counting calories with clients.",
    hooks: ["I threw out the calorie spreadsheet", "Why my clients eat more and lose more", "The number I stopped asking for"],
    caption: "Counting calories worked on paper and failed in kitchens. This is what we track now, and why it sticks past week three.",
    frames: [
      { label: "Setup", text: "Notebook closes. On screen: no more numbers." },
      { label: "Turn", text: "A full plate, overhead, natural light." },
      { label: "Ending", text: "Client laughing mid-set." },
    ],
    onScreen: ["No numbers.", "Full plate", "Week three"],
    fit: 91,
  },
  {
    idea: "An indie studio shipping a game after four years, told from the last night.",
    hooks: ["Four years. One upload button.", "The last bug we fixed at 3am", "What shipping actually felt like"],
    caption: "Four years ended with one click at 3:14am. Here is the last hour, the bug that almost stopped it, and the first review.",
    frames: [
      { label: "Setup", text: "Dark room, one monitor, cursor on Publish." },
      { label: "Turn", text: "Terminal scroll, then silence." },
      { label: "Ending", text: "Phone lights up on the desk." },
    ],
    onScreen: ["Four years.", "3:14am", "First review"],
    fit: 96,
  },
];

export const SLOP_LINES: { text: string; slop: boolean }[] = [
  { text: "In today's fast-paced digital landscape,", slop: true },
  { text: "game-changing content is key.", slop: true },
  { text: "The day I said no to a wedding cake order.", slop: false },
  { text: "Unlock your brand's full potential", slop: true },
  { text: "with next-level storytelling.", slop: true },
  { text: "Custom cakes paid the rent and ate the team.", slop: false },
  { text: "Elevate your presence today!", slop: true },
  { text: "Here is what we chose instead.", slop: false },
];

/**
 * The agent cards: the launch lineup (phase 8). Six live text agents, Trend
 * Scout coming once the trend tool exists, and the two video agents next.
 * A test ties names, jobs and statuses to the specs in src/lib/launch.
 */
export type AgentCardStatus = "live" | "coming" | "next";

export const AGENTS: { name: string; job: string; tag: string; fit: number; icon: "bulb" | "bolt" | "film" | "spark" | "hash" | "copy" | "search" | "play"; status: AgentCardStatus }[] = [
  { name: "Idea Generator", job: "Gives you a week of post ideas that only your business could post.", tag: "Ideas", fit: 91, icon: "bulb", status: "live" },
  { name: "Hook Writer", job: "Opens a post or a short with one line people stop for.", tag: "Hooks", fit: 94, icon: "bolt", status: "live" },
  { name: "Script Writer", job: "Turns one idea into beats with a beginning, a turn and an end.", tag: "Scripts", fit: 93, icon: "film", status: "live" },
  { name: "Caption Writer", job: "Writes the caption to match the clip, the format and your voice.", tag: "Captions", fit: 92, icon: "spark", status: "live" },
  { name: "Hashtag Optimizer", job: "Picks the few tags and search words that help the right people find the post.", tag: "Reach", fit: 90, icon: "hash", status: "live" },
  { name: "Platform Repurposer", job: "Turns one post that worked into a native version for each of your other platforms.", tag: "Repurposing", fit: 89, icon: "copy", status: "live" },
  { name: "Trend Scout", job: "Finds the formats rising in your niche this week and how you could use them.", tag: "Research", fit: 93, icon: "search", status: "live" },
  { name: "Storyboarder", job: "Frames, shots and on-screen text for every beat of the script.", tag: "Storyboards", fit: 0, icon: "film", status: "next" },
  { name: "Voice and Cut", job: "Narration in your voice and a first cut from the storyboard.", tag: "Video", fit: 0, icon: "play", status: "next" },
];

export const PIPELINE = [
  { id: "idea", title: "Idea", text: "Type it or paste a note. One sentence is enough.", agent: "You", tag: "Start" },
  { id: "script", title: "Script", text: "Script Writer turns it into beats: an opening, a turn, an ending.", agent: "Script Writer", tag: "Live" },
  { id: "storyboard", title: "Storyboard", text: "Frames, shots and on-screen text for every beat.", agent: "Storyboarder", tag: "Next" },
  { id: "approve", title: "Approve", text: "You say yes, or fix one line. Nothing ships without you.", agent: "You", tag: "Always" },
  { id: "video", title: "Voice and video", text: "Narration in your voice and a first cut you can post.", agent: "Voice and Cut", tag: "Next" },
];

/**
 * The code panel. Built from the same snippets the API and assistants page
 * shows (src/lib/api/snippets.ts), on the public address, so the homepage can
 * never show a path, a key format or a config the API does not have. A test
 * checks every path against the route table.
 */
const MCP = Object.fromEntries(mcpSnippets(SITE_URL).map((s) => [s.id, s]));
const CURL = Object.fromEntries(curlSnippets(SITE_URL).map((s) => [s.id, s]));

/** The real start call, with a shorter idea and the body spread over lines so it reads on a phone. */
const HOME_BODY = { inputs: { idea: "We stopped doing custom cakes. Here is why.", platform: "tiktok" } };
const startRun = CURL.start.code.replace(/-d '[^']*'/, () => `-d '${JSON.stringify(HOME_BODY, null, 2).replace(/\n/g, "\n  ")}'`);

/** What GET /api/v1/runs/{id} answers once Hook Writer is done, cut down to the parts that matter here (RunSchema). */
const RUN_RESULT = [
  "# {",
  '#   "id": "run_...",',
  '#   "status": "succeeded",',
  '#   "ready": true,',
  '#   "output": { "kind": "list", "items": [',
  '#     "The day I said no to a wedding cake order",',
  "#     ...",
  "#   ] },",
  '#   "quality": { "score": 94, "bar": 70, ... },',
  '#   "aiGenerated": true',
  "# }",
].join("\n");

export const CODE_TABS: { id: string; label: string; lang: string; code: string }[] = [
  {
    id: "claude",
    label: "Claude",
    lang: "shell",
    code: [MCP["claude-code"].code, "", `# ${MCP["claude-code"].note}`].join("\n"),
  },
  {
    id: "cursor",
    label: "Cursor",
    lang: "json",
    code: MCP.cursor.code,
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    lang: "text",
    code: [MCP.chatgpt.where, "", MCP.chatgpt.code].join("\n"),
  },
  {
    id: "api",
    label: "API",
    lang: "shell",
    code: [
      startRun,
      "",
      "# 202 Accepted, with the run and its id. Then:",
      "",
      CURL.poll.code,
      "",
      RUN_RESULT,
    ].join("\n"),
  },
];
