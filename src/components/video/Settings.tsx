"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Toggle } from "@/components/ui/Toggle";
import { ASPECTS, LENGTHS, VIBES, type Aspect, type Length, type Vibe } from "@/lib/video/planner";
import type { Settings } from "@/lib/video/proposal";
import { CAPTION_LOOKS, CAPTION_POSITIONS, SPOKEN_VOICES, STYLES, TYPES, styleExample, styleOf, typeOf, voiceSample, type CaptionLook, type SpokenVoice, type VideoStyle, type VideoType } from "@/lib/video/styles";
import v from "./Video.module.css";

export type SettingKey = "type" | "style" | "voice" | "captions" | "length" | "format" | "mood" | "brand";

const FORMAT_SHORT: Record<Aspect, string> = { "9:16": "9:16 vertical", "1:1": "1:1 square", "16:9": "16:9 wide" };

/** One chip per setting, as the proposal reads: tap one to change it. */
export function SettingChips({ s, brand, hasBrand, open, onOpen, only }: { s: Settings; brand: boolean; hasBrand: boolean; open: SettingKey | null; onOpen: (k: SettingKey | null) => void; only?: SettingKey[] }) {
  const chips: { key: SettingKey; label: string; value: string }[] = [
    { key: "type", label: "Type", value: typeOf(s.type).label },
    { key: "style", label: "Style", value: styleOf(s.style).label },
    { key: "voice", label: "Voiceover", value: s.voiceover ? SPOKEN_VOICES.find((x) => x.value === s.voice)!.label : "Off" },
    { key: "captions", label: "Captions", value: s.captions.on ? `${CAPTION_LOOKS.find((x) => x.value === s.captions.look)!.label}, ${s.captions.position}` : "Off" },
    { key: "length", label: "Length", value: `${s.seconds} s` },
    { key: "format", label: "Format", value: FORMAT_SHORT[s.aspect] },
    { key: "mood", label: "Mood", value: VIBES.find((x) => x.value === s.vibe)!.label },
    ...(hasBrand ? [{ key: "brand" as const, label: "Brand Brain", value: brand ? "On" : "Off" }] : []),
  ];
  return (
    <div className={v.settingChips} role="group" aria-label="Settings">
      {chips
        .filter((c) => !only || only.includes(c.key))
        .map((c) => (
          <button key={c.key} type="button" className={[v.settingChip, open === c.key ? v.settingChipOn : ""].join(" ")} aria-expanded={open === c.key} onClick={() => onOpen(open === c.key ? null : c.key)}>
            <small>{c.label}</small>
            <span>{c.value}</span>
            <Icon name="chevron-down" size={14} />
          </button>
        ))}
    </div>
  );
}

/** The editor for one setting, each explained in plain words. */
export function SettingEditor({
  which,
  s,
  brand,
  onChange,
  onBrand,
  styles = STYLES.map((x) => x.value),
  styleNote,
}: {
  which: SettingKey;
  s: Settings;
  brand: boolean;
  onChange: (patch: Partial<Settings>) => void;
  onBrand: (on: boolean) => void;
  /** The styles that may be picked here (a restyle cannot switch to or from Motion graphics). */
  styles?: VideoStyle[];
  /** A line under the style cards, like what a restyle costs. */
  styleNote?: string;
}) {
  switch (which) {
    case "type":
      return (
        <Pane title="Type" lead="What the video is for.">
          <div className={v.cards}>
            {TYPES.map((t) => (
              <button key={t.value} type="button" className={[v.card, s.type === t.value ? v.cardOn : ""].join(" ")} aria-pressed={s.type === t.value} onClick={() => onChange({ type: t.value as VideoType })}>
                <b>{t.label}</b>
                <span>{t.hint}</span>
              </button>
            ))}
          </div>
        </Pane>
      );
    case "style":
      return (
        <Pane title="Style" lead="How it looks.">
          <StyleCards value={s.style} allowed={styles} onPick={(style) => onChange({ style })} />
          {styleNote && <p className={v.fine}>{styleNote}</p>}
        </Pane>
      );
    case "voice":
      return (
        <Pane title="Voiceover" lead="A voice reads the script over the video.">
          <Toggle checked={s.voiceover} onChange={(on) => onChange({ voiceover: on })} label={s.voiceover ? "Voiceover on" : "Voiceover off"} description={s.voiceover ? "Pick a voice. Play a sample first." : "Words on screen only."} />
          {s.voiceover && <VoicePicker value={s.voice} onPick={(voice) => onChange({ voice })} />}
        </Pane>
      );
    case "captions":
      return (
        <Pane title="Captions" lead="The spoken words on screen, timed to the voice.">
          <Toggle checked={s.captions.on} onChange={(on) => onChange({ captions: { ...s.captions, on } })} label={s.captions.on ? "Captions on" : "Captions off"} />
          {s.captions.on && (
            <>
              <div className={v.looks}>
                {CAPTION_LOOKS.map((l) => (
                  <button key={l.value} type="button" className={[v.lookCard, s.captions.look === l.value ? v.cardOn : ""].join(" ")} aria-pressed={s.captions.look === l.value} onClick={() => onChange({ captions: { ...s.captions, look: l.value } })}>
                    <CaptionSample look={l.value} />
                    <b>{l.label}</b>
                    <span>{l.hint}</span>
                  </button>
                ))}
              </div>
              {s.style === "motion" ? (
                <p className={v.fine}>Motion graphics keeps captions at the bottom, under the drawing.</p>
              ) : (
                <Choice label="Position" options={CAPTION_POSITIONS.map((p) => ({ value: p.value, label: p.label }))} value={s.captions.position} onPick={(position) => onChange({ captions: { ...s.captions, position: position as "bottom" | "middle" } })} />
              )}
            </>
          )}
        </Pane>
      );
    case "length":
      return (
        <Pane title="Length" lead="Shorter videos get watched to the end more often.">
          <Choice label="Length" hideLabel options={LENGTHS.map((x) => ({ value: String(x), label: `${x} seconds` }))} value={String(s.seconds)} onPick={(x) => onChange({ seconds: Number(x) as Length })} />
        </Pane>
      );
    case "format":
      return (
        <Pane title="Format" lead="The shape of the video, for where it goes.">
          <Choice label="Format" hideLabel options={ASPECTS.map((x) => ({ value: x.value, label: x.label, hint: x.hint }))} value={s.aspect} onPick={(x) => onChange({ aspect: x as Aspect })} />
        </Pane>
      );
    case "mood":
      return (
        <Pane title="Mood" lead="The feel of the pictures, the words and the voice.">
          <Choice label="Mood" hideLabel options={VIBES.map((x) => ({ value: x.value, label: x.label }))} value={s.vibe} onPick={(x) => onChange({ vibe: x as Vibe })} />
        </Pane>
      );
    case "brand":
      return (
        <Pane title="Brand Brain" lead="Your brand's words, colours and logo.">
          <Toggle checked={brand} onChange={onBrand} label="Use my Brand Brain" description="Brand colours on the words and shapes, and an end card with your name and logo." />
        </Pane>
      );
  }
}

