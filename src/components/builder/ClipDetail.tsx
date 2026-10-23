"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { assignClip, removeClip, retryClip, unassignClip, updateClip } from "@/app/builder/clips/actions";
import { Mascot } from "@/components/brand/Mascot";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Chip";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { CLIP_TEXT_LIMITS, type Clip, type ClipCall, type ClipPlatform } from "@/lib/clips/types";
import styles from "./Builder.module.css";
import { ClipStatus } from "./ClipLibrary";
import c from "./Clips.module.css";
import { CLIP_PLATFORM_WORDS, CLIP_STATUS_WORDS, clipDuration, clipSettled, megabytes, money, rowsFor } from "./clip-labels";

type AgentPick = { id: string; name: string; job: string; status: string };

/** The seven text launch agents first, in the product doc's order. */
const LAUNCH_ORDER = ["trend-scout", "idea-generator", "hook-writer", "script-writer", "caption-writer", "hashtag-picker", "repurposer"];

const STEP_WORDS: Record<ClipCall["step"], string> = { transcript: "Spoken words", frames: "Frames" };

export function ClipDetail({ csrf, clip, calls, agents }: { csrf: string; clip: Clip; calls: ClipCall[]; agents: AgentPick[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const t = clip.text;
  const [title, setTitle] = useState(clip.title);
  const [label, setLabel] = useState(clip.label);
  const [note, setNote] = useState(clip.note);
  const [hook, setHook] = useState(t?.hook ?? "");
  const [transcript, setTranscript] = useState(t?.transcript ?? "");
  const [onScreen, setOnScreen] = useState(t?.onScreenText ?? "");
  const [description, setDescription] = useState(t?.description ?? "");
  const [platform, setPlatform] = useState<ClipPlatform | "">(t?.platform ?? "");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Refreshes while the clip is in line or being read.
  useEffect(() => {
    if (clipSettled(clip)) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [clip, router]);

  const assigned = new Map(clip.assignments.map((a) => [a.agentId, a]));
  const sorted = [...agents].sort((a, b) => {
    const ia = LAUNCH_ORDER.indexOf(a.id);
    const ib = LAUNCH_ORDER.indexOf(b.id);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.name.localeCompare(b.name);
  });
  const changed =
    title !== clip.title ||
    label !== clip.label ||
    note !== clip.note ||
    (t !== null && (hook !== t.hook || transcript !== t.transcript || onScreen !== t.onScreenText || description !== t.description || (platform || null) !== t.platform));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("save");
    try {
      const r = await updateClip(csrf, clip.id, {
        title,
        label,
        note,
        ...(t ? { hook, transcript, onScreenText: onScreen, description, platform: platform || null } : {}),
      });
      if (!r.ok) return setError(r.error);
      toast({ tone: "success", title: "Clip saved", description: clip.assignments.length ? `Its ${clip.assignments.length} sample${clip.assignments.length === 1 ? "" : "s"} follow the edit.` : undefined });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function assign() {
    setBusy("assign");
    setError(null);
    try {
      const r = await assignClip(csrf, clip.id, picked);
      if (!r.ok) return setError(r.error);
      if (r.value.problems.length) setError(r.value.problems.join(" "));
      if (r.value.added.length) toast({ tone: "success", title: `Added to ${r.value.added.length} agent${r.value.added.length === 1 ? "" : "s"}`, description: "The test bench runs it with every new version." });
      setPicked([]);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function unassign(agentId: string) {
    setBusy(`un:${agentId}`);
    try {
      const r = await unassignClip(csrf, clip.id, agentId);
      if (!r.ok) return setError(r.error);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function retry() {
    setBusy("retry");
    try {
      const r = await retryClip(csrf, clip.id);
      if (!r.ok) return setError(r.error);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("remove");
    try {
      const r = await removeClip(csrf, clip.id);
      if (!r.ok) return setError(r.error);
      toast({ tone: "success", title: "Clip removed" });
      router.push("/builder/clips");
    } finally {
      setBusy(null);
    }
  }

  const probe = clip.probe;
  const flags = [...clip.flags.safety.map((f) => `Content rule (${f.category.replace(/_/g, " ")}) in ${f.field.replace(/_/g, " ")}: "${f.match}"`), ...clip.flags.injection.map((f) => `Reads like an instruction in ${f.field.replace(/_/g, " ")}: "${f.match}". Kept as data, never followed.`)];

  return (
    <>
      <div className={styles.head}>
        <div className={styles.headText}>
          <Link href="/builder/clips" className={styles.crumb}>
            <Icon name="arrow-left" size={16} /> All clips
          </Link>
          <div className={styles.titleRow}>
            <h1>{clip.title}</h1>
            <ClipStatus status={clip.status} />
            {clip.status === "ready" && <Tag tone={clip.label === "gold" ? "blaze" : "neutral"}>{clip.label}</Tag>}
          </div>
          <div className={styles.meta}>
            {probe && <span>{clipDuration(probe.durationSec)}</span>}
            {t?.platform && <span>{CLIP_PLATFORM_WORDS[t.platform]}</span>}
            <span>{money(clip.costMicroUsd)} to read</span>
            {clip.edited && <span>Edited by a builder</span>}
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className={styles.fieldError}>
          <Icon name="warning" size={16} /> {error}
        </p>
      )}

      <div className={c.detail}>
        <div className={c.col}>
          <Card padding="sm" className={c.o1}>
            <video className={c.player} src={`/builder/clips/${clip.id}/video`} poster={clip.poster ? `/builder/files/${clip.poster.id}` : undefined} controls preload="metadata" playsInline />
          </Card>

          {!clipSettled(clip) || clip.status === "failed" ? (
            <Card padding="lg" className={c.o2}>
              <div className={c.reading}>
                <Mascot pose={clip.status === "failed" ? "wait" : clip.status === "waiting" ? "wait" : "move"} size={72} />
                <div className={c.readingText}>
                  <strong>{CLIP_STATUS_WORDS[clip.status]}</strong>
                  <span className={styles.hint}>
                    {clip.status === "uploaded" && (clip.error ?? "In line to be read. A few clips are read at once.")}
                    {clip.status === "reading" && "Taking out the sound and three frames, then reading the words and the text on screen."}
                    {(clip.status === "waiting" || clip.status === "failed") && clip.error}
                  </span>
                  <div className={c.steps}>
                    <span className={[c.step, probe ? c.stepDone : ""].join(" ")}>Length</span>
                    <span className={[c.step, clip.poster ? c.stepDone : ""].join(" ")}>First frame</span>
                    <span className={[c.step, clip.transcript ? c.stepDone : ""].join(" ")}>Spoken words</span>
                    <span className={[c.step, clip.frames ? c.stepDone : ""].join(" ")}>On-screen text</span>
                  </div>
                  {(clip.status === "failed" || clip.status === "waiting") && (
                    <div className={styles.actions}>
                      <Button size="sm" variant="secondary" loading={busy === "retry"} onClick={() => void retry()} leading={<Icon name="refresh" size={16} />}>
                        {clip.status === "failed" ? "Retry" : "Try now"}
                      </Button>
                      <span className={styles.hint}>Steps already done are kept and not paid for again.</span>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ) : null}

          <Card title="Use as a sample" padding="lg" className={c.o4}>
            <div className={styles.stack}>
              <p className={styles.hint}>Each agent gets the clip as a {clip.label} sample: its form filled from the clip and the ideal output from what the clip says and shows. The bench runs it with every new version, and the quality checks compare drafts with it. Edits here reach those samples.</p>
              <div className={c.agents}>
                {sorted.map((a) => {
                  const on = assigned.get(a.id);
                  return (
                    <label key={a.id} className={c.agentRow}>
                      {on ? (
                        <Icon name="check-circle" size={20} />
                      ) : (
                        <input type="checkbox" disabled={clip.status !== "ready"} checked={picked.includes(a.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, a.id] : p.filter((x) => x !== a.id)))} />
                      )}
                      <span className={c.agentName}>
                        {a.name}
                        <small>{on ? `Sample of v${on.version}` : a.job}</small>
                      </span>
                      {on && (
                        <>
                          <Link href={`/builder/agents/${a.id}?tab=samples`} className={styles.hint}>
                            Open
                          </Link>
                          <Button size="sm" variant="ghost" loading={busy === `un:${a.id}`} onClick={(e) => (e.preventDefault(), void unassign(a.id))}>
                            Remove
                          </Button>
                        </>
                      )}
                    </label>
                  );
                })}
              </div>
              <div className={styles.actions}>
                <Button variant="secondary" disabled={clip.status !== "ready" || picked.length === 0} loading={busy === "assign"} onClick={() => void assign()}>
                  {picked.length ? `Add to ${picked.length} agent${picked.length === 1 ? "" : "s"}` : "Pick agents"}
                </Button>
                {clip.status !== "ready" && <span className={styles.hint}>Once the clip is read.</span>}
              </div>
            </div>
          </Card>

          <Card padding="md" className={c.o8}>
            <div className={styles.actions}>
              {confirmRemove ? (
                <>
                  <Button variant="primary" size="sm" loading={busy === "remove"} onClick={() => void remove()}>
                    Remove the clip{clip.assignments.length ? ` and its ${clip.assignments.length} sample${clip.assignments.length === 1 ? "" : "s"}` : ""}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(false)}>
                    Keep it
                  </Button>
                </>
              ) : (
                <Button variant="ghost" size="sm" disabled={clip.status === "reading"} onClick={() => setConfirmRemove(true)}>
                  Remove clip
                </Button>
              )}
              <span className={styles.hint}>What it cost stays in the totals.</span>
            </div>
          </Card>
        </div>

        <div className={c.col}>
          <Card title="The text sample" padding="lg" className={c.o3}>
            <form className={styles.stack} onSubmit={save}>
              <div className={styles.fieldGrid}>
                <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={CLIP_TEXT_LIMITS.title} />
                <Select label="Kind" value={label} onChange={(e) => setLabel(e.target.value as "gold" | "bad")} options={[{ value: "gold", label: "Gold: the ideal" }, { value: "bad", label: "Bad: what to avoid" }]} />
              </div>
              {t ? (
                <>
                  <Input label="Hook" value={hook} onChange={(e) => setHook(e.target.value)} maxLength={CLIP_TEXT_LIMITS.hook} hint="The first line people hear or read." />
                  <Textarea label="Spoken words" rows={rowsFor(transcript)} value={transcript} onChange={(e) => setTranscript(e.target.value)} maxLength={CLIP_TEXT_LIMITS.transcript} hint="With rough [m:ss] stamps where the model gave them." />
                  <Textarea label="On-screen text" rows={rowsFor(onScreen)} value={onScreen} onChange={(e) => setOnScreen(e.target.value)} maxLength={CLIP_TEXT_LIMITS.onScreenText} hint="One line per caption or text overlay." />
                  <Textarea label="What happens" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={CLIP_TEXT_LIMITS.description} />
                  <Select
                    label="Platform"
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value as ClipPlatform | "")}
                    options={[{ value: "", label: "Not sure (vertical short video)" }, ...(Object.keys(CLIP_PLATFORM_WORDS) as ClipPlatform[]).map((p) => ({ value: p, label: CLIP_PLATFORM_WORDS[p] }))]}
                  />
                </>
              ) : (
                <p className={styles.hint}>The text appears here once the clip is read. Title and kind can be set now.</p>
              )}
              <Input label="Why" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What makes it good or bad" maxLength={CLIP_TEXT_LIMITS.note} />
              <div className={styles.actions}>
                <Button type="submit" loading={busy === "save"} disabled={!changed}>
                  Save
                </Button>
                <span className={styles.hint}>Text from a clip is material for the agents, never instructions to them.</span>
              </div>
            </form>
          </Card>

          <Card title="The file" padding="md" className={c.o5}>
            <dl className={c.facts}>
              <dt>File</dt>
              <dd>{clip.file.name}</dd>
              <dt>Size</dt>
              <dd>{megabytes(clip.file.sizeBytes)}</dd>
              {probe && (
                <>
                  <dt>Length</dt>
                  <dd>{clipDuration(probe.durationSec)}</dd>
                  <dt>Frame</dt>
                  <dd>{probe.width && probe.height ? `${probe.width} x ${probe.height}${probe.height > probe.width ? ", vertical" : ""}` : "unknown"}</dd>
                  <dt>Sound</dt>
                  <dd>{probe.hasAudio ? "yes" : "none"}</dd>
                </>
              )}
              <dt>Rights</dt>
              <dd>Confirmed {new Date(clip.rights.at).toISOString().slice(0, 16).replace("T", " ")} UTC</dd>
              {t && (
                <>
                  <dt>Platform</dt>
                  <dd>{t.platformWhy}</dd>
                </>
              )}
            </dl>
          </Card>

          <Card title="Cost" padding="md" className={c.o6}>
            {calls.length === 0 ? (
              <p className={styles.hint}>No model calls yet.</p>
            ) : (
              <div className={c.callsWrap}>
                <table className={c.calls}>
                  <thead>
                    <tr>
                      <th>Step</th>
                      <th>Model</th>
                      <th>Used</th>
                      <th>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calls.map((call) => (
                      <tr key={call.id}>
                        <td>
                          {STEP_WORDS[call.step]}
                          {call.status !== "done" && <div className={c.cardError}>{call.status === "started" ? "out now" : (call.error ?? "failed")}</div>}
                        </td>
                        <td className={styles.mono}>{call.model}</td>
                        <td>{call.audioSeconds !== null ? `${call.audioSeconds.toFixed(1)} s of audio` : call.tokensIn || call.tokensOut ? `${call.tokensIn} in, ${call.tokensOut} out` : ""}</td>
                        <td>
                          {call.costMicroUsd === null ? `up to ${money(call.estimateMicroUsd)}` : money(call.costMicroUsd)}
                          {call.costEstimated ? " (est.)" : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {flags.length > 0 && (
            <Card title="Flagged" padding="md" className={c.o7}>
              <div className={c.flags}>
                {flags.map((f) => (
                  <span key={f} className={c.flag}>
                    <Icon name="warning" size={16} /> {f}
                  </span>
                ))}
                <span className={styles.hint}>A flag never blocks keeping the clip. A bench run with a flagged sample is refused by the content rules like any request.</span>
              </div>
            </Card>
          )}

        </div>
      </div>
    </>
  );
}
