"use client";

import { useState } from "react";
import { submitReport } from "@/app/report/actions";
import { Mascot } from "@/components/brand/Mascot";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { REPORT_REASONS, REPORT_REASON_WORDS } from "@/lib/safety/words";
import s from "./Safety.module.css";

/** The notice form: what, why, an explanation, optional contact details and a good-faith statement. */
export function ReportForm({ initialWhat, signedIn }: { initialWhat: string; signedIn: boolean }) {
  const [what, setWhat] = useState(initialWhat);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [goodFaith, setGoodFaith] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ ref: string; emailed: boolean } | null>(null);

  async function send() {
    setBusy(true);
    setProblem(null);
    const r = await submitReport({ given: what, reason, details, name, email, goodFaith });
    setBusy(false);
    if (!r.ok) {
      const byField: Record<string, string> = {};
      for (const line of r.issues ?? []) {
        const m = /^([a-zA-Z]+): (.*)$/.exec(line);
        if (m) byField[m[1]] = m[2];
      }
      setErrors(byField);
      if (!r.issues?.length) setProblem(r.error);
      return;
    }
    setDone({ ref: r.ref, emailed: r.emailed });
  }

  if (done) {
    return (
      <div className={s.done} role="status">
        <Mascot pose="done" size={96} label="Wovi, report received" />
        <div className={s.blockedText}>
          <h3>Thank you. We got your report.</h3>
          <p>
            Your reference is <span className={s.ref}>{done.ref}</span>. A person at WOVI reads every report. {done.emailed ? "We sent a receipt to your email and will write there when we have decided." : "You gave no email, so keep the reference if you want to ask about it."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      className={s.form}
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <Input label="Where is it?" value={what} onChange={(e) => setWhat(e.target.value)} hint="The link to the result or comment, or its id (like run_...)." error={errors.given} maxLength={500} />
      <Select label="What is wrong with it?" value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} options={[{ value: "", label: "Pick one" }, ...REPORT_REASONS.map((r) => ({ value: r, label: REPORT_REASON_WORDS[r] }))]} />
      <Textarea label="Why does it break the law or WOVI's terms?" rows={5} value={details} onChange={(e) => setDetails(e.target.value)} hint="Say what it is and why. For copyright, say what work is yours." error={errors.details} maxLength={4000} />
      <div className={s.formGrid}>
        <Input label="Your name (optional)" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={120} />
        <Input label="Your email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} hint="For the receipt and our decision." error={errors.email} />
      </div>
      <label className={[s.confirm, goodFaith ? s.confirmOn : ""].join(" ")}>
        <input type="checkbox" checked={goodFaith} onChange={(e) => setGoodFaith(e.target.checked)} />
        <span>
          I believe in good faith that what I wrote is accurate and complete. {errors.goodFaith && <b role="alert">{errors.goodFaith}</b>}
        </span>
      </label>
      {problem && (
        <p role="alert">
          <Icon name="warning" size={16} /> {problem}
        </p>
      )}
      <div>
        <Button type="submit" size="lg" loading={busy} trailing={<Icon name="arrow-right" />}>
          Send the report
        </Button>
      </div>
      {signedIn && <p className={s.labelDone}>You are signed in, so the report is linked to your account. Only WOVI&apos;s team sees who sent it.</p>}
    </form>
  );
}
