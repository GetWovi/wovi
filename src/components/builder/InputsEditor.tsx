"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Toggle } from "@/components/ui/Toggle";
import type { AgentInput } from "@/lib/agents/spec";
import styles from "./Builder.module.css";
import { blankInput, num, str, type AnyInput } from "./editor-types";
import { INPUT_TYPE_LABELS } from "./labels";
import { errorAt, errorsUnder, type SpecIssue } from "./spec-errors";

const TYPES = Object.keys(INPUT_TYPE_LABELS) as AgentInput["type"][];

export function InputsEditor({ inputs, issues, onChange }: { inputs: AnyInput[]; issues: SpecIssue[]; onChange: (inputs: AnyInput[]) => void }) {
  const [newType, setNewType] = useState<AgentInput["type"]>("text");

  const update = (i: number, patch: Partial<AnyInput>) => onChange(inputs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= inputs.length) return;
    const next = [...inputs];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const remove = (i: number) => onChange(inputs.filter((_, j) => j !== i));
  const add = () => {
    const taken = inputs.map((x) => x.key);
    let key = newType === "profile" ? "brand" : newType;
    for (let n = 2; taken.includes(key); n++) key = `${newType}_${n}`;
    onChange([...inputs, blankInput(newType, key)]);
  };

  return (
    <>
      {inputs.map((input, i) => {
        const at = (p: string) => errorAt(issues, `inputs[${i}]${p ? `.${p}` : ""}`);
        const own = errorAt(issues, `inputs[${i}]`);
        const broken = errorsUnder(issues, `inputs[${i}]`) > 0;
        return (
          <div key={i} className={[styles.inputCard, broken ? styles.inputCardError : ""].filter(Boolean).join(" ")}>
            <div className={styles.inputCardHead}>
              <span className={styles.inputCardTitle}>
                <span>{input.label || "Untitled"}</span>
                <span className={styles.inputKey}>{`{{${input.key || "key"}}}`}</span>
              </span>
              <div className={styles.iconButtons}>
                <button type="button" className={styles.iconButton} onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                  <Icon name="chevron-down" size={18} style={{ rotate: "180deg" }} />
                </button>
                <button type="button" className={styles.iconButton} onClick={() => move(i, 1)} disabled={i === inputs.length - 1} aria-label="Move down">
                  <Icon name="chevron-down" size={18} />
                </button>
                <button type="button" className={[styles.iconButton, styles.iconButtonDanger].join(" ")} onClick={() => remove(i)} aria-label="Remove input">
                  <Icon name="close" size={18} />
                </button>
              </div>
            </div>
            {own && (
              <p className={styles.fieldError}>
                <Icon name="warning" size={16} /> {own}
              </p>
            )}
            <div className={styles.fieldGrid3}>
              <Input label="Label" value={input.label} onChange={(e) => update(i, { label: e.target.value })} error={at("label")} maxLength={60} />
              <Input label="Key" value={input.key} onChange={(e) => update(i, { key: e.target.value })} error={at("key")} placeholder="snake_case" className={styles.mono} maxLength={40} />
              <Select
                label="Type"
                value={input.type}
                onChange={(e) => {
                  const type = e.target.value as AgentInput["type"];
                  const fresh = blankInput(type, input.key);
                  onChange(inputs.map((x, j) => (j === i ? { ...fresh, key: input.key, label: input.label, required: input.required, help: input.help } : x)));
                }}
                options={TYPES.map((t) => ({ value: t, label: INPUT_TYPE_LABELS[t] }))}
              />
            </div>
            <div className={styles.fieldGrid}>
              <Input label="Help text" value={input.help ?? ""} onChange={(e) => update(i, { help: e.target.value || undefined })} error={at("help")} placeholder="Shown under the field" maxLength={200} />
              <div style={{ alignSelf: "end", paddingBottom: 8 }}>
                <Toggle checked={input.required} onChange={(required) => update(i, { required })} label="Required" description={input.required ? "Must be filled in and used in the instructions" : "May be left empty"} />
              </div>
            </div>
            <TypeFields input={input} at={at} onChange={(patch) => update(i, patch)} />
          </div>
        );
      })}
      <div className={styles.addRow}>
        <Select label="Add an input" value={newType} onChange={(e) => setNewType(e.target.value as AgentInput["type"])} options={TYPES.map((t) => ({ value: t, label: INPUT_TYPE_LABELS[t] }))} />
        <Button variant="secondary" onClick={add} leading={<Icon name="plus" />} disabled={inputs.length >= 20}>
          Add
        </Button>
      </div>
    </>
  );
}

