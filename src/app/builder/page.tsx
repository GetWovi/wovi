import type { Metadata } from "next";
import { AgentList, IdleMascot } from "@/components/builder/AgentList";
import styles from "@/components/builder/Builder.module.css";
import { BuilderShell } from "@/components/builder/BuilderShell";
import { currentTime } from "@/components/builder/labels";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { requireBuilder } from "@/lib/builder/server";

export const metadata: Metadata = { title: "Builder", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function BuilderHomePage() {
  const { builder, me, user } = await requireBuilder();
  const agents = await builder.listAgents(me);
  const now = currentTime();
  return (
    <BuilderShell active="agents" who={user.name ?? user.email ?? "Builder"}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <span className="eyebrow">Agent Builder</span>
          <h1>Agents</h1>
          <p className={styles.lead}>Every WOVI agent starts here. Draft it from a sentence, shape the spec, add samples and references, then publish it to the gallery.</p>
        </div>
        <div className={styles.headSide}>
          {agents.length > 0 && <IdleMascot />}
          <ButtonLink href="/builder/new" leading={<Icon name="plus" />}>
            New agent
          </ButtonLink>
        </div>
      </div>
      <AgentList agents={agents} now={now} />
    </BuilderShell>
  );
}
