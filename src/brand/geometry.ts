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

/** Centres of the lobes, valleys and legs. */
export const W_LOBES = [52, 222, 392] as const;
export const W_LEGS = [137, 307] as const;

/** The w as one closed filled path, traced from Funkai's mascot board (WOVI-emotes.png) and made symmetric. */
export const W_PATH =
  "M215.7 0.4 C199.6 2.5 183.7 16.3 176.6 34.3 C171.5 47.0 170.3 54.0 169.4 70.3 C168.6 87.2 167.3 94.6 163.6 103.1 C157.9 115.7 147.4 122.3 134.2 121.0 C119.4 119.6 109.1 106.4 106.6 85.3 C106.2 83.0 106.2 80.8 105.6 68.1 C105.1 58.6 103.3 50.2 99.9 40.4 C98.4 36.8 98.0 36.0 94.7 30.0 C87.8 17.6 75.0 7.4 63.0 5.1 C47.3 1.9 34.3 5.3 23.0 15.7 C15.1 23.1 9.2 33.0 4.6 46.3 C3.8 49.3 1.0 62.4 0.8 66.7 C-0.4 79.1 0.2 94.6 2.3 105.6 C2.5 106.9 2.9 109.0 3.1 110.5 C4.6 119.1 9.4 133.5 14.0 142.8 C14.5 143.9 15.1 145.4 15.3 146.0 C15.5 146.6 16.1 147.7 16.8 148.3 C17.2 149.2 18.0 150.7 18.6 152.1 C19.3 153.4 20.3 155.1 20.9 156.0 C21.8 156.8 22.8 158.9 23.7 160.4 C24.9 162.7 25.6 163.6 26.8 165.3 C27.9 166.3 29.1 168.0 29.7 169.1 C31.2 171.6 32.7 173.7 33.9 175.6 C34.6 176.5 35.6 178.0 36.2 178.8 C36.9 179.7 38.7 182.4 40.6 184.7 C51.1 199.1 58.0 208.9 60.5 213.3 C61.2 214.6 62.2 216.3 62.8 217.3 C67.2 224.7 72.5 238.3 74.6 247.4 C74.8 249.3 75.4 251.8 75.8 253.1 C76.4 256.5 76.9 260.7 77.3 273.8 C77.5 280.4 77.9 285.5 78.5 288.2 C78.5 289.3 79.2 291.8 79.4 293.9 C82.3 310.9 90.9 326.9 102.2 336.7 C107.4 341.3 117.9 347.0 121.7 347.5 C123.8 347.7 126.9 348.5 128.8 349.4 C131.1 350.2 142.6 350.2 144.9 349.2 C146.0 348.7 147.2 348.5 148.3 348.3 C149.3 348.1 150.4 347.9 151.0 347.9 C151.4 347.7 152.7 347.5 153.7 347.5 C156.9 346.8 165.5 342.4 170.3 338.8 C175.3 335.0 181.4 328.2 184.3 323.1 C184.9 322.3 185.8 320.6 186.6 319.5 C189.1 315.3 192.7 306.0 194.4 299.2 C196.9 289.1 197.1 286.3 197.9 264.3 C199.0 237.4 206.5 224.7 222.0 224.7 C237.5 224.7 245.0 237.4 246.1 264.3 C246.9 286.3 247.1 289.1 249.6 299.2 C251.3 306.0 254.9 315.3 257.4 319.5 C258.2 320.6 259.1 322.3 259.7 323.1 C262.6 328.2 268.7 335.0 273.7 338.8 C278.5 342.4 287.1 346.8 290.3 347.5 C291.3 347.5 292.6 347.7 293.2 347.9 C293.6 347.9 294.7 348.1 295.7 348.3 C296.8 348.5 298.0 348.7 299.1 349.2 C301.4 350.2 312.9 350.2 315.2 349.4 C317.1 348.5 320.2 347.7 322.5 347.5 C326.1 347.0 336.6 341.3 341.8 336.7 C353.1 326.9 361.7 310.9 364.6 293.9 C364.8 291.8 365.5 289.3 365.5 288.2 C366.1 285.5 366.5 280.4 366.7 273.8 C367.1 260.7 367.6 256.5 368.2 253.1 C368.6 251.8 369.2 249.3 369.4 247.4 C371.5 238.3 376.8 224.7 381.2 217.3 C381.8 216.3 382.8 214.6 383.5 213.3 C386.0 208.9 392.9 199.1 403.4 184.7 C405.3 182.4 407.1 179.7 407.8 178.8 C408.4 178.0 409.4 176.5 410.1 175.6 C411.3 173.7 412.8 171.6 414.5 169.1 C414.9 168.0 416.1 166.3 417.2 165.3 C418.4 163.6 419.1 162.7 420.3 160.4 C421.2 158.9 422.2 156.8 423.1 156.0 C423.7 155.1 424.7 153.4 425.4 152.1 C426.0 150.7 426.8 149.2 427.2 148.3 C427.9 147.7 428.5 146.6 428.7 146.0 C428.9 145.4 429.5 143.9 430.0 142.8 C434.6 133.5 439.4 119.1 440.9 110.5 C441.1 109.0 441.5 106.9 441.7 105.6 C443.8 94.6 444.4 79.1 443.2 66.7 C443.0 62.4 440.2 49.3 439.4 46.3 C431.4 22.6 417.4 7.8 399.8 4.7 C381.2 1.3 365.0 8.3 352.5 25.2 C350.8 27.3 350.0 29.0 346.6 34.7 C342.4 42.3 338.9 56.9 338.4 68.1 C337.8 80.8 337.8 83.0 337.4 85.3 C334.9 106.4 324.6 119.6 309.8 121.0 C296.6 122.3 286.1 115.7 280.4 103.1 C276.7 94.6 275.4 87.2 274.6 70.3 C273.7 53.1 271.2 41.5 266.0 30.7 C254.9 8.9 236.5 -2.3 215.7 0.4 Z";

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
  eyeHalf: 23,
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
  cheekRx: 17,
  cheekRy: 11,
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
