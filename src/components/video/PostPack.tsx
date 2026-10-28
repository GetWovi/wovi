"use client";

import { useEffect, useState } from "react";
import { runView } from "@/app/app/make/actions";
import { makePostPack, type VideoResult } from "@/app/app/video/actions";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { RunView } from "@/lib/app/api";
import type { VideoProject } from "@/lib/video/studio";
import v from "./Video.module.css";

const PLATFORM_WORDS: Record<string, string> = { tiktok: "TikTok", reels: "Instagram Reels", shorts: "YouTube Shorts", x: "X" };
const WAITING = new Set(["queued", "running"]);
const creditWords = (n: number) => `${n} credit${n === 1 ? "" : "s"}`;

/**
 * The ready-to-post pack under the video: a caption for each platform and
 * the tags, from WOVI's own Caption Writer and Hashtag Optimizer runs on the
 * script. Optional, with the price on the button; each line has its own copy
 * button.
 */
export function PostPack({ csrf, video, editor, price, onVideo }: { csrf: string; video: VideoProject; editor: boolean; price: { captions: number | null; hashtags: number | null }; onVideo: (v: VideoProject) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captions, setCaptions] = useState<RunView | null>(null);
  const [tags, setTags] = useState<RunView | null>(null);
  const pack = video.pack;

  const captionId = pack?.captionRunId ?? null;
  const hashtagId = pack?.hashtagRunId ?? null;

  // Follows both runs until they are written.
  useEffect(() => {
    if (!captionId && !hashtagId) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const [a, b] = await Promise.all([captionId ? runView(csrf, captionId) : null, hashtagId ? runView(csrf, hashtagId) : null]);
      if (stop) return;
      if (a?.ok) setCaptions(a.value);
      if (b?.ok) setTags(b.value);
      const waiting = (a?.ok && a.value && WAITING.has(a.value.state)) || (b?.ok && b.value && WAITING.has(b.value.state));
      if (waiting) timer = setTimeout(poll, 1500);
    };
    void poll();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [csrf, captionId, hashtagId]);

  async function make() {
    setBusy(true);
    setError(null);
    const r: VideoResult = await makePostPack(csrf, video.id, { ...(price.captions !== null ? { captions: price.captions } : {}), ...(price.hashtags !== null ? { hashtags: price.hashtags } : {}) });
    setBusy(false);
    if (r.ok) onVideo(r.video);
    else setError(r.error);
  }

  const total = price.captions !== null || price.hashtags !== null ? (price.captions ?? 0) + (price.hashtags ?? 0) : null;

  if (!pack) {
    return (
      <section className={v.pack} aria-label="Ready to post">
        <div>
          <span className="eyebrow">Ready to post</span>
          <h3 className={v.paneTitle}>A caption for each platform, and the tags</h3>
          <p className={v.fine}>Written from the script by WOVI&apos;s Caption Writer and Hashtag Optimizer, in your brand&apos;s voice.</p>
        </div>
        {error && <p className={v.packError}>{error}</p>}
        <Button onClick={make} loading={busy} disabled={!editor || busy} leading={<Icon name="hash" size={18} />}>
          Make the post pack{total !== null ? ` · up to ${creditWords(total)}` : ""}
        </Button>
      </section>
    );
  }

  const out = captions?.run.output;
  const list = tags?.run.output;
  const tagItems = list?.kind === "list" ? (list.items as (string | Record<string, string>)[]).map((x) => (typeof x === "string" ? { term: x, type: "", where: "" } : x)) : [];
  const hashtags = tagItems.filter((x) => x.type === "hashtag" || x.term?.startsWith("#")).map((x) => x.term);
  const words = tagItems.filter((x) => !(x.type === "hashtag" || x.term?.startsWith("#")));

  return (
    <section className={v.pack} aria-label="Ready to post">
      <div>
        <span className="eyebrow">Ready to post</span>
        <h3 className={v.paneTitle}>Captions and tags</h3>
      </div>
      {error && <p className={v.packError}>{error}</p>}
      {!captions || WAITING.has(captions.state) ? (
        <p className={v.fine} role="status">
          <Icon name="clock" size={14} /> Writing the captions...
        </p>
      ) : out?.kind === "caption_set" ? (
        <div className={v.packGrid}>
          {out.captions.map((c) => (
            <div key={c.platform} className={v.packItem}>
              <div className={v.packHead}>
                <b>{PLATFORM_WORDS[c.platform] ?? c.platform}</b>
                <Copy text={c.variants[0] ?? ""} label={`Copy the ${PLATFORM_WORDS[c.platform] ?? c.platform} caption`} />
              </div>
              <p>{c.variants[0]}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className={v.fine}>The captions could not be written. {captions.run.error?.message ?? ""}</p>
      )}
      {pack.hashtagRunId &&
        (!tags || WAITING.has(tags.state) ? (
          <p className={v.fine} role="status">
            <Icon name="clock" size={14} /> Picking the tags...
          </p>
        ) : tagItems.length ? (
          <div className={v.packItem}>
            <div className={v.packHead}>
              <b>Tags for {PLATFORM_WORDS[pack.platform] ?? pack.platform}</b>
              {hashtags.length > 0 && <Copy text={hashtags.join(" ")} label="Copy the hashtags" />}
            </div>
            <div className={v.chips}>
              {hashtags.map((h) => (
                <span key={h} className={v.tag}>
                  {h}
                </span>
              ))}
            </div>
            {words.length > 0 && (
              <ul className={v.packWords}>
                {words.map((w) => (
                  <li key={w.term}>
                    <b>{w.term}</b> {w.where ? <span>{w.where}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className={v.fine}>The tags could not be picked. {tags.run.error?.message ?? ""}</p>
        ))}
    </section>
  );
}

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={v.iconBtn}
      aria-label={label}
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => undefined);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      <Icon name={done ? "check" : "copy"} size={14} /> {done ? "Copied" : "Copy"}
    </button>
  );
}
