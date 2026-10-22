import { Badge } from "@/components/ui/Badge";
import { Icon, type IconName } from "@/components/ui/Icon";
import { CHECKS } from "@/lib/quality/data";
import type { PublicScorecard } from "@/lib/quality/scorecard";
import type { PublicQuality, QualityCheckResult, QualityStatus } from "@/lib/quality/types";
import styles from "./Quality.module.css";

const STATUS_ICON: Record<QualityStatus, IconName> = { pass: "check-circle", weak: "info", fail: "x-circle", skipped: "info" };
const STATUS_WORD: Record<QualityStatus, string> = { pass: "Passed", weak: "Weak", fail: "Failed", skipped: "Not checked" };

/** The quality score beside a result: the number, and whether it cleared the agent's bar. */
export function QualityScore({ q }: { q: PublicQuality }) {
  const ready = q.verdict === "ready";
  return (
    <div className={styles.score} title="The combined score of every quality check, against this agent's bar">
      <Badge score={q.score} label="Quality" size="md" />
      <div className={styles.scoreText}>
        <b>Quality</b>
        <span>{ready ? `Passed the bar of ${q.threshold}` : q.score >= q.threshold ? "A check failed" : `Under the bar of ${q.threshold}`}</span>
      </div>
    </div>
  );
}

/**
 * What the gate did: a rewrite that cleared the bar, or why the result
 * waits for a person. Nothing when the first draft passed.
 */
