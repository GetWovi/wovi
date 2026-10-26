"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { deleteBrain, makeDefault, restoreVersion, saveBrain, uploadImage } from "@/app/brand-brain/actions";
import { FilePick } from "@/components/builder/FilePick";
import { RightsCheck } from "@/components/safety/RightsCheck";
import { ago } from "@/components/builder/labels";
import shell from "@/components/builder/Builder.module.css";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { BRAND_BRAIN_PART_LABELS, type BrandBrainPart } from "@/lib/agents/catalog";
import type { HistoryEntry } from "@/lib/brand/brains";
import { BRAND_LIMITS, FIELD_LABELS, type BrainBody, type MoodItem, type MoodKind } from "@/lib/brand/types";
import { brandFit, describeFlag } from "@/lib/runs/brand-fit";
import styles from "./Brain.module.css";
import { Issues, LinesField, PlatformsField, ToneField, WordsField } from "./fields";

type Common = { csrf: string; id: string; version: number; body: BrainBody; editable: boolean };
type Problem = { error: string; issues?: string[] } | null;

/** Saves a change as the next version, then reloads the page so every panel shows it. */
function useSave({ csrf, id, version }: Pick<Common, "csrf" | "id" | "version">) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  async function save(changes: Partial<BrainBody>, note?: string) {
    setBusy(true);
    setProblem(null);
    try {
      const r = await saveBrain(csrf, id, changes, { note, baseVersion: version });
      if (!r.ok) {
        if (r.code === "no_change") toast({ tone: "info", title: r.error });
        else setProblem(r);
        return false;
      }
      toast({ tone: "success", title: `Saved as version ${r.value.version}` });
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }
  return { save, busy, problem };
}

function SaveBar({ busy, editable, onSave, label = "Save" }: { busy: boolean; editable: boolean; onSave: (note: string) => void; label?: string }) {
  const [note, setNote] = useState("");
  if (!editable) return <p className={shell.hint}>You can read this Brand Brain. Editors, admins and owners can change it.</p>;
  return (
    <div className={styles.saveBar}>
      <Input label="What changed (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={BRAND_LIMITS.versionNote} placeholder="Shown in the history" />
      <Button onClick={() => onSave(note)} loading={busy} leading={<Icon name="check" size={18} />}>
        {label}
      </Button>
    </div>
  );
}

/** What agents get, as the engine fills it in. Rendered on the server from the saved version. */
function AgentPreview({ preview, parts }: { preview: Record<string, string>; parts: BrandBrainPart[] }) {
  return (
    <Card className={shell.section}>
      <h3>What agents read</h3>
      <p className={shell.sectionNote}>The saved version, the way an agent gets it. Only agents that ask for a part get it.</p>
      {parts.map((p) => (
        <div key={p} className={shell.stackTight}>
          <span className={styles.fieldLabel}>{BRAND_BRAIN_PART_LABELS[p]}</span>
          <pre className={shell.pre} style={{ maxHeight: "none" }}>
            {preview[p]}
          </pre>
        </div>
      ))}
    </Card>
  );
}

/* ---------- Voice ---------- */

