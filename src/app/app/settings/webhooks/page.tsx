import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/account/ActionForm";
import s from "@/components/api/Api.module.css";
import { CodeBlock } from "@/components/api/CodeBlock";
import styles from "@/components/app/App.module.css";
import { AppShell } from "@/components/app/AppShell";
import { Mascot } from "@/components/brand/Mascot";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { can } from "@/lib/accounts/policy";
import { accounts } from "@/lib/accounts/server";
import { appWebhooks } from "@/lib/api/server";
import { VERIFY_SNIPPET } from "@/lib/api/snippets";
import { appPage } from "@/lib/app/server";
import { EVENT_WORDS, WEBHOOK_EVENTS, type WebhookDelivery } from "@/lib/webhooks/types";
import { createWebhook, webhookAction } from "../api/actions";

export const metadata: Metadata = { title: "Webhooks", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** One delivery in words: what happened on its last try. */
function deliveryWords(d: WebhookDelivery): string {
  const last = d.attempts[d.attempts.length - 1];
  const tries = `${d.attempts.length} ${d.attempts.length === 1 ? "try" : "tries"}`;
  if (d.status === "delivered") return last?.sender === "dev" ? "Logged on this machine, not sent" : `Delivered, ${last?.status}, ${tries}`;
  if (d.status === "failed") return `Gave up after ${tries}: ${last?.error ?? "no answer"}`;
  if (!last) return "Waiting for its first try";
  return `${last.error ?? `Answered ${last.status}`} Next try ${d.nextAttemptAt ? when(d.nextAttemptAt) : "soon"}, ${tries} so far`;
}

function Op({ id, op, label, csrf, variant = "secondary" }: { id: string; op: string; label: string; csrf: string; variant?: "secondary" | "ghost" | "primary" }) {
  return (
    <ActionForm action={webhookAction} csrf={csrf}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value={op} />
      <Button type="submit" size="sm" variant={variant}>
        {label}
      </Button>
    </ActionForm>
  );
}

export default async function WebhooksPage() {
  const { info, me, workspaceId, csrf } = await appPage("/app/settings/webhooks");
  const role = (await accounts().roleIn(me, workspaceId)) ?? "viewer";
  const manage = can(role, "manage_webhooks");
  const w = appWebhooks();
  const hooks = manage ? await w.list(me, workspaceId) : [];
  const logs = new Map<string, WebhookDelivery[]>();
  for (const h of hooks) logs.set(h.id, await w.deliveries(me, workspaceId, h.id, 6));
  const dev = w.senderName === "dev";

  return (
    <AppShell info={info} active="settings">
      <div className={styles.head}>
        <div className={styles.headText}>
          <Link href="/app/settings/api" className={styles.crumb}>
            <Icon name="arrow-left" size={16} /> API and assistants
          </Link>
          <h1 className={styles.h1}>Webhooks</h1>
          <p className={styles.lead}>Tell your own software the moment a run finishes, a pipeline waits for a pick, or a pipeline is ready for a yes. Every delivery is signed, and tried again until it lands.</p>
        </div>
      </div>

      {dev && (
        <div className={s.devNote}>
          <Icon name="info" size={18} />
          <span>This app runs on your machine, so deliveries are logged here and in the data folder, never sent anywhere. Once WOVI is live they go out over HTTPS.</span>
        </div>
      )}

      {!manage ? (
        <section className={[styles.panel, styles.panelAlt, styles.wovi].join(" ")} aria-label="Webhooks">
          <Mascot pose="wait" size={84} label="Wovi, waiting" />
          <b>Owners and admins set up webhooks</b>
          <span>Ask one of them to add the URL your software listens on.</span>
        </section>
      ) : (
        <div className={s.layout}>
          <div className={s.hooks}>
            {hooks.length === 0 && (
              <section className={[styles.panel, styles.panelAlt, styles.wovi].join(" ")} aria-label="No webhooks yet">
                <Mascot pose="hello" size={84} label="Wovi, saying hello" />
                <b>No webhooks yet</b>
                <span>Add the URL your software listens on, and pick what it wants to hear about.</span>
              </section>
            )}
            {hooks.map((h) => {
              const log = logs.get(h.id) ?? [];
              return (
                <section key={h.id} className={[styles.panel, s.hook].join(" ")} aria-label={h.url}>
                  <div className={s.hookTop}>
                    <span className={s.keyMark}>
                      <Icon name="bell" size={18} />
                    </span>
                    <span className={s.hookUrl}>
                      <b>{h.url}</b>
                      <span>
                        {h.description ? `${h.description}. ` : ""}Secret <span className={s.mono}>{h.secretHint}</span>, added {when(h.createdAt)}
                      </span>
                    </span>
                    {h.pausedAt && <span className={s.role}>Paused</span>}
                  </div>
                  <div className={s.events}>
                    {h.events.map((e) => (
                      <span key={e} className={[s.event, h.pausedAt ? s.paused : ""].join(" ")}>
                        {e}
                      </span>
                    ))}
                  </div>
                  {log.length > 0 ? (
                    <ul className={s.deliveries} aria-label="Latest deliveries">
                      {log.map((d) => (
                        <li key={d.id} className={s.delivery}>
                          <span className={[s.dot, d.status === "pending" ? s.dotPending : d.status === "failed" ? s.dotFailed : ""].join(" ")} aria-label={d.status} />
                          <span className={s.deliveryMeta}>
                            <code>{d.type}</code> {deliveryWords(d)}
                          </span>
                          <span className={s.when}>{when(d.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={[styles.muted, styles.small].join(" ")}>Nothing sent yet. Send a test to see one arrive.</p>
                  )}
                  <div className={s.buttons}>
                    <Op id={h.id} op="test" label="Send a test" csrf={csrf} variant="primary" />
                    <Op id={h.id} op={h.pausedAt ? "resume" : "pause"} label={h.pausedAt ? "Resume" : "Pause"} csrf={csrf} variant="ghost" />
                    <Op id={h.id} op="rotate" label="New secret" csrf={csrf} variant="ghost" />
                    <Op id={h.id} op="remove" label="Remove" csrf={csrf} variant="ghost" />
                  </div>
                </section>
              );
            })}
            <section className={[styles.panel, styles.panelAlt, styles.stack].join(" ")} aria-label="Check the signature">
              <div className={s.panelHead}>
                <div>
                  <h2>Check every delivery</h2>
                  <p>Each one carries Wovi-Signature, Wovi-Event and Wovi-Delivery. Answer with any 2xx; anything else is tried again after 10 s, 1 min, 5 min, 30 min and 2 h.</p>
                </div>
              </div>
              <CodeBlock snippet={VERIFY_SNIPPET} />
            </section>
          </div>

          <div className={styles.stack}>
            <section className={[styles.panel, styles.stack].join(" ")} aria-label="Add a webhook">
              <div className={s.panelHead}>
                <div>
                  <h2>Add a webhook</h2>
                  <p>An https:// URL. While the app runs on your machine, http://localhost works too.</p>
                </div>
              </div>
              <ActionForm action={createWebhook} csrf={csrf} className={s.stackForm}>
                <Input label="URL" name="url" type="url" placeholder="https://example.com/wovi-hook" required />
                <span className={styles.fieldLabel}>Send me</span>
                <div className={s.checks}>
                  {WEBHOOK_EVENTS.map((e) => (
                    <label key={e} className={s.check} title={EVENT_WORDS[e]}>
                      <input type="checkbox" name="events" value={e} defaultChecked={e === "run.finished"} />
                      <code>{e}</code>
                    </label>
                  ))}
                </div>
                <Input label="What it is for" name="description" placeholder="Our scheduler" maxLength={120} />
                <Button type="submit" leading={<Icon name="plus" size={16} />}>
                  Add webhook
                </Button>
              </ActionForm>
            </section>
          </div>
        </div>
      )}
    </AppShell>
  );
}
