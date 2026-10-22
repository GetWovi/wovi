import type { Metadata } from "next";
import Link from "next/link";
import { Mascot } from "@/components/brand/Mascot";
import { AppShell } from "@/components/app/AppShell";
import styles from "@/components/brand-brain/Brain.module.css";
import { PLATFORM_LABELS, inkOn } from "@/components/brand-brain/labels";
import { StartBlank, WorkspaceSwitch } from "@/components/brand-brain/ListActions";
import shell from "@/components/builder/Builder.module.css";
import { ago, currentTime } from "@/components/builder/labels";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { accounts } from "@/lib/accounts/server";
import { can } from "@/lib/accounts/policy";
import { brandPage } from "@/lib/brand/server";

export const metadata: Metadata = { title: "Brand Brains", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function BrandBrainsPage() {
  const { info, me, workspaceId, role, csrf, brands } = await brandPage("/brand-brain");
  const workspaces = await accounts().workspaces.listForUser(info.user.id);
  const current = workspaces.find((w) => w.id === workspaceId);
  const list = await brands.list(me, workspaceId);
  const editor = role ? can(role, "edit_brand_brain") : false;
  const now = currentTime();

  return (
    <AppShell info={info} active="brand">
      <div className={shell.head}>
        <div className={shell.headText}>
          <span className="eyebrow">{current?.name ?? "Workspace"}</span>
          <h1>Brand Brains</h1>
          <p className={shell.lead}>One per brand or client. Every agent reads it before it writes.</p>
        </div>
        <div className={styles.headActions}>
          <WorkspaceSwitch csrf={csrf} current={workspaceId} workspaces={workspaces.map((w) => ({ id: w.id, name: w.name, role: w.role }))} />
          {editor && list.length > 0 && (
            <>
              <StartBlank csrf={csrf} />
              <ButtonLink href="/brand-brain/new" leading={<Icon name="spark" size={18} />}>
                Build from past posts
              </ButtonLink>
            </>
          )}
        </div>
      </div>

      {list.length === 0 ? (
        <Card padding="lg" className={styles.newCard}>
          <Mascot pose="hello" size={96} />
          <h3>No Brand Brain yet</h3>
          <p>{editor ? "Paste 3 to 5 posts that did well. We read your voice, topics, dos and don'ts, and you check it before it is saved." : "Someone with edit rights in this workspace can make one."}</p>
          {editor && (
            <div className={shell.actions}>
              <StartBlank csrf={csrf} variant="secondary" />
              <ButtonLink href="/brand-brain/new" leading={<Icon name="spark" size={18} />}>
                Build from past posts
              </ButtonLink>
            </div>
          )}
        </Card>
      ) : (
        <div className={styles.grid}>
          {list.map((b) => (
            <Link key={b.id} href={`/brand-brain/${b.id}`} className={styles.cardLink}>
              <Card interactive className={styles.brainCard}>
                <div className={styles.brainTop}>
                  <span className={styles.mark} style={b.swatches[0] ? { background: b.swatches[0], color: inkOn(b.swatches[0]) } : undefined} aria-hidden="true">
                    {b.name.trim()[0]?.toUpperCase()}
                  </span>
                  <div className={styles.brainName}>
                    <b>{b.name}</b>
                    <span>{b.niche || "No niche yet"}</span>
                  </div>
                  {b.isDefault && <Tag tone="blaze">Default</Tag>}
                </div>
                <p className={styles.voiceLine}>{b.voice || "No voice written yet. Open it to describe how this brand sounds."}</p>
                <div className={styles.tags}>
                  {b.tone.length ? b.tone.slice(0, 3).map((t) => <Tag key={t}>{t}</Tag>) : <Tag>No tone yet</Tag>}
                  {b.swatches.length > 0 && (
                    <span className={styles.swatches} aria-label="Mood board colours">
                      {b.swatches.map((c) => (
                        <span key={c} className={styles.swatch} style={{ background: c }} />
                      ))}
                    </span>
                  )}
                </div>
                <div className={styles.counts}>
                  <span className={styles.count}>
                    <b>{b.references}</b>
                    <span>references</span>
                  </span>
                  <span className={styles.count}>
                    <b>{b.moodItems}</b>
                    <span>on the board</span>
                  </span>
                  <span className={styles.count}>
                    <b>{b.rules}</b>
                    <span>dos and don&apos;ts</span>
                  </span>
                </div>
                <div className={styles.cardFoot}>
                  <span>{[b.platforms.map((p) => PLATFORM_LABELS[p]).join(", "), `Version ${b.currentVersion}`].filter(Boolean).join(" · ")}</span>
                  <span>
                    Edited {ago(b.updatedAt, now)} by {b.by}
                  </span>
                </div>
              </Card>
            </Link>
          ))}
          <div className={styles.explainer}>
            <Mascot pose="wait" size={64} />
            <div>
              <h3>One per brand or client</h3>
              <p>Agents use the default unless a run picks another. Every save is a new version, so you can see who changed what and go back.</p>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
