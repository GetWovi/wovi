import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/site/SiteHeader";
import { ReportForm } from "@/components/safety/ReportForm";
import s from "@/components/safety/Safety.module.css";
import { readSession } from "@/lib/accounts/server";
import { CONTACT_EMAIL } from "@/lib/legal/operator";

export const metadata: Metadata = {
  title: "Report content",
  description: "Report content on WOVI that breaks the law or WOVI's terms. Open to anyone, with or without an account.",
};
export const dynamic = "force-dynamic";

export default async function ReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const what = typeof sp.what === "string" ? sp.what.slice(0, 500) : "";
  const info = await readSession();
  return (
    <>
      <SiteHeader />
      <main className="container">
        <div className={s.page}>
          <aside className={s.toc}>
            <span className={s.tocTitle}>How it works</span>
            <span className={s.labelDone}>1. You tell us where and why.</span>
            <span className={s.labelDone}>2. You get a reference at once.</span>
            <span className={s.labelDone}>3. A person reads it and decides.</span>
            <span className={s.labelDone}>4. With an email, you hear what we did.</span>
          </aside>
          <article className={s.doc}>
            <header className={s.docHead}>
              <span className="eyebrow">Report content</span>
              <h1>Something wrong on WOVI?</h1>
              <p className={s.lead}>
                Tell us about content that breaks the law or <a href="/terms#content-rules">WOVI&apos;s content rules</a>. Anyone can report, with or without an account. For anything else, write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
              </p>
            </header>
            <ReportForm initialWhat={what} signedIn={Boolean(info)} />
          </article>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
