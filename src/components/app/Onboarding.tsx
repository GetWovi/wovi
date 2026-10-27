"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { finishOnboarding, readPosts, saveOnboarding, skipOnboarding } from "@/app/app/welcome/actions";
import { Sparkle, Sticker } from "@/components/brand/Accents";
import { Mascot } from "@/components/brand/Mascot";
import { LinesField, PlatformsField, ToneField, WordsField } from "@/components/brand-brain/fields";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Input, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import type { Platform } from "@/lib/agents/catalog";
import { STEP_TITLES, canReadPosts, filledPosts, progressLabel, stepIndex, stepNumber, welcomeWords, type OnboardingState } from "@/lib/app/onboarding";
import { ONBOARDING_STEPS, type OnboardingStep } from "@/lib/app/types";
import type { PublicProposal, ReadQuote } from "@/lib/brand/brains";
import { ReadChoice, defaultUseModel } from "@/components/brand-brain/ReadChoice";
import { BRAND_LIMITS, type OpeningKind, type ProfileProposal } from "@/lib/brand/types";
import styles from "./App.module.css";

const OPENINGS: Record<OpeningKind, string> = { question: "a question", number: "a number", personal: "yourself", command: "a call", quote: "a quote", statement: "a statement" };
const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * Onboarding: Wovi waves hello, you pick a niche and platforms, paste 3 to 5
 * past posts, check the proposed voice, and land in the app with your first
 * Brand Brain. Every step is skippable and progress is saved as you go.
 */
