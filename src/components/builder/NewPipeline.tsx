"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPipeline } from "@/app/builder/pipelines/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import styles from "./Builder.module.css";

/** Id, name and a starting point; the editor takes it from there. */
export function NewPipeline({ csrf, templates }: { csrf: string; templates: { id: string; name: string }[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [from, setFrom] = useState(templates[0]?.id ?? "blank");
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);

  async function create() {
    setBusy(true);
    const r = await createPipeline(csrf, { id, name, from });
    setBusy(false);
    if (!r.ok) {
      setIssues(r.issues ?? []);
      return toast({ tone: "warning", title: r.error });
    }
    router.push(`/builder/pipelines/${r.value.id}`);
  }

  return (
    <Card className={styles.section} style={{ maxWidth: 720 }}>
      <div className={styles.fieldGrid}>
        <Input label="Id" value={id} onChange={(e) => setId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} placeholder="week-of-posts" hint="Lowercase words with hyphens. It never changes." error={issues.find((x) => x.startsWith("id:"))?.slice(4)} />
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="A week of posts" maxLength={48} error={issues.find((x) => x.startsWith("name:"))?.slice(6)} />
        <div className={styles.span2}>
          <Select label="Start from" value={from} onChange={(e) => setFrom(e.target.value)} options={[...templates.map((t) => ({ value: t.id, label: `A copy of ${t.name}` })), { value: "blank", label: "One step: Caption Writer" }]} />
        </div>
      </div>
      <div className={styles.actions}>
        <Button onClick={create} loading={busy} disabled={!id || !name}>
          Create the draft
        </Button>
      </div>
    </Card>
  );
}
