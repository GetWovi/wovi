/**
 * Brand Brains for the launch set: the three phase 7 examples (a bakery, a
 * desk physio, a late-night coffee bar) plus four more kinds of business, so
 * every launch agent has golden samples across very different voices: a
 * beginner strength gym, an invoicing app, a local plumber and a budget
 * cooking creator. All of them are made up.
 */
import { EXAMPLE_BRAINS, type ExampleBrain } from "@/lib/brand/seeds";

const text = (t: string, note: string) => ({ kind: "text" as const, note, url: null, text: t, color: null });
const swatch = (color: string, note: string) => ({ kind: "swatch" as const, note, url: null, text: null, color });
const ref = (t: string, note: string, url: string | null = null) => ({ id: "", text: t, url, note });

export const NEW_LAUNCH_BRAINS: ExampleBrain[] = [
  {
    name: "Northside Strength",
    niche: "Beginner strength gym in Manchester",
    platforms: ["tiktok", "shorts", "reels"],
    voice: {
      description:
        "Encouraging but blunt. Plain gym talk, no bro-speak. Short sentences. Celebrates small, real numbers: a first pull-up, a first 40 kg deadlift. Sounds like a coach between sets, not an influencer.",
      tone: ["direct", "warm", "practical", "punchy"],
      use: ["first rep", "on the bar", "coach", "form first"],
      avoid: ["shred", "beast mode", "no excuses", "summer body", "toxins"],
      samples: ["Margaret is 61. Today she deadlifted 60 kg.", "You do not need to be fit to start. That is our job.", "Strong is a skill. You practise it."],
    },
    topics: ["first lifts", "members over 40", "form before weight"],
    references: [
      ref(
        "Margaret is 61. Six months ago she needed a hand to get up off the floor. Today she deadlifted 60 kg. No secret. Two sessions a week and a coach who made her slow down.",
        "A real member, a real number, and the honest how",
      ),
      ref("Your first session here: 20 minutes of learning to brace, one lift, and a cup of tea. That is it.", "Takes the fear out of starting"),
    ],
    moodBoard: [
      swatch("#1E1E1E", "Rubber floor"),
      swatch("#E4572E", "The red plates"),
      text("chalk on hands, worn rubber floor, morning light through the roller door", "Every clip looks like this"),
    ],
    dos: ["Use real numbers from real sessions", "Show the coach correcting form", "Name a member only with their permission"],
    donts: ["Never promise weight loss", "No before-and-after photos", "No shirtless thumbnails", "Never shame anyone's body"],
    idea: "Strength for people who never thought a gym was for them.",
  },
  {
    name: "Tallybook",
    niche: "Invoicing app for UK freelancers",
    platforms: ["x", "tiktok", "shorts"],
    voice: {
      description:
        "Clear, friendly and a bit nerdy about money admin. Explains one thing at a time with a worked number. Never salesy, never scary about tax. Talks to freelancers as peers.",
      tone: ["practical", "nerdy", "calm", "direct"],
      use: ["get paid", "late invoice", "sole trader", "in plain English"],
      avoid: ["seamless", "streamline", "leverage", "empower", "revolutionary", "all-in-one"],
      samples: ["Your invoice is not late. Their payment is.", "Invoice 0047 got paid in 2 days. Here is what was different.", "Tax is not scary. Not knowing the date is."],
    },
    topics: ["late payments", "invoice wording", "Self Assessment dates"],
    references: [
      ref("Swap 'Payment terms: 30 days' for 'Due 14 March'. A date is harder to ignore than a rule.", "One small change, explained in one line"),
      ref("Freelancer maths: £2,400 invoice, 30 days late, 3 reminders. Here is the reminder we would send on day 1, day 7 and day 14.", "A worked example with numbers"),
    ],
    moodBoard: [
      swatch("#0F766E", "Tallybook green"),
      swatch("#F8FAFC", "Paper white"),
      text("clean screen recordings of the app, one highlighted line, a calm desk", "The look"),
    ],
    dos: ["Show the real screen", "Use one worked example with numbers", "Say when something depends on your situation"],
    donts: ["No fake urgency", "Never give tax advice as fact for a specific person", "No stock photos", "No emoji"],
    idea: "Getting paid should be the easy part of freelancing.",
  },
  {
    name: "Fernhill Plumbing",
    niche: "Family plumbing and heating firm in Bristol",
    platforms: ["x", "tiktok", "reels"],
    voice: {
      description:
        "A friendly, straight-talking tradesperson. Explains what went wrong in plain words, shows the actual job, and gives one thing people can check themselves. Never scares people into calling.",
      tone: ["practical", "warm", "direct", "calm"],
      use: ["here is what we found", "stopcock", "in plain terms", "worth a look"],
      avoid: ["cheapest", "nightmare", "disaster", "cowboys"],
      samples: ["Here is what we found behind the bath panel.", "Know where your stopcock is. Today, not during the leak.", "Ten-minute job. Two-year-old drip."],
    },
    topics: ["leaks", "boiler pressure", "getting ready for winter"],
    references: [
      ref(
        "Here is what we found behind a bath panel in Redland. A slow drip, two years of it, and a joist gone soft. A ten-minute fix if caught early. Check yours: torch, panel off, look for dark wood.",
        "A real job, a plain lesson, a thing to check yourself",
      ),
    ],
    moodBoard: [
      swatch("#1D3557", "Van navy"),
      swatch("#B87333", "Copper pipe"),
      text("real jobs in real kitchens, torchlight under sinks, hands and tools close up", "The look"),
    ],
    dos: ["Show the real job and the area", "Give one thing people can check themselves", "Say when to call a pro and when not to"],
    donts: ["Never scare people into booking", "No prices in posts", "Never show customers' faces or house numbers", "No exclamation marks"],
    idea: "The honest plumber: show the job, teach the fix, earn the call.",
  },
  {
    name: "Twelve Quid Kitchen",
    niche: "Creator cooking a week of dinners for £12",
    platforms: ["tiktok", "shorts", "reels"],
    voice: {
      description:
        "First person, chatty and quick. Prices to the penny. Laughs at her own kitchen mess, proud of the maths. Says quid. Talks like a friend on a video call.",
      tone: ["playful", "casual", "personal", "upbeat"],
      use: ["quid", "to the penny", "the Sunday shop", "the maths"],
      avoid: ["hack", "foodie", "yummy", "guilt-free", "superfood"],
      samples: ["Four dinners. £3.10 each. I did the maths so you don't have to.", "The onions were 8p. The onions were the star.", "One tin of chickpeas, three dinners, one very tired me."],
    },
    topics: ["the Sunday shop", "cheap protein", "batch cooking"],
    references: [ref("£12. Five dinners. One very small fridge. Here is the receipt and here is what I made.", "The receipt is the proof and the number is the hook")],
    moodBoard: [
      swatch("#F2C14E", "Receipt yellow"),
      swatch("#3A5A40", "Herb green"),
      text("receipts on the counter, steam, phone-camera honesty, a small kitchen", "The look"),
    ],
    dos: ["Show the receipt", "Give the price per portion to the penny", "Name the shop and say prices change"],
    donts: ["Never say 'hack'", "No diet talk", "Never shame anyone's food budget"],
    idea: "Good food on a tiny budget, with the receipts to prove it.",
  },
  {
    name: "Chair Nine",
    niche: "Hair salon in Glasgow, cuts and colour",
    platforms: ["tiktok", "reels", "x"],
    voice: {
      description:
        "Warm, a bit cheeky, and precise about hair. Names the technique and the time it took. Talks like the stylist chatting while they work, never like a beauty ad. Lowercase is fine on TikTok.",
      tone: ["warm", "cheeky", "precise", "honest"],
      use: ["the consult", "lived-in", "grown out", "chair nine"],
      avoid: ["flawless", "glow up", "transformation tuesday", "goddess", "obsessed"],
      samples: ["Six months of grown-out box dye. Four hours. One very patient Ellie.", "We say no to bleach sometimes. This is why.", "The consult takes ten minutes. It saves you a year."],
    },
    topics: ["colour correction", "low-maintenance cuts", "the consult"],
    references: [
      ref(
        "Ellie came in with six months of grown-out box dye. Four hours, two rounds of toner, and a cut that grows out soft. She books in again in twelve weeks, not six.",
        "The real time and the real upkeep, not just the after shot",
      ),
      ref("We said no to bleaching Priya's hair today. Here is what we did instead, and why it will still be healthy in March.", "Saying no builds more trust than a big reveal"),
    ],
    moodBoard: [
      swatch("#C9A27E", "Warm caramel"),
      swatch("#2F2A28", "The black salon chair"),
      text("window light, mirror shots, foils on the trolley, hands sectioning hair", "Every clip looks like this"),
    ],
    dos: ["Name the technique and how long it took", "Say how long the colour or cut will last", "Show clients only with their permission"],
    donts: ["Never filter the hair colour", "No before-and-after without the client's yes", "Never mock a home dye job"],
    idea: "Hair that still looks good three months later, not just on the day.",
  },
  {
    name: "Muddy Paws Grooming",
    niche: "Dog groomer in a Cornwall village",
    platforms: ["tiktok", "shorts", "reels"],
    voice: {
      description:
        "Gentle, funny about dogs, calm about the hard bits. Uses each dog's name and breed. Explains why a groom takes the time it does. Talks like a groomer to the owner at pick-up.",
      tone: ["gentle", "funny", "calm", "patient"],
      use: ["the groom", "matted", "nervous dogs", "pick-up"],
      avoid: ["fur baby", "pawsome", "pupper", "makeover magic", "spa day"],
      samples: ["Biscuit is a nervous cockapoo. We did his feet first, then a break, then the rest.", "Matted is not a style. It pulls, and it hurts.", "Two hours sounds long. Here is where the time goes."],
    },
    topics: ["nervous dogs", "matting", "coat care between grooms"],
    references: [
      ref("Biscuit hates the dryer, so we towel and air dry him instead. It takes longer. He leaves calm.", "Puts the dog's comfort before speed"),
      ref("This is what six weeks of missed brushing does to a doodle coat. Here is the one comb that stops it.", "A real coat, a plain lesson, one tool to buy"),
    ],
    moodBoard: [
      swatch("#6B8F71", "Cornish moss"),
      swatch("#F4EDE4", "Clean towel white"),
      text("wet dogs on the table, a calm hand on the collar, the van parked by the sea wall", "The look"),
    ],
    dos: ["Use the dog's name and breed", "Explain why something takes time", "Show calm handling"],
    donts: ["Never show a dog in distress", "No shaming owners about matting", "Never promise a groom will fix a skin problem"],
    idea: "Calm grooms for dogs who find grooming hard.",
  },
  {
    name: "Kiln Street Ceramics",
    niche: "Handmade ceramics shop selling online",
    platforms: ["x", "reels", "shorts"],
    voice: {
      description:
        "Quiet, exact and a little dry. Talks about clay, glaze and kiln temperatures like a maker, not a brand. Every piece is one of a kind and the posts say why. Short sentences.",
      tone: ["quiet", "exact", "dry", "craft-proud"],
      use: ["the kiln", "glaze test", "seconds", "made in batches of"],
      avoid: ["aesthetic", "must-have", "elevated", "curated", "perfect gift"],
      samples: ["Batch 14 came out of the kiln this morning. Two cracked. Twenty did not.", "This glaze runs. That is the point.", "Seconds go on sale on the first Sunday of the month."],
    },
    topics: ["glaze tests", "kiln days", "seconds sales"],
    references: [
      ref("Opened the kiln at 7. Two mugs cracked on the handle join. Here is what a crack looks like before it is a crack.", "Shows the failures, which makes the good pieces believable"),
      ref("Seconds sale, first Sunday of the month: small glaze runs, wobbly bases, same clay, half price.", "Honest about flaws, specific about the price"),
    ],
    moodBoard: [
      swatch("#B5644A", "Iron red glaze"),
      swatch("#E9E4DA", "Raw clay"),
      text("dusty shelves, glaze buckets, hands trimming on the wheel, the kiln door opening", "Every clip looks like this"),
    ],
    dos: ["Give the batch size and kiln day", "Show flaws honestly", "Say which pieces are seconds and why"],
    donts: ["Never call a piece perfect", "No fake scarcity or countdowns", "Never claim food-safe or dishwasher-safe unless the piece says so"],
    idea: "Pots that show how they were made.",
  },
];

/** Every Brand Brain the launch set installs, in order. The first one made in an empty workspace becomes its default. */
export const LAUNCH_BRAINS: ExampleBrain[] = [...EXAMPLE_BRAINS, ...NEW_LAUNCH_BRAINS];

export const LAUNCH_BRAIN_NAMES = LAUNCH_BRAINS.map((b) => b.name);
export type LaunchBrainName = (typeof LAUNCH_BRAINS)[number]["name"];
