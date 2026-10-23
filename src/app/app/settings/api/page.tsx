import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/account/ActionForm";
import s from "@/components/api/Api.module.css";
import { CodeBlock } from "@/components/api/CodeBlock";
import { ConnectTabs } from "@/components/api/ConnectTabs";
import styles from "@/components/app/App.module.css";
import { AppShell } from "@/components/app/AppShell";
import { Mascot } from "@/components/brand/Mascot";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { API_KEY_ROLES, can, canAssign } from "@/lib/accounts/policy";
import { accounts } from "@/lib/accounts/server";
import { MCP_TOOLS } from "@/lib/api/mcp";
import { appUrl } from "@/lib/api/server";
import { curlSnippets, mcpSnippets } from "@/lib/api/snippets";
import { appPage } from "@/lib/app/server";
import { createKey, revokeKey } from "./actions";

export const metadata: Metadata = { title: "API and assistants", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "never");

const TOOL_WORDS: Record<(typeof MCP_TOOLS)[number], string> = {
  list_agents: "what each agent does and takes",
  run_agent: "runs one, waits, returns the result",
  get_run: "reads a run by its id",
  give_feedback: "says if a result was used, edited, run again or rated",
  list_brand_brains: "your brands and clients",
  start_pipeline: "starts a chain of agents",
  pick_option: "answers a step that asks you to pick",
  get_pipeline: "reads a pipeline run",
  credits_balance: "what is left to spend",
};

