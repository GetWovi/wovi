"use server";

import { AccountError } from "@/lib/accounts/errors";
import { accounts, checkOrigin, readSession, requestMeta } from "@/lib/accounts/server";
import { ReportError, type ReportInput } from "@/lib/safety/reports";
import { appReports } from "@/lib/safety/server";

export type ReportResult = { ok: true; ref: string; emailed: boolean } | { ok: false; error: string; issues?: string[] };

/** A report from anyone, signed in or not (Digital Services Act Art. 16). Same-site only, rate limited per address. */
export async function submitReport(input: ReportInput): Promise<ReportResult> {
  try {
    await checkOrigin();
    const { ip } = await requestMeta();
    await accounts().limiter.hit(`report:ip:${ip}`, { max: 10, windowMs: 60 * 60_000 }, "Too many reports from here. Wait a little and try again.");
    const info = await readSession();
    const row = await appReports().submit(input, info?.user.id ?? null);
    return { ok: true, ref: row.ref, emailed: Boolean(row.reporterEmail) };
  } catch (err) {
    if (err instanceof ReportError) return { ok: false, error: err.message, issues: err.issues };
    if (err instanceof AccountError) return { ok: false, error: err.message };
    console.error("A report could not be saved:", err);
    return { ok: false, error: "Something went wrong. Write to us instead." };
  }
}
