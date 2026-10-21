"use client";

import { useEffect, useRef, type RefObject } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

let registered = false;
export function gsapReady() {
  if (!registered && typeof window !== "undefined") {
    gsap.registerPlugin(ScrollTrigger);
    registered = true;
  }
  return gsap;
}

/**
 * Runs a GSAP setup inside gsap.context, scoped to a ref, with
 * matchMedia so motion is calm under prefers-reduced-motion and
 * layouts can differ between phone and desktop.
 */
export function useScrollScene<T extends HTMLElement>(
  build: (ctx: { el: T; gsap: typeof gsap; ScrollTrigger: typeof ScrollTrigger; desktop: boolean; reduce: boolean }) => void | (() => void),
  deps: unknown[] = [],
): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const g = gsapReady();
    const mm = g.matchMedia();
    mm.add(
      {
        desktop: "(min-width: 900px)",
        phone: "(max-width: 899px)",
        reduce: "(prefers-reduced-motion: reduce)",
        motion: "(prefers-reduced-motion: no-preference)",
      },
      (c) => {
        const conditions = c.conditions as { desktop: boolean; reduce: boolean };
        return build({ el, gsap: g, ScrollTrigger, desktop: conditions.desktop, reduce: conditions.reduce }) ?? undefined;
      },
      el,
    );
    return () => mm.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

/** Simple fade-and-rise reveal for every child matching the selector. */
export function reveal(gsapInstance: typeof gsap, el: HTMLElement, selector: string, opts: { stagger?: number; y?: number; reduce?: boolean; start?: string } = {}) {
  const items = el.querySelectorAll(selector);
  if (!items.length) return;
  if (opts.reduce) {
    gsapInstance.set(items, { opacity: 1, y: 0 });
    return;
  }
  gsapInstance.fromTo(
    items,
    { opacity: 0, y: opts.y ?? 28 },
    {
      opacity: 1,
      y: 0,
      duration: 0.9,
      ease: "power3.out",
      stagger: opts.stagger ?? 0.08,
      scrollTrigger: { trigger: el, start: opts.start ?? "top 78%", once: true },
    },
  );
}