function TypeFields({ input, at, onChange }: { input: AnyInput; at: (p: string) => string | undefined; onChange: (patch: Partial<AnyInput>) => void }) {
  const limits = input.limits ?? {};
  const setLimit = (k: string, v: number | string[] | undefined) => onChange({ limits: { ...limits, [k]: v } });
  const n = (k: string) => str(limits[k]);

  switch (input.type) {
    case "text":
    case "long_text":
      return (
        <div className={styles.fieldGrid}>
          <Input label="Min length" type="number" min={0} value={n("minLength")} onChange={(e) => setLimit("minLength", num(e.target.value))} error={at("limits.minLength")} />
          <Input label="Max length" type="number" min={1} max={input.type === "text" ? 2000 : 20000} value={n("maxLength")} onChange={(e) => setLimit("maxLength", num(e.target.value))} error={at("limits.maxLength") ?? at("limits")} />
        </div>
      );
    case "file":
      return (
        <div className={styles.fieldGrid3}>
          <Input label="Max size (MB)" type="number" min={1} value={n("maxSizeMb")} onChange={(e) => setLimit("maxSizeMb", num(e.target.value))} error={at("limits.maxSizeMb")} />
          <Input label="Max files" type="number" min={1} max={20} value={n("maxFiles")} onChange={(e) => setLimit("maxFiles", num(e.target.value))} error={at("limits.maxFiles")} />
          <Input
            label="Accepts"
            value={Array.isArray(limits.accept) ? limits.accept.join(", ") : ""}
            onChange={(e) => setLimit("accept", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
            error={at("limits.accept")}
            hint="Types or extensions, comma separated"
          />
        </div>
      );
    case "image":
    case "video":
      return (
        <div className={styles.fieldGrid3}>
          <Input label="Max size (MB)" type="number" min={1} value={n("maxSizeMb")} onChange={(e) => setLimit("maxSizeMb", num(e.target.value))} error={at("limits.maxSizeMb")} />
          <Input label="Max files" type="number" min={1} max={20} value={n("maxFiles")} onChange={(e) => setLimit("maxFiles", num(e.target.value))} error={at("limits.maxFiles")} />
          {input.type === "video" && <Input label="Max seconds" type="number" min={1} value={n("maxSeconds")} onChange={(e) => setLimit("maxSeconds", num(e.target.value))} error={at("limits.maxSeconds")} />}
        </div>
      );
    case "number":
      return (
        <div className={styles.fieldGrid3}>
          <Input label="Min" type="number" value={n("min")} onChange={(e) => setLimit("min", num(e.target.value))} error={at("limits.min") ?? at("limits")} />
          <Input label="Max" type="number" value={n("max")} onChange={(e) => setLimit("max", num(e.target.value))} error={at("limits.max")} />
          <Input label="Step" type="number" value={n("step")} onChange={(e) => setLimit("step", num(e.target.value))} error={at("limits.step")} />
          <Input label="Default" type="number" value={str(input.default)} onChange={(e) => onChange({ default: num(e.target.value) })} error={at("default")} />
        </div>
      );
    case "choice": {
      const options = input.options ?? [];
      const setOptions = (next: { value: string; label: string }[]) => onChange({ options: next });
      return (
        <div className={styles.stackTight}>
          <div className={styles.fieldGrid}>
            <Input
              label="Default"
              value={Array.isArray(input.default) ? input.default.join(", ") : str(input.default)}
              onChange={(e) => {
                const v = e.target.value.trim();
                onChange({ default: v === "" ? undefined : input.multiple ? v.split(",").map((s) => s.trim()).filter(Boolean) : v });
              }}
              error={at("default")}
              hint={input.multiple ? "Option values, comma separated" : "An option value"}
            />
            <div style={{ alignSelf: "end", paddingBottom: 8 }}>
              <Toggle checked={Boolean(input.multiple)} onChange={(multiple) => onChange({ multiple })} label="Several at once" />
            </div>
          </div>
          {at("options") && (
            <p className={styles.fieldError}>
              <Icon name="warning" size={16} /> {at("options")}
            </p>
          )}
          {options.map((o, k) => (
            <div key={k} className={styles.optionRow}>
              <Input label={k === 0 ? "Value" : undefined} aria-label="Option value" value={o.value} onChange={(e) => setOptions(options.map((x, j) => (j === k ? { ...x, value: e.target.value } : x)))} error={at(`options[${k}].value`)} className={styles.mono} />
              <Input label={k === 0 ? "Label" : undefined} aria-label="Option label" value={o.label} onChange={(e) => setOptions(options.map((x, j) => (j === k ? { ...x, label: e.target.value } : x)))} error={at(`options[${k}].label`)} />
              <button type="button" className={[styles.iconButton, styles.iconButtonDanger].join(" ")} onClick={() => setOptions(options.filter((_, j) => j !== k))} aria-label="Remove option" style={{ marginBottom: 6 }}>
                <Icon name="close" size={16} />
              </button>
            </div>
          ))}
          <div>
            <Button variant="ghost" size="sm" onClick={() => setOptions([...options, { value: "", label: "" }])} leading={<Icon name="plus" />}>
              Add option
            </Button>
          </div>
        </div>
      );
    }
    default:
      return null;
  }
}
