"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { cancelRun, runView, startRun, uploadRunFile } from "@/app/app/make/actions";
import { Mascot } from "@/components/brand/Mascot";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import type { PublicAgent } from "@/lib/accounts/guard";
import type { Price, RunView } from "@/lib/app/api";
import { exampleInputs, type FormExample } from "@/lib/app/examples";
import { CreditsBlocked, PriceLine } from "@/components/credits/CreditParts";
import { checkForm, confirmationsFor, formFields, initialValuesFor, switchPlatformDefaults, valuesFrom, type FormField, type FormValues } from "@/lib/app/forms";
import type { FileRef } from "@/lib/runs/inputs";
import styles from "./App.module.css";
import { AGENT_GETS } from "./agent-icons";
import { Asked, RunResult } from "./RunResult";
import { BlockedNotice } from "@/components/safety/BlockedNotice";
import { PlatformRules } from "@/components/safety/PlatformRules";
import { RightsCheck } from "@/components/safety/RightsCheck";

/** `platforms` are the brand's own, from onboarding or its Brand Brain: the platform fields open on the first one. */
export type BrainOption = { id: string; name: string; isDefault: boolean; platforms?: readonly string[] };

type Phase = { kind: "form" } | { kind: "running"; runId: string; view: RunView | null; startedAt: number } | { kind: "done"; view: RunView };

/**
 * The agent's own form, generated from its spec, the Brand Brain picker, the
 * run through the engine with Wovi on the move, and the result when it lands.
 */
