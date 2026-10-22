"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { decidePipeline } from "@/app/app/pipelines/actions";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import styles from "./App.module.css";

/** Yes or no on a finished pipeline run, in one line, for a list row. */
export function PipelineDecideButtons({ csrf, id }: { csrf: string; id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function decide(decision: "approved" | "rejected") {
    setBusy(decision);
    const r = await decidePipeline(csrf, id, decision, "");
    setBusy(null);
    if (!r.ok) return toast({ tone: "warning", title: r.error });
    toast({ tone: decision === "approved" ? "success" : "info", title: decision === "approved" ? "Approved" : "Rejected" });
    router.refresh();
  }

  return (
    <span className={styles.actions}>
      <Button size="sm" variant="ghost" onClick={() => decide("rejected")} loading={busy === "rejected"} disabled={busy !== null} leading={<Icon name="x-circle" size={16} />}>
        No
      </Button>
      <Button size="sm" onClick={() => decide("approved")} loading={busy === "approved"} disabled={busy !== null} leading={<Icon name="check-circle" size={16} />}>
        Yes
      </Button>
    </span>
  );
}
