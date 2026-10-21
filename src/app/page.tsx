import { Mascot } from "@/components/brand/Mascot";
import { Wordmark } from "@/components/brand/Wordmark";
import { SiteFooter, SiteHeader } from "@/components/site/SiteHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import styles from "./page.module.css";

const AGENTS = [
  { name: "Hook Writer", does: "Opens a post or a short with one line people stop for.", tag: "Hooks", icon: "bolt" as const },
  { name: "Caption Writer", does: "Writes the caption to match the clip, the platform and your voice.", tag: "Captions", icon: "spark" as const },
  { name: "Trend Scout", does: "Finds the formats worth trying this week and says why.", tag: "Research", icon: "search" as const },
  { name: "Script Writer", does: "Turns one idea into a tight script with a beginning, a turn and an end.", tag: "Scripts", icon: "film" as const },
  { name: "Hashtag Picker", does: "Picks a small set of tags that fit the post, not a wall of them.", tag: "Reach", icon: "hash" as const },
  { name: "Repurposer", does: "Cuts a long piece into a thread, a carousel and three shorts.", tag: "Repurposing", icon: "copy" as const },
];

export default function Home() {
  return (
    <>
      <SiteHeader active="home" />
      <main>
        <section className={["container", styles.hero].join(" ")}>
          <div className={styles.heroText}>
            <Wordmark variant="theme" height={96} className={styles.heroWordmark} label="WOVI" />
            <h1 className={styles.title}>Your vision. Agents that execute it.</h1>
            <p className={styles.lead}>
              A marketplace of single-purpose AI agents for social content. Each agent does one job and does it well: hooks, scripts, captions, hashtags,
              repurposing.
            </p>
            <div className={styles.actions}>
              <ButtonLink href="/design" size="lg" trailing={<Icon name="arrow-right" />}>
                See the design system
              </ButtonLink>
              <Button size="lg" variant="ghost">
                How it works
              </Button>
            </div>
          </div>
          <div className={styles.heroMascot}>
            <Mascot pose="waving" size={320} label="Wovi waving hello" />
          </div>
        </section>

        <section className={["container", styles.agents].join(" ")} aria-labelledby="agents-title">
          <div className={styles.sectionHead}>
            <h2 id="agents-title">One agent, one job</h2>
            <p className="muted">The first agents on the roadmap. Each is built to do a single task to a high standard.</p>
          </div>
          <div className={styles.grid}>
            {AGENTS.map((a) => (
              <Card key={a.name} interactive padding="md" className={styles.agentCard}>
                <span className={styles.agentIcon}>
                  <Icon name={a.icon} size={22} />
                </span>
                <h3 className={styles.agentName}>{a.name}</h3>
                <p className={styles.agentDoes}>{a.does}</p>
                <Tag tone="cobalt">{a.tag}</Tag>
              </Card>
            ))}
          </div>
        </section>

        <section className={["container", styles.promise].join(" ")}>
          <Card variant="tint" padding="lg" className={styles.promiseCard}>
            <div className={styles.promiseText}>
              <h2>No slop. Every agent does one thing.</h2>
              <p className="muted">
                You bring the vision. The agent executes it with care, in your voice, for the platform you post on. When a job runs, Wovi walks. When it is
                done, Wovi celebrates.
              </p>
            </div>
            <div className={styles.promiseMascots}>
              <Mascot pose="walking" size={120} label="Wovi walking: a job is running" />
              <Mascot pose="celebrating" size={120} label="Wovi celebrating: a job is done" />
            </div>
          </Card>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
