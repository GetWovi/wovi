"use client";

import { UPLOAD_RIGHTS } from "@/lib/legal/operator";
import s from "./Safety.module.css";

/** The box ticked before a file is stored. The upload is refused without it (src/lib/safety/rights.ts). */
export function RightsCheck({ checked, onChange, error }: { checked: boolean; onChange: (v: boolean) => void; error?: string | null }) {
  return (
    <label className={[s.confirm, checked ? s.confirmOn : ""].join(" ")}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {UPLOAD_RIGHTS} No one else&apos;s photos, video, music or artwork without their permission. <a href="/terms#your-content">Why</a>
        {error && (
          <>
            {" "}
            <b role="alert">{error}</b>
          </>
        )}
      </span>
    </label>
  );
}