export function VoicePanel(props: Common & { preview: Record<string, string> }) {
  const { body, editable } = props;
  const [b, setB] = useState(body);
  const { save, busy, problem } = useSave(props);
  const voice = (v: Partial<BrainBody["voice"]>) => setB({ ...b, voice: { ...b.voice, ...v } });
  return (
    <div className={styles.split}>
      <fieldset disabled={!editable} className={shell.stack} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <Card title="Basics" className={shell.section}>
          <div className={shell.fieldGrid}>
            <Input label="Name" value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} maxLength={BRAND_LIMITS.name} />
            <Input label="Niche" value={b.niche} onChange={(e) => setB({ ...b, niche: e.target.value })} maxLength={BRAND_LIMITS.niche} placeholder="Small bakery in Leeds" />
          </div>
          <PlatformsField value={b.platforms} onChange={(platforms) => setB({ ...b, platforms })} />
          <Textarea label="The idea" hint="The standing idea behind the brand. A run can bring its own idea instead." rows={2} value={b.idea} onChange={(e) => setB({ ...b, idea: e.target.value })} maxLength={BRAND_LIMITS.idea} />
        </Card>
        <Card title="Voice" className={shell.section}>
          <Textarea label="How it sounds" rows={3} value={b.voice.description} onChange={(e) => voice({ description: e.target.value })} maxLength={BRAND_LIMITS.voiceDescription} placeholder="Warm, dry humour, short sentences." />
          <ToneField value={b.voice.tone} onChange={(tone) => voice({ tone })} />
          <div className={styles.halves}>
            <WordsField label="Words to use" value={b.voice.use} onChange={(use) => voice({ use })} />
            <WordsField label="Words to avoid" help="The brand-fit check flags these." value={b.voice.avoid} onChange={(avoid) => voice({ avoid })} />
          </div>
          <LinesField label="Lines that sound right" help="Drafts are compared with these." value={b.voice.samples} onChange={(samples) => voice({ samples })} max={BRAND_LIMITS.sampleLines} />
          <WordsField label="Topics" value={b.topics} onChange={(topics) => setB({ ...b, topics })} max={BRAND_LIMITS.topics} />
        </Card>
        <Issues error={problem?.error ?? null} issues={problem?.issues} />
        <SaveBar busy={busy} editable={editable} onSave={(note) => save({ name: b.name, niche: b.niche, platforms: b.platforms, idea: b.idea, voice: b.voice, topics: b.topics }, note)} />
      </fieldset>
      <aside className={styles.side}>
        <AgentPreview preview={props.preview} parts={["voice", "idea"]} />
      </aside>
    </div>
  );
}

/* ---------- References ---------- */

