"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createVideo, planVideo, proposeVideo, readReferenceVideo, sendOwnMedia, videoFromRun } from "@/app/app/video/actions";
import styles from "@/components/app/App.module.css";
import { Mascot } from "@/components/brand/Mascot";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { VIBES, type Answer, type Brief, type Reference } from "@/lib/video/planner";
import { describe, type Proposal, type Question, type Settings } from "@/lib/video/proposal";
import { styleOf } from "@/lib/video/styles";
import { SettingChips, SettingEditor, type SettingKey } from "./Settings";
import v from "./Video.module.css";

const IDEAS = ["Why our croissants take three days", "Three ways to use our new chilli oil", "Launching our autumn menu this Friday", "How to pick the right running shoe"];
const OWN_MAX = 8;

type Step = "idea" | "questions" | "proposal" | "paste";

/**
 * The start of Make a video, as Funkai pictured it: the idea first (with a
 * reference video or your own photos and clips, both optional), then the AI
 * reads it and suggests the settings as one sentence and tap-to-change chips
 * (asking at most two short questions first when the idea is unclear), then
 * "Looks good, plan it". Nothing is charged before the plan.
 */
export function NewVideo({ csrf, editor, planPrice }: { csrf: string; editor: boolean; planPrice: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("idea");
  const [idea, setIdea] = useState("");
  const [script, setScript] = useState("");
  const [reference, setReference] = useState<Reference | null>(null);
  const [refOpen, setRefOpen] = useState(false);
  const [refFile, setRefFile] = useState<File | null>(null);
  const [refRights, setRefRights] = useState(false);
  const [reading, setReading] = useState(false);
  const [own, setOwn] = useState<File[]>([]);
  const [ownRights, setOwnRights] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [brand, setBrand] = useState(true);
  const [hasBrand, setHasBrand] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<SettingKey | null>(null);
  const [busy, setBusy] = useState<null | "reading" | "planning" | "placing" | "paste">(null);
  const [error, setError] = useState<string | null>(null);

  async function readRef() {
    if (!refFile) return;
    setReading(true);
    setError(null);
    const form = new FormData();
    form.set("file", refFile);
    if (refRights) form.set("rights", "yes");
    const r = await readReferenceVideo(csrf, form);
    setReading(false);
    if (!r.ok) return setError(r.error);
    setReference(r.reference);
  }

  /** Continue: the AI reads the idea and suggests the settings. */
  async function propose() {
    if (own.length && !ownRights) return setError("Tick the box to confirm you may use your photos and clips.");
    setBusy("reading");
    setError(null);
    const r = await proposeVideo(csrf, { idea, reference });
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setProposal(r.proposal);
    setSettings(r.proposal);
    setHasBrand(r.hasBrand);
    setBrand(r.hasBrand);
    setFallback(r.fallback);
    setAnswers({});
    setOpen(null);
    setStep(r.proposal.questions.length ? "questions" : "proposal");
  }

  async function plan() {
    if (!settings || !proposal) return;
    setBusy("planning");
    setError(null);
    const picked: Answer[] = proposal.questions.filter((q) => answers[q.question]).map((q) => ({ question: q.question, answer: answers[q.question] }));
    const brief: Brief = { ...settings, idea, brand: hasBrand && brand, summary: describe(settings), answers: picked, reference };
    const r = await planVideo(csrf, brief);
    if (!r.ok) {
      setBusy(null);
      return setError(r.error);
    }
    // Your own photos and clips go on the first scenes, in the order picked.
    if (own.length && settings.style !== "motion") {
      setBusy("placing");
      for (const [i, file] of own.slice(0, r.video.scenes.length).entries()) {
        const form = new FormData();
        form.set("file", file);
        form.set("rights", "yes");
        const sent = await sendOwnMedia(csrf, r.video.id, i, form);
        if (!sent.ok) setError(sent.error);
      }
    }
    router.push(`/app/video/${r.video.id}`);
  }

  async function paste() {
    setBusy("paste");
    setError(null);
    const r = await createVideo(csrf, { title: "", script });
    setBusy(null);
    if (!r.ok) setError(r.error);
  }

  const change = (patch: Partial<Settings>) => setSettings((s) => (s ? { ...s, ...patch } : s));
  const changed = Boolean(proposal && settings && describe(settings) !== describe(proposal));

  if (busy === "reading" || busy === "planning" || busy === "placing") {
    const words = {
      reading: ["Reading your idea", "Picking the type, the style, the voice and the captions. A few seconds."],
      planning: ["Planning your video", "Writing what is said, what each scene shows and the words on screen. About 15 seconds."],
      placing: ["Placing your photos and clips", "They go on the first scenes. A moment."],
    }[busy];
    return (
      <div className={v.planning} role="status">
        <Mascot pose="move" size={120} label="Wovi, working" />
        <div>
          <h2 className={v.h2}>{words[0]}</h2>
          <p className={styles.lead}>{words[1]}</p>
        </div>
      </div>
    );
  }

  const steps = [
    { id: "idea", label: "Your idea" },
    { id: "proposal", label: "Settings" },
    { id: "plan", label: "Storyboard" },
  ] as const;
  const at = step === "idea" ? 0 : 1;

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
          <Textarea label="Your idea" rows={4} value={idea} onChange={(e) => setIdea(e.target.value)} maxLength={1000} placeholder="Why our croissants take three days" hint="One line is enough. Real details make it better." />
          <div className={v.chips} aria-label="Example ideas">
            {IDEAS.map((x) => (
              <button key={x} type="button" className={v.chip} onClick={() => setIdea(x)}>
                {x}
              </button>
            ))}
          </div>

          <div className={v.extras}>
            <div className={[v.extra, reference ? v.cardOn : ""].join(" ")}>
              <div className={v.extraHead}>
                <Icon name="film" size={20} />
                <div>
                  <b>Make it like this</b>
                  <span>Optional. Drop a video you like; WOVI follows its style. Only the style is used.</span>
                </div>
              </div>
              {reference ? (
                <div className={styles.stackTight}>
                  <div className={v.chips}>
                    <span className={styles.chip}>{styleOf(reference.look).label}</span>
                    <span className={styles.chip}>{VIBES.find((x) => x.value === reference.vibe)?.label}</span>
                    <span className={styles.chip}>about {reference.pace} s a scene</span>
                    {[reference.bg, reference.fg, reference.accent].filter(Boolean).map((c) => (
                      <span key={c} className={v.swatch} style={{ background: c }} title={c} />
                    ))}
                  </div>
                  <span className={v.fine}>{reference.style}</span>
                  <button type="button" className={v.link} onClick={() => (setReference(null), setRefFile(null))}>
                    Use another reference
                  </button>
                </div>
              ) : refOpen ? (
                <div className={styles.stackTight}>
                  <input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={(e) => setRefFile(e.target.files?.[0] ?? null)} disabled={!editor || reading} aria-label="Reference video" />
                  {refFile && (
                    <>
                      <label className={v.rights}>
                        <input type="checkbox" checked={refRights} onChange={(e) => setRefRights(e.target.checked)} /> I may use this video as a reference.
                      </label>
                      <Button size="sm" onClick={readRef} loading={reading} disabled={!editor || !refRights || reading}>
                        {reading ? "Reading its style..." : "Read its style"}
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                <button type="button" className={v.iconBtn} onClick={() => setRefOpen(true)} disabled={!editor}>
                  Add a reference video
                </button>
              )}
            </div>

            <div className={[v.extra, own.length ? v.cardOn : ""].join(" ")}>
              <div className={v.extraHead}>
                <Icon name="image" size={20} />
                <div>
                  <b>Your own photos and clips</b>
                  <span>Optional. They go on the first scenes, in this order. Change any scene later.</span>
                </div>
              </div>
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                aria-label="Your photos and clips"
                onChange={(e) => setOwn([...(e.target.files ?? [])].slice(0, OWN_MAX))}
                disabled={!editor}
              />
              {own.length > 0 && (
                <>
                  <ul className={v.ownList}>
                    {own.map((f, i) => (
                      <li key={`${f.name}-${i}`}>
                        Scene {i + 1}: {f.name}
                      </li>
                    ))}
                  </ul>
                  <label className={v.rights}>
                    <input type="checkbox" checked={ownRights} onChange={(e) => setOwnRights(e.target.checked)} /> I own these, or I have the rights to use them.
                  </label>
                </>
              )}
            </div>
          </div>

          <div className={styles.actions}>
            <Button size="lg" onClick={propose} disabled={!editor || idea.trim().length < 3} trailing={<Icon name="arrow-right" size={18} />}>
              Continue
            </Button>
            <button type="button" className={v.link} onClick={() => setStep("paste")}>
              I already have a script
            </button>
          </div>
          <p className={v.fine}>Nothing is charged yet.</p>
        </div>
      )}

      {step === "questions" && proposal && (
        <div className={styles.stack}>
          <h2 className={v.h2}>Two quick questions</h2>
          <p className={styles.lead}>So the plan fits. Tap an answer, or skip.</p>
          {proposal.questions.map((q: Question) => (
            <fieldset key={q.question} className={v.choice}>
              <legend>{q.question}</legend>
              <div className={v.chips}>
                {q.answers.map((a) => (
                  <button key={a} type="button" className={[v.chip, answers[q.question] === a ? v.chipOn : ""].join(" ")} aria-pressed={answers[q.question] === a} onClick={() => setAnswers((x) => ({ ...x, [q.question]: a }))}>
                    {a}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
          <div className={styles.actions}>
            <Button variant="ghost" onClick={() => setStep("idea")} leading={<Icon name="arrow-left" size={18} />}>
              Back
            </Button>
            <Button size="lg" onClick={() => setStep("proposal")} trailing={<Icon name="arrow-right" size={18} />}>
              {proposal.questions.every((q) => answers[q.question]) ? "Continue" : "Skip"}
            </Button>
          </div>
        </div>
      )}

      {step === "proposal" && proposal && settings && (
        <div className={styles.stack}>
          <div className={v.proposal}>
            <span className="eyebrow">{fallback ? "A safe start" : "WOVI suggests"}</span>
            <p className={v.proposalLine}>{changed ? describe(settings) : proposal.summary}</p>
            <p className={v.why}>
              <Icon name="bulb" size={16} /> {changed ? "Your changes are kept. The plan follows them." : proposal.why}
            </p>
          </div>
          <SettingChips s={settings} brand={brand} hasBrand={hasBrand} open={open} onOpen={setOpen} />
          {open && <SettingEditor which={open} s={settings} brand={brand} onChange={change} onBrand={setBrand} />}
          {own.length > 0 && settings.style === "motion" && <p className={v.fine}>Motion graphics draws no pictures, so your photos and clips are not used. Pick another style to use them.</p>}
          <div className={styles.actions}>
            <Button variant="ghost" onClick={() => setStep(proposal.questions.length ? "questions" : "idea")} leading={<Icon name="arrow-left" size={18} />}>
              Back
            </Button>
            <Button size="lg" onClick={plan} disabled={!editor} trailing={<Icon name="arrow-right" size={18} />}>
              Looks good, plan it{planPrice}
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
            <Button size="lg" loading={busy === "paste"} onClick={paste} disabled={!editor || !script.trim()} trailing={<Icon name="arrow-right" size={18} />}>
              Next: the storyboard
            </Button>
          </div>
        </div>
      )}
    </div>
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
