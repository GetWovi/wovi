/**
 * WOVI brand geometry, second drawing.
 *
 * One stroke system draws the whole wordmark: a round monoline of width S on
 * an x-height of 60 units (visible top 40, baseline 100). The w is the mascot;
 * the o, v and the tall slab-serif I are drawn with the same stroke so the
 * word reads as one flowing line. Every logo and mascot file comes from here.
 */

export const COLORS = {
  night: "#0B1230",
  cream: "#FFF4DC",
  blaze: "#FF5A1F",
  blazeLight: "#FF8A5C",
  blazeDeep: "#D9430F",
  cobalt: "#1F4DFF",
  cobaltGlow: "#7C97FF",
  surfaceNight: "#141D44",
  lineNight: "#2A3668",
  mutedNight: "#A9B3D9",
  lineLight: "#E8D9B5",
  mutedLight: "#3A4468",
} as const;

export type Ink = "cream" | "night";

/** Stroke width of every letter. */
export const S = 24;

/* ------------------------------------------------------------------ */
/* The w                                                               */
/* ------------------------------------------------------------------ */

/** Centreline points of the w: outer arms splayed, inner arms steeper, peak below the x-height. */
export const W_POINTS = {
  A: [16, 52],
  B: [40, 88],
  C: [54, 63],
  D: [68, 88],
  E: [92, 52],
} as const;

const { A, B, C, D, E } = W_POINTS;
export const W_PATH = `M${A[0]} ${A[1]} L${B[0]} ${B[1]} L${C[0]} ${C[1]} L${D[0]} ${D[1]} L${E[0]} ${E[1]}`;

/** Visible bounds of the w alone (stroke included). */
export const W_BOUNDS = { x: A[0] - S / 2, y: A[1] - S / 2, w: E[0] - A[0] + S, h: B[1] - A[1] + S };

/* ------------------------------------------------------------------ */
/* The wordmark: w o v I                                               */
/* ------------------------------------------------------------------ */

const h = S / 2;
const tuck = 6; // how far the w's right arm sinks into the o
const oOuter = 32; // the o overshoots the x-height by 2 on each side
const oCx = E[0] + h - tuck + oOuter;
const oCy = 70;
const vLeft = oCx + oOuter - 2 + h; // the o touches the v
const vDx = B[0] - A[0]; // same angle as the w's outer arms
const iX = vLeft + 2 * vDx + S - 1; // the v touches the I
const iTop = 14; // cap height: visible top at 2
const serifHalf = 12;

export const WORDMARK = {
  w: W_PATH,
  o: { cx: oCx, cy: oCy, r: oOuter - h },
  v: `M${vLeft} ${A[1]} L${vLeft + vDx} ${B[1]} L${vLeft + 2 * vDx} ${A[1]}`,
  i: `M${iX} ${iTop + h} L${iX} ${B[1]}`,
  /** Slab terminals that make the capital I unmistakable. */
  serifs: `M${iX - serifHalf} ${iTop + h} L${iX + serifHalf} ${iTop + h} M${iX - serifHalf} ${B[1]} L${iX + serifHalf} ${B[1]}`,
  /** Visible bounds of the whole word. */
  bounds: { x: A[0] - h, y: iTop, w: iX + serifHalf + h - (A[0] - h), h: B[1] + h - iTop },
  /** Clearspace on every side equals the height of the o. */
  clearspace: oOuter * 2,
} as const;

/* ------------------------------------------------------------------ */
/* The mascot: Wovi                                                     */
/* ------------------------------------------------------------------ */

/** The mascot box. The w is scaled by K and placed so limbs have room. */
export const MASCOT_BOX = 160;
export const MASCOT_SCALE = 1.1;
export const MASCOT_OFFSET = {
  x: (MASCOT_BOX - W_BOUNDS.w * MASCOT_SCALE) / 2 - W_BOUNDS.x * MASCOT_SCALE,
  y: 30 - W_BOUNDS.y * MASCOT_SCALE,
};

