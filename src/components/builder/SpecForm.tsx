"use client";

import { useId, useState } from "react";
import { Mascot } from "@/components/brand/Mascot";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Toggle } from "@/components/ui/Toggle";
import { BRAND_BRAIN_PARTS, CATEGORIES, GUARDRAILS, MODEL_ROUTES, PLATFORMS, TOOLS } from "@/lib/agents/catalog";
import type { Bump } from "@/lib/agents/semver";
import styles from "./Builder.module.css";
import { num, str, type Body } from "./editor-types";
import { InputsEditor } from "./InputsEditor";
import { BRAND_PART_LABELS, CATEGORY_LABELS, PLATFORM_LABELS, ROUTE_LABELS } from "./labels";
import { OutputEditor } from "./OutputEditor";
import { errorAt, errorsUnder, looseErrors, type SpecIssue } from "./spec-errors";

const SECTIONS = [
  ["basics", "Basics"],
  ["inputs", "Inputs"],
  ["output", "Output"],
  ["brand", "Brand Brain"],
  ["tools", "Tools"],
  ["guardrails", "Guardrails"],
  ["model", "Model slot"],
  ["instructions", "Instructions"],
] as const;

const PREFIX: Record<(typeof SECTIONS)[number][0], string[]> = {
  basics: ["name", "job", "category", "platforms"],
  inputs: ["inputs"],
  output: ["output"],
  brand: ["brandBrain"],
  tools: ["tools"],
  guardrails: ["guardrails"],
  model: ["routing"],
  instructions: ["instructions"],
};

export type SaveOptions = { bump: Bump; note: string };

