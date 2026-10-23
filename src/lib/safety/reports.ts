/**
 * Notice and action (phase 18, Digital Services Act Art. 16 and 17). Anyone,
 * signed in or not, can report content: what it is (a link or an id), why,
 * an explanation, optional name and email, and a good-faith statement. They
 * get a reference at once and, with an email, a receipt and later the
 * decision. WOVI's owners see every report in a queue and decide by hand:
 * take the content down, restrict the account, or no action, with the term or
 * law it rests on. The workspace whose content it was gets a statement of
 * reasons with how to answer it.
 */
import { randomBytes } from "node:crypto";
import type { Accounts, Principal } from "@/lib/accounts/accounts";
import type { EmailSender } from "@/lib/accounts/email";
import { AccountError } from "@/lib/accounts/errors";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import { CONTACT_EMAIL, operatorLine } from "@/lib/legal/operator";
import { REPORT_OUTCOMES, REPORT_OUTCOME_WORDS, REPORT_REASONS, REPORT_REASON_WORDS, type ReportOutcome, type ReportReason, type ReportRow, type ReportTarget, type SafetyStore } from "./store";

export class ReportError extends Error {
  constructor(
    readonly code: "invalid_input" | "not_found" | "forbidden",
    message: string,
    readonly issues: string[] = [],
  ) {
    super(message);
    this.name = "ReportError";
  }
}

/** What reports need from the run engine: find a run by id, and take its output down or put it back. */
export interface ReportRuns {
  findRun(runId: string): Promise<{ workspaceId: string } | null>;
  withhold(workspaceId: string, runId: string, info: { reportId: string; reason: string }): Promise<unknown>;
}

export type ReportsOptions = {
  store: SafetyStore;
  accounts: Accounts;
  email: EmailSender;
  runs?: ReportRuns;
  /** Comments by id, to take one down (phase 11 team store). */
  comments?: { get(id: string): Promise<{ id: string; workspaceId: string } | null>; delete(id: string): Promise<boolean> };
  now?: () => Date;
};

export type ReportInput = {
  /** Where the content is: a WOVI link or an id. */
  given: string;
  reason: string;
  details: string;
  name?: string | null;
  email?: string | null;
  goodFaith: boolean;
  /** From a Report button: what it points at. Checked against the store, never trusted alone. */
  hint?: { kind?: string; id?: string } | null;
};

/** The grounds an owner picks from: WOVI's terms by section, or the law. */
export const REPORT_GROUNDS = [
  "Terms 6: content rules (fake reviews, impersonation, deepfakes, false claims)",
  "Terms 6: content rules (hate, harassment, sexual content, unsafe advice)",
  "Terms 7: someone else's rights (copyright, privacy)",
  "Illegal content",
  "No breach found",
] as const;

