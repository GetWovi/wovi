"use client";

import { useId, type ReactNode } from "react";
import styles from "./Toggle.module.css";

export type ToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  size?: "sm" | "md";
};

/** Toggle: an on/off switch. On is Cobalt. */
export function Toggle({ checked, onChange, label, description, disabled = false, size = "md" }: ToggleProps) {
  const id = useId();
  return (
    <div className={[styles.row, disabled ? styles.disabled : ""].filter(Boolean).join(" ")}>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-desc` : undefined}
        disabled={disabled}
        className={[styles.toggle, styles[size], checked ? styles.on : ""].filter(Boolean).join(" ")}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.knob} aria-hidden="true" />
      </button>
      {(label || description) && (
        <span className={styles.text}>
          {label && (
            <label htmlFor={id} className={styles.label}>
              {label}
            </label>
          )}
          {description && (
            <span id={`${id}-desc`} className={styles.description}>
              {description}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
