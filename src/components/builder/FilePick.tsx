"use client";

import { Icon } from "@/components/ui/Icon";
import styles from "./Builder.module.css";

/** A file input styled as a pill, with the chosen name beside it. */
export function FilePick({ label, accept, multiple, disabled, fileName, onFiles }: { label: string; accept: string; multiple?: boolean; disabled?: boolean; fileName?: string | null; onFiles: (list: FileList | null) => void }) {
  return (
    <>
      <label className={styles.filePick}>
        <Icon name="upload" size={18} />
        {label}
        <input type="file" accept={accept} multiple={multiple} disabled={disabled} className="visually-hidden" onChange={(e) => onFiles(e.target.files)} />
      </label>
      {fileName && <span className={styles.fileName}>{fileName}</span>}
    </>
  );
}
