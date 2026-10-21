/**
 * WOVI brand geometry. Every logo and mascot drawing is built from these
 * numbers, so the React components and the exported SVG files always match.
 * Units are SVG user units; the mascot lives in a 140 x 140 box.
 */

export const COLORS = {
  night: "#0B1230",
  cream: "#FFF4DC",
  blaze: "#FF5A1F",
  cobalt: "#1F4DFF",
  cobaltGlow: "#7C97FF",
  surfaceNight: "#141D44",
  lineNight: "#2A3668",
  mutedNight: "#A9B3D9",
  lineLight: "#E8D9B5",
  mutedLight: "#3A4468",
} as const;

export type Ink = "cream" | "night";

/** The mascot box. The w sits in the middle with room for limbs. */
export const MASCOT_BOX = 140;

/** The w letterform: five points joined by a thick round stroke. */
export const W_POINTS: ReadonlyArray<readonly [number, number]> = [
  [36, 48],
  [52, 90],
  [70, 70],
  [88, 90],
  [104, 48],
];
export const W_STROKE = 30;
export const W_PATH = W_POINTS.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");

/** Visible bounds of the w (stroke included). */
export const W_BOUNDS = { x: 21, y: 33, w: 98, h: 72 };

/** Face parts, drawn in the ink colour. */
export const FACE = {
  stroke: 3.6,
  eyeLeft: "M56 68 Q62.5 59.5 69 68",
  eyeRight: "M71 68 Q77.5 59.5 84 68",
  /** Relaxed closed eyes for sleeping. */
  eyeLeftSleep: "M56 65 Q62.5 70.5 69 65",
  eyeRightSleep: "M71 65 Q77.5 70.5 84 65",
  mouth: "M63 78 Q70 85.5 77 78",
  /** Open, happy mouth for celebrating. */
  mouthOpen: "M62 77 Q70 90 78 77 Z",
  cheekLeft: { cx: 53, cy: 75, r: 4.5 },
  cheekRight: { cx: 87, cy: 75, r: 4.5 },
};

export const LIMB_STROKE = 5;
export const HAND_RADIUS = 4;

/** Where limbs attach to the body. */
export const ANCHORS = {
  shoulderLeft: [34, 74],
  shoulderRight: [106, 74],
  hipLeft: [52, 100],
  hipRight: [88, 100],
} as const;

export type Pose = "standing" | "walking" | "waving" | "sleeping" | "celebrating";

export type Limb = {
  /** Path in mascot units. */
  d: string;
  /** Pivot for animation, in mascot units. */
  pivot: readonly [number, number];
  /** Position of the hand or foot cap. */
  end?: readonly [number, number];
  /** Named part so CSS can animate it. */
  part: "arm-left" | "arm-right" | "leg-left" | "leg-right";
};

export type PoseSpec = {
  limbs: Limb[];
  eyes: "smile" | "sleep";
  mouth: "smile" | "open";
};

