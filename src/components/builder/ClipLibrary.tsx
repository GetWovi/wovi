"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { listClips } from "@/app/builder/clips/actions";
import { RightsCheck } from "@/components/safety/RightsCheck";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { StatTile } from "@/components/ui/StatTile";
import { CLIP_LIMITS } from "@/lib/clips/config";
import type { ClipTotals } from "@/lib/clips/library";
import type { Clip } from "@/lib/clips/types";
import styles from "./Builder.module.css";
import c from "./Clips.module.css";
import { CLIP_STATUS_WORDS, clipDuration, clipSettled, megabytes, money } from "./clip-labels";

type Upload = {
  key: string;
  name: string;
  size: number;
  state: "checking" | "queued" | "uploading" | "done" | "error";
  progress: number;
  error: string | null;
};

const ACCEPT = ".mp4,.mov,.webm,.m4v,video/mp4,video/quicktime,video/webm";
const PARALLEL = 2;

/** The clip's length from the browser, before a byte is sent. Null when the browser cannot tell (some codecs); the server checks again. */
function browserDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    const done = (d: number | null) => {
      URL.revokeObjectURL(url);
      v.removeAttribute("src");
      resolve(d);
    };
    const timer = setTimeout(() => done(null), 8000);
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => {
      clearTimeout(timer);
      done(Number.isFinite(v.duration) ? v.duration : null);
    };
    v.onerror = () => {
      clearTimeout(timer);
      done(null);
    };
    v.src = url;
  });
}

function checkLocal(file: File): string | null {
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  if (!CLIP_LIMITS.extensions.includes(ext) && !CLIP_LIMITS.types.includes(file.type)) return "Not a clip WOVI reads. Use MP4, MOV or WebM.";
  if (file.size === 0) return "The file is empty.";
  if (file.size > CLIP_LIMITS.maxBytes) return `${megabytes(file.size)}; the limit is ${CLIP_LIMITS.maxBytes / 1024 / 1024} MB.`;
  return null;
}

function send(csrf: string, file: File, onProgress: (p: number) => void): Promise<{ ok: true } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/builder/clips/upload");
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-wovi-csrf", csrf);
    xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    xhr.setRequestHeader("x-file-size", String(file.size));
    xhr.setRequestHeader("x-wovi-rights", "yes");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: { ok?: boolean; error?: string } | null = null;
      try {
        body = JSON.parse(xhr.responseText) as { ok?: boolean; error?: string };
      } catch {
        body = null;
      }
      if (xhr.status === 200 && body?.ok) resolve({ ok: true });
      else resolve({ ok: false, error: body?.error ?? `The upload failed (${xhr.status}).` });
    };
    xhr.onerror = () => resolve({ ok: false, error: "The connection dropped. Try again." });
    xhr.send(file);
  });
}

