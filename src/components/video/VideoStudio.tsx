"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { arrangeScene, drawOptions, drawScene, editScene, pickOption, renderVideo, restyleVideo, sendOwnMedia, undoChange, updateVideoSettings, type VideoResult } from "@/app/app/video/actions";
import styles from "@/components/app/App.module.css";
import { Mascot } from "@/components/brand/Mascot";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import type { Voice } from "@/lib/video/media";
import { motionLook, sceneSvg, SHAPES, type Shape } from "@/lib/video/motion";
import { normalizeBrief } from "@/lib/video/planner";
import type { Settings } from "@/lib/video/proposal";
import type { RenderStep, Scene, StagePrice, VideoPrices, VideoProject } from "@/lib/video/studio";
import { PICTURE_STYLES, STYLES, styleOf, typeOf, type VideoStyle } from "@/lib/video/styles";
import { PostPack } from "./PostPack";
import { StoryboardPreview } from "./Preview";
import { SettingChips, SettingEditor, type SettingKey } from "./Settings";
import { SIZES_CSS } from "./sizes";
import v from "./Video.module.css";

const STAGES = ["Idea", "Plan", "Storyboard", "Video"] as const;
const SHAPE_WORDS: Record<Shape, string> = { circle: "Circle", orbit: "Dotted circle", square: "Square", triangle: "Triangle", lines: "Lines being written", wave: "Wave", flow: "Flowing lines", rays: "Rays in a circle", dots: "Line with dots", row: "Finale: all the shapes in a row" };
const STEPS: { step: RenderStep; label: string }[] = [
  { step: "voice", label: "Recording the voice" },
  { step: "scenes", label: "Cutting the scenes" },
  { step: "captions", label: "Adding the captions" },
  { step: "done", label: "Done" },
];

const creditWords = (n: number) => `${n} credit${n === 1 ? "" : "s"}`;
const priceWords = (p: StagePrice, prefix = " · ") => (p.free ? "" : `${prefix}up to ${creditWords(p.credits)}`);
const isRendering = (x: VideoProject) => Boolean(x.progress && x.progress.step !== "done" && x.progress.step !== "failed" && Date.now() - Date.parse(x.progress.at) < 15 * 60_000);

/** How long making the video takes, from measured runs: the cut about 5 seconds a scene, motion graphics about 2 seconds for each second of video. */
function timeWords(x: VideoProject, seconds: number): string {
  const s = x.brief?.style === "motion" ? 15 + seconds * 2.2 : 12 + x.scenes.length * 5 + (x.brief?.captions.on ? 6 : 0);
  return s < 50 ? `about ${Math.round(s / 10) * 10} seconds` : s < 90 ? "about a minute" : `about ${Math.round(s / 60)} minutes`;
}

/**
 * The storyboard after the plan: a running total at the top (scenes, length
 * and what the video step costs), every scene as a card to change and
 * arrange (drag on a desktop, up and down on a phone, duplicate, split,
 * merge, lock, delete, undo), the settings and the style for the whole video,
 * a free preview, then the video with its real progress, and the result with
 * its ready-to-post pack. "Change something" comes back here.
 */
