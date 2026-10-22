import type { Metadata } from "next";
import Link from "next/link";
import { AgentCard } from "@/components/app/AgentCard";
import styles from "@/components/app/App.module.css";
import { AppShell } from "@/components/app/AppShell";
import { RunRow } from "@/components/app/RunRow";
import { Sparkle, Sticker } from "@/components/brand/Accents";
import { Mascot } from "@/components/brand/Mascot";
import { currentTime } from "@/components/builder/labels";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { accounts } from "@/lib/accounts/server";
import { can } from "@/lib/accounts/policy";
import { appPage, redirectToOnboarding } from "@/lib/app/server";

export const metadata: Metadata = { title: "Home", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AppHome({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const ctx = await appPage("/app");
  await redirectToOnboarding(ctx);
  const { info, me, workspaceId, api } = ctx;
  const { welcome } = await searchParams;
  const role = await accounts().roleIn(me, workspaceId);
  const editor = role ? can(role, "run_agents") : false;
  const workspaces = await accounts().workspaces.listForUser(info.user.id);
  const current = workspaces.find((w) => w.id === workspaceId);
  const [lineup, brains, recent] = await Promise.all([api.lineup(me, workspaceId), api.brains(me, workspaceId), api.runs(me, workspaceId, { limit: 5 })]);
  const open = recent.filter((r) => r.state === "needs_review" || r.state === "ready").length;
  const running = recent.some((r) => r.state === "queued" || r.state === "running");
  const now = currentTime();
  const first = info.user.name?.split(" ")[0] ?? null;
  const pose = welcome ? "done" : running ? "move" : recent.length === 0 ? "hello" : "wait";
  const stageLine = welcome ? "Your Brand Brain is in. Every agent reads it first." : running ? "A job is on the go." : recent.length === 0 ? "Nothing made yet. Pick an agent to start." : open ? `${open} result${open === 1 ? "" : "s"} waiting for your yes.` : "Waiting for a job.";

  return (
    <AppShell info={info} active="home">
      <section className={[styles.panel, styles.hero].join(" ")}>
        <div className={styles.heroCopy}>
          <span className="eyebrow">{current?.name ?? "Your workspace"}</span>
          <h1 className={styles.h1}>
            {first ? `Hi ${first}. ` : ""}What do you want to <em>make</em> today?
          </h1>
          <p className={styles.lead}>Type the idea, pick the agent, approve the result. Every agent reads your Brand Brain first, so what comes back sounds like you.</p>
          <div className={styles.actions}>
            <ButtonLink href="/app/make" size="lg" trailing={<Icon name="arrow-right" />}>
              Make something
            </ButtonLink>
            {brains.length === 0 ? (
              <ButtonLink href="/app/welcome" size="lg" variant="ghost">
                Build my Brand Brain
              </ButtonLink>
            ) : (
              <ButtonLink href="/app/history" size="lg" variant="ghost">
                See my runs
              </ButtonLink>
            )}
          </div>
        </div>
        <div className={styles.heroStage}>
          <div className={styles.stickers}>
            <Sticker tilt={-6}>idea in</Sticker>
            <span className={styles.stickerTwo}>
              <Sticker tilt={4}>content out</Sticker>
            </span>
          </div>
          <Sparkle size={28} className={styles.sparkleA} />
          <Sparkle size={14} className={styles.sparkleB} />
          <Mascot pose={pose} size={240} className="wovi" label={`Wovi, ${pose === "move" ? "on the move" : pose === "done" ? "job done" : pose === "hello" ? "saying hello" : "waiting for a job"}`} />
          <div className={styles.heroStat}>
            <b>{lineup.filter((a) => a.status === "live").length}</b>
            <span>agents ready</span>
          </div>
        </div>
        <p className="visually-hidden">{stageLine}</p>
      </section>

      <section className={styles.section} id="brands">
        <div className={styles.sectionHead}>
          <div>
            <span className="eyebrow">Brand Brain</span>
            <h2>{brains.length === 1 ? "Your brand" : "Your brands"}</h2>
          </div>
          <Link href="/brand-brain" className={styles.sectionLink}>
            Open Brand Brains <Icon name="arrow-right" size={16} />
          </Link>
        </div>
        <div className={styles.grid3}>
          {brains.map((b) => (
            <Link key={b.id} href={`/brand-brain/${b.id}`} className={styles.cardLink}>
              <article className={[styles.panel, styles.panelTight, styles.brainCard].join(" ")}>
                <div className={styles.brainTop}>
                  <span className={styles.brainMark} aria-hidden="true">
                    {b.name.trim()[0]?.toUpperCase()}
                  </span>
                  <div className={styles.brainName}>
                    <b>{b.name}</b>
                    <span>{b.niche || "No niche yet"}</span>
                  </div>
                </div>
                <p className={styles.brainVoice}>{b.voice || "No voice written yet. Open it to describe how this brand sounds."}</p>
                <div className={styles.chips}>
                  {b.isDefault && <span className={[styles.chip, styles.chipBlaze].join(" ")}>Default</span>}
                  {b.tone.slice(0, 3).map((t) => (
                    <span key={t} className={styles.chip}>
                      {t}
                    </span>
                  ))}
                </div>
              </article>
            </Link>
          ))}
          {editor && (
            <Link href={brains.length ? "/brand-brain/new" : "/app/welcome"} className={styles.cardLink}>
              <article className={[styles.panel, styles.panelTight, styles.addCard].join(" ")}>
                <Icon name="plus" size={28} />
                <b>{brains.length ? "Add a brand or client" : "Build your Brand Brain"}</b>
                <span className={styles.small}>Paste 3 to 5 past posts. We read the voice, you check it.</span>
              </article>
            </Link>
          )}
        </div>
      </section>

      <section className={styles.section} id="agents">
        <div className={styles.sectionHead}>
          <div>
            <span className="eyebrow">The agents</span>
            <h2>One agent, one job</h2>
          </div>
          <Link href="/app/make" className={styles.sectionLink}>
            Pick by what you need <Icon name="arrow-right" size={16} />
          </Link>
        </div>
        <div className={styles.grid4}>
          {lineup.map((a, i) => (
            <AgentCard key={a.id} agent={a} alt={i % 2 === 1} />
          ))}
        </div>
      </section>

      <section className={styles.section} id="recent">
        <div className={styles.sectionHead}>
          <div>
            <span className="eyebrow">Recent</span>
            <h2>Latest runs</h2>
          </div>
          {recent.length > 0 && (
            <Link href="/app/history" className={styles.sectionLink}>
              All runs <Icon name="arrow-right" size={16} />
            </Link>
          )}
        </div>
        {recent.length === 0 ? (
          <div className={[styles.panel, styles.panelAlt, styles.wovi].join(" ")}>
            <Mascot pose="hello" size={120} />
            <b>Nothing made yet</b>
            <span>Your runs land here with their results, ready for your yes or no.</span>
            <ButtonLink href="/app/make" variant="secondary">
              Make the first one
            </ButtonLink>
          </div>
        ) : (
          <div className={styles.runList}>
            {recent.map((v) => (
              <RunRow key={v.run.id} view={v} now={now} />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
