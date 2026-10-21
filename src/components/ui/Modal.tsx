"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";
import styles from "./Modal.module.css";

type OverlayProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Sheet only: which edge it slides from. */
  side?: "bottom" | "right";
};

function useDismiss(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
}

function Overlay({ open, onClose, title, children, footer, kind, side }: OverlayProps & { kind: "modal" | "sheet" }) {
  useDismiss(open, onClose);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;
  const panelCls = [styles.panel, kind === "sheet" ? styles.sheet : styles.modal, kind === "sheet" ? styles[`side-${side ?? "bottom"}`] : ""].filter(Boolean).join(" ");
  return (
    <div className={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panelRef} className={panelCls} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} tabIndex={-1}>
        {kind === "sheet" && side !== "right" && <span className={styles.grab} aria-hidden="true" />}
        <div className={styles.head}>
          {title && (
            <h3 id={titleId} className={styles.title}>
              {title}
            </h3>
          )}
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}

/** Modal: a centred dialog for a decision or a short form. */
export function Modal(props: OverlayProps) {
  return <Overlay {...props} kind="modal" />;
}

/** Sheet: slides from the bottom on phones or the right on wide screens. */
export function Sheet(props: OverlayProps) {
  return <Overlay {...props} kind="sheet" />;
}