export function VideoStudio({ csrf, initial, prices: firstPrices, packPrice, hasBrand, editor }: { csrf: string; initial: VideoProject; prices: VideoPrices; packPrice: { captions: number | null; hashtags: number | null }; hasBrand: boolean; editor: boolean }) {
  const [video, setVideo] = useState(initial);
  const [prices, setPrices] = useState(firstPrices);
  const [view, setView] = useState<"storyboard" | "result">(initial.video && !isRendering(initial) ? "result" : "storyboard");
  const [drawing, setDrawing] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<SettingKey | null>(null);
  const [preview, setPreview] = useState(false);
  const [stamp, setStamp] = useState(0);
  const [drag, setDrag] = useState<{ from: number; over: number | null } | null>(null);
  const resultRef = useRef<HTMLElement>(null);

  const brief = video.brief ?? null;
  const aspect = brief?.aspect ?? "9:16";
  const motion = brief?.style === "motion";
  const look = motion ? motionLook(brief!.vibe, aspect) : null;
  const missing = motion ? [] : video.scenes.map((s, i) => (s.imageFileId ? -1 : i)).filter((i) => i >= 0);
  const drawn = missing.length === 0;
  const rendering = isRendering(video);
  const working = busy !== null || drawing.size > 0 || rendering;
  // Where the person is: 2 the storyboard, 3 the video being made, 4 the video made (every step done).
  const stage = video.video && view === "result" ? 4 : rendering ? 3 : 2;
  const file = useCallback((id: string) => `/app/video/${video.id}/file/${id}`, [video.id]);
  const seconds = video.scenes.reduce((n, s) => n + s.seconds, 0);
  const voice: Voice = video.voice ?? (brief ? (brief.voiceover ? brief.voice : "none") : "warm");
  const settings: Settings | null = brief ? { type: brief.type, style: brief.style, vibe: brief.vibe, seconds: brief.seconds, aspect: brief.aspect, voiceover: voice !== "none", voice: brief.voice, captions: brief.captions } : null;
  const lastChange = video.history?.at(-1);

  /** The newest video, never losing a picture that landed in between (matched by scene, not by place). */
  function merge(next: VideoProject, nextPrices?: VideoPrices) {
    setVideo((prev) => {
      const before = new Map(prev.scenes.map((s) => [s.id, s]));
      return { ...next, scenes: next.scenes.map((s) => ({ ...s, imageFileId: s.imageFileId ?? before.get(s.id)?.imageFileId ?? null })) };
    });
    if (nextPrices) setPrices(nextPrices);
    setStamp((n) => n + 1);
  }

  async function run(key: string, fn: () => Promise<VideoResult>) {
    setBusy(key);
    setError(null);
    const r = await fn();
    setBusy(null);
    if (r.ok) merge(r.video, r.prices);
    else setError(r.error);
    return r;
  }

  /** The storyboard, three pictures at a time, each shown the moment it lands. */
  async function drawAll(indexes: number[]) {
    setError(null);
    const queue = indexes.map((i) => ({ i, id: video.scenes[i].id! }));
    setDrawing(new Set(queue.map((q) => q.id)));
    const fails: string[] = [];
    const worker = async () => {
      for (let q = queue.shift(); q !== undefined; q = queue.shift()) {
        const r = await drawScene(csrf, video.id, q.i);
        if (r.ok) merge(r.video, r.prices);
        else fails.push(r.error);
        const done = q.id;
        setDrawing((d) => {
          const n = new Set(d);
          n.delete(done);
          return n;
        });
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (fails.length) setError(fails.join(" "));
  }

  // While the video is made, follow its real steps on the status route.
  useEffect(() => {
    if (!rendering) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const res = await fetch(`/app/video/${video.id}/status`, { cache: "no-store" }).catch(() => null);
      const body = res?.ok ? ((await res.json()) as { video: VideoProject; prices: VideoPrices }) : null;
      if (stop) return;
      if (body) {
        merge(body.video, body.prices);
        if (body.video.progress?.step === "done") {
          setView("result");
          setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
          return;
        }
        if (body.video.progress?.step === "failed") {
          setError(body.video.progress.error ?? "The video could not be made. Nothing was charged.");
          return;
        }
      }
      timer = setTimeout(poll, 1200);
    };
    timer = setTimeout(poll, 800);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
    // Polls once per making; the video's own changes come in through merge.
  }, [rendering, video.id]);

  async function make() {
    await run("render", () => renderVideo(csrf, video.id, voice));
  }

  async function changeSettings(patch: Partial<Settings>) {
    if (patch.style && patch.style !== brief?.style) {
      return run("restyle", () => restyleVideo(csrf, video.id, patch.style!));
    }
    const p: Parameters<typeof updateVideoSettings>[2] = {};
    if (patch.voiceover !== undefined) p.voice = patch.voiceover ? (brief?.voice ?? "warm") : "none";
    if (patch.voice !== undefined) p.voice = patch.voice;
    if (patch.captions) p.captions = patch.captions;
    if (Object.keys(p).length) await run("settings", () => updateVideoSettings(csrf, video.id, p));
  }

  function onDrop(to: number) {
    if (!drag || drag.from === to) return setDrag(null);
    const from = drag.from;
    setDrag(null);
    void run(`move-${from}`, () => arrangeScene(csrf, video.id, "move", from, to));
  }

  const progressAt = STEPS.findIndex((s) => s.step === video.progress?.step);

  return (
    <div className={styles.stack}>
      <ol className={v.stages} aria-label="Stages">
        {STAGES.map((s, i) => (
          <li key={s} className={[v.stageItem, i === Math.min(stage, 3) ? v.stageNow : "", i < stage ? v.stageDone : ""].join(" ")} aria-current={i === Math.min(stage, 3) ? "step" : undefined}>
            <span className={v.stageNo}>{i < stage ? <Icon name="check" size={14} /> : i + 1}</span> {s}
          </li>
        ))}
      </ol>

      {error && (
        <p className={styles.fieldError} role="alert">
          <Icon name="warning" size={16} /> {error}
        </p>
      )}

      {view === "result" && video.video ? (
        <>
          <section ref={resultRef} className={[styles.panel, v.result, aspect === "16:9" ? v.resultWide : ""].join(" ")} aria-label="Your video">
            <video key={video.video.fileId} className={v.player} style={{ aspectRatio: SIZES_CSS[aspect] }} src={file(video.video.fileId)} controls playsInline preload="metadata" poster={video.scenes[0]?.imageFileId ? file(video.scenes[0].imageFileId) : undefined} />
            <div className={styles.stack}>
              <div className={styles.stackTight}>
                <span className="eyebrow">Your video</span>
                <h2 className={v.h2}>{video.video.seconds} seconds, ready to post</h2>
                <p className={v.fine}>AI-made pictures and voice. Add the AI label where the platform asks for it.</p>
              </div>
              <div className={styles.actions}>
                <a className={v.download} href={`${file(video.video.fileId)}?download=1`} download>
                  <Icon name="upload" size={18} /> Download MP4
                </a>
                <Button variant="ghost" onClick={() => (setView("storyboard"), window.scrollTo({ top: 0 }))} leading={<Icon name="pen" size={18} />}>
                  Change something
                </Button>
              </div>
              <PostPack csrf={csrf} video={video} editor={editor} price={packPrice} onVideo={(x) => merge(x)} />
            </div>
          </section>
        </>
      ) : (
        <>
          <section className={v.totals} aria-label="Running total">
            <div className={v.totalNums}>
              <span>
                <b>{video.scenes.length}</b> scene{video.scenes.length === 1 ? "" : "s"}
              </span>
              <span>
                <b>{seconds}</b> seconds
              </span>
              <span>
                Video step: <b>{prices.video.free ? "free" : `up to ${creditWords(prices.video.credits)}`}</b>
              </span>
            </div>
            <div className={v.totalTools}>
              {video.video && (
                <button type="button" className={v.iconBtn} onClick={() => setView("result")}>
                  <Icon name="film" size={14} /> See your video
                </button>
              )}
              <button type="button" className={v.iconBtn} onClick={() => run("undo", () => undoChange(csrf, video.id))} disabled={!editor || working || !lastChange} title={lastChange ? `Undo: ${lastChange.label}` : "Nothing to undo"}>
                <Icon name="refresh" size={14} /> Undo{lastChange ? `: ${lastChange.label.toLowerCase()}` : ""}
              </button>
              <button type="button" className={v.iconBtn} onClick={() => setPreview(true)} disabled={!motion && !video.scenes.some((s) => s.imageFileId)}>
                <Icon name="play" size={14} /> Preview
              </button>
            </div>
          </section>

          {settings && (
            <section className={styles.panel} aria-label="Settings">
              <div className={v.sceneHead}>
                <div>
                  <span className="eyebrow">
                    {typeOf(settings.type).label}, {styleOf(settings.style).label}
                  </span>
                  <p className={v.fine}>Tap a setting to change it. A new style redraws only the unlocked pictures{prices.restyle.free ? "" : `, ${priceWords(prices.restyle, "").trim()}`}.</p>
                </div>
              </div>
              <SettingChips s={settings} brand={brief?.brand ?? true} hasBrand={hasBrand} open={open} onOpen={setOpen} only={["style", "voice", "captions", "brand"]} />
              {open && (
                <div className={v.settingsPane}>
                  <SettingEditor
                    which={open}
                    s={settings}
                    brand={brief?.brand ?? true}
                    styles={motion ? ["motion"] : PICTURE_STYLES}
                    styleNote={motion ? "A motion graphics video has no pictures. For another style, start a new video." : `Every scene that is not locked and not your own photo is drawn again${priceWords(prices.restyle)}. Undo brings the old pictures back.`}
                    onChange={(p) => void changeSettings(p)}
                    onBrand={(on) => void run("settings", () => updateVideoSettings(csrf, video.id, { brand: on }))}
                  />
                  {busy === "restyle" && <p className={v.fine}>Drawing the pictures in the new style...</p>}
                </div>
              )}
            </section>
          )}

          <section className={styles.panel} aria-label="Storyboard">
            <div className={v.sceneHead}>
              <div>
                <span className="eyebrow">{motion || drawn ? "Arrange the storyboard" : "Check the plan"}</span>
                <p className={v.fine}>{motion ? "Every scene: the line on top, the shape that draws itself and the answer below." : drawn ? "Drag a scene to move it. Every change saves itself." : "Every scene: what is said, what it shows and the words on screen. Change anything, then draw the storyboard."}</p>
              </div>
            </div>
            <ol className={v.scenes}>
              {video.scenes.map((s, i) => (
                <SceneCard
                  key={s.id ?? i}
                  index={i}
                  count={video.scenes.length}
                  scene={s}
                  aspect={SIZES_CSS[aspect]}
                  motion={motion}
                  videoStyle={brief?.style}
                  preview={look ? sceneSvg({ top: s.text ?? "", bottom: s.bottom ?? "", shape: s.shape ?? "circle", seconds: s.seconds }, 0.8, look, { fadeOut: false, row: [...new Set(video.scenes.slice(0, i).map((x) => x.shape ?? "circle").filter((x) => x !== "row"))].slice(-3) }) : null}
                  src={s.imageFileId ? `${file(s.imageFileId)}?v=${stamp}` : null}
                  file={file}
                  editor={editor && !working}
                  drawing={drawing.has(s.id!)}
                  optionsLabel={`Draw again: 2 options${priceWords(prices.options)}`}
                  drawLabel={`Draw${priceWords(prices.redraw)}`}
                  dragOver={drag?.over === i && drag.from !== i}
                  onDragStart={() => setDrag({ from: i, over: null })}
                  onDragOver={() => setDrag((d) => (d && d.over !== i ? { ...d, over: i } : d))}
                  onDragEnd={() => setDrag(null)}
                  onDrop={() => onDrop(i)}
                  onSave={(edit) => run(`edit-${i}`, () => editScene(csrf, video.id, i, edit))}
                  onDraw={() => drawAll([i])}
                  onOptions={() => run(`options-${i}`, () => drawOptions(csrf, video.id, i))}
                  onPick={(which) => run(`pick-${i}`, () => pickOption(csrf, video.id, i, which))}
                  onLook={(style) => run(`look-${i}`, () => restyleVideo(csrf, video.id, style, i))}
                  onArrange={(action, to) => run(`${action}-${i}`, () => arrangeScene(csrf, video.id, action, i, to))}
                  onOwn={(form) => run(`own-${i}`, () => sendOwnMedia(csrf, video.id, i, form))}
                  busyKey={busy}
                />
              ))}
            </ol>
          </section>

          <div className={v.actionBar}>
            {rendering ? (
              <div className={v.progress} role="status" aria-live="polite">
                <div className={v.progressHead}>
                  <Mascot pose="move" size={48} label="Wovi, making the video" />
                  <p>
                    <b>{STEPS[Math.max(0, progressAt)]?.label ?? "Starting"}</b> · {timeWords(video, seconds)} in all
                  </p>
                </div>
                <div className={v.progressBar} aria-hidden="true">
                  <span style={{ width: `${Math.max(6, ((Math.max(0, progressAt) + 0.5) / (STEPS.length - 1)) * 100)}%` }} />
                </div>
                <ol className={v.progressSteps}>
                  {STEPS.map((x, i) => (
                    <li key={x.step} className={i < progressAt ? v.stepDone : i === progressAt ? v.stepNow : undefined}>
                      {i < progressAt ? <Icon name="check" size={12} /> : null} {x.step === "voice" ? (voice === "none" ? "Voice off" : "Voice recorded") : x.step === "scenes" ? "Scenes cut" : x.step === "captions" ? "Captions added" : "Done"}
                    </li>
                  ))}
                </ol>
              </div>
            ) : drawing.size > 0 ? (
              <>
                <Mascot pose="move" size={56} label="Wovi, drawing" />
                <p>
                  Drawing {drawing.size} picture{drawing.size === 1 ? "" : "s"}. They appear above as they land.
                </p>
              </>
            ) : !drawn ? (
              <>
                <p>
                  Next: the storyboard, {missing.length} picture{missing.length === 1 ? "" : "s"} in {styleOf(brief?.style).label}.
                </p>
                <Button size="lg" onClick={() => drawAll(missing)} disabled={!editor || working} leading={<Icon name="image" size={18} />}>
                  Draw the storyboard{prices.storyboard.free ? "" : ` · up to ${creditWords(prices.storyboard.credits)}`}
                </Button>
              </>
            ) : (
              <>
                <p>
                  {voice === "none" ? "No voiceover" : `${voice[0].toUpperCase()}${voice.slice(1)} voiceover`}, {brief?.captions.on ? `${brief.captions.look} captions` : "no captions"}. Takes {timeWords(video, seconds)}.
                </p>
                <Button size="lg" onClick={make} loading={busy === "render"} disabled={!editor || working} leading={<Icon name="play" size={18} />}>
                  {video.video ? "Make the video again" : "Make the video"}
                  {prices.video.free ? "" : ` · up to ${creditWords(prices.video.credits)}`}
                </Button>
              </>
            )}
          </div>
          {video.video && !rendering && <p className={v.fine}>Making it again only records the voice for scenes whose words changed.</p>}
        </>
      )}

      <Modal open={preview} onClose={() => setPreview(false)} title="Storyboard preview">
        {preview && <StoryboardPreview video={{ ...video, brief: normalizeBrief(video.brief) }} file={file} />}
      </Modal>
    </div>
  );
}

type Arrange = "add" | "remove" | "duplicate" | "split" | "merge" | "lock" | "unlock" | "move";

function SceneCard({
  index,
  count,
  scene,
  aspect,
  motion,
  videoStyle,
  preview,
  src,
  file,
  editor,
  drawing,
  optionsLabel,
  drawLabel,
  dragOver,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  onSave,
  onDraw,
  onOptions,
  onPick,
  onLook,
  onArrange,
  onOwn,
  busyKey,
}: {
  index: number;
  count: number;
  scene: Scene;
  aspect: string;
  motion: boolean;
  videoStyle?: VideoStyle;
  /** Motion graphics: the scene's look as SVG, made here from its own fields (text escaped), instead of a picture. */
  preview: string | null;
  src: string | null;
  file: (id: string) => string;
  editor: boolean;
  drawing: boolean;
  optionsLabel: string;
  drawLabel: string;
  dragOver: boolean;
  onDragStart: () => void;
  onDragOver: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  onSave: (edit: Partial<Pick<Scene, "spoken" | "onScreen" | "text" | "bottom" | "shape" | "seconds">>) => Promise<VideoResult>;
  onDraw: () => void;
  onOptions: () => void;
  onPick: (which: number) => void;
  onLook: (style: VideoStyle) => void;
  onArrange: (action: Arrange, to?: number) => void;
  onOwn: (form: FormData) => Promise<VideoResult>;
  busyKey: string | null;
}) {
  const [spoken, setSpoken] = useState(scene.spoken);
  const [onScreen, setOnScreen] = useState(scene.onScreen);
  const [text, setText] = useState(scene.text ?? "");
  const [bottom, setBottom] = useState(scene.bottom ?? "");
  const [seconds, setSeconds] = useState(String(scene.seconds));
  const [saved, setSaved] = useState<"" | "saving" | "saved">("");
  const [ownFile, setOwnFile] = useState<File | null>(null);
  const [rights, setRights] = useState(false);
  const [armed, setArmed] = useState(false);
  // A change to the words from elsewhere (undo, split, merge) shows in the fields; a picture landing does not touch them.
  const sig = JSON.stringify([scene.spoken, scene.onScreen, scene.text, scene.bottom, scene.seconds]);
  const [seen, setSeen] = useState(sig);
  if (seen !== sig) {
    setSeen(sig);
    setSpoken(scene.spoken);
    setOnScreen(scene.onScreen);
    setText(scene.text ?? "");
    setBottom(scene.bottom ?? "");
    setSeconds(String(scene.seconds));
  }
  const uploading = busyKey === `own-${index}`;
  const options = busyKey === `options-${index}`;

  async function sendOwn() {
    if (!ownFile) return;
    const form = new FormData();
    form.set("file", ownFile);
    if (rights) form.set("rights", "yes");
    const r = await onOwn(form);
    if (r.ok) setOwnFile(null);
  }
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
    <li
      className={[v.scene, dragOver ? v.dropHere : "", scene.locked ? v.sceneLocked : ""].join(" ")}
      draggable={editor && armed}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(index));
        onDragStart();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver();
      }}
      onDrop={(e) => {
        e.preventDefault();
        setArmed(false);
        onDrop();
      }}
      onDragEnd={() => (setArmed(false), onDragEnd())}
    >
      <div className={v.sceneTop}>
        <span className={v.handle} onMouseDown={() => setArmed(true)} onMouseUp={() => setArmed(false)} title="Drag to move" aria-hidden="true">
          <svg width="14" height="20" viewBox="0 0 14 20" fill="currentColor">
            {[3, 10, 17].flatMap((y) => [4, 10].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.8" />))}
          </svg>
        </span>
        <span className={v.sceneNo}>Scene {index + 1}</span>
        <span className={v.sceneSecs}>{scene.seconds} s</span>
        {saved && <span className={v.saved}>{saved === "saving" ? "Saving..." : "Saved"}</span>}
        <span className={v.grow} />
        <span className={v.moveBtns}>
          <button type="button" className={v.roundBtn} onClick={() => onArrange("move", index - 1)} disabled={!editor || index === 0} aria-label={`Move scene ${index + 1} up`}>
            <Icon name="arrow-left" size={14} className={v.up} />
          </button>
          <button type="button" className={v.roundBtn} onClick={() => onArrange("move", index + 1)} disabled={!editor || index === count - 1} aria-label={`Move scene ${index + 1} down`}>
            <Icon name="arrow-left" size={14} className={v.down} />
          </button>
        </span>
        <button type="button" className={[v.roundBtn, scene.locked ? v.roundOn : ""].join(" ")} onClick={() => onArrange(scene.locked ? "unlock" : "lock")} disabled={!editor} aria-pressed={Boolean(scene.locked)} aria-label={scene.locked ? `Unlock scene ${index + 1}` : `Lock scene ${index + 1}`} title={scene.locked ? "Locked: a restyle keeps this scene. Tap to unlock." : "Lock: a restyle keeps this scene"}>
          <LockIcon on={Boolean(scene.locked)} />
        </button>
      </div>

      <div className={v.frame} style={{ aspectRatio: aspect }}>
        {preview ? (
          <span className={v.svgPreview} dangerouslySetInnerHTML={{ __html: preview }} />
        ) : src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={`Scene ${index + 1}: ${scene.onScreen || scene.spoken}`} draggable={false} />
        ) : (
          <span className={v.empty}>
            <Icon name="image" size={28} />
            Scene {index + 1}
          </span>
        )}
        {(drawing || options) && <span className={v.overlay}>{options ? "Drawing two options..." : "Drawing..."}</span>}
        {uploading && <span className={v.overlay}>Uploading...</span>}
        {scene.own && !drawing && <span className={v.ownBadge}>{scene.clipFileId ? "Your clip" : "Your photo"}</span>}
        {scene.style && !scene.own && <span className={v.lookBadge}>{styleOf(scene.style).label}</span>}
      </div>

      {scene.options?.length ? (
        <div className={v.options}>
          <b>Pick one</b>
          <div className={v.optionRow}>
            {scene.options.map((id, i) => (
              <button key={id} type="button" className={v.option} onClick={() => onPick(i)} disabled={!editor} aria-label={`Use option ${i + 1}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={file(id)} alt={`Option ${i + 1}`} style={{ aspectRatio: aspect }} />
                <span>Use this</span>
              </button>
            ))}
          </div>
          <button type="button" className={v.link} onClick={() => onPick(-1)} disabled={!editor}>
            Keep the old picture
          </button>
        </div>
      ) : null}

      <div className={styles.stackTight}>
        {preview ? (
          <>
            <Input label="Line on top" value={text} onChange={(e) => setText(e.target.value)} onBlur={save} maxLength={60} disabled={!editor} />
            <Select label="Shape" value={scene.shape ?? "circle"} onChange={(e) => void onSave({ shape: e.target.value as Shape })} options={SHAPES.map((x) => ({ value: x, label: SHAPE_WORDS[x] }))} disabled={!editor} />
            <Input label="Line below" value={bottom} onChange={(e) => setBottom(e.target.value)} onBlur={save} maxLength={60} disabled={!editor} />
            <Textarea label="Voice says" rows={2} value={spoken} onChange={(e) => setSpoken(e.target.value)} onBlur={save} maxLength={400} hint="Read by the voice and shown as captions." disabled={!editor} />
          </>
        ) : (
          <>
            <Textarea label="Said" rows={3} value={spoken} onChange={(e) => setSpoken(e.target.value)} onBlur={save} maxLength={400} disabled={!editor} />
            <Textarea label="What it shows" rows={2} value={onScreen} onChange={(e) => setOnScreen(e.target.value)} onBlur={save} maxLength={300} hint="The picture is drawn from this." disabled={!editor} />
            <Input label="Words on screen" value={text} onChange={(e) => setText(e.target.value)} onBlur={save} maxLength={40} placeholder="2 to 6 words, or empty" disabled={!editor} />
          </>
        )}
        <Input label="Seconds (at least)" type="number" min={1} max={20} value={seconds} onChange={(e) => setSeconds(e.target.value)} onBlur={save} disabled={!editor} />

        {!motion && (
          <div className={v.sceneTools}>
            {src ? (
              <Button size="sm" variant="secondary" onClick={onOptions} disabled={!editor || drawing || options || scene.locked} leading={<Icon name="image" size={16} />}>
                {optionsLabel}
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={onDraw} disabled={!editor || drawing} leading={<Icon name="image" size={16} />}>
                {drawLabel}
              </Button>
            )}
            <label className={v.lookSelect}>
              <span>Look</span>
              <select value={scene.style ?? videoStyle ?? ""} onChange={(e) => onLook(e.target.value as VideoStyle)} disabled={!editor || scene.locked || !src}>
                {STYLES.filter((x) => (PICTURE_STYLES as string[]).includes(x.value)).map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className={v.sceneTools}>
          <button type="button" className={v.iconBtn} onClick={() => onArrange("duplicate")} disabled={!editor || count >= 8}>
            Duplicate
          </button>
          <button type="button" className={v.iconBtn} onClick={() => onArrange("split")} disabled={!editor || count >= 8}>
            Split
          </button>
          {index < count - 1 && (
            <button type="button" className={v.iconBtn} onClick={() => onArrange("merge")} disabled={!editor}>
              Merge with next
            </button>
          )}
          <button type="button" className={v.iconBtn} onClick={() => onArrange("add")} disabled={!editor || count >= 8}>
            + Scene after
          </button>
          {count > 1 && (
            <button type="button" className={[v.iconBtn, v.danger].join(" ")} onClick={() => onArrange("remove")} disabled={!editor}>
              Delete
            </button>
          )}
        </div>

        {!motion && (
          <details className={v.own}>
            <summary className={v.ownLabel}>Use your own photo or clip</summary>
            <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" onChange={(e) => setOwnFile(e.target.files?.[0] ?? null)} disabled={!editor} aria-label={`Your photo or clip for scene ${index + 1}`} />
            {ownFile && (
              <>
                <label className={v.rights}>
                  <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} /> I own this, or I have the rights to use it.
                </label>
                <Button size="sm" onClick={sendOwn} disabled={!editor || !rights || uploading} loading={uploading}>
                  Use it in scene {index + 1}
                </Button>
              </>
            )}
          </details>
        )}
      </div>
    </li>
  );
}

function LockIcon({ on }: { on: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d={on ? "M8 11V7a4 4 0 0 1 8 0v4" : "M8 11V7a4 4 0 0 1 7.5-2"} />
    </svg>
  );
}