export function GateNote({ q }: { q: PublicQuality }) {
  const ready = q.verdict === "ready";
  if (ready && q.rewrites === 0) return null;
  const drafts = q.attempts.filter((a) => !a.error);
  const firstReasons = q.attempts[0]?.reasons.filter((r) => !r.startsWith("Scored ")) ?? [];
  const times = q.rewrites === 1 ? "once" : `${q.rewrites} times`;
  return (
    <div className={[styles.gate, ready ? "" : styles.gateReview].join(" ")} role="note">
      <Icon name={ready ? "refresh" : "warning"} size={20} />
      <div className={styles.gateText}>
        <b>{ready ? `Rewritten ${times} by the quality gate` : "Waiting for a person: under the quality bar"}</b>
        <span>
          {ready
            ? `The first draft scored ${q.firstScore}, under the bar of ${q.threshold}. WOVI sent it back with the reasons and kept the rewrite.`
            : q.rewrites
              ? `It was rewritten ${times} and is still under the bar of ${q.threshold}, so it is not marked ready. Check these before you use it:`
              : `It is under the bar of ${q.threshold}, so it is not marked ready. Check these before you use it:`}
        </span>
        {drafts.length > 1 && (
          <span className={styles.steps} aria-label="Each draft's score">
            {drafts.map((a, i) => (
              <span key={a.n} style={{ display: "contents" }}>
                {i > 0 && <Icon name="arrow-right" size={14} />}
                <span className={[styles.step, a.n === q.used ? styles.stepUsed : a.score < q.threshold ? styles.stepLow : ""].join(" ")}>
                  {a.n === 0 ? "First draft" : `Rewrite ${a.n}`}: {a.score}
                </span>
              </span>
            ))}
          </span>
        )}
        {ready && firstReasons.length > 0 && (
          <ul className={styles.reasons} aria-label="What the first draft got wrong">
            {firstReasons.slice(0, 3).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
        {!ready && (
          <ul className={styles.reasons} aria-label="Why it needs review">
            {q.reasons.slice(0, 5).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CheckCard({ c }: { c: QualityCheckResult }) {
  const why = c.reasons.filter((r) => !r.startsWith("Closest"));
  return (
    <div className={[styles.check, styles[c.status]].join(" ")}>
      <div className={styles.checkTop}>
        <span className={styles.checkName}>
          <Icon name={STATUS_ICON[c.status]} size={16} />
          {c.label}
        </span>
        <span className={styles.checkScore} aria-label={STATUS_WORD[c.status]}>
          {c.score === null ? "·" : c.score}
        </span>
      </div>
      <div className={styles.meter} aria-hidden="true">
        <span style={{ width: `${c.score ?? 0}%` }} />
      </div>
      <span className={styles.checkWhy}>{why.slice(0, 2).join(" ") || CHECKS[c.id].what}</span>
    </div>
  );
}

/** Every check with its score and its reason in plain words. */
export function QualityBreakdown({ q }: { q: PublicQuality }) {
  const order: QualityStatus[] = ["fail", "weak", "pass", "skipped"];
  const checks = [...q.checks].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  return (
    <section className={styles.breakdown} aria-label="Quality check">
      <div className={styles.breakdownHead}>
        <div>
          <h3>Quality check: {q.score} of 100</h3>
          <p>
            Every result is read for {q.checks.length} things before it is marked ready. This agent&apos;s bar is {q.threshold}; below it, or with a failed check, the result is sent back for a rewrite, then to a person.
          </p>
        </div>
      </div>
      <div className={styles.checks}>
        {checks.map((c) => (
          <CheckCard key={c.id} c={c} />
        ))}
      </div>
    </section>
  );
}

/* ---------- Scores people see on agents ---------- */

const pct = (x: number | null) => (x === null ? "·" : `${Math.round(x * 100)}%`);

/** One line under an agent card: its average quality and how often it passes the bar. */
export function CardScore({ card }: { card: PublicScorecard | null }) {
  if (!card || !card.scored) {
    return (
      <div className={styles.cardScore}>
        <span className={styles.newDot}>
          <Icon name="spark" size={16} />
        </span>
        <span className={styles.cardScoreText}>
          <b>New agent</b>
          <span>Scores show after its first runs</span>
        </span>
      </div>
    );
  }
  return (
    <div className={styles.cardScore} title={card.words.lines.join(" ")}>
      <Badge score={card.avgScore ?? 0} label="Average quality" size="sm" />
      <span className={styles.cardScoreText}>
        <b>
          {pct(card.passRate)} pass the quality bar
        </b>
        <span>
          {card.decided ? `${pct(card.approvalRate)} approved · ` : ""}
          {card.runs} {card.runs === 1 ? "run" : "runs"}
        </span>
      </span>
    </div>
  );
}

/** The agent page's scorecard: the numbers, the same in words, and what every result is checked for. */
export function AgentScorecard({ card, bar, rewrites }: { card: PublicScorecard; bar: number; rewrites: number }) {
  const tiles = [
    { label: "Pass the bar", value: pct(card.passRate), hint: card.scored ? `${card.passed} of ${card.scored} runs` : "No runs yet", main: true },
    { label: "Avg quality", value: card.avgScore === null ? "·" : String(card.avgScore), hint: "out of 100" },
    { label: "Approved", value: pct(card.approvalRate), hint: card.decided ? `${card.approved} of ${card.decided} decided` : "None decided yet" },
    { label: "Changes asked", value: pct(card.changesRate), hint: card.decided ? `on ${card.changesAsked} of ${card.decided}` : "None yet" },
    { label: "Runs", value: String(card.runs), hint: "by everyone" },
    { label: "First try", value: card.scored ? pct(card.firstTry / card.scored) : "·", hint: "passed with no rewrite" },
  ];
  return (
    <div className={styles.card}>
      <div className={styles.cardLead}>
        <span className="eyebrow">How it scores</span>
        <h2>{card.words.headline}</h2>
        <ul className={styles.words}>
          {card.words.lines.map((l) => (
            <li key={l}>
              <Icon name="check" size={16} />
              <span>{l}</span>
            </li>
          ))}
        </ul>
        <div className={styles.bar}>
          <Icon name="sliders" size={20} />
          <span>
            Its bar is <b>{bar}</b>. {rewrites ? `A result under it, or with a failed check, is rewritten up to ${rewrites === 1 ? "once" : `${rewrites} times`}, then sent to you for review instead of marked ready.` : "A result under it, or with a failed check, is sent to you for review instead of marked ready."}
          </span>
        </div>
      </div>
      <div className={styles.how}>
        <div className={styles.tiles}>
          {tiles.map((t) => (
            <div key={t.label} className={[styles.tile, t.main ? styles.tileMain : ""].join(" ")}>
              <span className={styles.tileLabel}>{t.label}</span>
              <span className={styles.tileValue}>{t.value}</span>
              <span className={styles.tileHint}>{t.hint}</span>
            </div>
          ))}
        </div>
        <h3>What every result is checked for</h3>
        <ul className={styles.howList}>
          {(["specificity", "generic_phrases", "brand_fit", "reference_anchoring", "claims", "platform_rules"] as const).map((id) => (
            <li key={id}>
              <b>{CHECKS[id].label}</b>
              <span>{CHECKS[id].what}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
