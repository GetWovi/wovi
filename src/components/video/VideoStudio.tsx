"use client";

import { useState } from "react";
import { drawStoryboard, editScene, redrawScene, renderVideo, type VideoResult } from "@/app/app/video/actions";
import styles from "@/components/app/App.module.css";
import { Mascot } from "@/components/brand/Mascot";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import type { Voice } from "@/lib/video/media";
import type { StagePrice, VideoProject } from "@/lib/video/studio";
import v from "./Video.module.css";

const STAGES = ["Script", "Storyboard", "Approve", "Video"] as const;
const VOICE_OPTIONS = [
  { value: "warm", label: "Warm" },
  { value: "calm", label: "Calm" },
  { value: "bright", label: "Bright" },
];

const priceWords = (p: StagePrice) => (p.free ? "" : ` · up to ${p.credits} credit${p.credits === 1 ? "" : "s"}`);

/**
 * The four stages of Make a video on one screen. Each costly step says what it
 * costs before it runs, and nothing moves on until the person presses for it.
 */
export function VideoStudio({ csrf, initial, prices, editor }: { csrf: string; initial: VideoProject; prices: { storyboard: StagePrice; redraw: StagePrice; video: StagePrice }; editor: boolean }) {
  const [video, setVideo] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voice, setVoice] = useState<Voice>(initial.voice ?? "warm");
  const [stamp, setStamp] = useState(0);

  const drawn = video.scenes.every((s) => s.imageFileId);
  const stage = video.stage === "done" ? 3 : drawn ? 2 : video.scenes.some((s) => s.imageFileId) ? 1 : 0;
  const file = (id: string) => `/app/video/${video.id}/file/${id}`;

  async function run(key: string, fn: () => Promise<VideoResult>) {
    setBusy(key);
    setError(null);
    const r = await fn();
    setBusy(null);
    if (r.ok) {
      setVideo(r.video);
      setStamp(Date.now());
    } else setError(r.error);
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

      {error && (
        <p className={styles.fieldError} role="alert">
          <Icon name="warning" size={16} /> {error}
        </p>
      )}

      {video.video && (
        <section className={[styles.panel, v.result].join(" ")} aria-label="Your video">
          <video key={video.video.fileId} className={v.player} src={file(video.video.fileId)} controls playsInline preload="metadata" poster={video.scenes[0]?.imageFileId ? file(video.scenes[0].imageFileId) : undefined} />
          <div className={styles.stackTight}>
            <span className="eyebrow">Your video</span>
            <h2 className={v.h2}>{video.video.seconds} seconds, ready to post</h2>
            <p className={styles.lead}>Vertical 9:16 with the {video.video.voice} voice. Change a scene below and make it again any time.</p>
            <div className={styles.actions}>
              <a className={v.download} href={`${file(video.video.fileId)}?download=1`} download>
                <Icon name="film" size={18} /> Download MP4
              </a>
            </div>
            <p className={v.fine}>AI-made pictures and voice. Add the AI label where the platform asks for it.</p>
          </div>
        </section>
      )}

      <section className={styles.panel} aria-label="Scenes">
        <div className={v.sceneHead}>
          <div>
            <span className="eyebrow">{drawn ? "Approve the storyboard" : "Your script, scene by scene"}</span>
            <p className={styles.lead}>{drawn ? "Change any words or what a scene shows, draw a picture again, then pick a voice." : "Check the words and what each scene shows. Then draw the storyboard: one picture per scene."}</p>
          </div>
          {!drawn && (
            <Button size="lg" onClick={() => run("draw", () => drawStoryboard(csrf, video.id))} loading={busy === "draw"} disabled={!editor || busy !== null} leading={<Icon name="image" size={18} />}>
              Draw the storyboard{priceWords(prices.storyboard)}
            </Button>
          )}
        </div>
        {busy === "draw" && (
          <div className={v.waiting}>
            <Mascot pose="move" size={90} label="Wovi, drawing" />
            <span>Drawing {video.scenes.filter((s) => !s.imageFileId).length} pictures. About 20 seconds.</span>
          </div>
        )}
        <ol className={v.scenes}>
          {video.scenes.map((s, i) => (
            <SceneCard
              key={i}
              index={i}
              scene={s}
              src={s.imageFileId ? `${file(s.imageFileId)}?v=${stamp}` : null}
              editor={editor && busy === null}
              redrawing={busy === `redraw-${i}`}
              redrawLabel={`Draw again${priceWords(prices.redraw)}`}
              onSave={(edit) => run(`edit-${i}`, () => editScene(csrf, video.id, i, edit))}
              onRedraw={() => run(`redraw-${i}`, () => redrawScene(csrf, video.id, i))}
            />
          ))}
        </ol>
      </section>

      {drawn && (
        <section className={[styles.panel, v.voiceBar].join(" ")} aria-label="Voice and video">
          <Select label="Voice" value={voice} onChange={(e) => setVoice(e.target.value as Voice)} options={VOICE_OPTIONS} hint="Reads every scene's words, and each picture stays as long as its words take." />
          <Button size="lg" onClick={() => run("render", () => renderVideo(csrf, video.id, voice))} loading={busy === "render"} disabled={!editor || busy !== null} leading={<Icon name="play" size={18} />}>
            {video.video ? "Make the video again" : "Make the video"}
            {priceWords(prices.video)}
          </Button>
          {busy === "render" && <span className={v.fine}>Recording the voice and cutting the video. About 10 seconds.</span>}
        </section>
      )}
    </div>
  );
}

function SceneCard({
  index,
  scene,
  src,
  editor,
  redrawing,
  redrawLabel,
  onSave,
  onRedraw,
}: {
  index: number;
  scene: VideoProject["scenes"][number];
  src: string | null;
  editor: boolean;
  redrawing: boolean;
  redrawLabel: string;
  onSave: (edit: { spoken: string; onScreen: string; seconds: number }) => void;
  onRedraw: () => void;
}) {
  const [spoken, setSpoken] = useState(scene.spoken);
  const [onScreen, setOnScreen] = useState(scene.onScreen);
  const [seconds, setSeconds] = useState(String(scene.seconds));
  const changed = spoken !== scene.spoken || onScreen !== scene.onScreen || Number(seconds) !== scene.seconds;
  return (
    <li className={v.scene}>
      <div className={v.frame}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={`Scene ${index + 1}: ${scene.onScreen || scene.spoken}`} />
        ) : (
          <span className={v.empty}>
            <Icon name="image" size={28} />
            Scene {index + 1}
          </span>
        )}
        {redrawing && <span className={v.overlay}>Drawing...</span>}
      </div>
      <div className={styles.stackTight}>
        <span className={v.sceneNo}>Scene {index + 1}</span>
        <Textarea label="Said" rows={3} value={spoken} onChange={(e) => setSpoken(e.target.value)} maxLength={400} />
        <Textarea label="What it shows" rows={2} value={onScreen} onChange={(e) => setOnScreen(e.target.value)} maxLength={300} hint="The picture is drawn from this." />
        <Input label="Seconds (at least)" type="number" min={1} max={20} value={seconds} onChange={(e) => setSeconds(e.target.value)} />
        <div className={styles.actions}>
          {changed && (
            <Button size="sm" onClick={() => onSave({ spoken, onScreen, seconds: Number(seconds) })} disabled={!editor}>
              Save scene
            </Button>
          )}
          {src && (
            <Button size="sm" variant="secondary" onClick={onRedraw} disabled={!editor || changed} leading={<Icon name="image" size={16} />}>
              {redrawLabel}
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
