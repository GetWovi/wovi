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
  {
    title: "Gerald's fortnight away, newsletter to X",
    label: "gold",
    brain: "Crumb and Co",
    inputs: {
      post: "What happens to a nine-year-old sourdough starter when the bakery shuts for a fortnight? Gerald went home with Tom, our head baker, in a cool bag on the passenger seat. Tom fed him every night at 10: rye flour and water, nothing fancy. Tom's flatmate asked if he could give him a name. We told him Gerald already has one. Back on the Monday, and the first 60 loaves of the 5 a.m. shift rose like nothing had happened.",
      posted_on: "other",
      to: ["x"],
      keep: "Gerald",
    },
    ideal: versions({
      x: "Bakery shut for a fortnight, so Gerald, our nine-year-old starter, went home with Tom, our head baker. Cool bag, passenger seat, rye flour and water every night at 10. On the Monday, 60 loaves rose like nothing had happened. Tom's flatmate offered to name him. He has a name.",
    }),
    note: "A newsletter story cut to one X post: the cool bag and the 10 p.m. feed kept, the 60 loaves as the payoff, the flatmate as the small dry joke at the end. Gerald by name, nothing about the bread the story does not say.",
  },
  {
    title: "Wrong scales, TikTok to X and Reels",
    label: "gold",
    brain: "Crumb and Co",
    inputs: {
      post: "The scales said 1 kg of flour. The scales were wrong. 18 trays of flat focaccia later, we bought new scales. £34. Should have done it in March.",
      posted_on: "tiktok",
      to: ["x", "reels"],
    },
    ideal: versions({
      x: "18 trays of flat focaccia. The cause: scales that said 1 kg of flour and were wrong. New scales cost £34. Should have bought them in March.",
      reels: short(
        "18 trays of flat focaccia. One wrong set of scales.",
        "The scales said 1 kg of flour. They were wrong. 18 trays came out flat before we worked it out. New scales: £34. We should have bought them in March.",
        'The old scales on the bench, flour piled on top. Text: "1 kg?". Cut to a flat focaccia lifted off the tray. Text: "18 trays". End on the new scales still in the box. Text: "£34"',
        "18 trays of flat focaccia, all from scales that said 1 kg and were wrong.\nNew ones cost £34. March would have been a better time to notice.",
      ),
    }),
    note: "A five-line post with no must-stay line, given two shapes: X leads with the 18 trays and keeps the £34 and March; Reels opens on the cost of the mistake and ends on the new scales. No exclamation marks, no hashtags.",
  },
  {
    title: "Chin tuck, Reels to TikTok and Shorts",
    label: "gold",
    brain: "Desk Stretch",
    inputs: {
      post: "Phone neck? 1 move. Chin tuck: sit tall, slide your chin straight back, eyes level. Hold 5 seconds. Do 10. It looks a bit silly. Do it anyway. Who saw you do it?",
      posted_on: "reels",
      to: ["tiktok", "shorts"],
      keep: "Chin tuck",
    },
    ideal: versions({
      tiktok: short(
        "1 move for phone neck. Chin tuck.",
        "Sit tall. Slide your chin straight back, eyes level. Hold 5 seconds. Do 10. It looks a bit silly. Do it anyway.",
        'One person side-on in an office chair, natural light, a phone on the desk. Text: "Chin tuck". Then "Hold 5 seconds", then "x10".',
        "Chin tuck: chin straight back, eyes level, hold 5 seconds, 10 times. Looks a bit silly. Who saw you do it?",
      ),
      shorts: short(
        "Chin tuck: 1 move for phone neck, 5 seconds at a time.",
        "Sit tall. Slide your chin straight back, keeping your eyes level. Hold for 5 seconds. Do 10. Yes, it looks a bit silly. Do it anyway. Who saw you do it?",
        'Side view, one person, one chair. Text on each step: "1. Sit tall", "2. Chin straight back", "3. Hold 5 seconds", "4. Do 10".',
        "Chin tuck for phone neck: 1 move, 5 seconds, 10 times\nSit tall, chin straight back, eyes level. Looks a bit silly. Who saw you do it?",
      ),
    }),
    note: "One move, every number kept (1, 5, 10), the must-stay name word for word, and the original's own question as the ending rather than the brand's usual sign-off. No promise that it fixes anything, no emoji.",
  },
  {
    title: "Stiff hips at 4 p.m., blog to Reels",
    label: "gold",
    brain: "Desk Stretch",
    inputs: {
      post: "Why do your hips feel stiff at 4 p.m.? Sitting for eight hours keeps your hips bent at about 90 degrees. Stand up after a long stretch of that and the front of your hips can feel tight. You do not need a gym for this. Three moves, at your desk or next to it. 1. Seated figure four: right ankle on left knee, sit tall, hold 20 seconds, swap. 2. Half-kneeling stretch next to your chair: one knee on a cushion, squeeze the bum on that side, hold 20 seconds, swap. 3. Stand up once an hour and walk to the kettle. If the stiffness hangs around or gets worse, see a physio. Which one could you do at 4 p.m. today?",
      posted_on: "other",
      to: ["reels"],
    },
    ideal: versions({
      reels: short(
        "Stiff hips at 4 p.m.? 3 moves, next to your chair.",
        "Eight hours of sitting keeps your hips bent at about 90 degrees. Stand up after that and the front of your hips can feel tight. 1. Seated figure four: right ankle on left knee, sit tall, hold 20 seconds, swap. 2. Half-kneeling next to your chair, one knee on a cushion, squeeze the bum on that side, 20 seconds, swap. 3. Once an hour, stand up and walk to the kettle. If it hangs around or gets worse, see a physio.",
        'One person, one office chair, natural light. Text: "4 p.m.". Then one move per shot, "1", "2", "3", the cushion on the floor for move 2. End on the kettle.',
        "3 moves for stiff hips at 4 p.m., no gym needed.\nFigure four, a half-kneeling stretch, a walk to the kettle once an hour. If the stiffness hangs around, see a physio. Which one could you do today?",
      ),
    }),
    note: "A long blog post cut to one Reel: the reason in two lines, the three moves with every number (eight hours, 90 degrees, 20 seconds, once an hour), and the see-a-physio line kept. No cure promised, no emoji, ends on a question.",
  },
  {
    title: "The 1 a.m. regulars, Reels to X",
    label: "gold",
    brain: "Night Owl Coffee",
    inputs: {
      post: "the 1 a.m. regulars have names now. rosa, flat white, no sugar. the taxi driver who only ever says 'the usual'. kofi from the bakery round the corner, before his shift. if you are up at 1 a.m., there is a stool by the window.",
      posted_on: "reels",
      to: ["x"],
    },
    ideal: versions({
      x: "1 a.m. and the regulars have names now.\nrosa, flat white, no sugar. the taxi driver whose whole order is 'the usual'. kofi from the bakery round the corner, before his shift.\nup at 1 a.m. too? there's a stool by the window.",
    }),
    note: "A Reels caption turned into an X post that works with no video: the three regulars in order, lowercase, three short lines, no emoji needed. Nobody's order or habit invented beyond what the post says.",
  },
  {
    title: "Open till 4 a.m., newsletter to X and Reels",
    label: "gold",
    brain: "Night Owl Coffee",
    inputs: {
      post: "news for the late ones: from friday the 14th we are open till 4 a.m. on fridays and saturdays. the kitchen closes at 2, but toasties and the decaf menu run to the end. a second barista is on those nights, so the queue after the last film at the cinema across the road should move faster. same prices. same lamp by the window.",
      posted_on: "other",
      to: ["x", "reels"],
      keep: "open till 4 a.m.",
    },
    ideal: versions({
      x: "from friday the 14th: open till 4 a.m. on fridays and saturdays.\nkitchen closes at 2, toasties and decaf run to the end.\nsame prices, same lamp by the window, and a second barista for the queue after the last film.",
      reels: short(
        "open till 4 a.m. from friday the 14th.",
        "fridays and saturdays. the kitchen closes at 2, but toasties and the decaf menu go on to the end. there is a second barista on those nights, so the queue after the last film across the road should move faster. same prices. same lamp by the window.",
        'the cinema across the road letting out, neon on the wet pavement. then the clock on the wall past 2, a toastie on the counter. text: "open till 4 a.m.". end on the lamp by the window.',
        "open till 4 a.m. on fridays and saturdays, from friday the 14th. toasties and decaf to the end, same prices 🌙",
      ),
    }),
    note: "News made native twice: X as three lowercase lines with the date first, Reels opening on the new hours. The must-stay line exact, friday the 14th and the 2 o'clock kitchen kept, one emoji at most, and no promise about the queue beyond should move faster.",
  },
  {
    title: "Rachel's first squat, X to all four",
    label: "gold",
    brain: "Northside Strength",
    inputs: {
      post: "Rachel, 47, had never been in a gym. Her first rep was the empty 20 kg bar, three squats, coach Amira's hands an inch from it. Week 6: 40 kg, depth checked on video. She still asks for the tea first.",
      posted_on: "x",
      to: ["x", "tiktok", "shorts", "reels"],
      keep: "Rachel, 47",
    },
    ideal: versions({
      x: "Week 6: Rachel, 47, squatted 40 kg, depth checked on video. Before her first session she had never been in a gym. Rep one was the empty 20 kg bar, three squats, coach Amira's hands an inch away. She still asks for the tea first.",
      tiktok: short(
        "Rachel, 47, had never been in a gym. Week 6: 40 kg.",
        "Her first rep was the empty 20 kg bar. Three squats, with coach Amira's hands an inch from it. By week 6 it was 40 kg, with her depth checked on video. She still asks for the tea first.",
        'Morning light through the roller door. Rachel at the bar, Amira\'s hands an inch away. Text: "Week 1: 20 kg bar". Cut to the week 6 clip from the side. Text: "40 kg, depth checked". End on a mug of tea on the bench.',
        "Rachel, 47, from the empty 20 kg bar to a 40 kg squat by week 6, depth checked on video. What would your first rep be?",
      ),
      shorts: short(
        "First time in a gym at 47. Week 6: 40 kg.",
        "Rachel, 47, had never been in a gym. Her first rep was the empty 20 kg bar, three squats, coach Amira's hands an inch from it. Week 6: 40 kg, depth checked on video. And she still asks for the tea first.",
        'Side-on squat clips in order. Text: "Week 1: empty 20 kg bar", then "Week 6: 40 kg". Last shot: Amira checking the depth on the video.',
        "First gym at 47: from the empty 20 kg bar to a 40 kg squat by week 6\nRachel, 47, started with three squats on the empty bar, coach Amira's hands an inch away. Week 6: 40 kg, depth checked on video.",
      ),
      reels: short(
        "Week 6. 40 kg. Rachel, 47.",
        "This is the squat Amira checked on video, depth and all. Rachel had never been in a gym before. Her first rep was the empty 20 kg bar, three squats, with Amira's hands an inch from it. She still asks for the tea first.",
        'Open on the week 6 squat in morning light. Text: "40 kg". Cut back to the empty 20 kg bar on day one, Amira\'s hands close. Text: "Rep one".',
        "Rachel, 47, squatted 40 kg in week 6. Her first rep was the empty 20 kg bar.\nThree squats, coach Amira an inch away. She still asks for the tea first.",
      ),
    }),
    note: "One X post made native four times: the X repost leads with week 6, TikTok tells it in order, Shorts gets a searchable title, Reels opens on the finished squat. Rachel, 47 word for word, every number kept, no body talk, no promise to the viewer.",
  },
  {
    title: "Two tax dates, Shorts to X",
    label: "gold",
    brain: "Tallybook",
    inputs: {
      post: "Two Self Assessment dates for sole traders. 31 January: your online return is due, and so is the tax you owe. 31 July: the second payment on account, if you have to make them. Whether you do depends on your situation, so check your own tax account. Put both in your calendar now, not in January.",
      posted_on: "shorts",
      to: ["x"],
      keep: "31 January",
    },
    ideal: versions({
      x: "Two Self Assessment dates for sole traders:\n31 January: online return due, and the tax you owe\n31 July: second payment on account, if you have to make them\nWhether you do depends on your situation, so check your own tax account. Both in the calendar now, not in January.",
    }),
    note: "A Shorts script reshaped into an X post that reads alone: the two dates as a list, the depends-on-your-situation line kept so it never reads as advice for one person, and 31 January word for word. No emoji, no penalties or amounts added.",
  },
  {
    title: "Invoice 0052 and the PO number, blog to three",
    label: "gold",
    brain: "Tallybook",
    inputs: {
      post: "What a PO number is, and why a missing one stalls an invoice. Plenty of larger clients will not pay an invoice without their purchase order number on it. Their accounts team matches each invoice to an order, and one without a number goes back in the pile, often without anyone telling you. Ask for the PO number when you agree the work, not when you invoice. Put it near the top, next to your invoice number. Invoice 0052 sat for 41 days without one. We resent it with the PO number on it and it was paid in 3 days. Not every client uses them, so ask.",
      posted_on: "other",
      to: ["tiktok", "shorts", "x"],
    },
    ideal: versions({
      tiktok: short(
        "Invoice 0052 sat unpaid for 41 days. It was missing one number.",
        "The PO number. That is a purchase order number, and plenty of larger clients will not pay without it. Their accounts team matches each invoice to an order. No number, and it goes back in the pile, often without anyone telling you. We resent 0052 with the PO number on it. Paid in 3 days.",
        'Screen recording of invoice 0052 in Tallybook, the line next to the invoice number highlighted. Text: "41 days". Cut to the same invoice with the PO number added. Text: "paid in 3 days".',
        "Invoice 0052: 41 days unpaid without a PO number, paid 3 days after it went back with one. Ask for it when you agree the work. Not every client uses them, so ask.",
      ),
      shorts: short(
        "What is a PO number, and why is my invoice not paid?",
        "A PO number is a purchase order number. Plenty of larger clients will not pay an invoice without it, because their accounts team matches every invoice to an order. Ask for it when you agree the work, not when you invoice, and put it near the top, next to your invoice number. Invoice 0052 sat for 41 days without one. With it, it was paid in 3 days.",
        'A calm desk, then the invoice on screen with one line highlighted: the PO number beside the invoice number. Text: "Ask when you agree the work".',
        "What a PO number is and why a missing one stalls your invoice\nInvoice 0052 waited 41 days without one and was paid 3 days after it went back with the PO number. Not every client uses them, so ask.",
      ),
      x: "Invoice 0052 sat unpaid for 41 days. Missing: the client's PO number. Plenty of larger clients match every invoice to a purchase order, and one without a number goes back in the pile. Ask for it when you agree the work. Resent with it: paid in 3 days.",
    }),
    note: "A how-to blog post made three ways: TikTok opens on invoice 0052, Shorts answers the question people search, X fits the lesson into one post. 41 days and 3 days kept, the not-every-client line kept, and no promise that a PO number gets anyone paid.",
  },
  {
    title: "Seized stopcock, TikTok to Reels",
    label: "gold",
    brain: "Fernhill Plumbing",
    inputs: {
      post: "Here is what we found in a terrace in Bedminster: a stopcock under the kitchen sink that had not been turned in years and would not budge. New one fitted in about forty minutes. Worth a look: find yours and turn it off and on once a year so it does not seize. If it will not move, do not force it. Call a plumber.",
      posted_on: "tiktok",
      to: ["reels"],
      keep: "stopcock",
    },
    ideal: versions({
      reels: short(
        "A stopcock in Bedminster that would not budge.",
        "It sat under the kitchen sink of a terrace and had not been turned in years. We fitted a new one in about forty minutes. Worth a look at yours: find it, then turn it off and on once a year so it does not seize. If it will not move, do not force it. Call a plumber.",
        'Torchlight under the kitchen sink, a hand trying the old stopcock. Text: "not turned in years". Cut to the new one going on, copper pipe close up. End on a hand turning it off and on. Text: "once a year"',
        "A stopcock under a kitchen sink in Bedminster, not turned in years. New one in about forty minutes.\nFind yours and turn it off and on once a year. If it will not move, do not force it, call a plumber.",
      ),
    }),
    note: "A TikTok remade for Reels with the stopcock in the hook and the caption's first line, the area named, no house number or face, no price for the job, and the do-not-force-it line kept as the one thing to check yourself. No exclamation marks.",
  },
  {
    title: "Bleeding a radiator, Shorts to three",
    label: "gold",
    brain: "Fernhill Plumbing",
    inputs: {
      post: "How to bleed a radiator, in plain terms. Cold at the top and warm at the bottom means air is trapped in it. Heating off first, and let the radiator cool. Radiator key on the bleed valve at the top corner, a cloth under it. Quarter turn anticlockwise. You will hear a hiss. When water starts to come out, close it. Then check the boiler gauge: bleeding can drop the pressure, and it should sit between 1 and 1.5 with the heating off. If the radiator is cold all over, that is a different job, so give us a ring.",
      posted_on: "shorts",
      to: ["x", "tiktok", "reels"],
    },
    ideal: versions({
      x: "Radiator cold at the top, warm at the bottom? Air is trapped in it. Heating off, let it cool, key on the bleed valve, cloth underneath, quarter turn anticlockwise. Close it when water comes out. Then check the boiler gauge: 1 to 1.5 with the heating off.",
      tiktok: short(
        "Cold at the top, warm at the bottom? Air is trapped.",
        "Here is how to bleed it, in plain terms. Heating off, and let the radiator cool. Radiator key on the bleed valve at the top corner, a cloth under it. A quarter turn anticlockwise. You will hear a hiss. When water starts to come out, close it. Then check your boiler gauge, because bleeding can drop the pressure. With the heating off it should sit between 1 and 1.5.",
        'A hand on the top of the radiator, then the bottom. Text: "cold top, warm bottom". Close-up of the key on the bleed valve, a cloth underneath. Text: "quarter turn". End on the boiler gauge. Text: "1 to 1.5, heating off"',
        "Bleeding a radiator in plain terms: heating off, key on the valve, quarter turn, close it when water comes out, then check the gauge. Cold all over is a different job, so give us a ring.",
      ),
      reels: short(
        "That hiss is the trapped air coming out.",
        "If a radiator is cold at the top and warm at the bottom, air is trapped. Turn the heating off and let it cool. Key on the bleed valve, cloth underneath, a quarter turn anticlockwise. When water comes out, close it. Bleeding can drop the pressure, so check the gauge after: between 1 and 1.5 with the heating off.",
        'Close on the bleed valve as the key turns and the cloth catches the first drops. Text: "quarter turn anticlockwise". Cut to the boiler gauge needle. Text: "1 to 1.5"',
        "Radiator cold at the top, warm at the bottom? Bleed it with the heating off.\nQuarter turn, close it at the first water, then check the gauge reads 1 to 1.5. Cold all over is a different job: give us a ring.",
      ),
    }),
    note: "A how-to script made native three ways: X keeps the steps and the gauge numbers in one post, TikTok opens on the symptom, Reels on the sound. Every step in order, 1 to 1.5 kept, the cold-all-over line kept as when to call. No prices, no scare.",
  },
  {
    title: "43p lentil dal, Shorts to TikTok and Reels",
    label: "gold",
    brain: "Twelve Quid Kitchen",
    inputs: {
      post: "One 500g bag of red lentils, 95p. Three dinners out of it: dal, lentil bolognese, lentil soup. The dal with rice comes to 43p a portion. Prices from my Sunday shop, they change.",
      posted_on: "shorts",
      to: ["tiktok", "reels"],
      keep: "43p",
    },
    ideal: versions({
      tiktok: short(
        "95p of red lentils. Three dinners. The dal is 43p a portion.",
        "One 500g bag, 95p. Dinner one: dal with rice, 43p a portion. Dinner two: lentil bolognese. Dinner three: lentil soup. Prices from my Sunday shop, and they change.",
        'The bag of red lentils held up next to the receipt, 95p circled. Then each dinner on the counter for two seconds, steam rising, a price sticker on the dal: "43p".',
        "One 95p bag of red lentils, three dinners, and the dal with rice at 43p a portion. Prices from my Sunday shop, they change. Which one first?",
      ),
      reels: short(
        "Dal with rice, 43p a portion. Here is the maths.",
        "A 500g bag of red lentils cost 95p on my Sunday shop. Out of that one bag: dal, lentil bolognese and lentil soup. The dal with rice works out at 43p a portion. Prices change, so these are this Sunday's.",
        'Phone-camera close-up of the 95p label, then lentils pouring into the pan. Text: "43p a portion" over the dal. Quick cuts of the bolognese and the soup.',
        "Three dinners from one 95p bag of red lentils. The dal with rice is 43p a portion.\nPrices from my Sunday shop, they change.",
      ),
    }),
    note: "A short Shorts script reshaped for TikTok and Reels: both open on a price, both keep 95p, 500g and 43p to the penny, and both keep the prices-change line. The shop stays unnamed because the original does not name it. No diet talk.",
  },
  {
    title: "Leftover rice rules, TikTok repost and Shorts",
    label: "gold",
    brain: "Twelve Quid Kitchen",
    inputs: {
      post: "Rice is the cheapest thing in my trolley. 1kg for 89p, which works out at about 7p a portion. But cooked rice is the one leftover I am strict about. Cool it fast: spread it on a plate, not left in the pan. Fridge within an hour. Eat it within a day. Reheat it once, until it is steaming hot all the way through. The egg fried rice on Thursday is Wednesday's rice. Prices from my Sunday shop, they change.",
      posted_on: "tiktok",
      to: ["tiktok", "shorts"],
    },
    ideal: versions({
      tiktok: short(
        "Wednesday's rice is Thursday's egg fried rice. Here are my rules.",
        "Rice is about 7p a portion: 1kg for 89p. But cooked rice is the one leftover I am strict about. Spread it on a plate to cool fast, not left in the pan. Fridge within an hour. Eat it within a day. Reheat it once, until it is steaming hot all the way through.",
        'Rice spread out on a plate by the window. Text: "fridge within an hour". Then the tub going into a very small fridge, then Thursday\'s pan, steam everywhere. Text: "reheat once".',
        "About 7p a portion, and four rules for the leftovers: cool it fast, fridge within an hour, eat within a day, reheat once until steaming hot. Prices from my Sunday shop, they change.",
      ),
      shorts: short(
        "How I keep leftover rice for egg fried rice the next day",
        "Rice is the cheapest thing in my trolley: 1kg for 89p, about 7p a portion. Cooked rice is the one leftover I am strict about. Spread it on a plate so it cools fast. Fridge within an hour. Eat it within a day. Reheat it once, until it is steaming hot all the way through. Wednesday's rice, Thursday's egg fried rice.",
        'One rule per shot on the counter. Text: "1. Cool on a plate", "2. Fridge within an hour", "3. Eat within a day", "4. Reheat once, steaming hot".',
        "Leftover rice: cool it fast, fridge it within an hour, reheat it once\n1kg for 89p, about 7p a portion. Wednesday's rice became Thursday's egg fried rice. Prices from my Sunday shop, they change.",
      ),
    }),
    note: "A TikTok reposted fresh on TikTok and made searchable on Shorts. Every price and time kept exactly (89p, about 7p, within an hour, within a day, once), the food-safety steps in the original's order with nothing added, the prices-change line in both captions.",
  },
  {
    title: "Curtain fringe on a cowlick, X to TikTok",
    label: "gold",
    brain: "Chair Nine",
    inputs: {
      post: "Curtain fringe on a cowlick. Cut dry, 20 minutes, left a touch longer on the side the cowlick lifts. It will want a trim in about six weeks. Bring the photo, we will tell you at the consult if your hairline is up for it.",
      posted_on: "x",
      to: ["tiktok"],
    },
    ideal: versions({
      tiktok: short(
        "curtain fringe, meet the cowlick.",
        "we cut it dry. 20 minutes. a touch longer on the side the cowlick lifts. it will want a trim in about six weeks. bring your photo to the consult and we will tell you if your hairline is up for it.",
        'mirror shot in window light, hands lifting the fringe to show the cowlick. text: "cut dry, 20 minutes". close on the longer side. end on the fringe falling into place, no filter.',
        "a curtain fringe cut dry around a cowlick, 20 minutes, a touch longer on the side that lifts. trim in about six weeks. bring the photo to the consult.",
      ),
    }),
    note: "A short X post given a filmable shape for TikTok, lowercase as the brand likes it there: the technique and the 20 minutes named, the six-week trim kept as how long it lasts, the consult as the next step. No filter, no promise that every hairline suits it.",
  },
  {
    title: "Moira's grey blend, Reels repost and X",
    label: "gold",
    brain: "Chair Nine",
    inputs: {
      post: "Moira stopped dyeing her roots in January. Six months of grey grown in, and three inches of old brown on the ends. We did a grey blend: fine babylights through the brown, and a cut that took off the bottom two inches. Three and a half hours. No more root touch-ups every four weeks. She is back in twelve weeks for a toner.",
      posted_on: "reels",
      to: ["reels", "x"],
      keep: "grey blend",
    },
    ideal: versions({
      reels: short(
        "Moira let the grey grow in. Then came the grey blend.",
        "She stopped dyeing her roots in January. Six months later, grey at the root and three inches of old brown on the ends. Fine babylights through the brown, and a cut that took off the bottom two inches. Three and a half hours in the chair. No more root touch-ups every four weeks. She is back in twelve weeks for a toner.",
        'Mirror shot at the consult, Moira\'s grey roots in window light. Cut to foils on the trolley, hands weaving fine sections. Text: "babylights, three and a half hours". End on the finished grey blend in daylight, no filter.',
        "Moira's grey blend: fine babylights through the old brown, two inches off the ends.\nThree and a half hours. No more root touch-ups every four weeks, and back in twelve weeks for a toner.",
      ),
      x: "Moira stopped dyeing her roots in January. Six months of grey later, we did a grey blend: fine babylights through the old brown and two inches off the ends. Three and a half hours. No root touch-ups every four weeks now. Back in twelve weeks for a toner.",
    }),
    note: "A Reel reposted as a fresh Reel and turned into an X post. The technique and the three and a half hours named, the twelve-week toner kept as the upkeep, grey blend word for word, no filter, no before-and-after, no word about looking younger.",
  },
  {
    title: "Dolly's lying-down groom, Shorts repost and Reels",
    label: "gold",
    brain: "Muddy Paws Grooming",
    inputs: {
      post: "Dolly is a 14-year-old Westie. She cannot stand for long now, so she has her groom lying on a mat on the table, in three short goes with naps between. An hour and forty minutes. She went home asleep in the car.",
      posted_on: "shorts",
      to: ["shorts", "reels"],
      keep: "Dolly",
    },
    ideal: versions({
      shorts: short(
        "Dolly is 14, so her groom happens lying down.",
        "Dolly is a Westie, and she cannot stand for long now. So she lies on a mat on the table, and we groom her in three short goes, with naps in between. It takes an hour and forty minutes. She went home asleep in the car.",
        'Dolly lying on a mat on the table, a calm hand on her collar. Text: "go 1", "nap", "go 2", "nap", "go 3". End on Dolly asleep in the car at pick-up.',
        "Grooming an older dog who cannot stand for long: Dolly's three short goes\nDolly, a 14-year-old Westie, lies on a mat on the table, with naps in between. An hour and forty minutes, and home asleep in the car.",
      ),
      reels: short(
        "Three short goes, naps in between. Dolly's groom.",
        "Dolly is a 14-year-old Westie who cannot stand for long now. So she has her groom lying on a mat on the table, in three short goes with naps between. An hour and forty minutes, start to finish.",
        'Close on Dolly\'s paws on the mat, then the scissors working slowly round her face while she lies still. Text: "naps between". End on her asleep in the car.',
        "Dolly is 14 and a Westie, so her groom happens lying down, in three short goes with naps between.\nAn hour and forty minutes. Home asleep in the car.",
      ),
    }),
    note: "A Short reposted fresh on Shorts with a title people search, and made into a Reel that opens on the naps. Dolly, her age and breed in each, the hour and forty minutes kept, calm handling only, nothing about her health beyond what the post says.",
  },
  {
    title: "Ted's ear mats, X to Shorts",
    label: "gold",
    brain: "Muddy Paws Grooming",
    inputs: {
      post: "Ted the cockapoo came in matted close to the skin behind his ears and under his collar. We clipped those bits short instead of brushing out, because mats that tight pull. His owner now combs behind his ears every other day with the comb we showed her at pick-up.",
      posted_on: "x",
      to: ["shorts"],
    },
    ideal: versions({
      shorts: short(
        "Why we clipped Ted's ears short instead of brushing out the mats",
        "Ted is a cockapoo. He came in matted close to the skin behind his ears and under his collar. Mats that tight pull when you brush them out, so we clipped those bits short instead. At pick-up we showed his owner a comb, and now she combs behind his ears every other day.",
        'Ted on the table, a calm hand on his collar, the clippers on the matted patch behind one ear. Text: "behind the ears", then "under the collar". End on the comb we showed his owner, going gently behind his ear.',
        "Matted behind the ears: why we clip instead of brushing out\nTed the cockapoo was matted close to the skin behind his ears and under his collar. Mats that tight pull, so we clipped them short. His owner now combs there every other day.",
      ),
    }),
    note: "One X post made into a Short that answers what owners search. Ted's name and breed kept, the reason for clipping in the original's own words, the owner shown doing the right thing rather than blamed, and no promise that the mats will not come back.",
  },
  {
    title: "Batch 23 glaze test, Reels to X",
    label: "gold",
    brain: "Kiln Street Ceramics",
    inputs: {
      post: "Glaze test for Batch 23: 12 tiles, one glaze, three thicknesses. Thin came out brown and matt. Medium gave the blue we were after. Thick ran off the tile and onto the kiln shelf. Medium it is. The shelf needs grinding.",
      posted_on: "reels",
      to: ["x"],
      keep: "Batch 23",
    },
    ideal: versions({
      x: "Glaze test for Batch 23. 12 tiles, one glaze, three thicknesses.\nThin: brown, matt.\nMedium: the blue we were after.\nThick: ran off the tile and onto the kiln shelf.\nMedium it is. The shelf needs grinding.",
    }),
    note: "A Reel's caption turned into an X post that reads without the tiles on screen: the three results as short lines, Batch 23 word for word, the failure on the shelf kept as the dry last line. No release date, no stock count, nothing called perfect.",
  },
  {
    title: "Nine days for one mug, newsletter to three",
    label: "gold",
    brain: "Kiln Street Ceramics",
    inputs: {
      post: "Why a mug takes nine days. Day 1: thrown on the wheel. Day 2: trimmed when leather-hard, handle pulled and joined. Days 3 to 6: drying slowly under plastic, so the handle join does not crack. Day 7: bisque fired to 1000°C. Day 8: glazed. Day 9: glaze fired to 1240°C, and the kiln opened the next morning. That is why the mugs come in batches of 30, not one at a time.",
      posted_on: "other",
      to: ["x", "reels", "shorts"],
    },
    ideal: versions({
      x: "One mug, nine days.\nDay 1: thrown\nDay 2: trimmed, handle pulled and joined\nDays 3 to 6: slow drying under plastic, so the join does not crack\nDay 7: bisque, 1000°C\nDay 8: glazed\nDay 9: glaze fired, 1240°C\nWhich is why they come in batches of 30.",
      reels: short(
        "Nine days, one mug. Day 1 is the wheel.",
        "Day 2, trimmed at leather-hard, and the handle pulled and joined. Days 3 to 6, it dries slowly under plastic, so the handle join does not crack. Day 7, the bisque firing, 1000 degrees. Day 8, glaze. Day 9, the glaze firing at 1240 degrees, and the kiln opens the next morning. So the mugs come in batches of 30, not one at a time.",
        'Hands throwing on the wheel. Text: "Day 1". Then one shot per day: trimming, the handle join, mugs under plastic on a dusty shelf, the kiln door. Text: "1000°C", then "1240°C". End on a shelf of 30 mugs.',
        "Nine days from the wheel to the shelf, for every mug. Bisque at 1000°C, glaze at 1240°C, batches of 30.\nDays 3 to 6 are the slow ones: drying under plastic so the handle join does not crack.",
      ),
      shorts: short(
        "Why does a handmade mug take nine days?",
        "Day 1, it is thrown on the wheel. Day 2, trimmed when leather-hard, and the handle pulled and joined. Days 3 to 6, slow drying under plastic, so the handle join does not crack. Day 7, bisque fired to 1000 degrees. Day 8, glazed. Day 9, glaze fired to 1240 degrees, and the kiln opened the next morning.",
        "A strip along the bottom of the screen, Day 1 to Day 9, filling in as each step is shown. Close on the handle join on day 2.",
        "Why a handmade mug takes nine days, wheel to kiln\nThrown, trimmed, dried slowly under plastic, bisque at 1000°C, glazed, then glaze fired at 1240°C. That is why the mugs come in batches of 30.",
      ),
    }),
    note: "A newsletter explainer made three ways: X as a day-by-day list that reads alone, Reels as a walk through the days, Shorts as the answer to a question people search. Every day and temperature exact, batches of 30 kept, no claim about food safety or the dishwasher.",
  },
];
