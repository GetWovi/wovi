/**
 * How WOVI names itself on the legal pages and when they took effect. The one
 * place to change them: every legal page, receipt and email reads from here.
 * WOVI is named only as WOVI: never a person, a company, a city or a country.
 * Client-safe.
 */

/** The name the terms, the privacy notice, receipts and emails use. */
export const OPERATOR = { name: "WOVI" };

/** One address for everything: support, privacy requests, reports, authorities. Answered by a person. */
export const CONTACT_EMAIL = "hello@wovi.app";

/** When the current terms, privacy notice and own-risk notice took effect (ISO date). */
export const EFFECTIVE_DATE = "2026-10-23";

/** The operator in one line: "WOVI". */
export function operatorLine(): string {
  return OPERATOR.name;
}

/** "23 October 2026". */
export function effectiveWords(iso = EFFECTIVE_DATE): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * The words a buyer ticks before paying (Consumer Rights Directive Art. 8(8)
 * and 16(a)). Credits run a service that
 * starts at once, so the buyer asks for that and accepts what it means for
 * the right of withdrawal. Stored with each top-up, word for word.
 */
export const PURCHASE_CONSENT =
  "Start my credits now. If I withdraw within 14 days I get back the credits I have not used, and once all of them are used I can no longer withdraw.";

/** How long a buyer may withdraw from a purchase, in days (Consumer Rights Directive Art. 9). */
export const WITHDRAWAL_DAYS = 14;

/** The words for using edits to improve agents (GDPR Art. 7). Off until the person turns it on. */
export const IMPROVE_CONSENT = {
  version: "2026-10-23",
  label: "Use my edits to improve agents",
  text: "When you ask for changes or edit a result, the builder of that agent may read your note and the draft to make the agent better. Off by default. Turning it off stops this for everything from then on.",
};

/** The words a person ticks before a file is stored (copyright, product doc section 11). Stored with each upload. */
export const UPLOAD_RIGHTS = "I own this, or I have the rights to use it here.";
