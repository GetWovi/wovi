"use client";

import { useState } from "react";
import { createVideo, videoFromRun } from "@/app/app/video/actions";
import styles from "@/components/app/App.module.css";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";

/** Stage 1: a pasted script, one scene per paragraph. Free. */
export function NewVideo({ csrf, editor }: { csrf: string; editor: boolean }) {
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await createVideo(csrf, { title, script });
    // On success the action moves to the video's page.
    setBusy(false);
    if (!r.ok) setError(r.error);
  }
  return (
    <form className={styles.stack} onSubmit={go}>
      <Input label="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
      <Textarea label="Script" rows={8} value={script} onChange={(e) => setScript(e.target.value)} maxLength={4000} hint="One scene per paragraph, up to 8. Each paragraph is what is said over that scene." placeholder="Every croissant on this counter started three days ago." />
      {error && (
        <p className={styles.fieldError} role="alert">
          <Icon name="warning" size={16} /> {error}
        </p>
      )}
      <div className={styles.actions}>
        <Button type="submit" size="lg" loading={busy} disabled={!editor || !script.trim()} trailing={<Icon name="arrow-right" size={18} />}>
          Next: the storyboard
        </Button>
      </div>
    </form>
  );
}

/** "Make this into a video" on a Script Writer result: its sections become the scenes. */
export function VideoFromRun({ csrf, runId }: { csrf: string; runId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        variant="secondary"
        loading={busy}
        leading={<Icon name="film" size={18} />}
        onClick={async () => {
          setBusy(true);
          const r = await videoFromRun(csrf, runId);
          setBusy(false);
          if (!r.ok) setError(r.error);
        }}
      >
        Make this into a video
      </Button>
      {error && <span className={styles.fieldError}>{error}</span>}
    </>
  );
}