export default async function ApiPage() {
  const { info, me, workspaceId, csrf } = await appPage("/app/settings/api");
  const a = accounts();
  const role = (await a.roleIn(me, workspaceId)) ?? "viewer";
  const manage = can(role, "manage_api_keys");
  const keys = manage ? (await a.apiKeys.list(me, workspaceId)).filter((k) => !k.revokedAt) : [];
  const ws = (await a.workspaces.listForUser(info.user.id)).find((w) => w.id === workspaceId);
  const base = appUrl();

  return (
    <AppShell info={info} active="settings">
      <div className={styles.head}>
        <div className={styles.headText}>
          <Link href="/app/settings" className={styles.crumb}>
            <Icon name="arrow-left" size={16} /> Settings
          </Link>
          <h1 className={styles.h1}>Use the agents from anywhere</h1>
          <p className={styles.lead}>Claude, ChatGPT, Cursor or your own software run the same agents as this app: your Brand Brain, the quality gate and credits included. Connect over MCP or call the REST API with a key.</p>
        </div>
        <div className={styles.actions}>
          <ButtonLink href="/app/settings/webhooks" variant="secondary" size="sm" leading={<Icon name="bell" size={16} />}>
            Webhooks
          </ButtonLink>
          <ButtonLink href="/app/settings/api/reference" size="sm" leading={<Icon name="layers" size={16} />}>
            API reference
          </ButtonLink>
        </div>
      </div>

      <div className={s.layout}>
        <div className={styles.stack}>
          <section className={[styles.panel, styles.stack].join(" ")} aria-label="Connect an assistant">
            <div className={s.panelHead}>
              <div>
                <h2>Connect an assistant</h2>
                <p>
                  WOVI is an MCP server at <code className={s.mono}>{base}/mcp</code>. Paste one of these, put your key where it says <span className={s.ph}>wovi_sk_YOUR_KEY</span>, and ask for hooks, captions or a whole post.
                </p>
              </div>
            </div>
            <ConnectTabs snippets={mcpSnippets(base)} />
          </section>

          <section className={[styles.panel, styles.stack].join(" ")} aria-label="Call the API">
            <div className={s.panelHead}>
              <div>
                <h2>Call the API</h2>
                <p>JSON over HTTPS under /api/v1. Start a run, then read it back; or register a webhook and be told when it lands.</p>
              </div>
              <ButtonLink href="/api/v1/openapi.json" variant="ghost" size="sm" leading={<Icon name="link" size={16} />}>
                openapi.json
              </ButtonLink>
            </div>
            {curlSnippets(base)
              .slice(0, 2)
              .map((sn) => (
                <CodeBlock key={sn.id} snippet={sn} />
              ))}
          </section>
        </div>

        <div className={styles.stack}>
          <section className={[styles.panel, styles.stack].join(" ")} aria-label="API keys">
            <div className={s.panelHead}>
              <div>
                <h2>API keys</h2>
                <p>Each key works in {ws?.name ?? "this workspace"} only, with one role. It is shown once; keep it like a password.</p>
              </div>
            </div>
            {manage ? (
              <>
                {keys.length ? (
                  <ul className={s.keys}>
                    {keys.map((k) => (
                      <li key={k.id} className={s.key}>
                        <span className={s.keyMark}>
                          <Icon name="link" size={18} />
                        </span>
                        <span className={s.keyText}>
                          <b>{k.name}</b>
                          <span className={s.mono}>{k.prefix}...</span>
                          <span>
                            Made {day(k.createdAt)}, {k.lastUsedAt ? `last used ${day(k.lastUsedAt)}` : "not used yet"}
                          </span>
                        </span>
                        <span className={s.role}>{k.role}</span>
                        <ActionForm action={revokeKey} csrf={csrf}>
                          <input type="hidden" name="keyId" value={k.id} />
                          <Button type="submit" variant="ghost" size="sm">
                            Revoke
                          </Button>
                        </ActionForm>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={[styles.muted, styles.small].join(" ")}>No keys yet. Make one for each place you connect, so you can revoke one without the others.</p>
                )}
                <ActionForm action={createKey} csrf={csrf} className={s.form}>
                  <Input label="New key" name="name" placeholder="Claude on my laptop" maxLength={60} required />
                  <Select label="Role" name="role" defaultValue="editor" options={API_KEY_ROLES.filter((r) => canAssign(role, null, r)).map((r) => ({ value: r, label: r === "admin" ? "Admin: also costs and webhooks" : r === "editor" ? "Editor: runs agents" : "Viewer: reads only" }))} />
                  <Button type="submit" leading={<Icon name="plus" size={16} />}>
                    Make key
                  </Button>
                </ActionForm>
              </>
            ) : (
              <div className={[styles.panelAlt, styles.panelTight, styles.wovi, styles.panel].join(" ")}>
                <Mascot pose="wait" size={72} label="Wovi, waiting" />
                <b>Owners and admins make keys</b>
                <span>Ask one of them for a key for this workspace.</span>
              </div>
            )}
          </section>

          <section className={[styles.panel, styles.panelAlt, styles.stack].join(" ")} aria-label="What a key can do">
            <div className={s.panelHead}>
              <h2>What a key can do</h2>
            </div>
            <ul className={s.cans}>
              <li>
                <Icon name="check-circle" size={18} className={s.yes} /> Run agents and pipelines, pick options, stop runs
              </li>
              <li>
                <Icon name="check-circle" size={18} className={s.yes} /> Read runs, results, quality scores, Brand Brains and the balance
              </li>
              <li>
                <Icon name="check-circle" size={18} className={s.yes} /> Admin keys: see charges and set up webhooks
              </li>
              <li>
                <Icon name="x-circle" size={18} className={s.no} /> Approve or reject: people decide, in the app
              </li>
              <li>
                <Icon name="x-circle" size={18} className={s.no} /> Top up, change limits, make keys or add people
              </li>
            </ul>
          </section>

          <section className={[styles.panel, styles.stack].join(" ")} aria-label="MCP tools">
            <div className={s.panelHead}>
              <div>
                <h2>Tools your assistant gets</h2>
                <p>Each agent&apos;s inputs come from its own form, so the assistant fills them in right.</p>
              </div>
            </div>
            <div className={s.endpoints}>
              {MCP_TOOLS.map((t) => (
                <div key={t} className={s.endpoint}>
                  <code>{t}</code>
                  <span>{TOOL_WORDS[t]}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
