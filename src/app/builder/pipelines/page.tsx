import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { agentIcon } from "@/components/app/agent-icons";
import styles from "@/components/builder/Builder.module.css";
import { BuilderShell, StatusPill } from "@/components/builder/BuilderShell";
import { ago, currentTime } from "@/components/builder/labels";
import e from "@/components/builder/PipelineEditor.module.css";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { requireBuilder } from "@/lib/builder/server";
import { builderPipelines } from "@/lib/pipelines/builder-view";

export const metadata: Metadata = { title: "Pipelines", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function BuilderPipelinesPage() {
  const { me, user } = await requireBuilder();
  const list = await builderPipelines(me);
  const now = currentTime();
  return (
    <BuilderShell active="pipelines" who={user.name ?? user.email ?? "Builder"}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <span className="eyebrow">Agent Builder</span>
          <h1>Pipelines</h1>
          <p className={styles.lead}>Chains of agents that every workspace can start from one form. Each step says where its inputs come from, how it picks, and what happens when a check fails. Customer-made pipelines come later.</p>
        </div>
        <div className={styles.headSide}>
          <ButtonLink href="/builder/pipelines/new" leading={<Icon name="plus" />}>
            New pipeline
          </ButtonLink>
        </div>
      </div>
      <div className={e.list}>
        {list.map(({ spec, updatedAt, versions }) => (
          <Link key={spec.id} href={`/builder/pipelines/${spec.id}`} className={styles.rowLink}>
            <Card interactive padding="none" className={e.row}>
              <div className={e.rowMain}>
                <b>{spec.name}</b>
                <span>{spec.job}</span>
              </div>
              <div className={e.chain}>
                {spec.steps.map((s) => (
                  <Fragment key={s.id}>
                    <span className={e.chainTile} title={s.label}>
                      <Icon name={agentIcon(s.agent.id)} size={18} />
                    </span>
                    <Icon name="chevron-right" size={14} />
                  </Fragment>
                ))}
                <span className={[e.chainTile, e.chainTileEnd].join(" ")} title="You approve">
                  <Icon name="check" size={18} />
                </span>
              </div>
              <div className={e.rowVersion}>
                <StatusPill status={spec.status} />
                <small>
                  v{spec.version} · {versions.length} version{versions.length === 1 ? "" : "s"}
                </small>
              </div>
              <div className={e.rowEdited}>
                <span>{ago(updatedAt, now)}</span>
                <small>last edited</small>
              </div>
              <Icon name="chevron-right" size={22} />
            </Card>
          </Link>
        ))}
      </div>
    </BuilderShell>
  );
}
