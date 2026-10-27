/**
 * Minimal motion: real line animation in the style Funkai pointed to (a calm
 * dark frame, a short line on top, a shape that draws itself, a glowing dot
 * that travels along it, a hand that touches it, and the answer below).
 *
 * Every frame is plain SVG made here from the scene's few fields: the model
 * only chooses the words and the shape, it never writes code. The same
 * function draws the preview on the page and the frames on the server.
 */

export const SHAPES = ["circle", "orbit", "square", "triangle", "lines", "wave", "flow", "rays", "dots", "row"] as const;
/** Closed shapes turn into each other between scenes; open ones hand over with a fade. */
const CLOSED: readonly Shape[] = ["circle", "orbit", "square", "triangle", "rays"];
export type Shape = (typeof SHAPES)[number];

export type MotionScene = { top: string; bottom: string; shape: Shape; seconds: number };
export type MotionLook = { width: number; height: number; bg: string; fg: string; accent: string; font: string };

type Pt = [number, number];
/** Lifts the pen: the next point starts a new line, and the dot jumps there. */
const BREAK: Pt = [NaN, NaN];
const isBreak = (p: Pt) => Number.isNaN(p[0]);

/** A shape as one path of points, centred on (cx, cy) with radius r, so the dot can ride it at any fraction. */
function shapePoints(shape: Shape, cx: number, cy: number, r: number): { pts: Pt[]; dotted: boolean; extra?: Pt[][] } {
  const circle = (n = 120): Pt[] => Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.sin((i / n) * Math.PI * 2), cy - r * Math.cos((i / n) * Math.PI * 2)]);
  const poly = (corners: Pt[], per = 30): Pt[] => {
    const out: Pt[] = [];
    corners.forEach((a, i) => {
      const b = corners[(i + 1) % corners.length];
      for (let k = 0; k < per; k++) out.push([a[0] + ((b[0] - a[0]) * k) / per, a[1] + ((b[1] - a[1]) * k) / per]);
    });
    out.push(corners[0]);
    return out;
  };
  switch (shape) {
    case "orbit":
      return { pts: circle(), dotted: true };
    case "square":
      return { pts: poly([[cx, cy - r], [cx + r, cy - r], [cx + r, cy + r], [cx - r, cy + r], [cx - r, cy - r]]), dotted: false };
    case "triangle":
      return { pts: poly([[cx, cy - r * 1.05], [cx + r * 0.95, cy + r * 0.75], [cx - r * 0.95, cy + r * 0.75]]), dotted: false };
    case "lines": {
      // Three lines written left to right, like a text being drafted.
      const rows = [-0.35, 0, 0.35].map((dy, i) => [cx - r, cy + dy * r, cx + r * (i === 2 ? 0.2 : i === 1 ? 0.6 : 1)] as const);
      const pts: Pt[] = [];
      rows.forEach(([x0, y, x1], i) => {
        if (i) pts.push(BREAK);
        for (let k = 0; k <= 40; k++) pts.push([x0 + ((x1 - x0) * k) / 40, y]);
      });
      return { pts, dotted: false };
    }
    case "wave":
      return { pts: Array.from({ length: 121 }, (_, i) => [cx - r * 1.3 + (i / 120) * r * 2.6, cy + Math.sin((i / 120) * Math.PI * 3) * r * 0.35] as Pt), dotted: false };
    case "flow": {
      // Many flowing lines, like water or time: the dot rides the middle one.
      const line = (dy: number, phase: number): Pt[] => Array.from({ length: 81 }, (_, i) => [cx - r * 1.6 + (i / 80) * r * 3.2, cy + dy + Math.sin((i / 80) * Math.PI * 2 + phase) * r * 0.18 * (1 - Math.abs(dy) / (r * 1.4))] as Pt);
      const rows = [-0.9, -0.6, -0.3, 0.3, 0.6, 0.9].map((k, i) => line(k * r, i * 0.7));
      return { pts: line(0, 0), dotted: false, extra: rows };
    }
    case "rays": {
      const pts = circle();
      const extra = Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        return [[cx + Math.cos(a) * r * 0.2, cy + Math.sin(a) * r * 0.2], [cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62]] as Pt[];
      });
      return { pts, dotted: true, extra };
    }
    case "dots": {
      const pts: Pt[] = [];
      for (let k = 0; k <= 90; k++) pts.push([cx - r * 1.2 + (k / 90) * r * 2.4, cy]);
      const extra = [-1, 0, 1].map((i) => [[cx + i * r * 0.9 - 1, cy], [cx + i * r * 0.9 + 1, cy]] as Pt[]);
      return { pts, dotted: false, extra };
    }
    default:
      return { pts: circle(), dotted: false };
  }
}

