"use client";

import { SLOP_LINES } from "./demo-data";
import { reveal, useScrollScene } from "./scroll";
import home from "./home.module.css";
import styles from "./AntiSlop.module.css";

/**
 * Slop never ships: generic lines get struck out one by one as you scroll,
 * the lines that sound like you light up, and the brand-fit score climbs.
 */
export function AntiSlop() {
  const ref = useScrollScene<HTMLElement>(({ el, gsap, reduce }) => {
    reveal(gsap, el, "[data-head]", { reduce });
    const strikes = el.querySelectorAll<HTMLElement>("[data-strike]");
    const keeps = el.querySelectorAll<HTMLElement>("[data-keep]");
    const counter = el.querySelector<HTMLElement>("[data-count]");
    const bar = el.querySelector<HTMLElement>("[data-bar]");
    const score = { v: 31 };
    if (reduce) {
      gsap.set(strikes, { "--strike": 1 });
      gsap.set(keeps, { opacity: 1 });
      if (counter) counter.textContent = "94";
      if (bar) gsap.set(bar, { scaleX: 0.94 });
      return;
    }
    const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: "top 60%", end: "bottom 70%", scrub: 0.7 } });
    strikes.forEach((s, i) => tl.fromTo(s, { "--strike": 0 }, { "--strike": 1, duration: 0.6, ease: "power2.out" }, i * 0.5));
    keeps.forEach((k, i) => tl.fromTo(k, { opacity: 0.45 }, { opacity: 1, duration: 0.4 }, 0.8 + i * 0.9));
    tl.to(score, {
      v: 94,
      duration: strikes.length * 0.5,
      ease: "power1.out",
      onUpdate: () => {
        if (counter) counter.textContent = String(Math.round(score.v));
        if (bar) bar.style.transform = `scaleX(${score.v / 100})`;
      },
    }, 0);
  });

  return (
    <section ref={ref} id="anti-slop" className={home.section} aria-labelledby="slop-title">
      <div className={["container", styles.inner].join(" ")}>
        <div className={[home.head, styles.head].join(" ")}>
          <span className={home.eyebrow} data-head>
            Anti-slop
          </span>
          <h2 id="slop-title" className={home.title} data-head>
            Slop <em>never ships.</em>
          </h2>
          <p className={home.lead} data-head>
            Every draft is scored against your Brand Brain before you see it. Generic phrases get caught. Lines that sound like you get through. If the fit is low,
            the agent tries again, not you.
          </p>
        </div>

        <div className={[home.glass, styles.panel].join(" ")}>
          <div className={styles.panelHead}>
            <span className={styles.panelTitle}>Draft review</span>
            <span className={home.chip}>Hook Writer</span>
          </div>
          <p className={styles.text}>
            {SLOP_LINES.map((l, i) =>
              l.slop ? (
                <span key={i} className={styles.slop} data-strike>
                  {l.text}{" "}
                </span>
              ) : (
                <span key={i} className={styles.keep} data-keep>
                  {l.text}{" "}
                </span>
              ),
            )}
          </p>
          <div className={styles.meter}>
            <div className={styles.meterTop}>
              <span>Brand fit</span>
              <span className={styles.meterValue}>
                <span data-count>31</span>
                <small>/100</small>
              </span>
            </div>
            <div className={styles.meterTrack}>
              <span className={styles.meterFill} data-bar />
            </div>
            <div className={styles.meterFoot}>
              <span className={styles.legend}>
                <i className={styles.legendSlop} /> Caught
              </span>
              <span className={styles.legend}>
                <i className={styles.legendKeep} /> Sounds like you
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
