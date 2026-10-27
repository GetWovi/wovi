import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "@/components/app/App.module.css";
import { AppShell } from "@/components/app/AppShell";
import { NewVideo } from "@/components/video/NewVideo";
import { Icon } from "@/components/ui/Icon";
import { accounts } from "@/lib/accounts/server";
import { can } from "@/lib/accounts/policy";
import { appPage } from "@/lib/app/server";
import { appVideo, videoAllowed } from "@/lib/video/server";

export const metadata: Metadata = { title: "Make a video", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const STAGE_WORDS = { script: "Script", storyboard: "Storyboard ready", done: "Video ready" } as const;

export default async function VideosPage() {
  const { info, me, workspaceId, csrf } = await appPage("/app/video");
  if (!videoAllowed(info.user)) notFound();
  const role = await accounts().roleIn(me, workspaceId);
  const editor = role ? can(role, "run_agents") : false;
  const studio = appVideo();
  const videos = await studio.list(me, workspaceId);
  const plan = studio.price(null, "plan");
  const planPrice = plan.free ? "" : ` · up to ${plan.credits} credit${plan.credits === 1 ? "" : "s"}`;

  return (
    <AppShell info={info} active="make">
      <div className={styles.head}>
        <div className={styles.headText}>
          <Link href="/app/make" className={styles.crumb}>
            <Icon name="arrow-left" size={16} /> All agents
          </Link>
          <h1 className={styles.h1}>Make a video</h1>
          <p className={styles.lead}>Your idea, the kind of video, then a storyboard you check panel by panel. Approve it and the video is made. Nothing costs more until you say so.</p>
        </div>
      </div>
      <section className={[styles.panel, styles.section].join(" ")} aria-label="New video">
        <NewVideo csrf={csrf} editor={editor} planPrice={planPrice} />
      </section>
      {videos.length > 0 && (
        <section className={[styles.panel, styles.section].join(" ")} aria-label="Your videos">
          <span className="eyebrow">Your videos</span>
          <ul className={styles.stackTight}>
            {videos.map((v) => (
              <li key={v.id}>
                <Link href={`/app/video/${v.id}`}>{v.title}</Link> <span className={styles.chip}>{STAGE_WORDS[v.stage]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AppShell>
  );
}
