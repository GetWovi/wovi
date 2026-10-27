"use client";

import { useState } from "react";
import { createVideo, planVideo, videoFromRun } from "@/app/app/video/actions";
import styles from "@/components/app/App.module.css";
import { Mascot } from "@/components/brand/Mascot";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ASPECTS, KINDS, LENGTHS, VIBES, type Aspect, type Kind, type Vibe } from "@/lib/video/planner";
import v from "./Video.module.css";

const IDEAS = ["Why our croissants take three days", "Three ways to use our new chilli oil", "Launching our autumn menu this Friday"];

/**
 * The guided start, as Funkai pictured it: the idea first, then what kind of
 * video (or your own words), then the vibe, the length and the format. Then
 * the plan is written and the studio opens on it, scene by scene.
 */
export function NewVideo({ csrf, editor, planPrice }: { csrf: string; editor: boolean; planPrice: string }) {
  const [step, setStep] = useState<"idea" | "kind" | "details" | "paste">("idea");
  const [idea, setIdea] = useState("");
  const [kind, setKind] = useState<Kind | null>(null);
  const [customKind, setCustomKind] = useState("");
  const [vibe, setVibe] = useState<Vibe>("fun");
  const [seconds, setSeconds] = useState<(typeof LENGTHS)[number]>(30);
  const [aspect, setAspect] = useState<Aspect>("9:16");
  const [script, setScript] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function plan() {
    if (!kind) return;
    setBusy(true);
    setError(null);
    const r = await planVideo(csrf, { idea, kind, customKind, vibe, seconds, aspect });
    // On success the action opens the studio.
    setBusy(false);
    if (!r.ok) setError(r.error);
  }

  async function paste() {
    setBusy(true);
    setError(null);
    const r = await createVideo(csrf, { title: "", script });
    setBusy(false);
    if (!r.ok) setError(r.error);
  }

  const steps = [
    { id: "idea", label: "Your idea" },
    { id: "kind", label: "Kind of video" },
    { id: "details", label: "Vibe, length, format" },
  ] as const;
  const at = steps.findIndex((s) => s.id === step);

  if (busy && step !== "paste") {
    return (
      <div className={v.planning}>
        <Mascot pose="move" size={120} label="Wovi, planning" />
        <div>
          <h2 className={v.h2}>Planning your video</h2>
          <p className={styles.lead}>Writing what is said, what each scene shows and the words on screen. About 15 seconds.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.stack}>
      {step !== "paste" && (
        <ol className={v.stages} aria-label="Steps">
          {steps.map((s, i) => (
            <li key={s.id} className={[v.stageItem, i === at ? v.stageNow : "", i < at ? v.stageDone : ""].join(" ")} aria-current={i === at ? "step" : undefined}>
              <span className={v.stageNo}>{i < at ? <Icon name="check" size={14} /> : i + 1}</span> {s.label}
            </li>
          ))}
        </ol>
      )}

      {error && (
        <p className={styles.fieldError} role="alert">
          <Icon name="warning" size={16} /> {error}
        </p>
      )}

      {step === "idea" && (
        <div className={styles.stack}>
          <h2 className={v.h2}>What do you want to make a video about?</h2>
          <Textarea label="Your idea" rows={3} value={idea} onChange={(e) => setIdea(e.target.value)} maxLength={1000} placeholder="Why our croissants take three days" hint="One line is enough. Real details make it better." />
          <div className={v.chips}>
            {IDEAS.map((x) => (
              <button key={x} type="button" className={v.chip} onClick={() => setIdea(x)}>
                {x}
              </button>
            ))}
          </div>
          <div className={styles.actions}>
            <Button size="lg" onClick={() => setStep("kind")} disabled={!editor || idea.trim().length < 3} trailing={<Icon name="arrow-right" size={18} />}>
              Next
            </Button>
            <button type="button" className={v.link} onClick={() => setStep("paste")}>
              I already have a script
            </button>
          </div>
        </div>
      )}

      {step === "kind" && (
        <div className={styles.stack}>
          <h2 className={v.h2}>What kind of video?</h2>
          <div className={v.cards}>
            {KINDS.map((k) => (
              <button key={k.value} type="button" className={[v.card, kind === k.value ? v.cardOn : ""].join(" ")} aria-pressed={kind === k.value} onClick={() => setKind(k.value)}>
                <b>{k.label}</b>
                <span>{k.hint}</span>
              </button>
            ))}
            <div className={[v.card, kind === "custom" ? v.cardOn : ""].join(" ")}>
              <b>Something else</b>
              <Input label="Describe it" value={customKind} onFocus={() => setKind("custom")} onChange={(e) => (setKind("custom"), setCustomKind(e.target.value))} maxLength={200} placeholder="A cosy behind-the-scenes look" />
            </div>
          </div>
          <div className={styles.actions}>
            <Button variant="ghost" onClick={() => setStep("idea")} leading={<Icon name="arrow-left" size={18} />}>
              Back
            </Button>
            <Button size="lg" onClick={() => setStep("details")} disabled={!kind || (kind === "custom" && !customKind.trim())} trailing={<Icon name="arrow-right" size={18} />}>
              Next
            </Button>
          </div>
        </div>
      )}

      {step === "details" && (
        <div className={styles.stack}>
          <h2 className={v.h2}>A few details</h2>
          <Choice label="Vibe" options={VIBES.map((x) => ({ value: x.value, label: x.label }))} value={vibe} onPick={(x) => setVibe(x as Vibe)} />
          <Choice label="Length" options={LENGTHS.map((x) => ({ value: String(x), label: `${x} seconds` }))} value={String(seconds)} onPick={(x) => setSeconds(Number(x) as (typeof LENGTHS)[number])} />
          <Choice label="Format" options={ASPECTS.map((x) => ({ value: x.value, label: x.label, hint: x.hint }))} value={aspect} onPick={(x) => setAspect(x as Aspect)} />
          <div className={styles.actions}>
            <Button variant="ghost" onClick={() => setStep("kind")} leading={<Icon name="arrow-left" size={18} />}>
              Back
            </Button>
            <Button size="lg" onClick={plan} disabled={!editor} trailing={<Icon name="arrow-right" size={18} />}>
              Plan my video{planPrice}
            </Button>
          </div>
          <p className={v.fine}>Next you see every scene: what is said, what it shows and the words on screen. Change anything before a single picture is drawn.</p>
        </div>
      )}

      {step === "paste" && (
        <div className={styles.stack}>
          <h2 className={v.h2}>Paste your script</h2>
          <Textarea label="Script" rows={8} value={script} onChange={(e) => setScript(e.target.value)} maxLength={4000} hint="One scene per paragraph, up to 8. Each paragraph is what is said over that scene." />
          <div className={styles.actions}>
            <Button variant="ghost" onClick={() => setStep("idea")} leading={<Icon name="arrow-left" size={18} />}>
              Back
            </Button>
            <Button size="lg" loading={busy} onClick={paste} disabled={!editor || !script.trim()} trailing={<Icon name="arrow-right" size={18} />}>
              Next: the storyboard
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Choice({ label, options, value, onPick }: { label: string; options: { value: string; label: string; hint?: string }[]; value: string; onPick: (v: string) => void }) {
  return (
    <fieldset className={v.choice}>
      <legend>{label}</legend>
      <div className={v.chips}>
        {options.map((o) => (
          <button key={o.value} type="button" className={[v.chip, value === o.value ? v.chipOn : ""].join(" ")} aria-pressed={value === o.value} onClick={() => onPick(o.value)} title={o.hint}>
            {o.label}
            {o.hint && <small>{o.hint}</small>}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** "Make this into a video" on a Script Writer result: its sections become the scenes. */
export function VideoFromRun({ csrf, runId }: { csrf: string; runId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        variant="secondary"
        loading={busy}
        leading={<Icon name="film" size={18} />}
        onClick={async () => {
          setBusy(true);
          const r = await videoFromRun(csrf, runId);
          setBusy(false);
          if (!r.ok) setError(r.error);
        }}
      >
        Make this into a video
      </Button>
      {error && <span className={styles.fieldError}>{error}</span>}
    </>
  );
}
