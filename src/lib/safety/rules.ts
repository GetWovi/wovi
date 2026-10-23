/**
 * Content rules (phase 18): what WOVI will not write, as data. Every rule is
 * a regular expression in one of nine categories. The same rules read a
 * request before it runs (a match refuses the run before any credit is held)
 * and, for the hard categories, every draft the model writes (a match is sent
 * back for a rewrite and, when it stays, the draft is withheld and nothing is
 * charged). Client-safe: no storage, no Node.
 *
 * Sources: product doc section 11 (misleading content, brand and harmful
 * content, copyright), the platforms' community rules (TikTok Integrity and
 * Authenticity, Meta Community Standards on spam, impersonation and fraud,
 * YouTube fake engagement, spam and impersonation, X authenticity and
 * impersonation) and the music rules of each platform. See docs/safety.md.
 *
 * The rules are deliberately narrow: a business writing about its own
 * product should never trip them. Per-agent additions live in the agent's
 * spec (`safety.block`), as plain phrases.
 */

export const SAFETY_CATEGORIES = [
  "fake_reviews",
  "impersonation",
  "deepfake",
  "false_claims",
  "hate",
  "harassment",
  "sexual",
  "unsafe",
  "copyrighted_music",
] as const;
export type SafetyCategory = (typeof SAFETY_CATEGORIES)[number];

export type CategoryInfo = {
  /** Short name on screen. */
  label: string;
  /** The refusal, in plain words. */
  refusal: string;
  /**
   * Hard categories are also read on every draft the model writes, on every
   * agent: a draft that keeps one is withheld. The others are read on the
   * request only; on drafts they are the quality gate's claims check, which
   * sends them to a person.
   */
  hard: boolean;
};

export const CATEGORY_INFO: Record<SafetyCategory, CategoryInfo> = {
  fake_reviews: {
    label: "Fake reviews or testimonials",
    refusal: "WOVI does not write fake reviews, testimonials or customer quotes. Reviews have to come from real customers: paste a real one and say who it is from.",
    hard: false,
  },
  impersonation: {
    label: "Speaking as someone else",
    refusal: "WOVI does not write as a real person or brand that is not you.",
    hard: false,
  },
  deepfake: {
    label: "Deepfakes",
    refusal: "WOVI does not make deepfakes or fake recordings of real people. A real person's face or voice needs their documented consent.",
    hard: false,
  },
  false_claims: {
    label: "False claims",
    refusal: "WOVI does not write claims that are false or that you cannot back up, like cures, guaranteed results or made-up numbers.",
    hard: false,
  },
  hate: {
    label: "Hate",
    refusal: "WOVI does not write content that attacks people for who they are.",
    hard: true,
  },
  harassment: {
    label: "Harassment",
    refusal: "WOVI does not write content that threatens, harasses or exposes a person.",
    hard: true,
  },
  sexual: {
    label: "Sexual content",
    refusal: "WOVI does not write sexual content.",
    hard: true,
  },
  unsafe: {
    label: "Unsafe advice",
    refusal: "WOVI does not write advice that could hurt someone, like stopping medicine, starving, dangerous challenges or weapons.",
    hard: true,
  },
  copyrighted_music: {
    label: "Copyrighted music",
    refusal:
      "WOVI cannot pick copyrighted songs. Use a sound from the platform's own library: the TikTok Commercial Music Library, the Meta Sound Collection or the YouTube Audio Library. WOVI can describe the mood of the sound instead.",
    hard: false,
  },
};

export type SafetyRule = {
  id: string;
  category: SafetyCategory;
  /** A regular expression source, matched case-insensitively. */
  pattern: string;
  /**
   * The first group is a name: it must start with a capital letter in the
   * text as written, so "pretend to be Elon Musk" matches and "pretend to be
   * a customer" does not.
   */
  properName?: boolean;
  /** Names the first group may not be (the platforms' own libraries, "our", "my"). Case-insensitive. */
  exceptNames?: string;
  /** Read on requests, drafts or both. Defaults to both for hard categories and to requests for the rest. */
  on?: "request" | "output" | "both";
};

const GROUPS =
  "(?:immigrants|migrants|refugees|muslims|jews|christians|hindus|sikhs|buddhists|atheists|black people|blacks|white people|whites|asians|latinos|latinas|hispanics|mexicans|arabs|africans|gays|gay people|lesbians|bisexuals|trans people|transgender people|queer people|women|men|disabled people|the disabled|roma|gypsies)";
const NAME = "([A-Za-z][\\w.'&-]+(?:\\s+[A-Z][\\w.'&-]+)?)";
const NOT_NEGATED = "(?<!(?:don'?t|do not|never|not|n't|stop)\\s+(?:to\\s+)?)";