export function AgentRun({
  csrf,
  agent,
  brains,
  editor,
  examples,
  initialRun,
  reviewer,
  now,
  price = null,
}: {
  csrf: string;
  agent: PublicAgent;
  /** What a run costs before it starts, with the balance (phase 13). Null when nothing is billed. */
  price?: Price | null;
  brains: BrainOption[];
  editor: boolean;
  /** The agent's golden samples, to fill the form in one click: the one written for the picked Brand Brain when there is one. */
  examples: FormExample[];
  /** A run to show instead of the form, when the page opened on one. */
  initialRun: RunView | null;
  reviewer: string | null;
  now: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const fields = formFields(agent);
  const asks = confirmationsFor(agent);
  const readsIdea = agent.brandBrain.includes("idea");
  const [values, setValues] = useState<FormValues>(() => initialValuesFor(agent, (brains.find((b) => b.isDefault) ?? brains[0])?.platforms));
  const [brainId, setBrainId] = useState<string>(() => brains.find((b) => b.isDefault)?.id ?? brains[0]?.id ?? "");
  const [idea, setIdea] = useState("");
  const [rights, setRights] = useState(false);
  const [voice, setVoice] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  /** The engine's own refusal for credits, when it came at submit. */
  const [creditStop, setCreditStop] = useState<{ code: "not_enough_credits" | "over_limit"; message: string } | null>(null);
  /** Phase 18: the content rules refused the request, field by field. */
  const [blocked, setBlocked] = useState<string[] | null>(null);
  const [phase, setPhase] = useState<Phase>(() => (initialRun ? (initialRun.state === "queued" || initialRun.state === "running" ? { kind: "running", runId: initialRun.run.id, view: initialRun, startedAt: Date.parse(initialRun.run.createdAt) } : { kind: "done", view: initialRun }) : { kind: "form" }));
  const [nowMs, setNowMs] = useState(0);
  const polling = useRef(false);

  const set = (key: string, v: FormValues[string]) => {
    setValues((all) => ({ ...all, [key]: v }));
    setErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  };

  /* Polls the run every second while it runs, and counts the seconds. */
  const poll = useCallback(
    async (runId: string) => {
      if (polling.current) return;
      polling.current = true;
      try {
        const r = await runView(csrf, runId);
        if (!r.ok || !r.value) return;
        const v = r.value;
        if (v.state === "queued" || v.state === "running") setPhase((p) => (p.kind === "running" && p.runId === runId ? { ...p, view: v } : p));
        else setPhase({ kind: "done", view: v });
      } finally {
        polling.current = false;
      }
    },
    [csrf],
  );

  const runningId = phase.kind === "running" ? phase.runId : null;
  const startedAt = phase.kind === "running" ? phase.startedAt : 0;
  useEffect(() => {
    if (!runningId) return;
    const clock = () => setNowMs(Date.now());
    const first = setTimeout(clock, 0);
    const timer = setInterval(() => {
      clock();
      void poll(runningId);
    }, 1000);
    void poll(runningId);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [runningId, poll]);

  async function submit() {
    const check = checkForm(agent, values, brainId || null);
    const problems: Record<string, string> = check.ok ? {} : { ...check.errors };
    if (asks.rights && !rights) problems.rights = "Confirm this is your content first.";
    if (asks.voice && !voice) problems.voice = "Confirm you have consent for the voice first.";
    if (Object.keys(problems).length) {
      setErrors(problems);
      return;
    }
    setBusy(true);
    setBlocked(null);
    const r = await startRun(csrf, {
      agentId: agent.id,
      inputs: check.ok ? check.inputs : {},
      brandBrainId: brainId || null,
      brandIdea: readsIdea && idea.trim() ? idea.trim() : null,
      confirmations: asks.rights || asks.voice ? { ...(asks.rights ? { rights } : {}), ...(asks.voice ? { voiceConsent: voice } : {}) } : undefined,
      // Never charged more than the estimate on screen.
      ...(price ? { quotedCredits: price.estimate } : {}),
    });
    setBusy(false);
    if (!r.ok) {
      if (r.code === "not_enough_credits" || r.code === "over_limit") {
        setCreditStop({ code: r.code, message: r.error });
        return;
      }
      if (r.code === "blocked") {
        setBlocked(r.issues?.length ? r.issues : [r.error]);
        return;
      }
      if (r.issues?.length) {
        const byField: Record<string, string> = {};
        for (const line of r.issues) {
          const m = /^([a-z][a-z0-9_]*): (.*)$/.exec(line);
          byField[m ? m[1] : "form"] = m ? m[2] : line;
        }
        setErrors(byField);
      }
      toast({ tone: "warning", title: r.error, description: r.issues?.length ? undefined : r.code === "forbidden" ? "Ask an owner or admin for the editor role." : undefined });
      return;
    }
    setNowMs(0);
    setPhase({ kind: "running", runId: r.value.id, view: null, startedAt: Date.now() });
    router.replace(`/app/make/${agent.id}?run=${r.value.id}`, { scroll: false });
  }

  async function stop() {
    if (phase.kind !== "running") return;
    const r = await cancelRun(csrf, phase.runId);
    if (!r.ok) return toast({ tone: "warning", title: r.error });
    await poll(phase.runId);
  }

  function another() {
    setPhase({ kind: "form" });
    setErrors({});
    router.replace(`/app/make/${agent.id}`, { scroll: false });
    window.scrollTo({ top: 0 });
  }

  function fillExample() {
    const inputs = exampleInputs(examples, brains.find((b) => b.id === brainId)?.name);
    if (!inputs) return;
    setValues(valuesFrom(agent, inputs));
    setErrors({});
  }

  /** Another brand: its platform becomes the pick, unless the person chose one. */
  function pickBrain(next: string) {
    setValues((all) => switchPlatformDefaults(agent, all, brains.find((b) => b.id === brainId)?.platforms, brains.find((b) => b.id === next)?.platforms));
    setBrainId(next);
  }

  async function upload(field: FormField, list: FileList | null, rightsOk: boolean) {
    const file = list?.[0];
    if (!file) return;
    setUploading(field.key);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("kind", field.kind);
    // Phase 18: the server refuses the file without the rights box ticked.
    if (rightsOk) fd.set("rights", "yes");
    const r = await uploadRunFile(csrf, fd);
    setUploading(null);
    if (!r.ok) return toast({ tone: "warning", title: r.error });
    const current = (values[field.key] as FileRef[] | undefined) ?? [];
    set(field.key, [...current, r.value].slice(0, field.maxFiles ?? 1));
  }

  const gets = AGENT_GETS[agent.id] ?? [`One ${agent.output.kind.replace("_", " ")} from this agent`];

  if (phase.kind === "running") {
    const status = phase.view?.run.status ?? "queued";
    const seconds = nowMs ? Math.max(0, Math.round((nowMs - startedAt) / 1000)) : 0;
    const steps = [
      { label: `Sent to ${agent.name}`, state: "done" },
      { label: "In the queue", state: status === "queued" ? "now" : "done" },
      { label: "Writing in your voice", state: status === "running" ? "now" : "todo" },
      { label: "Checked against your Brand Brain", state: "todo" },
    ];
    return (
      <div className={styles.stack}>
      <section className={[styles.panel, styles.running].join(" ")} aria-live="polite">
        <Mascot pose="move" size={150} className="wovi" label="Wovi, on the move" />
        <div className={styles.runningText}>
          <span className="eyebrow">{agent.name}</span>
          <h2>{status === "queued" ? "In the queue" : "Writing"}</h2>
          <ol className={styles.progress}>
            {steps.map((s) => (
              <li key={s.label} data-state={s.state}>
                <span className={styles.dot}>{s.state === "done" && <Icon name="check" size={14} />}</span>
                {s.label}
              </li>
            ))}
          </ol>
          <div className={styles.runningMeta}>
            <span>
              {seconds} second{seconds === 1 ? "" : "s"}
            </span>
            {phase.view?.run.brandBrain?.name && <span>For {phase.view.run.brandBrain.name}</span>}
            <Button size="sm" variant="ghost" onClick={stop}>
              Stop
            </Button>
          </div>
        </div>
      </section>
      {phase.view && (
        <section className={styles.stackTight}>
          <span className={styles.fieldLabel}>What you asked for</span>
          <Asked run={phase.view.run} agent={agent} />
        </section>
      )}
      </div>
    );
  }

  if (phase.kind === "done") {
    return <RunResult csrf={csrf} agent={agent} view={phase.view} editor={editor} reviewer={reviewer} now={now} onRerun={(id) => { setNowMs(0); setPhase({ kind: "running", runId: id, view: null, startedAt: Date.now() }); router.replace(`/app/make/${agent.id}?run=${id}`, { scroll: false }); window.scrollTo({ top: 0 }); }} onAnother={another} />;
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
            <div key={f.key} className={f.kind === "long_text" || f.kind === "choices" || f.kind === "image" || f.kind === "file" || f.kind === "video" ? styles.span2 : undefined}>
              <Field field={f} value={values[f.key]} error={errors[f.key]} uploading={uploading === f.key} onChange={(v) => set(f.key, v)} onFiles={(list, ok) => upload(f, list, ok)} />
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

        {blocked && <BlockedNotice lines={blocked} fieldLabel={(key) => fields.find((f) => f.key === key)?.label ?? (key === "brandIdea" ? "The idea" : key)} />}

        {editor && price && (price.blocked || creditStop) && <CreditsBlocked price={creditStop ? { ...price, blocked: creditStop } : price} />}

        <div className={styles.runBar}>
          {editor && price ? <PriceLine price={price} /> : <span>{editor ? "Runs through WOVI on the brand you pick. You approve before anything is used." : "Your role here is viewer, so you can look but not run agents."}</span>}
          <div className={styles.actions}>
            {examples.length > 0 && (
              <Button type="button" variant="ghost" onClick={fillExample} leading={<Icon name="spark" size={18} />}>
                Fill with an example
              </Button>
            )}
            <Button type="submit" size="lg" loading={busy} disabled={!editor || Boolean(price?.blocked) || Boolean(creditStop)} trailing={<Icon name="arrow-right" />}>
              Run {agent.name}
            </Button>
          </div>
        </div>
      </form>

      <aside className={styles.runSideCol}>
        <div className={[styles.panel, styles.panelTight, styles.panelAlt, styles.stack].join(" ")}>
          {brains.length > 0 ? (
            <Select label="Brand Brain" value={brainId} onChange={(e) => pickBrain(e.target.value)} hint="The voice, rules and references this run reads first." options={brains.map((b) => ({ value: b.id, label: `${b.name}${b.isDefault ? " (default)" : ""}` }))} />
          ) : (
            <div className={styles.stackTight}>
              <span className={styles.fieldLabel}>Brand Brain</span>
              <span className={styles.fieldHelp}>No Brand Brain in this workspace yet, so this runs in a plain, warm voice.</span>
              <ButtonLink href="/app/welcome" size="sm" variant="secondary">
                Build one
              </ButtonLink>
            </div>
          )}
          {readsIdea && <Textarea label="The idea behind it (optional)" rows={2} value={idea} onChange={(e) => setIdea(e.target.value)} maxLength={1000} hint="Only for this run. Replaces the standing idea in your Brand Brain." placeholder="What this week is really about" />}
        </div>
        <div className={[styles.panel, styles.panelTight].join(" ")}>
          <PlatformRules platforms={agent.platforms} />
        </div>
        <div className={[styles.panel, styles.panelTight, styles.gets].join(" ")}>
          <span className={styles.fieldLabel}>What you get</span>
          <ul>
            {gets.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
        <div className={[styles.panel, styles.panelTight, styles.wovi].join(" ")}>
          <Mascot pose="wait" size={110} label="Wovi, waiting for a job" />
          <b>Waiting for a job</b>
          <span>Fill in the form and press run.</span>
        </div>
      </aside>
    </div>
  );
}

/** One field of the agent's form. Pipelines use it for their own form too. */
export function Field({ field, value, error, uploading, onChange, onFiles }: { field: FormField; value: FormValues[string] | undefined; error?: string; uploading: boolean; onChange: (v: FormValues[string]) => void; onFiles: (list: FileList | null, rightsConfirmed: boolean) => void }) {
  const label = `${field.label}${field.required ? "" : " (optional)"}`;
  // Phase 18: a file is only picked once its rights are confirmed.
  const [rights, setRights] = useState(false);
  switch (field.kind) {
    case "long_text":
      return <Textarea label={label} rows={field.key === "post" || field.key === "caption" ? 6 : 4} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} hint={field.help} error={error} maxLength={field.maxLength} />;
    case "text":
      return <Input label={label} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} hint={field.help} error={error} maxLength={field.maxLength} />;
    case "url":
      return <Input label={label} type="url" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} hint={field.help} error={error} placeholder={field.placeholder} />;
    case "number":
      return <Input label={label} type="number" min={field.min} max={field.max} step={field.step} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} hint={field.help} error={error} />;
    case "choice":
      return <Select label={label} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} hint={field.help} error={error} options={[...((value as string) ? [] : [{ value: "", label: "Pick one" }]), ...(field.options ?? [])]} />;
    case "choices": {
      const list = (value as string[] | undefined) ?? [];
      return (
        <div className={styles.stackTight}>
          <span className={styles.fieldLabel}>{label}</span>
          <div className={styles.chips}>
            {(field.options ?? []).map((o) => (
              <Chip key={o.value} selected={list.includes(o.value)} onClick={() => onChange(list.includes(o.value) ? list.filter((x) => x !== o.value) : [...list, o.value])}>
                {o.label}
              </Chip>
            ))}
          </div>
          {error ? (
            <span className={styles.fieldError}>
              <Icon name="warning" size={16} /> {error}
            </span>
          ) : (
            <span className={styles.fieldHelp}>{field.help}</span>
          )}
        </div>
      );
    }
    case "image":
    case "file":
    case "video": {
      const list = (value as FileRef[] | undefined) ?? [];
      const full = list.length >= (field.maxFiles ?? 1);
      return (
        <div className={styles.stackTight}>
          <span className={styles.fieldLabel}>{label}</span>
          {field.kind !== "video" && <RightsCheck checked={rights} onChange={setRights} />}
          <div className={styles.fileRow}>
            {field.kind === "video" ? (
              <span className={styles.fieldHelp}>Video uploads arrive with the media tools. Leave this empty for now.</span>
            ) : (
              <label className={styles.filePick} aria-disabled={uploading || full || !rights}>
                <Icon name="upload" size={18} />
                {uploading ? "Uploading" : `Add ${field.kind === "image" ? "an image" : "a file"}`}
                <input type="file" accept={field.accept} disabled={uploading || full || !rights} className="visually-hidden" onChange={(e) => onFiles(e.target.files, rights)} />
              </label>
            )}
            {list.map((f) => (
              <Chip key={f.assetId} onRemove={() => onChange(list.filter((x) => x.assetId !== f.assetId))}>
                {f.name}
              </Chip>
            ))}
          </div>
          {error ? (
            <span className={styles.fieldError}>
              <Icon name="warning" size={16} /> {error}
            </span>
          ) : (
            <span className={styles.fieldHelp}>{field.help}</span>
          )}
        </div>
      );
    }
  }
}
