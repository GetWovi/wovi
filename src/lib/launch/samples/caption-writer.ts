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
  {
    title: "Saturday cinnamon buns at 5 a.m.",
    label: "gold",
    brain: "Crumb and Co",
    inputs: {
      post: "Hands rolling 60 cinnamon buns on the 5 a.m. shift on Saturday, then the first tray coming out of the oven. One tray came out too dark and stays in the kitchen.",
      platforms: ["x"],
      length: "short",
      details: "Cinnamon buns are £2.80 each, Saturdays only, until they sell out.",
      action: "buy",
    },
    ideal: captions({
      x: [
        "60 cinnamon buns, rolled by hand on the 5 a.m. shift. One tray came out too dark, so that one stays with us. Cinnamon buns are £2.80 each, Saturdays only, until they sell out. Get to the counter early.",
        "Saturday's cinnamon buns, minus one tray we would rather not talk about. Cinnamon buns are £2.80 each, Saturdays only, until they sell out. Order at the counter. The dark tray is ours.",
      ],
    }),
    note: "One platform, short and dry: the hand-rolled count and the shift up front, the fact word for word, and a buy step that names the counter. The dark tray is owned, the way the brand owns its mistakes, the price stays out of the first line's lead, and no line copies the croissant post.",
  },
  {
    title: "Gerald's jar cracked overnight",
    label: "gold",
    brain: "Crumb and Co",
    inputs: {
      post: "Gerald, our sourdough starter, in a jar that cracked on the shelf overnight. Tom finds the crack on the 5 a.m. shift and splits Gerald into two clean jars before the bake starts. The clip ends with the first loaf of the day coming out of the oven on time.",
      platforms: ["x", "tiktok", "reels"],
      length: "long",
      action: "comment",
    },
    ideal: captions({
      x: [
        "Gerald's jar cracked on the shelf overnight. Tom found it on the 5 a.m. shift and moved our sourdough starter into two clean jars before the bake. The first loaf still came out on time. What would you call the second jar?",
        "Our sourdough starter now lives in two jars. One crack in the night, one quick move by Tom at 5 a.m., and a proper loaf out of the oven on time anyway. Gerald and who? Name the second jar below.",
      ],
      tiktok: [
        "Our sourdough starter's jar cracked on the shelf overnight. Here is how the bake still happened.\n\nTom found the crack on the 5 a.m. shift. Gerald was fine. The jar was not. So before a single loaf was shaped, Tom split Gerald into two clean jars.\n\nThen the bake went ahead like any other morning, and the first loaf of the day came out of the oven on time. That is the last bit of the clip.\n\nOne starter, two jars. We are going to need a second name.\n\nSo: what do we call the second jar?",
        "5 a.m. shift, a cracked jar on the shelf, and Gerald inside it. Not the start Tom had planned.\n\nGerald is our sourdough starter, and every proper loaf here starts with him. So nothing got shaped until he was safe: Tom split him into two clean jars first.\n\nAfter that it was a normal morning. The first loaf of the day came out of the oven on time, which is the bit you see at the end.\n\nWe now have two Geralds, or one Gerald in two places. We have not decided which.\n\nWhat would you name the second jar?",
      ],
      reels: [
        "Gerald's jar cracked overnight. The bake still happened on time.\n\nGerald is our sourdough starter. Tom found the crack on the 5 a.m. shift and split him into two clean jars before anything else. Then a normal morning: dough, oven, and the first loaf of the day out on time.\n\nSo Gerald now lives in two jars. What do we call the second one?",
        "Two jars, one sourdough starter, and a 5 a.m. shift that started with a crack.\n\nThe old jar gave up on the shelf overnight. Tom split Gerald into two clean ones and carried on. You can see the first loaf of the day come out at the end, on time, as if nothing happened.\n\nGerald seems fine. The jar does not.\n\nName the new jar in the comments.",
      ],
    }),
    note: "Long on TikTok and Reels, tight on X and under 280. Gerald and Tom carry the story, the shift and the on-time loaf come from the input, and a small dry joke lands near the end. Each variant ends on one question people can answer, and none repeats the brand's lines about Gerald's age or his record.",
  },
  {
    title: "Hip flexor stretch on an office chair",
    label: "gold",
    brain: "Desk Stretch",
    inputs: {
      post: "Seated hip flexor stretch on an office chair: sit sideways on the edge, slide the outside leg back with the knee pointing down, sit tall, hold 30 seconds each side. Filmed in a meeting room at lunch.",
      platforms: ["reels"],
      length: "medium",
      action: "save",
    },
    ideal: captions({
      reels: [
        "1 stretch for hips that sat through every meeting today.\nSit sideways on the edge of the chair.\nSlide the outside leg back, knee pointing down.\nSit tall.\nHold 30 seconds each side.\nSave this for after your next long meeting.",
        "2 sides. 30 seconds each. 0 trips away from your desk.\nSideways on the chair, outside leg back, knee down, sit tall.\nWe filmed it in a meeting room at lunch, so a small room will do.\nSave this for the next afternoon of calls.",
      ],
    }),
    note: "Opens with a number and keeps one move per line, as the brand asks, then gives the viewer a reason to come back to it. The cues are the input's own, there is no emoji and no promise about pain, and neither variant reuses a sample line.",
  },
  {
    title: "Wrist stretch, part 3 of 10",
    label: "gold",
    brain: "Desk Stretch",
    inputs: {
      post: "Wrist stretch at the keyboard: one arm straight out, palm down, the other hand gently pulls the fingers back towards you. 20 seconds each hand.",
      platforms: ["x", "tiktok", "shorts", "reels"],
      length: "short",
      details: "Part 3 of 10 in our keyboard series.",
      action: "best",
    },
    ideal: captions({
      x: [
        "Part 3 of 10 in our keyboard series. One arm out, palm down, gently pull the fingers back. 20 seconds each hand. Which hand felt it more?",
        "2 hands, 20 seconds each, and you can go straight back to typing. Arm out, palm down, fingers back. Part 3 of 10 in our keyboard series. Left or right, which was tighter?",
      ],
      tiktok: [
        "Wrist stretch for typing all day: arm straight, palm down, pull the fingers back gently, 20 seconds each hand. Part 3 of 10 in our keyboard series. Which hand felt it more?",
        "Your wrists typed all morning. Give them 40 seconds. Part 3 of 10 in our keyboard series. Did you do both hands, or just the one you remembered?",
      ],
      shorts: [
        "Wrist stretch at the keyboard: 20 seconds each hand\nArm straight, palm down, pull the fingers back gently. Part 3 of 10 in our keyboard series. Which hand was tighter?",
        "1 stretch for wrists that type all day\nPart 3 of 10 in our keyboard series. Arm out, palm down, fingers back, 20 seconds a side. Left first or right first?",
      ],
      reels: [
        "20 seconds each hand, without leaving the keyboard.\nArm straight, palm down, pull the fingers back gently. Part 3 of 10 in our keyboard series. Which hand felt it?",
        "3 of 10, and this one is for the hands doing all the work.\nArm out, palm down, fingers back. Part 3 of 10 in our keyboard series. Did you just try it?",
      ],
    }),
    note: "All four platforms from one clip, short everywhere. Each variant opens with a number or the move, keeps the 20 seconds and the series line exactly, and picks a comment question as the step this post earns. X stays well under 280, Shorts leads with a plain title, and nothing promises to fix wrist pain.",
  },
  {
    title: "The regulars' mugs on hooks",
    label: "gold",
    brain: "Night Owl Coffee",
    inputs: {
      post: "the regulars' mugs hanging on hooks behind the bar, each with a name in marker. one hook is still empty. filmed at 2 a.m.",
      platforms: ["x"],
      action: "comment",
    },
    ideal: captions({
      x: [
        "every regular gets a mug. names in marker, hooks behind the bar. one hook still empty. who should it go to?",
        "2 a.m. and the mugs are all hanging up, names in marker. one hook left ☕ what would you write on yours?",
      ],
    }),
    note: "lowercase and sleepy, one or two short lines with one emoji at most. One variant leads with the empty hook, the other with the hour, and both end on a question a regular can answer. Length is left to the default, and no sample line is reused.",
  },
  {
    title: "Flat white in the rain at 1:30",
    label: "gold",
    brain: "Night Owl Coffee",
    inputs: {
      post: "rain on the window, steam off a flat white, someone just off a late shift sitting at the counter. filmed at 1:30 a.m., shown with their permission.",
      platforms: ["x", "tiktok", "reels"],
      length: "medium",
      details: "open till 3 a.m., thursday to saturday",
      action: "visit",
    },
    ideal: captions({
      x: [
        "rain on the window, steam off a flat white, someone just off a late shift at the counter. open till 3 a.m., thursday to saturday. come in out of the wet.",
        "1:30 a.m. is a normal time for a flat white here. open till 3 a.m., thursday to saturday. there is a seat at the counter with your name on it ☕",
      ],
      tiktok: [
        "late-night coffee in the rain: a flat white at 1:30 a.m. for someone just off a late shift. open till 3 a.m., thursday to saturday. come by when your shift ends.",
        "the rain kept going. so did the coffee machine. open till 3 a.m., thursday to saturday. stop in on your way home.",
      ],
      reels: [
        "a flat white at 1:30 a.m., rain on the glass, a late shift finally over.\nopen till 3 a.m., thursday to saturday. come in from the rain.",
        "your shift ends late. we pour later.\nopen till 3 a.m., thursday to saturday. stop by on the way home ☕",
      ],
    }),
    note: "lowercase, under three lines, the hours word for word and a visit step that suits someone finishing a late shift. The guest stays unnamed, the rain and the steam come from the clip, and the brand's sample lines and hustle talk stay out.",
  },
  {
    title: "Dev's first deadlift at 52",
    label: "gold",
    brain: "Northside Strength",
    inputs: {
      post: "Coach Priya teaching Dev, a 52-year-old member, his first deadlift with a 20 kg bar: feet under the bar, hands just outside the legs, brace, push the floor away. Five reps, filmed side-on. Shown with Dev's permission.",
      platforms: ["shorts"],
      length: "long",
      action: "save",
    },
    ideal: captions({
      shorts: [
        "First deadlift at 52: four cues on a 20 kg bar\nDev is 52 and this was his first deadlift. Coach Priya kept it to four cues:\n1. Feet under the bar.\n2. Hands just outside the legs.\n3. Brace.\n4. Push the floor away.\n\nFive reps, filmed side-on so you can watch each cue happen. No big plates, no rush. The bar is 20 kg, and that is plenty for a first rep.\n\nSave this and bring it to your first session on the bar.",
        "How to deadlift as a beginner, filmed side-on\nNobody walks in knowing how to pick a bar up off the floor. Dev did not either, and he is 52.\n\nCoach Priya talked him through five reps with a 20 kg bar. Feet under. Hands just outside the legs. Brace. Then the cue that sounds odd until you try it: push the floor away.\n\nThat is the whole lift. Form first, more weight when it is earned.\n\nSave this for the day you try your first deadlift.",
      ],
    }),
    note: "One platform, told long: a plain searchable title, the four cues as a list people will want again, and the real numbers (52, 20 kg, five reps) from the input. Encouraging but blunt, no promise about weight or bodies, Dev named because the input says he agreed, and a save step that fits a first lift.",
  },
  {
    title: "Jo's first pull-up",
    label: "gold",
    brain: "Northside Strength",
    inputs: {
      post: "Jo's first unassisted pull-up, with Coach Sam standing underneath and the whole class clapping. Shown with Jo's permission.",
      platforms: ["x", "tiktok"],
      length: "short",
      details: "Six weeks of the Tuesday 6pm beginner class.",
      action: "nothing",
    },
    ideal: captions({
      x: [
        "Jo's first pull-up. No band, no help, chin over the bar. Six weeks of the Tuesday 6pm beginner class.",
        "The whole class stopped to clap for this one. Coach Sam stood underneath and never had to step in. Six weeks of the Tuesday 6pm beginner class.",
      ],
      tiktok: [
        "Jo's first unassisted pull-up, with the whole class clapping. Six weeks of the Tuesday 6pm beginner class.",
        "One pull-up. Six weeks of the Tuesday 6pm beginner class. Coach Sam underneath, hands off the whole way.",
      ],
    }),
    note: "Short and proud of a small, real number, the way the brand celebrates. The fact appears exactly, Jo is named with permission, and there is no call to action because none was asked for. No body talk, nothing about weight loss, and no sample line reused.",
  },
  {
    title: "First reminder for invoice 0112",
    label: "gold",
    brain: "Tallybook",
    inputs: {
      post: "Screen recording: writing a first payment reminder in Tallybook for invoice 0112, £640, 7 days overdue. The highlighted line reads: 'Just checking this one reached you. It was due on 9 October.'",
      platforms: ["x", "tiktok", "shorts"],
      length: "medium",
      action: "comment",
    },
    ideal: captions({
      x: [
        "Invoice 0112: £640, 7 days overdue. Our first reminder is two sentences: 'Just checking this one reached you. It was due on 9 October.' Friendly, with the date in it. What does your first reminder say?",
        "Day 7 of a late invoice is not the day to be cross. It is the day to check it arrived. One friendly line, then the due date. How many days do you wait before you chase?",
      ],
      tiktok: [
        "How to word a first payment reminder, in plain English. Invoice 0112, £640, 7 days overdue: 'Just checking this one reached you. It was due on 9 October.' What do you write in yours?",
        "Seven days late on £640. The reminder we would send is two sentences long, and the second one is just the date. Do you send a reminder that early, or wait?",
      ],
      shorts: [
        "How to word a first payment reminder\nInvoice 0112, £640, 7 days overdue. One friendly line, then the due date: 9 October. What does your first reminder say?",
        "A late invoice reminder in two sentences\nTallybook on screen, £640 owed, 7 days over. Friendly first, the date second. How long do you wait before you chase?",
      ],
    }),
    note: "One worked example with real numbers, on the real screen, in plain English. One variant leads with the wording, the other with the timing, and each ends on a question freelancers can answer from their own inbox. No emoji, no fake urgency, X under 280, and the brand's line about late payments is not reused.",
  },
  {
    title: "Set-aside figure on every paid invoice",
    label: "gold",
    brain: "Tallybook",
    inputs: {
      post: "Screen recording of Tallybook's tax year view for a made-up sole trader: £31,200 paid in so far this tax year, and next to each paid invoice a set-aside figure at 20%, with the Self Assessment deadline at the top of the screen.",
      platforms: ["tiktok"],
      length: "long",
      details: "Online Self Assessment deadline: 31 January 2027. The set-aside percentage is yours to choose.",
    },
    ideal: captions({
      tiktok: [
        "Self Assessment, with the date at the top of the screen where you cannot miss it.\n\nThis is Tallybook's tax year view for a made-up sole trader. £31,200 paid in so far. Next to every paid invoice there is a set-aside figure, here at 20%, so you can see what to move into a separate pot the day the money lands.\n\nOnline Self Assessment deadline: 31 January 2027. The set-aside percentage is yours to choose.\n\nWhat you will actually owe depends on your situation, so read the figure as a reminder, not a bill.\n\nSave this for the next time a big invoice gets paid.",
        "£31,200 paid in so far, and the number worth watching is the one next to each invoice.\n\nEvery paid invoice in this made-up sole trader's account shows a set-aside figure at 20%. The amount to keep aside is on screen, invoice by invoice, without a spreadsheet.\n\nOnline Self Assessment deadline: 31 January 2027. The set-aside percentage is yours to choose.\n\nWhether 20% is right for you depends on your situation, which is why it is a setting and not a rule.\n\nSave this before your next invoice gets paid.",
      ],
    }),
    note: "Long on TikTok, the one platform picked, with Self Assessment in the first line where search can read it. The made-up account is called made up, the facts land word for word, and both variants say plainly that the right figure depends on your situation. The default next step becomes a save, which a tax-year screen earns.",
  },
  {
    title: "Slow sink in Southville",
    label: "gold",
    brain: "Fernhill Plumbing",
    inputs: {
      post: "Kitchen sink in Southville draining slowly. We put a bucket under the U-bend, unscrew it, clear out a plug of grease and coffee grounds, and refit it hand-tight. The water runs straight through after.",
      platforms: ["x"],
      length: "short",
      action: "save",
    },
    ideal: captions({
      x: [
        "Slow kitchen sink in Southville. Here is what we found in the U-bend: grease and coffee grounds. Bucket under, unscrew, clear it, refit hand-tight. Save this for the next sink that takes its time.",
        "Coffee grounds and grease, packed into one U-bend in Southville. A bucket and two hands sorted it, and the water now runs straight through. Worth saving before you book a plumber for a slow sink.",
      ],
    }),
    note: "The honest-plumber shape in two lines on X: the real job and area, the thing people can do themselves, and a save that earns its place by saying when a pro is not needed. No prices, no exclamation marks, no scare words, and the brand's lines about the bath panel and the stopcock are not reused.",
  },
  {
    title: "Boiler service before winter in Knowle",
    label: "gold",
    brain: "Fernhill Plumbing",
    inputs: {
      post: "Annual combi boiler service in a Knowle kitchen: case off, burner and heat exchanger checked, flue gas reading taken with an analyser, and the condensate pipe outside checked for anything that could freeze. All fine this time.",
      platforms: ["x", "tiktok", "shorts", "reels"],
      length: "medium",
      details: "Booking for winter boiler services opens Monday 2 November. Call the number on our profile.",
      action: "visit",
    },
    ideal: captions({
      x: [
        "A boiler service in a Knowle kitchen, start to finish: case off, burner and heat exchanger checked, flue gas reading taken. All fine this time. Booking for winter boiler services opens Monday 2 November. Call the number on our profile.",
        "Worth a look yourself before winter: the condensate pipe outside, where it leaves the wall. Booking for winter boiler services opens Monday 2 November. Call the number on our profile.",
      ],
      tiktok: [
        "What happens at a boiler service, in plain terms. Case off, burner and heat exchanger checked, then a flue gas reading with an analyser. Last, the condensate pipe outside. Booking for winter boiler services opens Monday 2 November. Call the number on our profile.",
        "One bit of a boiler service happens outside the house. On this Knowle job we checked the condensate pipe for anything that could freeze. Booking for winter boiler services opens Monday 2 November. Call the number on our profile.",
      ],
      shorts: [
        "What a combi boiler service actually checks\nCase off, burner, heat exchanger, flue gas reading, then the condensate pipe outside. A Knowle kitchen, all fine. Booking for winter boiler services opens Monday 2 November. Call the number on our profile.",
        "Boiler service in Knowle: the bit outside the house\nThe condensate pipe gets checked for anything that could freeze. Booking for winter boiler services opens Monday 2 November. Call the number on our profile.",
      ],
      reels: [
        "Boiler service in a Knowle kitchen, no drama, all fine.\n\nCase off, burner and heat exchanger checked, flue gas reading taken with an analyser, condensate pipe checked outside. Booking for winter boiler services opens Monday 2 November. Call the number on our profile.",
        "One thing worth a look before winter: the condensate pipe outside.\n\nIt was the last check on this Knowle boiler service, after the burner, the heat exchanger and the flue gas reading. Booking for winter boiler services opens Monday 2 November. Call the number on our profile.",
      ],
    }),
    note: "All four platforms at medium length. One angle walks through the service in order, the other hands people one thing to check themselves, as the brand's dos ask. The booking line is word for word, the area is named but no house, no prices or scare words, and X and the Shorts titles stay inside their limits.",
  },
  {
    title: "One bag of frozen veg, three dinners",
    label: "gold",
    brain: "Twelve Quid Kitchen",
    inputs: {
      post: "Three dinners from one £1.20 bag of frozen mixed veg: fried rice on Monday, a veg pie topped with mash on Tuesday, soup on Wednesday. That is 40p of veg per dinner. Receipt shown. At the start, the freezer door will not shut properly.",
      platforms: ["x", "tiktok"],
      length: "long",
      details: "Tesco, Saturday 24 October. Prices change, so check yours.",
      action: "best",
    },
    ideal: captions({
      x: [
        "One £1.20 bag of frozen mixed veg, three dinners: fried rice, a veg pie with mash, then soup. 40p of veg a dinner, to the penny. Tesco, Saturday 24 October. Prices change, so check yours. Which one would you make first?",
        "My freezer door would not shut, so the frozen veg had to go. £1.20 bag, three dinners, 40p of veg each. Tesco, Saturday 24 October. Prices change, so check yours. Which of the three would you make?",
      ],
      tiktok: [
        "Three dinners out of one £1.20 bag of frozen mixed veg. Here is the maths.\n\nMonday: fried rice. Tuesday: a veg pie with mash on top. Wednesday: soup. That is 40p of veg per dinner, to the penny, and the receipt is right there on the counter.\n\nTesco, Saturday 24 October. Prices change, so check yours.\n\nThe real reason I did this? The freezer door would not shut. Problem solved, one dinner at a time.\n\nWhich one would you make first: the fried rice, the pie or the soup?",
        "My freezer door would not shut, so this week the frozen veg had to go. All of it.\n\nOne bag, £1.20, three dinners. Fried rice on Monday. Pie with mash on Tuesday, which is the one I am proudest of. Soup on Wednesday, when the bag was nearly empty and so were my ideas.\n\nThe maths: 40p of veg a dinner. Receipt on the counter, as always.\n\nTesco, Saturday 24 October. Prices change, so check yours.\n\nWhat would you have made with the last of the bag?",
      ],
    }),
    note: "Chatty, first person and proud of the maths: the bag price and the veg cost per dinner come straight from the input, and the shop and date land word for word with the brand's own reminder. X keeps it all under 280 while TikTok tells the freezer story long. The best fit here is a comment question, and nothing talks about diets.",
  },
  {
    title: "Pixie to bob at eight months",
    label: "gold",
    brain: "Chair Nine",
    inputs: {
      post: "Morven's pixie cut, eight months grown out, shaped into a short layered bob that keeps the length at the back. Dry cut first, then a wash and a second pass. One hour fifteen. Filmed in window light, no filter, shown with her permission.",
      platforms: ["reels"],
      length: "long",
      details: "Growing out a pixie takes about three cuts, six weeks apart.",
      action: "comment",
    },
    ideal: captions({
      reels: [
        "Eight months of growing out a pixie, shaped into a short layered bob. One hour fifteen in chair nine.\n\nMorven did not want to lose the length at the back, so we kept it. Dry cut first, so we could see where her hair actually sits, then a wash and a second pass to tidy every layer.\n\nGrowing out a pixie takes about three cuts, six weeks apart. The awkward stage is real, and it is shorter with a plan.\n\nWhere are you in your grow-out? Tell us the month.",
        "The awkward stage of growing out a pixie is a real thing. This is what we do about it.\n\nMorven, eight months in. We kept the length at the back and shaped the rest into a short layered bob, cutting dry first and going back over it after a wash. One hour fifteen, window light, no filter.\n\nGrowing out a pixie takes about three cuts, six weeks apart.\n\nWhat would you call your stage right now: helmet, mullet or nearly there?",
      ],
    }),
    note: "Names the technique and the time, says how long the grow-out takes in the words given, and keeps the no-filter claim from the input. Warm and a bit cheeky, the Reels first line carries the point before 'more', Morven appears with her permission, and the question is one anyone growing out a pixie can answer.",
  },
  {
    title: "Curly fringe cut dry",
    label: "gold",
    brain: "Chair Nine",
    inputs: {
      post: "Close-up of a fringe trim on a client's own curly hair, cut dry, curl by curl, so it sits where it naturally falls. Twenty minutes. Shown from the nose up, with her permission.",
      platforms: ["x", "shorts", "reels"],
      length: "short",
      action: "nothing",
    },
    ideal: captions({
      x: [
        "Curly fringe, cut dry, curl by curl, so it sits where it naturally falls. Twenty minutes in chair nine.",
        "Cut a curly fringe wet and it springs up shorter than you planned. So we cut it dry. Twenty minutes, one curl at a time.",
      ],
      shorts: [
        "Cutting a curly fringe dry, curl by curl\nTwenty minutes, and each curl sits where it naturally falls.",
        "Why we cut curly fringes dry\nWet curls hide where they will sit. Dry, you can see it. Twenty minutes in chair nine.",
      ],
      reels: [
        "A curly fringe, cut dry and curl by curl. Twenty minutes, and it sits where it naturally falls.",
        "Her curls, her fringe, no fighting either one. Cut dry so nothing springs up shorter than planned. Twenty minutes.",
      ],
    }),
    note: "Short across three platforms, with no call to action because none was asked for. One angle names the technique and the time, the other says why it is done dry. No banned word, the client stays unnamed, and the Shorts titles are plain and searchable.",
  },
  {
    title: "Bramble's puppy intro visit",
    label: "gold",
    brain: "Muddy Paws Grooming",
    inputs: {
      post: "Bramble, a 12-week-old cocker spaniel puppy, at her first intro visit: sniffing round the table, hearing the dryer on low from across the room, a few treats. No grooming yet.",
      platforms: ["tiktok"],
      length: "short",
      details: "Puppy intro visits: 15 minutes, Wednesday mornings. Book by phone.",
      action: "visit",
    },
    ideal: captions({
      tiktok: [
        "Bramble, 12-week-old cocker spaniel, first visit. No groom yet, just the table, the dryer on low across the room, and treats. Puppy intro visits: 15 minutes, Wednesday mornings. Book by phone.",
        "Bramble's first visit was mostly sniffing, and that is the whole plan. The groom can wait. Puppy intro visits: 15 minutes, Wednesday mornings. Book by phone.",
      ],
    }),
    note: "Short and gentle: the dog's name and breed, why the first visit has no groom, and the intro facts word for word with the real way to book. One variant shows what happened, the other the feeling, and none of the brand's cutesy words get in.",
  },
  {
    title: "Hamish groomed lying down",
    label: "gold",
    brain: "Muddy Paws Grooming",
    inputs: {
      post: "Hamish, an 11-year-old Westie with stiff back legs, groomed lying down on a padded mat instead of standing on the table. Shorter sessions, and his owner stays in the room. The full groom took two visits.",
      platforms: ["x", "reels"],
      length: "medium",
      action: "best",
    },
    ideal: captions({
      x: [
        "Hamish is an 11-year-old Westie with stiff back legs, so he had his groom lying down on a padded mat. Two shorter visits instead of one long one. Does your older dog find standing hard at the groomer?",
        "Not every groom happens standing on the table. Hamish, 11, a Westie, did his lying down with his owner in the room. It took two visits. Has your dog's groom slowed down as they got older?",
      ],
      reels: [
        "Hamish is 11, a Westie with stiff back legs, so he had his groom lying down.\n\nA padded mat instead of the table, shorter sessions, and his owner in the room. The full groom took two visits. Slower, and easier on his legs.\n\nDoes your older dog find the groomer's table hard now? Tell us below.",
        "Two visits for one groom sounds slow. For an 11-year-old Westie with stiff back legs, it is the right speed.\n\nHamish stayed lying down on a padded mat the whole time, with short sessions and his owner close by.\n\nWhat has changed about your dog's grooms as they got older?",
      ],
    }),
    note: "Medium on X and Reels, with 'whatever fits best' read as a question for owners of older dogs. Explains why the groom took two visits, as the brand's dos ask, uses Hamish's name, age and breed, and shows calm handling with nothing about distress.",
  },
  {
    title: "Iron red glaze test tiles",
    label: "gold",
    brain: "Kiln Street Ceramics",
    inputs: {
      post: "Glaze test tiles out of the kiln this morning: the same iron red glaze on six tiles at three thicknesses. Thin goes almost black at the edges, thick pools and runs. Each tile numbered in pencil on the back.",
      platforms: ["shorts"],
      length: "medium",
      action: "nothing",
    },
    ideal: captions({
      shorts: [
        "Iron red glaze test: six tiles, three thicknesses\nThin goes almost black at the edges. Thick pools and runs. Each tile has a number in pencil on the back, so we know which is which.",
        "Same glaze, six tiles, three different results\nThe only thing that changed was how thick it went on. Out of the kiln this morning, and the thick ones did what thick iron red does: pooled and ran.",
      ],
    }),
    note: "Shorts only, quiet and exact: a plain title with the numbers, then what the tiles show. One variant reads the tiles one by one, the other makes the point that thickness was the only change. No call to action, as asked, and nothing invented about the firing.",
  },
  {
    title: "Batch 23 mugs, eleven seconds",
    label: "gold",
    brain: "Kiln Street Ceramics",
    inputs: {
      post: "Batch 23 out of the kiln: 40 mugs in a speckled oatmeal glaze. Eleven have small flaws: pinholes in the glaze on six, a slightly wobbly base on five. Close-ups of each flaw. Same clay and same firing as the rest.",
      platforms: ["shorts", "reels"],
      length: "long",
      details: "Seconds: 11 mugs, £18 each, on the shop page from Friday 6 November, 7pm.",
      action: "buy",
    },
    ideal: captions({
      shorts: [
        "Batch 23: 40 oatmeal mugs, 11 seconds\nForty mugs in a speckled oatmeal glaze came out of the kiln. Twenty-nine came out as planned. Eleven did not.\n\nSix have pinholes in the glaze. Five sit with a slight wobble on the base. The close-ups show every one, so you know exactly which flaw you are buying.\n\nSame clay, same firing as the rest of the batch.\n\nSeconds: 11 mugs, £18 each, on the shop page from Friday 6 November, 7pm.",
        "What a pinhole in a glaze looks like, close up\nSix mugs from batch 23 have them: small holes in the speckled oatmeal glaze. Five more have a base that wobbles a little.\n\nThey are going in the seconds, and we filmed every flaw rather than hide it. Same clay, same firing, a mark you can see.\n\nSeconds: 11 mugs, £18 each, on the shop page from Friday 6 November, 7pm. Pick the flaw you can live with.",
      ],
      reels: [
        "Batch 23 out of the kiln: 40 speckled oatmeal mugs, and eleven of them are seconds.\n\nSix have pinholes in the glaze. Five have a slightly wobbly base. Every flaw is in the close-ups, so nothing is a surprise when the box arrives.\n\nSame clay and the same firing as the other twenty-nine.\n\nSeconds: 11 mugs, £18 each, on the shop page from Friday 6 November, 7pm.",
        "A wobble you can feel and a pinhole you can see. That is what makes these seconds.\n\nBatch 23 was 40 mugs in a speckled oatmeal glaze. Eleven came out with small flaws: six with pinholes, five with a base that rocks a little. We filmed each one close up.\n\nSeconds: 11 mugs, £18 each, on the shop page from Friday 6 November, 7pm. Choose yours by the flaw.",
      ],
    }),
    note: "Long and exact: batch number, count and each flaw named plainly, with the close-ups as the reason to trust the seconds. One variant leads with the batch, the other with the flaw itself. The sale line is word for word, with no countdown, no scarcity talk and no food-safe claim.",
  },
];
