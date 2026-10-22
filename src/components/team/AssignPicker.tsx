"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { assignItem } from "@/app/app/review/actions";
import { Select } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";

/** Who has the item. Assigning tells the person in their notifications. */
export function AssignPicker({ csrf, id, current, members, disabled }: { csrf: string; id: string; current: string | null; members: { userId: string; name: string; role: string }[]; disabled: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function change(value: string) {
    setBusy(true);
    const r = await assignItem(csrf, id, value || null);
    setBusy(false);
    if (!r.ok) return toast({ tone: "warning", title: r.error });
    toast({ tone: "info", title: r.value.assignee ? `Assigned to ${r.value.assignee.name}` : "Nobody has it now" });
    router.refresh();
  }

  return (
    <Select
      label="Assigned to"
      value={current ?? ""}
      disabled={disabled || busy}
      onChange={(e) => change(e.target.value)}
      options={[{ value: "", label: "Nobody yet" }, ...members.map((m) => ({ value: m.userId, label: `${m.name} (${m.role})` }))]}
    />
  );
}
