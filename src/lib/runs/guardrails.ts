/**
 * Guardrails, first version: cheap, deterministic checks. The phrase lists and
 * the check list are data, so phase 12 (quality gates, LLM judge, classifiers)
 * adds entries here without touching the engine.
 *
 * Two stages:
 * - before: runs at submit on the request. A failure refuses the run.
 * - after: runs on the parsed output. A failure is recorded on the run and
 *   marks it for review. Nothing failed is ever passed silently.
 */
import { GUARDRAIL_IDS, type Platform } from "@/lib/agents/catalog";
import type { AgentBody } from "@/lib/agents/spec";
import type { BrandBrain } from "./brand-brain";
import { LOW_SIMILARITY, brandFit, describeFlag } from "./brand-fit";
import type { RunInputs } from "./inputs";
import { outputTexts, type RunOutput } from "./output";
import { CATEGORY_INFO } from "@/lib/safety/rules";
import { labelFor, screen } from "@/lib/safety/screen";

/* ---------- Data ---------- */

export type PhraseList = {
  /** Plain phrases, matched case-insensitively on word boundaries. */
  phrases: string[];
  /** Regular expression sources for patterns plain phrases cannot catch. Matched case-insensitively. */
  patterns?: string[];
};

export const PHRASE_LISTS = {
  /** Generic filler lines from the anti-slop list. */
  anti_slop: {
    phrases: [
      "in today's fast-paced",
      "digital landscape",
      "game-changing",
      "game changer",
      "unlock your",
      "unlock the power",
      "unleash",
      "next-level",
      "take it to the next level",
      "elevate your",
      "let's dive in",
      "dive into",
      "delve",
      "look no further",
      "revolutionize",
      "cutting-edge",
      "harness the power",
      "it's no secret",
      "embark on a journey",
      "a testament to",
      "tapestry",
      "buckle up",
      "secret sauce",
      "supercharge",
      "skyrocket",
      "in the world of",
      "you won't believe",
    ],
  },
  /** False or unprovable claims about results, health or money. */
  misleading_claims: {
    phrases: [
      "guaranteed results",
      "100% guaranteed",
      "risk-free",
      "risk free",
      "get rich",
      "overnight success",
      "instant results",
      "miracle",
      "cure for",
      "doctors hate",
      "clinically proven",
      "scientifically proven",
      "no side effects",
      "never fails",
    ],
    patterns: [
      "guaranteed to (make|earn|grow|double|triple|go viral)",
      "lose \\d+ ?(pounds|lbs|kg|kilos) in",
      "(make|earn) \\$?\\d[\\d,.]*k? (a|per|every) (day|week|month)",
    ],
  },
  /** Invented quotes, reviews or customer stories. */
  fake_testimonials: {
    phrases: ["verified buyer", "our customers say", "customers love it", "5-star review", "five-star review", "★★★★★", "as a satisfied customer"],
    patterns: ['"[^"]{8,}"\\s*(-|\\u2013)\\s*[a-z]+ [a-z]\\.?(\\s|$)'],
  },
  /** Speaking as a real person who is not the user. */
  impersonation: {
    phrases: ["official statement from", "i am the real", "this is the official account of", "speaking on behalf of"],
  },
  /** Unsafe advice. The real hate, harassment and sexual content classifier is phase 12. */
  unsafe_content: {
    phrases: ["stop taking your medication", "skip your medication", "no need to see a doctor", "instead of seeing a doctor", "starve yourself"],
  },
} satisfies Record<string, PhraseList>;

/** Caption length limits per platform, in characters. */
export const PLATFORM_LIMITS: Record<Platform, { maxChars: number }> = {
  x: { maxChars: 280 },
  // The limit for posts made through TikTok's API, the one TikTok publishes (phase 18). The app itself may allow more.
  tiktok: { maxChars: 2200 },
  shorts: { maxChars: 5000 },
  reels: { maxChars: 2200 },
};

/** Common words that say nothing about a specific idea. Used by the specificity check. */
const STOPWORDS = new Set(
  "about after again also because been before being could does doing down each every from have here into just like make many more most much only other over same should some such than that their them then there these they this those through very what when where which while will with would your yours post posts video videos content".split(
    " ",
  ),
);

/* ---------- Checks ---------- */

export type CheckStatus = "pass" | "fail" | "note";

export type CheckResult = {
  guardrail: string;
  check: string;
  status: CheckStatus;
  message: string;
  /** What was caught, like the phrases found. */
  findings?: string[];
  /** A 0 to 100 reading, for checks that give one (brand fit). */
  score?: number;
};

export type Confirmations = { rights?: boolean; voiceConsent?: boolean };

export type BeforeContext = { spec: AgentBody; inputs: RunInputs; confirmations: Confirmations };
export type AfterContext = { spec: AgentBody; inputs: RunInputs; output: RunOutput; texts: string[]; brain: BrandBrain | null };

type Outcome = { status: CheckStatus; message: string; findings?: string[]; score?: number };

