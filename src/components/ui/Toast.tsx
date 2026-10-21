"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Mascot } from "@/components/brand/Mascot";
import { Icon } from "./Icon";
import styles from "./Toast.module.css";

export type ToastTone = "info" | "success" | "warning";

export type ToastInput = {
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  /** ms until it leaves; 0 keeps it until dismissed */
  duration?: number;
};

type ToastItem = ToastInput & { id: number };

type ToastApi = {
  toast: (t: ToastInput) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast needs a ToastProvider above it");
  return api;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (t: ToastInput) => {
      const id = ++seq.current;
      setItems((list) => [...list, { ...t, id }].slice(-4));
      const duration = t.duration ?? 4500;
      if (duration > 0) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss],
  );

  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.region} role="region" aria-label="Notifications">
        {items.map((t) => (
          <Toast key={t.id} {...t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** One toast. Success brings Wovi celebrating. Exported for the design page. */
export function Toast({ title, description, tone = "info", onDismiss, static: isStatic }: ToastInput & { onDismiss?: () => void; static?: boolean }) {
  return (
    <div className={[styles.toast, styles[tone], isStatic ? styles.static : ""].filter(Boolean).join(" ")} role="status">
      <span className={styles.lead}>
        {tone === "success" ? <Mascot pose="done" size={44} label="" /> : <Icon name={tone === "warning" ? "warning" : "info"} size={22} />}
      </span>
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        {description && <span className={styles.description}>{description}</span>}
      </span>
      {onDismiss && (
        <button type="button" className={styles.close} onClick={onDismiss} aria-label="Dismiss">
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
}
