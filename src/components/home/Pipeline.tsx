"use client";

import { Mascot } from "@/components/brand/Mascot";
import { Icon } from "@/components/ui/Icon";
import { PIPELINE } from "./demo-data";
import { reveal, useScrollScene } from "./scroll";
import home from "./home.module.css";
import styles from "./Pipeline.module.css";

const ICONS = ["spark", "film", "copy", "check", "play"] as const;

/**
 * From idea to post. On desktop the section pins and the five stages slide
 * past as you scroll while Wovi walks the line; on phones it is a vertical
 * sequence that reveals stage by stage.
 */
export function Pipeline() {
  const ref = useScrollScene<HTMLElement>(({ el, gsap, desktop, reduce }) => {
    const track = el.querySelector<HTMLElement>("[data-track]");
    const line = el.querySelector<HTMLElement>("[data-line]");
    const walker = el.querySelector<HTMLElement>("[data-walker]");
    const cards = el.querySelectorAll<HTMLElement>("[data-stage]");
    if (!track || !line || !walker) return;

    if (!desktop || reduce) {
      gsap.set(track, { x: 0 });
      gsap.set(line, { scaleX: 1 });
      reveal(gsap, el, "[data-stage]", { reduce, stagger: 0.12 });
      reveal(gsap, el, "[data-head]", { reduce });
      return;
    }

    const distance = () => track.scrollWidth - el.clientWidth + 64;
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: el,
        start: "top top",
        end: () => `+=${distance() + 600}`,
        pin: true,
        scrub: 0.8,
        anticipatePin: 1,
        invalidateOnRefresh: true,
      },
    });
    tl.fromTo(line, { scaleX: 0 }, { scaleX: 1, ease: "none", duration: 1 }, 0)
      .to(track, { x: () => -distance(), ease: "none", duration: 1 }, 0)
      .fromTo(walker, { left: "0%" }, { left: "calc(100% - 96px)", ease: "none", duration: 1 }, 0);
    cards.forEach((card, i) => {
      tl.fromTo(card, { opacity: 0.35, y: 24, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, ease: "power2.out", duration: 0.12 }, Math.max(0, i * 0.2 - 0.05));
    });
    reveal(gsap, el, "[data-head]", { reduce });
  });

  return (
    <section ref={ref} id="pipeline" className={styles.section} aria-labelledby="pipeline-title">
      <div className={home.wash} />
      <div className={["container", styles.inner].join(" ")}>
        <div className={[home.head, styles.head].join(" ")}>
          <span className={home.eyebrow} data-head>
            How a post is made
          </span>
          <h2 id="pipeline-title" className={home.title} data-head>
            From idea to post, <em>one agent at a time.</em>
          </h2>
          <p className={home.lead} data-head>
            Every stage is its own agent with one job. You stay in the loop at every step, and nothing ships until you approve it.
          </p>
        </div>

        <div className={styles.rail}>
          <div className={styles.line}>
            <span className={styles.lineFill} data-line />
          </div>
          <div className={styles.walker} data-walker>
            <Mascot pose="walking" size={88} label="Wovi walking the pipeline" />
          </div>
        </div>

        <div className={styles.track} data-track>
          {PIPELINE.map((p, i) => (
            <article key={p.id} className={[styles.stage, p.tag === "Next" ? styles.stageNext : ""].join(" ")} data-stage>
              <div className={styles.stageTop}>
                <span className={styles.num}>0{i + 1}</span>
                <span className={[home.chip, p.tag === "Next" ? home.chipCobalt : p.tag === "Live" ? home.chipBlaze : ""].join(" ")}>{p.tag}</span>
              </div>
              <span className={styles.stageIcon}>
                <Icon name={ICONS[i]} size={22} />
              </span>
              <h3 className={styles.stageTitle}>{p.title}</h3>
              <p className={styles.stageText}>{p.text}</p>
              <span className={styles.stageAgent}>
                <span className={styles.agentDot} />
                {p.agent}
              </span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
