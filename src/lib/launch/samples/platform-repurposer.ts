import type { Platform } from "@/lib/agents/catalog";
import type { RunOutput } from "@/lib/runs/output";
import type { LaunchSample } from "./types";

const versions = (set: Partial<Record<Platform, string>>): RunOutput => ({
  kind: "caption_set",
  captions: Object.entries(set).map(([platform, v]) => ({ platform: platform as Platform, variants: [v!] })),
});

/** A short video version in the layout the instructions ask for. */
const short = (hook: string, script: string, onScreen: string, caption: string) =>
  [`Hook: ${hook}`, `Script: ${script}`, `On screen: ${onScreen}`, `Caption: ${caption}`].join("\n");

export const PLATFORM_REPURPOSER_SAMPLES: LaunchSample[] = [
  {
    title: "Forty croissants, from X to video",
    label: "gold",
    brain: "Crumb and Co",
    inputs: {
      post: "We burned 40 croissants so you would not have to. Lamination is butter folded into dough, again and again, cold. Too warm and the butter melts in. Croissant 41 had layers you could count.",
      posted_on: "x",
      to: ["reels", "tiktok"],
      keep: "Croissant 41",
    },
    ideal: versions({
      reels: short(
        "We burned 40 croissants so you would not have to.",
        "Lamination is butter folded into dough, again and again, and it all stays cold. Too warm and the butter melts in. We burned forty getting there. Then came croissant 41.",
        'Close-up of cold butter going into dough on the bench. Cut to the oven door opening. End on croissant 41 torn open, layers in morning light. Text: "Croissant 41"',
        "Forty burned, one on the counter. Croissant 41 had layers you could count.",
      ),
      tiktok: short(
        "Croissant 41. Here is what the first 40 taught us.",
        "Lamination is butter folded into dough, again and again, cold. Too warm and the butter melts in. We burned 40 croissants learning that, so you would not have to.",
        'Hands folding cold butter into dough, flour on the bench. Text: "Keep it cold". End on croissant 41 pulled apart.',
        "We burned 40 croissants so you would not have to. Croissant 41 had layers you could count. What should we get wrong next?",
      ),
    }),
    note: "The same point and the same numbers, reshaped twice: Reels leads with the confession, TikTok with croissant 41. Nothing added, the must-stay line kept.",
  },
  {
    title: "Desk moves, from TikTok to X and Shorts",
    label: "gold",
    brain: "Desk Stretch",
    inputs: {
      post: "Your back is not broken. It is bored. 3 moves, 1 minute, at your desk. 1. Seated twist, hold 10 seconds each side. 2. Shoulder rolls, 10 back. 3. Reach up and lean left, then right. Which one do you skip?",
      posted_on: "tiktok",
      to: ["x", "shorts"],
    },
    ideal: versions({
      x: "3 moves. 1 minute. At your desk.\n1. Seated twist, 10 seconds each side\n2. Shoulder rolls, 10 back\n3. Reach up, lean left, then right\nYour back is not broken. It is bored. Which one do you skip?",
      shorts: short(
        "3 moves. 1 minute. Do them now, not later.",
        "Your back is not broken. It is bored. One: seated twist, hold 10 seconds each side. Two: shoulder rolls, 10 back. Three: reach up and lean left, then right. Which one do you skip?",
        'Side view of one person in an office chair, natural light, one move per shot. Text on each: "1", "2", "3"',
        "3 desk stretches in 1 minute\nSeated twist, shoulder rolls, reach and lean. Which one do you skip?",
      ),
    }),
    note: "X gets the list as text that works alone; Shorts gets a filmable version with a searchable title. Same three moves, same numbers.",
  },
  {
    title: "Late invoice maths, from X to video",
    label: "gold",
    brain: "Tallybook",
    inputs: {
      post: "Freelancer maths: a £2,400 invoice, 30 days late. Day 1: a friendly reminder with the invoice attached. Day 7: the same, plus the due date in the first line. Day 14: a phone call, not another email.",
      posted_on: "x",
      to: ["tiktok", "shorts"],
      keep: "£2,400",
    },
    ideal: versions({
      tiktok: short(
        "A £2,400 invoice is 30 days late. Here is day 1.",
        "Day 1, a friendly reminder with the invoice attached. Day 7, the same again, with the due date in the first line. Day 14, stop emailing. Pick up the phone.",
        'Screen recording of a reminder email in Tallybook, the attachment highlighted. Text: "Day 1", "Day 7", "Day 14". Last shot: a phone on the desk. Text: "Call"',
        "Chasing a £2,400 invoice that is 30 days late: what to send on day 1, day 7 and day 14. Which day do you usually give up?",
      ),
      shorts: short(
        "Day 14 of a late invoice? Stop emailing.",
        "A £2,400 invoice, 30 days late. Day 1, a friendly reminder, invoice attached. Day 7, the same, with the due date in the first line. Day 14, a phone call, not another email.",
        "A calendar with day 1, 7 and 14 circled, then the reminder email on screen, then a phone on the desk.",
        "What to do when an invoice is 30 days late\nA £2,400 example: the reminder for day 1, day 7, and the phone call on day 14.",
      ),
    }),
    note: "Two different openings for the same three steps, the £2,400 kept, and no reason invented for the phone call that the original does not give.",
  },
  {
    title: "Five dinners receipt, to Reels and Shorts",
    label: "gold",
    brain: "Twelve Quid Kitchen",
    inputs: {
      post: "£12. Five dinners. One very small fridge. Sunday shop receipt: £11.86. Dinners: chickpea curry 61p a portion, egg fried rice, lentil soup, pasta with tinned tomatoes, jacket potatoes with beans. Prices from this Sunday, they change.",
      posted_on: "tiktok",
      to: ["reels", "shorts"],
      keep: "£11.86",
    },
    ideal: versions({
      reels: short(
        "£11.86 on Sunday. Five dinners from one receipt.",
        "Here is the receipt. Here is what it made. Chickpea curry, 61p a portion. Egg fried rice. Lentil soup. Pasta with tinned tomatoes. Jacket potatoes with beans. Prices from this Sunday, and they change.",
        "The receipt held up to the camera with the total circled. Then each dinner for two seconds, steam rising, a price sticker on the curry.",
        "£12 budget, £11.86 spent, five dinners. The chickpea curry came in at 61p a portion. Prices from this Sunday, they change. Which one would you make first?",
      ),
      shorts: short(
        "Five dinners for £11.86. Receipt on screen.",
        "One Sunday shop, £11.86, one very small fridge. Chickpea curry at 61p a portion. Egg fried rice, lentil soup, pasta with tinned tomatoes, and jacket potatoes with beans. Prices from this Sunday. They change.",
        "Receipt in hand, then a fast cut of all five dinners on the counter, the 61p curry last.",
        "Five dinners for £11.86 from one Sunday shop\nChickpea curry at 61p a portion, egg fried rice, lentil soup, pasta, jacket potatoes. Prices from this Sunday, they change.",
      ),
    }),
    note: "Every price exactly as given, the prices-change line kept, the receipt as proof, and the shop never named because the original does not name it.",
  },
  {
    title: "Copy-paste with added claims",
    label: "bad",
    brain: "Northside Strength",
    inputs: {
      post: "Margaret is 61. Six months ago she needed a hand to get up off the floor. Today she deadlifted 60 kg. Two sessions a week and a coach who made her slow down.",
      posted_on: "reels",
      to: ["x", "tiktok"],
    },
    ideal: versions({
      x: "Margaret is 61. Six months ago she needed a hand to get up off the floor. Today she deadlifted 60 kg. Join today and get your summer body in 6 weeks, guaranteed results!",
      tiktok: short(
        "You won't believe what this 61-year-old did!",
        'Lose 15 kg in six months like Margaret did. "Best gym in Manchester" - Margaret T.',
        "Before-and-after photos of Margaret.",
        "Beast mode at 61! No excuses!",
      ),
    }),
    note: "X is a copy with a weight-loss guarantee tacked on; TikTok invents results, a quote and before-and-after photos. Nothing in the original supports any of it.",
  },
  {
    title: "Copper over box dye, Reels to TikTok and X",
    label: "gold",
    brain: "Chair Nine",
    inputs: {
      post: "Jess wanted copper. Her hair had three old box dyes on it. We did a strand test at the consult, then two sessions three weeks apart instead of one long one. Copper on day one would have snapped. Now it is a soft, lived-in copper that fades to gold, not orange. Back in eight weeks for a gloss.",
      posted_on: "reels",
      to: ["tiktok", "x"],
      keep: "strand test",
    },
    ideal: versions({
      tiktok: short(
        "jess wanted copper. three old box dyes said not yet.",
        "so the strand test at the consult came first. copper on day one would have snapped. we split it into two sessions, three weeks apart, instead of one long one. now it is a soft, lived-in copper that fades to gold, not orange. she is back in eight weeks for a gloss.",
        'Mirror shot at the consult, a strand of Jess\'s hair in foil on the trolley. Text: "strand test first". Cut to session two, hands sectioning in window light. Text: "3 weeks later". End on the copper in daylight, no filter.',
        "copper over three old box dyes, in two sessions three weeks apart, because day one would have snapped. back in eight weeks for a gloss.",
      ),
      x: "Jess wanted copper over three old box dyes. Copper on day one would have snapped. So: a strand test at the consult, then two sessions three weeks apart. Now it is a soft, lived-in copper that fades to gold, not orange. Back in eight weeks for a gloss.",
    }),
    note: "TikTok goes lowercase and opens on the problem; X runs as text alone, every fact in order. The strand test kept word for word, the timings exact, no filter on screen, and no claim about hair health the original never made.",
  },
  {
    title: "Pickle's slow groom, newsletter to video",
    label: "gold",
    brain: "Muddy Paws Grooming",
    inputs: {
      post: "Why does Pickle's groom take two and a half hours? Pickle is a rescue spaniel, nervous of the clippers. We start with ten minutes of just sitting on the table. Then feet, then a break outside by the van. The clippers come last, and only on his back. Rushing him once would undo a year of work. If your dog finds grooming hard, tell us at booking and we will plan the time.",
      posted_on: "other",
      to: ["tiktok", "shorts", "reels"],
      keep: "two and a half hours",
    },
    ideal: versions({
      tiktok: short(
        "Pickle's groom takes two and a half hours. On purpose.",
        "Pickle is a rescue spaniel, and the clippers make him nervous. So for the first ten minutes he just sits on the table. Then his feet. Then a break outside by the van. The clippers come last, and only on his back. Rushing him once would undo a year of work.",
        'Pickle sitting on the table, a calm hand on his collar. Text: "10 minutes of just sitting". Cut to his feet, then Pickle sniffing about by the van. Last shot: clippers on his back only.',
        "Two and a half hours for one nervous spaniel, clippers last. Does your dog find grooming hard? Tell us when you book and we will plan the time.",
      ),
      shorts: short(
        "How we groom a rescue spaniel who is nervous of clippers",
        "This is Pickle. Step one: ten minutes of just sitting on the table. Step two: feet. Step three: a break outside by the van. Step four: the clippers, and only on his back. It takes two and a half hours, because rushing him once would undo a year of work.",
        'Wide shot of the grooming table as Pickle settles. Text on each step: "1. Sit", "2. Feet", "3. Break", "4. Clippers last". End on Pickle at pick-up.',
        "Grooming a nervous rescue spaniel: where two and a half hours go\nTen minutes on the table, feet, a break by the van, clippers last. If your dog finds grooming hard, tell us at booking and we will plan the time.",
      ),
      reels: short(
        "Pickle is nervous of the clippers. So they come last.",
        "He is a rescue spaniel, and his groom takes two and a half hours. Ten minutes of just sitting on the table. Then his feet. Then a break outside by the van. Then the clippers, only on his back. Rush him once and a year of work is undone.",
        'Close on a hand holding Pickle\'s paw while his feet are done. Cut to the break by the van. Text: "clippers last". End on the clippers on his back, a calm hand on his collar.',
        "Two and a half hours for one nervous rescue spaniel, with the clippers last. If your dog finds grooming hard, tell us at booking and we will plan the time.",
      ),
    }),
    note: "A newsletter piece turned into three different videos: TikTok opens on the time, Shorts is a searchable step by step, Reels opens on the clippers. Pickle's name and breed in each, calm handling only, the must-stay line exact, and nothing promised beyond planning the time.",
  },
  {
    title: "Batch 22 seconds, from X to video",
    label: "gold",
    brain: "Kiln Street Ceramics",
    inputs: {
      post: "Batch 22: 30 mugs in the new speckled oatmeal glaze. The glaze test said 1240°C. The top shelf ran hotter, and six mugs came out with the glaze pooled at the foot. They are seconds now. Same clay, same mug, half price in the seconds sale.",
      posted_on: "x",
      to: ["reels", "shorts"],
      keep: "Batch 22",
    },
    ideal: versions({
      reels: short(
        "Batch 22 opened. Six of 30 mugs ran at the foot.",
        "The glaze test said 1240 degrees. The top shelf of the kiln ran hotter. On those six mugs, the speckled oatmeal glaze pooled at the foot. So they are seconds now. Same clay, same mug, half price in the seconds sale.",
        'The kiln door opening on Batch 22. Hands lift a mug from the top shelf and turn it to show the glaze pooled at the foot. Text: "glaze test: 1240°C", then "top shelf ran hotter". End on the six seconds lined up beside the rest of the batch.',
        "Batch 22: 30 mugs in speckled oatmeal. The top shelf ran hotter than the 1240°C glaze test, so six have glaze pooled at the foot. Seconds now: same clay, same mug, half price.",
      ),
      shorts: short(
        "Same glaze, same clay. The top shelf ran hotter.",
        "Batch 22 was 30 mugs in the new speckled oatmeal glaze, tested at 1240 degrees. The top shelf ran hotter, and six mugs came out with the glaze pooled at the foot. They go in the seconds sale. Same clay, same mug, half price.",
        'Two mugs side by side, one from the middle shelf, one from the top, the pooled foot turned to camera. Text: "Batch 22", then "glaze test: 1240°C".',
        "Glaze pooled at the foot: six seconds from Batch 22\nThe top shelf ran hotter than the 1240°C glaze test. Same clay, same mug, half price in the seconds sale.",
      ),
    }),
    note: "Every number kept (22, 30, six, 1240°C, half price), the flaw shown rather than hidden, and no sale date or countdown added because the original gives none. Reels opens on the kiln, Shorts on the cause, with a title people could search.",
  },
  {
    title: "2 a.m. decaf, reposted on X and Reels",
    label: "gold",
    brain: "Night Owl Coffee",
    inputs: {
      post: "2 a.m. and the decaf oat latte has outsold every other cup tonight. blame the nurses coming off the late shift. one more cup, no 4 a.m. regrets.",
      posted_on: "x",
      to: ["x", "reels"],
      keep: "no 4 a.m. regrets",
    },
    ideal: versions({
      x: "decaf oat latte. 2 a.m. nothing on the menu has sold more tonight.\nthat one's on the nurses off the late shift.\none more cup, no 4 a.m. regrets.",
      reels: short(
        "2 a.m. and the decaf oat latte is winning.",
        "nothing else on the menu has sold more tonight. that is down to the nurses coming off the late shift. decaf, oat milk, still warm. one more cup, no 4 a.m. regrets.",
        'a decaf oat latte set down under the lamp, steam rising. text: "2 a.m.". then the order screen, cup after cup. end on the cup by the dark window.',
        "the decaf oat latte has outsold every other cup tonight. that one's on the late shift nurses. one more cup, no 4 a.m. regrets ☕",
      ),
    }),
    note: "The X repost is a fresh take, not a copy, and both versions stay lowercase, short and with one emoji at most. The nurses and the 2 a.m. detail carry it, the must-stay line is exact, and no claim about sleep is added.",
  },
  {
    title: "Boiler at 0.5 bar, TikTok to X and Shorts",
    label: "gold",
    brain: "Fernhill Plumbing",
    inputs: {
      post: "Boiler pressure dropping every week? Here is what we found in a flat in Easton. The gauge was at 0.5 bar, and it should sit between 1 and 1.5 when the heating is off. The cause was a weeping valve on a radiator in the back bedroom. A drip a day, all summer, straight into the carpet. Worth a look: check your gauge with the heating off, and look under each radiator valve with a torch. If it keeps dropping after you top it up, call us.",
      posted_on: "tiktok",
      to: ["x", "shorts"],
      keep: "0.5 bar",
    },
    ideal: versions({
      x: "Boiler pressure dropping every week? In a flat in Easton the gauge read 0.5 bar. The cause: a weeping radiator valve in the back bedroom, a drip a day all summer. Worth a look: check the gauge with the heating off (it should sit between 1 and 1.5), then a torch under each valve.",
      shorts: short(
        "Boiler at 0.5 bar again? Look under your radiator valves.",
        "Here is what we found in a flat in Easton. The pressure was dropping every week. The gauge was at 0.5 bar, and with the heating off it should sit between 1 and 1.5. The cause was a weeping valve on a radiator in the back bedroom. A drip a day, all summer, straight into the carpet. Check your gauge with the heating off, then look under each valve with a torch. If it keeps dropping after you top it up, call us.",
        'Close-up of the boiler gauge needle. Text: "0.5 bar". Cut to torchlight under the radiator valve and the damp carpet beneath it. Text: "1 to 1.5 with the heating off". End on a hand with a torch checking the next valve.',
        "Boiler pressure keeps dropping? What to check first\nA weeping radiator valve in Easton took the gauge down to 0.5 bar. Check yours with the heating off, then a torch under each valve.",
      ),
    }),
    note: "X leads with the question and fits the cause and the check into one post that works without the video; Shorts keeps the whole job and the call-us line, with a title that answers a search. The area named, no prices, no exclamation marks, nothing scary added.",
  },
  {
    title: "Dev's first pull-up, Shorts to TikTok and Reels",
    label: "gold",
    brain: "Northside Strength",
    inputs: {
      post: "Dev's first pull-up took 14 weeks. Week 1 he could hang from the bar for 8 seconds. Then slow lowering from the top, three sets, twice a week. Week 14, one full pull-up, chin over the bar. His coach Sam filmed it. Form first, then the number.",
      posted_on: "shorts",
      to: ["tiktok", "reels"],
      keep: "14 weeks",
    },
    ideal: versions({
      tiktok: short(
        "Dev's first pull-up took 14 weeks. Here is how.",
        "Week 1, he could hang from the bar for 8 seconds. Then slow lowering from the top: three sets, twice a week. Week 14, one full pull-up, chin over the bar. His coach Sam filmed it. Form first, then the number.",
        'The bar, chalk dust in the morning light. Text: "Week 1: 8-second hang". Cut to Dev lowering slowly from the top. Text: "3 sets, twice a week". End on Sam\'s clip, chin over the bar. Text: "Week 14"',
        "Dev's first pull-up: 14 weeks from an 8-second hang to chin over the bar. Slow lowering, three sets, twice a week. What lift are you working towards?",
      ),
      reels: short(
        "Chin over the bar. Week 14.",
        "This is Dev's first full pull-up, filmed by his coach Sam. 14 weeks ago he could hang from the bar for 8 seconds. Since then, slow lowering from the top, three sets, twice a week. Form first, then the number.",
        'Open on Sam\'s clip as Dev\'s chin clears the bar. Text: "14 weeks". Cut to Dev lowering slowly from the top while Sam watches his form. Text: "form first"',
        "Dev's first pull-up took 14 weeks, starting from an 8-second hang. Slow lowering from the top, three sets, twice a week, and his coach Sam filming the day it landed.",
      ),
    }),
    note: "The good twin of the bad Northside sample: real numbers kept exactly, no body talk, no before-and-after, no promise to the viewer. TikTok tells it in order, Reels opens on the finished rep and works back.",
  },
];
