import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import q from "@/components/quality/Quality.module.css";
import type { AgentSpec } from "@/lib/agents/spec";
import { gateDefaults, gateFor } from "@/lib/quality/data";
import type { VersionRollup } from "@/lib/quality/rollup";
import styles from "./Builder.module.css";
import r from "./QualityRollup.module.css";
import { ago } from "./labels";

const pct = (x: number | null) => (x === null ? "·" : `${Math.round(x * 100)}%`);
/** Whole rows of three, so the grid never ends on a gap. */
const shown = <T,>(xs: T[]): T[] => (xs.length <= 3 ? xs : xs.slice(0, xs.length - (xs.length % 3)));

/**
 * The builder's learning loop for one agent (phase 12): per version, what
 * the gate and people said. It only reads; tuning happens in the editor and
 * on the bench.
 */
export function QualityRollup({ spec, rollups, now }: { spec: AgentSpec; rollups: VersionRollup[]; now: number }) {
  const gate = gateFor(spec);
  const d = gateDefaults(spec.category);
  const current = rollups.find((v) => v.version === spec.version) ?? rollups[0] ?? null;
  const older = rollups.filter((v) => v !== current);
  const base = `/builder/agents/${spec.id}`;

  return (
    <div className={r.page}>
      <div className={r.gateLine}>
        <Icon name="sliders" size={20} />
        <span>
          Bar <b>{gate.minScore}</b>
          {spec.gate?.minScore === undefined ? ` (the default for ${spec.category})` : ""}, up to <b>{gate.maxRewrites}</b> rewrite{gate.maxRewrites === 1 ? "" : "s"}
          {spec.gate?.maxRewrites === undefined ? " (default)" : ""}. Change both on the bench, in Tuning. The default bar for this category is {d.minScore}.
        </span>
        <ButtonLink href={`${base}/bench`} size="sm" variant="secondary" leading={<Icon name="play" size={16} />}>
          Tune on the bench
        </ButtonLink>
      </div>

      {!current ? (
        <EmptyState title="Nothing to roll up yet" description="Runs, approvals, change requests and bench ratings for this agent show here once there are some." />
      ) : (
        <>
          <VersionBlock v={current} isCurrent={current.version === spec.version} now={now} />
          {older.length > 0 && (
            <Card title="Earlier versions" className={styles.section}>
              <div className={r.tableWrap}>
                <table className={r.table}>
                  <thead>
                    <tr>
                      <th>Version</th>
                      <th>Runs</th>
                      <th>Pass the bar</th>
                      <th>Avg quality</th>
                      <th>Approved</th>
                      <th>Changes asked</th>
                      <th>Fails most</th>
                    </tr>
                  </thead>
                  <tbody>
                    {older.map((v) => (
                      <tr key={v.version}>
                        <td className={styles.mono}>v{v.version}</td>
                        <td>{v.runs}</td>
                        <td>{pct(v.passRate)}</td>
                        <td>{v.avgScore ?? "·"}</td>
                        <td>{v.decisions.approved}</td>
                        <td>{v.decisions.changes}</td>
                        <td>{v.checks[0]?.label ?? "Nothing"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function VersionBlock({ v, isCurrent, now }: { v: VersionRollup; isCurrent: boolean; now: number }) {
  const decided = v.decisions.approved + v.decisions.changes + v.decisions.rejected;
  const rated = v.ratings.good + v.ratings.ok + v.ratings.bad;
  const tiles = [
    { label: "Pass the bar", value: pct(v.passRate), hint: v.scored ? `${Math.round((v.passRate ?? 0) * v.scored)} of ${v.scored} runs` : "No scored runs", main: true },
    { label: "Avg quality", value: v.avgScore ?? "·", hint: v.avgFirstScore !== null ? `First drafts ${v.avgFirstScore}` : "" },
    { label: "Rewritten", value: v.rewritten, hint: v.rewritten ? `${v.savedByRewrite} then passed` : "None needed" },
    { label: "Approved", value: decided ? `${v.decisions.approved} of ${decided}` : "·", hint: decided ? `${v.decisions.changes} changes, ${v.decisions.rejected} no` : "None decided" },
    { label: "Bench ratings", value: rated ? `${v.ratings.good} good` : "·", hint: rated ? `${v.ratings.ok} ok, ${v.ratings.bad} bad` : "None yet" },
    { label: "Runs", value: v.runs, hint: `${v.benchRuns} on the bench${v.lastRunAt ? `, last ${ago(v.lastRunAt, now)}` : ""}` },
  ];
  const maxShare = Math.max(0.01, ...v.checks.map((c) => c.share));
  return (
    <>
      <div className={r.versionHead}>
        <h2>
          Version {v.version} {isCurrent && <span className={r.current}>Current</span>}
        </h2>
        <span className={styles.hint}>People&apos;s runs and bench runs together. Nothing here changes the agent.</span>
      </div>
      <div className={[q.tiles, r.tiles6].join(" ")}>
        {tiles.map((t) => (
          <div key={t.label} className={[q.tile, t.main ? q.tileMain : ""].join(" ")}>
            <span className={q.tileLabel}>{t.label}</span>
            <span className={q.tileValue}>{t.value}</span>
            <span className={q.tileHint}>{t.hint}</span>
          </div>
        ))}
      </div>

      <div className={r.grid}>
        <Card title="Checks that fail most" className={styles.section}>
          <p className={styles.sectionNote}>Of {v.drafts} drafts the gate read, first drafts and rewrites together.</p>
          {v.checks.length ? (
            <ol className={r.bars}>
              {v.checks.map((c) => (
                <li key={c.id}>
                  <div className={r.barTop}>
                    <b>{c.label}</b>
                    <span>
                      {pct(c.share)} · {c.fails} failed{c.weak ? `, ${c.weak} weak` : ""}
                    </span>
                  </div>
                  <div className={r.barTrack} aria-hidden="true">
                    <span style={{ width: `${(c.share / maxShare) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.hint}>No check has failed on this version.</p>
          )}
          <div className={r.words}>
            <span className={styles.hint}>What the bench said</span>
            <div className={r.wordChips}>
              <span className={r.word}>
                Good <b>{v.ratings.good}</b>
              </span>
              <span className={r.word}>
                Ok <b>{v.ratings.ok}</b>
              </span>
              <span className={r.word}>
                Bad <b>{v.ratings.bad}</b>
              </span>
            </div>
            {v.ratings.notes.length > 0 ? (
              <ul className={r.notes}>
                {v.ratings.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : (
              <span className={styles.hint}>No rating notes yet.</span>
            )}
          </div>
        </Card>

        <Card title="Most common change requests" className={styles.section}>
          <p className={styles.sectionNote}>What people asked for when they sent a result back, grouped.</p>
          {v.changeRequests.length ? (
            <>
              <ol className={r.requests}>
                {v.changeRequests.map((c) => (
                  <li key={c.note}>
                    <span>&ldquo;{c.note}&rdquo;</span>
                    <b>{c.count}x</b>
                  </li>
                ))}
              </ol>
              {v.changeWords.length > 0 && (
                <div className={r.words}>
                  <span className={styles.hint}>Words that keep coming up</span>
                  <div className={r.wordChips}>
                    {v.changeWords.map((w) => (
                      <span key={w.word} className={r.word}>
                        {w.word} <b>{w.count}</b>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className={styles.hint}>Nobody has asked for changes on this version.</p>
          )}
          <div className={r.words}>
            <span className={styles.hint}>What people decided</span>
            <div className={r.wordChips}>
              <span className={r.word}>
                Approved <b>{v.decisions.approved}</b>
              </span>
              <span className={r.word}>
                Changes asked <b>{v.decisions.changes}</b>
              </span>
              <span className={r.word}>
                Rejected <b>{v.decisions.rejected}</b>
              </span>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Drafts that failed" className={styles.section}>
        <p className={styles.sectionNote}>First drafts the gate sent back, and results that still went to review. Read them next to the reasons to see what to tune.</p>
        {v.examples.length ? (
          <div className={r.examples}>
            {shown(v.examples).map((e) => (
              <article key={`${e.runId}-${e.kind}`} className={r.example}>
                <div className={r.exampleTop}>
                  <span className={[r.kind, e.kind === "result" ? r.kindReview : ""].join(" ")}>{e.kind === "first_draft" ? `First draft, then ${e.rewrittenTo} after the rewrite` : "Still under the bar: to review"}</span>
                  <span className={r.exScore}>{e.score}</span>
                </div>
                <p className={r.exText}>{e.text}</p>
                <ul className={r.exReasons}>
                  {e.reasons.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
                <span className={styles.hint}>
                  {ago(e.at, now)} · <span className={styles.mono}>{e.runId}</span>
                </span>
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.hint}>No failing drafts on this version.</p>
        )}
        {shown(v.examples).length < v.examples.length && <span className={styles.hint}>{v.examples.length - shown(v.examples).length} more not shown.</span>}
      </Card>
    </>
  );
}