const ID = /\b((?:run|pip|cmt)_[A-Za-z0-9]{6,40})\b/;
const EMAIL = /^[^\s@"<>()[\],;:]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

export class Reports {
  private readonly now: () => Date;

  constructor(private readonly o: ReportsOptions) {
    this.now = o.now ?? (() => new Date());
  }

  private iso() {
    return this.now().toISOString();
  }

  /** WOVI's owners: the owners of the platform workspace. */
  async isOwner(caller: Principal): Promise<boolean> {
    return (await this.o.accounts.roleIn(caller, PLATFORM_WORKSPACE_ID)) === "owner";
  }

  private async requireOwner(caller: Principal) {
    if (!(await this.isOwner(caller))) throw new AccountError("not_found", "Not found.");
  }

  /** Reads a link or an id into what it points at. Unknown things stay "other" with what was given. */
  async target(given: string, hint?: ReportInput["hint"]): Promise<ReportTarget> {
    const text = given.trim();
    const id = (hint?.id && ID.test(hint.id) ? hint.id : null) ?? ID.exec(text)?.[1] ?? null;
    if (id?.startsWith("run_") && this.o.runs) {
      const run = await this.o.runs.findRun(id);
      if (run) return { kind: "run", id, workspaceId: run.workspaceId, given: text };
    }
    if (id && this.o.comments && id.startsWith("cmt_")) {
      const c = await this.o.comments.get(id);
      if (c) return { kind: "comment", id, workspaceId: c.workspaceId, given: text };
    }
    if (id?.startsWith("pip_")) return { kind: "pipeline_run", id, workspaceId: null, given: text };
    return { kind: "other", id: null, workspaceId: null, given: text };
  }

  /** A new report. Open to anyone; the caller rate limits it. */
  async submit(input: ReportInput, reporterUserId: string | null = null): Promise<ReportRow> {
    const issues: string[] = [];
    const given = String(input.given ?? "").trim();
    const details = String(input.details ?? "").trim();
    const reason = String(input.reason ?? "") as ReportReason;
    const email = input.email?.trim() || null;
    const name = input.name?.trim() || null;
    if (given.length < 3 || given.length > 500) issues.push("given: Paste the link to the content, or its id.");
    if (!REPORT_REASONS.includes(reason)) issues.push("reason: Pick what is wrong with it.");
    if (details.length < 10 || details.length > 4000) issues.push("details: Say in a few words why it breaks the law or the terms (10 to 4,000 characters).");
    if (email && (email.length > 254 || !EMAIL.test(email))) issues.push("email: That does not look like an email address.");
    if (name && name.length > 120) issues.push("name: At most 120 characters.");
    if (input.goodFaith !== true) issues.push("goodFaith: Confirm that the report is accurate and made in good faith.");
    if (issues.length) throw new ReportError("invalid_input", "Some fields need a look.", issues);

    const at = this.iso();
    const row: ReportRow = {
      id: `rep_${randomBytes(10).toString("hex")}`,
      ref: `R-${randomBytes(4).toString("hex").toUpperCase().slice(0, 6)}`,
      target: await this.target(given, input.hint),
      reason,
      details,
      reporterName: name,
      reporterEmail: email?.toLowerCase() ?? null,
      reporterUserId,
      goodFaith: true,
      status: "new",
      decision: null,
      notified: { receiptAt: null, decisionAt: null, affectedAt: null },
      createdAt: at,
      updatedAt: at,
    };
    await this.o.store.reports.insert(row);
    if (row.reporterEmail) {
      await this.o.email.send({
        to: row.reporterEmail,
        subject: `We got your report ${row.ref}`,
        text: [
          `Thank you. We got your report ${row.ref} about: ${row.target.given}`,
          `Reason: ${REPORT_REASON_WORDS[row.reason]}.`,
          "A person at WOVI reads every report. We will write to you here when we have decided.",
          `${operatorLine()}. ${CONTACT_EMAIL}`,
        ].join("\n\n"),
      });
      row.notified.receiptAt = this.iso();
      await this.o.store.reports.update(row);
    }
    return row;
  }

  /** The queue, newest first, open ones on top. Owners only. */
  async list(caller: Principal): Promise<ReportRow[]> {
    await this.requireOwner(caller);
    const rank = { new: 0, reviewing: 1, decided: 2 } as const;
    return (await this.o.store.reports.find()).sort((a, b) => rank[a.status] - rank[b.status] || b.createdAt.localeCompare(a.createdAt));
  }

  async markReviewing(caller: Principal, id: string): Promise<ReportRow> {
    await this.requireOwner(caller);
    const row = await this.o.store.reports.get(id);
    if (!row) throw new ReportError("not_found", "No such report.");
    if (row.status !== "new") return row;
    const next = { ...row, status: "reviewing" as const, updatedAt: this.iso() };
    await this.o.store.reports.update(next);
    return next;
  }

  /**
   * Decides a report by hand. "removed" takes a run's output down (kept for
   * disputes, hidden everywhere) or deletes a comment. The reporter and the
   * workspace hear about it.
   */
  async decide(caller: Principal, id: string, input: { outcome: string; ground: string; note: string }): Promise<ReportRow> {
    await this.requireOwner(caller);
    const row = await this.o.store.reports.get(id);
    if (!row) throw new ReportError("not_found", "No such report.");
    const outcome = input.outcome as ReportOutcome;
    const issues: string[] = [];
    if (!REPORT_OUTCOMES.includes(outcome)) issues.push("outcome: Pick a decision.");
    const ground = String(input.ground ?? "").trim();
    if (ground.length < 3 || ground.length > 200) issues.push("ground: Name the term or the law the decision rests on.");
    const note = String(input.note ?? "").trim();
    if (note.length > 2000) issues.push("note: At most 2,000 characters.");
    if (outcome === "removed" && row.target.kind !== "run" && row.target.kind !== "comment") issues.push("outcome: WOVI can only take down a run's output or a comment from here. Restrict the account, or decide no action and handle it by hand.");
    if (issues.length) throw new ReportError("invalid_input", "Some fields need a look.", issues);

    const at = this.iso();
    if (outcome === "removed" && row.target.workspaceId && row.target.id) {
      if (row.target.kind === "run") await this.o.runs?.withhold(row.target.workspaceId, row.target.id, { reportId: row.id, reason: ground });
      if (row.target.kind === "comment") await this.o.comments?.delete(row.target.id);
    }
    const next: ReportRow = { ...row, status: "decided", decision: { outcome, ground, note, by: caller.userId, at, automated: false }, updatedAt: at };
    await this.o.store.reports.update(next);

    const words = REPORT_OUTCOME_WORDS[outcome];
    if (next.reporterEmail) {
      await this.o.email.send({
        to: next.reporterEmail,
        subject: `Your report ${next.ref}: ${words.toLowerCase()}`,
        text: [
          `We decided on your report ${next.ref} about ${next.target.given}.`,
          `Decision: ${words}. Why: ${ground}.${note ? ` ${note}` : ""}`,
          "A person decided this; no automated tool did.",
          `If you disagree, reply to ${CONTACT_EMAIL}. You can also go to the consumer disputes body or the courts where you live.`,
        ].join("\n\n"),
      });
      next.notified.decisionAt = this.iso();
    }
    if (next.target.workspaceId && outcome !== "no_action") {
      for (const to of await this.ownerEmails(next.target.workspaceId)) {
        await this.o.email.send({
          to,
          subject: `WOVI took action on content in your workspace (${next.ref})`,
          text: [
            `What: ${words.toLowerCase()} for ${next.target.kind === "run" ? `the result ${next.target.id}` : next.target.kind === "comment" ? "a comment" : next.target.given}.`,
            `Why: a report under "${REPORT_REASON_WORDS[next.reason]}". Ground: ${ground}.${note ? ` ${note}` : ""}`,
            `How: a person at WOVI read the report and the content; no automated tool decided. ${outcome === "removed" ? "The content is hidden in WOVI and kept only in case of a dispute." : ""}`,
            `If you think this is wrong, reply to ${CONTACT_EMAIL} within six months and a person will look again. You can also go to the consumer disputes body or the courts where you live.`,
          ].join("\n\n"),
        });
        next.notified.affectedAt = this.iso();
      }
    }
    await this.o.store.reports.update(next);
    return next;
  }

  private async ownerEmails(workspaceId: string): Promise<string[]> {
    const members = await this.o.accounts.store.members.find({ workspaceId });
    const out: string[] = [];
    for (const m of members.filter((m) => m.role === "owner" || m.role === "admin")) {
      const u = await this.o.accounts.store.users.get(m.userId);
      if (u?.email) out.push(u.email);
    }
    return out;
  }
}

export { REPORT_OUTCOMES, REPORT_OUTCOME_WORDS, REPORT_REASONS, REPORT_REASON_WORDS };
