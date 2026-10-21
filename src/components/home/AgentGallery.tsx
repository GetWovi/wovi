"use client";

import { useCallback, type PointerEvent } from "react";
import { Mascot } from "@/components/brand/Mascot";
import { Icon } from "@/components/ui/Icon";
import { AGENTS } from "./demo-data";
import { Ring } from "./Ring";
import { reveal, useScrollScene } from "./scroll";
import home from "./home.module.css";
import styles from "./AgentGallery.module.css";

export function AgentGallery() {
  const ref = useScrollScene<HTMLElement>(({ el, gsap, reduce }) => {
    reveal(gsap, el, "[data-head]", { reduce });
    reveal(gsap, el, "[data-card]", { reduce, stagger: 0.06, y: 36, start: "top 75%" });
  });

  // Tilt towards the pointer; the light follows it.
  const onMove = useCallback((e: PointerEvent<HTMLElement>) => {
    const card = e.currentTarget;
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    card.style.setProperty("--mx", `${x * 100}%`);
    card.style.setProperty("--my", `${y * 100}%`);
    card.style.setProperty("--rx", `${(0.5 - y) * 8}deg`);
    card.style.setProperty("--ry", `${(x - 0.5) * 10}deg`);
  }, []);
  const onLeave = useCallback((e: PointerEvent<HTMLElement>) => {
    const card = e.currentTarget;
    card.style.setProperty("--rx", "0deg");
    card.style.setProperty("--ry", "0deg");
  }, []);

  return (
    <section ref={ref} id="agents" className={home.section} aria-labelledby="agents-title">
      <div className={home.wash} />
      <div className="container">
        <div className={home.head}>
          <span className={home.eyebrow} data-head>
            The marketplace
          </span>
          <h2 id="agents-title" className={home.title} data-head>
            One agent. One job. <em>Done properly.</em>
          </h2>
          <p className={home.lead} data-head>
            No all-in-one assistant that is average at everything. Pick the agent for the task, give it a brief, and get work that is scored against your Brand
            Brain before you see it.
          </p>
        </div>
        <div className={styles.grid}>
          {AGENTS.map((a) => (
            <article key={a.name} className={[styles.card, a.status === "next" ? styles.next : ""].join(" ")} data-card onPointerMove={onMove} onPointerLeave={onLeave}>
              <div className={styles.light} />
              <div className={styles.top}>
                <span className={styles.icon}>
                  <Icon name={a.icon} size={22} />
                </span>
                {a.status === "live" ? <Ring value={a.fit} size={44} /> : <span className={[home.chip, home.chipCobalt].join(" ")}>Next</span>}
              </div>
              <h3 className={styles.name}>{a.name}</h3>
              <p className={styles.job}>{a.job}</p>
              <div className={styles.foot}>
                <span className={home.chip}>{a.tag}</span>
                {a.status === "live" ? (
                  <span className={styles.run}>
                    Run <Icon name="arrow-right" size={16} />
                  </span>
                ) : (
                  <span className={styles.sleep}>
                    <Mascot pose="sleeping" size={30} label="" />
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
        <p className={styles.note}>Brand fit shown is a sample. Scores come from your own Brand Brain once you set it up.</p>
      </div>
    </section>
  );
}
