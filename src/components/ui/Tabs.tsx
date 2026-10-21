"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import styles from "./Tabs.module.css";

export type TabItem = { id: string; label: ReactNode; content?: ReactNode; count?: number };

export type TabsProps = {
  items: TabItem[];
  defaultId?: string;
  value?: string;
  onChange?: (id: string) => void;
  /** pill = filled background behind the active tab, line = underline */
  variant?: "pill" | "line";
};

export function Tabs({ items, defaultId, value, onChange, variant = "pill" }: TabsProps) {
  const [inner, setInner] = useState(defaultId ?? items[0]?.id);
  const active = value ?? inner;
  const baseId = useId();

  function select(id: string) {
    setInner(id);
    onChange?.(id);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const idx = items.findIndex((t) => t.id === active);
    if (idx < 0) return;
    let next = idx;
    if (e.key === "ArrowRight") next = (idx + 1) % items.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else return;
    e.preventDefault();
    select(items[next].id);
    document.getElementById(`${baseId}-tab-${items[next].id}`)?.focus();
  }

  const current = items.find((t) => t.id === active);

  return (
    <div className={styles.tabs}>
      <div role="tablist" className={[styles.list, styles[variant]].join(" ")} onKeyDown={onKeyDown}>
        {items.map((t) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`${baseId}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              className={[styles.tab, selected ? styles.active : ""].filter(Boolean).join(" ")}
              onClick={() => select(t.id)}
            >
              {t.label}
              {typeof t.count === "number" && <span className={styles.count}>{t.count}</span>}
            </button>
          );
        })}
      </div>
      {current?.content !== undefined && (
        <div role="tabpanel" id={`${baseId}-panel-${current.id}`} aria-labelledby={`${baseId}-tab-${current.id}`} className={styles.panel}>
          {current.content}
        </div>
      )}
    </div>
  );
}
