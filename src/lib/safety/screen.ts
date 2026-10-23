/**
 * Reads text against the content rules (rules.ts): a request before it runs,
 * and a draft after the model writes it. Pure and client-safe.
 */
import { CATEGORY_INFO, SAFETY_RULES, ruleReads, type SafetyCategory, type SafetyRule } from "./rules";

export type SafetyFinding = {
  category: SafetyCategory | "custom";
  rule: string;
  /** The input key the text came from, or "output". */
  field: string;
  /** What matched, as written. */
  match: string;
};

export type Screening = { blocked: boolean; findings: SafetyFinding[] };

/** Curly quotes to straight ones, keeping the length so a match points at the text as written. */
const straighten = (s: string) => s.replace(/[‘’]/g, "'");

const compiled = new Map<string, RegExp>();
function re(rule: SafetyRule): RegExp {
  let r = compiled.get(rule.id);
  if (!r) {
    r = new RegExp(rule.pattern, "gi");
    compiled.set(rule.id, r);
  }
  r.lastIndex = 0;
  return r;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The first match of a rule in a text that passes its name checks, or null. */
function matchRule(rule: SafetyRule, text: string): string | null {
  const r = re(rule);
  let m: RegExpExecArray | null;
  while ((m = r.exec(text))) {
    if (m[0].length === 0) {
      r.lastIndex++;
      continue;
    }
    const name = m[1];
    if (rule.properName && name !== undefined) {
      if (!/^[A-Z0-9]/.test(name)) continue;
      if (rule.exceptNames && new RegExp(rule.exceptNames, "i").test(name)) continue;
    }
    return m[0].trim();
  }
  return null;
}

/** Plain phrases an agent's spec adds (`safety.block`), matched on word boundaries. */
function matchPhrase(phrase: string, text: string): string | null {
  const p = phrase.trim();
  if (!p) return null;
  const m = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRe(p)})($|[^\\p{L}\\p{N}])`, "iu").exec(text);
  return m ? m[2] : null;
}

/**
 * Reads named texts (input key to value) and returns every finding. `where`
 * picks the rules that read requests or drafts; `onlyHard` keeps the hard
 * categories (the ones that withhold a draft).
 */
export function screen(texts: Record<string, string>, opts: { where: "request" | "output"; extra?: readonly string[]; onlyHard?: boolean } = { where: "request" }): Screening {
  const findings: SafetyFinding[] = [];
  const rules = SAFETY_RULES.filter((r) => ruleReads(r, opts.where) && (!opts.onlyHard || CATEGORY_INFO[r.category].hard));
  for (const [field, raw] of Object.entries(texts)) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const text = straighten(raw);
    const seen = new Set<string>();
    for (const rule of rules) {
      if (seen.has(rule.category)) continue;
      const match = matchRule(rule, text);
      if (match) {
        seen.add(rule.category);
        findings.push({ category: rule.category, rule: rule.id, field, match });
      }
    }
    for (const phrase of opts.extra ?? []) {
      const match = matchPhrase(phrase, text);
      if (match) findings.push({ category: "custom", rule: `custom:${phrase.toLowerCase()}`, field, match });
    }
  }
  return { blocked: findings.length > 0, findings };
}

/** The refusal for one finding, in plain words. */
export function refusalFor(f: Pick<SafetyFinding, "category" | "match">): string {
  if (f.category === "custom") return `This agent does not take requests about "${f.match}".`;
  return CATEGORY_INFO[f.category].refusal;
}

/** The label for one finding's category. */
export function labelFor(category: SafetyFinding["category"]): string {
  return category === "custom" ? "Blocked for this agent" : CATEGORY_INFO[category].label;
}

/**
 * One line per finding, as "field: refusal (found: ...)", the way the engine
 * lists input problems, so the form can put each one under its field.
 */
export function refusalLines(findings: SafetyFinding[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const f of findings) {
    const key = `${f.field}:${f.category}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`${f.field}: ${refusalFor(f)} (Found: "${f.match.slice(0, 60)}")`);
  }
  return out;
}