/** n points spread evenly along the path's length, starting from the top of the shape, for turning one shape into another. */
function resample(pts: Pt[], n: number): Pt[] {
  const real = pts.filter((p) => !isBreak(p));
  const d = cumulative(real);
  const total = d[d.length - 1] || 1;
  const out: Pt[] = [];
  let j = 1;
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * total;
    while (j < d.length - 1 && d[j] < t) j++;
    const k = (t - d[j - 1]) / Math.max(1e-6, d[j] - d[j - 1]);
    out.push([real[j - 1][0] + (real[j][0] - real[j - 1][0]) * k, real[j - 1][1] + (real[j][1] - real[j - 1][1]) * k]);
  }
  return out;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
/** Slow in, slow out. */
const ease = (n: number) => {
  const t = clamp01(n);
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
};
const span = (p: number, a: number, b: number) => ease((p - a) / (b - a));

function cumulative(pts: Pt[]): number[] {
  const d = [0];
  for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + (isBreak(pts[i]) || isBreak(pts[i - 1]) ? 0 : Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])));
  return d;
}

/** The points up to a fraction of the path's length, and where that fraction lands. */
function partial(pts: Pt[], f: number): { drawn: Pt[]; at: Pt } {
  const d = cumulative(pts);
  const target = d[d.length - 1] * clamp01(f);
  const drawn: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (d[i] >= target && !isBreak(pts[i]) && !isBreak(pts[i - 1])) {
      const k = (target - d[i - 1]) / Math.max(1e-6, d[i] - d[i - 1]);
      const at: Pt = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
      drawn.push(at);
      return { drawn, at };
    }
    drawn.push(pts[i]);
  }
  return { drawn, at: lastReal(pts) };
}