export const POSES: Record<Pose, PoseSpec> = {
  standing: {
    eyes: "smile",
    mouth: "smile",
    limbs: [
      { part: "arm-left", d: "M34 74 L19 88", pivot: ANCHORS.shoulderLeft, end: [19, 88] },
      { part: "arm-right", d: "M106 74 L121 88", pivot: ANCHORS.shoulderRight, end: [121, 88] },
      { part: "leg-left", d: "M52 100 L52 118 M45 119 L59 119", pivot: ANCHORS.hipLeft },
      { part: "leg-right", d: "M88 100 L88 118 M81 119 L95 119", pivot: ANCHORS.hipRight },
    ],
  },
  walking: {
    eyes: "smile",
    mouth: "smile",
    limbs: [
      { part: "arm-left", d: "M34 74 L16 84", pivot: ANCHORS.shoulderLeft, end: [16, 84] },
      { part: "arm-right", d: "M106 74 L116 92", pivot: ANCHORS.shoulderRight, end: [116, 92] },
      { part: "leg-left", d: "M52 100 L45 116 M38 117 L52 117", pivot: ANCHORS.hipLeft },
      { part: "leg-right", d: "M88 100 L95 116 M88 117 L102 117", pivot: ANCHORS.hipRight },
    ],
  },
  waving: {
    eyes: "smile",
    mouth: "smile",
    limbs: [
      { part: "arm-left", d: "M34 74 L20 89", pivot: ANCHORS.shoulderLeft, end: [20, 89] },
      { part: "arm-right", d: "M106 74 L124 64 L130 46", pivot: ANCHORS.shoulderRight, end: [130, 46] },
      { part: "leg-left", d: "M52 100 L52 118 M45 119 L59 119", pivot: ANCHORS.hipLeft },
      { part: "leg-right", d: "M88 100 L88 118 M81 119 L95 119", pivot: ANCHORS.hipRight },
    ],
  },
  sleeping: {
    eyes: "sleep",
    mouth: "smile",
    limbs: [
      { part: "arm-left", d: "M34 74 L26 90", pivot: ANCHORS.shoulderLeft, end: [26, 90] },
      { part: "arm-right", d: "M106 74 L114 90", pivot: ANCHORS.shoulderRight, end: [114, 90] },
      { part: "leg-left", d: "M52 100 L52 116 M45 117 L59 117", pivot: ANCHORS.hipLeft },
      { part: "leg-right", d: "M88 100 L88 116 M81 117 L95 117", pivot: ANCHORS.hipRight },
    ],
  },
  celebrating: {
    eyes: "smile",
    mouth: "open",
    limbs: [
      { part: "arm-left", d: "M34 74 L16 64 L8 48", pivot: ANCHORS.shoulderLeft, end: [8, 48] },
      { part: "arm-right", d: "M106 74 L124 64 L132 48", pivot: ANCHORS.shoulderRight, end: [132, 48] },
      { part: "leg-left", d: "M52 100 L45 117 M38 118 L52 118", pivot: ANCHORS.hipLeft },
      { part: "leg-right", d: "M88 100 L95 117 M88 118 L102 118", pivot: ANCHORS.hipRight },
    ],
  },
};

/** Sleeping "z" marks, biggest last, drawn as thick polylines. */
export const SLEEP_Z: ReadonlyArray<{ x: number; y: number; s: number }> = [
  { x: 110, y: 44, s: 6 },
  { x: 119, y: 32, s: 8 },
  { x: 130, y: 17, s: 10 },
];

export function zPath(x: number, y: number, s: number): string {
  return `M${x} ${y} L${x + s} ${y} L${x} ${y + s} L${x + s} ${y + s}`;
}

/** Confetti for the celebrating pose: x, y, radius, colour key. */
export const CONFETTI: ReadonlyArray<{ x: number; y: number; r: number; c: "blaze" | "cobaltGlow" | "ink" }> = [
  { x: 22, y: 30, r: 3, c: "cobaltGlow" },
  { x: 40, y: 18, r: 2.5, c: "ink" },
  { x: 62, y: 14, r: 3.2, c: "blaze" },
  { x: 86, y: 12, r: 2.5, c: "cobaltGlow" },
  { x: 104, y: 22, r: 3, c: "ink" },
  { x: 122, y: 30, r: 2.5, c: "blaze" },
  { x: 12, y: 60, r: 2.5, c: "blaze" },
  { x: 130, y: 62, r: 2.5, c: "cobaltGlow" },
];

/* ------------------------------------------------------------------ */
/* Wordmark                                                            */
/* ------------------------------------------------------------------ */

/**
 * The wordmark reads "wovI": the mascot w, an o, a v and a tall capital I.
 * The letters overlap slightly so the word is one flowing line.
 */
export const WORDMARK = {
  strokeW: W_STROKE,
  strokeO: 26,
  strokeV: 28,
  strokeI: 30,
  o: { cx: 148, cy: 69, r: 37 - 13 }, // centreline radius; outer radius 37
  oOuter: 37,
  v: "M195 48 L218 90 L241 48",
  i: { x: 268, y1: 18, y2: 90 },
  /** Visible bounds of the whole word. */
  bounds: { x: 21, y: 3, w: 262, h: 102 },
  /** Clearspace on every side equals the height of the o. */
  clearspace: 74,
} as const;
