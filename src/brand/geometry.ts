/**
 * WOVI brand geometry, drawn from Funkai's brand boards.
 *
 * Every logo, mark and mascot file comes from these numbers. The unit is the
 * letter height: the wordmark is 350 units tall. The w is a filled blob (three
 * round lobes on top, two round legs below, an S-curve down each side); o, v
 * and I are round-ended strokes of the same weight. The w carries the face,
 * and with limbs it becomes Wovi, the mascot.
 */

export const COLORS = {
  blaze: "#FF5A1F",
  cobalt: "#1F4DFF",
  night: "#0B1230",
  raised: "#141D44",
  raisedAlt: "#1C2760",
  cream: "#FFF4DC",
  cobaltGlow: "#7C97FF",
} as const;

export type Ink = "cream" | "night";

/* ------------------------------------------------------------------ */
/* The w                                                               */
/* ------------------------------------------------------------------ */

/** Letter height. Everything below is in these units. */
export const H = 350;

/** The w's box: 444 wide, 350 tall, origin at its top left. */
export const W_BOX = { w: 444, h: 350 } as const;

/** Horizontal centre of the w. */
export const W_CX = 222;

const LOBE_R = 52; // the three round bumps on top
const LOBE_Y = 56; // centre height of the outer lobes (the middle one sits 4 higher)
const VALLEY_R = 33; // the U between two lobes
const VALLEY_Y = 88; // centre of the valley's round bottom
const LEG_R = 60; // the two round legs
const LEG_Y = 289; // centre of a leg's round bottom
const NOTCH_R = 25; // the U between the legs
const NOTCH_Y = 248; // centre of the notch's round top
const SIDE_TOP = 95; // where the straight outer edge starts to sweep in
const SIDE_END = 258; // where the sweep meets the leg

/** Centres of the lobes, valleys and legs. */
export const W_LOBES = [52, 222, 392] as const;
export const W_LEGS = [137, 307] as const;

/** The w as one closed filled path. */
export const W_PATH = [
  `M0 ${LOBE_Y}`,
  `L0 ${SIDE_TOP}`,
  `C0 180 77 175 77 ${SIDE_END}`,
  `L77 ${LEG_Y}`,
  `A${LEG_R} ${LEG_R} 0 0 0 197 ${LEG_Y}`,
  `L197 ${NOTCH_Y}`,
  `A${NOTCH_R} ${NOTCH_R} 0 0 1 247 ${NOTCH_Y}`,
  `L247 ${LEG_Y}`,
  `A${LEG_R} ${LEG_R} 0 0 0 367 ${LEG_Y}`,
  `L367 ${SIDE_END}`,
  `C367 175 444 180 444 ${SIDE_TOP}`,
  `L444 ${LOBE_Y}`,
  `A${LOBE_R} ${LOBE_R} 0 0 0 340 ${LOBE_Y}`,
  `L340 ${VALLEY_Y}`,
  `A${VALLEY_R} ${VALLEY_R} 0 0 1 274 ${VALLEY_Y}`,
  `L274 ${LOBE_Y - 4}`,
  `A${LOBE_R} ${LOBE_R} 0 0 0 170 ${LOBE_Y - 4}`,
  `L170 ${VALLEY_Y}`,
  `A${VALLEY_R} ${VALLEY_R} 0 0 1 104 ${VALLEY_Y}`,
  `L104 ${LOBE_Y}`,
  `A${LOBE_R} ${LOBE_R} 0 0 0 0 ${LOBE_Y}`,
  "Z",
].join(" ");

/* ------------------------------------------------------------------ */
/* The face                                                            */
/* ------------------------------------------------------------------ */

export type Eyes = "calm" | "happy";
export type Mouth = "smile" | "open" | "small";

/** Face layout in w units. Lines are round-capped strokes. */
export const FACE = {
  stroke: 9,
  eyeY: 160,
  eyeDx: 46,
  eyeHalf: 20,
  eyeBend: 16,
  mouthY: 195,
  mouthHalf: 25,
  mouthBend: 22,
  openTop: 182,
  openRx: 32,
  openRy: 29,
  tongue: { dy: 21, rx: 10, ry: 6 },
  smallMouth: { dy: 2, rx: 8, ry: 10 },
  cheekDx: 88,
  cheekY: 186,
  cheekRx: 15,
  cheekRy: 10,
} as const;

/** Path for one eye, centred on (0,0). Calm eyes rest like a soft smile; happy eyes flip up. */
export function eyePath(kind: Eyes): string {
  const h = FACE.eyeHalf;
  const b = FACE.eyeBend;
  return kind === "calm" ? `M${-h} -4 Q0 ${b} ${h} -4` : `M${-h} 4 Q0 ${-b} ${h} 4`;
}

export const SMILE_PATH = `M${-FACE.mouthHalf} -7 Q0 ${FACE.mouthBend} ${FACE.mouthHalf} -7`;

/** The open smile: a flat top and a round bottom. */
export const OPEN_MOUTH_PATH = `M${-FACE.openRx} 0 H${FACE.openRx} A${FACE.openRx} ${FACE.openRy} 0 0 1 ${-FACE.openRx} 0 Z`;

/* ------------------------------------------------------------------ */
/* The wordmark: W O V I                                               */
/* ------------------------------------------------------------------ */

/** Stroke weight of o, v and I. */
export const STROKE = 95;

const oCx = 595; // the w's right lobe tucks 22 units into the o
const oOuter = 173;
const oCy = H - oOuter; // the o sits on the baseline and clears the top by 4
const vApex: [number, number] = [891.5, 302.5];
const vTopY = STROKE / 2;
const vSpread = 134.5; // half the distance between the arm tops
const iX = 1113.5;

