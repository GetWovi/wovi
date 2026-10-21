import { eyePath, FACE, OPEN_MOUTH_PATH, SMILE_PATH, W_CX, type Eyes, type Mouth } from "@/brand/geometry";

export type FaceProps = {
  eyes?: Eyes;
  mouth?: Mouth;
  /** Colour of the eye and mouth lines. Cream on a Blaze w. */
  line: string;
  /** Colour of the cheeks and the tongue. Cobalt on a Blaze w. */
  cheek: string;
};

/**
 * Wovi's face, in w units, centred on the w. Two closed eyes, a smile and
 * two cheeks. Calm eyes rest like a soft smile; happy eyes flip upwards.
 */
export function Face({ eyes = "calm", mouth = "smile", line, cheek }: FaceProps) {
  const st = { fill: "none", stroke: line, strokeWidth: FACE.stroke, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <g className="wovi-face">
      <path className="wovi-eye" d={eyePath(eyes)} transform={`translate(${W_CX - FACE.eyeDx} ${FACE.eyeY})`} {...st} />
      <path className="wovi-eye" d={eyePath(eyes)} transform={`translate(${W_CX + FACE.eyeDx} ${FACE.eyeY})`} {...st} />
      {mouth === "smile" && <path d={SMILE_PATH} transform={`translate(${W_CX} ${FACE.mouthY})`} {...st} />}
      {mouth === "small" && <ellipse cx={W_CX} cy={FACE.mouthY + FACE.smallMouth.dy} rx={FACE.smallMouth.rx} ry={FACE.smallMouth.ry} fill={line} />}
      {mouth === "open" && (
        <>
          <path d={OPEN_MOUTH_PATH} transform={`translate(${W_CX} ${FACE.openTop})`} fill={line} />
          <ellipse cx={W_CX} cy={FACE.openTop + FACE.tongue.dy} rx={FACE.tongue.rx} ry={FACE.tongue.ry} fill={cheek} />
        </>
      )}
      <ellipse cx={W_CX - FACE.cheekDx} cy={FACE.cheekY} rx={FACE.cheekRx} ry={FACE.cheekRy} fill={cheek} />
      <ellipse cx={W_CX + FACE.cheekDx} cy={FACE.cheekY} rx={FACE.cheekRx} ry={FACE.cheekRy} fill={cheek} />
    </g>
  );
}
