"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { decideItem } from "@/app/app/review/actions";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";

/** Approve from the queue in one click. Changes and rejections take a note, so they open the item. */
export function QuickApprove({ csrf, id }: { csrf: string; id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function approve() {
    setBusy(true);
    const r = await decideItem(csrf, id, "approve", "");
    setBusy(false);
    if (!r.ok) return toast({ tone: "warning", title: r.error });
    toast({ tone: r.value.item.state === "approved" ? "success" : "info", title: r.value.item.state === "approved" ? "Approved" : "Your yes is in. It needs one more." });
    router.refresh();
  }

  return (
    <Button size="sm" onClick={approve} loading={busy} leading={<Icon name="check-circle" size={16} />}>
      Approve
    </Button>
  );
}
