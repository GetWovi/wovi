import { items, type LaunchSample } from "./types";

const i = (idea: string, format: string, why_it_fits: string) => ({ idea, format, why_it_fits });

export const IDEA_GENERATOR_SAMPLES: LaunchSample[] = [
  {
    title: "Bakery in the quiet weeks",
    label: "gold",
    brain: "Crumb and Co",
    inputs: {
      topic: "the quiet weeks after Christmas",
      goal: "trust",
      platform: "reels",
      coming_up: "We open an hour later, at 7, from 6 to 31 January.",
    },
    ideal: items(
      i(
        "Gerald does not know it is January. The starter still needs feeding before we open at 7. One shot of the feed, one line of text.",
        "Text on screen over footage",
        "Gerald is the brand's best character, and the quiet weeks make him the one thing that never slows down.",
      ),
      i(
        "A quiet morning from the baker's side: flour, the first tray, the door unlocking at 7 instead of 6.",
        "Voiceover over footage",
        "Shows the slower, honest side of the bakery and tells regulars about the later opening without a sales line.",
      ),
      i(
        "The mistake shelf: the loaves that went wrong this week, one by one, and what each taught us.",
        "Talking to camera",
        "Owning the mess is what the brand's best post did with the 40 croissants, and quiet weeks leave time to try things.",
      ),
      i(
        "The croissant butter, close up, folded in slow motion, with one line on why it has to stay cold.",
        "Step-by-step demo",
        "Names the real ingredient and shows the hands and the process, both on the brand's do list.",
      ),
      i(
        "Ask the regulars: what should we bake while it is quiet? Read out the best answers next week.",
        "Talking to camera",
        "Trust grows when regulars shape the counter, and a slow January is the right time to ask.",
      ),
      i(
        "Croissant 41, revisited: the first one that did not burn next to this week's batch, same dry voice.",
        "Voiceover over footage",
        "A new ending for the brand's strongest past post, so it builds on what already worked.",
      ),
      i(
        "Split screen: the same oven at 6 a.m. in December and at 7 a.m. in January. One line on what the extra hour is for.",
        "Text on screen over footage",
        "Turns the opening-time change into a small, dry story instead of a notice on the door.",
      ),
    ),
    note: "Every idea uses the real January change, the brand's own characters and past posts, and a mix of four formats with no more than two of each.",
  },
  {
    title: "Invoicing app on late payments",
    label: "gold",
    brain: "Tallybook",
    inputs: { topic: "late payments", goal: "reach", platform: "x" },
    ideal: items(
      i(
        "Your invoice is not late. Their payment is. A single post that reframes the late invoice and gives the one polite line to send on the due date.",
        "Single post",
        "Built on the brand's own sample line; a calm reframe like this is the kind freelancers repost to each other.",
      ),
      i(
        "Reminder emails, graded: three versions from too soft to too sharp, and the middle one we would send.",
        "Short thread",
        "Late payments is a core topic, and a graded set is easy to save and share without any selling.",
      ),
      i(
        "Poll: do you put a date or 30 days on your invoices? The next day, reply with why a date is harder to ignore.",
        "Poll",
        "Freelancers have opinions on this, so it travels, and it leads to the brand's main tip on its own.",
      ),
      i(
        "A screenshot of an invoice with only the due date highlighted, and one line: dates beat terms.",
        "Photo with a line",
        "Shows the real screen, as the dos ask, and makes one point in a few seconds of reading.",
      ),
      i(
        "Late payment in plain English: what you can politely say on day 30, written as a fill-in-the-blanks template.",
        "Single post",
        "In plain English is the brand's own phrase, and a template is the most useful thing to repost.",
      ),
      i(
        "The awkward bit: chasing a client you like. A short thread with the exact words that keep the relationship friendly.",
        "Short thread",
        "Speaks to the real worry behind late payments, calmly, which is how this brand talks about money.",
      ),
      i(
        "A calendar screenshot with the next Self Assessment deadline circled and the brand line: tax is not scary, not knowing the date is.",
        "Photo with a line",
        "Moves to the brand's second topic for reach, while staying general and never personal tax advice.",
      ),
    ),
    note: "Seven X-native ideas, each a worked example or a reframe for freelancers, with no urgency, no emoji and no tax advice for a specific person.",
  },
  {
    title: "Plumber as it gets colder",
    label: "gold",
    brain: "Fernhill Plumbing",
    inputs: { topic: "boiler and heating problems as it gets colder", goal: "reach", platform: "tiktok" },
    ideal: items(
      i(
        "Boiler pressure in 15 seconds: torch on the gauge, the range to look for, and the one thing you can safely do yourself.",
        "Step-by-step demo",
        "One thing people can check themselves, the brand's favourite kind of post, and a common search once the heating goes on.",
      ),
      i(
        "Here is what we found inside a radiator that would not warm up at the top: bleed it on camera, then the sound it makes.",
        "Voiceover over footage",
        "Uses the brand's own opener and gives people a fix they can do before calling anyone.",
      ),
      i(
        "Know where your stopcock is. Today, not during the leak. Three places it usually hides, shown one by one.",
        "Talking to camera",
        "The brand's own sample line, and a winter leak is when people need to find it fastest.",
      ),
      i(
        "When to call us and when not to: three heating noises, one to ignore, one to watch, one to call about.",
        "Talking to camera",
        "Saying when not to call is on the do list, and it earns trust instead of scaring people.",
      ),
      i(
        "A real winter job in Bristol, from the van to finished, in one sped-up shot. Area named, no house number, no faces.",
        "Text on screen over footage",
        "Shows the real job and the area, as the dos ask, while keeping customers private.",
      ),
      i(
        "Answer the comment: is a boiler service worth it before winter? A straight answer and who it matters most for.",
        "Answer a question from the comments",
        "Answers the exact question people search, in the plain voice the brand is built on.",
      ),
      i(
        "Lagging a pipe in the loft: what it looks like done right, in under 30 seconds.",
        "Step-by-step demo",
        "A cheap job people can do themselves before it gets colder, shown the practical way.",
      ),
    ),
    note: "Reach without fear: every idea teaches one thing or answers one question, uses the brand's own lines, and keeps faces and house numbers out.",
  },
  {
    title: "Desk physio on mouse wrists",
    label: "gold",
    brain: "Desk Stretch",
    inputs: { topic: "wrist and forearm ache from using a mouse all day", goal: "talk", platform: "shorts" },
    ideal: items(
      i(
        "3 wrist moves you can do without letting go of your coffee. One move per line on screen, then ask which one they skip.",
        "Text on screen over footage",
        "Opens with a number and ends on a question, both brand dos, for people who sit all day.",
      ),
      i(
        "Your mouse hand against your other hand: hold both out, compare, then one move for the tired one.",
        "Step-by-step demo",
        "A small, surprising test people try at once and then talk about in the comments.",
      ),
      i(
        "Mouse at the desk edge or close to the keyboard? Show both setups and ask which one people use.",
        "Talking to camera",
        "A friendly disagreement drives comments, the goal, and the answer teaches a better setup.",
      ),
      i(
        "One minute at your desk: a forearm stretch against the desk edge, in real time, with a timer on screen.",
        "Step-by-step demo",
        "One minute and at your desk are brand phrases, and real time makes it easy to follow along.",
      ),
      i(
        "Answer a comment: does a wrist rest help? A calm, honest answer, and when to see a physio in person.",
        "Answer a question from the comments",
        "Practical and honest, and saying when to get checked keeps the brand's promise of promising nothing it cannot keep.",
      ),
      i(
        "Your wrist is not broken. It is bored. Three seconds of shaking it out, then the real move.",
        "Talking to camera",
        "Borrows the rhythm of the brand's best line for a new body part, so it sounds like Desk Stretch at once.",
      ),
      i(
        "Rate your setup: the desk filmed from above, mouse, keyboard and screen circled, and people invited to post theirs.",
        "Voiceover over footage",
        "Gets people talking about their own desks, and every reply is a future post.",
      ),
    ),
    note: "Built for comments: questions, comparisons and a setup to rate, all in one-move-per-line style, with no promise to fix anything.",
  },
  {
    title: "Generic gym content calendar",
    label: "bad",
    brain: "Northside Strength",
    inputs: { topic: "the gym", goal: "reach", platform: "reels" },
    ideal: items(
      i("Motivation Monday: share a motivational quote to inspire your followers.", "Reel", "Motivation always performs well."),
      i("Transformation Tuesday: before-and-after photos of members who got in shape.", "Reel", "Transformations go viral."),
      i("5 tips to unlock your fitness potential.", "Reel", "Tips are popular."),
      i("Beast mode workout of the day.", "Reel", "People love workouts."),
      i("Lose 10 kg in 30 days challenge for the gym.", "Reel", "Challenges drive engagement."),
      i("Ask followers about their fitness goals.", "Reel", "Engagement is key."),
      i('Share a customer review: "Best gym in Manchester" - John S.', "Reel", "Social proof builds trust."),
    ),
    note: "Generic series names, one format seven times, a weight-loss promise, before-and-after photos, banned brand words and a made-up review. Nothing only this gym could post.",
  },
];
