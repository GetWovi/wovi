"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createAgent, draftAgent } from "@/app/builder/actions";
import { Mascot } from "@/components/brand/Mascot";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Textarea } from "@/components/ui/Field";
import type { DraftResult } from "@/lib/builder/drafter";
import styles from "./Builder.module.css";
import { DraftPreview } from "./DraftPreview";

const EXAMPLES = [
  "writes 10 scroll-stopping hooks for TikTok from a product idea, punchy, no clickbait",
  "writes the caption for Reels or Shorts, two variants, no hashtags",
  "brainstorms 20 post ideas for a small bakery, playful, always include a question",
  "finds trending formats this week for a niche on TikTok and says why each works",
];

export function CreateByPrompt({ csrf, initial }: { csrf: string; initial?: string }) {
  const router = useRouter();
  const [description, setDescription] = useState(initial ?? "");
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doDraft() {
    setError(null);
    setDrafting(true);
    setDraft(null);
    try {
      const r = await draftAgent(csrf, description);
      if (!r.ok) return setError(r.error);
      setDraft(r.value);
    } finally {
      setDrafting(false);
    }
  }

  async function open() {
    if (!draft) return;
    setError(null);
    setOpening(true);
    try {
      const r = await createAgent(csrf, draft.spec);
      if (!r.ok) return setError([r.error, ...(r.issues ?? [])].join(" "));
      router.push(`/builder/agents/${r.value.id}`);
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className={styles.columns}>
      <Card padding="lg" className={styles.stack}>
        <form
          className={styles.stack}
          onSubmit={(e) => {
            e.preventDefault();
            void doDraft();
          }}
        >
          <Textarea
            label="What does the agent do?"
            name="description"
            rows={6}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="One job. Say what it makes, how many, for which platforms, from what, and the tone."
            hint="Plain words are enough. The builder reads the shape of the job out of them."
            maxLength={2000}
            required
            error={error ?? undefined}
          />
          <div className={styles.actions}>
            <Button type="submit" loading={drafting} disabled={description.trim().length < 3}>
              Draft the agent
            </Button>
            {draft && (
              <Button variant="ghost" onClick={doDraft} disabled={drafting}>
                Draft again
              </Button>
            )}
          </div>
        </form>
        <div className={styles.examples}>
          <span className={styles.exampleLabel}>Or start from one of these</span>
          <div className={styles.chips}>
            {EXAMPLES.map((ex) => (
              <Chip key={ex} selected={description === ex} onClick={() => setDescription(ex)}>
                {ex.split(" ").slice(0, 4).join(" ")}...
              </Chip>
            ))}
          </div>
        </div>
      </Card>

      {drafting ? (
        <div className={styles.working} aria-live="polite">
          <Mascot pose="move" size={140} />
          <h3>Drafting</h3>
          <p className={styles.workingNote}>Reading the job, choosing the inputs and the output shape, writing the instructions.</p>
        </div>
      ) : draft ? (
        <Card padding="lg" className={styles.stack}>
          <DraftPreview spec={draft.spec} notes={draft.notes} showModel />
          <div className={styles.actions}>
            <Button onClick={open} loading={opening}>
              Open in the editor
            </Button>
            <span className={styles.hint}>Saves it as a draft in the WOVI workspace. Nothing goes live until you publish.</span>
          </div>
        </Card>
      ) : (
        <EmptyState title="The draft shows up here" description="Name, job, inputs, output shape, Brand Brain reads, tools, guardrails and the instructions. You can change all of it in the editor." />
      )}
    </div>
  );
}
