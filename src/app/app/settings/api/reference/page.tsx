import type { Metadata } from "next";
import Link from "next/link";
import s from "@/components/api/Api.module.css";
import { CodeBlock } from "@/components/api/CodeBlock";
import styles from "@/components/app/App.module.css";
import { AppShell } from "@/components/app/AppShell";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { API_ERROR_CODES, CODE_WORDS, STATUS } from "@/lib/api/errors";
import { DEFAULT_API_LIMITS } from "@/lib/api/limits";
import { openApiDocument } from "@/lib/api/openapi";
import { appUrl } from "@/lib/api/server";
import { VERIFY_SNIPPET } from "@/lib/api/snippets";
import { appPage } from "@/lib/app/server";
import { EVENT_WORDS, WEBHOOK_EVENTS } from "@/lib/webhooks/types";

export const metadata: Metadata = { title: "API reference", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Json = Record<string, unknown>;
type Op = { operationId: string; summary: string; description?: string; tags: string[]; parameters?: Json[]; requestBody?: Json; responses: Record<string, Json> };

const refName = (ref: unknown) => (typeof ref === "string" ? ref.split("/").pop()! : "");

/** A schema's type in a few characters: "string", "Run | null", "Option[]", "ready | needs_review". */
function typeOf(schema: Json | undefined): string {
  if (!schema) return "any";
  if (schema.$ref) return refName(schema.$ref);
  if (Array.isArray(schema.anyOf)) return (schema.anyOf as Json[]).map(typeOf).join(" | ");
  if (Array.isArray(schema.enum)) return (schema.enum as unknown[]).length > 4 ? `${typeOf({ type: schema.type })} (${(schema.enum as unknown[]).length} values)` : (schema.enum as unknown[]).map(String).join(" | ");
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (schema.type === "array") return `${typeOf(schema.items as Json)}[]`;
  if (schema.type === "integer") return "integer";
  if (schema.type === "object" && schema.additionalProperties && !schema.properties) return "object";
  return String(schema.type ?? "any");
}

function Fields({ schema, schemas }: { schema: Json; schemas: Record<string, Json> }) {
  const target = schema.$ref ? schemas[refName(schema.$ref)] : schema;
  const props = (target?.properties ?? {}) as Record<string, Json>;
  const required = new Set((target?.required ?? []) as string[]);
  const rows = Object.entries(props);
  if (!rows.length) return null;
  return (
    <div className={s.tableWrap}>
      <table className={s.fields}>
        <thead>
          <tr>
            <th>Field</th>
            <th>Type</th>
            <th>What it is</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, p]) => (
            <tr key={name}>
              <td>
                {name}
                {required.has(name) && <span className={s.req}>required</span>}
              </td>
              <td>{typeOf(p)}</td>
              <td>{String(p.description ?? (p.$ref ? schemas[refName(p.$ref)]?.description ?? "" : ""))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const anchor = (id: string) => id.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();

export default async function ReferencePage() {
  const { info } = await appPage("/app/settings/api/reference");
  const base = appUrl();
  const doc = openApiDocument(base) as Json & { paths: Record<string, Record<string, Op>>; components: { schemas: Record<string, Json> }; tags: { name: string }[] };
  const schemas = doc.components.schemas;
  const ops = Object.entries(doc.paths).flatMap(([path, methods]) => Object.entries(methods).map(([method, op]) => ({ path, method: method.toUpperCase(), op })));
  const tags = doc.tags.map((t) => t.name).filter((t) => ops.some((o) => o.op.tags.includes(t)));
  const l = DEFAULT_API_LIMITS;

  return (
    <AppShell info={info} active="settings">
      <div className={styles.head}>
        <div className={styles.headText}>
          <Link href="/app/settings/api" className={styles.crumb}>
            <Icon name="arrow-left" size={16} /> API and assistants
          </Link>
          <h1 className={styles.h1}>API reference</h1>
          <p className={styles.lead}>
            Every endpoint of <code className={s.mono}>{base}/api/v1</code>, made from the same schemas the API checks requests with. The same as the OpenAPI document, for Postman, ChatGPT actions or your own client.
          </p>
        </div>
        <div className={styles.actions}>
          <ButtonLink href="/api/v1/openapi.json" size="sm" leading={<Icon name="link" size={16} />}>
            openapi.json
          </ButtonLink>
        </div>
      </div>

      <div className={s.refLayout}>
        <nav className={s.toc} aria-label="On this page">
          <span className={s.tocHead}>Start</span>
          <a href="#basics">Keys, limits, errors</a>
          {tags.map((t) => (
            <span key={t} style={{ display: "contents" }}>
              <span className={s.tocHead}>{t}</span>
              {ops
                .filter((o) => o.op.tags.includes(t))
                .map((o) => (
                  <a key={o.op.operationId} href={`#${anchor(o.op.operationId)}`}>
                    {o.op.summary}
                  </a>
                ))}
            </span>
          ))}
          <span className={s.tocHead}>Events</span>
          <a href="#webhooks">Webhooks</a>
        </nav>

        <div className={styles.stack}>
          <section id="basics" className={[styles.panel, styles.stack].join(" ")} aria-label="Basics">
            <div className={s.panelHead}>
              <h2>Keys, limits and errors</h2>
            </div>
            <div className={s.tableWrap}>
              <table className={s.fields}>
                <tbody>
                  <tr>
                    <td>Authorization</td>
                    <td>header</td>
                    <td>
                      <code className={s.mono}>Bearer wovi_sk_...</code> from API and assistants. One workspace, one role. Revoked keys stop at once.
                    </td>
                  </tr>
                  <tr>
                    <td>Idempotency-Key</td>
                    <td>header</td>
                    <td>On starts. The same key and body return the first run; another body is idempotency_conflict.</td>
                  </tr>
                  <tr>
                    <td>Rate limits</td>
                    <td>per minute</td>
                    <td>
                      {l.perKey.max} requests per key, {l.perWorkspace.max} per workspace, {l.startsPerKey.max} run starts per key. RateLimit-Remaining says what is left; a 429 says how long to wait in Retry-After.
                    </td>
                  </tr>
                  <tr>
                    <td>Body</td>
                    <td>JSON</td>
                    <td>At most {Math.round(l.maxBodyBytes / 1024)} KB. Unknown fields are refused, so typos never pass quietly.</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <h3>Errors</h3>
            <p className={s.opText}>
              Every error is <code className={s.mono}>{'{ "error": { "code", "message", "issues": [{ "path", "message" }] } }'}</code>. Issues name the field, like <code className={s.mono}>inputs.idea</code>.
            </p>
            <div className={s.tableWrap}>
              <table className={s.fields}>
                <tbody>
                  {API_ERROR_CODES.map((c) => (
                    <tr key={c}>
                      <td>{c}</td>
                      <td>{STATUS[c]}</td>
                      <td>{CODE_WORDS[c]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {tags.map((t) => (
            <div key={t} className={styles.stack}>
              <h2 className={styles.h1} style={{ fontSize: "var(--fs-2xl)", marginTop: "var(--s-4)" }}>
                {t}
              </h2>
              {ops
                .filter((o) => o.op.tags.includes(t))
                .map(({ path, method, op }) => {
                  const params = (op.parameters ?? []) as { name: string; in: string; required?: boolean; description?: string; schema?: Json }[];
                  const body = (op.requestBody?.content as Json | undefined)?.["application/json"] as { schema: Json } | undefined;
                  const okCode = Object.keys(op.responses).find((k) => k.startsWith("2"))!;
                  const okSchema = ((op.responses[okCode].content as Json | undefined)?.["application/json"] as { schema: Json } | undefined)?.schema;
                  const okName = okSchema ? refName(okSchema.$ref) : "";
                  const list = okSchema && schemas[okName]?.properties && (schemas[okName].properties as Json).data ? `${typeOf((schemas[okName].properties as Record<string, Json>).data)} in data` : okName;
                  return (
                    <section key={op.operationId} id={anchor(op.operationId)} className={[styles.panel, styles.panelTight, s.op].join(" ")} aria-label={op.summary}>
                      <div className={s.opHead}>
                        <span className={[s.method, s[method]].join(" ")}>{method}</span>
                        <code>/api/v1{path}</code>
                      </div>
                      <span className={s.opSummary}>{op.summary}</span>
                      {op.description && <p className={s.opText}>{op.description}</p>}
                      {params.length > 0 && (
                        <div className={s.tableWrap}>
                          <table className={s.fields}>
                            <thead>
                              <tr>
                                <th>Parameter</th>
                                <th>In</th>
                                <th>What it is</th>
                              </tr>
                            </thead>
                            <tbody>
                              {params.map((p) => (
                                <tr key={p.name}>
                                  <td>
                                    {p.name}
                                    {p.required && <span className={s.req}>required</span>}
                                  </td>
                                  <td>{p.in}</td>
                                  <td>{p.description ?? (p.in === "path" ? "The id." : "")}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {body && <Fields schema={body.schema} schemas={schemas} />}
                      <div className={s.statuses}>
                        <span className={[s.status, s.ok2].join(" ")}>
                          <code>{okCode}</code> {list}
                        </span>
                        {Object.keys(op.responses)
                          .filter((k) => k !== okCode)
                          .map((k) => (
                            <span key={k} className={s.status}>
                              <code>{k}</code>
                            </span>
                          ))}
                      </div>
                    </section>
                  );
                })}
            </div>
          ))}

          <h2 className={styles.h1} style={{ fontSize: "var(--fs-2xl)", marginTop: "var(--s-4)" }}>
            What comes back
          </h2>
          {["Run", "Agent", "PipelineRun"].map((name) => (
            <section key={name} id={anchor(name)} className={[styles.panel, styles.panelTight, s.op].join(" ")} aria-label={name}>
              <span className={s.opSummary}>{name}</span>
              {schemas[name]?.description ? <p className={s.opText}>{String(schemas[name].description)}</p> : null}
              <Fields schema={schemas[name]} schemas={schemas} />
            </section>
          ))}

          <section id="webhooks" className={[styles.panel, styles.stack].join(" ")} aria-label="Webhooks">
            <div className={s.panelHead}>
              <div>
                <h2>Webhooks</h2>
                <p>Register a URL in Webhooks or with POST /webhooks. Each event is a signed JSON POST, tried again after 10 s, 1 min, 5 min, 30 min and 2 h until it gets a 2xx.</p>
              </div>
            </div>
            <div className={s.endpoints}>
              {WEBHOOK_EVENTS.map((e) => (
                <div key={e} className={s.endpoint}>
                  <span className={s.event}>{e}</span>
                  <span>{EVENT_WORDS[e]}</span>
                </div>
              ))}
            </div>
            <Fields schema={schemas.WebhookPayload} schemas={schemas} />
            <CodeBlock snippet={VERIFY_SNIPPET} />
          </section>
        </div>
      </div>
    </AppShell>
  );
}
