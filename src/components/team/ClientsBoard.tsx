"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient, createShareLink, removeClient, revokeShareLink, updateClient } from "@/app/app/review/actions";
import styles from "@/components/app/App.module.css";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { DEFAULT_LINK_DAYS, LINK_DAYS } from "@/lib/team/rules";
import type { ClientView, ShareLinkView } from "@/lib/team/team";
import { clientInitials } from "./labels";
import t from "./Team.module.css";

type Brain = { id: string; name: string };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function linkState(l: ShareLinkView): string {
  if (l.revokedAt) return "Withdrawn";
  if (!l.open) return `Ended ${day(l.expiresAt)}`;
  return `Open until ${day(l.expiresAt)}${l.canApprove ? "" : ", look only"}${l.lastUsedAt ? `, last opened ${day(l.lastUsedAt)}` : ", not opened yet"}`;
}

/** Brand Brains to tick: the ones another client has are greyed out, since a Brand Brain belongs to one client. */
function BrandPicker({ brains, picked, takenBy, onChange }: { brains: Brain[]; picked: string[]; takenBy: Map<string, string>; onChange: (ids: string[]) => void }) {
  return (
    <div className={t.pickBrands} role="group" aria-label="Brand Brains">
      {brains.map((b) => {
        const owner = takenBy.get(b.id);
        const on = picked.includes(b.id);
        return (
          <button key={b.id} type="button" className={t.pickBrand} aria-pressed={on} disabled={Boolean(owner)} title={owner ? `Belongs to ${owner}` : undefined} onClick={() => onChange(on ? picked.filter((x) => x !== b.id) : [...picked, b.id])}>
            <Icon name={on ? "check" : "plus"} size={16} />
            {b.name}
            {owner ? ` (${owner})` : ""}
          </button>
        );
      })}
    </div>
  );
}

function NewClient({ csrf, brains, takenBy }: { csrf: string; brains: Brain[]; takenBy: Map<string, string> }) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    const r = await createClient(csrf, { name, brandBrainIds: picked, defaultBrandBrainId: picked[0] ?? null });
    setBusy(false);
    if (!r.ok) return toast({ tone: "warning", title: r.error });
    toast({ tone: "success", title: `${r.value.name} added` });
    setName("");
    setPicked([]);
    router.refresh();
  }

  return (
    <section className={[styles.panel, styles.panelTight, styles.stack].join(" ")} aria-label="Add a client">
      <div className={t.sideHead}>
        <h3>Add a client</h3>
        <span className={styles.fine}>The first brand you pick is their default.</span>
      </div>
      <div className={t.newClient}>
        <Input label="Client name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Northside Bakery" />
        <div className={t.group}>
          <span className={t.groupLabel}>Their Brand Brains</span>
          {brains.length ? <BrandPicker brains={brains} picked={picked} takenBy={takenBy} onChange={setPicked} /> : <span className={[styles.muted, styles.small].join(" ")}>Make a Brand Brain for them first.</span>}
        </div>
        <Button onClick={add} loading={busy} disabled={!name.trim()} leading={<Icon name="plus" size={18} />}>
          Add client
        </Button>
      </div>
    </section>
  );
}

