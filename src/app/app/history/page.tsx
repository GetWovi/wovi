import type { Metadata } from "next";
import styles from "@/components/app/App.module.css";
import { AppShell } from "@/components/app/AppShell";
import { PipelineDecideButtons } from "@/components/app/PipelineDecide";
import { PipelineRow } from "@/components/app/PipelineParts";
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
import { readClientFilter } from "@/lib/team/client-filter";
import { appTeam } from "@/lib/team/server";

export const metadata: Metadata = { title: "History", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const STATES: (RunState | "open")[] = ["open", "needs_review", "ready", "approved", "rejected", "running", "failed"];

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ q?: string; state?: string; agent?: string }> }) {
  const { info, me, workspaceId, csrf, api } = await appPage("/app/history");
  const { q = "", state = "all", agent = "" } = await searchParams;
  const role = await accounts().roleIn(me, workspaceId);
  const editor = role ? can(role, "run_agents") : false;
  const picked = (STATES as string[]).includes(state) ? (state as RunState | "open") : "all";
  const onlyPipelines = agent === "pipelines";
  const [lineup, runs, all, pipes, allPipes] = await Promise.all([
    api.lineup(me, workspaceId),
    onlyPipelines ? Promise.resolve([]) : api.runs(me, workspaceId, { q, state: picked, agentId: agent || undefined }),
    api.runs(me, workspaceId),
    agent && !onlyPipelines ? Promise.resolve([]) : api.pipelineRuns(me, workspaceId, { q, state: picked }),
    api.pipelineRuns(me, workspaceId),
  ]);
  // Working for one client (phase 11): only that client's brands.
  const clientId = await readClientFilter(workspaceId);
  const client = clientId ? ((await appTeam().clients(me, workspaceId)).find((c) => c.id === clientId) ?? null) : null;
  const forClient = (brand: { id: string } | null) => !client || Boolean(brand && client.brandBrainIds.includes(brand.id));
  const open = all.filter((v) => v.state === "needs_review" || v.state === "ready").length + allPipes.filter((v) => v.state === "needs_review" || v.state === "ready" || v.state === "waiting").length;
  const total = all.length + allPipes.length;
  // Runs and pipeline runs together, newest first. A pipeline's own step runs show inside it.
  const rows = [...runs.filter((v) => forClient(v.run.brandBrain)).map((v) => ({ kind: "run" as const, at: v.run.createdAt, v })), ...pipes.filter((v) => forClient(v.run.brandBrain)).map((v) => ({ kind: "pipeline" as const, at: v.run.createdAt, v }))].sort((a, b) => b.at.localeCompare(a.at));
  const now = currentTime();
  const filtered = Boolean(q || picked !== "all" || agent);

  return (
    <AppShell info={info} active="history">
      <div className={styles.head}>
        <div className={styles.headText}>
          <span className="eyebrow">History</span>
          <h1 className={styles.h1}>Every run, and your say on it</h1>
          <p className={styles.lead}>
            {total === 0 ? "Nothing yet." : `${total} run${total === 1 ? "" : "s"} in this workspace${allPipes.length ? `, ${allPipes.length} of them pipelines` : ""}.`}
            {open > 0 ? ` ${open} waiting for a decision.` : ""} A result flagged by a check needs your review before it goes anywhere.
            {client ? ` Showing ${client.name} only; pick All clients at the top to see everything.` : ""}
          </p>
        </div>
      </div>

      <form method="get" className={[styles.panel, styles.panelTight, styles.filters].join(" ")}>
        <Input label="Search" name="q" defaultValue={q} placeholder="A word from the idea or the result" leading={<Icon name="search" size={20} />} />
        <Select label="Status" name="state" defaultValue={picked} options={[{ value: "all", label: "Any status" }, { value: "open", label: "Waiting for a decision" }, ...STATES.filter((s) => s !== "open").map((s) => ({ value: s, label: STATE_LABELS[s as RunState] }))]} />
        <Select label="Agent" name="agent" defaultValue={agent} options={[{ value: "", label: "Any agent" }, { value: "pipelines", label: "Pipelines only" }, ...lineup.filter((a) => a.status === "live").map((a) => ({ value: a.id, label: a.name }))]} />
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

      {rows.length === 0 ? (
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
          {rows.map((r) =>
            r.kind === "run" ? (
              <RunRow key={r.v.run.id} view={r.v} now={now} action={editor && (r.v.state === "needs_review" || r.v.state === "ready") ? <ReviewButtons csrf={csrf} runId={r.v.run.id} compact /> : undefined} />
            ) : (
              <PipelineRow key={r.v.run.id} view={r.v} now={now} action={editor && (r.v.state === "needs_review" || r.v.state === "ready") ? <PipelineDecideButtons csrf={csrf} id={r.v.run.id} /> : undefined} />
            ),
          )}
        </div>
      )}
    </AppShell>
  );
}
