import type { Metadata } from "next";
import { BuilderShell } from "@/components/builder/BuilderShell";
import { AuditLog } from "@/components/builder/StatsParts";
import styles from "@/components/builder/Builder.module.css";
import { Card } from "@/components/ui/Card";
import { requireBuilder } from "@/lib/builder/server";

export const metadata: Metadata = { title: "Audit log", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Every agent's versions, publishes and release decisions, newest first. Builders only; anyone else gets a 404. */
export default async function AuditPage() {
  const { builder, me, user } = await requireBuilder();
  const [entries, agents] = await Promise.all([builder.release.audit(me, undefined, 300), builder.listAgents(me)]);
  const names = Object.fromEntries(agents.map((a) => [a.id, a.name]));
  return (
    <BuilderShell active="audit" who={user.name ?? user.email ?? "Builder"}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <h1>Audit log</h1>
          <p className={styles.lead}>Who saved, published, started a canary, promoted or rolled back which version, and when. Automatic stops and refusals by the regression gate are here too. Nothing in it is ever changed.</p>
        </div>
      </div>
      <Card className={styles.section}>
        <AuditLog entries={entries} names={names} />
      </Card>
    </BuilderShell>
  );
}