/**
 * `always` (phase 18): the check runs on every agent, declared or not. The
 * platform's content rules are not something an agent can leave out.
 */
export type GuardrailCheck =
  | { id: string; guardrail: string; stage: "before"; always?: boolean; run: (ctx: BeforeContext) => Outcome }
  | { id: string; guardrail: string; stage: "after"; always?: boolean; run: (ctx: AfterContext) => Outcome };

const normalize = (s: string) =>
  s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The phrases and patterns of a list found in the texts. */
export function findPhrases(texts: string[], list: PhraseList): string[] {
  const hay = normalize(texts.join("\n"));
  const found = new Set<string>();
  for (const p of list.phrases) {
    if (new RegExp(`(^|[^a-z0-9])${escapeRe(normalize(p))}($|[^a-z0-9])`, "i").test(hay)) found.add(p);
  }
  for (const src of list.patterns ?? []) {
    const m = new RegExp(src, "i").exec(hay);
    if (m) found.add(m[0].trim());
  }
  return [...found];
}

const phraseCheck = (list: keyof typeof PHRASE_LISTS, what: string) => (ctx: AfterContext): Outcome => {
  const found = findPhrases(ctx.texts, PHRASE_LISTS[list]);
  return found.length
    ? { status: "fail", message: `Found ${what}.`, findings: found }
    : { status: "pass", message: `No ${what}.` };
};

