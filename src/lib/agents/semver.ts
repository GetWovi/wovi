/** Plain MAJOR.MINOR.PATCH versions. No pre-release tags; agents do not need them yet. */

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export type Bump = "major" | "minor" | "patch";

export function isSemver(v: string): boolean {
  return SEMVER.test(v);
}

function parts(v: string): [number, number, number] {
  const m = SEMVER.exec(v);
  if (!m) throw new Error(`"${v}" is not a version like 1.0.0`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Negative when a < b, zero when equal, positive when a > b. */
export function compareSemver(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

export function bumpSemver(v: string, bump: Bump): string {
  const [ma, mi, pa] = parts(v);
  if (bump === "major") return `${ma + 1}.0.0`;
  if (bump === "minor") return `${ma}.${mi + 1}.0`;
  return `${ma}.${mi}.${pa + 1}`;
}

export function highestSemver(versions: string[]): string | undefined {
  return [...versions].sort(compareSemver).at(-1);
}
