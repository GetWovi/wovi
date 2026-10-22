import type { Metadata } from "next";
import styles from "@/components/app/App.module.css";
import { AppShell } from "@/components/app/AppShell";
import { ReviewButtons } from "@/components/app/ReviewControls";
import { RunRow } from "@/components/app/RunRow";
import { Mascot } from "@/components/brand/Mascot";
import { currentTime } from "@/components/builder/labels";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { accounts } from "@/lib/accounts/server";
import { can } from "@/lib/accounts/policy";
import { STATE_LABELS, type RunState } from "@/lib/app/results";
import { appPage } from "@/lib/app/server";

export const metadata: Metadata = { title: "History", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const STATES: (RunState | "open")[] = ["open", "needs_review", "ready", "approved", "rejected", "running", "failed"];

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ q?: string; state?: string; agent?: string }> }) {
  const { info, me, workspaceId, csrf, api } = await appPage("/app/history");
  const { q = "", state = "all", agent = "" } = await searchParams;
  const role = await accounts().roleIn(me, workspaceId);
  const editor = role ? can(role, "run_agents") : false;
  const picked = (STATES as string[]).includes(state) ? (state as RunState | "open") : "all";
  const [lineup, runs, all] = await Promise.all([api.lineup(me, workspaceId), api.runs(me, workspaceId, { q, state: picked, agentId: agent || undefined }), api.runs(me, workspaceId)]);
  const open = all.filter((v) => v.state === "needs_review" || v.state === "ready").length;
  const now = currentTime();
  const filtered = Boolean(q || picked !== "all" || agent);

  return (
    <AppShell info={info} active="history">
      <div className={styles.head}>
        <div className={styles.headText}>
          <span className="eyebrow">History</span>
          <h1 className={styles.h1}>Every run, and your say on it</h1>
          <p className={styles.lead}>
            {all.length === 0 ? "Nothing yet." : `${all.length} run${all.length === 1 ? "" : "s"} in this workspace.`}
            {open > 0 ? ` ${open} waiting for a decision.` : ""} A result flagged by a check needs your review before it goes anywhere.
          </p>
        </div>
      </div>

      <form method="get" className={[styles.panel, styles.panelTight, styles.filters].join(" ")}>
        <Input label="Search" name="q" defaultValue={q} placeholder="A word from the idea or the result" leading={<Icon name="search" size={20} />} />
        <Select label="Status" name="state" defaultValue={picked} options={[{ value: "all", label: "Any status" }, { value: "open", label: "Waiting for a decision" }, ...STATES.filter((s) => s !== "open").map((s) => ({ value: s, label: STATE_LABELS[s as RunState] }))]} />
        <Select label="Agent" name="agent" defaultValue={agent} options={[{ value: "", label: "Any agent" }, ...lineup.filter((a) => a.status === "live").map((a) => ({ value: a.id, label: a.name }))]} />
        <div className={styles.actions}>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
          {filtered && (
            <ButtonLink href="/app/history" variant="ghost">
              Clear
            </ButtonLink>
          )}
        </div>
      </form>

      {runs.length === 0 ? (
        <div className={[styles.panel, styles.panelAlt, styles.wovi].join(" ")}>
          <Mascot pose={filtered ? "wait" : "hello"} size={120} />
          <b>{filtered ? "Nothing matches" : "Nothing made yet"}</b>
          <span>{filtered ? "Try another word, or clear the filters." : "Pick an agent and make the first one."}</span>
          {!filtered && (
            <ButtonLink href="/app/make" variant="secondary">
              Make something
            </ButtonLink>
          )}
        </div>
      ) : (
        <div className={styles.runList}>
          {runs.map((v) => (
            <RunRow key={v.run.id} view={v} now={now} action={editor && (v.state === "needs_review" || v.state === "ready") ? <ReviewButtons csrf={csrf} runId={v.run.id} compact /> : undefined} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
