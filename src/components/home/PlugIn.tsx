"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { CODE_TABS } from "./demo-data";
import { reveal, useScrollScene } from "./scroll";
import home from "./home.module.css";
import styles from "./PlugIn.module.css";

export function PlugIn() {
  const [tab, setTab] = useState(CODE_TABS[0].id);
  const [shown, setShown] = useState(0);
  const [copied, setCopied] = useState(false);
  const started = useRef(false);
  const current = CODE_TABS.find((t) => t.id === tab) ?? CODE_TABS[0];

  const ref = useScrollScene<HTMLElement>(({ el, gsap, reduce }) => {
    reveal(gsap, el, "[data-head]", { reduce });
    reveal(gsap, el, "[data-panel]", { reduce, y: 40, start: "top 78%" });
  });

  // Type the code out the first time the panel is in view, then show tabs instantly.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      const id = setTimeout(() => setShown(Number.MAX_SAFE_INTEGER), 0);
      return () => clearTimeout(id);
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting || started.current) return;
        started.current = true;
        let i = 0;
        const total = current.code.length;
        const tick = () => {
          i += 3;
          setShown(i);
          if (i < total) setTimeout(tick, 12);
          else setShown(Number.MAX_SAFE_INTEGER);
        };
        tick();
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pick(id: string) {
    setTab(id);
    setShown(Number.MAX_SAFE_INTEGER);
    setCopied(false);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(current.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard can be blocked; the code is still selectable */
    }
  }

  const code = shown === Number.MAX_SAFE_INTEGER ? current.code : current.code.slice(0, shown);

  return (
    <section ref={ref} id="plug-in" className={home.section} aria-labelledby="plug-title">
      <div className={["container", styles.inner].join(" ")}>
        <div className={[home.head, styles.head].join(" ")}>
          <span className="eyebrow" data-head>
            MCP and API
          </span>
          <h2 id="plug-title" className={[home.title, home.titleSm].join(" ")} data-head>
            Use it where you already work.
          </h2>
          <p className={home.lead} data-head>
            Every agent is also a tool. Add WOVI to Claude or Cursor over MCP, to ChatGPT as a custom GPT action, call the API from your own software, or let
            your own agents call ours. Same agents, same Brand Brain, same checks.
          </p>
          <ul className={styles.points} data-head>
            <li>
              <Icon name="check" size={18} /> One key for every agent
            </li>
            <li>
              <Icon name="check" size={18} /> Typed inputs and outputs, so agents chain safely
            </li>
            <li>
              <Icon name="check" size={18} /> Runs return an id at once and report back by webhook when done
            </li>
          </ul>
        </div>

        <div className={[home.panel, styles.panel].join(" ")} data-panel>
          <div className={styles.bar}>
            <div className={styles.tabs} role="tablist" aria-label="Integration">
              {CODE_TABS.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={t.id === tab} className={[styles.tab, t.id === tab ? styles.tabOn : ""].join(" ")} onClick={() => pick(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
            <button type="button" className={styles.copy} onClick={copy} aria-label="Copy code">
              <Icon name={copied ? "check" : "copy"} size={16} /> {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className={styles.code} data-lang={current.lang}>
            <code>{code}</code>
            {shown !== Number.MAX_SAFE_INTEGER && <span className={styles.caret} aria-hidden="true" />}
          </pre>
        </div>
      </div>
    </section>
  );
}
