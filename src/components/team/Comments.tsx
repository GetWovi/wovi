"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import { clientComment } from "@/app/client/actions";
import { addComment } from "@/app/app/review/actions";
import styles from "@/components/app/App.module.css";
import { ago } from "@/components/builder/labels";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import type { Thread } from "@/lib/team/team";
import type { CommentRow } from "@/lib/team/types";
import t from "./Team.module.css";

type Member = { userId: string; handle: string; name: string };

export type CommentsProps = {
  id: string;
  threads: Thread[];
  members: Member[];
  /** The person writing: left out of the mention chips. */
  selfId?: string;
  now: number;
  as: { kind: "member"; csrf: string; canComment: boolean; hasClient: boolean } | { kind: "client"; token: string };
};

/** A comment's text with @handles of members picked out. */
function Body({ text, members }: { text: string; members: Member[] }) {
  const known = new Set(members.map((m) => m.handle));
  const parts = text.split(/(@[a-z0-9._-]+)/gi);
  return (
    <p className={t.commentText}>
      {parts.map((part, i) =>
        part.startsWith("@") && known.has(part.slice(1).toLowerCase().replace(/\.+$/, "")) ? (
          <span key={i} className={t.mention}>
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </p>
  );
}

function One({ c, members, now, onReply }: { c: CommentRow; members: Member[]; now: number; onReply?: () => void }) {
  const client = c.authorId.startsWith("link:");
  return (
    <div className={t.comment}>
      <Avatar name={c.authorName} size={32} />
      <div className={t.commentBody}>
        <div className={t.commentHead}>
          <b>{c.authorName}</b>
          {client && <span className={t.fromClient}>Client</span>}
          {c.internal && <span className={t.internal}>Team only</span>}
          <span className={styles.fine}>{ago(c.createdAt, now)}</span>
        </div>
        <Body text={c.body} members={members} />
        {onReply && (
          <button type="button" className={t.replyLink} onClick={onReply}>
            Reply
          </button>
        )}
      </div>
    </div>
  );
}

/** Threads of comments, one level of answers, @mentions of members, and team-only notes on client work. */
export function Comments({ id, threads, members, selfId, now, as }: CommentsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<Thread | null>(null);
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const canWrite = as.kind === "client" || as.canComment;
  const total = threads.reduce((n, th) => n + 1 + th.replies.length, 0);

  function mention(handle: string) {
    setBody((b) => `${b}${b && !b.endsWith(" ") ? " " : ""}@${handle} `);
  }

  async function post() {
    if (!body.trim()) return;
    setBusy(true);
    const r = as.kind === "member" ? await addComment(as.csrf, id, body, replyTo?.id ?? null, internal) : await clientComment(as.token, id, body, replyTo?.id ?? null);
    setBusy(false);
    if (!r.ok) return toast({ tone: "warning", title: r.error });
    setBody("");
    setReplyTo(null);
    router.refresh();
  }

  return (
    <section className={[styles.panel, styles.panelTight, t.talk].join(" ")} aria-label="Comments">
      <div className={t.sideHead}>
        <h3>Comments</h3>
        <span className={styles.count}>{total}</span>
      </div>
      {threads.length > 0 ? (
        <div className={t.threads}>
          {threads.map((th) => (
            <div key={th.id} className={t.thread}>
              <One c={th} members={members} now={now} onReply={canWrite ? () => setReplyTo(th) : undefined} />
              {th.replies.length > 0 && (
                <div className={t.replies}>
                  {th.replies.map((r) => (
                    <One key={r.id} c={r} members={members} now={now} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className={[styles.muted, styles.small].join(" ")}>{as.kind === "member" ? "No comments yet. Ask a teammate with @ and their name." : "No comments yet. Say what you think."}</p>
      )}
      {canWrite && (
        <div className={t.composer}>
          {replyTo && (
            <span className={t.mentionChips}>
              <Icon name="chat" size={16} /> Answering {replyTo.authorName}
              <button type="button" className={t.replyLink} onClick={() => setReplyTo(null)}>
                Cancel
              </button>
            </span>
          )}
          <Textarea label={replyTo ? "Your answer" : "Add a comment"} value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={2000} placeholder={as.kind === "member" ? "The third hook reads best. @ed can you cut the first line?" : "Love the second one. Can it mention Saturday?"} />
          <div className={t.composerFoot}>
            {as.kind === "member" && members.some((m) => m.userId !== selfId) ? (
              <span className={t.mentionChips}>
                Mention
                {members.filter((m) => m.userId !== selfId).slice(0, 6).map((m) => (
                  <button key={m.userId} type="button" className={t.mentionChip} onClick={() => mention(m.handle)} title={m.name}>
                    @{m.handle}
                  </button>
                ))}
              </span>
            ) : (
              <span />
            )}
            <span className={styles.actions}>
              {as.kind === "member" && as.hasClient && (
                <label className={t.check}>
                  <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                  Team only
                </label>
              )}
              <Button size="sm" onClick={post} loading={busy} disabled={!body.trim()} leading={<Icon name="chat" size={16} />}>
                {replyTo ? "Answer" : "Comment"}
              </Button>
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
