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
/* What the live agents do today. Storyboards and voice are later agents, shown as such in the gallery. */
const JOBS = ["Ideas", "Hooks", "Scripts", "Captions", "Hashtags", "Repurposing"];

export function Hero() {
  const root = useRef<HTMLElement>(null);

  // Entrance: eyebrow, lines, lead and buttons rise; the panel settles; the stickers drop in.
  // In-page links ("Meet the agents" and the header's sections) scroll to their section on every click: the router
  // does nothing when the address already ends in that #section, and the pinned scenes above can throw the jump off.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href^="#"]');
      const id = a?.getAttribute("href")?.slice(1);
      const target = id ? document.getElementById(id) : null;
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      history.replaceState(null, "", `#${id}`);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

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
            A lineup of AI agents for social content. Each agent does one task, reads your Brand Brain first, and hands you work you can approve or fix in a
            line. No prompts to write.
          </p>
          <div className={styles.actions} data-rise>
            <ButtonLink href="/sign-in" size="lg" trailing={<Icon name="arrow-right" />}>
              Get started
            </ButtonLink>
            <ButtonLink href="#agents" size="lg" variant="ghost">
              Meet the agents
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
            <Mascot pose="hello" size={300} label="Wovi says hello" />
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
