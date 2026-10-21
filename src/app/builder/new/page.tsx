import type { Metadata } from "next";
import styles from "@/components/builder/Builder.module.css";
import { BuilderShell } from "@/components/builder/BuilderShell";
import { CreateByPrompt } from "@/components/builder/CreateByPrompt";
import { requireBuilder } from "@/lib/builder/server";

export const metadata: Metadata = { title: "New agent", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function NewAgentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { csrf, user } = await requireBuilder();
  const { q } = await searchParams;
  const initial = typeof q === "string" ? q.slice(0, 2000) : undefined;
  return (
    <BuilderShell active="new" who={user.name ?? user.email ?? "Builder"}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <span className="eyebrow">New agent</span>
          <h1>Describe the agent</h1>
          <p className={styles.lead}>One sentence is enough. The builder drafts the whole spec, you shape it in the editor.</p>
        </div>
      </div>
      <CreateByPrompt csrf={csrf} initial={initial} />
    </BuilderShell>
  );
}