const contentWords = (text: string) =>
  (normalize(text).match(/[a-z][a-z']{3,}/g) ?? []).filter((w) => !STOPWORDS.has(w));

export const GUARDRAIL_CHECKS: GuardrailCheck[] = [
  { id: "anti_slop_phrases", guardrail: "banned_phrases", stage: "after", run: phraseCheck("anti_slop", "generic filler phrases") },
  { id: "misleading_claim_phrases", guardrail: "no_misleading_claims", stage: "after", run: phraseCheck("misleading_claims", "misleading claims") },
  { id: "testimonial_phrases", guardrail: "no_fake_testimonials", stage: "after", run: phraseCheck("fake_testimonials", "testimonial-like lines") },
  { id: "impersonation_phrases", guardrail: "no_impersonation", stage: "after", run: phraseCheck("impersonation", "impersonation") },
  { id: "unsafe_phrases", guardrail: "safe_content", stage: "after", run: phraseCheck("unsafe_content", "unsafe advice") },
  {
    id: "brand_banned_words",
    guardrail: "brand_voice_check",
    stage: "after",
    run: ({ texts, brain }) => {
      if (!brain) return { status: "note", message: "No Brand Brain, so the voice was not checked." };
      const found = findPhrases(texts, { phrases: brain.dos_donts.bannedWords });
      return found.length
        ? { status: "fail", message: "Uses words the brand never uses.", findings: found }
        : { status: "pass", message: "None of the brand's banned words." };
    },
  },
  {
    id: "brand_fit",
    guardrail: "brand_voice_check",
    stage: "after",
    run: ({ texts, brain }) => {
      if (!brain) return { status: "note", message: "No Brand Brain, so brand fit was not read." };
      const fit = brandFit(texts, brain);
      if (fit.flags.length) {
        return { status: "fail", message: `Brand fit ${fit.score}. Breaks ${fit.flags.length} of the brand's rules.`, findings: fit.flags.map(describeFlag), score: fit.score };
      }
      if (fit.similarity === null) return { status: "pass", message: `Brand fit ${fit.score}. No sample lines to compare the voice with yet.`, score: fit.score };
      if (fit.similarity < LOW_SIMILARITY) {
        return { status: "note", message: `Brand fit ${fit.score}. Reads unlike the voice's sample lines.`, findings: [`Closest sample line: "${fit.closest}"`], score: fit.score };
      }
      return { status: "pass", message: `Brand fit ${fit.score}. Close to the voice's sample lines.`, findings: [`Closest sample line: "${fit.closest}"`], score: fit.score };
    },
  },
  {
    id: "specific_to_input",
    guardrail: "specificity_check",
    stage: "after",
    run: ({ spec, inputs, texts, output }) => {
      const findings: string[] = [];
      // Items with fields repeat by design ("type: hashtag" on several items), so they are compared as whole items.
      const units =
        output.kind === "list" && output.items.some((it) => typeof it !== "string")
          ? output.items.map((it) => (typeof it === "string" ? it : Object.values(it).join(" | ")))
          : texts;
      const source = spec.inputs
        .filter((i) => i.type === "text" || i.type === "long_text")
        .map((i) => inputs[i.key])
        .filter((v): v is string => typeof v === "string");
      const anchors = new Set(source.flatMap(contentWords));
      if (anchors.size && !texts.some((t) => contentWords(t).some((w) => anchors.has(w)))) {
        findings.push("Nothing in the output names anything from the user's input.");
      }
      const seen = new Set<string>();
      for (const t of units) {
        const k = normalize(t).trim();
        if (seen.has(k)) findings.push(`Repeated: "${t}"`);
        seen.add(k);
      }
      return findings.length
        ? { status: "fail", message: "The draft could be about anyone.", findings }
        : { status: "pass", message: "Anchored to the input, no repeats." };
    },
  },
  {
    id: "platform_lengths",
    guardrail: "platform_policy",
    stage: "after",
    run: ({ output }) => {
      const findings: string[] = [];
      if (output.kind === "caption_set") {
        for (const c of output.captions) {
          const max = PLATFORM_LIMITS[c.platform]?.maxChars;
          c.variants.forEach((v, i) => {
            if (max && v.length > max) findings.push(`${c.platform} caption ${i + 1} is ${v.length} characters; ${c.platform} allows ${max}.`);
          });
        }
      }
      if (output.kind === "post_set") {
        for (const p of output.posts.filter((p) => p.format === "thread")) {
          p.parts.forEach((t, i) => {
            if (t.length > PLATFORM_LIMITS.x.maxChars) findings.push(`Thread post ${i + 1} is ${t.length} characters; X allows ${PLATFORM_LIMITS.x.maxChars}.`);
          });
        }
      }
      return findings.length
        ? { status: "fail", message: "Over a platform limit.", findings }
        : { status: "pass", message: "Inside every platform limit." };
    },
  },
  {
    id: "ai_label",
    guardrail: "ai_disclosure",
    stage: "after",
    run: () => ({ status: "note", message: "Label this as AI-generated where the platform asks for it." }),
  },
  {
    // Phase 18: hate, harassment, sexual content and unsafe advice, plus the agent's own blocked phrases, on every draft.
    id: "content_safety",
    guardrail: "safe_content",
    stage: "after",
    always: true,
    run: ({ texts, spec }) => {
      const found = screen({ output: texts.join("\n") }, { where: "output", extra: spec.safety?.block }).findings.filter((f) => f.category === "custom" || CATEGORY_INFO[f.category].hard);
      return found.length
        ? { status: "fail", message: "Breaks WOVI's content rules.", findings: found.map((f) => `${labelFor(f.category)}: "${f.match}"`) }
        : { status: "pass", message: "Keeps WOVI's content rules." };
    },
  },
  {
    // Phase 18: music comes from the platforms' own libraries. A draft that names a copyrighted song goes to a person.
    id: "music_rights",
    guardrail: "platform_policy",
    stage: "after",
    always: true,
    run: ({ texts }) => {
      const found = screen({ output: texts.join("\n") }, { where: "output" }).findings.filter((f) => f.category === "copyrighted_music");
      return found.length
        ? { status: "fail", message: "Names a copyrighted song. Pick a sound from the platform's own library instead.", findings: found.map((f) => f.match) }
        : { status: "pass", message: "No copyrighted song named." };
    },
  },
  {
    id: "rights_confirmation",
    guardrail: "rights_confirmed",
    stage: "before",
    run: ({ confirmations }) =>
      confirmations.rights === true
        ? { status: "pass", message: "The user confirmed they own or may use this content." }
        : { status: "fail", message: "Confirm you own this content or have the rights to use it (confirmations.rights)." },
  },
  {
    id: "voice_consent_confirmation",
    guardrail: "voice_consent",
    stage: "before",
    run: ({ confirmations }) =>
      confirmations.voiceConsent === true
        ? { status: "pass", message: "Voice consent is confirmed." }
        : { status: "fail", message: "A real person's voice needs documented consent (confirmations.voiceConsent)." },
  },
];

/** Guardrails in the catalog with no check. Should be empty; a test checks it. */
export function guardrailsWithoutCheck(): string[] {
  return GUARDRAIL_IDS.filter((g) => !GUARDRAIL_CHECKS.some((c) => c.guardrail === g));
}

function results(checks: GuardrailCheck[], run: (c: GuardrailCheck) => Outcome): CheckResult[] {
  return checks.map((c) => ({ guardrail: c.guardrail, check: c.id, ...run(c) }));
}

export function runBeforeChecks(ctx: BeforeContext): CheckResult[] {
  const checks = GUARDRAIL_CHECKS.filter((c) => c.stage === "before" && (c.always || ctx.spec.guardrails.includes(c.guardrail)));
  return results(checks, (c) => (c as Extract<GuardrailCheck, { stage: "before" }>).run(ctx));
}

export function runAfterChecks(ctx: Omit<AfterContext, "texts">): CheckResult[] {
  const full: AfterContext = { ...ctx, texts: outputTexts(ctx.output) };
  const declared = GUARDRAIL_CHECKS.filter((c) => c.stage === "after" && !c.always && ctx.spec.guardrails.includes(c.guardrail));
  // The platform's own checks (phase 18) run on every agent and are recorded when they find something.
  const always = GUARDRAIL_CHECKS.filter((c) => c.stage === "after" && c.always);
  const run = (c: GuardrailCheck) => (c as Extract<GuardrailCheck, { stage: "after" }>).run(full);
  return [...results(declared, run), ...results(always, run).filter((r) => r.status !== "pass")];
}