/** Wordmark units to mascot box units. */
export function toBox([x, y]: readonly [number, number]): [number, number] {
  return [MASCOT_OFFSET.x + x * MASCOT_SCALE, MASCOT_OFFSET.y + y * MASCOT_SCALE];
}

const peak = toBox(C);
const bottomLeft = toBox(B);
const bottomRight = toBox(D);

/** Face layout in box units, centred on the peak of the w. */
export const FACE = {
  eyeY: peak[1] + 11,
  eyeDx: 9.5,
  eyeR: 5.6,
  pupilR: 3.1,
  arcHalf: 5.2,
  stroke: 3.4,
  mouthY: peak[1] + 20.5,
  mouthHalf: 6,
  cheekDx: 21,
  cheekY: peak[1] + 16,
  cheekR: 3.1,
  centerX: peak[0],
};

export const LIMB = { stroke: 5.5, hand: 4.8, foot: 7.5 };

/** Where limbs attach, in box units. */
export const ANCHORS = {
  shoulderLeft: [toBox([28, 70])[0] - 8, toBox([28, 70])[1] + 1] as [number, number],
  shoulderRight: [toBox([80, 70])[0] + 8, toBox([80, 70])[1] + 1] as [number, number],
  hipLeft: [bottomLeft[0], bottomLeft[1] + 11] as [number, number],
  hipRight: [bottomRight[0], bottomRight[1] + 11] as [number, number],
};

export type Pose = "standing" | "walking" | "waving" | "sleeping" | "celebrating";
export type Eyes = "open" | "happy" | "sleep";
export type Mouth = "smile" | "open" | "small";

export type Limb = {
  part: "arm-left" | "arm-right" | "leg-left" | "leg-right";
  d: string;
  pivot: readonly [number, number];
  /** Hand position; feet are drawn as a bar at the end of the leg. */
  hand?: readonly [number, number];
  foot?: { x: number; y: number; dir: 1 | -1 };
};

export type PoseSpec = { eyes: Eyes; mouth: Mouth; limbs: Limb[]; look?: readonly [number, number] };

const SL = ANCHORS.shoulderLeft;
const SR = ANCHORS.shoulderRight;
const HL = ANCHORS.hipLeft;
const HR = ANCHORS.hipRight;
const legLen = 17;

function armDown(side: "left" | "right"): Limb {
  const [x, y] = side === "left" ? SL : SR;
  const d = side === "left" ? -1 : 1;
  return { part: side === "left" ? "arm-left" : "arm-right", d: `M${x} ${y} L${x + 15 * d} ${y + 14}`, pivot: [x, y], hand: [x + 15 * d, y + 14] };
}
function legStraight(side: "left" | "right"): Limb {
  const [x, y] = side === "left" ? HL : HR;
  const d = side === "left" ? -1 : 1;
  return { part: side === "left" ? "leg-left" : "leg-right", d: `M${x} ${y} L${x} ${y + legLen}`, pivot: [x, y], foot: { x, y: y + legLen + 2, dir: d } };
}

