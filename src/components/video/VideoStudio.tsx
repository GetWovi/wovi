"use client";

import { useRef, useState } from "react";
import { addScene, drawScene, editScene, removeScene, renderVideo, type VideoResult } from "@/app/app/video/actions";
import styles from "@/components/app/App.module.css";
import { Mascot } from "@/components/brand/Mascot";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import type { Voice } from "@/lib/video/media";
import { motionLook, sceneSvg, SHAPES, type Shape } from "@/lib/video/motion";
import { ASPECTS, KINDS, VIBES } from "@/lib/video/planner";
import type { Scene, StagePrice, VideoProject } from "@/lib/video/studio";
import v from "./Video.module.css";

const STAGES = ["Plan", "Storyboard", "Approve", "Video"] as const;
const VOICES: { value: Voice; label: string }[] = [
  { value: "warm", label: "Warm" },
  { value: "calm", label: "Calm" },
  { value: "bright", label: "Bright" },
];
const SHAPE_WORDS: Record<Shape, string> = { circle: "Circle", orbit: "Dotted circle", square: "Square", triangle: "Triangle", lines: "Lines being written", wave: "Wave", flow: "Flowing lines", rays: "Rays in a circle", dots: "Line with dots", row: "Finale: all the shapes in a row" };
const ASPECT_CSS: Record<string, string> = { "9:16": "9 / 16", "1:1": "1 / 1", "16:9": "16 / 9" };

const creditWords = (n: number) => `${n} credit${n === 1 ? "" : "s"}`;

/**
 * The studio after the plan: every scene as a panel to check and change, the
 * storyboard drawn panel by panel as the pictures land, then the voice and
 * the video. One bar at the bottom always shows the next step and its price.
 */