/** The last real point, for where the dot sits. */
function lastReal(pts: Pt[]): Pt {
  for (let i = pts.length - 1; i >= 0; i--) if (!isBreak(pts[i])) return pts[i];
  return [0, 0];
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** Points as an SVG path; a break starts a new line. */
const path = (pts: Pt[]) => {
  let d = "";
  let pen = false;
  for (const p of pts) {
    if (isBreak(p)) {
      pen = false;
      continue;
    }
    d += `${pen ? " L" : " M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    pen = true;
  }
  return d.trim();
};

/** The hand, drawn as outlines on a 24 by 24 grid: pointing, open (reaching for the dot) and closed (holding it). */
const HANDS = {
  point: "M9 11V4.5a1.5 1.5 0 0 1 3 0V10 M12 9.5a1.5 1.5 0 0 1 3 0V11 M15 10.5a1.5 1.5 0 0 1 3 0V12 M18 12a1.5 1.5 0 0 1 3 0v3.5a6.5 6.5 0 0 1-6.5 6.5h-1.6a6 6 0 0 1-4.6-2.2L4.6 15.6a1.6 1.6 0 0 1 2.4-2.1L9 15.5V11",
  open: "M8 13V6a1.5 1.5 0 0 1 3 0v5.5 M11 11V4.5a1.5 1.5 0 0 1 3 0V11 M14 11V5.5a1.5 1.5 0 0 1 3 0V12 M17 12V8.5a1.5 1.5 0 0 1 3 0v6a7.5 7.5 0 0 1-7.5 7.5h-1a7 7 0 0 1-5.6-2.8L3.6 15.3a1.6 1.6 0 0 1 2.5-2L8 15.2V13",
  hold: "M7.5 12a2 2 0 0 1 4 0v1 M11.5 11.5a2 2 0 0 1 4 0v1.5 M15.5 12a2 2 0 0 1 4 0v3a7 7 0 0 1-7 7h-1.5a6 6 0 0 1-6-6v-2.2a2 2 0 0 1 3.3-1.5 M7.5 12v2.5",
} as const;

export type SceneContext = {
  /** The scene before: its shape turns into this one, its words hand over. */
  prev?: MotionScene | null;
  /** The scene after: the words that stay are not faded out. */
  next?: MotionScene | null;
  /** For the "row" finale: the shapes the video used, side by side. */
  row?: Shape[];
  /** False in the page's preview: the frame never fades. */
  fadeOut?: boolean;
};

/**
 * One frame of one scene at progress p (0 to 1), in the context of the
 * scenes around it: the shape before turns into this one (or fades out while
 * this one draws itself), the top line stays when it is the same, the dot
 * rides the shape with the hand reaching, pointing and holding, the answer
 * comes in below, and only the last scene fades to the background.
 */
export function sceneSvg(scene: MotionScene, p: number, look: MotionLook, ctx: SceneContext = {}): string {
  const { width: W, height: H, bg, fg, accent, font } = look;
  const s = Math.min(W, H);
  const cx = W / 2;
  const cy = H * 0.5;
  const r = s * 0.2;
  const stroke = Math.max(2, s * 0.0028);
  const fontSize = s * 0.038;
  const prev = ctx.prev ?? null;
  const next = ctx.next ?? null;
  const last = !next && ctx.fadeOut !== false;
  const out = last ? 1 - span(p, 0.94, 1) : 1;
  const parts: string[] = [];
  const line = (pts: Pt[], o: number, dotted: boolean, width = stroke) =>
    o > 0.001 ? `<path d="${path(pts)}" fill="none" stroke="${fg}" stroke-width="${(dotted ? width * 1.7 : width).toFixed(2)}" opacity="${o.toFixed(3)}" ${dotted ? `stroke-dasharray="${(width * 0.4).toFixed(1)} ${(width * 3.6).toFixed(1)}" stroke-linecap="round"` : `stroke-linecap="round" stroke-linejoin="round"`}/>` : "";

  let at: Pt;
  let ride: number;
  if (scene.shape === "row") {
    // The finale: every shape the video used, side by side, joined by one line that the dot rides across.
    const row = (ctx.row?.length ? ctx.row : (["lines", "orbit", "triangle"] as Shape[])).filter((x) => x !== "row").slice(0, 3);
    const gap = (r * 2.4) / Math.max(1, row.length - 1 || 1);
    const x0 = cx - (gap * (row.length - 1)) / 2;
    row.forEach((sh, i) => {
      const mini = shapePoints(sh, x0 + gap * i, cy, r * 0.32);
      const o = span(p, 0.04 + i * 0.1, 0.3 + i * 0.1);
      parts.push(line(mini.pts, o, mini.dotted, stroke * 0.9));
      for (const seg of mini.extra ?? []) parts.push(line(seg, o * 0.8, false, stroke * 0.8));
      parts.push(`<circle cx="${(x0 + gap * i).toFixed(1)}" cy="${cy.toFixed(1)}" r="${(s * 0.006).toFixed(1)}" fill="${accent}" opacity="${o.toFixed(3)}"/>`);
    });
    const track: Pt[] = Array.from({ length: 61 }, (_, i) => [cx - r * 1.9 + (i / 60) * r * 3.8, cy] as Pt);
    parts.push(line(partial(track, span(p, 0.42, 0.68)).drawn, 1, false));
    ride = span(p, 0.5, 0.95);
    at = partial(track, ride).at;
  } else {
    const shape = shapePoints(scene.shape, cx, cy, r);
    const open = scene.shape === "lines" || scene.shape === "wave" || scene.shape === "dots" || scene.shape === "flow";
    const morph = prev && prev.shape !== "row" && CLOSED.includes(prev.shape) && CLOSED.includes(scene.shape) ? span(p, 0, 0.3) : null;
    if (morph !== null && morph < 1) {
      // The shape before turns into this one.
      const a = resample(shapePoints(prev!.shape, cx, cy, r).pts, 180);
      const b = resample(shape.pts, 180);
      parts.push(line(a.map((q, i) => [q[0] + (b[i][0] - q[0]) * morph, q[1] + (b[i][1] - q[1]) * morph] as Pt), 1, morph > 0.5 ? shape.dotted : shapePoints(prev!.shape, cx, cy, r).dotted));
    } else {
      if (prev && morph === null && prev.shape !== "row") {
        // An open shape before: it fades while this one draws itself.
        const old = shapePoints(prev.shape, cx, cy, r);
        const o = 1 - span(p, 0, 0.18);
        parts.push(line(old.pts, o, old.dotted));
        for (const seg of old.extra ?? []) parts.push(line(seg, o, false));
      }
      const draw = morph !== null ? 1 : span(p, 0.08, 0.55);
      parts.push(line(partial(shape.pts, draw).drawn, 1, shape.dotted));
    }
    const extraIn = span(p, 0.35, 0.6);
    for (const [i, seg] of (shape.extra ?? []).entries()) {
      const w = scene.shape === "dots" ? stroke * 3.2 : stroke;
      parts.push(scene.shape === "flow" ? line(partial(seg, span(p, 0.12 + i * 0.05, 0.55 + i * 0.05)).drawn, 0.55, false) : line(seg, extraIn, false, w));
    }
    ride = span(p, 0.3, 0.92);
    at = partial(shape.pts, open ? ride : (0.15 + ride) % 1).at;
  }

  const dotOn = ride > 0 && ride < 1 ? 1 : span(p, 0.25, 0.32);
  const hs = s * 0.075;
  const pose = p < 0.34 ? "open" : p > 0.8 ? "hold" : "point";
  const handOpacity = span(p, 0.18, 0.28) * (1 - span(p, 0.9, 0.97));
  const hand = handOpacity > 0.001 ? `<g transform="translate(${(at[0] + hs * 0.05).toFixed(1)} ${(at[1] - hs * 0.08).toFixed(1)}) scale(${(hs / 24).toFixed(3)})" opacity="${handOpacity.toFixed(3)}"><path d="${HANDS[pose]}" fill="${bg}" stroke="${fg}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></g>` : "";

  // Words: a top line that stays the same is never faded; the others hand over.
  const text = (t: string, y: number, o: number) => (t && o > 0.001 ? `<text x="${cx}" y="${y.toFixed(1)}" text-anchor="middle" font-family="${font}" font-size="${fontSize.toFixed(1)}" fill="${fg}" opacity="${o.toFixed(3)}">${escapeXml(t)}</text>` : "");
  const topY = cy - r * 1.75;
  const bottomY = cy + r * 1.95;
  const sameTop = prev?.top === scene.top;
  const topIn = sameTop ? 1 : span(p, 0.06, 0.16);
  const topOut = next && next.top !== scene.top ? 1 - span(p, 0.93, 1) : 1;
  const bottomIn = span(p, 0.45, 0.62) * (next ? 1 - span(p, 0.88, 0.97) : 1);
  const oldTop = prev && !sameTop ? text(prev.top, topY, 1 - span(p, 0, 0.06)) : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><radialGradient id="g"><stop offset="0" stop-color="${accent}" stop-opacity="0.9"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="${bg}"/>
<g opacity="${out.toFixed(3)}">
${oldTop}
${text(scene.top, topY, topIn * topOut)}
${parts.join("\n")}
<circle cx="${at[0].toFixed(1)}" cy="${at[1].toFixed(1)}" r="${(s * 0.028).toFixed(1)}" fill="url(#g)" opacity="${dotOn.toFixed(3)}"/>
<circle cx="${at[0].toFixed(1)}" cy="${at[1].toFixed(1)}" r="${(s * 0.0065).toFixed(1)}" fill="#fff" opacity="${dotOn.toFixed(3)}"/>
${hand}
${text(scene.bottom, bottomY, bottomIn)}
</g>
</svg>`;
}

/** The colours per vibe, with the brand's own accent when it has one. */
export function motionLook(vibe: string, aspect: string, accent?: string): MotionLook {
  const size: Record<string, [number, number]> = { "9:16": [1080, 1920], "1:1": [1080, 1080], "16:9": [1920, 1080] };
  const [width, height] = size[aspect] ?? size["9:16"];
  const bg = vibe === "premium" || vibe === "bold" ? "#000000" : "#0B1230";
  return { width, height, bg, fg: "#F5F2EA", accent: accent ?? (vibe === "calm" ? "#9DB7FF" : "#FF7A3D"), font: "Outfit" };
}
