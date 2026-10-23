"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { acceptProposal, proposeProfile } from "@/app/brand-brain/actions";
import { Mascot } from "@/components/brand/Mascot";
import shell from "@/components/builder/Builder.module.css";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Input, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import type { Platform } from "@/lib/agents/catalog";
import type { PublicProposal, ReadQuote } from "@/lib/brand/brains";
import { ReadChoice, defaultUseModel } from "./ReadChoice";
import { BRAND_LIMITS, type OpeningKind, type ProfileProposal } from "@/lib/brand/types";
import styles from "./Brain.module.css";
import { Issues, LinesField, PlatformsField, ToneField, WordsField } from "./fields";

const OPENINGS: Record<OpeningKind, string> = { question: "Question", number: "Number", personal: "Personal", command: "Call", quote: "Quote", statement: "Statement" };
const pct = (n: number) => `${Math.round(n * 100)}%`;

type Start = { brainId?: string; name: string; niche: string; platforms: Platform[] };

/** Paste 3 to 5 past posts, get a proposed profile, review and edit it, then save. Nothing is saved before the last step. */
export function PastePosts({ csrf, start, quote = { mode: "free" } }: { csrf: string; start: Start; quote?: ReadQuote }) {
  const router = useRouter();
  const [name, setName] = useState(start.name);
  const [niche, setNiche] = useState(start.niche);
  const [platforms, setPlatforms] = useState<Platform[]>(start.platforms);
  const [posts, setPosts] = useState<string[]>(["", "", ""]);
  const [proposal, setProposal] = useState<PublicProposal | null>(null);
  const [profile, setProfile] = useState<ProfileProposal | null>(null);
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ error: string; issues?: string[] } | null>(null);
  const [useModel, setUseModel] = useState(defaultUseModel(quote));

  const filled = posts.filter((p) => p.trim()).length;

  async function read() {
    setBusy(true);
    setError(null);
    try {
      const paid = quote.mode === "credits" && useModel;
      const r = await proposeProfile(csrf, { name, niche, platforms, posts: posts.filter((p) => p.trim()), brainId: start.brainId, ...(paid ? { useModel: true, quotedCredits: quote.credits } : {}) });
      if (!r.ok) return setError(r);
      setProposal(r.value);
      setProfile(r.value.profile);
      window.scrollTo({ top: 0 });
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!proposal || !profile) return;
    setBusy(true);
    setError(null);
    const r = await acceptProposal(csrf, proposal.id, { name, niche, platforms, ...profile, ...(idea.trim() ? { idea } : {}) });
    if (!r.ok) {
      setBusy(false);
      return setError(r);
    }
    router.push(`/brand-brain/${r.value.id}`);
  }

  if (!proposal || !profile) {
    return (
      <div className={styles.split}>
        <Card title="Your past posts" className={shell.section}>
          <p className={shell.sectionNote}>Paste posts that did well, as they went out. A link on its own line works too; it is kept as a reference.</p>
          <div className={shell.fieldGrid}>
            <Input label="Brand name" value={name} onChange={(e) => setName(e.target.value)} maxLength={BRAND_LIMITS.name} placeholder="Crumb and Co" />
            <Input label="Niche" value={niche} onChange={(e) => setNiche(e.target.value)} maxLength={BRAND_LIMITS.niche} placeholder="Small bakery in Leeds" />
          </div>
          <PlatformsField value={platforms} onChange={setPlatforms} />
          <div className={styles.posts}>
            {posts.map((p, i) => (
              <div key={i} className={shell.stackTight}>
                <div className={styles.postHead}>
                  <span className={styles.fieldLabel}>Post {i + 1}</span>
                  {i >= BRAND_LIMITS.postsMin && (
                    <Button size="sm" variant="ghost" onClick={() => setPosts(posts.filter((_, j) => j !== i))}>
                      Remove
                    </Button>
                  )}
                </div>
                <Textarea aria-label={`Post ${i + 1}`} rows={Math.min(8, Math.max(3, p.split("\n").length + 1))} value={p} onChange={(e) => setPosts(posts.map((x, j) => (j === i ? e.target.value : x)))} maxLength={BRAND_LIMITS.postText} placeholder={i === 0 ? "Paste the whole post, emoji and hashtags included" : "Another post, or a link"} />
              </div>
            ))}
          </div>
          <ReadChoice quote={quote} value={useModel} onChange={setUseModel} />
          <Issues error={error?.error ?? null} issues={error?.issues} />
          <div className={shell.runBar}>
            <span className={shell.estimate}>
              {filled} of {BRAND_LIMITS.postsMax} added{filled < BRAND_LIMITS.postsMin ? `. Add ${BRAND_LIMITS.postsMin - filled} more to start.` : "."}
            </span>
            <div className={shell.actions}>
              {posts.length < BRAND_LIMITS.postsMax && (
                <Button variant="ghost" onClick={() => setPosts([...posts, ""])} leading={<Icon name="plus" size={18} />}>
                  Add a post
                </Button>
              )}
              <Button onClick={read} loading={busy} disabled={filled < BRAND_LIMITS.postsMin} leading={<Icon name="spark" size={18} />}>
                Read my posts
              </Button>
            </div>
          </div>
        </Card>
        <aside className={styles.side}>
          <Card className={shell.section}>
            <div className={styles.sideHead}>
              <Mascot pose="hello" size={64} />
              <h3>How it works</h3>
            </div>
            <div className={styles.steps}>
              <div className={styles.step}>
                <div>
                  <b>Paste 3 to 5 posts</b>
                  <span>The ones that sound most like you.</span>
                </div>
              </div>
              <div className={styles.step}>
                <div>
                  <b>We read the voice</b>
                  <span>Sentence length, emoji, hashtags, casing, the words you come back to and how you open.</span>
                </div>
              </div>
              <div className={styles.step}>
                <div>
                  <b>You check it</b>
                  <span>Change anything. Nothing is saved until you say so.</span>
                </div>
              </div>
            </div>
          </Card>
        </aside>
      </div>
    );
  }

  const s = proposal.signals;
  const set = (p: Partial<ProfileProposal>) => setProfile({ ...profile, ...p });
  const voice = (v: Partial<ProfileProposal["voice"]>) => set({ voice: { ...profile.voice, ...v } });

  return (
    <div className={styles.split}>
      <div className={shell.stack}>
        <Card title="Voice" className={shell.section}>
          <Textarea label="How it sounds" rows={4} value={profile.voice.description} onChange={(e) => voice({ description: e.target.value })} maxLength={BRAND_LIMITS.voiceDescription} />
          <ToneField value={profile.voice.tone} onChange={(tone) => voice({ tone })} />
          <div className={styles.halves}>
            <WordsField label="Words to use" help="Phrases you come back to." value={profile.voice.use} onChange={(use) => voice({ use })} />
            <WordsField label="Words to avoid" help="The brand-fit check flags these." value={profile.voice.avoid} onChange={(avoid) => voice({ avoid })} />
          </div>
          <LinesField label="Lines that sound right" help="Drafts are compared with these." value={profile.voice.samples} onChange={(samples) => voice({ samples })} max={BRAND_LIMITS.sampleLines} />
        </Card>
        <Card title="Topics" className={shell.section}>
          <WordsField label="What you post about" value={profile.topics} onChange={(topics) => set({ topics })} max={BRAND_LIMITS.topics} />
        </Card>
        <Card title="Dos and don'ts" className={shell.section}>
          <div className={styles.halves}>
            <LinesField label="Do" value={profile.dos} onChange={(dos) => set({ dos })} />
            <LinesField label="Don't" help='Start with "No" or "Never" so the check can catch it.' value={profile.donts} onChange={(donts) => set({ donts })} />
          </div>
        </Card>
        <Card title="The idea" className={shell.section}>
          <Textarea label="The idea behind the brand (optional)" rows={2} value={idea} onChange={(e) => setIdea(e.target.value)} maxLength={BRAND_LIMITS.idea} placeholder="Honest baking: show the mess behind every good loaf." />
        </Card>
        <Issues error={error?.error ?? null} issues={error?.issues} />
        <div className={shell.runBar}>
          <span className={shell.estimate}>Saves {start.brainId ? "a new version of" : ""} {name || "this Brand Brain"} with your {proposal.posts.length} posts as references.</span>
          <div className={shell.actions}>
            <Button variant="ghost" onClick={() => setProposal(null)}>
              Back to the posts
            </Button>
            <Button onClick={save} loading={busy} leading={<Icon name="check" size={18} />}>
              {start.brainId ? "Save as a new version" : "Save Brand Brain"}
            </Button>
          </div>
        </div>
      </div>
      <aside className={styles.side}>
        <Card className={shell.section}>
          <div className={styles.sideHead}>
            <Mascot pose="done" size={64} />
            <div>
              <h3>What we noticed</h3>
              <span className={shell.hint}>In your {s.posts} posts</span>
            </div>
          </div>
          <div className={styles.signals}>
            <Signal label="Sentences" value={String(Math.round(s.wordsPerSentence))} hint="words each" />
            <Signal label="Emoji" value={String(s.emojiPerPost)} hint="a post" />
            <Signal label="Hashtags" value={String(s.hashtagsPerPost)} hint="a post" />
            <Signal label="Lowercase" value={pct(s.lowercaseShare)} hint="of sentences" />
            <Signal label="Questions" value={pct(s.questionShare)} hint="of posts" />
            <Signal label="Opens with" value={s.opening ? OPENINGS[s.opening.kind] : "A mix"} hint={s.opening ? `${s.opening.count} of ${s.posts} posts` : "no one way"} />
          </div>
          {s.recurring.length > 0 && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Words you come back to</span>
              <div className={styles.chipRow}>
                {s.recurring.slice(0, 8).map((w) => (
                  <Chip key={w} onClick={() => !profile.voice.use.includes(w) && voice({ use: [...profile.voice.use, w] })} title="Add to words to use">
                    {w}
                  </Chip>
                ))}
              </div>
            </div>
          )}
          <ul className={styles.noteList}>
            {proposal.unread.map((u) => (
              <li key={u}>{u}</li>
            ))}
            {proposal.source === "heuristics" && proposal.notes[0] && <li>{proposal.notes[0]}</li>}
            {proposal.charge && <li>{proposal.charge.charged > 0 ? `The AI read cost ${proposal.charge.charged} credit${proposal.charge.charged === 1 ? "" : "s"}.` : "The AI did not answer, so nothing was charged."}</li>}
            <li>Nothing is saved until you press save.</li>
          </ul>
        </Card>
      </aside>
    </div>
  );
}

function Signal({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className={shell.stat}>
      <span className={shell.statLabel}>{label}</span>
      <span className={shell.statValue}>{value}</span>
      <span className={shell.statHint}>{hint}</span>
    </div>
  );
}
