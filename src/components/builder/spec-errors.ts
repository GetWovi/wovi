/**
 * The validator's messages, mapped to the fields they are about. Messages
 * look like "inputs[2].limits.maxLength: message"; a top-level message has
 * no path.
 */
export type SpecIssue = { path: string; message: string };

export function parseIssues(errors: string[]): SpecIssue[] {
  return errors.map((e) => {
    const m = /^([a-zA-Z_][\w.[\]]*): ([\s\S]*)$/.exec(e);
    return m ? { path: m[1], message: m[2] } : { path: "", message: e };
  });
}

/** Messages exactly at a path. */
export function errorAt(issues: SpecIssue[], path: string): string | undefined {
  const found = issues.filter((i) => i.path === path).map((i) => i.message);
  return found.length ? found.join(" ") : undefined;
}

/** How many messages sit at or under a path. */
export function errorsUnder(issues: SpecIssue[], prefix: string): number {
  return issues.filter((i) => i.path === prefix || i.path.startsWith(`${prefix}.`) || i.path.startsWith(`${prefix}[`)).length;
}

/** Messages under a path that no field shows exactly, for a section's own list. */
export function looseErrors(issues: SpecIssue[], prefix: string, shown: string[]): string[] {
  return issues
    .filter((i) => (i.path === prefix || i.path.startsWith(`${prefix}.`) || i.path.startsWith(`${prefix}[`)) && !shown.includes(i.path))
    .map((i) => (i.path === prefix ? i.message : `${i.path}: ${i.message}`));
}