export function Onboarding({ csrf, start, proposal: initialProposal, editor, quote = { mode: "free" } }: { csrf: string; start: OnboardingState; proposal: PublicProposal | null; editor: boolean; quote?: ReadQuote }) {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState<OnboardingStep>(start.step);
  const [name, setName] = useState(start.name);
  const [niche, setNiche] = useState(start.niche);
  const [platforms, setPlatforms] = useState<Platform[]>(start.platforms);
  const [posts, setPosts] = useState<string[]>(start.posts.length ? start.posts : ["", "", ""]);
  const [proposal, setProposal] = useState<PublicProposal | null>(initialProposal);
  const [profile, setProfile] = useState<ProfileProposal | null>(initialProposal?.profile ?? null);
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useModel, setUseModel] = useState(defaultUseModel(quote));
  const [readSeconds, setReadSeconds] = useState(0);

  // The seconds on the reading screen, so a longer read never looks stuck.
  useEffect(() => {
    if (busy !== "read") return;
    const started = Date.now();
    const timer = window.setInterval(() => setReadSeconds(Math.round((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);

  function go(next: OnboardingStep) {
    setStep(next);
    setError(null);
    window.history.replaceState(null, "", `/app/welcome?step=${next}`);
    window.scrollTo({ top: 0 });
  }

  async function save(next: OnboardingStep) {
    setBusy("save");
    const r = await saveOnboarding(csrf, { step: next, name, niche, platforms, posts });
    setBusy(null);
    if (!r.ok) return setError(r.error);
    go(r.value.step);
  }

  async function read() {
    const can = canReadPosts(posts);
    if (!can.ok) return setError(can.reason);
    setReadSeconds(0);
    setBusy("read");
    setError(null);
    window.scrollTo({ top: 0 });
    const saved = await saveOnboarding(csrf, { step: "posts", name, niche, platforms, posts });
    if (!saved.ok) {
      setBusy(null);
      return setError(saved.error);
    }
    const r = await readPosts(csrf, quote.mode === "credits" && useModel ? { useModel: true, quotedCredits: quote.credits } : {});
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setProposal(r.value.proposal);
    setProfile(r.value.proposal.profile);
    go("review");
  }

  async function finish(withVoice: boolean) {
    setBusy(withVoice ? "finish" : "blank");
    setError(null);
    const edits = withVoice && profile ? { name, niche, platforms, ...profile, ...(idea.trim() ? { idea } : {}) } : { name, niche, platforms };
    if (!withVoice) await saveOnboarding(csrf, { name, niche, platforms, posts: ["", "", ""] });
    const r = await finishOnboarding(csrf, edits);
    setBusy(null);
    if (!r.ok) return setError(r.error);
    // Skipping the posts leaves a Brand Brain with only the basics, so the welcome says so.
    toast({ tone: "success", ...welcomeWords(r.value.brainId ? { voiced: withVoice } : null) });
    router.push("/app?welcome=1");
  }

  async function skip() {
    setBusy("skip");
    const r = await skipOnboarding(csrf);
    setBusy(null);
    if (!r.ok) return setError(r.error);
    router.push("/app");
  }

  const steps = (
    <nav className={styles.steps} aria-label="Onboarding steps">
      {ONBOARDING_STEPS.map((s) => {
        const reachable = s !== "review" || Boolean(proposal);
        const cls = [styles.step, s === step ? styles.stepCurrent : "", stepIndex(s) < stepIndex(step) ? styles.stepDone : ""].join(" ");
        const body = (
          <>
            <span className={styles.stepNo}>{stepIndex(s) < stepIndex(step) ? <Icon name="check" size={14} /> : (stepNumber(s) ?? <Icon name="spark" size={14} />)}</span>
            <span>{STEP_TITLES[s]}</span>
          </>
        );
        return reachable ? (
          <button key={s} type="button" className={cls} onClick={() => go(s)} aria-current={s === step ? "step" : undefined}>
            {body}
          </button>
        ) : (
          <span key={s} className={cls} aria-disabled="true">
            {body}
          </span>
        );
      })}
    </nav>
  );

  if (!editor) {
    return (
      <div className={[styles.panel, styles.panelAlt, styles.wovi].join(" ")}>
        <Mascot pose="hello" size={140} />
        <b>Hello. You are a viewer here.</b>
        <span>Someone with edit rights in this workspace sets up the Brand Brain. You can look at everything.</span>
        <Link href="/app">Go to the app</Link>
      </div>
    );
  }

  /* ---------- 1. Welcome ---------- */
  if (step === "welcome") {
    return (
      <div className={styles.stack}>
        {steps}
        <section className={[styles.panel, styles.welcome].join(" ")}>
          <div className={styles.heroCopy}>
            <span className="eyebrow">{progressLabel(step)}</span>
            <h1 className={styles.h1}>
              Hi, I am Wovi. Let&apos;s make content that <em>sounds like you</em>.
            </h1>
            <p className={styles.lead}>About two minutes. Tell me who you are, show me a few posts you were happy with, and check what I read in them. That becomes your Brand Brain, and every agent reads it before it writes.</p>
            <div className={styles.tiles}>
              {[
                ["Your brand", "A name, what you do, where you post."],
                ["Your posts", "Paste 3 to 5 posts that did well."],
                ["Your voice", "Check what I noticed. Change anything."],
              ].map(([t, d], i) => (
                <div key={t} className={styles.tile}>
                  <span className={styles.tileNo}>{i + 1}</span>
                  <b>{t}</b>
                  <span>{d}</span>
                </div>
              ))}
            </div>
            <div className={styles.actions}>
              <Button size="lg" onClick={() => go("brand")} trailing={<Icon name="arrow-right" />}>
                Let&apos;s go
              </Button>
              <Button size="lg" variant="ghost" onClick={skip} loading={busy === "skip"}>
                Skip for now
              </Button>
            </div>
          </div>
          <div className={styles.welcomeStage}>
            <div className={styles.stickers}>
              <Sticker tilt={-7}>one agent</Sticker>
              <span className={styles.stickerTwo}>
                <Sticker tilt={5}>one job</Sticker>
              </span>
            </div>
            <Sparkle size={30} className={styles.sparkleA} />
            <Sparkle size={16} className={styles.sparkleB} />
            <Mascot pose="hello" size={260} className="wovi" label="Wovi says hello" />
          </div>
        </section>
      </div>
    );
  }

  /* ---------- 2. Niche and platforms ---------- */
  if (step === "brand") {
    return (
      <div className={styles.stack}>
        {steps}
        <div className={styles.onb}>
          <section className={[styles.panel, styles.stack].join(" ")}>
            <div className={styles.headText}>
              <span className="eyebrow">{progressLabel(step)}</span>
              <h1 className={styles.h1}>Who are you, and where do you post?</h1>
              <p className={styles.lead}>A few words are enough. You can change all of it later in your Brand Brain.</p>
            </div>
            <div className={styles.formGrid}>
              <Input label="Brand or business name" value={name} onChange={(e) => setName(e.target.value)} maxLength={BRAND_LIMITS.name} placeholder="Spoke and Chain" autoFocus />
              <Input label="What you do" value={niche} onChange={(e) => setNiche(e.target.value)} maxLength={BRAND_LIMITS.niche} placeholder="Bike repair shop in Bristol" hint="Your niche, in one line." />
            </div>
            <PlatformsField value={platforms} onChange={setPlatforms} />
            {error && <Problem text={error} />}
            <div className={styles.onbBar}>
              <span>Saved as you go, so you can come back later.</span>
              <div className={styles.actions}>
                <Button variant="ghost" onClick={() => go("welcome")} leading={<Icon name="arrow-left" size={18} />}>
                  Back
                </Button>
                <Button variant="ghost" onClick={() => save("posts")} disabled={busy !== null}>
                  Skip
                </Button>
                <Button onClick={() => save("posts")} loading={busy === "save"} trailing={<Icon name="arrow-right" size={18} />}>
                  Next: your posts
                </Button>
              </div>
            </div>
          </section>
          <Aside pose="hello" title="Why this matters" tips={[["The name", "Agents use it where a brand would name itself."], ["What you do", "Hashtag Optimizer and Idea Generator lean on it for what people search."], ["Platforms", "Each one changes the writing: spoken hooks on video, first lines on X."]]} />
        </div>
      </div>
    );
  }

  /* ---------- 3. Paste past posts, then Wovi reading them ---------- */
  if (step === "posts" && busy === "read") {
    return (
      <div className={styles.stack}>
        {steps}
        <Reading posts={filledPosts(posts).length} seconds={readSeconds} />
      </div>
    );
  }
  if (step === "posts") {
    const filled = filledPosts(posts).length;
    return (
      <div className={styles.stack}>
        {steps}
        <div className={styles.onb}>
          <section className={[styles.panel, styles.stack].join(" ")}>
            <div className={styles.headText}>
              <span className="eyebrow">{progressLabel(step)}</span>
              <h1 className={styles.h1}>Paste 3 to 5 posts you were happy with</h1>
              <p className={styles.lead}>As they went out, emoji and hashtags included, or a link to the post on X and I read it for you. Other links are kept as references. I read the voice from them and you check it next.</p>
            </div>
            <div className={styles.posts}>
              {posts.map((p, i) => (
                <div key={i} className={styles.stackTight}>
                  <div className={styles.postHead}>
                    <span className={styles.fieldLabel}>Post {i + 1}</span>
                    {i >= BRAND_LIMITS.postsMin && (
                      <Button size="sm" variant="ghost" onClick={() => setPosts(posts.filter((_, j) => j !== i))}>
                        Remove
                      </Button>
                    )}
                  </div>
                  <Textarea aria-label={`Post ${i + 1}`} rows={Math.min(7, Math.max(3, p.split("\n").length + 1))} value={p} onChange={(e) => setPosts(posts.map((x, j) => (j === i ? e.target.value : x)))} maxLength={BRAND_LIMITS.postText} placeholder={i === 0 ? "Paste the whole post, or a link to it on X" : "Another post, or a link to it on X"} />
                </div>
              ))}
              {posts.length < BRAND_LIMITS.postsMax && (
                <div>
                  <Button variant="ghost" size="sm" onClick={() => setPosts([...posts, ""])} leading={<Icon name="plus" size={16} />}>
                    Add a post
                  </Button>
                </div>
              )}
            </div>
            <ReadChoice quote={quote} value={useModel} onChange={setUseModel} />
            {error && <Problem text={error} />}
            <div className={styles.onbBar}>
              <span>
                {filled} of {BRAND_LIMITS.postsMax} added{filled < BRAND_LIMITS.postsMin ? `. Add ${BRAND_LIMITS.postsMin - filled} more to read them.` : "."}
              </span>
              <div className={styles.actions}>
                <Button variant="ghost" onClick={() => save("brand")} leading={<Icon name="arrow-left" size={18} />} disabled={busy !== null}>
                  Back
                </Button>
                <Button variant="ghost" onClick={() => finish(false)} loading={busy === "blank"} disabled={busy !== null}>
                  Skip, start without posts
                </Button>
                <Button onClick={read} loading={busy === "read"} disabled={filled < BRAND_LIMITS.postsMin || busy !== null} leading={<Icon name="spark" size={18} />}>
                  Read my posts
                </Button>
              </div>
            </div>
          </section>
          <Aside pose="hello" title="What I look at" tips={[["Sentence length", "Short and punchy, or long and thought through."], ["Emoji, hashtags, casing", "Whether you use them, and how much."], ["How you open", "Questions, numbers, a line about yourself."], ["Words you come back to", "They become words to use."]]} />
        </div>
      </div>
    );
  }

  /* ---------- 4. Review the voice ---------- */
  if (!proposal || !profile) {
    return (
      <div className={styles.stack}>
        {steps}
        <div className={[styles.panel, styles.panelAlt, styles.wovi].join(" ")}>
          <Mascot pose="wait" size={120} />
          <b>No posts read yet</b>
          <span>Go back and paste 3 to 5 posts, and I will propose the voice.</span>
          <Button variant="secondary" onClick={() => go("posts")}>
            Back to the posts
          </Button>
        </div>
      </div>
    );
  }
  const s = proposal.signals;
  const set = (p: Partial<ProfileProposal>) => setProfile({ ...profile, ...p });
  const voice = (v: Partial<ProfileProposal["voice"]>) => set({ voice: { ...profile.voice, ...v } });
  return (
    <div className={styles.stack}>
      {steps}
      <div className={styles.onb}>
        <section className={styles.stack}>
          <div className={[styles.panel, styles.stack].join(" ")}>
            <div className={styles.headText}>
              <span className="eyebrow">{progressLabel(step)}</span>
              <h1 className={styles.h1}>Here is what I read. Does it sound like you?</h1>
              <p className={styles.lead}>Change anything. Nothing is saved until you press the button at the end.</p>
            </div>
            <Textarea label="How it sounds" rows={4} value={profile.voice.description} onChange={(e) => voice({ description: e.target.value })} maxLength={BRAND_LIMITS.voiceDescription} />
            <ToneField value={profile.voice.tone} onChange={(tone) => voice({ tone })} />
            <div className={styles.halves}>
              <WordsField label="Words to use" help="Phrases you come back to." value={profile.voice.use} onChange={(use) => voice({ use })} />
              <WordsField label="Words to avoid" help="Agents never use these." value={profile.voice.avoid} onChange={(avoid) => voice({ avoid })} />
            </div>
            <LinesField label="Lines that sound right" help="Drafts are compared with these." value={profile.voice.samples} onChange={(samples) => voice({ samples })} max={BRAND_LIMITS.sampleLines} />
          </div>
          <div className={[styles.panel, styles.panelAlt, styles.stack].join(" ")}>
            <WordsField label="What you post about" value={profile.topics} onChange={(topics) => set({ topics })} max={BRAND_LIMITS.topics} />
            <div className={styles.halves}>
              <LinesField label="Do" value={profile.dos} onChange={(dos) => set({ dos })} />
              <LinesField label="Don't" help='Write each one plainly, like: No hashtags. Never say "cheap". Drafts that break a line like that are flagged.' value={profile.donts} onChange={(donts) => set({ donts })} />
            </div>
            <Textarea label="The idea behind the brand (optional)" rows={2} value={idea} onChange={(e) => setIdea(e.target.value)} maxLength={BRAND_LIMITS.idea} placeholder="Fix it today, not someday." />
          </div>
          {error && <Problem text={error} />}
          <div className={[styles.panel, styles.panelTight, styles.onbBar].join(" ")}>
            <span>Saves {name || "your Brand Brain"} with your {proposal.posts.length} posts as references, and makes it the default for every agent.</span>
            <div className={styles.actions}>
              <Button variant="ghost" onClick={() => go("posts")} leading={<Icon name="arrow-left" size={18} />}>
                Back
              </Button>
              <Button size="lg" onClick={() => finish(true)} loading={busy === "finish"} leading={<Icon name="check" size={18} />}>
                Save and start
              </Button>
            </div>
          </div>
        </section>
        <aside className={styles.onbSide}>
          <div className={[styles.panel, styles.panelTight, styles.stack].join(" ")}>
            <div className={styles.sideHead}>
              <Mascot pose="done" size={64} />
              <div>
                <h3>What I noticed</h3>
                <span className={[styles.muted, styles.small].join(" ")}>In your {s.posts} posts</span>
              </div>
            </div>
            <div className={styles.signals}>
              <Signal label="Sentences" value={String(Math.round(s.wordsPerSentence))} hint="words each" />
              <Signal label="Emoji" value={String(s.emojiPerPost)} hint="a post" />
              <Signal label="Hashtags" value={String(s.hashtagsPerPost)} hint="a post" />
              <Signal label="Lowercase" value={pct(s.lowercaseShare)} hint="of sentences" />
              <Signal label="Questions" value={pct(s.questionShare)} hint="of posts" />
              <Signal label="Opens with" value={s.opening ? OPENINGS[s.opening.kind] : "a mix"} hint={s.opening ? `${s.opening.count} of ${s.posts} posts` : "no one way"} />
            </div>
            {s.recurring.length > 0 && (
              <div className={styles.stackTight}>
                <span className={styles.fieldLabel}>Words you come back to</span>
                <div className={styles.chips}>
                  {s.recurring.slice(0, 8).map((w) => (
                    <Chip key={w} selected={profile.voice.use.includes(w)} onClick={() => voice({ use: profile.voice.use.includes(w) ? profile.voice.use.filter((x) => x !== w) : [...profile.voice.use, w] })}>
                      {w}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
            {(proposal.unread.length > 0 || proposal.charge || (proposal.source === "heuristics" && proposal.notes[0])) && (
              <ul className={[styles.muted, styles.small].join(" ")} style={{ margin: 0, paddingLeft: 18 }}>
                {proposal.unread.map((u) => (
                  <li key={u}>{u}</li>
                ))}
                {proposal.source === "heuristics" && proposal.notes[0] && <li>{proposal.notes[0]}</li>}
                {proposal.charge && <li>{proposal.charge.charged > 0 ? `The AI read cost ${proposal.charge.charged} credit${proposal.charge.charged === 1 ? "" : "s"}.` : "The AI did not answer, so nothing was charged."}</li>}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Aside({ pose, title, tips }: { pose: "hello" | "wait"; title: string; tips: [string, string][] }) {
  return (
    <aside className={styles.onbSide}>
      <div className={[styles.panel, styles.panelTight, styles.stack].join(" ")}>
        <div className={styles.sideHead}>
          <Mascot pose={pose} size={64} />
          <h3>{title}</h3>
        </div>
        <div className={styles.tips}>
          {tips.map(([t, d]) => (
            <div key={t} className={styles.tip}>
              <b>{t}</b>
              <span>{d}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

/** While the posts are read: Wovi on the move and what is happening, in the style of an agent's run. */
function Reading({ posts, seconds }: { posts: number; seconds: number }) {
  const steps = [
    { label: `${posts} posts saved`, state: "done" },
    { label: "Reading how you write: sentences, emoji, hashtags, how you open", state: "now" },
    { label: "Your voice, ready for you to check", state: "todo" },
  ];
  return (
    <section className={[styles.panel, styles.running].join(" ")} aria-live="polite">
      <Mascot pose="move" size={150} className="wovi" label="Wovi, reading your posts" />
      <div className={styles.runningText}>
        <span className="eyebrow">{progressLabel("posts")}</span>
        <h2>Reading your posts</h2>
        <ol className={styles.progress}>
          {steps.map((s) => (
            <li key={s.label} data-state={s.state}>
              <span className={styles.dot}>{s.state === "done" && <Icon name="check" size={14} />}</span>
              {s.label}
            </li>
          ))}
        </ol>
        <div className={styles.runningMeta}>
          <span>
            {seconds} second{seconds === 1 ? "" : "s"}
          </span>
          <span>Your voice opens here when it is ready.</span>
        </div>
      </div>
    </section>
  );
}

function Signal({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className={styles.signal}>
      <span className={styles.signalLabel}>{label}</span>
      <span className={styles.signalValue}>{value}</span>
      <span className={styles.signalHint}>{hint}</span>
    </div>
  );
}

function Problem({ text }: { text: string }) {
  return (
    <p role="alert" className={styles.fieldError}>
      <Icon name="warning" size={16} /> {text}
    </p>
  );
}
