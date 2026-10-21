"use client";

import { Mascot } from "@/components/brand/Mascot";
import { Icon } from "@/components/ui/Icon";
import { PIPELINE } from "./demo-data";
import { reveal, useScrollScene } from "./scroll";
import home from "./home.module.css";
import styles from "./Pipeline.module.css";

const ICONS = ["pen", "film", "image", "check", "mic"] as const;

/**
 * From idea to post. Five stages in a row; Wovi walks the rail above them
 * as the section scrolls through. On phones the stages stack.
 */
export function Pipeline() {
  const ref = useScrollScene<HTMLElement>(({ el, gsap, desktop, reduce }) => {
    reveal(gsap, el, "[data-head]", { reduce });
    reveal(gsap, el, "[data-stage]", { reduce, stagger: 0.1, y: 30, start: "top 72%" });
    const walker = el.querySelector<HTMLElement>("[data-walker]");
    const fill = el.querySelector<HTMLElement>("[data-fill]");
    if (!walker || !fill || !desktop) return;
    if (reduce) {
      gsap.set(walker, { left: "calc(100% - 96px)" });
      gsap.set(fill, { scaleX: 1 });
      return;
    }
    const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: "top 70%", end: "bottom 60%", scrub: 0.8 } });
    tl.fromTo(walker, { left: "0%" }, { left: "calc(100% - 96px)", ease: "none" }, 0).fromTo(fill, { scaleX: 0 }, { scaleX: 1, ease: "none" }, 0);
  });

  return (
    <section ref={ref} id="pipeline" className={home.section} aria-labelledby="pipeline-title">
      <div className="container">
        <div className={[home.head, styles.head].join(" ")}>
          <span className="eyebrow" data-head>
            How a post is made
          </span>
          <h2 id="pipeline-title" className={home.title} data-head>
            From idea to post, one agent at a time.
          </h2>
          <p className={home.lead} data-head>
            Every stage is its own agent with one task. Each output feeds the next, and nothing ships until you say yes.
          </p>
        </div>

        <div className={styles.rail} aria-hidden="true">
          <span className={styles.line}>
            <span className={styles.lineFill} data-fill />
          </span>
          {PIPELINE.map((p) => (
            <span key={p.id} className={styles.node} />
          ))}
          <span className={styles.walker} data-walker>
            <Mascot pose="move" size={96} label="" />
          </span>
        </div>

        <ol className={styles.track}>
          {PIPELINE.map((p, i) => (
            <li key={p.id} className={[home.panel, home.panelTight, i % 2 ? home.panelAlt : "", styles.stage].join(" ")} data-stage>
              <div className={styles.stageTop}>
                <span className={styles.num}>0{i + 1}</span>
                <span className={[home.chip, p.tag === "Next" ? home.chipCobalt : p.tag === "Live" ? home.chipBlaze : ""].join(" ")}>{p.tag}</span>
              </div>
              <span className={[home.iconTile, i === 3 ? home.iconTileBlaze : ""].join(" ")}>
                <Icon name={ICONS[i]} size={22} />
              </span>
              <h3 className={styles.stageTitle}>{p.title}</h3>
              <p className={styles.stageText}>{p.text}</p>
              <span className={styles.stageAgent}>
                <span className={styles.agentDot} />
                {p.agent}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
