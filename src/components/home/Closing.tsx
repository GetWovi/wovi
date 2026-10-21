"use client";

import Link from "next/link";
import { Sparkle } from "@/components/brand/Accents";
import { Logo } from "@/components/brand/Logo";
import { Mascot } from "@/components/brand/Mascot";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { reveal, useScrollScene } from "./scroll";
import home from "./home.module.css";
import styles from "./Closing.module.css";

/** The final call on a Blaze panel, then the footer with the wordmark. */
export function Closing() {
  const ref = useScrollScene<HTMLElement>(({ el, gsap, reduce }) => {
    reveal(gsap, el, "[data-panel]", { reduce, y: 40, start: "top 80%" });
    reveal(gsap, el, "[data-head]", { reduce, stagger: 0.1, start: "top 70%" });
    const big = el.querySelector("[data-big]");
    if (!big) return;
    if (reduce) {
      gsap.set(big, { opacity: 1, y: 0 });
      return;
    }
    gsap.fromTo(big, { opacity: 0, y: 40 }, { opacity: 1, y: 0, ease: "power3.out", scrollTrigger: { trigger: big, start: "top 96%", end: "top 70%", scrub: 0.6 } });
  });

  return (
    <section ref={ref} className={styles.closing} aria-labelledby="closing-title">
      <div className="container">
        <div className={[home.panel, home.panelCobalt, styles.cta].join(" ")} data-panel>
          <div className={styles.ctaCopy}>
            <span className={[home.panelLabel, styles.ctaLabel].join(" ")} data-head>
              Early access
            </span>
            <h2 id="closing-title" className={styles.ctaTitle} data-head>
              Your vision deserves better than average.
            </h2>
            <p className={styles.ctaLead} data-head>
              WOVI is being built in the open. If you make content for a business, or you want to build agents for people who do, say hello.
            </p>
            <div className={styles.ctaActions} data-head>
              <ButtonLink href="mailto:hello@wovi.app?subject=Early%20access" size="lg" className={styles.ctaButton} trailing={<Icon name="arrow-right" />}>
                Ask for early access
              </ButtonLink>
              <ButtonLink href="/design" size="lg" variant="ghost" className={styles.ctaGhost}>
                See the design system
              </ButtonLink>
            </div>
          </div>
          <div className={styles.ctaWovi}>
            <Sparkle size={26} color="#FFF4DC" className={styles.ctaSparkle} />
            <Mascot pose="hello" size={260} ink="cream" label="Wovi waving" className={styles.ctaMascot} />
          </div>
        </div>
      </div>

      <footer className={styles.footer}>
        <div className={["container", styles.footerInner].join(" ")}>
          <div className={styles.big} data-big>
            <Logo height={160} className={styles.bigLogo} label="WOVI" />
          </div>
          <div className={styles.cols}>
            <div className={styles.col}>
              <span className={styles.colTitle}>Product</span>
              <a href="#agents">Agents</a>
              <a href="#pipeline">How a post is made</a>
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
              <a href="#">GitHub</a>
              <a href="#">X</a>
            </div>
          </div>
          <div className={styles.fine}>
            <span>WOVI is pre-launch. This page shows the product being built; sample content and scores are illustrations.</span>
            <span>Use at your own risk. Nothing here is financial, legal or professional advice.</span>
          </div>
        </div>
      </footer>
    </section>
  );
}
