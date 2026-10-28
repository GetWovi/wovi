import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "@/components/app/App.module.css";
import { AppShell } from "@/components/app/AppShell";
import { NewVideo } from "@/components/video/NewVideo";
import v from "@/components/video/Video.module.css";
import { Icon } from "@/components/ui/Icon";
import { accounts } from "@/lib/accounts/server";
import { can } from "@/lib/accounts/policy";
import { appPage } from "@/lib/app/server";
import { motionLook, sceneSvg } from "@/lib/video/motion";
import { appVideo, videoAllowed } from "@/lib/video/server";
import { rendering, type VideoProject } from "@/lib/video/studio";
import { styleOf } from "@/lib/video/styles";

export const metadata: Metadata = { title: "Make a video", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const STAGE_WORDS = { script: "Plan", storyboard: "Storyboard", done: "Video ready" } as const;
const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** The draft's thumbnail: its first picture, or the first motion graphics frame. */
function Thumb({ video }: { video: VideoProject }) {
  const aspect = video.brief?.aspect ?? "9:16";
  const first = video.scenes.find((s) => s.imageFileId);
  const s = video.scenes[0];
  if (video.brief?.style === "motion" && s) {
    const svg = sceneSvg({ top: s.text ?? "", bottom: s.bottom ?? "", shape: s.shape ?? "circle", seconds: s.seconds }, 0.8, motionLook(video.brief.vibe, aspect), { fadeOut: false });
    return (
      <span className={v.thumb} style={{ background: "#0B1230" }}>
        <span className={v.thumbSvg} dangerouslySetInnerHTML={{ __html: svg }} />
      </span>
    );
  }
  return (
    <span className={v.thumb}>
      {first?.imageFileId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/app/video/${video.id}/file/${first.imageFileId}`} alt="" loading="lazy" />
      ) : (
        <Icon name="film" size={28} />
      )}
    </span>
  );
}

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
          <p className={styles.lead}>Tell WOVI your idea. It suggests the settings, you confirm, then you arrange the storyboard and the video is made. You see the price before every step.</p>
        </div>
      </div>
      <section className={[styles.panel, styles.section].join(" ")} aria-label="New video">
        <NewVideo csrf={csrf} editor={editor} planPrice={planPrice} />
      </section>
      {videos.length > 0 && (
        <section className={[styles.panel, styles.section].join(" ")} aria-label="Your videos">
          <span className="eyebrow">Your videos</span>
          <ul className={v.drafts}>
            {videos.map((x) => (
              <li key={x.id}>
                <Link href={`/app/video/${x.id}`} className={v.draft}>
                  <Thumb video={x} />
                  <span className={v.draftText}>
                    <b>{x.title}</b>
                    <span className={v.draftMeta}>
                      <span className={[v.stagePill, x.stage === "done" ? v.stagePillDone : ""].join(" ")}>{rendering(x) ? "Being made" : STAGE_WORDS[x.stage]}</span>
                      {x.brief && <span>{styleOf(x.brief.style).label}</span>}
                      <span>
                        {x.scenes.length} scene{x.scenes.length === 1 ? "" : "s"}
                      </span>
                      <time dateTime={x.updatedAt}>{DATE.format(new Date(x.updatedAt))}</time>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AppShell>
  );
}
