/**
 * Checks a run's form values against the agent's typed inputs before anything
 * is queued. Fills in choice and number defaults, drops empty optional values,
 * and returns every problem at once, each naming the input it is about.
 */
import type { AgentBody, AgentInput, Validation } from "@/lib/agents/spec";

/** A file the user uploaded earlier. Upload and storage are a later phase; a run only carries the reference. */
export type FileRef = { assetId: string; name: string; mimeType: string; sizeMb: number; seconds?: number };

export type RunValue = string | number | string[] | FileRef[];
export type RunInputs = Record<string, RunValue>;

const PROFILE_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;

const isEmpty = (v: unknown) =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

export function validateRunInputs(spec: Pick<AgentBody, "inputs">, raw: unknown): Validation<RunInputs> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["Inputs must be an object of form values, like { \"idea\": \"...\" }."] };
  }
  const values = raw as Record<string, unknown>;
  const errors: string[] = [];
  const out: RunInputs = {};
  const keys = spec.inputs.map((i) => i.key);

  for (const k of Object.keys(values)) {
    if (!keys.includes(k)) errors.push(`${k}: Unknown input. This agent takes: ${keys.join(", ")}.`);
  }

  for (const input of spec.inputs) {
    let value = values[input.key];
    if (isEmpty(value) && (input.type === "choice" || input.type === "number") && input.default !== undefined) {
      value = input.default;
    }
    if (isEmpty(value)) {
      if (input.required) errors.push(`${input.key}: Required.`);
      continue;
    }
    const r = checkValue(input, value);
    if (typeof r === "string") errors.push(`${input.key}: ${r}`);
    else out[input.key] = r.value;
  }

  return errors.length ? { ok: false, errors } : { ok: true, value: out };
}

/** The checked value, or a message saying what is wrong with it. */
function checkValue(input: AgentInput, value: unknown): { value: RunValue } | string {
  switch (input.type) {
    case "text":
    case "long_text": {
      if (typeof value !== "string") return "Must be text.";
      const text = value.trim();
      const { minLength, maxLength } = input.limits;
      if (minLength !== undefined && text.length < minLength) return `Must be at least ${minLength} characters (got ${text.length}).`;
      if (text.length > maxLength) return `Must be at most ${maxLength} characters (got ${text.length}).`;
      return { value: text };
    }
    case "url": {
      if (typeof value !== "string") return "Must be a link.";
      const text = value.trim();
      let url: URL;
      try {
        url = new URL(text);
      } catch {
        return "Must be a full link starting with https://.";
      }
      if (url.protocol !== "https:" && url.protocol !== "http:") return "Must be an http or https link.";
      if (text.length > 2048) return "Must be at most 2048 characters.";
      return { value: url.toString() };
    }
    case "choice": {
      const allowed = input.options.map((o) => o.value);
      const picked = input.multiple && typeof value === "string" ? [value] : value;
      if (input.multiple) {
        if (!Array.isArray(picked) || !picked.every((v) => typeof v === "string")) return "Must be a list of options.";
        const bad = picked.filter((v) => !allowed.includes(v));
        if (bad.length) return `Unknown option ${bad.map((b) => JSON.stringify(b)).join(", ")}. Pick from: ${allowed.join(", ")}.`;
        if (new Set(picked).size !== picked.length) return "Options must not repeat.";
        return { value: picked };
      }
      if (typeof picked !== "string") return "Must be one option.";
      if (!allowed.includes(picked)) return `Unknown option ${JSON.stringify(picked)}. Pick one of: ${allowed.join(", ")}.`;
      return { value: picked };
    }
    case "number": {
      const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
      if (typeof n !== "number" || !Number.isFinite(n)) return "Must be a number.";
      const { min, max, step } = input.limits;
      if (n < min || n > max) return `Must be between ${min} and ${max}.`;
      if (step !== undefined) {
        const steps = (n - min) / step;
        if (Math.abs(steps - Math.round(steps)) > 1e-9) return `Must go in steps of ${step} from ${min}.`;
      }
      return { value: n };
    }
    case "profile": {
      if (typeof value !== "string" || !PROFILE_ID.test(value)) return "Must be a Brand Brain id.";
      return { value };
    }
    case "file":
    case "image":
    case "video": {
      const files = Array.isArray(value) ? value : [value];
      if (files.length > input.limits.maxFiles) return `At most ${input.limits.maxFiles} file${input.limits.maxFiles === 1 ? "" : "s"}.`;
      const checked: FileRef[] = [];
      for (const [i, f] of files.entries()) {
        const r = checkFile(input, f);
        if (typeof r === "string") return files.length > 1 ? `File ${i + 1}: ${r}` : r;
        checked.push(r);
      }
      return { value: checked };
    }
  }
}

function checkFile(input: Extract<AgentInput, { type: "file" | "image" | "video" }>, f: unknown): FileRef | string {
  const ref = f as Partial<FileRef> | null;
  if (
    !ref ||
    typeof ref !== "object" ||
    typeof ref.assetId !== "string" ||
    !ref.assetId ||
    typeof ref.name !== "string" ||
    typeof ref.mimeType !== "string" ||
    typeof ref.sizeMb !== "number"
  ) {
    return "Must be an uploaded file with assetId, name, mimeType and sizeMb.";
  }
  if (ref.sizeMb > input.limits.maxSizeMb) return `"${ref.name}" is ${ref.sizeMb} MB; the limit is ${input.limits.maxSizeMb} MB.`;
  const mime = ref.mimeType.toLowerCase();
  if (input.type === "image" && !mime.startsWith("image/")) return `"${ref.name}" is not an image.`;
  if (input.type === "video") {
    if (!mime.startsWith("video/")) return `"${ref.name}" is not a video.`;
    if (typeof ref.seconds !== "number") return `"${ref.name}" needs its length in seconds.`;
    if (ref.seconds > input.limits.maxSeconds) return `"${ref.name}" is ${ref.seconds} seconds; the limit is ${input.limits.maxSeconds}.`;
  }
  if (input.type === "file" && !accepts(input.limits.accept, ref.name, mime)) {
    return `"${ref.name}" is not an accepted file. Accepted: ${input.limits.accept.join(", ")}.`;
  }
  const out: FileRef = { assetId: ref.assetId, name: ref.name, mimeType: ref.mimeType, sizeMb: ref.sizeMb };
  if (typeof ref.seconds === "number") out.seconds = ref.seconds;
  return out;
}

function accepts(accept: string[], name: string, mime: string): boolean {
  const lower = name.toLowerCase();
  return accept.some((a) => {
    const rule = a.toLowerCase();
    if (rule.startsWith(".")) return lower.endsWith(rule);
    if (rule.endsWith("/*")) return mime.startsWith(rule.slice(0, -1));
    return mime === rule;
  });
}
