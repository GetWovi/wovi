import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/components/app/App.module.css";
import { AppShell } from "@/components/app/AppShell";
import { Mascot } from "@/components/brand/Mascot";
import { currentTime } from "@/components/builder/labels";
import { ItemRow } from "@/components/team/ItemRow";
import { QuickApprove } from "@/components/team/QuickApprove";
import { ruleWords } from "@/components/team/rules-words";
import t from "@/components/team/Team.module.css";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { accounts } from "@/lib/accounts/server";
import { appPage } from "@/lib/app/server";
import { readClientFilter } from "@/lib/team/client-filter";
import { deciderProblem } from "@/lib/team/rules";
import { appTeam } from "@/lib/team/server";
import { ITEM_STATE_LABELS, type ItemState } from "@/lib/team/types";

export const metadata: Metadata = { title: "Review", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = { state?: string; client?: string; brand?: string; what?: string; assignee?: string; q?: string };
const TABS: (ItemState | "open" | "all")[] = ["open", "draft", "changes_requested", "approved", "rejected", "all"];
const TAB_LABELS: Record<string, string> = { open: "Needs review", all: "Everything" };
/** Phone names, so the six states fit in two rows. */
const TAB_SHORT: Record<string, string> = { open: "To review", draft: "Drafts", changes_requested: "Changes", approved: "Approved", rejected: "Rejected", all: "All" };

export default async function ReviewPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { info, me, workspaceId, csrf, api } = await appPage("/app/review");
  const sp = await searchParams;
  const team = appTeam();
  const state = (TABS as string[]).includes(sp.state ?? "") ? (sp.state as ItemState | "open" | "all") : "open";
  const remembered = await readClientFilter(workspaceId);
  const clientId = sp.client !== undefined ? sp.client : (remembered ?? "");
  const filter = { clientId: clientId || undefined, brandBrainId: sp.brand || undefined, what: sp.what || undefined, assignee: sp.assignee || undefined, q: sp.q || undefined };
  const [everything, clients, brains, members, settings, role] = await Promise.all([
    team.queue(me, workspaceId, { ...filter, state: "all" }),
    team.clients(me, workspaceId),
    api.brains(me, workspaceId),
    accounts().workspaces.members(me, workspaceId),
    team.settings(me, workspaceId),
    accounts().roleIn(me, workspaceId),
  ]);
  const items = state === "all" ? everything : everything.filter((i) => (state === "open" ? i.state === "needs_review" : i.state === state));
  const count = (s: string) => (s === "all" ? everything.length : everything.filter((i) => i.state === (s === "open" ? "needs_review" : s)).length);
  const canDecide = role ? deciderProblem(role, settings) === null : false;
  const now = currentTime();
  const filtered = Boolean(filter.clientId || filter.brandBrainId || filter.what || filter.assignee || filter.q);
  const whats = [...new Map(everything.map((i) => [`${i.kind === "run" ? "agent" : "pipeline"}:${i.what.id}`, i.what.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const keep = (next: Partial<Search>) => {
    const q = new URLSearchParams();
    const all = { state, client: clientId, brand: sp.brand ?? "", what: sp.what ?? "", assignee: sp.assignee ?? "", q: sp.q ?? "", ...next };
    for (const [k, v] of Object.entries(all)) if (v) q.set(k, v);
    if (!all.client && remembered) q.set("client", "");
    return `/app/review?${q.toString()}`;
  };
  const waiting = count("open");

  return (
    <AppShell info={info} active="review">
      <div className={styles.head}>
        <div className={styles.headText}>
          <span className="eyebrow">Review</span>
          <h1 className={styles.h1}>
            What needs a <em>yes</em>
          </h1>
          <p className={styles.lead}>
            {waiting === 0 ? "Nothing waits for a decision." : `${waiting} waiting for a decision.`} Approve, ask for changes or reject. {ruleWords(settings)}
          </p>
        </div>
        <div className={[styles.actions, t.phoneHide].join(" ")}>
          <ButtonLink href="/app/settings/team" variant="ghost" size="sm" leading={<Icon name="sliders" size={16} />}>
            Approval rules
          </ButtonLink>
          <ButtonLink href="/app/clients" variant="secondary" size="sm" leading={<Icon name="users" size={16} />}>
            Clients
          </ButtonLink>
        </div>
      </div>

      <nav className={t.stateTabs} aria-label="State">
        {TABS.map((s) => (
          <Link key={s} href={keep({ state: s })} className={t.stateTab} aria-current={state === s ? "page" : undefined}>
            <span className={t.tabLong}>{TAB_LABELS[s] ?? ITEM_STATE_LABELS[s as ItemState]}</span>
            <span className={t.tabShort}>{TAB_SHORT[s]}</span>
            <b>{count(s)}</b>
          </Link>
        ))}
      </nav>

      <form method="get" className={[styles.panel, styles.panelTight, t.filters].join(" ")}>
        <input type="hidden" name="state" value={state} />
        <Input label="Search" name="q" defaultValue={sp.q ?? ""} placeholder="A word" leading={<Icon name="search" size={20} />} />
        <Select label="Client" name="client" defaultValue={clientId} options={[{ value: "", label: "Every client" }, ...clients.map((c) => ({ value: c.id, label: c.name }))]} />
        <div className={t.phoneHide}>
          <Select label="Brand" name="brand" defaultValue={sp.brand ?? ""} options={[{ value: "", label: "Any brand" }, ...brains.map((b) => ({ value: b.id, label: b.name }))]} />
        </div>
        <div className={t.phoneHide}>
          <Select label="Agent" name="what" defaultValue={sp.what ?? ""} options={[{ value: "", label: "Any agent" }, ...whats.map(([value, label]) => ({ value, label: value.startsWith("pipeline:") ? `${label} (pipeline)` : label }))]} />
        </div>
        <div className={t.phoneHide}>
          <Select label="Assigned to" name="assignee" defaultValue={sp.assignee ?? ""} options={[{ value: "", label: "Anyone" }, { value: "me", label: "Me" }, { value: "none", label: "Nobody yet" }, ...members.filter((m) => m.userId !== info.user.id).map((m) => ({ value: m.userId, label: m.name ?? m.email ?? "Member" }))]} />
        </div>
        <div className={styles.actions}>
          <Button type="submit" variant="secondary" aria-label="Filter">
            Filter
          </Button>
          {filtered && (
            <ButtonLink href={`/app/review?state=${state}&client=`} variant="ghost">
              Clear
            </ButtonLink>
          )}
        </div>
      </form>

      {items.length === 0 ? (
        <div className={[styles.panel, styles.panelAlt, styles.wovi].join(" ")}>
          <Mascot pose={state === "open" && !filtered ? "done" : "wait"} size={120} />
          <b>{state === "open" && !filtered ? "All caught up" : "Nothing here"}</b>
          <span>{state === "open" && !filtered ? "Every finished result has a decision. New ones land here." : "Try another state, or clear the filters."}</span>
          {everything.length === 0 && (
            <ButtonLink href="/app/make" variant="secondary">
              Make something
            </ButtonLink>
          )}
        </div>
      ) : (
        <div className={styles.runList}>
          {items.map((i) => (
            <ItemRow key={i.id} item={i} now={now} action={canDecide && i.state === "needs_review" && !i.approvals.some((a) => a.by === info.user.id) ? <QuickApprove csrf={csrf} id={i.id} /> : undefined} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