export function ReferencesPanel(props: Common & { preview: Record<string, string> }) {
  const { body, editable } = props;
  const { save, busy, problem } = useSave(props);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  async function add() {
    const ok = await save({ references: [...body.references, { id: "", text, url: url || null, note }] }, "Added a reference");
    if (ok) {
      setText("");
      setUrl("");
      setNote("");
    }
  }
  return (
    <div className={styles.split}>
      <div className={shell.stack}>
        {editable && (
          <Card title="Add a reference" className={shell.section}>
            <p className={shell.sectionNote}>A past post that worked. Paste the text, add the link, or both, and say why it works.</p>
            <Textarea label="The post" rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={BRAND_LIMITS.referenceText} />
            <div className={shell.fieldGrid}>
              <Input label="Link (optional)" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
              <Input label="Why it works (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={BRAND_LIMITS.referenceNote} placeholder="Owns the mistake, then teaches" />
            </div>
            <Issues error={problem?.error ?? null} issues={problem?.issues} />
            <div className={shell.actions}>
              <Button onClick={add} loading={busy} disabled={!text.trim() && !url.trim()} leading={<Icon name="plus" size={18} />}>
                Add reference
              </Button>
              <span className={shell.hint}>
                {body.references.length} of {BRAND_LIMITS.references}
              </span>
            </div>
          </Card>
        )}
        {body.references.length === 0 ? (
          <EmptyState title="No references yet" description="Add posts that did well. Agents that read references learn what good looks like for this brand." />
        ) : (
          <div className={styles.refs}>
            {body.references.map((r) => (
              <div key={r.id} className={styles.ref}>
                <div className={styles.refBody}>
                  {r.text && <div className={styles.refText}>{r.text}</div>}
                  {r.url && (
                    <a className={styles.refLink} href={r.url} target="_blank" rel="noreferrer">
                      {r.url}
                    </a>
                  )}
                  <div className={styles.refNote}>
                    <b>Why it works: </b>
                    {r.note || "No note yet."}
                  </div>
                </div>
                {editable && (
                  <button type="button" className={[shell.iconButton, shell.iconButtonDanger].join(" ")} aria-label="Remove reference" onClick={() => save({ references: body.references.filter((x) => x.id !== r.id) }, "Removed a reference")}>
                    <Icon name="close" size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <aside className={styles.side}>
        <AgentPreview preview={props.preview} parts={["references"]} />
      </aside>
    </div>
  );
}

/* ---------- Mood board ---------- */

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function MoodPanel(props: Common & { workspaceId: string }) {
  const { body, editable, csrf, workspaceId } = props;
  const { save, busy, problem } = useSave(props);
  const [kind, setKind] = useState<MoodKind>("image");
  const [note, setNote] = useState("");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [color, setColor] = useState("#FF5A1F");
  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  /** Phase 18: an image is only stored once its rights are confirmed. */
  const [rights, setRights] = useState(false);

  async function add() {
    setUploadError(null);
    const item: MoodItem = { id: "", kind, note, url: null, text: null, color: null, file: null };
    if (kind === "image") {
      if (!file) return setUploadError("Pick an image first.");
      if (!rights) return setUploadError("Tick the box to confirm the image is yours or you may use it.");
      const fd = new FormData();
      fd.set("file", file);
      fd.set("rights", "yes");
      const up = await uploadImage(csrf, fd);
      if (!up.ok) return setUploadError(up.error);
      item.file = up.value;
    } else if (kind === "link") item.url = url;
    else if (kind === "text") item.text = text;
    else item.color = color;
    if (await save({ moodBoard: [...body.moodBoard, item] }, `Added ${kind === "image" ? "an image" : `a ${kind}`} to the mood board`)) {
      setNote("");
      setUrl("");
      setText("");
      setFile(null);
      setRights(false);
    }
  }

  return (
    <div className={styles.split}>
      <div className={shell.stack}>
        {body.moodBoard.length === 0 ? (
          <EmptyState title="The board is empty" description="Add images, links, lines and colours that show the look. Each one takes a short note on why." />
        ) : (
          <div className={shell.board}>
            {body.moodBoard.map((item) => (
              <div key={item.id} className={shell.boardItem}>
                {item.kind === "image" && item.file && (
                  <div className={shell.boardMedia}>
                    {/* Plain img: uploads are served by our own route, to members only. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/brand-brain/files/${workspaceId}/${item.file.id}`} alt={item.note || item.file.name} loading="lazy" />
                  </div>
                )}
                {item.kind === "swatch" && (
                  <div className={shell.boardSwatch} style={{ background: item.color ?? undefined }}>
                    <span className={shell.boardSwatchHex}>{item.color}</span>
                  </div>
                )}
                {item.kind === "text" && (
                  <div className={shell.boardText}>
                    <span className={shell.boardTextQuote}>{item.text}</span>
                  </div>
                )}
                {item.kind === "link" && item.url && (
                  <a className={shell.boardLink} href={item.url} target="_blank" rel="noreferrer">
                    <span className={shell.boardLinkHost}>{host(item.url)}</span>
                    <span className={shell.boardLinkUrl}>{item.url}</span>
                  </a>
                )}
                <div className={shell.boardFoot}>
                  <div>
                    <div className={shell.boardKind}>{item.kind === "swatch" ? "colour" : item.kind}</div>
                    <div className={shell.boardNote}>{item.note || "No note"}</div>
                  </div>
                  {editable && (
                    <button
                      type="button"
                      className={[shell.iconButton, shell.iconButtonDanger].join(" ")}
                      onClick={() => save({ moodBoard: body.moodBoard.filter((m) => m.id !== item.id) }, "Removed from the mood board")}
                      aria-label="Remove from the board"
                    >
                      <Icon name="close" size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <aside className={styles.side}>
        {editable ? (
          <Card title="Add to the mood board" className={shell.section}>
            <p className={shell.sectionNote}>Images, links, lines and colours. Agents that read the mood board get each one with its note.</p>
            <Tabs
              variant="pill"
              value={kind}
              onChange={(id) => setKind(id as MoodKind)}
              items={[
                { id: "image", label: "Image" },
                { id: "link", label: "Link" },
                { id: "text", label: "Text" },
                { id: "swatch", label: "Colour" },
              ]}
            />
            <div className={shell.stack}>
              {kind === "image" && (
                <div className={shell.upload}>
                  <span className={shell.uploadLabel}>Image</span>
                  <div className={shell.uploadRow}>
                    <FilePick label="Choose an image" accept="image/png,image/jpeg,image/webp,image/gif" fileName={file?.name} onFiles={(list) => setFile(list?.[0] ?? null)} />
                  </div>
                  <span className={shell.hint}>PNG, JPEG, WebP or GIF up to 8 MB.</span>
                  <RightsCheck checked={rights} onChange={setRights} />
                </div>
              )}
              {kind === "link" && <Input label="Link" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />}
              {kind === "text" && <Textarea label="Text" rows={2} value={text} onChange={(e) => setText(e.target.value)} maxLength={BRAND_LIMITS.moodText} placeholder="flour dust in morning light" />}
              {kind === "swatch" && (
                <div className={shell.upload}>
                  <span className={shell.uploadLabel}>Colour</span>
                  <div className={shell.swatchField}>
                    <input type="color" aria-label="Pick a colour" value={color} onChange={(e) => setColor(e.target.value.toUpperCase())} className={shell.swatchPick} />
                    <Input aria-label="Hex" value={color} onChange={(e) => setColor(e.target.value)} className={shell.mono} maxLength={7} />
                  </div>
                </div>
              )}
              <Input label="Why it is here" value={note} onChange={(e) => setNote(e.target.value)} maxLength={BRAND_LIMITS.moodNote} placeholder="One short note" />
            </div>
            <Issues error={uploadError ?? problem?.error ?? null} issues={uploadError ? undefined : problem?.issues} />
            <div className={shell.actions}>
              <Button onClick={add} loading={busy} leading={<Icon name="plus" size={18} />}>
                Add to the board
              </Button>
              <span className={shell.hint}>
                {body.moodBoard.length} of {BRAND_LIMITS.moodItems}
              </span>
            </div>
          </Card>
        ) : (
          <p className={shell.hint}>You can read this Brand Brain. Editors, admins and owners can change it.</p>
        )}
      </aside>
    </div>
  );
}

/* ---------- Dos and don'ts, with a brand-fit check ---------- */

export function RulesPanel(props: Common & { draft?: string }) {
  const { body, editable } = props;
  const [dos, setDos] = useState(body.dos);
  const [donts, setDonts] = useState(body.donts);
  const [draft, setDraft] = useState(props.draft ?? "");
  const { save, busy, problem } = useSave(props);
  const lines = draft
    .split(/\n{2,}/)
    .map((l) => l.trim())
    .filter(Boolean);
  const fit = lines.length ? brandFit(lines, { dos_donts: { dos, donts, bannedWords: [] }, voiceDetail: { tone: body.voice.tone, use: body.voice.use, avoid: body.voice.avoid, samples: body.voice.samples, topics: body.topics } }) : null;
  return (
    <div className={styles.split}>
      <fieldset disabled={!editable} className={shell.stack} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <Card title="Dos and don'ts" className={shell.section}>
          <p className={shell.sectionNote}>Every agent that reads the rules gets both lists. Write a don&apos;t plainly, like No hashtags or Never say &quot;cheap&quot;: drafts that break a line like that are flagged.</p>
          <div className={styles.halves}>
            <LinesField label="Do" value={dos} onChange={setDos} placeholder="Add a do" />
            <LinesField label="Don't" value={donts} onChange={setDonts} placeholder="Add a don't" />
          </div>
          <Issues error={problem?.error ?? null} issues={problem?.issues} />
          <SaveBar busy={busy} editable={editable} onSave={(note) => save({ dos, donts }, note)} />
        </Card>
      </fieldset>
      <aside className={styles.side}>
        <Card className={shell.section}>
          <h3>Check a draft</h3>
          <p className={shell.sectionNote}>The same brand-fit check agents run: words to avoid, the don&apos;ts above, and how close it sits to the voice&apos;s sample lines.</p>
          <Textarea aria-label="A draft to check" rows={6} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Paste a draft. Leave an empty line between posts." />
          {fit && (
            <>
              <div className={styles.fitHead}>
                <span className={[styles.fitScore, fit.score < 60 ? styles.fitLow : ""].join(" ")}>{fit.score}</span>
                <div className={shell.stackTight}>
                  <b>{fit.flags.length ? `Breaks ${fit.flags.length} rule${fit.flags.length === 1 ? "" : "s"}` : "Keeps every rule"}</b>
                  <span className={shell.hint}>{fit.closest ? `Closest sample line: "${fit.closest}"` : "Add sample lines to the voice to compare with."}</span>
                </div>
              </div>
              {fit.flags.length > 0 && (
                <div className={styles.flags}>
                  {fit.flags.map((f, i) => (
                    <span key={i} className={styles.flag}>
                      <Icon name="warning" size={16} /> {describeFlag(f)}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </Card>
      </aside>
    </div>
  );
}

/* ---------- History ---------- */

export function HistoryPanel({ csrf, id, entries, editable, now }: { csrf: string; id: string; entries: HistoryEntry[]; editable: boolean; now: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  async function restore() {
    if (confirm === null) return;
    setBusy(true);
    const r = await restoreVersion(csrf, id, confirm);
    setBusy(false);
    setConfirm(null);
    if (!r.ok) return toast({ tone: "warning", title: r.error });
    toast({ tone: "success", title: `Saved as version ${r.value.version}` });
    router.refresh();
  }
  return (
    <div className={styles.history}>
      {entries.map((e, i) => (
        <Card key={e.version}>
          <div className={styles.versionHead}>
            <span className={[styles.versionNo, e.current ? styles.versionCurrent : ""].join(" ")}>v{e.version}</span>
            <div className={styles.versionMain}>
              <b>{e.note}</b>
              <span>
                {e.by} · {ago(e.at, now)}
              </span>
              <div className={styles.chipRow}>
                {e.current && <Tag tone="blaze">Current</Tag>}
                {(i === entries.length - 1 ? [] : e.changed).map((f) => (
                  <Tag key={f} tone="cobalt">
                    {FIELD_LABELS[f]}
                  </Tag>
                ))}
                {i === entries.length - 1 && <Tag>First version</Tag>}
              </div>
            </div>
            {editable && !e.current ? (
              <Button variant="ghost" onClick={() => setConfirm(e.version)} leading={<Icon name="clock" size={18} />}>
                Restore
              </Button>
            ) : (
              <span />
            )}
          </div>
          {e.diff.length > 0 && (
            <details className={styles.changes} open={i === 0}>
              <summary>What changed</summary>
              <div className={styles.diffBlock}>
                {e.diff.map((d) => (
                  <div key={d.field} className={styles.diffField}>
                    <b>{d.label}</b>
                    <div className={shell.diffLines} style={{ gridColumn: "auto" }}>
                      {d.lines
                        .filter((l) => l.type !== "same" || d.lines.length <= 6)
                        .map((l, j) => (
                          <span key={j} className={[shell.diffLine, l.type === "add" ? shell.diffAdd : l.type === "remove" ? shell.diffRemove : shell.diffSame].join(" ")}>
                            {l.type === "add" ? "+ " : l.type === "remove" ? "- " : "  "}
                            {l.text || " "}
                          </span>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </Card>
      ))}
      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={`Restore version ${confirm}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button onClick={restore} loading={busy}>
              Restore as a new version
            </Button>
          </>
        }
      >
        <p>Its content is saved as a new version on top. Nothing in the history is lost, and agents use it from their next run.</p>
      </Modal>
    </div>
  );
}

/* ---------- Head actions ---------- */

export function BrainActions({ csrf, id, name, isDefault, children }: { csrf: string; id: string; name: string; isDefault: boolean; children?: ReactNode }) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  async function setDefault() {
    const r = await makeDefault(csrf, id);
    if (!r.ok) return toast({ tone: "warning", title: r.error });
    toast({ tone: "success", title: `${name} is now the default` });
    router.refresh();
  }
  async function remove() {
    setBusy(true);
    const r = await deleteBrain(csrf, id);
    setBusy(false);
    if (!r.ok) return toast({ tone: "warning", title: r.error });
    router.push("/brand-brain");
  }
  return (
    <div className={shell.actions}>
      {children}
      {!isDefault && (
        <Button variant="ghost" onClick={setDefault} leading={<Icon name="check" size={18} />}>
          Make default
        </Button>
      )}
      <span className={styles.actionsRule} aria-hidden="true" />
      <Button variant="ghost" size="sm" className={styles.deleteAction} onClick={() => setConfirm(true)} leading={<Icon name="close" size={16} />}>
        Delete
      </Button>
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Delete ${name}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Keep it
            </Button>
            <Button onClick={remove} loading={busy}>
              Delete for good
            </Button>
          </>
        }
      >
        <p>Its versions go with it. Runs that used it keep their record. Agents use the workspace default from then on.</p>
      </Modal>
    </div>
  );
}
