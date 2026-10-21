/**
 * Instruction templates use {{key}} for a run input and {{brand.part}} for a
 * part of the user's Brand Brain. Whitespace inside the braces is allowed.
 */

const PLACEHOLDER = /\{\{\s*([^{}]*?)\s*\}\}/g;
const NAME = /^(brand\.)?[a-z][a-z0-9_]*$/;

export type TemplateScan = {
  /** Unique placeholder names in order of first use, for example "topic" or "brand.voice". */
  placeholders: string[];
  /** Problems with the template itself (bad names, unclosed braces). */
  problems: string[];
};

export function scanTemplate(template: string): TemplateScan {
  const placeholders: string[] = [];
  const problems: string[] = [];

  for (const match of template.matchAll(PLACEHOLDER)) {
    const name = match[1];
    if (!NAME.test(name)) {
      problems.push(`Placeholder "${match[0]}" is not a valid name. Use {{input_key}} or {{brand.part}}.`);
      continue;
    }
    if (!placeholders.includes(name)) placeholders.push(name);
  }

  const rest = template.replace(PLACEHOLDER, "");
  if (rest.includes("{{") || rest.includes("}}")) {
    problems.push("Template has an unclosed or stray {{ or }}.");
  }

  return { placeholders, problems };
}

/**
 * Replaces every placeholder in one pass with what `resolve` returns for its
 * name. One pass means a filled-in value that itself contains {{...}} is never
 * expanded again.
 */
export function fillTemplate(template: string, resolve: (name: string) => string): string {
  return template.replace(PLACEHOLDER, (_match, name: string) => resolve(name));
}
