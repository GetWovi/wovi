"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addSample, removeSample, uploadFile } from "@/app/builder/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip, Tag } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import type { AgentSpec } from "@/lib/agents/spec";
import type { StoredFile } from "@/lib/builder/storage";
import { BUILDER_LIMITS, type Sample } from "@/lib/builder/types";
import styles from "./Builder.module.css";
import { FilePick } from "./FilePick";
import { RunInputField, asRunInputs, type InputValues } from "./RunInputs";

export function SamplesPanel({ csrf, spec, samples }: { csrf: string; spec: AgentSpec; samples: Sample[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = useState<InputValues>({});
  const [label, setLabel] = useState<"gold" | "bad">("gold");
  const [title, setTitle] = useState("");
  const [idealOutput, setIdealOutput] = useState("");
  const [note, setNote] = useState("");
  const [links, setLinks] = useState("");
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(kind: "image" | "text", file: File): Promise<StoredFile | null> {
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("file", file);
    const r = await uploadFile(csrf, fd);
    if (!r.ok) {
      setError(r.error);
      return null;
    }
    return r.value;
  }

  async function onImageInput(key: string, list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    setUploading(key);
    try {
      const stored: StoredFile[] = [];
      for (const f of Array.from(list)) {
        const s = await upload("image", f);
        if (s) stored.push(s);
      }
      setValues((v) => ({ ...v, [key]: [...((v[key] as StoredFile[] | undefined) ?? []), ...stored] }));
    } finally {
      setUploading(null);
    }
  }

  async function onTextFile(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    setUploading("__files");
    try {
      const s = await upload("text", list[0]);
      if (s) setFiles((f) => [...f, s]);
    } finally {
      setUploading(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await addSample(csrf, spec.id, {
        label,
        title,
        inputs: asRunInputs(spec, values),
        idealOutput,
        note,
        links: links.split("\n").map((s) => s.trim()).filter(Boolean),
        fileIds: files.map((f) => f.id),
      });
      if (!r.ok) return setError(r.error);
      toast({ tone: "success", title: "Sample saved", description: `Kept with version ${r.value.version}.` });
      setValues({});
      setTitle("");
      setIdealOutput("");
      setNote("");
      setLinks("");
      setFiles([]);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const r = await removeSample(csrf, spec.id, id);
    if (!r.ok) return toast({ tone: "warning", title: r.error });
    router.refresh();
  }

  return (
    <div className={styles.columns}>
      <div className={styles.stack}>
        {samples.length === 0 ? (
          <EmptyState title="No samples yet" description="Golden samples show the agent what great looks like. The test bench runs every new version against them." />
        ) : (
          <div className={styles.sampleList}>
            {samples.map((s) => (
              <Card key={s.id} padding="sm">
                <div className={styles.sample}>
                  <div>
                    <div className={styles.sampleHead}>
                      <Tag tone={s.label === "gold" ? "blaze" : "neutral"}>{s.label}</Tag>
                      <span className={styles.sampleTitle}>{s.title}</span>
                      <span className={styles.hint}>v{s.version}</span>
                    </div>
                    <div className={styles.sampleBody}>
                      <div className={styles.block}>
                        <span className={styles.blockTitle}>Inputs</span>
                        <dl className={styles.kv}>
                          {Object.entries(s.inputs).map(([k, v]) => (
                            <div key={k} style={{ display: "contents" }}>
                              <dt>{k}</dt>
                              <dd>{Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : x.name)).join(", ") : String(v)}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                      <div className={styles.block}>
                        <span className={styles.blockTitle}>{s.label === "gold" ? "Ideal output" : "What to avoid"}</span>
                        <pre className={styles.pre}>{s.idealOutput}</pre>
                      </div>
                    </div>
                    {(s.note || s.links.length > 0 || s.files.length > 0) && (
                      <div className={styles.sampleFoot}>
                        {s.note && <span>{s.note}</span>}
                        {s.links.map((l) => (
                          <a key={l} href={l} target="_blank" rel="noreferrer">
                            {l}
                          </a>
                        ))}
                        {s.files.map((f) => (
                          <a key={f.id} href={`/builder/files/${f.id}`} className={styles.fileChip} target="_blank" rel="noreferrer">
                            <Icon name="upload" size={14} /> {f.name}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => remove(s.id)}>
                    Remove
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Card title="Add a sample" padding="lg" className={styles.section}>
        <form className={styles.stack} onSubmit={submit}>
          <div className={styles.fieldGrid}>
            <Select label="Kind" value={label} onChange={(e) => setLabel(e.target.value as "gold" | "bad")} options={[{ value: "gold", label: "Gold: the ideal" }, { value: "bad", label: "Bad: what to avoid" }]} />
            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`Sample ${samples.length + 1}`} maxLength={BUILDER_LIMITS.sampleTitle} />
          </div>
          <span className={styles.uploadLabel}>The inputs, as a user would fill them</span>
          {spec.inputs.map((input) => (
            <RunInputField key={input.key} input={input} value={values[input.key]} uploading={uploading === input.key} onChange={(v) => setValues((x) => ({ ...x, [input.key]: v }))} onImages={(list) => onImageInput(input.key, list)} />
          ))}
          <Textarea label={label === "gold" ? "The ideal output" : "The output to avoid"} rows={7} value={idealOutput} onChange={(e) => setIdealOutput(e.target.value)} maxLength={BUILDER_LIMITS.sampleOutput} required hint="Paste it exactly as it should read. For lists, one item per line." />
          <div className={styles.fieldGrid}>
            <Input label="Why" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What makes it good or bad" maxLength={BUILDER_LIMITS.sampleNote} />
            <Textarea label="Links" rows={2} value={links} onChange={(e) => setLinks(e.target.value)} placeholder="One per line" hint={`Up to ${BUILDER_LIMITS.sampleLinks}`} />
          </div>
          <div className={styles.upload}>
            <span className={styles.uploadLabel}>Text files</span>
            <div className={styles.uploadRow}>
              <FilePick label="Add a text file" accept=".txt,.md,.csv,.json,text/plain,text/markdown,text/csv,application/json" disabled={uploading !== null || files.length >= BUILDER_LIMITS.sampleFiles} onFiles={(list) => void onTextFile(list)} />
              {files.map((f) => (
                <Chip key={f.id} onRemove={() => setFiles((x) => x.filter((y) => y.id !== f.id))}>
                  {f.name}
                </Chip>
              ))}
            </div>
            <span className={styles.hint}>.txt, .md, .csv or .json up to 2 MB, at most {BUILDER_LIMITS.sampleFiles} per sample.</span>
          </div>
          {error && (
            <p role="alert" className={styles.fieldError}>
              <Icon name="warning" size={16} /> {error}
            </p>
          )}
          <div className={styles.actions}>
            <Button type="submit" loading={busy} disabled={uploading !== null}>
              Save sample
            </Button>
            <span className={styles.hint}>Stored with version {spec.version}.</span>
          </div>
        </form>
      </Card>
    </div>
  );
}
