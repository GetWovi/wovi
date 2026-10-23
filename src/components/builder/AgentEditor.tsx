"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { saveAgent, setAgentStatus, type StatusAction } from "@/app/builder/actions";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Chip";
import { Select, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import type { UpdateInput, VersionInfo } from "@/lib/agents/registry";
import { validateAgentBody, type AgentSpec } from "@/lib/agents/spec";
import type { BoardItem, Sample } from "@/lib/builder/types";
import { BoardPanel } from "./BoardPanel";
import styles from "./Builder.module.css";
import { StatusPill } from "./BuilderShell";
import { bodyOf, type Body } from "./editor-types";
import { CATEGORY_LABELS, ago } from "./labels";
import { SamplesPanel } from "./SamplesPanel";
import { SHARE_CHOICES, savedWords } from "./release-choice";
import { parseIssues } from "./spec-errors";
import { SpecForm, type SaveOptions } from "./SpecForm";

const CONFIRM: Record<StatusAction, { title: string; body: string; button: string }> = {
  publish: { title: "Publish this agent?", body: "It goes live in the gallery for everyone, at its current version. You can take it back any time.", button: "Publish" },
  unpublish: { title: "Take it back to draft?", body: "It leaves the gallery. Saved versions and samples stay.", button: "Back to draft" },
  hide: { title: "Hide this agent?", body: "Built and kept, but out of every list until its drop. Unhide returns it to the status it had.", button: "Hide" },
  unhide: { title: "Unhide this agent?", body: "It returns to the status it had before it was hidden.", button: "Unhide" },
};

export function AgentEditor({ csrf, spec, versions, updatedAt, samples, board, now, initialTab, canary = false }: { csrf: string; spec: AgentSpec; versions: VersionInfo[]; updatedAt: string; samples: Sample[]; board: BoardItem[]; now: number; initialTab?: string; canary?: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [body, setBody] = useState<Body>(() => bodyOf(spec));
  const [tab, setTab] = useState(initialTab && ["spec", "samples", "board", "json"].includes(initialTab) ? initialTab : "spec");
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<StatusAction | null>(null);
  const [acting, setActing] = useState(false);
  const [json, setJson] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  // A live agent's new version goes out as a canary (docs/stats.md).
  const [share, setShare] = useState("10");

  const saved = useMemo(() => JSON.stringify(bodyOf(spec)), [spec]);
  const changed = JSON.stringify(body) !== saved;
  const issues = useMemo(() => {
    const r = validateAgentBody({ ...body, id: spec.id, version: spec.version });
    return r.ok ? [] : parseIssues(r.errors);
  }, [body, spec.id, spec.version]);

  async function save(opts: SaveOptions) {
    setSaving(true);
    try {
      const r = await saveAgent(csrf, spec.id, body as unknown as UpdateInput, { ...opts, canaryShare: canary && spec.status === "live" ? Number(share) : null });
      if (!r.ok) return toast({ tone: "warning", title: r.error, description: r.issues?.slice(0, 3).join(" ") });
      toast({ tone: "success", ...savedWords(r.value.version, r.value.canary) });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function act(action: StatusAction) {
    setActing(true);
    try {
      const r = await setAgentStatus(csrf, spec.id, action);
      if (!r.ok) return toast({ tone: "warning", title: r.error });
      toast({ tone: "success", title: `Now ${r.value.status}` });
      setConfirm(null);
      router.refresh();
    } finally {
      setActing(false);
    }
  }

  function applyJson() {
    setJsonError(null);
    try {
      const parsed = JSON.parse(json) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Expected one JSON object.");
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, version, owner, status, visibility, quality, ...rest } = parsed;
      setBody({ ...body, ...(rest as Partial<Body>) });
      setTab("spec");
      toast({ tone: "info", title: "Applied to the form", description: "Check the validation card, then save." });
    } catch (err) {
      setJsonError((err as Error).message);
    }
  }

  const status = spec.status;
  const statusActions: StatusAction[] = status === "hidden" ? ["unhide"] : status === "live" ? ["unpublish", "hide"] : ["publish", "hide"];
  const actionLabel: Record<StatusAction, string> = { publish: "Publish", unpublish: "Back to draft", hide: "Hide", unhide: "Unhide" };

  return (
    <>
      <div className={styles.head}>
        <div className={styles.headText}>
          <Link href="/builder" className={styles.crumb}>
            <Icon name="chevron-right" size={16} style={{ rotate: "180deg" }} /> Agents
          </Link>
          <div className={styles.titleRow}>
            <h1>{spec.name}</h1>
            <StatusPill status={status} />
          </div>
          <div className={styles.meta}>
            <span className={styles.mono}>{spec.id}</span>
            <span>v{spec.version}</span>
            <span>
              {versions.length} version{versions.length === 1 ? "" : "s"}
            </span>
            <Tag tone="cobalt">{CATEGORY_LABELS[spec.category]}</Tag>
            <span>{spec.visibility === "public" ? "Public once live" : "This workspace only"}</span>
            {spec.quality.score !== null && <Badge score={spec.quality.score} label="Score" size="sm" />}
            <span>Edited {ago(updatedAt, now)}</span>
          </div>
        </div>
        <div className={styles.actions}>
          <ButtonLink href={`/builder/agents/${spec.id}/bench`} variant="ghost" leading={<Icon name="play" size={18} />}>
            Test bench
          </ButtonLink>
          <ButtonLink href={`/builder/agents/${spec.id}/versions`} variant="ghost" leading={<Icon name="clock" size={18} />}>
            Versions
          </ButtonLink>
          <ButtonLink href={`/builder/agents/${spec.id}/quality`} variant="ghost" leading={<Icon name="check-circle" size={18} />}>
            Quality
          </ButtonLink>
          <ButtonLink href={`/builder/agents/${spec.id}/stats`} variant="ghost" leading={<Icon name="chart" size={18} />}>
            Stats
          </ButtonLink>
          {statusActions.map((a) => (
            <Button key={a} variant={a === "publish" ? "secondary" : "ghost"} onClick={() => setConfirm(a)}>
              {actionLabel[a]}
            </Button>
          ))}
          {canary && status === "live" && <Select aria-label="How the new version goes out" value={share} onChange={(e) => setShare(e.target.value)} options={SHARE_CHOICES} />}
          <Button onClick={() => save({ bump: "patch", note: "" })} loading={saving} disabled={!changed || issues.length > 0}>
            Save
          </Button>
        </div>
      </div>

      <Tabs
        variant="line"
        value={tab}
        onChange={(id) => {
          if (id === "json") setJson(JSON.stringify(body, null, 2));
          setTab(id);
        }}
        items={[
          { id: "spec", label: "Spec", count: issues.length || undefined },
          { id: "samples", label: "Samples", count: samples.length },
          { id: "board", label: "Mood board", count: board.length },
          { id: "json", label: "JSON" },
        ]}
      />

      {tab === "spec" && <SpecForm body={body} issues={issues} changed={changed} saving={saving} onChange={setBody} onSave={save} />}
      {tab === "samples" && <SamplesPanel csrf={csrf} spec={spec} samples={samples} />}
      {tab === "board" && <BoardPanel csrf={csrf} agentId={spec.id} items={board} />}
      {tab === "json" && (
        <Card title="Raw spec" className={styles.section} actions={<span className={styles.hint}>The versioned body, without id and version</span>}>
          <Textarea aria-label="Spec JSON" value={json} onChange={(e) => setJson(e.target.value)} className={styles.json} rows={28} error={jsonError ?? undefined} spellCheck={false} />
          <div className={styles.actions}>
            <Button variant="secondary" onClick={applyJson}>
              Apply to the form
            </Button>
            <Button variant="ghost" onClick={() => setJson(JSON.stringify(body, null, 2))}>
              Reset to the form
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                void navigator.clipboard?.writeText(json);
                toast({ tone: "info", title: "Copied" });
              }}
              leading={<Icon name="copy" />}
            >
              Copy
            </Button>
          </div>
        </Card>
      )}

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm ? CONFIRM[confirm].title : ""}
        footer={
          confirm && (
            <>
              <Button variant="ghost" onClick={() => setConfirm(null)} disabled={acting}>
                Cancel
              </Button>
              <Button onClick={() => act(confirm)} loading={acting}>
                {CONFIRM[confirm].button}
              </Button>
            </>
          )
        }
      >
        {confirm && <p>{CONFIRM[confirm].body}</p>}
        {confirm === "publish" && changed && <p style={{ marginTop: 12 }}>You have unsaved changes. Publishing serves version {spec.version} as it is saved; save first if the changes should go live.</p>}
      </Modal>
    </>
  );
}