export function SpecForm({
  body,
  issues,
  changed,
  saving,
  onChange,
  onSave,
}: {
  body: Body;
  issues: SpecIssue[];
  changed: boolean;
  saving: boolean;
  onChange: (b: Body) => void;
  onSave: (opts: SaveOptions) => void;
}) {
  const set = (patch: Partial<Body>) => onChange({ ...body, ...patch });
  const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const count = (keys: string[]) => keys.reduce((n, k) => n + errorsUnder(issues, k), 0);
  const textId = useId();
  const [bump, setBump] = useState<Bump>("patch");
  const [note, setNote] = useState("");
  const textRoutes = MODEL_ROUTES.filter((r) => r.modality === "text");
  const topLevel = issues.filter((i) => i.path === "");

  function insert(token: string) {
    const el = document.getElementById(textId) as HTMLTextAreaElement | null;
    const text = body.instructions;
    if (!el) return set({ instructions: `${text}${text.endsWith("\n") || !text ? "" : "\n"}${token}` });
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? start;
    const next = text.slice(0, start) + token + text.slice(end);
    set({ instructions: next });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <div className={styles.editorGrid}>
      <nav className={styles.sideNav} aria-label="Spec sections">
        {SECTIONS.map(([id, label]) => {
          const n = count(PREFIX[id]);
          return (
            <a key={id} href={`#${id}`} className={styles.sideLink}>
              {label}
              {n > 0 && <span className={styles.sideCount}>{n}</span>}
            </a>
          );
        })}
      </nav>

      <div className={styles.sections}>
        <Card className={styles.check} variant={issues.length ? "outlined" : "tint"}>
          {issues.length === 0 && <Mascot pose={changed ? "done" : "wait"} size={64} />}
          <div className={styles.checkText}>
            <span className={styles.checkTitle}>{issues.length === 0 ? (changed ? "The spec is valid. Save it as a new version." : "The spec is valid. Nothing changed yet.") : `${issues.length} thing${issues.length === 1 ? "" : "s"} to fix before saving`}</span>
            {issues.length > 0 && (
              <ul className={styles.checkList}>
                {issues.slice(0, 8).map((i, k) => (
                  <li key={k}>
                    {i.path && <code>{i.path}</code>} {i.message}
                  </li>
                ))}
                {issues.length > 8 && <li>and {issues.length - 8} more below</li>}
              </ul>
            )}
          </div>
        </Card>

        <Card id="basics" title="Basics" className={styles.section}>
          <div className={styles.fieldGrid}>
            <Input label="Name" value={body.name} onChange={(e) => set({ name: e.target.value })} error={errorAt(issues, "name")} maxLength={40} />
            <Select label="Category" value={body.category} onChange={(e) => set({ category: e.target.value as Body["category"] })} options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))} error={errorAt(issues, "category")} />
            <div className={styles.span2}>
              <Input label="The job, in one line" value={body.job} onChange={(e) => set({ job: e.target.value })} error={errorAt(issues, "job")} maxLength={120} />
            </div>
          </div>
          <div className={styles.stackTight}>
            <span className={styles.uploadLabel}>Platforms</span>
            <div className={styles.chips}>
              {PLATFORMS.map((p) => (
                <Chip key={p} selected={body.platforms.includes(p)} onClick={() => set({ platforms: toggleIn(body.platforms, p) })}>
                  {PLATFORM_LABELS[p]}
                </Chip>
              ))}
            </div>
            {errorAt(issues, "platforms") && (
              <p className={styles.fieldError}>
                <Icon name="warning" size={16} /> {errorAt(issues, "platforms")}
              </p>
            )}
          </div>
        </Card>

        <Card id="inputs" title="Inputs" className={styles.section}>
          <p className={styles.sectionNote}>The form a user fills in. Nobody writes a prompt: every input becomes a {"{{key}}"} in the instructions.</p>
          {looseErrors(issues, "inputs", []).length > 0 && errorAt(issues, "inputs") && (
            <p className={styles.fieldError}>
              <Icon name="warning" size={16} /> {errorAt(issues, "inputs")}
            </p>
          )}
          <InputsEditor inputs={body.inputs} issues={issues} onChange={(inputs) => set({ inputs })} />
        </Card>

        <Card id="output" title="Output" className={styles.section}>
          <p className={styles.sectionNote}>What one run returns. The engine checks every answer against this shape.</p>
          <OutputEditor output={body.output} issues={issues} onChange={(output) => set({ output })} />
        </Card>

        <Card id="brand" title="Brand Brain" className={styles.section}>
          <p className={styles.sectionNote}>Which parts of the user&apos;s Brand Brain the agent reads. Each one is a {"{{brand.part}}"} the instructions can use.</p>
          <div className={styles.toggles}>
            {BRAND_BRAIN_PARTS.map((p) => (
              <Toggle key={p} checked={body.brandBrain.includes(p)} onChange={() => set({ brandBrain: toggleIn(body.brandBrain, p) })} label={BRAND_PART_LABELS[p].label} description={BRAND_PART_LABELS[p].description} />
            ))}
          </div>
          {errorAt(issues, "brandBrain") && (
            <p className={styles.fieldError}>
              <Icon name="warning" size={16} /> {errorAt(issues, "brandBrain")}
            </p>
          )}
        </Card>

        <Card id="tools" title="Tools" className={styles.section}>
          <p className={styles.sectionNote}>Only declared tools can ever be called. The engine does not run tools yet; declaring them is the contract.</p>
          <div className={styles.catalog}>
            {TOOLS.map((t) => (
              <div key={t.id} className={styles.catalogRow}>
                <Chip selected={body.tools.includes(t.id)} onClick={() => set({ tools: toggleIn(body.tools, t.id) })}>
                  {t.label}
                </Chip>
                <span className={styles.catalogDesc}>{t.description}</span>
              </div>
            ))}
          </div>
          {looseErrors(issues, "tools", []).map((m, k) => (
            <p key={k} className={styles.fieldError}>
              <Icon name="warning" size={16} /> {m}
            </p>
          ))}
        </Card>

        <Card id="guardrails" title="Guardrails" className={styles.section}>
          <p className={styles.sectionNote}>Checks that run on every answer. A failed check flags the run for review; it never silently passes.</p>
          <div className={styles.catalog}>
            {GUARDRAILS.map((g) => (
              <div key={g.id} className={styles.catalogRow}>
                <Chip selected={body.guardrails.includes(g.id)} onClick={() => set({ guardrails: toggleIn(body.guardrails, g.id) })}>
                  {g.label}
                </Chip>
                <span className={styles.catalogDesc}>{g.description}</span>
              </div>
            ))}
          </div>
          {looseErrors(issues, "guardrails", []).map((m, k) => (
            <p key={k} className={styles.fieldError}>
              <Icon name="warning" size={16} /> {m}
            </p>
          ))}
          <p className={styles.sectionNote}>WOVI&apos;s own content rules (fake reviews, impersonation, deepfakes, false claims, hate, harassment, sexual content, unsafe advice, copyrighted music) run on every agent. Add words this agent should also refuse, one per line.</p>
          <BlockedPhrases value={body.safety?.block ?? []} onChange={(block) => set({ safety: block.length ? { block } : undefined })} error={looseErrors(issues, "safety", []).join(" ") || undefined} />
        </Card>

        <Card id="model" title="Model slot" className={styles.section} actions={<span className="eyebrow">Builders only</span>}>
          <p className={styles.sectionNote}>Hidden from users. The route names a tier; the catalog maps it to a model, so a swap never touches the agent.</p>
          <div className={styles.fieldGrid}>
            <Select label="Model route" value={body.routing.model} onChange={(e) => set({ routing: { ...body.routing, model: e.target.value } })} options={textRoutes.map((r) => ({ value: r.id, label: `${ROUTE_LABELS[r.id] ?? r.id} (${r.model})` }))} error={errorAt(issues, "routing.model")} />
            <Select label="Fallback route" value={body.routing.fallback} onChange={(e) => set({ routing: { ...body.routing, fallback: e.target.value } })} options={textRoutes.map((r) => ({ value: r.id, label: `${ROUTE_LABELS[r.id] ?? r.id} (${r.model})` }))} error={errorAt(issues, "routing.fallback")} />
          </div>
          <div className={styles.fieldGrid3}>
            <Input label="Temperature" type="number" min={0} max={2} step={0.1} value={str(body.routing.temperature)} onChange={(e) => set({ routing: { ...body.routing, temperature: num(e.target.value) } })} error={errorAt(issues, "routing.temperature")} />
            <Input label="Spend cap per run (USD)" type="number" min={0.01} max={10} step={0.01} value={str(body.routing.maxCostUsd)} onChange={(e) => set({ routing: { ...body.routing, maxCostUsd: num(e.target.value) } })} error={errorAt(issues, "routing.maxCostUsd")} />
            <Input label="Max output tokens" type="number" min={1} max={32000} value={str(body.routing.maxOutputTokens)} onChange={(e) => set({ routing: { ...body.routing, maxOutputTokens: num(e.target.value) } })} error={errorAt(issues, "routing.maxOutputTokens")} />
          </div>
        </Card>

        <Card id="instructions" title="Instructions" className={styles.section}>
          <p className={styles.sectionNote}>The template the engine fills in. Every required input must appear. Click a placeholder to insert it.</p>
          <div className={styles.placeholders}>
            <span>Insert:</span>
            {body.inputs.filter((i) => i.key).map((i) => (
              <button key={i.key} type="button" className={styles.placeholderChip} onClick={() => insert(`{{${i.key}}}`)}>
                {`{{${i.key}}}`}
              </button>
            ))}
            {body.brandBrain.map((p) => (
              <button key={p} type="button" className={styles.placeholderChip} onClick={() => insert(`{{brand.${p}}}`)}>
                {`{{brand.${p}}}`}
              </button>
            ))}
          </div>
          <Textarea id={textId} aria-label="Instructions" rows={12} value={body.instructions} onChange={(e) => set({ instructions: e.target.value })} error={errorAt(issues, "instructions")} className={styles.instructions} />
        </Card>

        {topLevel.length > 0 && (
          <Card variant="outlined">
            {topLevel.map((i, k) => (
              <p key={k} className={styles.fieldError}>
                <Icon name="warning" size={16} /> {i.message}
              </p>
            ))}
          </Card>
        )}

        <Card title="Save as a new version" className={styles.section}>
          <p className={styles.sectionNote}>Every save is a new immutable version. Patch for tweaks, minor for new optional fields, major for output changes that could break a pipeline.</p>
          <div className={styles.saveBar}>
            <Select label="Bump" value={bump} onChange={(e) => setBump(e.target.value as Bump)} options={[{ value: "patch", label: "Patch" }, { value: "minor", label: "Minor" }, { value: "major", label: "Major" }]} />
            <Input label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed, in a few words" maxLength={200} />
            <Button onClick={() => onSave({ bump, note })} loading={saving} disabled={!changed || issues.length > 0}>
              Save version
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

/** Phase 18: the agent's own blocked phrases, one per line. Empty lines are dropped when saved, not while typing. */
function BlockedPhrases({ value, onChange, error }: { value: string[]; onChange: (block: string[]) => void; error?: string }) {
  const [text, setText] = useState(() => value.join("\n"));
  return (
    <Textarea
      label="Blocked for this agent (optional)"
      rows={3}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(e.target.value.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 30));
      }}
      error={error}
      hint="A competitor's name, a topic this agent never touches. Matched as whole words."
    />
  );
}
