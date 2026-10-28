import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "@/components/app/App.module.css";
import { AppShell } from "@/components/app/AppShell";
import { VideoStudio } from "@/components/video/VideoStudio";
import { Icon } from "@/components/ui/Icon";
import { accounts } from "@/lib/accounts/server";
import { can } from "@/lib/accounts/policy";
import { appPage } from "@/lib/app/server";
import { PACK_AGENTS } from "@/lib/video/pack";
import { appVideo, videoAllowed } from "@/lib/video/server";

export const metadata: Metadata = { title: "Make a video", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { info, me, workspaceId, csrf, api } = await appPage(`/app/video/${id}`);
  if (!videoAllowed(info.user)) notFound();
  const studio = appVideo();
  const video = await studio.get(me, workspaceId, id).catch(() => null);
  if (!video) notFound();
  const role = await accounts().roleIn(me, workspaceId);
  const editor = role ? can(role, "run_agents") : false;
  // The post pack's two runs, priced as the agents' own forms price them; null each when nothing is billed.
  const [captions, hashtags] = await Promise.all([PACK_AGENTS.captions, PACK_AGENTS.hashtags].map((agent) => api.agentPrice(me, workspaceId, agent).catch(() => null)));

  return (
    <AppShell info={info} active="make">
      <div className={styles.head}>
        <div className={styles.headText}>
          <Link href="/app/video" className={styles.crumb}>
            <Icon name="arrow-left" size={16} /> All videos
          </Link>
          <h1 className={styles.h1}>{video.title}</h1>
        </div>
      </div>
      <VideoStudio csrf={csrf} initial={video} prices={studio.prices(video)} packPrice={{ captions: captions?.estimate ?? null, hashtags: hashtags?.estimate ?? null }} hasBrand={(await api.brains(me, workspaceId).catch(() => [])).length > 0} editor={editor} />
    </AppShell>
  );
}