function Pane({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  return (
    <div className={v.pane}>
      <div>
        <h3 className={v.paneTitle}>{title}</h3>
        <p className={v.fine}>{lead}</p>
      </div>
      {children}
    </div>
  );
}

/** The seven styles as cards, each with its example picture. */
export function StyleCards({ value, allowed, onPick }: { value: VideoStyle; allowed?: VideoStyle[]; onPick: (s: VideoStyle) => void }) {
  return (
    <div className={v.styleCards}>
      {STYLES.filter((x) => !allowed || allowed.includes(x.value)).map((x) => (
        <button key={x.value} type="button" className={[v.styleCard, value === x.value ? v.cardOn : ""].join(" ")} aria-pressed={value === x.value} onClick={() => onPick(x.value)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={styleExample(x.value)} alt="" width={240} height={240} loading="lazy" />
          <b>{x.label}</b>
          <span>{x.hint}</span>
        </button>
      ))}
    </div>
  );
}

/** Warm, Calm and Bright, each with a two second sample to play before choosing. */
export function VoicePicker({ value, onPick }: { value: SpokenVoice; onPick: (v: SpokenVoice) => void }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<SpokenVoice | null>(null);
  useEffect(() => () => audio.current?.pause(), []);
  function play(voice: SpokenVoice) {
    audio.current?.pause();
    const a = new Audio(voiceSample(voice));
    audio.current = a;
    setPlaying(voice);
    a.onended = () => setPlaying(null);
    a.onerror = () => setPlaying(null);
    void a.play().catch(() => setPlaying(null));
  }
  return (
    <div className={v.voices} role="radiogroup" aria-label="Voice">
      {SPOKEN_VOICES.map((x) => (
        <div key={x.value} className={[v.voiceCard, value === x.value ? v.cardOn : ""].join(" ")}>
          <button type="button" role="radio" aria-checked={value === x.value} className={v.voicePick} onClick={() => onPick(x.value)}>
            <b>{x.label}</b>
            <span>{x.hint}</span>
          </button>
          <button type="button" className={v.sample} onClick={() => play(x.value)} aria-label={`Play a sample of the ${x.label} voice`}>
            <Icon name={playing === x.value ? "pause" : "play"} size={16} /> {playing === x.value ? "Playing" : "Play sample"}
          </button>
        </div>
      ))}
    </div>
  );
}

/** A small dark frame with sample words in the caption look. */
function CaptionSample({ look }: { look: CaptionLook }) {
  const words = look === "bold" ? ["FRESH", "EVERY", "MORNING"] : ["Fresh", "every", "morning"];
  return (
    <span className={v.captionSample} aria-hidden="true">
      <span className={[v.capLine, v[`cap_${look}`]].join(" ")}>
        {words.map((w, i) => (
          <span key={w} className={look === "bold" && i === 1 ? v.capLit : undefined}>
            {w}
          </span>
        ))}
      </span>
    </span>
  );
}

export function Choice({ label, options, value, onPick, hideLabel }: { label: string; options: { value: string; label: string; hint?: string }[]; value: string; onPick: (v: string) => void; hideLabel?: boolean }) {
  return (
    <fieldset className={v.choice}>
      <legend className={hideLabel ? v.srOnly : undefined}>{label}</legend>
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
