import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrainShell } from "@/components/brand-brain/BrainShell";
import styles from "@/components/brand-brain/Brain.module.css";
import { PLATFORM_LABELS } from "@/components/brand-brain/labels";
import { BrainActions, HistoryPanel, MoodPanel, ReferencesPanel, RulesPanel, VoicePanel } from "@/components/brand-brain/panels";
import shell from "@/components/builder/Builder.module.css";
import { ago, currentTime } from "@/components/builder/labels";
import { ButtonLink } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { accounts } from "@/lib/accounts/server";
import { can } from "@/lib/accounts/policy";
import { BrandError } from "@/lib/brand/brains";
import { brandPage } from "@/lib/brand/server";
import { toEngineBrain } from "@/lib/brand/source";
import { renderBrandPart } from "@/lib/runs/brand-brain";
import { BRAND_BRAIN_PARTS } from "@/lib/agents/catalog";

export const metadata: Metadata = { title: "Brand Brain", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const TABS = [
  { id: "voice", label: "Voice" },
  { id: "references", label: "References" },
  { id: "mood", label: "Mood board" },
  { id: "rules", label: "Dos and don'ts" },
  { id: "history", label: "History" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default async function BrainPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; draft?: string }> }) {
  const { id } = await params;
  const { tab: rawTab, draft } = await searchParams;
  const tab: Tab = TABS.some((t) => t.id === rawTab) ? (rawTab as Tab) : "voice";
  const { info, me, workspaceId, role, csrf, brands } = await brandPage(`/brand-brain/${id}`);
  const view = await brands.get(me, workspaceId, id).catch((e) => (e instanceof BrandError ? null : Promise.reject(e)));
  if (!view) notFound();
  const { brain, body, version, by } = view;
  const editable = role ? can(role, "edit_brand_brain") : false;
  const workspaces = await accounts().workspaces.listForUser(info.user.id);
  const current = workspaces.find((w) => w.id === workspaceId);
  const history = tab === "history" ? await brands.history(me, workspaceId, id) : [];
  const engineBrain = toEngineBrain(brain, body);
  const preview = Object.fromEntries(BRAND_BRAIN_PARTS.map((p) => [p, renderBrandPart(engineBrain, p)]));
  const now = currentTime();
  const counts: Partial<Record<Tab, number>> = { references: body.references.length, mood: body.moodBoard.length, rules: body.dos.length + body.donts.length, history: brain.currentVersion };
  const common = { csrf, id, version: brain.currentVersion, body, editable };

  return (
    <BrainShell workspace={current?.name ?? "Workspace"} role={role} who={info.user.name ?? info.user.email ?? "You"} builder={accounts().isBuilder(info.user)}>
      <div className={shell.head}>
        <div className={shell.headText}>
          <Link href="/brand-brain" className={shell.crumb}>
            <Icon name="chevron-right" size={16} style={{ rotate: "180deg" }} /> Brand Brains
          </Link>
          <div className={shell.titleRow}>
            <h1>{body.name}</h1>
            {brain.isDefault && <Tag tone="blaze">Default</Tag>}
          </div>
          <div className={shell.meta}>
            {body.niche && <span>{body.niche}</span>}
            {body.platforms.length > 0 && <span>{body.platforms.map((p) => PLATFORM_LABELS[p]).join(", ")}</span>}
            <span>Version {brain.currentVersion}</span>
            <span>
              Edited {ago(brain.updatedAt, now)} by {by}
            </span>
            {version.note && <span>&ldquo;{version.note}&rdquo;</span>}
          </div>
        </div>
        {editable && (
          <BrainActions csrf={csrf} id={brain.id} name={body.name} isDefault={brain.isDefault}>
            <ButtonLink href={`/brand-brain/new?brain=${brain.id}`} variant="ghost" leading={<Icon name="spark" size={18} />}>
              Rebuild from posts
            </ButtonLink>
          </BrainActions>
        )}
      </div>

      <nav className={styles.tabNav} aria-label="Brand Brain">
        {TABS.map((t) => (
          <Link key={t.id} href={`/brand-brain/${brain.id}${t.id === "voice" ? "" : `?tab=${t.id}`}`} className={styles.tabLink} aria-current={tab === t.id ? "page" : undefined}>
            {t.label}
            {counts[t.id] !== undefined && <small>{counts[t.id]}</small>}
          </Link>
        ))}
      </nav>

      {tab === "voice" && <VoicePanel key={brain.currentVersion} {...common} preview={preview} />}
      {tab === "references" && <ReferencesPanel key={brain.currentVersion} {...common} preview={preview} />}
      {tab === "mood" && <MoodPanel key={brain.currentVersion} {...common} workspaceId={workspaceId} />}
      {tab === "rules" && <RulesPanel key={brain.currentVersion} {...common} draft={draft} />}
      {tab === "history" && <HistoryPanel csrf={csrf} id={brain.id} entries={history} editable={editable} now={now} />}
    </BrainShell>
  );
}