export const WORDMARK = {
  w: W_PATH,
  o: { cx: oCx, cy: oCy, r: oOuter - STROKE / 2 },
  v: `M${vApex[0] - vSpread} ${vTopY} L${vApex[0]} ${vApex[1]} L${vApex[0] + vSpread} ${vTopY}`,
  i: `M${iX} ${STROKE / 2} L${iX} ${H - STROKE / 2}`,
  /** Visible bounds of the whole word. */
  bounds: { x: 0, y: 0, w: iX + STROKE / 2, h: H },
  /** Clearspace on every side equals the width of the I. */
  clearspace: STROKE,
} as const;

/* ------------------------------------------------------------------ */
/* The mascot: Wovi                                                     */
/* ------------------------------------------------------------------ */

export type Pose = "move" | "hello" | "wait" | "done";

export const POSE_NAMES: Record<Pose, string> = {
  move: "On the move",
  hello: "Hello",
  wait: "Waiting for a job",
  done: "Job done",
};

/** The mascot box in w units: room for limbs, z's and sparkles around the w. */
export const MASCOT_BOX = { x: -70, y: -100, w: 584, h: 610 } as const;

export const LIMB_STROKE = 26;

export type Limb = {
  part: "arm-left" | "arm-right" | "leg-left" | "leg-right";
  d: string;
  /** Where the limb joins the body; motion rotates around it. */
  pivot: readonly [number, number];
};

export type PoseSpec = {
  eyes: Eyes;
  mouth: Mouth;
  limbs: Limb[];
};

const LEG_TOP = 338; // just inside the body so the join never shows
const HIP_L: [number, number] = [W_LEGS[0], LEG_TOP];
const HIP_R: [number, number] = [W_LEGS[1], LEG_TOP];

/** A straight leg with a little foot that curls outward. */
function standingLeg(side: "left" | "right"): Limb {
  const [x, y] = side === "left" ? HIP_L : HIP_R;
  const d = side === "left" ? -1 : 1;
  const bottom = 458;
  return {
    part: side === "left" ? "leg-left" : "leg-right",
    d: `M${x} ${y} L${x} ${bottom} C${x} ${bottom + 20} ${x + 14 * d} ${bottom + 22} ${x + 28 * d} ${bottom + 14} Q${x + 40 * d} ${bottom + 7} ${x + 44 * d} ${bottom - 2}`,
    pivot: [x, y],
  };
}

export const POSES: Record<Pose, PoseSpec> = {
  move: {
    eyes: "calm",
    mouth: "smile",
    limbs: [
      // back leg swings down and back, toe curling up
      { part: "leg-left", d: `M${HIP_L[0]} ${LEG_TOP} C${HIP_L[0] - 6} 400 ${HIP_L[0] - 34} 420 ${HIP_L[0] - 44} 452 C${HIP_L[0] - 50} 472 ${HIP_L[0] - 30} 478 ${HIP_L[0] - 22} 464`, pivot: HIP_L },
      // front leg kicks forward, foot pointing ahead
      { part: "leg-right", d: `M${HIP_R[0]} ${LEG_TOP} C${HIP_R[0] + 10} 392 ${HIP_R[0] + 48} 408 ${HIP_R[0] + 70} 436 C${HIP_R[0] + 84} 454 ${HIP_R[0] + 108} 450 ${HIP_R[0] + 114} 432`, pivot: HIP_R },
    ],
  },
  hello: {
    eyes: "calm",
    mouth: "smile",
    limbs: [
      { part: "arm-left", d: "M16 150 C-12 182 -24 222 -10 262", pivot: [16, 150] },
      { part: "arm-right", d: "M428 170 C478 150 492 90 476 40", pivot: [428, 170] },
      standingLeg("left"),
      standingLeg("right"),
    ],
  },
  wait: {
    eyes: "calm",
    mouth: "small",
    limbs: [standingLeg("left"), standingLeg("right")],
  },
  done: {
    eyes: "happy",
    mouth: "open",
    limbs: [
      { part: "arm-left", d: "M22 156 C-14 130 -40 80 -32 14", pivot: [22, 156] },
      { part: "arm-right", d: "M422 156 C458 130 484 80 476 14", pivot: [422, 156] },
      { part: "leg-left", d: `M${HIP_L[0]} ${LEG_TOP} L62 446`, pivot: HIP_L },
      { part: "leg-right", d: `M${HIP_R[0]} ${LEG_TOP} L382 446`, pivot: HIP_R },
    ],
  },
};

/** Sleeping z's for the wait pose: x, y of the top left, size. Biggest first. */
export const SLEEP_Z: ReadonlyArray<{ x: number; y: number; s: number }> = [
  { x: 462, y: -42, s: 22 },
  { x: 500, y: -84, s: 15 },
];

export function zPath(x: number, y: number, s: number): string {
  return `M${x} ${y} L${x + s} ${y} L${x} ${y + s} L${x + s} ${y + s}`;
}

/** A four-point sparkle centred on (0,0) with radius 1. */
export const SPARKLE_PATH = "M0 -1 Q0.1 -0.1 1 0 Q0.1 0.1 0 1 Q-0.1 0.1 -1 0 Q-0.1 -0.1 0 -1 Z";

/** What floats above the w when a job is done. */
export const DONE_MARKS = {
  sparkle: { x: 222, y: -56, r: 30 },
  dots: [
    { x: 36, y: -46, r: 11, c: "blaze" as const },
    { x: 410, y: -46, r: 11, c: "cobaltGlow" as const },
  ],
} as const;
