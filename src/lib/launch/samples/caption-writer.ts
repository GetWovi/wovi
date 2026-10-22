import type { Platform } from "@/lib/agents/catalog";
import type { RunOutput } from "@/lib/runs/output";
import type { LaunchSample } from "./types";

const captions = (set: Partial<Record<Platform, string[]>>): RunOutput => ({
  kind: "caption_set",
  captions: Object.entries(set).map(([platform, variants]) => ({ platform: platform as Platform, variants: variants! })),
});

export const CAPTION_WRITER_SAMPLES: LaunchSample[] = [
  {
    title: "Gerald rising overnight",
    label: "gold",
    brain: "Crumb and Co",
    inputs: {
      post: "Time-lapse of Gerald, our nine-year-old sourdough starter, rising overnight next to the oven.",
      platforms: ["tiktok", "reels"],
      length: "short",
    },
    ideal: captions({
      tiktok: [
        "Our sourdough starter Gerald, rising overnight next to the oven. Nine years old and still the first one up.",
        "Sourdough starter time-lapse. Gerald rose overnight. We were asleep.",
      ],
      reels: [
        "Nine years old and still the first one up. Gerald, our sourdough starter, overnight by the oven.",
        "Gerald rose. We did not. Every sourdough loaf this week starts with him.",
      ],
    }),
    note: "Short and dry, names Gerald, puts sourdough starter where TikTok search can read it, and ends on a small joke. No hashtags, no exclamation marks.",
  },
  {
    title: "Squat cues with a free intro",
    label: "gold",
    brain: "Northside Strength",
    inputs: {
      post: "Coach Sam correcting a new member's squat: knees out, chest up, slower on the way down. It is the member's second session.",
      platforms: ["reels", "tiktok"],
      length: "medium",
      details: "Free intro session every Saturday at 10. Book through the link in bio.",
      action: "visit",
    },
    ideal: captions({
      reels: [
        "Second session, first proper squat. Coach Sam's three cues: knees out, chest up, slower on the way down. Form first, weight later. Free intro session every Saturday at 10. Book through the link in bio.",
        "Nobody gets the squat right in their first week. That is what Sam is for. Knees out, chest up, slow on the way down. Free intro session every Saturday at 10. Book through the link in bio.",
      ],
      tiktok: [
        "How to squat as a beginner: knees out, chest up, slower on the way down. Coach Sam, second session, no rush. Free intro session every Saturday at 10. Book through the link in bio.",
        "This was their second session ever. Watch Sam fix the squat in three cues. Free intro session every Saturday at 10. Book through the link in bio.",
      ],
    }),
    note: "The cues are the value, the facts appear word for word, the member stays unnamed, and the next step is the real one they gave.",
  },
  {
    title: "Due dates now filled in",
    label: "gold",
    brain: "Tallybook",
    inputs: {
      post: "Screen recording: creating an invoice in Tallybook. The due date field now fills in a real date, 14 days from today, instead of 'Payment terms: 30 days'.",
      platforms: ["x", "shorts"],
      length: "short",
      details: "Live for all accounts from today.",
      action: "save",
    },
    ideal: captions({
      x: [
        "New in Tallybook: the due date fills in as a real date, 14 days from today, instead of 'Payment terms: 30 days'. Live for all accounts from today. Save this for your next invoice.",
        "Your invoice is not late. Their payment is. Now the date says so: Tallybook fills in a real due date, 14 days from today. Live for all accounts from today. Worth saving.",
      ],
      shorts: [
        "Tallybook now fills in a real due date\nEvery new invoice gets a due date 14 days from today instead of 'Payment terms: 30 days'. Live for all accounts from today. Save this for your next invoice.",
        "Put a date on your invoice, not 30 days\nTallybook does it for you now: 14 days from today, filled in. Live for all accounts from today. Save this before your next invoice.",
      ],
    }),
    note: "X stays well under 280 characters, the Shorts captions open with a searchable title, the fact appears exactly, and nothing is salesy.",
  },
  {
    title: "The 1 a.m. decaf pour",
    label: "gold",
    brain: "Night Owl Coffee",
    inputs: {
      post: "Slow pour of decaf into a cup at the bar, neon sign behind, 1 a.m. on the clock.",
      platforms: ["x", "reels"],
      length: "short",
      details: "decaf after midnight, same price",
      action: "nothing",
    },
    ideal: captions({
      x: ["decaf after midnight, same price. still open, still warm. you still get to sleep.", "1 a.m. on the clock, one more cup on the bar. decaf after midnight, same price ☕"],
      reels: [
        "decaf after midnight, same price. for the night shift, the second shift and the no shift.",
        "the 1 a.m. pour. decaf after midnight, same price. one more cup, and you still sleep tonight.",
      ],
    }),
    note: "lowercase, under three lines, one emoji at most, the fact word for word, and no call to action because none was asked for.",
  },
  {
    title: "Slop curry caption",
    label: "bad",
    brain: "Twelve Quid Kitchen",
    inputs: { post: "Me cooking a chickpea curry that cost 61p a portion.", platforms: ["tiktok", "reels"], length: "short" },
    ideal: captions({
      tiktok: ["This yummy guilt-free curry is a total game changer! 😍🔥 #foodie #budget #fyp", "You won't believe how cheap this is! Unlock your inner chef today! 🙌"],
      reels: ["Elevate your weeknight dinners with this superfood curry! ✨ #healthy #recipe", "Healthy eating has never been easier! Link in bio! 🙌"],
    }),
    note: "Slop: the brand's banned words (yummy, guilt-free, superfood, foodie), stock phrases, hashtags, emoji spam, diet talk and a link in bio nobody gave. The 61p, the real hook, is missing.",
  },
];
