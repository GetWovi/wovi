"use client";

import { useEffect, useRef } from "react";
import { Sparkle, Sticker } from "@/components/brand/Accents";
import { Mascot } from "@/components/brand/Mascot";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { gsapReady } from "./scroll";
import home from "./home.module.css";
import styles from "./Hero.module.css";

const LINES = [["One agent."], ["One job."], ["Content that", "sounds like you."]];
const JOBS = ["Hooks", "Scripts", "Captions", "Storyboards", "Voice", "Repurposing"];

export function Hero() {
  const root = useRef<HTMLElement>(null);

  // Entrance: eyebrow, lines, lead and buttons rise; the panel settles; the stickers drop in.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const g = gsapReady();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx = g.context(() => {
      const all = el.querySelectorAll("[data-rise], [data-line], [data-panel], [data-sticker]");
      if (reduce) {
        g.set(all, { opacity: 1, y: 0, rotate: 0, scale: 1 });
        return;
      }
      const tl = g.timeline({ defaults: { ease: "power3.out" } });
      tl.fromTo(el.querySelectorAll("[data-line]"), { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 1, stagger: 0.1 }, 0.1)
        .fromTo(el.querySelectorAll("[data-rise]"), { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.1 }, 0.15)
        .fromTo(el.querySelector("[data-panel]"), { opacity: 0, y: 36, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 1.1 }, 0.3)
        .fromTo(el.querySelectorAll("[data-sticker]"), { opacity: 0, y: -14, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.7, stagger: 0.12, ease: "back.out(1.6)" }, 0.9);
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={root} className={styles.hero} aria-label="Introduction">
      <div className={["container", styles.inner].join(" ")}>
        <div className={styles.copy}>
          <span className="eyebrow" data-rise>
            WOVI, AI agents for content
          </span>
          <h1 className={styles.h1}>
            {LINES.map((parts, i) => (
              <span key={i} className={styles.line} data-line>
                {parts.map((p, j) => (
                  <span key={j} className={i === 2 && j === 1 ? styles.accent : undefined}>
                    {p}{" "}
                  </span>
                ))}
              </span>
            ))}
          </h1>
          <p className={styles.lead} data-rise>
            A marketplace of AI agents for social content. Each agent does one task, reads your Brand Brain first, and hands you work you can approve or fix in a
            line. No prompts to write.
          </p>
          <div className={styles.actions} data-rise>
            <ButtonLink href="#agents" size="lg" trailing={<Icon name="arrow-right" />}>
              Meet the agents
            </ButtonLink>
            <ButtonLink href="mailto:hello@wovi.fun?subject=Early%20access" size="lg" variant="ghost">
              Early access
            </ButtonLink>
          </div>
        </div>

        <div className={[home.panel, styles.stage].join(" ")} data-panel>
          <Sparkle size={30} className={styles.sparkleA} />
          <Sparkle size={16} className={styles.sparkleB} />
          <div className={styles.stickers}>
            <span data-sticker>
              <Sticker tilt={-7}>one agent</Sticker>
            </span>
            <span data-sticker className={styles.stickerTwo}>
              <Sticker tilt={5}>one job</Sticker>
            </span>
          </div>
          <div className={styles.wovi}>
            <Mascot pose="hello" size={300} ink="cream" label="Wovi says hello" />
          </div>
          <div className={styles.jobs} aria-label="What the agents do">
            {JOBS.map((j) => (
              <span key={j} className={styles.job}>
                {j}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
