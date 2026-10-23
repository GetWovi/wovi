/** The report reasons and outcomes in words (phase 18). Client-safe: no storage. */

export const REPORT_REASONS = ["illegal", "copyright", "privacy", "impersonation", "hate_harassment", "sexual", "misleading", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_WORDS: Record<ReportReason, string> = {
  illegal: "Illegal content",
  copyright: "Copyright or someone else's work",
  privacy: "My personal data or privacy",
  impersonation: "Impersonation or a deepfake",
  hate_harassment: "Hate or harassment",
  sexual: "Sexual content",
  misleading: "Fake reviews or false claims",
  other: "Breaks WOVI's terms in another way",
};

export const REPORT_OUTCOMES = ["removed", "no_action", "restricted"] as const;
export type ReportOutcome = (typeof REPORT_OUTCOMES)[number];

export const REPORT_OUTCOME_WORDS: Record<ReportOutcome, string> = {
  removed: "Taken down",
  restricted: "Account restricted",
  no_action: "No action",
};
