"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { compareVersions, rollbackAgent } from "@/app/builder/actions";
import { Mascot } from "@/components/brand/Mascot";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Chip";
import { Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import type { AgentSpec } from "@/lib/agents/spec";
import type { VersionCompare, VersionEntry } from "@/lib/builder/versions";
import styles from "./Builder.module.css";
import { ago, duration, money, percent } from "./labels";
import { ScoreRow } from "./ScoreRow";

/** Version history, compare two versions, roll back. */
export function Versions({ csrf, spec, history, now, initialTab = "history" }: { csrf: string; spec: AgentSpec; history: VersionEntry[]; now: number; initialTab?: "history" | "compare" }) {
  const router = useRouter();
  const { toast } = useToast();
  const newest = [...history].reverse();
  const current = history.find((v) => v.current)?.version ?? spec.version;
  const previous = newest.find((v) => v.version !== current)?.version ?? current;
  const [tab, setTab] = useState<"history" | "compare">(initialTab);
  const [a, setA] = useState(previous);
  const [b, setB] = useState(current);
  const [compare, setCompare] = useState<VersionCompare | null>(null);
  const [confirm, setConfirm] = useState<VersionEntry | null>(null);
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    if (tab !== "compare") return;
    let stale = false;
    void compareVersions(csrf, spec.id, a, b).then((r) => {
      if (stale) return;
      if (r.ok) setCompare(r.value);
      else toast({ tone: "warning", title: r.error });
    });
    return () => {
      stale = true;
    };
  }, [tab, a, b, csrf, spec.id, toast]);

  async function rollback() {
    if (!confirm) return;
    setRolling(true);
    try {
      const r = await rollbackAgent(csrf, spec.id, confirm.version);
      if (!r.ok) return toast({ tone: "warning", title: r.error });
      toast({ tone: "success", title: `Version ${r.value.version} is current again`, description: "Nothing was deleted. The next save still goes above the newest version." });
      setConfirm(null);
      router.refresh();
    } finally {
      setRolling(false);
    }
  }

  const options = newest.map((v) => ({ value: v.version, label: `v${v.version}${v.current ? " (current)" : ""}${v.note ? `: ${v.note}` : ""}` }));

  return (
    <>
      <Tabs variant="pill" value={tab} onChange={(id) => setTab(id as "history" | "compare")} items={[{ id: "history", label: "History", count: history.length }, { id: "compare", label: "Compare" }]} />

      {tab === "history" && (
        <div className={styles.versionList}>
          {newest.map((v) => (
            <Card key={v.version} padding="sm" className={styles.version} variant={v.current ? "raised" : "outlined"}>
              <div className={styles.versionNo}>
                <span>v{v.version}</span>
                <small>{ago(v.createdAt, now)}</small>
              </div>
              <div className={styles.versionText}>
                <span className={styles.versionTop}>
                  {v.current && <Tag tone="blaze">current</Tag>}
                  <span className={styles.versionNote}>{v.note ?? "No change note"}</span>
                </span>
                <span className={styles.versionBy}>Saved by {v.byName ?? "a script"}</span>
              </div>
              <div className={styles.versionCard}>
                {v.scorecard.runs === 0 ? (
                  <span>Not run yet</span>
                ) : (
                  <>
                    <Badge score={v.scorecard.score ?? 0} label="Score" size="sm" />
                    <span>
                      <b>{percent(v.scorecard.passRate)}</b> pass
                    </span>
                    <span>
                      <b>{v.scorecard.runs}</b> run{v.scorecard.runs === 1 ? "" : "s"}
                    </span>
                    <span>
                      <b>{money(v.scorecard.avgCostMicroUsd ?? 0)}</b> avg
                    </span>
                    <span>
                      <b>{duration(v.scorecard.avgMs)}</b> avg
                    </span>
                  </>
                )}
              </div>
              <div className={[styles.actions, styles.versionActions].join(" ")}>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setA(v.current ? previous : v.version);
                    setB(current);
                    setTab("compare");
                  }}
                >
                  Compare
                </Button>
                {!v.current && (
                  <Button size="sm" variant="secondary" onClick={() => setConfirm(v)}>
                    Roll back
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "compare" && (
        <div className={styles.stack}>
          <Card className={styles.section}>
            <div className={styles.comparePick}>
              <Select label="From" value={a} onChange={(e) => setA(e.target.value)} options={options} />
              <Select label="To" value={b} onChange={(e) => setB(e.target.value)} options={options} />
              <span className={styles.hint}>{compare ? (compare.diff.changed.length ? `${compare.diff.changed.length} field${compare.diff.changed.length === 1 ? " differs" : "s differ"}.` : "Nothing differs.") : "Comparing"}</span>
            </div>
          </Card>
          {compare ? (
            <>
              <div className={styles.compareCards}>
                {[compare.a, compare.b].map((side, i) => (
                  <Card key={i} padding="sm" className={styles.compareCard} title={`v${side.spec.version}${side.info.current ? " (current)" : ""}`} actions={<span className={styles.hint}>{side.info.note ?? "No note"}</span>}>
                    <ScoreRow card={side.info.scorecard} compact />
                  </Card>
                ))}
              </div>
              <Card className={styles.section} title="What changed">
                <div className={styles.diff}>
                  {compare.diff.fields.map((f) => (
                    <div key={f.field} className={[styles.diffRow, f.changed ? styles.diffRowChanged : ""].filter(Boolean).join(" ")}>
                      <span className={styles.diffLabel}>
                        {f.label}
                        {f.changed && <Tag tone="blaze">changed</Tag>}
                      </span>
                      {f.field === "instructions" || (f.changed && f.lines.length > 6) ? (
                        <div className={styles.diffLines}>
                          {f.lines.map((l, k) => (
                            <span key={k} className={[styles.diffLine, l.type === "add" ? styles.diffAdd : l.type === "remove" ? styles.diffRemove : styles.diffSame].join(" ")}>
                              {l.type === "add" ? "+ " : l.type === "remove" ? "- " : "  "}
                              {l.text || " "}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <>
                          <span className={styles.diffCol}>{f.a.join("\n")}</span>
                          <span className={styles.diffCol}>{f.b.join("\n")}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            </>
          ) : (
            <div className={styles.working}>
              <Mascot pose="move" size={100} />
              <h3>Comparing</h3>
            </div>
          )}
        </div>
      )}

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm ? `Roll back to v${confirm.version}?` : ""}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)} disabled={rolling}>
              Keep v{current}
            </Button>
            <Button onClick={rollback} loading={rolling}>
              Roll back
            </Button>
          </>
        }
      >
        {confirm && (
          <div className={styles.stackTight}>
            <p>
              Version {confirm.version} becomes current again and is what runs{spec.status === "live" ? " live, right away" : ""}. Version {current} stays saved; nothing is deleted.
            </p>
            <p className={styles.hint}>
              {confirm.note ? `“${confirm.note}”, saved by ${confirm.byName ?? "a script"} ${ago(confirm.createdAt, now)}.` : `Saved by ${confirm.byName ?? "a script"} ${ago(confirm.createdAt, now)}.`}
              {confirm.scorecard.runs ? ` Scored ${confirm.scorecard.score} over ${confirm.scorecard.runs} run${confirm.scorecard.runs === 1 ? "" : "s"}.` : " Not run on the bench yet."}
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
