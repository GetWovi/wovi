"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { captionLayout, readingSeconds, videoCues, type CaptionCue } from "@/lib/video/captions";
import { motionLook, sceneSvg } from "@/lib/video/motion";
import type { VideoProject } from "@/lib/video/studio";
import { SIZES_CSS } from "./sizes";
import v from "./Video.module.css";

const FRAME: Record<string, [number, number]> = { "9:16": [1080, 1920], "1:1": [1080, 1080], "16:9": [1920, 1080] };

/**
 * The free storyboard preview: the pictures (or the motion graphics, drawn
 * live from the same SVG as the video) play with their timing, the words on
 * screen and the chosen captions, right in the browser. No voice, no cost.
 * The captions use the same timing as the video, at a reading pace.
 */
export function StoryboardPreview({ video, file }: { video: VideoProject; file: (id: string) => string }) {
  const aspect = video.brief?.aspect ?? "9:16";
  const [W, H] = FRAME[aspect] ?? FRAME["9:16"];
  const motion = video.brief?.style === "motion";
  const captions = video.brief?.captions ?? { on: true, look: "clean" as const, position: "bottom" as const };
  const position = motion ? "bottom" : captions.position;
  const look = motion ? motionLook(video.brief!.vibe, aspect) : null;
  const timeline = useMemo(() => timelineOf(video.scenes, motion), [video.scenes, motion]);
  const total = timeline.reduce((n, t) => n + t.seconds, 0);
  const cues = useMemo(() => (captions.on ? videoCues(timeline, captions.look, position, W, H) : []), [timeline, captions.on, captions.look, position, W, H]);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = (now: number) => {
      const dt = last.current === null ? 0 : (now - last.current) / 1000;
      last.current = now;
      setT((x) => {
        const next = x + dt;
        if (next >= total) {
          setPlaying(false);
          return total;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      last.current = null;
    };
  }, [playing, total]);

  const index = Math.max(0, timeline.findIndex((x) => t >= x.start && t < x.start + x.seconds));
  const at = timeline[index] ?? timeline[0];
  const scene = video.scenes[index];
  const p = at ? Math.min(1, (t - at.start) / at.seconds) : 0;
  const cue = cues.find((c) => t >= c.start && t < c.end) ?? null;
  const layout = captionLayout(captions.look, position, W, H);
  const svg =
    look && scene
      ? sceneSvg({ top: scene.text ?? "", bottom: scene.bottom ?? "", shape: scene.shape ?? "circle", seconds: at.seconds }, p, look, {
          prev: video.scenes[index - 1] ? { top: video.scenes[index - 1].text ?? "", bottom: video.scenes[index - 1].bottom ?? "", shape: video.scenes[index - 1].shape ?? "circle", seconds: 0 } : null,
          next: video.scenes[index + 1] ? { top: video.scenes[index + 1].text ?? "", bottom: video.scenes[index + 1].bottom ?? "", shape: video.scenes[index + 1].shape ?? "circle", seconds: 0 } : null,
          row: [...new Set(video.scenes.slice(0, index).map((x) => x.shape ?? "circle").filter((x) => x !== "row"))].slice(-3),
          captions: captions.on,
        })
      : null;

  function restart() {
    setT(0);
    setPlaying(true);
  }

  return (
    <div className={v.preview}>
      <div className={v.previewFrame} style={{ aspectRatio: SIZES_CSS[aspect], ["--ar" as string]: W / H }}>
        {svg ? (
          <span className={v.svgPreview} dangerouslySetInnerHTML={{ __html: svg }} />
        ) : scene?.imageFileId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${index}-${scene.imageFileId}`} src={file(scene.imageFileId)} alt="" className={[v.previewImg, v[`move${index % 4}`]].join(" ")} style={{ animationDuration: `${at.seconds}s`, animationPlayState: playing ? "running" : "paused" }} />
        ) : (
          <span className={v.empty}>
            <Icon name="image" size={28} /> Scene {index + 1} has no picture yet
          </span>
        )}
        {!motion && scene?.text && <span className={v.previewHeadline}>{scene.text}</span>}
        {cue && <PreviewCaption cue={cue} look={captions.look} y={layout.y / H} size={layout.size / W} />}
        <span className={v.previewNo}>
          Scene {index + 1} of {video.scenes.length}
        </span>
      </div>
      <div className={v.previewBar}>
        <button type="button" className={v.previewBtn} onClick={() => (t >= total ? restart() : setPlaying((x) => !x))} aria-label={playing ? "Pause" : "Play"}>
          <Icon name={playing ? "pause" : "play"} size={18} />
        </button>
        <span className={v.previewTrack} aria-hidden="true">
          {timeline.map((x, i) => (
            <span key={i} style={{ flexGrow: x.seconds }} className={i < index ? v.trackDone : i === index ? v.trackNow : undefined}>
              {i === index && <span style={{ width: `${p * 100}%` }} />}
            </span>
          ))}
        </span>
        <span className={v.previewTime}>
          {Math.floor(t)} / {Math.round(total)} s
        </span>
        <button type="button" className={v.previewBtn} onClick={restart} aria-label="Play from the start">
          <Icon name="refresh" size={18} />
        </button>
      </div>
      <p className={v.fine}>A quick look at the flow: pictures, timing and captions. No voice, free. The video itself moves more smoothly.</p>
    </div>
  );
}

/** Each scene's place in time, held as long as the video holds it, with its words read at a reading pace. */
function timelineOf(scenes: VideoProject["scenes"], motion: boolean) {
  const out: { words: string; start: number; seconds: number; speechStart: number; speechSeconds: number }[] = [];
  for (const s of scenes) {
    const seconds = motion ? Math.max(s.seconds + 0.4, 3) : s.seconds;
    const start = out.length ? out[out.length - 1].start + out[out.length - 1].seconds : 0;
    out.push({ words: s.spoken.trim(), start, seconds, speechStart: 0, speechSeconds: readingSeconds(s.spoken, seconds) });
  }
  return out;
}

/** One caption cue in HTML, sized and placed like the burned-in one. */
function PreviewCaption({ cue, look, y, size }: { cue: CaptionCue; look: "clean" | "bold" | "minimal"; y: number; size: number }) {
  return (
    <span className={[v.previewCaption, v[`cap_${look}`]].join(" ")} style={{ top: `${y * 100}%`, fontSize: `${size * 100}cqw` }}>
      {cue.words.map((w, i) => (
        <span key={i} className={i === cue.active ? v.capLit : undefined}>
          {look === "bold" ? w.toUpperCase() : w}
        </span>
      ))}
    </span>
  );
}
