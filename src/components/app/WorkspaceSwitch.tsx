"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { switchWorkspace } from "@/app/app/actions";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import styles from "./App.module.css";

export type WorkspaceOption = { id: string; name: string; role: string };

/** The workspace pill in the header: a select that switches the session and refreshes the page. */
export function WorkspaceSwitch({ csrf, current, workspaces }: { csrf: string; current: string; workspaces: WorkspaceOption[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const me = workspaces.find((w) => w.id === current);

  async function change(id: string) {
    if (id === current) return;
    setBusy(true);
    const r = await switchWorkspace(csrf, id);
    setBusy(false);
    if (!r.ok) return toast({ tone: "warning", title: r.error });
    router.refresh();
  }

  return (
    <span className={styles.ws}>
      <select className={styles.wsSelect} aria-label="Workspace" value={current} disabled={busy || workspaces.length < 2} onChange={(e) => change(e.target.value)}>
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
      <span className={styles.wsChevron}>
        <Icon name="chevron-down" size={16} />
      </span>
      {me && <span className="visually-hidden">{`You are ${me.role} here`}</span>}
    </span>
  );
}
