"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { savePipeline, setPipelineStatus } from "@/app/builder/pipelines/actions";
import { agentIcon } from "@/components/app/agent-icons";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import type { AgentInput } from "@/lib/agents/spec";
import type { PipelineVersionInfo } from "@/lib/pipelines/registry";
import { bodyOfPipeline, type Mapping, type PipelineBody, type PipelineSpec, type PipelineStep } from "@/lib/pipelines/spec";
import { validatePipelineBody, type AgentShape } from "@/lib/pipelines/validate";
import styles from "./Builder.module.css";
import { StatusPill } from "./BuilderShell";
import { ago } from "./labels";
import e from "./PipelineEditor.module.css";

/** An agent the editor can put in a step, with every version's shape for the validator. */
export type AgentOption = { id: string; name: string; current: string; status: string; versions: AgentShape[] };

const TYPE_WORDS: Record<AgentInput["type"], string> = { text: "text", long_text: "long text", url: "link", choice: "choice", number: "number", profile: "Brand Brain", image: "images", video: "video", file: "files" };

/* ---------- Mappings as one select value ---------- */

function encode(m: Mapping | undefined): string {
  if (!m) return "";
  if (m.from === "input") return `input:${m.key}`;
  if (m.from === "step") return `step:${m.step}:${m.take}${m.field ? `:${m.field}` : ""}`;
  return m.from;
}

function decode(v: string, prev: Mapping | undefined): Mapping | undefined {
  if (!v) return undefined;
  if (v === "value") return prev?.from === "value" ? prev : { from: "value", value: "" };
  if (v === "template") return prev?.from === "template" ? prev : { from: "template", text: "{{inputs.idea}}" };
  const [kind, a, b, c] = v.split(":");
  if (kind === "input") return { from: "input", key: a };
  return { from: "step", step: a, take: b === "picked" ? "picked" : "all", ...(c ? { field: c } : {}) };
}

type ChooseKey = "none" | "item" | "best" | "ask";
type FailKey = "none" | "rewrite_review" | "rewrite_stop" | "stop";

const failKey = (s: PipelineStep): FailKey => (!s.onFail ? "none" : s.onFail.rewrite ? (s.onFail.then === "stop" ? "rewrite_stop" : "rewrite_review") : "stop");

/**
 * The builder's pipeline editor: the basics, the pipeline's own form as
 * JSON, each step with its agent and version, where each input comes from,
 * how it picks and what happens when its checks fail, the package, and a
 * save as a new version. The validator runs on every change, with each
 * message next to the step or input it is about.
 */
