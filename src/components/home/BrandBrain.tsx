"use client";

import { Mascot } from "@/components/brand/Mascot";
import { Icon } from "@/components/ui/Icon";
import { reveal, useScrollScene } from "./scroll";
import home from "./home.module.css";
import styles from "./BrandBrain.module.css";

export function BrandBrain() {
  const ref = useScrollScene<HTMLElement>(({ el, gsap, reduce }) => {
    reveal(gsap, el, "[data-head]", { reduce });
    reveal(gsap, el, "[data-board]", { reduce, y: 40, start: "top 78%" });
    reveal(gsap, el, "[data-tile]", { reduce, stagger: 0.09, y: 24, start: "top 70%" });
  });

  return (
    <section ref={ref} id="brand-brain" className={home.section} aria-labelledby="brain-title">
      <div className={["container", styles.inner].join(" ")}>
        <div className={[home.head, styles.head].join(" ")}>
          <span className="eyebrow" data-head>
            Brand Brain
          </span>
          <h2 id="brain-title" className={[home.title, home.titleSm].join(" ")} data-head>
            Every agent reads your Brand Brain before it writes a word.
          </h2>
          <p className={home.lead} data-head>
            Your voice, your mood board, the posts you wish you had made, and the things you never say. Set it once. Every agent, every run, starts from it. No
            prompts to write.
          </p>
          <ul className={styles.points} data-head>
            <li>
              <Icon name="check" size={18} /> Agents execute your direction, they do not invent one
            </li>
            <li>
              <Icon name="check" size={18} /> Edits you make teach it, with your permission
            </li>
            <li>
              <Icon name="check" size={18} /> One Brand Brain per brand, shared by every agent
            </li>
          </ul>
        </div>

        <div className={[home.panel, styles.board].join(" ")} data-board>
          <div className={styles.boardHead}>
            <span className={home.panelLabel}>Brand Brain</span>
            <span className={styles.boardOwner}>
              <Mascot pose="wait" size={34} label="" /> Set once, read every run
            </span>
          </div>
          <div className={styles.tiles}>
            <div className={[styles.tile, styles.voice].join(" ")} data-tile>
              <span className={styles.tileLabel}>Voice</span>
              <p className={styles.tileBig}>Warm, direct, no hype.</p>
              <div className={styles.sliders}>
                {[
                  ["Playful", "Serious", 32],
                  ["Short", "Long", 24],
                  ["Plain", "Poetic", 40],
                ].map(([a, b, v]) => (
                  <div key={a as string} className={styles.slider}>
                    <span>{a}</span>
                    <span className={styles.sliderTrack}>
                      <span className={styles.sliderKnob} style={{ left: `${v}%` }} />
                    </span>
                    <span>{b}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={[styles.tile, styles.mood].join(" ")} data-tile>
              <span className={styles.tileLabel}>Mood board</span>
              <div className={styles.swatches}>
                <span className={styles.swBlaze} />
                <span className={styles.swCobalt} />
                <span className={styles.swCream} />
                <span className={styles.swGlow} />
              </div>
              <p className={styles.tileSmall}>Early light, flour on hands, Saturday queue.</p>
            </div>

            <div className={[styles.tile, styles.refs].join(" ")} data-tile>
              <span className={styles.tileLabel}>Reference posts</span>
              <div className={styles.refRow}>
                {["The honest price post", "Kitchen at 5am", "Why we closed Mondays"].map((r) => (
                  <span key={r} className={styles.ref}>
                    {r}
                  </span>
                ))}
              </div>
            </div>

            <div className={[styles.tile, styles.doTile].join(" ")} data-tile>
              <span className={styles.tileLabel}>
                <Icon name="check" size={14} /> Do
              </span>
              <ul className={styles.list}>
                <li>Short sentences.</li>
                <li>Real numbers, real names.</li>
                <li>Say the price.</li>
              </ul>
            </div>

            <div className={[styles.tile, styles.dontTile].join(" ")} data-tile>
              <span className={styles.tileLabel}>
                <Icon name="close" size={14} /> Never
              </span>
              <ul className={styles.list}>
                <li>
                  <s>Game-changing</s>
                </li>
                <li>
                  <s>Unlock your potential</s>
                </li>
                <li>
                  <s>Limited time only!</s>
                </li>
              </ul>
            </div>

            <div className={[styles.tile, styles.audience].join(" ")} data-tile>
              <span className={styles.tileLabel}>Audience</span>
              <p className={styles.tileBig}>Locals who walk past twice a week.</p>
              <p className={styles.tileSmall}>They know the shop. They do not know the story.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
