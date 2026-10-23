import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/site/SiteHeader";
import { EFFECTIVE_DATE, effectiveWords } from "@/lib/legal/operator";
import s from "./Safety.module.css";

export type LegalSection = { id: string; title: string; body: ReactNode };

/** The layout every legal page shares: the site chrome, a contents list and the sections. */
export function LegalPage({ eyebrow, title, lead, sections, extraMeta }: { eyebrow: string; title: string; lead: ReactNode; sections: LegalSection[]; extraMeta?: string[] }) {
  return (
    <>
      <SiteHeader />
      <main className="container">
        <div className={s.page}>
          <nav className={s.toc} aria-label="On this page">
            <span className={s.tocTitle}>On this page</span>
            {sections.map((x) => (
              <a key={x.id} href={`#${x.id}`}>
                {x.title}
              </a>
            ))}
          </nav>
          <article className={s.doc}>
            <header className={s.docHead}>
              <span className="eyebrow">{eyebrow}</span>
              <h1>{title}</h1>
              <p className={s.lead}>{lead}</p>
              <div className={s.meta}>
                <span className={s.metaPill}>
                  In effect from <time dateTime={EFFECTIVE_DATE}>&nbsp;{effectiveWords()}</time>
                </span>
                {extraMeta?.map((m) => (
                  <span key={m} className={s.metaPill}>
                    {m}
                  </span>
                ))}
              </div>
            </header>
            {sections.map((x) => (
              <section key={x.id} id={x.id} className={s.section}>
                <h2>{x.title}</h2>
                {x.body}
              </section>
            ))}
          </article>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

export { s as legalStyles };
