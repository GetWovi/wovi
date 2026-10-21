import { Mark } from "@/components/brand/Mark";
import styles from "./Avatar.module.css";

export type AvatarProps = {
  name: string;
  src?: string;
  size?: 24 | 32 | 40 | 56 | 80;
  /** An agent avatar shows the w mark instead of initials. */
  kind?: "person" | "agent";
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Four fills built from the palette, picked by name so the colour is stable. */
const FILLS = ["cobalt", "blaze", "line", "glow"] as const;

export function Avatar({ name, src, size = 40, kind = "person" }: AvatarProps) {
  const fill = FILLS[[...name].reduce((n, ch) => n + ch.charCodeAt(0), 0) % FILLS.length];
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (src) {
    // Plain img: avatars come from user uploads with no fixed host to optimise for.
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={styles.avatar} src={src} alt={name} width={size} height={size} style={style} />;
  }
  if (kind === "agent") {
    return (
      <span className={[styles.avatar, styles.agent].join(" ")} style={style} role="img" aria-label={name}>
        <Mark size={Math.round(size * 0.62)} ink="cream" label="" />
      </span>
    );
  }
  return (
    <span className={[styles.avatar, styles[fill]].join(" ")} style={style} role="img" aria-label={name}>
      {initials(name)}
    </span>
  );
}
