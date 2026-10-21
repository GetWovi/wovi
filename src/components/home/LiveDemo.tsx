"use client";

import { useEffect, useRef, useState } from "react";
import { Mascot } from "@/components/brand/Mascot";
import { Icon } from "@/components/ui/Icon";
import { DEMO_RUNS } from "./demo-data";
import { Ring } from "./Ring";
import { reveal, useScrollScene } from "./scroll";
import home from "./home.module.css";
import styles from "./LiveDemo.module.css";

type Phase = "typing" | "working" | "hooks" | "caption" | "frames" | "done";
const ORDER: Phase[] = ["typing", "working", "hooks", "caption", "frames", "done"];

/**
 * A job, start to finish: an idea is typed, three agents run, and hooks, a
 * caption and a storyboard land one after another. Deterministic and local.
 */
export function LiveDemo() {
  const [run, setRun] = useState(0);
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<Phase>("typing");
  const [fit, setFit] = useState(0);
  const [started, setStarted] = useState(false);
  const timers = useRef<number[]>([]);

  const ref = useScrollScene<HTMLElement>(({ el, gsap, reduce }) => {
    reveal(gsap, el, "[data-head]", { reduce });
    reveal(gsap, el, "[data-panel]", { reduce, y: 40, start: "top 80%" });
  });

  // Start the first run when the panel scrolls into view.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setStarted(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);

  useEffect(() => {
    if (!started) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const data = DEMO_RUNS[run % DEMO_RUNS.length];
    const later = (fn: () => void, ms: number) => {
      timers.current.push(window.setTimeout(fn, reduce ? 0 : ms));
    };
    later(() => {
      setTyped("");
      setPhase("typing");
      setFit(0);
    }, 0);
    if (reduce) {
      later(() => {
        setTyped(data.idea);
        setPhase("done");
        setFit(data.fit);
      }, 0);
    } else {
      const chars = data.idea.split("");
      chars.forEach((_, i) => later(() => setTyped(data.idea.slice(0, i + 1)), 300 + i * 24));
      const typedBy = 300 + chars.length * 24;
      later(() => setPhase("working"), typedBy + 400);
      later(() => setPhase("hooks"), typedBy + 1600);
      later(() => setPhase("caption"), typedBy + 2600);
      later(() => setPhase("frames"), typedBy + 3500);
      later(() => {
        setPhase("done");
        setFit(data.fit);
      }, typedBy + 4400);
      later(() => setRun((r) => r + 1), typedBy + 10500);
    }
    return () => {
      timers.current.forEach((id) => clearTimeout(id));
      timers.current = [];
    };
  }, [run, started]);

  const data = DEMO_RUNS[run % DEMO_RUNS.length];
  const at = (p: Phase) => ORDER.indexOf(phase) >= ORDER.indexOf(p);
  const agents = [
    { name: "Hook Writer", done: at("hooks") },
    { name: "Caption Writer", done: at("caption") },
    { name: "Storyboarder", done: at("frames") },
  ];

  return (
    <section ref={ref} id="demo" className={home.section} aria-labelledby="demo-title">
      <div className="container">
        <div className={home.head}>
          <span className="eyebrow" data-head>
            A job, start to finish
          </span>
          <h2 id="demo-title" className={home.title} data-head>
            Type the idea. The agents do the rest.
          </h2>
          <p className={home.lead} data-head>
            One sentence in. Three agents run, each on its own task. Every result is checked against your Brand Brain before you see it.
          </p>
        </div>

        <div className={[home.panel, styles.panel].join(" ")} data-panel aria-live="polite" aria-label="Agents at work, sample run">
          <div className={styles.left}>
            <div className={styles.bar}>
              <span className={styles.barTitle}>New job</span>
              <span className={[home.chip, home.chipCobalt].join(" ")}>
                <Icon name="spark" size={12} /> Brand Brain: bakery
              </span>
            </div>
            <div className={styles.idea}>
              <span className={styles.ideaLabel}>Idea</span>
              <p className={styles.ideaText}>
                {typed}
                {phase === "typing" && <span className={styles.caret} aria-hidden="true" />}
              </p>
            </div>
            <ul className={styles.agents}>
              {agents.map((a) => {
                const state = a.done ? "done" : at("working") ? "running" : "waiting";
                return (
                  <li key={a.name} className={[styles.agent, styles[state]].join(" ")}>
                    <span className={styles.agentWovi}>
                      <Mascot pose={state === "done" ? "done" : state === "running" ? "move" : "wait"} size={40} label="" />
                    </span>
                    <span className={styles.agentName}>{a.name}</span>
                    <span className={styles.agentState}>{state === "done" ? "Job done" : state === "running" ? "On the move" : "Waiting for a job"}</span>
                  </li>
                );
              })}
            </ul>
            <div className={styles.fit}>
              <Ring value={fit} size={48} />
              <span className={styles.fitText}>
                <strong>Brand fit</strong>
                <span className={styles.fitHint}>{phase === "done" ? "Ready for your approval" : at("working") ? "Agents running" : "Scored before you see it"}</span>
              </span>
            </div>
          </div>

          <div className={styles.results}>
            <div className={[styles.card, at("hooks") ? styles.cardIn : ""].join(" ")}>
              <div className={styles.cardHead}>
                <span className={styles.cardTitle}>Hooks</span>
                <span className={home.chip}>3 options</span>
              </div>
              <ol className={styles.hooks}>
                {data.hooks.map((h, i) => (
                  <li key={i} style={{ transitionDelay: `${i * 90}ms` }}>
                    {h}
                  </li>
                ))}
              </ol>
            </div>
            <div className={[styles.card, at("caption") ? styles.cardIn : ""].join(" ")}>
              <div className={styles.cardHead}>
                <span className={styles.cardTitle}>Caption</span>
                <span className={home.chip}>In your voice</span>
              </div>
              <p className={styles.caption}>{data.caption}</p>
            </div>
            <div className={[styles.card, styles.cardWide, at("frames") ? styles.cardIn : ""].join(" ")}>
              <div className={styles.cardHead}>
                <span className={styles.cardTitle}>Storyboard</span>
                <span className={[home.chip, home.chipCobalt].join(" ")}>Next</span>
              </div>
              <div className={styles.frames}>
                {data.frames.map((f, i) => (
                  <figure key={i} className={styles.frame} style={{ transitionDelay: `${i * 110}ms` }}>
                    <div className={styles.frameArt} data-i={i}>
                      <span className={styles.frameNum}>{i + 1}</span>
                      <span className={styles.frameText}>{data.onScreen[i]}</span>
                    </div>
                    <figcaption>
                      <strong>{f.label}</strong>
                      <span>{f.text}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