export const POSES: Record<Pose, PoseSpec> = {
  standing: {
    eyes: "open",
    mouth: "smile",
    limbs: [armDown("left"), armDown("right"), legStraight("left"), legStraight("right")],
  },
  walking: {
    eyes: "open",
    mouth: "small",
    look: [1, 0],
    limbs: [
      { part: "arm-left", d: `M${SL[0]} ${SL[1]} L${SL[0] - 16} ${SL[1] + 6}`, pivot: SL, hand: [SL[0] - 16, SL[1] + 6] },
      { part: "arm-right", d: `M${SR[0]} ${SR[1]} L${SR[0] + 10} ${SR[1] + 16}`, pivot: SR, hand: [SR[0] + 10, SR[1] + 16] },
      { part: "leg-left", d: `M${HL[0]} ${HL[1]} L${HL[0] - 7} ${HL[1] + 15}`, pivot: HL, foot: { x: HL[0] - 7, y: HL[1] + 17, dir: -1 } },
      { part: "leg-right", d: `M${HR[0]} ${HR[1]} L${HR[0] + 7} ${HR[1] + 15}`, pivot: HR, foot: { x: HR[0] + 7, y: HR[1] + 17, dir: 1 } },
    ],
  },
  waving: {
    eyes: "open",
    mouth: "smile",
    limbs: [
      armDown("left"),
      { part: "arm-right", d: `M${SR[0]} ${SR[1]} L${SR[0] + 17} ${SR[1] - 8} L${SR[0] + 23} ${SR[1] - 27}`, pivot: SR, hand: [SR[0] + 23, SR[1] - 27] },
      legStraight("left"),
      legStraight("right"),
    ],
  },
  sleeping: {
    eyes: "sleep",
    mouth: "small",
    limbs: [
      { part: "arm-left", d: `M${SL[0]} ${SL[1]} L${SL[0] - 6} ${SL[1] + 17}`, pivot: SL, hand: [SL[0] - 6, SL[1] + 17] },
      { part: "arm-right", d: `M${SR[0]} ${SR[1]} L${SR[0] + 6} ${SR[1] + 17}`, pivot: SR, hand: [SR[0] + 6, SR[1] + 17] },
      legStraight("left"),
      legStraight("right"),
    ],
  },
  celebrating: {
    eyes: "happy",
    mouth: "open",
    limbs: [
      { part: "arm-left", d: `M${SL[0]} ${SL[1]} L${SL[0] - 17} ${SL[1] - 9} L${SL[0] - 23} ${SL[1] - 28}`, pivot: SL, hand: [SL[0] - 23, SL[1] - 28] },
      { part: "arm-right", d: `M${SR[0]} ${SR[1]} L${SR[0] + 17} ${SR[1] - 9} L${SR[0] + 23} ${SR[1] - 28}`, pivot: SR, hand: [SR[0] + 23, SR[1] - 28] },
      { part: "leg-left", d: `M${HL[0]} ${HL[1]} L${HL[0] - 7} ${HL[1] + 15}`, pivot: HL, foot: { x: HL[0] - 7, y: HL[1] + 17, dir: -1 } },
      { part: "leg-right", d: `M${HR[0]} ${HR[1]} L${HR[0] + 7} ${HR[1] + 15}`, pivot: HR, foot: { x: HR[0] + 7, y: HR[1] + 17, dir: 1 } },
    ],
  },
};

/** Sleeping z marks, biggest last. */
export const SLEEP_Z: ReadonlyArray<{ x: number; y: number; s: number }> = [
  { x: 122, y: 42, s: 6 },
  { x: 131, y: 30, s: 8 },
  { x: 142, y: 15, s: 10 },
];

export function zPath(x: number, y: number, s: number): string {
  return `M${x} ${y} L${x + s} ${y} L${x} ${y + s} L${x + s} ${y + s}`;
}

/** Confetti for celebrating: x, y, radius, colour key. */
export const CONFETTI: ReadonlyArray<{ x: number; y: number; r: number; c: "blaze" | "cobaltGlow" | "ink" }> = [
  { x: 30, y: 26, r: 3, c: "cobaltGlow" },
  { x: 48, y: 14, r: 2.5, c: "ink" },
  { x: 70, y: 10, r: 3.2, c: "blaze" },
  { x: 94, y: 9, r: 2.5, c: "cobaltGlow" },
  { x: 114, y: 18, r: 3, c: "ink" },
  { x: 132, y: 28, r: 2.5, c: "blaze" },
  { x: 16, y: 56, r: 2.5, c: "blaze" },
  { x: 146, y: 58, r: 2.5, c: "cobaltGlow" },
];
