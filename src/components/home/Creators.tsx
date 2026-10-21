"use client";

import { Logo } from "@/components/brand/Logo";
import { Mascot } from "@/components/brand/Mascot";
import { Ring } from "./Ring";
import { reveal, useScrollScene } from "./scroll";
import home from "./home.module.css";
import styles from "./Creators.module.css";

const STEPS = [
  { n: "01", title: "Describe one job", text: "A plain-language brief, sample work you like, and the rules it must never break. No code." },
  { n: "02", title: "Test it on real briefs", text: "Run it against sample Brand Brains, compare versions side by side, and see the fit before anyone else does." },
  { n: "03", title: "List it", text: "Your agent goes in the gallery with a verified score from real runs. Reviews come from real users only." },
  { n: "04", title: "Earn when it runs", text: "Every run pays the creator. Feedback from live runs comes back as suggestions you approve, so it keeps getting better." },
];

export function Creators() {
  const ref = useScrollScene<HTMLElement>(({ el, gsap, reduce }) => {
    reveal(gsap, el, "[data-head]", { reduce });
    reveal(gsap, el, "[data-step]", { reduce, stagger: 0.1, y: 30, start: "top 72%" });
    reveal(gsap, el, "[data-card]", { reduce, y: 50, start: "top 70%" });
  });

  return (
    <section ref={ref} id="creators" className={home.section} aria-labelledby="creators-title">
      <div className="container">
        <div className={home.head}>
          <span className="eyebrow" data-head>
            For creators
          </span>
          <h2 id="creators-title" className={home.title} data-head>
            Build an agent. Earn when it runs.
          </h2>
          <p className={home.lead} data-head>
            If you can describe one job well, you can build an agent for it, with prompts, mood boards and sample work as the only inputs. WOVI runs it, scores
            it and pays you.
          </p>
        </div>

        <div className={styles.inner}>
          <ol className={styles.steps}>
            {STEPS.map((s, i) => (
              <li key={s.n} className={[home.panel, home.panelTight, i % 2 ? home.panelAlt : "", styles.step].join(" ")} data-step>
                <span className={styles.stepNum}>{s.n}</span>
                <strong className={styles.stepTitle}>{s.title}</strong>
                <span className={styles.stepText}>{s.text}</span>
              </li>
            ))}
          </ol>

          <div className={[home.panel, home.panelCobalt, styles.card].join(" ")} data-card>
            <span className={home.panelLabel}>A creator listing</span>
            <div className={styles.cardTop}>
              <span className={styles.avatar}>
                <Logo kind="mark" variant="on-cobalt" height={22} label="" />
              </span>
              <span className={styles.cardMeta}>
                <strong>Local Shop Storyteller</strong>
                <span>by a creator like you</span>
              </span>
              <Ring value={92} size={48} tone="cream" />
            </div>
            <p className={styles.cardJob}>Turns one thing that happened in the shop today into a post locals will stop for.</p>
            <div className={styles.cardRow}>
              {["Hooks", "Local", "Short-form"].map((t) => (
                <span key={t} className={styles.tag}>
                  {t}
                </span>
              ))}
            </div>
            <div className={styles.stats}>
              <span>
                <span className={styles.statLabel}>Verified score</span>
                <span className={styles.statValue}>From real runs</span>
              </span>
              <span>
                <span className={styles.statLabel}>Reviews</span>
                <span className={styles.statValue}>Real users only</span>
              </span>
            </div>
            <div className={styles.cheer}>
              <span className={styles.cheerText}>
                <strong>Job done.</strong>
                <span>The creator earns.</span>
              </span>
              <Mascot pose="done" size={150} ink="cream" label="Wovi, job done" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