export function ClipLibrary({ csrf, initialClips, initialTotals }: { csrf: string; initialClips: Clip[]; initialTotals: ClipTotals }) {
  const [clips, setClips] = useState(initialClips);
  const [totals, setTotals] = useState(initialTotals);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [rights, setRights] = useState(false);
  const [rightsError, setRightsError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const files = useRef(new Map<string, File>());
  const running = useRef(0);
  const disabled = !totals.enabled;

  const patch = useCallback((key: string, p: Partial<Upload>) => setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...p } : u))), []);

  const refresh = useCallback(async () => {
    const r = await listClips(csrf);
    if (r.ok) {
      setClips(r.value.clips);
      setTotals(r.value.totals);
    }
  }, [csrf]);

  // Starts queued uploads, two at a time. The line lives in a ref, so a re-render never starts one twice.
  const pending = useRef<string[]>([]);
  function pump() {
    while (running.current < PARALLEL && pending.current.length) {
      const key = pending.current.shift()!;
      const file = files.current.get(key);
      if (!file) continue;
      running.current++;
      patch(key, { state: "uploading" });
      void send(csrf, file, (p) => patch(key, { progress: p })).then((r) => {
        running.current--;
        files.current.delete(key);
        patch(key, r.ok ? { state: "done", progress: 1 } : { state: "error", error: r.error });
        void refresh();
        pump();
      });
    }
  }

  async function add(list: FileList | File[] | null) {
    if (!list || disabled) return;
    const picked = Array.from(list);
    if (!picked.length) return;
    if (!rights) {
      setRightsError("Tick the box first.");
      return;
    }
    setRightsError(null);
    const rows: Upload[] = picked.map((f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, name: f.name, size: f.size, state: "checking", progress: 0, error: null }));
    setUploads((u) => [...rows, ...u]);
    for (const [i, f] of picked.entries()) {
      const row = rows[i];
      const problem = checkLocal(f);
      if (problem) {
        patch(row.key, { state: "error", error: problem });
        continue;
      }
      const d = await browserDuration(f);
      if (d !== null && d > CLIP_LIMITS.maxSeconds) {
        patch(row.key, { state: "error", error: `${clipDuration(d)} long; clips can be at most 3:00.` });
        continue;
      }
      files.current.set(row.key, f);
      pending.current.push(row.key);
      patch(row.key, { state: "queued" });
      pump();
    }
  }

  // Polls while anything is in line or being read.
  const busy = clips.some((x) => !clipSettled(x)) || uploads.some((u) => u.state === "uploading" || u.state === "queued");
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => void refresh(), 3000);
    return () => clearInterval(t);
  }, [busy, refresh]);

  const inLine = totals.counts.uploaded + totals.counts.reading + totals.counts.waiting;
  const perMinute = totals.readSeconds > 0 ? money(Math.round((totals.readCostMicroUsd / totals.readSeconds) * 60)) : "none yet";
  const doneCount = uploads.filter((u) => u.state === "done").length;

  return (
    <>
      <div className={c.tiles}>
        <StatTile label="Ready" value={`${totals.counts.ready}`} hint={`of ${clips.length} clip${clips.length === 1 ? "" : "s"}`} emphasis />
        <StatTile label="In line" value={`${inLine}`} hint={totals.counts.failed ? `${totals.counts.failed} failed` : "reading in the background"} />
        <StatTile label="Spent today" value={money(totals.spentTodayMicroUsd)} hint={`cap ${money(totals.capMicroUsd)} a day, UTC`} />
        <StatTile label="Spent in all" value={money(totals.totalMicroUsd)} hint="every call, from OpenRouter's usage" />
        <StatTile label="Per minute" value={perMinute} hint="average cost of a minute of clip" />
      </div>

      {!totals.enabled && (
        <p className={[c.notice, c.noticeWarn].join(" ")}>
          <Icon name="warning" size={18} /> Clip samples are switched off on this server (WOVI_CLIP_SAMPLES=off). The clips below stay; nothing is uploaded or read.
        </p>
      )}
      {totals.enabled && totals.provider === null && (
        <p className={[c.notice, c.noticeWarn].join(" ")}>
          <Icon name="warning" size={18} /> No OPENROUTER_API_KEY on this server. Clips upload and wait; they are read once a key is set.
        </p>
      )}
      {totals.enabled && totals.provider === "fake" && (
        <p className={c.notice}>
          <Icon name="info" size={18} /> Clips are read by the fake provider (WOVI_CLIP_PROVIDER=fake). The text is filler, for local work only.
        </p>
      )}

      <Card title="Upload clips" padding="lg">
        <div className={c.uploadGrid}>
          <div className={styles.stack}>
            <div
              className={[c.drop, over ? c.dropOver : "", disabled ? c.dropOff : ""].join(" ")}
              onDragOver={(e) => {
                e.preventDefault();
                if (!disabled) setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                void add(e.dataTransfer.files);
              }}
            >
              <Icon name="film" size={32} />
              <span className={c.dropTitle}>Drop clips here</span>
              <span className={c.dropHint}>MP4, MOV or WebM, up to {CLIP_LIMITS.maxBytes / 1024 / 1024} MB and 3 minutes each. As many as you like at once.</span>
              <label className={c.pick}>
                <Icon name="upload" size={18} /> Choose clips
                <input
                  type="file"
                  accept={ACCEPT}
                  multiple
                  disabled={disabled}
                  className="visually-hidden"
                  onChange={(e) => {
                    void add(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <RightsCheck
              checked={rights}
              error={rightsError}
              onChange={(v) => {
                setRights(v);
                if (v) setRightsError(null);
              }}
            />
          </div>
          <div className={c.queue}>
            <div className={c.queueHead}>
              <span>{uploads.length ? `${doneCount} of ${uploads.length} uploaded` : "Uploads show here, each with its progress."}</span>
              <span className={c.models}>
                Words: {totals.transcribeModel}. Frames: {totals.visionModel}.
              </span>
            </div>
            {uploads.map((u) => (
              <div key={u.key} className={[c.upRow, u.state === "done" ? c.upDone : ""].join(" ")}>
                <span className={c.upIcon}>
                  <Icon name={u.state === "done" ? "check-circle" : u.state === "error" ? "x-circle" : "film"} size={20} />
                </span>
                <span className={c.upName} title={u.name}>
                  {u.name}
                </span>
                <span className={c.upState}>
                  {u.state === "checking" && "Checking"}
                  {u.state === "queued" && "Waiting to upload"}
                  {u.state === "uploading" && `${Math.round(u.progress * 100)}% of ${megabytes(u.size)}`}
                  {u.state === "done" && `Uploaded, ${megabytes(u.size)}`}
                  {u.state === "error" && "Refused"}
                </span>
                {u.error && <span className={c.upError}>{u.error}</span>}
                <span className={c.upBar} aria-hidden="true">
                  <span style={{ width: `${Math.round((u.state === "done" ? 1 : u.progress) * 100)}%` }} />
                </span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {clips.length === 0 ? (
        <EmptyState title="No clips yet" description="Each clip becomes a text sample: its hook, the words said, the text on screen and what happens. Then give it to the agents it should teach." />
      ) : (
        <div className={c.grid}>
          {clips.map((clip) => (
            <ClipCard key={clip.id} clip={clip} />
          ))}
        </div>
      )}
    </>
  );
}

export function ClipStatus({ status }: { status: Clip["status"] }) {
  return <span className={[c.pill, c[`pill_${status}`]].join(" ")}>{CLIP_STATUS_WORDS[status]}</span>;
}

function ClipCard({ clip }: { clip: Clip }) {
  const hook = clip.text?.hook || clip.text?.description;
  return (
    <Link href={`/builder/clips/${clip.id}`} className={c.card}>
      <div className={c.thumb}>
        {clip.poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/builder/files/${clip.poster.id}`} alt="" loading="lazy" />
        ) : (
          <Icon name="film" size={32} />
        )}
        {clip.probe && <span className={c.duration}>{clipDuration(clip.probe.durationSec)}</span>}
      </div>
      <div className={c.cardBody}>
        <span className={c.cardTitle} title={clip.title}>
          {clip.title}
        </span>
        {clip.status === "failed" || clip.status === "waiting" ? <span className={c.cardError}>{clip.error}</span> : <span className={c.cardHook}>{hook ? `"${hook}"` : clip.status === "ready" ? "No words in this clip." : "Reading the words, the text on screen and what happens."}</span>}
        <div className={c.cardFoot}>
          <ClipStatus status={clip.status} />
          {clip.status === "ready" && <Tag tone={clip.label === "gold" ? "blaze" : "neutral"}>{clip.label}</Tag>}
          {clip.assignments.length > 0 && (
            <span>
              {clip.assignments.length} agent{clip.assignments.length === 1 ? "" : "s"}
            </span>
          )}
          {clip.flags.safety.length + clip.flags.injection.length > 0 && <span className={c.cardError}>Flagged</span>}
          {clip.costMicroUsd > 0 && <span>{money(clip.costMicroUsd)}</span>}
        </div>
      </div>
    </Link>
  );
}