export const SAFETY_RULES: readonly SafetyRule[] = [
  /* ---------- Fake reviews and testimonials ---------- */
  {
    id: "fake_reviews.adjective",
    category: "fake_reviews",
    pattern:
      "\\b(?:fake|made[- ]up|invented|fabricated|fictional|bogus|phony|false|imaginary)\\s+(?:\\d+\\s+)?(?:customer\\s+|client\\s+|user\\s+|5[- ]star\\s+|five[- ]star\\s+|google\\s+|amazon\\s+|yelp\\s+|trustpilot\\s+)?(?:reviews?|testimonials?|ratings?|endorsements?|customer stories|success stories)\\b",
  },
  {
    id: "fake_reviews.as_if",
    category: "fake_reviews",
    pattern: "\\b(?:write|make|create|generate|draft|invent|post)\\b[^.\\n]{0,40}\\b(?:reviews?|testimonials?)\\b[^.\\n]{0,40}\\b(?:as if|pretending|posing as|in the name of|from the point of view of)\\b",
  },
  {
    id: "fake_reviews.pose",
    category: "fake_reviews",
    pattern: "\\b(?:pretend(?:ing)? to be|pos(?:e|ing) as)\\s+(?:a |an |our |my |one of our )?(?:happy |satisfied |real |verified |loyal )?(?:customers?|clients?|buyers?|patients?|users?|reviewers?)\\b",
  },
  {
    id: "fake_reviews.astroturf",
    category: "fake_reviews",
    pattern: "\\b(?:sock ?puppets?|astroturf\\w*|review swap\\w*|buy(?:ing)? reviews)\\b",
  },

  /* ---------- Impersonation ---------- */
  {
    id: "impersonation.pretend",
    category: "impersonation",
    pattern: `\\b(?:pretend(?:ing)? to be|pos(?:e|ing) as|write as if (?:you are|you were|it(?:'s| is| was) from)|speak(?:ing)? as if (?:you are|you were)|sign (?:it|this|the post) as|as if (?:it was |it were )?(?:written|posted|said) by)\\s+(?:the\\s+)?${NAME}`,
    properName: true,
  },
  {
    id: "impersonation.word",
    category: "impersonation",
    pattern: "\\bimpersonat(?:e|ing|ion of)\\s+\\w",
  },
  {
    id: "impersonation.fake_account",
    category: "impersonation",
    pattern: "\\bfake (?:account|profile|page|statement|announcement|endorsement|quote|press release)s? (?:of|from|for|by)\\b",
  },

  /* ---------- Deepfakes ---------- */
  { id: "deepfake.word", category: "deepfake", pattern: "\\b(?:deep ?fakes?|face ?swap\\w*)\\b" },
  {
    id: "deepfake.clone",
    category: "deepfake",
    pattern: "\\b(?:clone|cloning|copy|mimic)\\s+(?:the |his |her |their |a )?(?:voice|face|likeness)\\s+of\\b|\\bvoice ?clon\\w* of\\b",
  },
  {
    id: "deepfake.make_it_look",
    category: "deepfake",
    pattern: `\\bmake (?:it )?(?:look|sound|seem) like\\s+${NAME}\\s+(?:said|says|did|does|is saying|endorsed|endorses|recommends|recommended|admitted|uses|used)\\b`,
    properName: true,
  },
  {
    id: "deepfake.fake_media",
    category: "deepfake",
    pattern: "\\bfake (?:video|audio|clip|photo|image|recording|interview|voice ?note|call)s? (?:of|with|from|showing)\\b",
  },

  /* ---------- False claims ---------- */
  {
    id: "false_claims.cures",
    category: "false_claims",
    pattern:
      "\\b(?:say|says|claim|claims|state|promise|guarantee|tell (?:people|them|viewers|followers|customers)|write that|make it sound like)\\b[^.\\n]{0,60}\\b(?:cures?|heals?|reverses?|prevents?)\\s+(?:cancer|diabetes|covid|autism|depression|anxiety|alzheimer'?s|hiv|adhd|arthritis|disease|any disease|infertility)\\b",
  },
  {
    id: "false_claims.promises",
    category: "false_claims",
    pattern:
      "\\b(?:say|says|claim|claims|state|promise|write that|tell (?:people|them|viewers|followers|customers))\\b[^.\\n]{0,60}\\b(?:guaranteed? (?:results|returns|income|profits?|weight loss|followers|sales)|100% (?:safe|effective|guaranteed)|no side effects|fda[- ]approved|clinically proven|doctor[- ]recommended|risk[- ]free (?:returns?|investment))\\b",
  },
  {
    id: "false_claims.even_though",
    category: "false_claims",
    pattern:
      "\\b(?:say|claim|write|tell (?:people|them|viewers|followers|customers)|pretend)\\b[^.\\n]{0,80}\\b(?:even though|although|though|when (?:in fact|really))\\b[^.\\n]{0,30}\\b(?:isn'?t|aren'?t|is not|are not|doesn'?t|does not|don'?t|do not|didn'?t|did not|wasn'?t|was not|never|not true|false)\\b",
  },
  { id: "false_claims.deceive", category: "false_claims", pattern: "\\b(?:lie to|mislead|deceive|trick|fool)\\s+(?:our |my |the )?(?:customers|people|followers|viewers|buyers|audience|clients)\\b" },
  { id: "false_claims.fake_urgency", category: "false_claims", pattern: "\\bfake (?:scarcity|countdown|discount|sale|urgency|stock levels?|limited offer)\\b" },
  {
    id: "false_claims.made_up_numbers",
    category: "false_claims",
    pattern: "\\b(?:make up|invent|fabricate|fake)\\b[^.\\n]{0,20}\\b(?:statistics?|stats|numbers|studies|study|data|results|figures|research)\\b",
  },

  /* ---------- Hate ---------- */
  {
    id: "hate.dehumanising",
    category: "hate",
    pattern: `\\b(?:all|those|these|most|the)\\s+${GROUPS}\\s+(?:are|is)\\s+(?:vermin|animals|parasites|subhuman|sub-human|scum|filth|savages|a (?:disease|plague|cancer|virus)|(?:the )?enemy|inferior|evil|criminals|rapists|terrorists|not human)\\b`,
  },
  { id: "hate.violence", category: "hate", pattern: `\\b(?:kill|exterminate|eradicate|wipe out|get rid of|gas|lynch|purge)\\s+(?:all\\s+)?(?:the\\s+)?${GROUPS}\\b` },
  {
    id: "hate.ask",
    category: "hate",
    pattern: "\\b(?:write|make|create|draft|post|generate)\\b[^.\\n]{0,40}\\b(?:racist|sexist|homophobic|transphobic|antisemitic|anti-semitic|islamophobic|xenophobic|bigoted|hateful)\\b",
    on: "request",
  },
  {
    id: "hate.mock_identity",
    category: "hate",
    pattern: "\\b(?:mock|insult|demean|belittle|ridicule)\\w*\\b[^.\\n]{0,30}\\b(?:race|religion|ethnicity|disability|sexuality|sexual orientation|gender identity|skin colou?r)\\b",
  },
  { id: "hate.slogans", category: "hate", pattern: "\\b(?:white (?:power|supremacy)|heil hitler|sieg heil|great replacement)\\b" },

  /* ---------- Harassment ---------- */
  { id: "harassment.self_harm_insult", category: "harassment", pattern: "\\b(?:kill yourself|kys|go die|hope you die|unalive yourself)\\b" },
  { id: "harassment.dox", category: "harassment", pattern: "\\b(?:dox+|doxx?ing|doxing)\\b" },
  {
    id: "harassment.expose",
    category: "harassment",
    pattern:
      "\\b(?:leak|expose|publish|post|share)\\w*\\s+(?:his|her|their|my ex'?s?|this (?:person|guy|girl|woman|man)'?s?)\\s+(?:home )?(?:address|phone number|number|location|private \\w+|nudes|medical records)\\b",
  },
  {
    id: "harassment.target",
    category: "harassment",
    pattern: "\\b(?:harass|bully|threaten|intimidate|stalk|cyberbully)(?:ing)?\\s+(?:him|her|them|my ex|this (?:person|guy|girl|woman|man|account|creator|reviewer|customer)|@\\w+)",
  },
  { id: "harassment.threat", category: "harassment", pattern: "\\b(?:write|draft|make|send)\\b[^.\\n]{0,20}\\b(?:a )?(?:death threat|threatening (?:message|post|comment|reply|dm))\\b" },
  { id: "harassment.attack_handle", category: "harassment", pattern: "\\b(?:insult|attack|harass|humiliate|trash)\\w*\\s+@\\w+" },
  { id: "harassment.brigade", category: "harassment", pattern: "\\b(?:brigad(?:e|ing)|mass[- ]report\\w*|pile[- ]on)\\b" },

  /* ---------- Sexual content ---------- */
  {
    id: "sexual.explicit",
    category: "sexual",
    pattern: "\\b(?:porn\\w*|nsfw|xxx|hentai|explicit sex\\w*|sexually explicit|sex scenes?|erotica|erotic (?:story|stories|content|photos?|images?|videos?)|sexting)\\b",
  },
  {
    id: "sexual.nudes",
    category: "sexual",
    pattern: "\\bnudes\\b|\\b(?:nude|naked|topless) (?:photos?|pics?|pictures?|images?|selfies?|videos?|shots?)\\b|\\bonlyfans (?:leaks?|content)\\b",
  },
  {
    id: "sexual.minors",
    category: "sexual",
    pattern: "\\b(?:sexual|sexy|seductive|erotic|nude|naked|lingerie)\\b[^.\\n]{0,40}\\b(?:minors?|child|children|kids?|underage|schoolgirls?|schoolboys?|1[0-7][- ]?(?:year|yr)[- ]?olds?)\\b",
  },

  /* ---------- Unsafe advice ---------- */
  {
    id: "unsafe.medicine",
    category: "unsafe",
    pattern: `\\b${NOT_NEGATED}(?:stop|skip|quit|ditch|replace)\\s+(?:taking\\s+)?(?:your\\s+)?(?:medication|medicine|meds|insulin|chemo(?:therapy)?|antidepressants|prescriptions?|vaccines?)\\b`,
  },
  { id: "unsafe.no_doctor", category: "unsafe", pattern: "\\b(?:no need to|you don'?t need to|instead of)\\s+(?:see|seeing|visit|visiting|ask|asking|consult|consulting)\\s+(?:a|your)\\s+(?:doctor|gp|physician|dentist|vet|therapist|midwife)\\b" },
  {
    id: "unsafe.ingest",
    category: "unsafe",
    pattern: "\\b(?:drink|ingest|swallow|inject|gargle)\\w*\\b[^.\\n]{0,30}\\b(?:bleach|turpentine|chlorine dioxide|mms|kerosene|methanol|antifreeze)\\b",
  },
  { id: "unsafe.eating", category: "unsafe", pattern: "\\b(?:starve yourself|pro[- ]ana|pro[- ]mia|thinspo\\w*|thinspiration)\\b|\\b(?:[1-7]\\d{2}|\\d{2})\\s*(?:calories|kcal)\\s+(?:a|per)\\s+day\\b" },
  { id: "unsafe.weapons", category: "unsafe", pattern: "\\b(?:make|build|assemble|3d[- ]print)\\s+(?:a\\s+|an\\s+)?(?:bomb|pipe bomb|explosives?|molotov|untraceable gun|ghost gun)\\b" },
  { id: "unsafe.self_harm", category: "unsafe", pattern: "\\b(?:self[- ]harm|cutting yourself|suicide)\\b[^.\\n]{0,20}\\b(?:tips|methods|how to|challenge|guide)\\b" },
  { id: "unsafe.challenges", category: "unsafe", pattern: "\\b(?:blackout|choking|fainting|tide ?pod|skull ?breaker|benadryl)\\s+challenge\\b" },

  /* ---------- Copyrighted music ---------- */
  {
    id: "music.by_artist",
    category: "copyrighted_music",
    pattern: `\\b(?:use|add|put|play|set (?:it |this )?to|over|backed by|soundtrack(?:ed)? (?:with|by)|with)\\b[^.\\n]{0,30}\\b(?:song|track|music|tune|hit|single|banger)\\b[^.\\n]{0,25}\\b(?:by|from)\\s+${NAME}`,
    properName: true,
    exceptNames: "^(?:tiktok|tik tok|instagram|youtube|meta|facebook|capcut|our|my|your|commercial|audio|sound|epidemic|artlist|creative)\\b",
    on: "both",
  },
  {
    id: "music.quoted_title",
    category: "copyrighted_music",
    pattern: `["“][^"”\\n]{2,60}["”]\\s+by\\s+${NAME}`,
    properName: true,
    exceptNames: "^(?:tiktok|instagram|youtube|meta|our|my|your)\\b",
    on: "both",
  },
  { id: "music.popular", category: "copyrighted_music", pattern: "\\b(?:copyrighted|chart|top[- ]40|billboard|mainstream|famous|radio)\\s+(?:song|songs|track|tracks|music|hit|hits)\\b" },
  { id: "music.ripped", category: "copyrighted_music", pattern: "\\b(?:ripped|downloaded|taken|grabbed)\\s+from\\s+(?:spotify|apple music|youtube|soundcloud)\\b" },
];

/** Whether a rule reads requests, drafts, or both. */
export function ruleReads(rule: SafetyRule, where: "request" | "output"): boolean {
  const on = rule.on ?? (CATEGORY_INFO[rule.category].hard ? "both" : "request");
  return on === "both" || on === where;
}
