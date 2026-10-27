/**
 * Minimal motion: real line animation in the style Funkai pointed to (a calm
 * dark frame, a short line on top, a shape that draws itself, a glowing dot
 * that travels along it, a hand that touches it, and the answer below).
 *
 * Every frame is plain SVG made here from the scene's few fields: the model
 * only chooses the words and the shape, it never writes code. The same
 * function draws the preview on the page and the frames on the server.
 */

export const SHAPES = ["circle", "orbit", "square", "triangle", "lines", "wave", "rays", "dots"] as const;
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
      return { pts: poly([[cx - r, cy - r], [cx + r, cy - r], [cx + r, cy + r], [cx - r, cy + r]]), dotted: false };
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

/** A pointing hand, drawn as an outline (24 by 24 units), so it reads as a touch on the shape. */
const HAND = "M9 11V4.5a1.5 1.5 0 0 1 3 0V10 M12 9.5a1.5 1.5 0 0 1 3 0V11 M15 10.5a1.5 1.5 0 0 1 3 0V12 M18 12a1.5 1.5 0 0 1 3 0v3.5a6.5 6.5 0 0 1-6.5 6.5h-1.6a6 6 0 0 1-4.6-2.2L4.6 15.6a1.6 1.6 0 0 1 2.4-2.1L9 15.5V11";

/**
 * One frame of one scene at progress p (0 to 1). The top line fades in, the
 * shape draws itself, the dot rides it with the hand close behind, the
 * bottom line answers, and the frame fades out at the very end.
 */
export function sceneSvg(scene: MotionScene, p: number, look: MotionLook, opts: { fadeOut?: boolean } = {}): string {
  const { width: W, height: H, bg, fg, accent, font } = look;
  const s = Math.min(W, H);
  const cx = W / 2;
  const cy = H * 0.5;
  const r = s * 0.2;
  const shape = shapePoints(scene.shape, cx, cy, r);
  const draw = span(p, 0.08, 0.55);
  const ride = span(p, 0.3, 0.92);
  const topIn = span(p, 0, 0.12);
  const bottomIn = span(p, 0.45, 0.62);
  const out = opts.fadeOut === false ? 1 : 1 - span(p, 0.94, 1);
  const stroke = Math.max(2, s * 0.0028);
  const fontSize = s * 0.038;
  const { drawn } = partial(shape.pts, draw);
  const { at } = partial(shape.pts, scene.shape === "lines" || scene.shape === "wave" || scene.shape === "dots" ? ride : (0.15 + ride) % 1);
  const dash = shape.dotted ? `stroke-dasharray="${(stroke * 0.4).toFixed(1)} ${(stroke * 3.6).toFixed(1)}" stroke-linecap="round"` : `stroke-linecap="round" stroke-linejoin="round"`;
  const extra = (shape.extra ?? [])
    .map((seg) => `<path d="${path(seg)}" stroke="${fg}" stroke-width="${scene.shape === "dots" ? stroke * 3.2 : stroke}" stroke-linecap="round" opacity="${span(p, 0.4, 0.6).toFixed(3)}"/>`)
    .join("");
  const dotOn = ride > 0 && ride < 1 ? 1 : span(p, 0.25, 0.32);
  const hs = s * 0.075;
  const hand = `<g transform="translate(${(at[0] + hs * 0.05).toFixed(1)} ${(at[1] - hs * 0.08).toFixed(1)}) scale(${(hs / 24).toFixed(3)})" opacity="${(span(p, 0.2, 0.3) * (1 - span(p, 0.86, 0.94))).toFixed(3)}"><path d="${HAND}" fill="${bg}" stroke="${fg}" stroke-width="${(1.4).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  const text = (t: string, y: number, o: number) => (t ? `<text x="${cx}" y="${y.toFixed(1)}" text-anchor="middle" font-family="${font}" font-size="${fontSize.toFixed(1)}" fill="${fg}" opacity="${o.toFixed(3)}">${escapeXml(t)}</text>` : "");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><radialGradient id="g"><stop offset="0" stop-color="${accent}" stop-opacity="0.9"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="${bg}"/>
<g opacity="${out.toFixed(3)}">
${text(scene.top, cy - r * 1.75, topIn)}
<path d="${path(drawn)}" fill="none" stroke="${fg}" stroke-width="${(shape.dotted ? stroke * 1.7 : stroke).toFixed(2)}" ${dash}/>
${extra}
<circle cx="${at[0].toFixed(1)}" cy="${at[1].toFixed(1)}" r="${(s * 0.028).toFixed(1)}" fill="url(#g)" opacity="${dotOn.toFixed(3)}"/>
<circle cx="${at[0].toFixed(1)}" cy="${at[1].toFixed(1)}" r="${(s * 0.0065).toFixed(1)}" fill="#fff" opacity="${dotOn.toFixed(3)}"/>
${hand}
${text(scene.bottom, cy + r * 1.95, bottomIn)}
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
