"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { startPipeline } from "@/app/app/pipelines/actions";
import { Mascot } from "@/components/brand/Mascot";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import type { PipelineInfo } from "@/lib/app/api";
import { checkForm, formFields, initialValues, valuesFrom, type FormValues } from "@/lib/app/forms";
import type { PipelineExample } from "@/lib/app/pipeline-examples";
import styles from "./App.module.css";
import p from "./Pipeline.module.css";
import { Field, type BrainOption } from "./AgentRun";
import { ChainList } from "./PipelineParts";

/**
 * A pipeline's own form, generated from its inputs like an agent's, the
 * Brand Brain picker, the confirmations its agents ask for, and the chain
 * beside it. Starting goes to the run's page.
 */
export function PipelineStart({ csrf, info, brains, editor, examples }: { csrf: string; info: PipelineInfo; brains: BrainOption[]; editor: boolean; examples: PipelineExample[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const spec = info.spec;
  const fields = formFields(spec);
  const brandKey = spec.brand.input ?? null;
  const [values, setValues] = useState<FormValues>(() => initialValues(spec));
  const [brainId, setBrainId] = useState<string>(() => brains.find((b) => b.isDefault)?.id ?? brains[0]?.id ?? "");
  const [rights, setRights] = useState(false);
  const [voice, setVoice] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const asks = info.confirmations;

  const set = (key: string, v: FormValues[string]) => {
    setValues((all) => ({ ...all, [key]: v }));
    setErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  };

  function fillExample() {
    const name = brains.find((b) => b.id === brainId)?.name;
    const example = examples.find((e) => e.brain === name) ?? examples[0];
    if (!example) return;
    setValues({ ...initialValues(spec), ...valuesFrom(spec, example.inputs) });
    setErrors({});
  }

  async function submit() {
    const check = checkForm(spec, values, brandKey ? brainId || null : null);
    const problems: Record<string, string> = check.ok ? {} : { ...check.errors };
    if (asks.rights && !rights) problems.rights = "Confirm this is your content first.";
    if (asks.voice && !voice) problems.voice = "Confirm you have consent for the voice first.";
    if (Object.keys(problems).length) return setErrors(problems);
    setBusy(true);
    const r = await startPipeline(csrf, {
      pipelineId: spec.id,
      pipelineWorkspaceId: info.workspaceId,
      inputs: check.ok ? check.inputs : {},
      confirmations: asks.rights || asks.voice ? { ...(asks.rights ? { rights } : {}), ...(asks.voice ? { voiceConsent: voice } : {}) } : undefined,
    });
    if (!r.ok) {
      setBusy(false);
      if (r.issues?.length) {
        const byField: Record<string, string> = {};
        for (const line of r.issues) {
          const m = /^([a-z][a-z0-9_]*): (.*)$/.exec(line);
          byField[m && !m[1].startsWith("steps") ? m[1] : "form"] = m ? m[2] : line;
        }
        setErrors(byField);
      }
      return toast({ tone: "warning", title: r.error, description: r.code === "forbidden" ? "Ask an owner or admin for the editor role." : undefined });
    }
    router.push(`/app/pipelines/runs/${r.value.id}`);
  }

  return (
    <div className={styles.runGrid}>
      <form
        className={[styles.panel, styles.form].join(" ")}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className={styles.formGrid}>
          {fields.map((f) => (
            <div key={f.key} className={f.kind === "long_text" || f.kind === "choices" ? styles.span2 : undefined}>
              <Field field={f} value={values[f.key]} error={errors[f.key]} uploading={false} onChange={(v) => set(f.key, v)} onFiles={() => undefined} />
            </div>
          ))}
        </div>

        {(asks.rights || asks.voice) && (
          <div className={styles.stackTight}>
            {asks.rights && (
              <label className={styles.confirm}>
                <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} />
                <span>I own this content, or I have the rights to use it. {errors.rights && <b className={styles.fieldError}>{errors.rights}</b>}</span>
              </label>
            )}
            {asks.voice && (
              <label className={styles.confirm}>
                <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} />
                <span>I have documented consent for this voice. {errors.voice && <b className={styles.fieldError}>{errors.voice}</b>}</span>
              </label>
            )}
          </div>
        )}

        {errors.form && (
          <p className={styles.fieldError} role="alert">
            <Icon name="warning" size={16} /> {errors.form}
          </p>
        )}

        <div className={styles.runBar}>
          <span>{editor ? `${info.steps.length} agents in a row, each reading the one before. You approve at the end.` : "Your role here is viewer, so you can look but not start pipelines."}</span>
          <div className={styles.actions}>
            {examples.length > 0 && (
              <Button type="button" variant="ghost" onClick={fillExample} leading={<Icon name="spark" size={18} />}>
                Fill with an example
              </Button>
            )}
            <Button type="submit" size="lg" loading={busy} disabled={!editor} trailing={<Icon name="arrow-right" />}>
              Start the pipeline
            </Button>
          </div>
        </div>
      </form>

      <aside className={styles.runSideCol}>
        {brandKey && (
          <div className={[styles.panel, styles.panelTight, styles.panelAlt, styles.stack].join(" ")}>
            {brains.length > 0 ? (
              <Select label="Brand Brain" value={brainId} onChange={(e) => setBrainId(e.target.value)} hint="Every step reads it first." options={brains.map((b) => ({ value: b.id, label: `${b.name}${b.isDefault ? " (default)" : ""}` }))} error={errors[brandKey]} />
            ) : (
              <div className={styles.stackTight}>
                <span className={styles.fieldLabel}>Brand Brain</span>
                <span className={styles.fieldHelp}>No Brand Brain yet, so every step writes in a plain, warm voice.</span>
                <ButtonLink href="/app/welcome" size="sm" variant="secondary">
                  Build one
                </ButtonLink>
              </div>
            )}
          </div>
        )}
        <div className={[styles.panel, styles.panelTight, styles.stack].join(" ")}>
          <span className={p.chainHead}>
            <span className={styles.fieldLabel}>The chain</span>
            <Mascot pose="wait" size={40} label="Wovi, waiting for a job" />
          </span>
          <ChainList info={info} />
        </div>
      </aside>
    </div>
  );
}
