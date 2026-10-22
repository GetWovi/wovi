"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBrain, switchWorkspace } from "@/app/brand-brain/actions";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import styles from "./Brain.module.css";

/** Makes an empty Brand Brain and opens it. */
export function StartBlank({ csrf, variant = "ghost" }: { csrf: string; variant?: "ghost" | "secondary" }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  async function start() {
    setBusy(true);
    const r = await createBrain(csrf, "New Brand Brain");
    if (!r.ok) {
      setBusy(false);
      return toast({ tone: "warning", title: r.error });
    }
    router.push(`/brand-brain/${r.value.id}`);
  }
  return (
    <Button variant={variant} onClick={start} loading={busy} leading={<Icon name="pen" size={18} />}>
      Start blank
    </Button>
  );
}

export function WorkspaceSwitch({ csrf, current, workspaces }: { csrf: string; current: string; workspaces: { id: string; name: string; role: string }[] }) {
  const router = useRouter();
  const { toast } = useToast();
  if (workspaces.length < 2) return null;
  async function change(id: string) {
    const r = await switchWorkspace(csrf, id);
    if (!r.ok) return toast({ tone: "warning", title: r.error });
    router.refresh();
  }
  return (
    <div className={styles.wsSwitch}>
      <Select label="Workspace" value={current} onChange={(e) => change(e.target.value)} options={workspaces.map((w) => ({ value: w.id, label: `${w.name} (${w.role})` }))} />
    </div>
  );
}
