import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Icon } from "./Icon";
import styles from "./Field.module.css";

type FieldChrome = {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Icon or short text shown at the start of the control. */
  leading?: ReactNode;
};

function Wrap({ id, label, hint, error, children }: FieldChrome & { id: string; children: ReactNode }) {
  return (
    <div className={[styles.field, error ? styles.hasError : ""].filter(Boolean).join(" ")}>
      {label && (
        <label className={styles.label} htmlFor={id}>
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className={styles.error} id={`${id}-error`} role="alert">
          <Icon name="warning" size={16} /> {error}
        </p>
      ) : (
        hint && (
          <p className={styles.hint} id={`${id}-hint`}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}

function describedBy(id: string, hint?: ReactNode, error?: ReactNode) {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

export type InputProps = InputHTMLAttributes<HTMLInputElement> & FieldChrome;

export function Input({ label, hint, error, leading, id: givenId, className, ...rest }: InputProps) {
  const autoId = useId();
  const id = givenId ?? autoId;
  return (
    <Wrap id={id} label={label} hint={hint} error={error}>
      <div className={styles.control}>
        {leading && <span className={styles.leading}>{leading}</span>}
        <input id={id} className={[styles.input, className].filter(Boolean).join(" ")} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...rest} />
      </div>
    </Wrap>
  );
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & FieldChrome;

export function Textarea({ label, hint, error, id: givenId, className, rows = 4, ...rest }: TextareaProps) {
  const autoId = useId();
  const id = givenId ?? autoId;
  return (
    <Wrap id={id} label={label} hint={hint} error={error}>
      <div className={styles.control}>
        <textarea id={id} rows={rows} className={[styles.input, styles.textarea, className].filter(Boolean).join(" ")} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...rest} />
      </div>
    </Wrap>
  );
}

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & FieldChrome & { options: { value: string; label: string }[] };

export function Select({ label, hint, error, id: givenId, className, options, ...rest }: SelectProps) {
  const autoId = useId();
  const id = givenId ?? autoId;
  return (
    <Wrap id={id} label={label} hint={hint} error={error}>
      <div className={styles.control}>
        <select id={id} className={[styles.input, styles.select, className].filter(Boolean).join(" ")} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...rest}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className={styles.chevron}>
          <Icon name="chevron-down" size={20} />
        </span>
      </div>
    </Wrap>
  );
}
