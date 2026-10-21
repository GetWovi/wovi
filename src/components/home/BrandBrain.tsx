"use client";

import { Icon } from "@/components/ui/Icon";
import { reveal, useScrollScene } from "./scroll";
import home from "./home.module.css";
import styles from "./BrandBrain.module.css";

/** Scatter offsets (deterministic) for each tile before it assembles. */
const SCATTER = [
  [-140, -90, -9],
  [120, -120, 7],
  [-160, 60, 6],
  [150, 40, -8],
  [-60, 160, 5],
  [90, 150, -6],
];

export function BrandBrain() {
  const ref = useScrollScene<HTMLElement>(({ el, gsap, reduce, desktop }) => {
    reveal(gsap, el, "[data-head]", { reduce });
    const tiles = el.querySelectorAll<HTMLElement>("[data-tile]");
    if (reduce || !desktop) {
      reveal(gsap, el, "[data-tile]", { reduce, stagger: 0.1 });
      return;
    }
    tiles.forEach((t, i) => {
      const [x, y, r] = SCATTER[i % SCATTER.length];
      gsap.fromTo(
        t,
        { x, y, rotate: r, opacity: 0, scale: 0.92 },
        { x: 0, y: 0, rotate: 0, opacity: 1, scale: 1, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 70%", end: "top 15%", scrub: 0.6 } },
      );
    });
    const core = el.querySelector("[data-core]");
    if (core) gsap.fromTo(core, { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 75%", end: "top 30%", scrub: 0.6 } });
  });

  return (
    <section ref={ref} id="brand-brain" className={home.section} aria-labelledby="brain-title">
      <div className={["container", styles.inner].join(" ")}>
        <div className={[home.head, styles.head].join(" ")}>
          <span className={home.eyebrow} data-head>
            Brand Brain
          </span>
          <h2 id="brain-title" className={home.title} data-head>
            Every agent reads <em>your Brand Brain</em> before it writes a word.
          </h2>
          <p className={home.lead} data-head>
            Your voice, your mood board, the posts you wish you had made, and the things you never say. Set it once. Every agent, every run, starts from it.
          </p>
        </div>

        <div className={styles.board}>
          <div className={styles.core} data-core>
            <span className={styles.coreRing} />
            <span className={styles.coreRing2} />
            <span className={styles.coreDot}>
              <Icon name="spark" size={26} />
            </span>
            <span className={styles.coreLabel}>Brand Brain</span>
          </div>

          <div className={[styles.tile, styles.voice].join(" ")} data-tile>
            <span className={styles.tileLabel}>Voice</span>
            <p className={styles.tileBig}>Warm, direct, no hype.</p>
            <div className={styles.sliders}>
              {[
                ["Playful", "Serious", 32],
                ["Short", "Long", 24],
                ["Plain", "Poetic", 40],
              ].map(([a, b, v]) => (
                <div key={a as string} className={styles.slider}>
                  <span>{a}</span>
                  <span className={styles.sliderTrack}>
                    <span className={styles.sliderKnob} style={{ left: `${v}%` }} />
                  </span>
                  <span>{b}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={[styles.tile, styles.mood].join(" ")} data-tile>
            <span className={styles.tileLabel}>Mood board</span>
            <div className={styles.swatches}>
              <span style={{ background: "linear-gradient(140deg,#ff8a5c,#ff5a1f)" }} />
              <span style={{ background: "linear-gradient(140deg,#1f4dff,#0b1230)" }} />
              <span style={{ background: "linear-gradient(140deg,#fff4dc,#e8d9b5)" }} />
              <span style={{ background: "radial-gradient(circle at 30% 30%,#7c97ff,#1f4dff)" }} />
            </div>
            <p className={styles.tileSmall}>Early light, flour on hands, Saturday queue.</p>
          </div>

          <div className={[styles.tile, styles.refs].join(" ")} data-tile>
            <span className={styles.tileLabel}>References</span>
            <div className={styles.refRow}>
              {["The honest price post", "Kitchen at 5am", "Why we closed Mondays"].map((r, i) => (
                <span key={r} className={styles.ref} data-i={i}>
                  {r}
                </span>
              ))}
            </div>
          </div>

          <div className={[styles.tile, styles.doTile].join(" ")} data-tile>
            <span className={styles.tileLabel}>
              <Icon name="check" size={14} /> Do
            </span>
            <ul className={styles.list}>
              <li>Short sentences.</li>
              <li>Real numbers, real names.</li>
              <li>Say the price.</li>
            </ul>
          </div>

          <div className={[styles.tile, styles.dontTile].join(" ")} data-tile>
            <span className={styles.tileLabel}>
              <Icon name="close" size={14} /> Never
            </span>
            <ul className={styles.list}>
              <li>
                <s>Game-changing</s>
              </li>
              <li>
                <s>Unlock your potential</s>
              </li>
              <li>
                <s>Limited time only!</s>
              </li>
            </ul>
          </div>

          <div className={[styles.tile, styles.audience].join(" ")} data-tile>
            <span className={styles.tileLabel}>Audience</span>
            <p className={styles.tileBig}>Locals who walk past twice a week.</p>
            <p className={styles.tileSmall}>They know the shop. They do not know the story.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
