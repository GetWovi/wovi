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
  {
    title: "Copper with a soft root",
    label: "gold",
    brain: "Chair Nine",
    inputs: {
      post: "Hannah's copper balayage over her natural mid brown, filmed in window light with no filter. The root is left soft so it grows out without a line. Three and a half hours. She asked for colour she would not need to touch up every six weeks. Shown with her permission.",
      platforms: ["tiktok", "x"],
      length: "medium",
      details: "Toner refresh every 8 weeks. Free consult for new clients, book on our website.",
      action: "visit",
    },
    ideal: captions({
      tiktok: [
        "copper balayage on natural mid brown, root left soft so it grows out without a line. three and a half hours in chair nine, window light, no filter on the colour. Toner refresh every 8 weeks. Free consult for new clients, book on our website.",
        "hannah wanted colour she would not have to touch up every six weeks, so we left her root alone. her own brown up top, copper through the lengths. Toner refresh every 8 weeks. Free consult for new clients, book on our website.",
      ],
      x: [
        "Copper balayage over a natural mid brown. The root stays soft, so it grows out without a line. Three and a half hours, no filter. Toner refresh every 8 weeks. Free consult for new clients, book on our website.",
        "Half of this copper is the bit we left alone. Hannah's own brown at the root, copper through the lengths, nothing to touch up at six weeks. Toner refresh every 8 weeks. Free consult for new clients, book on our website.",
      ],
    }),
    note: "Names the technique, the time and the upkeep the way the brand asks, lowercase only on TikTok, searchable words up front, X under 280. The facts land word for word, the no-filter claim comes from the input, and no banned word or beauty-ad line slips in.",
  },
  {
    title: "Pepper the whippet, no clippers",
    label: "gold",
    brain: "Muddy Paws Grooming",
    inputs: {
      post: "Pepper, a three-year-old rescue whippet, at her first full groom with us. She is scared of the clippers. Last week was a nails-only visit so she could get used to the room. Today: a bath, a towel dry and a scissor trim, no clippers, with a break every few minutes. The clip ends with Pepper lying down on the table. She left wagging at pick-up.",
      platforms: ["reels", "shorts"],
      length: "long",
      action: "comment",
    },
    ideal: captions({
      reels: [
        "Pepper lying down on the grooming table looks like nothing. For a rescue whippet who is scared of clippers, it is the whole groom.\n\nLast week she came in for her nails only, just to meet the room and us. Today was the full groom: a bath, a towel dry and a scissor trim, no clippers at all, with a break every few minutes so she could reset.\n\nThis way is slower. That is fine. She left wagging at pick-up, and next time starts from there.\n\nDoes your dog have one part of the groom they cannot stand? Tell us which bit.",
        "Pepper, three-year-old rescue whippet, first full groom, and by the end she had decided the table was a bed. We will take that.\n\nShe is scared of the clippers, so there were none. A nails-only visit last week so the room was not new, then today a bath, a towel dry and scissors only, with plenty of breaks. Calm first, tidy second.\n\nShe left wagging at pick-up.\n\nWhat is the one thing your dog would skip at the groomer if they could? Tell us below.",
      ],
      shorts: [
        "Grooming a nervous rescue whippet without clippers\nPepper is scared of clippers, so her first full groom was a bath, a towel dry and a scissor trim, with a break every few minutes. A nails-only visit last week meant the room was not new. Which part of the groom does your dog find hardest? Tell us in the comments.",
        "Pepper's first full groom: no clippers, lots of breaks\nShe is a three-year-old rescue whippet, and by the end of the clip she is lying down on the table. Slow on purpose, and she left wagging at pick-up. Has your dog got a part of the groom they dread? Say which one in the comments.",
      ],
    }),
    note: "Uses the dog's name and breed, explains why the groom took the time it did, and shows calm handling, as the brand's dos ask. Reels front-loads the point in the first 125 characters, Shorts opens with a plain searchable title, and each variant ends on a question an owner can answer.",
  },
  {
    title: "Celadon batch 22 seconds",
    label: "gold",
    brain: "Kiln Street Ceramics",
    inputs: {
      post: "Opening the kiln on batch 22: 18 tea bowls in a new celadon glaze. Fifteen came out as planned. Three have glaze runs onto the foot; we ground them smooth and they go in the seconds sale.",
      platforms: ["x", "shorts"],
      length: "short",
      details: "Seconds sale: Sunday 1 November, 10am, on our shop page.",
      action: "buy",
    },
    ideal: captions({
      x: [
        "Batch 22: 18 tea bowls in a new celadon. Fifteen came out as planned. Three ran onto the foot and were ground smooth. Seconds sale: Sunday 1 November, 10am, on our shop page.",
        "On three of the new celadon tea bowls, the glaze ran down onto the foot. Ground smooth. Same clay, same firing, sold as seconds. Seconds sale: Sunday 1 November, 10am, on our shop page.",
      ],
      shorts: [
        "Batch 22 out of the kiln: 18 celadon tea bowls\nFifteen came out as planned, three ran onto the foot. Seconds sale: Sunday 1 November, 10am, on our shop page.",
        "What a glaze run on a tea bowl foot looks like\nThree celadon bowls from batch 22, ground smooth and going in the seconds. Seconds sale: Sunday 1 November, 10am, on our shop page.",
      ],
    }),
    note: "Quiet and exact: batch number, count and the flaw named plainly, with no countdown, no 'perfect' and no food-safe claim. One variant leads with the batch, the other with the flaw, the sale line is word for word, and nothing reuses the brand's sample lines.",
  },
  {
    title: "Boiler at 0.5 bar in Bishopston",
    label: "gold",
    brain: "Fernhill Plumbing",
    inputs: {
      post: "Combi boiler in a Bishopston kitchen. The gauge read 0.5 bar and the heating had cut out. We show the filling loop under the boiler, open both valves slowly, watch the needle reach 1.2 bar, then close them. Then we check under the boiler and round the radiator valves for drips. No leak found this time.",
      platforms: ["tiktok", "reels"],
      length: "long",
      details: "Most combi boilers sit between 1 and 1.5 bar when cold. Check your boiler's manual.",
      action: "save",
    },
    ideal: captions({
      tiktok: [
        "Boiler pressure low and the heating cut out? Here is what we found in a Bishopston kitchen.\n\nThe gauge read 0.5 bar. Under the boiler there is a filling loop with two valves. Open them slowly, watch the needle climb, close both at 1.2 bar. That was the whole fix this time.\n\nMost combi boilers sit between 1 and 1.5 bar when cold. Check your boiler's manual.\n\nThen the bit people skip: we looked under the boiler and round the radiator valves for drips. None here. If yours drops again after a top-up, get it looked at.\n\nSave this for the first cold morning the heating will not come on.",
        "Not every cold radiator needs a plumber. This one needed two valves opened and closed.\n\nCombi boiler, Bishopston, gauge sitting at 0.5 bar, heating off. We topped it up through the filling loop until the needle read 1.2 bar, closed both valves, then checked under the boiler and round the radiators for drips. Nothing.\n\nMost combi boilers sit between 1 and 1.5 bar when cold. Check your boiler's manual.\n\nIf the pressure drops again after you top it up, that is the point to call someone in.\n\nSave this for when the heating goes quiet.",
      ],
      reels: [
        "Heating cut out because the boiler pressure was at 0.5 bar. Here is the top-up we did in a Bishopston kitchen, step by step.\n1. Find the filling loop under the boiler.\n2. Open both valves slowly.\n3. Watch the needle and close both at 1.2 bar.\n4. Look under the boiler and round the radiator valves for drips.\n\nMost combi boilers sit between 1 and 1.5 bar when cold. Check your boiler's manual.\n\nNo leak on this one. If yours drops again after a top-up, that is a job for a plumber.\n\nSave this before the first cold night.",
        "When the heating stops, look at the gauge before anything else. On this Bishopston combi it read 0.5 bar.\n\nTopping it up is a small job: open the filling loop's two valves slowly, stop at 1.2 bar, close both. Then check for drips under the boiler and round the radiators. We found none.\n\nMost combi boilers sit between 1 and 1.5 bar when cold. Check your boiler's manual.\n\nPressure dropping again after a top-up is the point to call us, not before.\n\nSave this one for winter.",
      ],
    }),
    note: "The honest-plumber shape: the real job and area, one thing people can do themselves, and a plain line on when to call a pro. No prices, no exclamation marks, no scare words, the fact appears exactly, and saving is earned by a step-by-step people will need later.",
  },
  {
    title: "Chin tuck seen from the side",
    label: "gold",
    brain: "Desk Stretch",
    inputs: {
      post: "Seated chin tuck at a desk, filmed side-on: slide the chin straight back, not down, hold for 5 seconds, repeat 5 times.",
      platforms: ["tiktok", "shorts"],
      length: "short",
      action: "comment",
    },
    ideal: captions({
      tiktok: [
        "1 move for a stiff desk neck: the seated chin tuck. Chin straight back, not down, 5 seconds, 5 times. Where do you feel it?",
        "5 seconds, 5 times, and your chin goes back, not down. Filmed side-on so you can see the difference. Did you just try it at your desk?",
      ],
      shorts: [
        "Seated chin tuck: 1 desk stretch for your neck\nChin straight back, not down. Hold 5 seconds, repeat 5 times. Back of the neck, or nowhere at all?",
        "5 seconds, 5 times: the chin tuck, seen from the side\nThe side view shows the one thing to get right: back, not down. Did yours go back or down?",
      ],
    }),
    note: "Opens with a number, keeps to one move, ends on a question that is easy to answer, as the brand's dos say. No emoji and no promise to fix anything, the cue that matters (back, not down) is in every variant, and the sample line about skipping is not reused.",
  },
  {
    title: "41p lentil soup from the Sunday shop",
    label: "gold",
    brain: "Twelve Quid Kitchen",
    inputs: {
      post: "Unpacking the Sunday shop on the counter with the receipt: £11.84 at Aldi. Then batch cooking a red lentil and carrot soup: 6 portions at 41p each. The kitchen is a mess by the end.",
      platforms: ["tiktok", "shorts", "reels"],
      length: "medium",
      details: "Aldi, Sunday 25 October. Prices change, so check yours.",
      action: "best",
    },
    ideal: captions({
      tiktok: [
        "Red lentil and carrot soup, 6 portions, 41p each. All from an £11.84 Sunday shop, receipt on the counter. Aldi, Sunday 25 October. Prices change, so check yours. Save it for your next batch cook.",
        "Six bowls of soup at 41p each, and a kitchen that looks like it lost a fight. £2.46 for the whole pot, I did check. Aldi, Sunday 25 October. Prices change, so check yours. Save it for next Sunday.",
      ],
      shorts: [
        "Red lentil and carrot soup at 41p a portion\nSix portions from an £11.84 Sunday shop, receipt included. Aldi, Sunday 25 October. Prices change, so check yours.",
        "£11.84 Sunday shop: the soup that costs 41p a bowl\nThe maths: six portions, £2.46 for the pot. Aldi, Sunday 25 October. Prices change, so check yours. Save it for next Sunday.",
      ],
      reels: [
        "41p a portion, to the penny. Red lentil and carrot soup, six of them, out of an £11.84 Sunday shop. Aldi, Sunday 25 October. Prices change, so check yours. Save this one for your next batch cook.",
        "The receipt says £11.84. The pot says six bowls. The kitchen says please stop. Red lentil and carrot soup at 41p a portion. Aldi, Sunday 25 October. Prices change, so check yours.",
      ],
    }),
    note: "Prices to the penny, the shop named with the brand's own reminder that prices change, and the pot total worked out from the inputs rather than invented. Chatty and self-mocking about the mess, no diet talk, none of the banned words, and the next step is a save because a batch-cook recipe earns one.",
  },
];
