"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addBoardItem, removeBoardItem, uploadFile } from "@/app/builder/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { BUILDER_LIMITS, type BoardItem, type BoardKind } from "@/lib/builder/types";
import styles from "./Builder.module.css";
import { FilePick } from "./FilePick";

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function BoardPanel({ csrf, agentId, items }: { csrf: string; agentId: string; items: BoardItem[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [kind, setKind] = useState<BoardKind>("image");
  const [note, setNote] = useState("");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [color, setColor] = useState("#FF5A1F");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      let fileId: string | undefined;
      if (kind === "image") {
        if (!file) return setError("Pick an image first.");
        const fd = new FormData();
        fd.set("kind", "image");
        fd.set("file", file);
        const up = await uploadFile(csrf, fd);
        if (!up.ok) return setError(up.error);
        fileId = up.value.id;
      }
      const r = await addBoardItem(csrf, agentId, { kind, note, url, text, color, fileId });
      if (!r.ok) return setError(r.error);
      toast({ tone: "success", title: "Added to the board" });
      setNote("");
      setUrl("");
      setText("");
      setFile(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const r = await removeBoardItem(csrf, agentId, id);
    if (!r.ok) return toast({ tone: "warning", title: r.error });
    router.refresh();
  }

  return (
    <div className={styles.stack}>
      <Card title="Add a reference" className={styles.section}>
        <p className={styles.sectionNote}>The board reaches the agent as extra Brand Brain material: images, text and swatches join the mood board, links join the references.</p>
        <form className={styles.stack} onSubmit={submit}>
          <Tabs
            variant="pill"
            value={kind}
            onChange={(id) => setKind(id as BoardKind)}
            items={[
              { id: "image", label: "Image" },
              { id: "link", label: "Link" },
              { id: "text", label: "Text" },
              { id: "swatch", label: "Swatch" },
            ]}
          />
          <div className={styles.fieldGrid}>
            {kind === "image" && (
              <div className={styles.upload}>
                <span className={styles.uploadLabel}>Image</span>
                <div className={styles.uploadRow}>
                  <FilePick label="Choose an image" accept="image/png,image/jpeg,image/webp,image/gif" fileName={file?.name} onFiles={(list) => setFile(list?.[0] ?? null)} />
                </div>
                <span className={styles.hint}>PNG, JPEG, WebP or GIF up to 8 MB.</span>
              </div>
            )}
            {kind === "link" && <Input label="Link" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" required />}
            {kind === "text" && <Textarea label="Text" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="A line, a rule, a phrase that nails it" maxLength={BUILDER_LIMITS.boardText} required />}
            {kind === "swatch" && (
              <div className={styles.upload}>
                <span className={styles.uploadLabel}>Colour</span>
                <div className={styles.swatchField}>
                  <input type="color" aria-label="Pick a colour" value={color} onChange={(e) => setColor(e.target.value.toUpperCase())} className={styles.swatchPick} />
                  <Input aria-label="Hex" value={color} onChange={(e) => setColor(e.target.value)} className={styles.mono} maxLength={7} />
                </div>
              </div>
            )}
            <Input label="Why it is here" value={note} onChange={(e) => setNote(e.target.value)} placeholder="One short note" maxLength={BUILDER_LIMITS.boardNote} />
          </div>
          {error && (
            <p role="alert" className={styles.fieldError}>
              <Icon name="warning" size={16} /> {error}
            </p>
          )}
          <div className={styles.actions}>
            <Button type="submit" loading={busy}>
              Add to the board
            </Button>
            <span className={styles.hint}>
              {items.length} of {BUILDER_LIMITS.boardItemsPerAgent}
            </span>
          </div>
        </form>
      </Card>

      {items.length === 0 ? (
        <EmptyState title="The board is empty" description="Add images, links, lines of text and colours the agent should lean on. Each one takes a short note on why." />
      ) : (
        <div className={styles.board}>
          {items.map((item) => (
            <div key={item.id} className={styles.boardItem}>
              {item.kind === "image" && item.file && (
                <div className={styles.boardMedia}>
                  {/* Plain img: builder uploads are served by our own route. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/builder/files/${item.file.id}`} alt={item.note || item.file.name} loading="lazy" />
                </div>
              )}
              {item.kind === "swatch" && (
                <div className={styles.boardSwatch} style={{ background: item.color ?? undefined }}>
                  <span className={styles.boardSwatchHex}>{item.color}</span>
                </div>
              )}
              {item.kind === "text" && (
                <div className={styles.boardText}>
                  <span className={styles.boardTextQuote}>{item.text}</span>
                </div>
              )}
              {item.kind === "link" && item.url && (
                <a className={styles.boardLink} href={item.url} target="_blank" rel="noreferrer">
                  <span className={styles.boardLinkHost}>{host(item.url)}</span>
                  <span className={styles.boardLinkUrl}>{item.url}</span>
                </a>
              )}
              <div className={styles.boardFoot}>
                <div>
                  <div className={styles.boardKind}>{item.kind}</div>
                  <div className={styles.boardNote}>{item.note || "No note"}</div>
                </div>
                <button type="button" className={[styles.iconButton, styles.iconButtonDanger].join(" ")} onClick={() => remove(item.id)} aria-label="Remove from the board">
                  <Icon name="close" size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
