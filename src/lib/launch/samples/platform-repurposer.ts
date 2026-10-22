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
];
