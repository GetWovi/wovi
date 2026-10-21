import type { Metadata } from "next";
import { BatchRun } from "@/components/builder/BatchRun";
import styles from "@/components/builder/Builder.module.css";
import { BuilderShell } from "@/components/builder/BuilderShell";
import { currentTime } from "@/components/builder/labels";
import { requireBuilder } from "@/lib/builder/server";

export const metadata: Metadata = { title: "Batch run", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function BatchPage() {
  const { builder, me, user, csrf } = await requireBuilder();
  const [agents, plan, batches] = await Promise.all([builder.listAgents(me), builder.bench.planBatch(me), builder.bench.listBatches(me, 5)]);
  const now = currentTime();
  return (
    <BuilderShell active="batch" who={user.name ?? user.email ?? "Builder"}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <span className="eyebrow">Test bench</span>
          <h1>Batch run</h1>
          <p className={styles.lead}>Run every sample of every live agent at once, so a change to a shared piece, a guardrail or a model slot, is checked across all of them in one table.</p>
        </div>
      </div>
      <BatchRun csrf={csrf} agents={agents.sort((a, b) => a.name.localeCompare(b.name))} initialPlan={plan} batches={batches} now={now} />
    </BuilderShell>
  );
}
