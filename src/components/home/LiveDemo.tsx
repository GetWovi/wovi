"use client";

import { useEffect, useRef, useState } from "react";
import { Mascot } from "@/components/brand/Mascot";
import { Icon } from "@/components/ui/Icon";
import { DEMO_RUNS } from "./demo-data";
import { Ring } from "./Ring";
import home from "./home.module.css";
import styles from "./LiveDemo.module.css";

type Phase = "typing" | "working" | "hooks" | "caption" | "frames" | "done";

/**
 * The agent at work: an idea is typed, three agents run, and hooks, a caption
 * and a storyboard land one after another. Deterministic and client-side.
 */
export function LiveDemo() {
  const [run, setRun] = useState(0);
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<Phase>("typing");
  const [fit, setFit] = useState(0);
  const timers = useRef<number[]>([]);
  const reduce = useRef(false);

  useEffect(() => {
    reduce.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const data = DEMO_RUNS[run % DEMO_RUNS.length];
    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(fn, reduce.current ? 0 : ms);
      timers.current.push(id);
    };
    later(() => {
      setTyped("");
      setPhase("typing");
      setFit(0);
    }, 0);

    if (reduce.current) {
      later(() => {
        setTyped(data.idea);
        setPhase("done");
        setFit(data.fit);
      }, 0);
      return () => {
        timers.current.forEach((id) => clearTimeout(id));
        timers.current = [];
      };
    }

    // type the idea
    const chars = data.idea.split("");
    chars.forEach((_, i) => later(() => setTyped(data.idea.slice(0, i + 1)), 260 + i * 26));
    const typedBy = 260 + chars.length * 26;
    later(() => setPhase("working"), typedBy + 350);
    later(() => setPhase("hooks"), typedBy + 1500);
    later(() => setPhase("caption"), typedBy + 2500);
    later(() => setPhase("frames"), typedBy + 3400);
    later(() => {
      setPhase("done");
      setFit(data.fit);
    }, typedBy + 4300);
    later(() => setRun((r) => r + 1), typedBy + 9800);

    return () => {
      timers.current.forEach((id) => clearTimeout(id));
      timers.current = [];
    };
  }, [run]);

  const data = DEMO_RUNS[run % DEMO_RUNS.length];
  const order: Phase[] = ["typing", "working", "hooks", "caption", "frames", "done"];
  const at = (p: Phase) => order.indexOf(phase) >= order.indexOf(p);
  const working = phase === "working";

  return (
    <div className={[home.glass, styles.panel].join(" ")} aria-live="polite" aria-label="Agents at work, sample run">
      <div className={styles.bar}>
        <span className={styles.dots} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className={styles.barTitle}>New job</span>
        <span className={[home.chip, styles.brain].join(" ")}>
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

      <div className={styles.agents}>
        {[
          { name: "Hook Writer", on: at("working"), done: at("hooks") },
          { name: "Caption Writer", on: at("working"), done: at("caption") },
          { name: "Storyboarder", on: at("working"), done: at("frames") },
        ].map((a) => (
          <span key={a.name} className={[styles.agent, a.on ? styles.agentOn : "", a.done ? styles.agentDone : ""].join(" ")}>
            {a.done ? <Icon name="check" size={14} /> : a.on ? <Mascot pose="walking" size={18} ink="cream" label="" /> : <span className={styles.idle} />}
            {a.name}
          </span>
        ))}
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
                  <span className={styles.frameText}>{["We stopped.", "5:40am", "Saturday"][i]}</span>
                  <span className={styles.frameGrid} aria-hidden="true" />
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

      <div className={styles.foot}>
        <div className={styles.fit}>
          <Ring value={fit} size={40} />
          <span>
            <strong>Brand fit</strong>
            <span className={styles.fitHint}>{phase === "done" ? "Ready for approval" : working ? "Agents running" : "Scoring against your Brand Brain"}</span>
          </span>
        </div>
        {phase === "done" && (
          <span className={styles.doneMark}>
            <Mascot pose="celebrating" size={34} ink="cream" label="" />
          </span>
        )}
      </div>
    </div>
  );
}
