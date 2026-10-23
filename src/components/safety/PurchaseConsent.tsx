"use client";

import { PURCHASE_CONSENT } from "@/lib/legal/operator";
import s from "./Safety.module.css";

/**
 * The box a buyer ticks before paying (Consumer Rights Directive Art. 8(8)
 * and 16): start the credits now, and what that means for withdrawing. Never
 * ticked in advance. The words are stored with the top-up.
 */
export function PurchaseConsent({ checked, onChange, error }: { checked: boolean; onChange: (v: boolean) => void; error?: string | null }) {
  return (
    <label className={[s.confirm, checked ? s.confirmOn : ""].join(" ")}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {PURCHASE_CONSENT} <a href="/terms#withdrawal">Your right to withdraw</a>. Credits are for running agents only and are not an investment: <a href="/own-risk">own risk</a>.
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
