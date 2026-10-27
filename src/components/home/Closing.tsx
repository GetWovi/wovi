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
import { CONTACT_EMAIL, GITHUB_URL, X_URL } from "@/lib/site";

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
              Ready when you are
            </span>
            <h2 id="closing-title" className={styles.ctaTitle} data-head>
              Your vision deserves better than average.
            </h2>
            <p className={styles.ctaLead} data-head>
              Sign in with your email, set up your Brand Brain once, and pick the agent for the job. You pay per run with credits, and every result waits for your yes.
            </p>
            <div className={styles.ctaActions} data-head>
              <ButtonLink href="/sign-in" size="lg" className={styles.ctaButton} trailing={<Icon name="arrow-right" />}>
                Get started
              </ButtonLink>
              <ButtonLink href="/agents" size="lg" variant="ghost" className={styles.ctaGhost}>
                Browse the agents
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
            {/* The size from .bigLogo, set here because the Logo's own inline height would win over the class: it shrinks on phones instead of widening the page. */}
            <Logo height={160} className={styles.bigLogo} style={{ height: "clamp(72px, 12vw, 160px)" }} label="WOVI" />
          </div>
          <div className={styles.cols}>
            <div className={styles.col}>
              <span className={styles.colTitle}>Product</span>
              <Link href="/app">Open the app</Link>
              <Link href="/agents">Browse the agents</Link>
              <Link href="/app/credits">Credits</Link>
              <a href="#brand-brain">Brand Brain</a>
            </div>
            <div className={styles.col}>
              <span className={styles.colTitle}>Build</span>
              <a href="#plug-in">MCP and API</a>
              <Link href="/app/settings/api">API keys</Link>
              <a href="/api/v1/openapi.json">OpenAPI document</a>
              <a href="#creators">For creators</a>
            </div>
            <div className={styles.col}>
              <span className={styles.colTitle}>Company</span>
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
              {GITHUB_URL && (
                <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                  GitHub
                </a>
              )}
              <a href={X_URL} target="_blank" rel="noopener noreferrer">X</a>
            </div>
          </div>
          <div className={styles.fine}>
            <span>Sample content and scores on this page are illustrations. Every result is written by AI and is a draft until you approve it.</span>
            <span>Use at your own risk. Nothing here is financial, legal or professional advice.</span>
          </div>
        </div>
      </footer>
    </section>
  );
}
