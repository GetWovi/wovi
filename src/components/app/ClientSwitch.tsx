"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setClientFilter } from "@/app/app/review/actions";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import styles from "./App.module.css";

/** Working for one client: narrows the queue and History and pre-picks the client's brand. A view filter only. */
export function ClientSwitch({ csrf, current, clients }: { csrf: string; current: string | null; clients: { id: string; name: string }[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function change(id: string) {
    setBusy(true);
    const r = await setClientFilter(csrf, id || null);
    setBusy(false);
    if (!r.ok) return toast({ tone: "warning", title: r.error });
    router.refresh();
  }

  return (
    <span className={[styles.ws, styles.clientSwitch].join(" ")}>
      <select className={[styles.wsSelect, current ? styles.wsSelectOn : ""].join(" ")} aria-label="Working for" value={current ?? ""} disabled={busy} onChange={(e) => change(e.target.value)}>
        <option value="">All clients</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <span className={styles.wsChevron}>
        <Icon name="chevron-down" size={16} />
      </span>
    </span>
  );
}
