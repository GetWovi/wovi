"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Mascot } from "@/components/brand/Mascot";
import { Avatar } from "@/components/ui/Avatar";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip, Tag } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Tabs } from "@/components/ui/Tabs";
import { CATEGORIES, type Category } from "@/lib/agents/catalog";
import type { BuilderAgentRow } from "@/lib/builder/builder";
import styles from "./Builder.module.css";
import { StatusPill } from "./BuilderShell";
import { CATEGORY_LABELS, PLATFORM_LABELS, ago } from "./labels";

type StatusFilter = "all" | "live" | "draft" | "hidden";

export function AgentList({ agents, now }: { agents: BuilderAgentRow[]; now: number }) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [category, setCategory] = useState<Category | null>(null);
  const [q, setQ] = useState("");

  const counts = useMemo(() => {
    const c = { all: agents.length, live: 0, draft: 0, hidden: 0 };
    for (const a of agents) c[a.status]++;
    return c;
  }, [agents]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return agents.filter(
      (a) =>
        (status === "all" || a.status === status) &&
        (category === null || a.category === category) &&
        (!needle || a.name.toLowerCase().includes(needle) || a.id.includes(needle) || a.job.toLowerCase().includes(needle)),
    );
  }, [agents, status, category, q]);

  if (agents.length === 0) {
    return (
      <EmptyState
        title="No agents yet"
        description="Describe the first one in a sentence and the builder drafts the whole spec."
        action={<ButtonLink href="/builder/new">New agent</ButtonLink>}
      />
    );
  }

  return (
    <>
      <div className={styles.filters}>
        <Tabs
          variant="pill"
          value={status}
          onChange={(id) => setStatus(id as StatusFilter)}
          items={[
            { id: "all", label: "All", count: counts.all },
            { id: "live", label: "Live", count: counts.live },
            { id: "draft", label: "Draft", count: counts.draft },
            { id: "hidden", label: "Hidden", count: counts.hidden },
          ]}
        />
        <div className={styles.search}>
          <Input aria-label="Search agents" placeholder="Search by name, id or job" value={q} onChange={(e) => setQ(e.target.value)} leading={<Icon name="search" size={20} />} />
        </div>
      </div>
      <div className={styles.chips}>
        {CATEGORIES.map((c) => (
          <Chip key={c} selected={category === c} onClick={() => setCategory(category === c ? null : c)}>
            {CATEGORY_LABELS[c]}
          </Chip>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState size="sm" pose="wait" title="Nothing matches" description="Try another word, or clear the filters." />
      ) : (
        <div className={styles.list}>
          {shown.map((a) => (
            <Link key={a.id} href={`/builder/agents/${a.id}`} className={styles.rowLink}>
              <Card interactive padding="none" className={styles.row}>
                <Avatar name={a.name} kind="agent" size={56} />
                <div className={styles.rowMain}>
                  <span className={styles.rowName}>{a.name}</span>
                  <span className={styles.rowJob}>{a.job}</span>
                </div>
                <div className={styles.rowTags}>
                  <Tag tone="cobalt">{CATEGORY_LABELS[a.category]}</Tag>
                  <span className={styles.platforms}>
                    {a.platforms.map((p) => (
                      <span key={p}>{PLATFORM_LABELS[p]}</span>
                    ))}
                  </span>
                </div>
                <div className={styles.rowVersion}>
                  <StatusPill status={a.status} />
                  <small>
                    v{a.version} · {a.versions} version{a.versions === 1 ? "" : "s"}
                  </small>
                </div>
                <div className={styles.rowEdited}>
                  <span>{ago(a.updatedAt, now)}</span>
                  <small>last edited</small>
                </div>
                <Icon name="chevron-right" size={22} className={styles.rowChevron} />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

/** Wovi waiting beside the title: the builder is idle. */
export function IdleMascot() {
  return <Mascot pose="wait" size={88} />;
}
