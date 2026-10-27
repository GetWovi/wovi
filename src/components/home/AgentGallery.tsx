"use client";

import Link from "next/link";
import { Mascot } from "@/components/brand/Mascot";
import { Icon } from "@/components/ui/Icon";
import { AGENTS } from "./demo-data";
import { Ring } from "./Ring";
import { reveal, useScrollScene } from "./scroll";
import home from "./home.module.css";
import styles from "./AgentGallery.module.css";

const STATES = [
  { pose: "move", name: "On the move", when: "A job is running" },
  { pose: "wait", name: "Waiting for a job", when: "The agent is idle" },
  { pose: "done", name: "Job done", when: "The result is ready for you" },
] as const;

export function AgentGallery() {
  const ref = useScrollScene<HTMLElement>(({ el, gsap, reduce }) => {
    reveal(gsap, el, "[data-head]", { reduce });
    reveal(gsap, el, "[data-card]", {
      reduce,
      stagger: 0.06,
      y: 30,
      start: "top 72%",
    });
    reveal(gsap, el, "[data-state]", {
      reduce,
      stagger: 0.12,
      y: 30,
      start: "top 70%",
    });
  });

  return (
    <section
      ref={ref}
      id="agents"
      className={home.section}
      aria-labelledby="agents-title"
    >
      <div className="container">
        <div className={home.head}>
          <span className="eyebrow" data-head>
            The agents
          </span>
          <h2 id="agents-title" className={home.title} data-head>
            One agent, one job. Pick the one for the task.
          </h2>
          <p className={home.lead} data-head>
            No all-in-one assistant that is average at everything. Each agent is
            built and scored on one outcome, so you can see which one is good
            before you use it.
          </p>
        </div>

        <div className={styles.grid}>
          {AGENTS.map((a, i) => {
            const card = (
              <article
                className={[
                  home.panel,
                  home.panelTight,
                  i % 2 ? home.panelAlt : "",
                  styles.card,
                  a.status !== "live" ? styles.next : "",
                ].join(" ")}
                data-card
              >
                <div className={styles.top}>
                  <span
                    className={[
                      home.iconTile,
                      a.status === "live" ? home.iconTileBlaze : "",
                    ].join(" ")}
                  >
                    <Icon name={a.icon} size={22} />
                  </span>
                  {a.status === "live" ? (
                    <Ring value={a.fit} size={44} />
                  ) : (
                    <span className={[home.chip, home.chipCobalt].join(" ")}>
                      {a.status === "coming" ? "Coming" : "Next"}
                    </span>
                  )}
                </div>
                <h3 className={styles.name}>{a.name}</h3>
                <p className={styles.job}>{a.job}</p>
                <div className={styles.foot}>
                  <span className={home.chip}>{a.tag}</span>
                  {a.status === "live" ? (
                    <span className={styles.state}>
                      <span className={styles.stateIdle}>
                        <Mascot pose="wait" size={36} label="" />
                      </span>
                      <span className={styles.stateRun}>
                        <Mascot pose="move" size={36} label="" />
                      </span>
                      <span className={styles.stateText}>
                        <span className={styles.stateIdle}>Waiting</span>
                        <span className={styles.stateRun}>Run</span>
                      </span>
                    </span>
                  ) : (
                    <span className={styles.soon}>
                      {a.status === "coming" ? "Coming soon" : "In the works"}
                    </span>
                  )}
                </div>
              </article>
            );
            // A live agent's card opens its form in the app (sign in first, then straight back to it).
            return a.status === "live" && a.id ? (
              <Link
                key={a.name}
                href={`/app/make/${a.id}`}
                className={styles.cardLink}
                aria-label={`Run ${a.name}`}
              >
                {card}
              </Link>
            ) : (
              <div key={a.name}>{card}</div>
            );
          })}
        </div>
        <p className={styles.note}>
          Brand fit shown is a sample. Real scores come from verified runs
          against your own Brand Brain.
        </p>

        <div className={styles.states}>
          {STATES.map((s, i) => (
            <div
              key={s.pose}
              className={[
                home.panel,
                i === 1 ? home.panelAlt : "",
                styles.stateCard,
              ].join(" ")}
              data-state
            >
              <Mascot
                pose={s.pose}
                size={150}
                label={`Wovi, ${s.name.toLowerCase()}`}
              />
              <span className={styles.stateName}>{s.name}</span>
              <span className={styles.stateWhen}>{s.when}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