export function VideoStudio({ csrf, initial, prices, editor }: { csrf: string; initial: VideoProject; prices: { redraw: StagePrice; video: StagePrice }; editor: boolean }) {
  const [video, setVideo] = useState(initial);
  const [drawing, setDrawing] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voice, setVoice] = useState<Voice>(initial.voice ?? "warm");
  const [stamp, setStamp] = useState(0);
  const resultRef = useRef<HTMLElement>(null);

  const aspect = video.brief?.aspect ?? "9:16";
  const motion = video.brief?.kind === "minimal";
  const look = motion ? motionLook(video.brief!.vibe, aspect) : null;
  const voices = motion ? [...VOICES, { value: "none" as Voice, label: "No" }] : VOICES;
  const missing = motion ? [] : video.scenes.map((s, i) => (s.imageFileId ? -1 : i)).filter((i) => i >= 0);
  const drawn = missing.length === 0;
  const working = busy !== null || drawing.size > 0;
  const stage = video.stage === "done" ? 3 : drawn ? 2 : video.scenes.some((s) => s.imageFileId) || drawing.size ? 1 : 0;
  const file = (id: string) => `/app/video/${video.id}/file/${id}`;
  const kindLabel = video.brief ? (video.brief.kind === "custom" ? video.brief.customKind : KINDS.find((k) => k.value === video.brief!.kind)?.label) : null;

  /** Keeps the newest scene list but never loses a picture that landed in between. */
  function merge(next: VideoProject) {
    setVideo((prev) => ({ ...next, scenes: next.scenes.map((s, i) => ({ ...s, imageFileId: s.imageFileId ?? (prev.scenes.length === next.scenes.length ? prev.scenes[i]?.imageFileId : null) ?? null })) }));
    setStamp(Date.now());
  }

  async function run(key: string, fn: () => Promise<VideoResult>) {
    setBusy(key);
    setError(null);
    const r = await fn();
    setBusy(null);
    if (r.ok) merge(r.video);
    else setError(r.error);
    return r;
  }

  /** The storyboard, three pictures at a time, each shown the moment it lands. */
  async function drawAll(indexes: number[]) {
    setError(null);
    const queue = [...indexes];
    setDrawing(new Set(indexes));
    const fails: string[] = [];
    const worker = async () => {
      for (let i = queue.shift(); i !== undefined; i = queue.shift()) {
        const r = await drawScene(csrf, video.id, i);
        if (r.ok) merge(r.video);
        else fails.push(r.error);
        setDrawing((d) => {
          const n = new Set(d);
          n.delete(i!);
          return n;
        });
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (fails.length) setError(fails.join(" "));
  }

  async function make() {
    const r = await run("render", () => renderVideo(csrf, video.id, voice));
    if (r.ok) setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  return (
    <div className={styles.stack}>
      <ol className={v.stages} aria-label="Stages">
        {STAGES.map((s, i) => (
          <li key={s} className={[v.stageItem, i === stage ? v.stageNow : "", i < stage ? v.stageDone : ""].join(" ")} aria-current={i === stage ? "step" : undefined}>
            <span className={v.stageNo}>{i < stage ? <Icon name="check" size={14} /> : i + 1}</span> {s}
          </li>
        ))}
      </ol>

      {video.brief && (
        <div className={v.chips}>
          <span className={styles.chip}>{kindLabel}</span>
          <span className={styles.chip}>{VIBES.find((x) => x.value === video.brief!.vibe)?.label}</span>
          <span className={styles.chip}>{video.brief.seconds} seconds</span>
          <span className={styles.chip}>{ASPECTS.find((x) => x.value === aspect)?.label}</span>
        </div>
      )}

      {error && (
        <p className={styles.fieldError} role="alert">
          <Icon name="warning" size={16} /> {error}
        </p>
      )}

      {video.video && (
        <section ref={resultRef} className={[styles.panel, v.result].join(" ")} aria-label="Your video">
          <video key={video.video.fileId} className={v.player} style={{ aspectRatio: ASPECT_CSS[aspect] }} src={file(video.video.fileId)} controls playsInline preload="metadata" poster={video.scenes[0]?.imageFileId ? file(video.scenes[0].imageFileId) : undefined} />
          <div className={styles.stackTight}>
            <span className="eyebrow">Your video</span>
            <h2 className={v.h2}>{video.video.seconds} seconds, ready to post</h2>
            <p className={styles.lead}>Change any panel below and make it again any time.</p>
            <div className={styles.actions}>
              <a className={v.download} href={`${file(video.video.fileId)}?download=1`} download>
                <Icon name="film" size={18} /> Download MP4
              </a>
            </div>
            <p className={v.fine}>AI-made pictures and voice. Add the AI label where the platform asks for it.</p>
          </div>
        </section>
      )}

      <section className={styles.panel} aria-label="Storyboard">
        <div className={v.sceneHead}>
          <div>
            <span className="eyebrow">{motion ? "Approve the storyboard" : drawn ? "Approve the storyboard" : "Check the plan"}</span>
            <p className={styles.lead}>{motion ? "Every scene: the line on top, the shape that draws itself and the answer below. Change anything, then pick a voice and make the video." : drawn ? "Change any panel, draw a picture again, then pick a voice and make the video." : "Every scene: what is said, what it shows and the words on screen. Change anything, then draw the storyboard."}</p>
          </div>
        </div>
        <ol className={v.scenes}>
          {video.scenes.map((s, i) => (
            <SceneCard
              key={`${i}-${video.scenes.length}`}
              index={i}
              scene={s}
              aspect={ASPECT_CSS[aspect]}
              preview={look ? sceneSvg({ top: s.text ?? "", bottom: s.bottom ?? "", shape: s.shape ?? "circle", seconds: s.seconds }, 0.8, look, { fadeOut: false, row: [...new Set(video.scenes.slice(0, i).map((x) => x.shape ?? "circle").filter((x) => x !== "row"))].slice(-3) }) : null}
              src={s.imageFileId ? `${file(s.imageFileId)}?v=${stamp}` : null}
              editor={editor && !working}
              drawing={drawing.has(i)}
              redrawLabel={`${s.imageFileId ? "Draw again" : "Draw"}${prices.redraw.free ? "" : ` · ${creditWords(prices.redraw.credits)}`}`}
              canRemove={video.scenes.length > 1}
              onSave={(edit) => run(`edit-${i}`, () => editScene(csrf, video.id, i, edit))}
              onDraw={() => drawAll([i])}
              onRemove={() => run(`remove-${i}`, () => removeScene(csrf, video.id, i))}
              onAdd={() => run(`add-${i}`, () => addScene(csrf, video.id, i))}
            />
          ))}
        </ol>
      </section>

      <div className={v.actionBar}>
        {drawing.size > 0 ? (
          <>
            <Mascot pose="move" size={56} label="Wovi, drawing" />
            <p>
              Drawing {drawing.size} picture{drawing.size === 1 ? "" : "s"}. They appear above as they land.
            </p>
          </>
        ) : busy === "render" ? (
          <>
            <Mascot pose="move" size={56} label="Wovi, cutting" />
            <p>{motion ? "Animating every frame and recording the voice. About a minute." : "Recording the voice and cutting the video. About 20 seconds."}</p>
          </>
        ) : !drawn ? (
          <>
            <p>
              Next: the storyboard, {missing.length} picture{missing.length === 1 ? "" : "s"}.
            </p>
            <Button size="lg" onClick={() => drawAll(missing)} disabled={!editor || working} leading={<Icon name="image" size={18} />}>
              Draw the storyboard{prices.redraw.free ? "" : ` · up to ${creditWords(prices.redraw.credits * missing.length)}`}
            </Button>
          </>
        ) : (
          <>
            <div className={v.chips} role="radiogroup" aria-label="Voice">
              {voices.map((x) => (
                <button key={x.value} type="button" role="radio" aria-checked={voice === x.value} className={[v.chip, voice === x.value ? v.chipOn : ""].join(" ")} onClick={() => setVoice(x.value)}>
                  {x.label} voice
                </button>
              ))}
            </div>
            <Button size="lg" onClick={make} disabled={!editor || working} leading={<Icon name="play" size={18} />}>
              {video.video ? "Make the video again" : "Make the video"}
              {prices.video.free ? "" : ` · up to ${creditWords(prices.video.credits)}`}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function SceneCard({
  index,
  scene,
  aspect,
  preview,
  src,
  editor,
  drawing,
  redrawLabel,
  canRemove,
  onSave,
  onDraw,
  onRemove,
  onAdd,
}: {
  index: number;
  scene: Scene;
  aspect: string;
  /** Minimal motion: the scene's look as SVG, made here from its own fields (text escaped), instead of a picture. */
  preview: string | null;
  src: string | null;
  editor: boolean;
  drawing: boolean;
  redrawLabel: string;
  canRemove: boolean;
  onSave: (edit: Partial<Pick<Scene, "spoken" | "onScreen" | "text" | "bottom" | "shape" | "seconds">>) => Promise<VideoResult>;
  onDraw: () => void;
  onRemove: () => void;
  onAdd: () => void;
}) {
  const [spoken, setSpoken] = useState(scene.spoken);
  const [onScreen, setOnScreen] = useState(scene.onScreen);
  const [text, setText] = useState(scene.text ?? "");
  const [bottom, setBottom] = useState(scene.bottom ?? "");
  const [seconds, setSeconds] = useState(String(scene.seconds));
  const [saved, setSaved] = useState<"" | "saving" | "saved">("");
  /** Saves the moment a field is left, only what changed. */
  async function save() {
    const edit: Partial<Pick<Scene, "spoken" | "onScreen" | "text" | "bottom" | "shape" | "seconds">> = {};
    if (bottom !== (scene.bottom ?? "")) edit.bottom = bottom;
    if (spoken !== scene.spoken) edit.spoken = spoken;
    if (onScreen !== scene.onScreen) edit.onScreen = onScreen;
    if (text !== (scene.text ?? "")) edit.text = text;
    if (Number(seconds) !== scene.seconds) edit.seconds = Number(seconds);
    if (!Object.keys(edit).length) return;
    setSaved("saving");
    const r = await onSave(edit);
    setSaved(r.ok ? "saved" : "");
  }
  return (
    <li className={v.scene}>
      <div className={v.frame} style={{ aspectRatio: aspect }}>
        {preview ? (
          <span className={v.svgPreview} dangerouslySetInnerHTML={{ __html: preview }} />
        ) : src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={`Scene ${index + 1}: ${scene.onScreen || scene.spoken}`} />
        ) : (
          <span className={v.empty}>
            <Icon name="image" size={28} />
            Scene {index + 1}
          </span>
        )}
        {drawing && <span className={v.overlay}>Drawing...</span>}
      </div>
      <div className={styles.stackTight}>
        <div className={v.sceneTools}>
          <span className={v.sceneNo}>Scene {index + 1}</span>
          {saved && <span className={v.saved}>{saved === "saving" ? "Saving..." : "Saved"}</span>}
        </div>
        {preview ? (
          <>
            <Input label="Line on top" value={text} onChange={(e) => setText(e.target.value)} onBlur={save} maxLength={60} disabled={!editor} />
            <Select
              label="Shape"
              value={scene.shape ?? "circle"}
              onChange={(e) => void onSave({ shape: e.target.value as Shape })}
              options={SHAPES.map((x) => ({ value: x, label: SHAPE_WORDS[x] }))}
              disabled={!editor}
            />
            <Input label="Line below" value={bottom} onChange={(e) => setBottom(e.target.value)} onBlur={save} maxLength={60} disabled={!editor} />
            <Textarea label="Voice says" rows={2} value={spoken} onChange={(e) => setSpoken(e.target.value)} onBlur={save} maxLength={400} hint="Used when a voice is picked." disabled={!editor} />
          </>
        ) : (
          <>
            <Textarea label="Said" rows={3} value={spoken} onChange={(e) => setSpoken(e.target.value)} onBlur={save} maxLength={400} disabled={!editor} />
            <Textarea label="What it shows" rows={2} value={onScreen} onChange={(e) => setOnScreen(e.target.value)} onBlur={save} maxLength={300} hint="The picture is drawn from this." disabled={!editor} />
            <Input label="Words on screen" value={text} onChange={(e) => setText(e.target.value)} onBlur={save} maxLength={40} placeholder="2 to 6 words, or empty" disabled={!editor} />
          </>
        )}
        <Input label="Seconds (at least)" type="number" min={1} max={20} value={seconds} onChange={(e) => setSeconds(e.target.value)} onBlur={save} disabled={!editor} />
        <div className={v.sceneTools}>
          {!preview && (
            <Button size="sm" variant="secondary" onClick={onDraw} disabled={!editor || drawing} leading={<Icon name="image" size={16} />}>
              {redrawLabel}
            </Button>
          )}
          <button type="button" className={v.iconBtn} onClick={onAdd} disabled={!editor}>
            + Scene after
          </button>
          {canRemove && (
            <button type="button" className={v.iconBtn} onClick={onRemove} disabled={!editor}>
              Remove
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
