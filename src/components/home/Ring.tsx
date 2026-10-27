import home from "./home.module.css";

/** A score ring. `value` 0 to 100; the arc is animated by CSS on --ring-value when `live`. `shown` replaces the number in the middle (a dash before a score exists). */
export function Ring({ value, size = 44, tone = "blaze", className, shown }: { value: number; size?: number; tone?: "blaze" | "cobalt" | "cream"; className?: string; shown?: string }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const color = tone === "blaze" ? "var(--blaze)" : tone === "cream" ? "#FFF4DC" : "var(--cobalt-glow)";
  return (
    <span className={[home.ring, className].filter(Boolean).join(" ")} style={{ width: size, height: size }} aria-label={shown ? "Brand fit not scored yet" : `Brand fit ${value}`} role="img">
      <svg viewBox="0 0 44 44" width={size} height={size}>
        <circle cx="22" cy="22" r={r} fill="none" stroke="currentColor" strokeOpacity="0.14" strokeWidth="4" />
        <circle className="ring-arc" cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * value) / 100} />
      </svg>
      <span className="ring-value">{shown ?? value}</span>
    </span>
  );
}
