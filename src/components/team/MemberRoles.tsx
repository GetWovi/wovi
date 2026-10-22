"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setMemberRole } from "@/app/app/review/actions";
import styles from "@/components/app/App.module.css";
import { ButtonLink } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import t from "./Team.module.css";

export type MemberLine = { userId: string; name: string; role: string; self: boolean; roles: string[]; what: string };

/** Members and their roles, through the phase 4 rules. Invites and removals stay on the account page. */
export function MemberRoles({ csrf, members, canInvite }: { csrf: string; members: MemberLine[]; canInvite: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function change(userId: string, role: string) {
    setBusy(userId);
    const r = await setMemberRole(csrf, userId, role);
    setBusy(null);
    if (!r.ok) return toast({ tone: "warning", title: r.error });
    toast({ tone: "success", title: "Role changed" });
    router.refresh();
  }

  return (
    <section className={[styles.panel, styles.panelTight, styles.stack].join(" ")} aria-label="Members and roles">
      <div className={t.sideHead}>
        <h3>Members and roles</h3>
        {canInvite && (
          <ButtonLink href="/account" size="sm" variant="secondary" leading={<Icon name="mail" size={16} />}>
            Invite people
          </ButtonLink>
        )}
      </div>
      <ul className={t.members}>
        {members.map((m) => (
          <li key={m.userId} className={t.member}>
            <Avatar name={m.name} size={40} />
            <span className={t.memberText}>
              <b>
                {m.name}
                {m.self ? " (you)" : ""}
              </b>
              <span>{m.what}</span>
            </span>
            {m.roles.length > 1 && !m.self ? (
              <select className={t.roleSelect} aria-label={`Role of ${m.name}`} value={m.role} disabled={busy === m.userId} onChange={(e) => change(m.userId, e.target.value)}>
                {m.roles.map((r) => (
                  <option key={r} value={r}>
                    {r[0].toUpperCase() + r.slice(1)}
                  </option>
                ))}
              </select>
            ) : (
              <span className={t.rolePill}>{m.role}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
