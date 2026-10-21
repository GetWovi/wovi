"use client";

import { useEffect, useRef, useState } from "react";
import { Mascot } from "@/components/brand/Mascot";
import { Wordmark } from "@/components/brand/Wordmark";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { gsapReady } from "./scroll";
import { LiveDemo } from "./LiveDemo";
import { ShaderField } from "./ShaderField";
import home from "./home.module.css";
import styles from "./Hero.module.css";

const HEADLINE = ["Your", "vision.", "Agents", "that", "execute", "it."];

export function Hero() {
  const root = useRef<HTMLElement>(null);
  const [look, setLook] = useState<[number, number]>([0.2, 0.1]);

  // Wovi follows the pointer with its eyes; the body leans a little.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let next: [number, number] | null = null;
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      next = [Math.max(-1, Math.min(1, x * 1.2)), Math.max(-1, Math.min(1, y * 1.2))];
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          if (next) setLook(next);
        });
      }
    };
    el.addEventListener("pointermove", onMove);
    return () => {
      el.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Kinetic entrance: the wordmark draws in, words rise, the panel lifts.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const g = gsapReady();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx = g.context(() => {
      if (reduce) {
        g.set(el.querySelectorAll("[data-rise], [data-word], [data-panel]"), { opacity: 1, y: 0, rotateX: 0 });
        return;
      }
      const tl = g.timeline({ defaults: { ease: "power3.out" } });
      tl.fromTo(el.querySelectorAll("[data-rise]"), { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.12 }, 0.1)
        .fromTo(el.querySelectorAll("[data-word]"), { opacity: 0, y: 46, rotateX: -40 }, { opacity: 1, y: 0, rotateX: 0, duration: 1.0, stagger: 0.07 }, 0.35)
        .fromTo(el.querySelectorAll("[data-panel]"), { opacity: 0, y: 40, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 1.2 }, 0.5);
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={root} className={styles.hero} aria-label="Introduction">
      <ShaderField />
      <div className={home.grain} />
      <div className={styles.fade} />
      <div className={["container", styles.inner].join(" ")}>
        <div className={styles.copy}>
          <span className={home.eyebrow} data-rise>
            Pre-launch. One job per agent.
          </span>
          <div className={styles.wordmark} data-rise>
            <Wordmark variant="theme" height={112} lit label="WOVI" />
          </div>
          <h1 className={styles.h1} aria-label="Your vision. Agents that execute it.">
            {HEADLINE.map((w, i) => (
              <span key={i} className={styles.wordWrap} aria-hidden="true">
                <span className={[styles.word, i === 1 || i === 5 ? styles.wordBlaze : ""].join(" ")} data-word>
                  {w}
                </span>
              </span>
            ))}
          </h1>
          <p className={styles.lead} data-rise>
            A marketplace of AI agents for social content, each built for one job: hooks, scripts, captions, storyboards, voice and video. They read your Brand
            Brain first, then execute in your voice.
          </p>
          <div className={styles.actions} data-rise>
            <ButtonLink href="#agents" size="lg" trailing={<Icon name="arrow-right" />}>
              Meet the agents
            </ButtonLink>
            <ButtonLink href="#pipeline" size="lg" variant="ghost" className={styles.ghost}>
              See how a post is made
            </ButtonLink>
          </div>
        </div>
        <div className={styles.stage} data-panel>
          <div className={styles.wovi}>
            <Mascot pose="standing" size={150} ink="cream" look={look} label="Wovi, watching the cursor" />
          </div>
          <LiveDemo />
        </div>
      </div>
      <a href="#pipeline" className={styles.cue} aria-label="Scroll to see how a post is made">
        <span className={styles.cueLine} />
        <span>Scroll</span>
      </a>
    </section>
  );
}