function ClientCard({ csrf, c, brains, takenBy, manage, alt }: { csrf: string; c: ClientView; brains: Brain[]; takenBy: Map<string, string>; manage: boolean; alt: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(c.name);
  const [picked, setPicked] = useState(c.brandBrainIds);
  const [def, setDef] = useState(c.defaultBrandBrainId ?? "");
  const [label, setLabel] = useState("");
  const [days, setDays] = useState(String(DEFAULT_LINK_DAYS));
  const [canApprove, setCanApprove] = useState(true);
  const [made, setMade] = useState<{ id: string; url: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const others = new Map([...takenBy].filter(([, owner]) => owner !== c.name));

  async function save() {
    setBusy("save");
    const r = await updateClient(csrf, c.id, { name, brandBrainIds: picked, defaultBrandBrainId: picked.includes(def) ? def : (picked[0] ?? null) });
    setBusy(null);
    if (!r.ok) return toast({ tone: "warning", title: r.error });
    setEditing(false);
    router.refresh();
  }

  async function remove() {
    if (!window.confirm(`Remove ${c.name}? Their links stop working. Their Brand Brains and work stay in the workspace.`)) return;
    setBusy("remove");
    const r = await removeClient(csrf, c.id);
    setBusy(null);
    if (!r.ok) return toast({ tone: "warning", title: r.error });
    router.refresh();
  }

  async function makeLink() {
    setBusy("link");
    const r = await createShareLink(csrf, c.id, { label, days: Number(days), canApprove });
    setBusy(null);
    if (!r.ok) return toast({ tone: "warning", title: r.error });
    setMade({ id: r.value.link.id, url: r.value.url });
    setLabel("");
    router.refresh();
  }

  async function revoke(id: string) {
    setBusy(id);
    const r = await revokeShareLink(csrf, id);
    setBusy(null);
    if (!r.ok) return toast({ tone: "warning", title: r.error });
    toast({ tone: "info", title: "Link withdrawn. It stops working now." });
    router.refresh();
  }

  const open = c.links.filter((l) => l.open);
  return (
    <article className={[styles.panel, styles.panelTight, alt ? styles.panelAlt : "", t.clientCard].join(" ")}>
      <div className={t.clientTop}>
        <span className={t.clientMark}>{clientInitials(c.name)}</span>
        <div className={t.clientName}>
          <h2>{c.name}</h2>
          <span>
            {c.brands.length} Brand Brain{c.brands.length === 1 ? "" : "s"}, {open.length} open link{open.length === 1 ? "" : "s"}
          </span>
        </div>
        {manage && !editing && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)} leading={<Icon name="pen" size={16} />}>
            Edit
          </Button>
        )}
      </div>

      <div className={t.stats}>
        <div className={[t.stat, c.counts.needsReview ? t.statBlaze : ""].join(" ")}>
          <b>{c.counts.needsReview}</b>
          <span>Need review</span>
        </div>
        <div className={t.stat}>
          <b>{c.counts.approved}</b>
          <span>Approved</span>
        </div>
        <div className={t.stat}>
          <b>{c.counts.total}</b>
          <span>In all</span>
        </div>
      </div>

      {editing ? (
        <div className={styles.stack}>
          <Input label="Client name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          <div className={t.group}>
            <span className={t.groupLabel}>Their Brand Brains</span>
            <BrandPicker brains={brains} picked={picked} takenBy={others} onChange={setPicked} />
          </div>
          <Select label="Default brand" hint="Pre-picked in the forms while you work for this client." value={picked.includes(def) ? def : (picked[0] ?? "")} onChange={(e) => setDef(e.target.value)} options={picked.length ? picked.map((id) => ({ value: id, label: brains.find((b) => b.id === id)?.name ?? id })) : [{ value: "", label: "Pick a Brand Brain first" }]} />
          <div className={styles.actions}>
            <Button onClick={save} loading={busy === "save"}>
              Save
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button variant="ghost" onClick={remove} loading={busy === "remove"} leading={<Icon name="x-circle" size={16} />}>
              Remove client
            </Button>
          </div>
        </div>
      ) : (
        <div className={t.brands}>
          {c.brands.map((b) => (
            <span key={b.id} className={[t.brand, b.id === c.defaultBrandBrainId ? t.brandDefault : ""].join(" ")}>
              {b.name}
              {b.id === c.defaultBrandBrainId && <em>Default</em>}
            </span>
          ))}
          {c.brands.length === 0 && <span className={[styles.muted, styles.small].join(" ")}>No Brand Brain yet, so nothing of theirs shows up.</span>}
        </div>
      )}

      {manage && (
        <div className={styles.stack}>
          <div className={t.sideHead}>
            <h3>Links for the client</h3>
            <span className={styles.fine}>They see their own work only.</span>
          </div>
          {c.links.length > 0 && (
            <div className={t.links}>
              {c.links.slice(0, 3).map((l) => (
                <div key={l.id} className={[t.link, l.open ? "" : t.linkClosed].join(" ")}>
                  <span className={t.linkText}>
                    <b>{l.label}</b>
                    <span>
                      ...{l.suffix} · {linkState(l)}
                    </span>
                  </span>
                  {l.open && (
                    <Button size="sm" variant="ghost" onClick={() => revoke(l.id)} loading={busy === l.id}>
                      Withdraw
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className={t.formRow}>
            <Input label="A new link, for" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder={`Sam at ${c.name}`} />
            <Select label="Lasts" value={days} onChange={(e) => setDays(e.target.value)} options={LINK_DAYS.map((d) => ({ value: String(d), label: d === 1 ? "1 day" : `${d} days` }))} />
          </div>
          <div className={t.formFoot}>
            <label className={t.check}>
              <input type="checkbox" checked={canApprove} onChange={(e) => setCanApprove(e.target.checked)} />
              They can approve and ask for changes
            </label>
            <Button variant="secondary" size="sm" onClick={makeLink} loading={busy === "link"} disabled={!label.trim()} leading={<Icon name="link" size={16} />}>
              Make link
            </Button>
          </div>
        </div>
      )}

      <Modal open={made !== null} onClose={() => setMade(null)} title={`A link for ${c.name}`} footer={
          made ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setMade(null)}>
                Done
              </Button>
              <CopyLink url={made.url} />
            </>
          ) : null
        }>
        {made && (
          <div className={t.secret}>
            <b>Copy it now: it is shown once.</b>
            <code>{made.url}</code>
            <span>It opens their own work only, and stops working when it ends or when you withdraw it.</span>
          </div>
        )}
      </Modal>

      <div className={t.clientFoot}>
        <Link href={`/app/review?client=${c.id}&state=all`} className={styles.sectionLink}>
          Their work in the queue <Icon name="arrow-right" size={16} />
        </Link>
        <ButtonLink href={`/app/review?client=${c.id}&state=open`} size="sm" variant={c.counts.needsReview ? "primary" : "ghost"}>
          {c.counts.needsReview ? `Review ${c.counts.needsReview}` : "Nothing to review"}
        </ButtonLink>
      </div>
    </article>
  );
}

export function ClientsBoard({ csrf, clients, brains, manage }: { csrf: string; clients: ClientView[]; brains: Brain[]; manage: boolean }) {
  const takenBy = new Map<string, string>();
  for (const c of clients) for (const id of c.brandBrainIds) takenBy.set(id, c.name);
  return (
    <>
      {clients.length > 0 && (
        <div className={t.clientGrid}>
          {clients.map((c, i) => (
            <ClientCard key={c.id} csrf={csrf} c={c} brains={brains} takenBy={takenBy} manage={manage} alt={i % 2 === 1} />
          ))}
        </div>
      )}
      {manage && <NewClient csrf={csrf} brains={brains} takenBy={takenBy} />}
    </>
  );
}

/** The new link's main action: copy it, and say so for a moment. */
function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* The clipboard can be blocked; the link stays on screen to select. */
    }
  }
  return (
    <Button size="sm" onClick={copy} leading={<Icon name={copied ? "check" : "copy"} size={16} />}>
      {copied ? "Copied" : "Copy link"}
    </Button>
  );
}
