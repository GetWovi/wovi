import type { Metadata } from "next";
import styles from "@/components/builder/Builder.module.css";
import { BuilderShell } from "@/components/builder/BuilderShell";
import { ClipLibrary } from "@/components/builder/ClipLibrary";
import { requireBuilder } from "@/lib/builder/server";
import { appClips } from "@/lib/clips/server";

export const metadata: Metadata = { title: "Clips", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ClipsPage() {
  const { me, user, csrf } = await requireBuilder();
  const lib = appClips();
  const [clips, totals] = await Promise.all([lib.list(me), lib.totals(me)]);
  return (
    <BuilderShell active="clips" who={user.name ?? user.email ?? "Builder"}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <span className="eyebrow">Agent Builder</span>
          <h1>Clips</h1>
          <p className={styles.lead}>Short videos that worked, turned into text the agents can learn from: the hook, the words said, the text on screen and what happens. Check the text, mark it gold or bad, then give it to the agents it should teach.</p>
        </div>
      </div>
      <ClipLibrary csrf={csrf} initialClips={clips} initialTotals={totals} />
    </BuilderShell>
  );
}