export function PipelineEditor({ csrf, spec, agents, versions, updatedAt, now }: { csrf: string; spec: PipelineSpec; agents: AgentOption[]; versions: PipelineVersionInfo[]; updatedAt: string; now: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [body, setBody] = useState<PipelineBody>(() => bodyOfPipeline(spec));
  const [inputsJson, setInputsJson] = useState(() => JSON.stringify(spec.inputs, null, 2));
  const [inputsError, setInputsError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [bump, setBump] = useState<"patch" | "minor" | "major">("patch");
  const [saving, setSaving] = useState(false);

  const lookup = useMemo(() => {
    const byId = new Map(agents.map((a) => [a.id, a]));
    return (id: string, v: string) => {
      const a = byId.get(id);
      if (!a) return null;
      return a.versions.find((x) => x.version === (v === "current" ? a.current : v)) ?? null;
    };
  }, [agents]);

  const errors = useMemo(() => {
    const r = validatePipelineBody(body, lookup);
    return r.ok ? [] : r.errors;
  }, [body, lookup]);
  const changed = JSON.stringify(body) !== JSON.stringify(bodyOfPipeline(spec));

  const stepErrors = (i: number) => errors.filter((x) => x.startsWith(`steps[${i}]`) && !x.startsWith(`steps[${i}].inputs.`)).map((x) => x.replace(/^steps\[\d+\]\.?/, ""));
  const inputError = (i: number, key: string) => errors.find((x) => x.startsWith(`steps[${i}].inputs.${key}:`))?.replace(/^[^:]+: /, "");
  const general = errors.filter((x) => !x.startsWith("steps[")).map((x) => x);

  const setStep = (i: number, patch: Partial<PipelineStep>) => setBody((b) => ({ ...b, steps: b.steps.map((s, n) => (n === i ? { ...s, ...patch } : s)) }));
  const setMapping = (i: number, key: string, m: Mapping | undefined) =>
    setBody((b) => ({
      ...b,
      steps: b.steps.map((s, n) => {
        if (n !== i) return s;
        const inputs = { ...s.inputs };
        if (m) inputs[key] = m;
        else delete inputs[key];
        return { ...s, inputs };
      }),
    }));
  const move = (i: number, d: -1 | 1) =>
    setBody((b) => {
      const steps = [...b.steps];
      const j = i + d;
      if (j < 0 || j >= steps.length) return b;
      [steps[i], steps[j]] = [steps[j], steps[i]];
      return { ...b, steps };
    });
  const remove = (i: number) => setBody((b) => ({ ...b, steps: b.steps.filter((_, n) => n !== i), package: b.package.filter((p) => p.step !== b.steps[i].id) }));
  const add = () =>
    setBody((b) => {
      let n = b.steps.length + 1;
      while (b.steps.some((s) => s.id === `step_${n}`)) n++;
      return { ...b, steps: [...b.steps, { id: `step_${n}`, label: "New step", agent: { id: agents[0]?.id ?? "caption-writer", version: "current" }, inputs: {} }] };
    });

  function applyInputs() {
    try {
      const parsed = JSON.parse(inputsJson);
      if (!Array.isArray(parsed)) throw new Error("Expected a list of inputs.");
      setBody((b) => ({ ...b, inputs: parsed }));
      setInputsError(null);
    } catch (err) {
      setInputsError((err as Error).message);
    }
  }

  async function save() {
    setSaving(true);
    const r = await savePipeline(csrf, spec.id, body, { bump, note });
    setSaving(false);
    if (!r.ok) return toast({ tone: "warning", title: r.error, description: r.issues?.slice(0, 2).join(" ") });
    toast({ tone: "success", title: `Saved as version ${r.value.version}`, description: "New runs use it. Runs already going keep theirs." });
    setNote("");
    router.refresh();
  }

  async function status(next: "live" | "draft") {
    const r = await setPipelineStatus(csrf, spec.id, next);
    if (!r.ok) return toast({ tone: "warning", title: r.error });
    toast({ tone: "success", title: next === "live" ? "Live for every workspace" : "Back to draft" });
    router.refresh();
  }

  const profileInputs = body.inputs.filter((i) => i.type === "profile");
  const choiceInputs = body.inputs.filter((i): i is Extract<AgentInput, { type: "choice" }> => i.type === "choice" && !i.multiple);

  return (
    <>
      <div className={styles.head}>
        <div className={styles.headText}>
          <Link href="/builder/pipelines" className={styles.crumb}>
            <Icon name="chevron-right" size={16} style={{ rotate: "180deg" }} /> Pipelines
          </Link>
          <div className={styles.titleRow}>
            <h1>{spec.name}</h1>
            <StatusPill status={spec.status} />
          </div>
          <div className={styles.meta}>
            <span className={styles.mono}>{spec.id}</span>
            <span>v{spec.version}</span>
            <span>
              {versions.length} version{versions.length === 1 ? "" : "s"}
            </span>
            <span>Edited {ago(updatedAt, now)}</span>
          </div>
        </div>
        <div className={styles.actions}>
          <Button variant="ghost" onClick={() => status(spec.status === "live" ? "draft" : "live")}>
            {spec.status === "live" ? "Back to draft" : "Publish"}
          </Button>
          <Button onClick={save} loading={saving} disabled={!changed || errors.length > 0}>
            Save as a new version
          </Button>
        </div>
      </div>

      <div className={e.grid}>
        <div className={e.main}>
          <Card title="The pipeline" className={styles.section}>
            <div className={styles.fieldGrid}>
              <Input label="Name" value={body.name} onChange={(ev) => setBody({ ...body, name: ev.target.value })} maxLength={48} />
              <Input label="Total cap per run (USD)" type="number" step="0.01" min="0.01" value={String(body.maxCostUsd)} onChange={(ev) => setBody({ ...body, maxCostUsd: Number(ev.target.value) })} hint="Every step and rewrite together." />
              <div className={styles.span2}>
                <Input label="The job, in one line" value={body.job} onChange={(ev) => setBody({ ...body, job: ev.target.value })} maxLength={160} />
              </div>
              <Select label="Brand Brain picker" value={body.brand.input ?? ""} onChange={(ev) => setBody({ ...body, brand: { ...body.brand, input: ev.target.value || undefined } })} options={[{ value: "", label: "None, use the default" }, ...profileInputs.map((i) => ({ value: i.key, label: i.label }))]} hint="Steers every step." />
              <Input label="The approve step says" value={body.approve.label} onChange={(ev) => setBody({ ...body, approve: { label: ev.target.value } })} maxLength={80} />
            </div>
          </Card>

          <Card title="The form people fill in" actions={<span className={styles.hint}>Same shape as an agent&apos;s inputs</span>} className={styles.section}>
            <div className={e.inputSummary}>
              {body.inputs.map((i) => (
                <span key={i.key} className={e.inputPill}>
                  <b>{i.label}</b> <span className={styles.mono}>{i.key}</span> {TYPE_WORDS[i.type]}
                  {i.required ? "" : ", optional"}
                </span>
              ))}
            </div>
            <details className={e.details}>
              <summary>Edit as JSON</summary>
              <Textarea aria-label="Pipeline inputs JSON" value={inputsJson} onChange={(ev) => setInputsJson(ev.target.value)} rows={14} className={styles.json} spellCheck={false} error={inputsError ?? undefined} />
              <div className={styles.actions}>
                <Button size="sm" variant="secondary" onClick={applyInputs}>
                  Apply
                </Button>
              </div>
            </details>
          </Card>

          {body.steps.map((s, i) => {
            const agent = lookup(s.agent.id, s.agent.version);
            const option = agents.find((a) => a.id === s.agent.id);
            const before = body.steps.slice(0, i);
            const sources = [
              ...body.inputs.map((inp) => ({ value: `input:${inp.key}`, label: `Form: ${inp.label}` })),
              ...before.flatMap((b, n) => {
                const out = lookup(b.agent.id, b.agent.version)?.output;
                const fields = out?.kind === "list" ? (out.fields ?? []) : [];
                return [
                  { value: `step:${b.id}:all`, label: `Step ${n + 1} (${b.label}): all of it` },
                  ...(b.choose ? [{ value: `step:${b.id}:picked`, label: `Step ${n + 1} (${b.label}): the picked one` }, ...fields.map((f) => ({ value: `step:${b.id}:picked:${f}`, label: `Step ${n + 1}: picked ${f.replace(/_/g, " ")}` }))] : []),
                ];
              }),
              { value: "value", label: "A fixed value" },
              { value: "template", label: "A template" },
            ];
            const se = stepErrors(i);
            const choose: ChooseKey = !s.choose ? "none" : s.choose.kind === "item" ? "item" : s.choose.kind === "best_brand_fit" ? "best" : "ask";
            return (
              <Card key={i} className={[e.step, se.length || agent?.inputs.some((inp) => inputError(i, inp.key)) ? e.stepError : ""].join(" ")} padding="md">
                <div className={e.stepHead}>
                  <span className={e.stepNo}>
                    <Icon name={agentIcon(s.agent.id)} size={20} />
                    <b>{i + 1}</b>
                  </span>
                  <div className={e.stepFields}>
                    <Input label="Step" value={s.label} onChange={(ev) => setStep(i, { label: ev.target.value })} maxLength={60} />
                    <Input label="Id" value={s.id} onChange={(ev) => setStep(i, { id: ev.target.value })} maxLength={40} className={styles.mono} />
                    <Select label="Agent" value={s.agent.id} onChange={(ev) => setStep(i, { agent: { id: ev.target.value, version: "current" }, inputs: {} })} options={agents.map((a) => ({ value: a.id, label: `${a.name}${a.status === "live" ? "" : ` (${a.status})`}` }))} />
                    <Select label="Version" value={s.agent.version} onChange={(ev) => setStep(i, { agent: { ...s.agent, version: ev.target.value } })} options={[{ value: "current", label: `Current (${option?.current ?? "?"})` }, ...(option?.versions ?? []).map((v) => ({ value: v.version, label: `Pinned ${v.version}` }))]} />
                  </div>
                  <span className={styles.iconButtons}>
                    <button type="button" className={styles.iconButton} onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                      <Icon name="chevron-down" size={18} style={{ rotate: "180deg" }} />
                    </button>
                    <button type="button" className={styles.iconButton} onClick={() => move(i, 1)} disabled={i === body.steps.length - 1} aria-label="Move down">
                      <Icon name="chevron-down" size={18} />
                    </button>
                    <button type="button" className={[styles.iconButton, styles.iconButtonDanger].join(" ")} onClick={() => remove(i)} disabled={body.steps.length === 1} aria-label="Remove step">
                      <Icon name="close" size={18} />
                    </button>
                  </span>
                </div>

                {agent && (
                  <div className={e.map}>
                    <span className={e.mapHead}>Where each input comes from</span>
                    {agent.inputs.map((inp) => {
                      const m = s.inputs[inp.key];
                      const err = inputError(i, inp.key);
                      return (
                        <div key={inp.key} className={[e.mapRow, err ? e.mapRowError : ""].join(" ")}>
                          <span className={e.mapName}>
                            <b>{inp.label}</b>
                            <span>
                              <span className={styles.mono}>{inp.key}</span> {TYPE_WORDS[inp.type]}
                              {inp.required ? ", required" : ""}
                            </span>
                          </span>
                          <span className={e.mapArrow} aria-hidden="true">
                            <Icon name="arrow-left" size={16} />
                          </span>
                          <div className={e.mapSource}>
                            <Select aria-label={`${inp.label} comes from`} value={encode(m)} onChange={(ev) => setMapping(i, inp.key, decode(ev.target.value, m))} options={[{ value: "", label: inp.type === "profile" && body.brand.input ? "The pipeline's Brand Brain" : "Not set" }, ...sources]} />
                            {m?.from === "value" && <Input aria-label="Fixed value" value={Array.isArray(m.value) ? m.value.join(", ") : String(m.value)} onChange={(ev) => setMapping(i, inp.key, { from: "value", value: inp.type === "number" ? Number(ev.target.value) : inp.type === "choice" && inp.multiple ? ev.target.value.split(",").map((x) => x.trim()).filter(Boolean) : ev.target.value })} />}
                            {m?.from === "template" && <Textarea aria-label="Template" rows={2} value={m.text} onChange={(ev) => setMapping(i, inp.key, { from: "template", text: ev.target.value })} className={styles.mono} />}
                            {err && (
                              <span className={styles.fieldError}>
                                <Icon name="warning" size={16} /> {err}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className={e.rules}>
                  <Select
                    label="Pick one"
                    value={choose}
                    onChange={(ev) => {
                      const k = ev.target.value as ChooseKey;
                      setStep(i, { choose: k === "none" ? undefined : k === "item" ? { kind: "item", index: 0 } : k === "best" ? { kind: "best_brand_fit" } : { kind: "ask", label: "Pick the one you like best" } });
                    }}
                    options={[
                      { value: "none", label: "No, pass it all on" },
                      { value: "item", label: "Take item number..." },
                      { value: "best", label: "Take the best brand fit" },
                      { value: "ask", label: "Ask the person" },
                    ]}
                  />
                  {s.choose?.kind === "item" && <Input label="Item number" type="number" min={1} value={String(s.choose.index + 1)} onChange={(ev) => setStep(i, { choose: { kind: "item", index: Math.max(0, Number(ev.target.value) - 1) } })} />}
                  {s.choose?.kind === "ask" && <Input label="Ask with" value={s.choose.label} onChange={(ev) => setStep(i, { choose: { kind: "ask", label: ev.target.value } })} maxLength={80} />}
                  <Select
                    label="If a check fails"
                    value={failKey(s)}
                    onChange={(ev) => {
                      const k = ev.target.value as FailKey;
                      const when = s.onFail?.when ?? "brand";
                      setStep(i, { onFail: k === "none" ? undefined : { when, rewrite: k !== "stop", then: k === "rewrite_review" ? "review" : "stop" } });
                    }}
                    options={[
                      { value: "none", label: "Go on, mark it for review" },
                      { value: "rewrite_review", label: "Rewrite once, then review" },
                      { value: "rewrite_stop", label: "Rewrite once, then stop" },
                      { value: "stop", label: "Stop the pipeline" },
                    ]}
                  />
                  {s.onFail && <Select label="Which checks" value={s.onFail.when} onChange={(ev) => setStep(i, { onFail: { ...s.onFail!, when: ev.target.value as "checks" | "brand" } })} options={[{ value: "brand", label: "Brand checks" }, { value: "checks", label: "Any check" }]} />}
                  <Select
                    label="Runs"
                    value={s.runIf ? `${s.runIf.input}=${s.runIf.equals}` : ""}
                    onChange={(ev) => {
                      const [input, equals] = ev.target.value.split("=");
                      setStep(i, { runIf: ev.target.value ? { input, equals } : undefined });
                    }}
                    options={[{ value: "", label: "Always" }, ...choiceInputs.flatMap((c) => c.options.map((o) => ({ value: `${c.key}=${o.value}`, label: `When ${c.label} is ${o.label}` })))]}
                  />
                  <Input label="Step cap (USD, optional)" type="number" step="0.01" min="0" value={s.maxCostUsd === undefined ? "" : String(s.maxCostUsd)} onChange={(ev) => setStep(i, { maxCostUsd: ev.target.value === "" ? undefined : Number(ev.target.value) })} />
                </div>

                {se.length > 0 && (
                  <ul className={e.errors}>
                    {se.map((x) => (
                      <li key={x}>
                        <Icon name="warning" size={16} /> {x}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}

          <button type="button" className={e.addStep} onClick={add} disabled={body.steps.length >= 8}>
            <Icon name="plus" size={20} /> Add a step
          </button>

          <Card title="The package" actions={<span className={styles.hint}>What the person approves, in order</span>} className={styles.section}>
            <div className={e.packageRows}>
              {body.steps.map((s) => {
                const part = body.package.find((p) => p.step === s.id);
                return (
                  <div key={s.id} className={e.packageRow}>
                    <label className={e.check}>
                      <input
                        type="checkbox"
                        checked={Boolean(part)}
                        onChange={(ev) =>
                          setBody((b) => ({
                            ...b,
                            package: ev.target.checked ? [...b.package, { step: s.id, label: s.label, take: (s.choose ? "picked" : "all") as "picked" | "all" }].sort((x, y) => b.steps.findIndex((q) => q.id === x.step) - b.steps.findIndex((q) => q.id === y.step)) : b.package.filter((p) => p.step !== s.id),
                          }))
                        }
                      />
                      <span>{s.label}</span>
                    </label>
                    {part && (
                      <>
                        <Input aria-label="Shown as" value={part.label} onChange={(ev) => setBody((b) => ({ ...b, package: b.package.map((p) => (p.step === s.id ? { ...p, label: ev.target.value } : p)) }))} maxLength={40} />
                        <Select aria-label="What to show" value={part.take} onChange={(ev) => setBody((b) => ({ ...b, package: b.package.map((p) => (p.step === s.id ? { ...p, take: ev.target.value as "all" | "picked" } : p)) }))} options={[{ value: "picked", label: "The picked one" }, { value: "all", label: "All of it" }]} />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            {errors
              .filter((x) => x.startsWith("package"))
              .map((x) => (
                <span key={x} className={styles.fieldError}>
                  <Icon name="warning" size={16} /> {x}
                </span>
              ))}
          </Card>
        </div>

        <aside className={e.side}>
          <Card title={errors.length ? `${errors.length} to fix` : "Valid"} className={[e.check2, errors.length ? e.bad : e.good].join(" ")}>
            {errors.length === 0 ? (
              <p className={styles.hint}>Every input has a source, every type fits, and no step reads a later one.</p>
            ) : (
              <ul className={e.errors}>
                {general.slice(0, 4).map((x) => (
                  <li key={x}>
                    <Icon name="warning" size={16} /> {x}
                  </li>
                ))}
                {errors
                  .filter((x) => x.startsWith("steps["))
                  .slice(0, 6)
                  .map((x) => (
                    <li key={x}>
                      <Icon name="warning" size={16} /> Step {Number(/^steps\[(\d+)\]/.exec(x)![1]) + 1}: {x.replace(/^[^:]+: /, "")}
                    </li>
                  ))}
              </ul>
            )}
          </Card>
          <Card title="Save" className={styles.section}>
            <Input label="What changed" value={note} onChange={(ev) => setNote(ev.target.value)} maxLength={200} placeholder="Caption step asks the person" />
            <Select label="Version" value={bump} onChange={(ev) => setBump(ev.target.value as typeof bump)} options={[{ value: "patch", label: "Patch: a tweak" }, { value: "minor", label: "Minor: a new optional input" }, { value: "major", label: "Major: the package changes" }]} />
            <Button onClick={save} loading={saving} disabled={!changed || errors.length > 0} block>
              Save as a new version
            </Button>
            <span className={styles.hint}>{changed ? "Unsaved changes." : "Nothing changed yet."}</span>
          </Card>
          <Card title="Versions" className={styles.section}>
            <ol className={e.versions}>
              {[...versions].reverse().map((v) => (
                <li key={v.version}>
                  <b>v{v.version}</b>
                  {v.current && <span className={e.current}>current</span>}
                  <span>{v.note ?? "No note"}</span>
                  <small>{ago(v.createdAt, now)}</small>
                </li>
              ))}
            </ol>
          </Card>
        </aside>
      </div>
    </>
  );
}
