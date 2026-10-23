import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/account/ActionForm";
import styles from "@/components/app/App.module.css";
import { AppShell } from "@/components/app/AppShell";
import s from "@/components/safety/Safety.module.css";
import { Button } from "@/components/ui/Button";
import { Select, Textarea } from "@/components/ui/Field";
import { appPage } from "@/lib/app/server";
import { priceWords } from "@/lib/credits/config";
import { REPORT_GROUNDS, REPORT_OUTCOMES, REPORT_OUTCOME_WORDS, REPORT_REASON_WORDS } from "@/lib/safety/reports";
import { appReports, appSafetyStore } from "@/lib/safety/server";
import type { ReportRow } from "@/lib/safety/store";
import { decideReport, markOwedPaid, markReviewing } from "./actions";

export const metadata: Metadata = { title: "Reports and refunds", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const STATUS_WORDS: Record<ReportRow["status"], string> = { new: "New", reviewing: "Being reviewed", decided: "Decided" };

function target(r: ReportRow) {
  if (r.target.kind === "run" && r.target.id) return `Result ${r.target.id}`;
  if (r.target.kind === "comment") return "A comment";
  if (r.target.kind === "pipeline_run") return `Pipeline run ${r.target.id}`;
  return r.target.given;
}

export default async function SafetyPage() {
  const { info, me, csrf } = await appPage("/app/settings/safety");
  // WOVI's owners only (owners of the platform workspace), like x402 and $WOVI.
  if (!(await appReports().isOwner(me))) notFound();
  const reports = await appReports().list(me);
  const store = appSafetyStore();
  const owed = (await store.owed.find()).sort((a, b) => (a.status === b.status ? b.createdAt.localeCompare(a.createdAt) : a.status === "owed" ? -1 : 1));
  const deletions = (await store.deletions.find()).length;
  const open = reports.filter((r) => r.status !== "decided").length;

  return (
    <AppShell info={info} active="settings">
      <div className={styles.head}>
        <div className={styles.headText}>
          <Link href="/app/settings" className={styles.crumb}>
            Settings
          </Link>
          <span className="eyebrow">Owners of WOVI</span>
          <h1>Reports and refunds</h1>
          <p className={styles.muted}>
            Every report anyone sent, open ones first. A person decides each one; the reporter and the workspace hear about it. {open} open, {reports.length - open} decided. {deletions} account{deletions === 1 ? "" : "s"} deleted so far.
          </p>
        </div>
      </div>

      <section className={styles.stack} aria-label="Reports">
        <h2>Reports</h2>
        {reports.length === 0 && <p className={styles.muted}>No reports yet.</p>}
        <div className={s.queue}>
          {reports.map((r) => (
            <article key={r.id} className={s.report}>
              <div className={s.reportHead}>
                <span className={[s.status, r.status === "new" ? s.statusNew : r.status === "reviewing" ? s.statusReviewing : ""].join(" ")}>{STATUS_WORDS[r.status]}</span>
                <b>{REPORT_REASON_WORDS[r.reason]}</b>
                <span className={s.ref}>{r.ref}</span>
              </div>
              <div className={s.reportMeta}>
                <span>{target(r)}</span>
                <span>Sent {when(r.createdAt)}</span>
                <span>{r.reporterEmail ? `From ${r.reporterName ? `${r.reporterName}, ` : ""}${r.reporterEmail}` : r.reporterUserId ? "From a signed-in person, no email given" : "No contact details"}</span>
              </div>
              <p className={s.reportBody}>{r.details}</p>
              {r.decision ? (
                <p className={styles.muted}>
                  <b>{REPORT_OUTCOME_WORDS[r.decision.outcome]}</b> on {when(r.decision.at)}. Ground: {r.decision.ground}.{r.decision.note ? ` ${r.decision.note}` : ""}
                </p>
              ) : (
                <>
                  {r.status === "new" && (
                    <ActionForm action={markReviewing} csrf={csrf}>
                      <input type="hidden" name="id" value={r.id} />
                      <Button type="submit" size="sm" variant="ghost">
                        I am looking at it
                      </Button>
                    </ActionForm>
                  )}
                  <ActionForm action={decideReport} csrf={csrf} className={s.decide}>
                    <input type="hidden" name="id" value={r.id} />
                    <Select name="outcome" label="Decision" defaultValue="" options={[{ value: "", label: "Pick one" }, ...REPORT_OUTCOMES.filter((o) => o !== "removed" || r.target.kind === "run" || r.target.kind === "comment").map((o) => ({ value: o, label: REPORT_OUTCOME_WORDS[o] }))]} />
                    <Select name="ground" label="Because of" defaultValue="" options={[{ value: "", label: "Pick the term or the law" }, ...REPORT_GROUNDS.map((g) => ({ value: g, label: g }))]} />
                    <div className={s.decideWide}>
                      <Textarea name="note" label="Note for the reporter and the workspace (optional)" rows={2} maxLength={2000} />
                    </div>
                    <div className={s.decideBar}>
                      <Button type="submit" size="sm">
                        Decide and tell them
                      </Button>
                    </div>
                  </ActionForm>
                </>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className={styles.stack} aria-label="Money owed back">
        <h2>Money owed back</h2>
        <p className={styles.muted}>From withdrawals within 14 days and from deleted accounts. Send it through the payment provider, then mark it paid. WOVI sends nothing on its own.</p>
        {owed.length === 0 && <p className={styles.muted}>Nothing owed.</p>}
        <div className={s.queue}>
          {owed.map((o) => (
            <article key={o.id} className={s.report}>
              <div className={s.reportHead}>
                <span className={[s.status, o.status === "owed" ? s.statusNew : ""].join(" ")}>{o.status === "owed" ? "Owed" : "Paid"}</span>
                <b>
                  {priceWords(o.credits)} for {o.credits.toLocaleString("en-US")} credits
                </b>
                {o.test && <span className={s.status}>Test top-up, nothing to send</span>}
              </div>
              <div className={s.reportMeta}>
                <span>{o.kind === "withdrawal" ? "Withdrawal from a purchase" : "Account deleted"}</span>
                <span>{when(o.createdAt)}</span>
                <span>{o.contact ? `Contact ${o.contact}` : o.paidAt ? `Paid ${when(o.paidAt)}` : "No contact"}</span>
              </div>
              {o.status === "owed" && (
                <ActionForm action={markOwedPaid} csrf={csrf} className={s.inlineForm}>
                  <input type="hidden" name="id" value={o.id} />
                  <Button type="submit" size="sm" variant="secondary">
                    Mark paid
                  </Button>
                </ActionForm>
              )}
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
