"use client";

import { Mascot } from "@/components/brand/Mascot";
import { Mark } from "@/components/brand/Mark";
import { Icon } from "@/components/ui/Icon";
import { Ring } from "./Ring";
import { reveal, useScrollScene } from "./scroll";
import home from "./home.module.css";
import styles from "./Creators.module.css";

const STEPS = [
  { n: "01", title: "Define one job", text: "A clear brief, a few examples, the rules it must never break." },
  { n: "02", title: "Test it against real Brand Brains", text: "Run it on sample briefs and see the fit before anyone else does." },
  { n: "03", title: "List it with a price", text: "You set the credits per run. Buyers see the fit, not a sales page." },
  { n: "04", title: "Earn when it runs", text: "Every run pays the creator. Keep improving it, keep earning." },
];

export function Creators() {
  const ref = useScrollScene<HTMLElement>(({ el, gsap, reduce }) => {
    reveal(gsap, el, "[data-head]", { reduce });
    reveal(gsap, el, "[data-step]", { reduce, stagger: 0.12, y: 30 });
    reveal(gsap, el, "[data-card]", { reduce, y: 50, start: "top 70%" });
  });

  return (
    <section ref={ref} id="creators" className={home.section} aria-labelledby="creators-title">
      <div className={["container", styles.inner].join(" ")}>
        <div className={styles.left}>
          <div className={[home.head, styles.head].join(" ")}>
            <span className={home.eyebrow} data-head>
              For creators
            </span>
            <h2 id="creators-title" className={home.title} data-head>
              Build an agent. <em>Earn when it runs.</em>
            </h2>
            <p className={home.lead} data-head>
              If you can describe one job well, you can build an agent for it. WOVI handles the running, the scoring and the payouts.
            </p>
          </div>
          <ol className={styles.steps}>
            {STEPS.map((s) => (
              <li key={s.n} className={styles.step} data-step>
                <span className={styles.stepNum}>{s.n}</span>
                <span>
                  <strong>{s.title}</strong>
                  <span className={styles.stepText}>{s.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className={styles.right}>
          <div className={[home.glass, styles.card].join(" ")} data-card>
            <div className={styles.cardTop}>
              <span className={styles.avatar}>
                <Mark size={26} ink="cream" />
              </span>
              <span className={styles.cardMeta}>
                <strong>Local Shop Storyteller</strong>
                <span>by a creator like you</span>
              </span>
              <Ring value={92} size={44} />
            </div>
            <p className={styles.cardJob}>Turns one thing that happened in the shop today into a post locals will stop for.</p>
            <div className={styles.cardRow}>
              <span className={home.chip}>Hooks</span>
              <span className={home.chip}>Local</span>
              <span className={home.chip}>Short-form</span>
            </div>
            <div className={styles.price}>
              <span>
                <span className={styles.priceLabel}>Price per run</span>
                <span className={styles.priceValue}>
                  <Mark size={16} face={false} /> 2 credits
                </span>
              </span>
              <span className={styles.priceHint}>You set it. You change it any time.</span>
            </div>
            <div className={styles.payout}>
              <span className={styles.payoutLine}>
                <Icon name="bolt" size={16} /> Run finished
              </span>
              <span className={styles.payoutAmount}>+ credits to you</span>
            </div>
            <div className={styles.cheer}>
              <Mascot pose="celebrating" size={120} label="Wovi celebrating a payout" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
