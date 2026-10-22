import type { Metadata } from "next";
import styles from "@/components/builder/Builder.module.css";
import { BuilderShell } from "@/components/builder/BuilderShell";
import { NewPipeline } from "@/components/builder/NewPipeline";
import { requireBuilder } from "@/lib/builder/server";
import { PIPELINE_TEMPLATES } from "@/lib/pipelines/templates";

export const metadata: Metadata = { title: "New pipeline", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function NewPipelinePage() {
  const { user, csrf } = await requireBuilder();
  return (
    <BuilderShell active="pipelines" who={user.name ?? user.email ?? "Builder"}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <span className="eyebrow">Pipelines</span>
          <h1>New pipeline</h1>
          <p className={styles.lead}>Start from a template or from one step. It stays a draft until you publish it.</p>
        </div>
      </div>
      <NewPipeline csrf={csrf} templates={PIPELINE_TEMPLATES.map((t) => ({ id: t.id, name: t.name }))} />
    </BuilderShell>
  );
}
