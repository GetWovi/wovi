"use client";

import Link from "next/link";
import { Mascot } from "@/components/brand/Mascot";
import { Wordmark } from "@/components/brand/Wordmark";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { reveal, useScrollScene } from "./scroll";
import home from "./home.module.css";
import styles from "./Closing.module.css";

/** The final call and the footer, with the wordmark at full width. */
export function Closing() {
  const ref = useScrollScene<HTMLElement>(({ el, gsap, reduce }) => {
    reveal(gsap, el, "[data-head]", { reduce });
    const big = el.querySelector("[data-big]");
    if (!big) return;
    if (reduce) {
      gsap.set(big, { opacity: 1, y: 0 });
      return;
    }
    gsap.fromTo(big, { opacity: 0, y: 60 }, { opacity: 1, y: 0, ease: "power3.out", scrollTrigger: { trigger: big, start: "top 95%", end: "top 55%", scrub: 0.6 } });
  });

  return (
    <section ref={ref} className={styles.closing} aria-labelledby="closing-title">
      <div className={home.wash} />
      <div className={home.grain} />
      <div className={["container", styles.cta].join(" ")}>
        <div className={styles.ctaWovi}>
          <Mascot pose="waving" size={140} label="Wovi waving goodbye" />
        </div>
        <span className={home.eyebrow} data-head>
          Early access
        </span>
        <h2 id="closing-title" className={styles.ctaTitle} data-head>
          Your vision deserves better than <em>average.</em>
        </h2>
        <p className={[home.lead, styles.ctaLead].join(" ")} data-head>
          WOVI is being built in the open. If you make content for a business, or you want to build agents for people who do, say hello.
        </p>
        <div className={styles.ctaActions} data-head>
          <ButtonLink href="mailto:hello@wovi.app?subject=Early%20access" size="lg" trailing={<Icon name="arrow-right" />}>
            Ask for early access
          </ButtonLink>
          <ButtonLink href="/design" size="lg" variant="ghost">
            See the design system
          </ButtonLink>
        </div>
      </div>

      <footer className={styles.footer}>
        <div className={["container", styles.footerInner].join(" ")}>
          <div className={styles.big} data-big aria-hidden="true">
            <Wordmark variant="theme" height={240} lit label="" />
          </div>
          <div className={styles.cols}>
            <div className={styles.col}>
              <span className={styles.colTitle}>Product</span>
              <a href="#agents">Agents</a>
              <a href="#pipeline">Pipeline</a>
              <a href="#brand-brain">Brand Brain</a>
              <a href="#anti-slop">Anti-slop</a>
            </div>
            <div className={styles.col}>
              <span className={styles.colTitle}>Build</span>
              <a href="#plug-in">MCP and API</a>
              <a href="#creators">For creators</a>
              <Link href="/design">Design system</Link>
            </div>
            <div className={styles.col}>
              <span className={styles.colTitle}>Company</span>
              <a href="mailto:hello@wovi.app">hello@wovi.app</a>
              <span className={styles.muted}>Night first. Built from tokens.</span>
            </div>
          </div>
          <div className={styles.fine}>
            <span>WOVI is pre-launch. Everything on this page shows the product being built; sample content and scores are illustrations.</span>
            <span>Nothing here is financial, legal or professional advice. Use at your own risk.</span>
          </div>
        </div>
      </footer>
    </section>
  );
}
