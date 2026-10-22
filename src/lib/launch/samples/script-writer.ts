import type { RunOutput } from "@/lib/runs/output";
import type { LaunchSample } from "./types";

const beat = (section: string, seconds: number, spoken: string, on_screen: string) => ({ section, seconds, spoken, on_screen });
const script = (...sections: ReturnType<typeof beat>[]): RunOutput => ({ kind: "script", sections });

export const SCRIPT_WRITER_SAMPLES: LaunchSample[] = [
  {
    title: "Three-day croissant",
    label: "gold",
    brain: "Crumb and Co",
    inputs: {
      idea: "Why our croissants take three days: day one the dough, day two the butter goes in, day three they are shaped and baked. That is why they sell out by ten.",
      length: "s30",
      format: "talking_head",
      footage: "the bench, the fridge, the oven, my hands, the counter",
      mood: "brand",
    },
    ideal: script(
      beat("hook", 3, "This croissant took three days. Here is why.", 'Baker to camera at the counter, one croissant held up. Text: "3 days"'),
      beat(
        "setup",
        9,
        "Day one, the dough. It rests in the fridge. Day two, the butter goes in, cold, folded over and over.",
        'Hands on the bench, dough into the fridge. Cut to cold butter folded into dough, slow. Text: "Day 1", then "Day 2"',
      ),
      beat(
        "turn",
        10,
        "Day three, we shape them and bake them. You cannot rush the layers. The butter has to stay cold the whole way.",
        'Hands shaping croissants on the bench, the tray going into the oven, the oven light on. Text: "Day 3"',
      ),
      beat(
        "ending",
        8,
        "Three days to make one. About three minutes to eat one. That is why they are gone by ten.",
        'Back to camera at the counter, an empty tray beside the till. Text: "Gone by 10"',
      ),
    ),
    note: "One batch, one arc, every shot from the list they can film, a dry joke to end, no exclamation marks and nothing called artisanal.",
  },
  {
    title: "Find your stopcock",
    label: "gold",
    brain: "Fernhill Plumbing",
    inputs: {
      idea: "Most people do not know where their stopcock is until water is coming through the ceiling. Show where it usually is: under the kitchen sink, near the front door, or in a cupboard. Turn it clockwise to shut it off.",
      length: "s30",
      format: "voiceover",
      footage: "under a kitchen sink, a hallway cupboard, the front door, a stopcock being turned, my torch",
    },
    ideal: script(
      beat("hook", 3, "Where is your stopcock? Find it today.", 'Torch beam sweeping under a kitchen sink. Text: "Find it today"'),
      beat("setup", 8, "When a pipe goes, this is the tap that stops the water. You do not want to be hunting for it then.", "Torch on the pipes under the sink, a slow pan to the stopcock."),
      beat(
        "turn",
        12,
        "Look in three places. Under the kitchen sink. Near the front door, where the pipe comes in. Or low down in a hallway cupboard.",
        'Under the sink with the torch, then the floor by the front door, then a hallway cupboard opened low down. Text: "1", "2", "3"',
      ),
      beat(
        "ending",
        7,
        "Found it? Clockwise shuts it off. If it will not turn, that is worth a look from us.",
        'A hand turning the stopcock clockwise. Text: "Clockwise to shut off"',
      ),
    ),
    note: "The brand's own warning, said calmly: three places, one action, and an honest line on when to call. No scare, no price.",
  },
  {
    title: "One tin, three dinners",
    label: "gold",
    brain: "Twelve Quid Kitchen",
    inputs: {
      idea: "One tin of chickpeas, three dinners: a curry, a smashed chickpea sandwich filling, and crispy chickpeas on a salad. The tin was 55p, so that is about 18p of chickpeas per dinner.",
      length: "s60",
      format: "talking_head",
      footage: "my kitchen counter, the hob, the tin, the receipt, me",
      mood: "lighter",
    },
    ideal: script(
      beat("hook", 3, "One tin of chickpeas. Three dinners. 55p.", 'Me to camera, holding the tin up. Text: "55p"'),
      beat(
        "setup",
        13,
        "Chickpeas are the hardest-working thing in my cupboard, so this week I made one tin do three jobs. That's about 18p of chickpeas per dinner. I did the maths so you don't have to.",
        'Me at the counter, the receipt next to the tin. Text: "18p a dinner"',
      ),
      beat(
        "turn",
        32,
        "Dinner one, a curry. Half the tin, an onion, whatever spices you've got. Dinner two, I smash a quarter of the tin with a fork, bit of mayo, and that's a sandwich filling. Dinner three, the last quarter goes in a hot pan till it's crispy, then on top of a salad. Same tin. Three completely different dinners.",
        'The hob, the curry bubbling. Cut to a fork smashing chickpeas in a bowl. Cut to chickpeas crisping in a pan, then tipped onto a salad. Text: "1", "2", "3" on each dinner',
      ),
      beat(
        "ending",
        12,
        "So next time chickpeas are on the shelf, don't walk past them. Tell me your hardest-working tin and I'll cost it out to the penny.",
        'Me to camera with all three plates on the counter. Text: "Your turn: which tin?"',
      ),
    ),
    note: "Chatty, first person, a little lighter than usual, with the 55p and 18p exactly as given and a call to comment that she can actually deliver.",
  },
  {
    title: "One move for a stiff neck",
    label: "gold",
    brain: "Desk Stretch",
    inputs: {
      idea: "One move for a stiff neck at your desk: sit tall, drop your right ear toward your right shoulder, hold for 15 seconds, then swap sides.",
      length: "s15",
      format: "voiceover",
      footage: "me at my desk, side view, my office chair",
    },
    ideal: script(
      beat("hook", 3, "1 move. 1 stiff neck. Now.", 'Side view of me at the desk. Text: "1 move"'),
      beat("setup", 3, "Sit tall, shoulders down, nice and gentle.", "Me sitting up straight in the office chair, side view."),
      beat(
        "turn",
        6,
        "Drop your right ear toward your right shoulder. Hold for 15 seconds. Then swap.",
        'Close side view, ear dropping toward the shoulder, the clip sped up. Text: "15 s each side"',
      ),
      beat("ending", 3, "Which side was tighter?", 'Me back at the keyboard. Text: "Left or right?"'),
    ),
    note: "Fifteen seconds really is fifteen seconds: opens with a number, one move, ends on a question, gentle wording, no promise to fix anything.",
  },
  {
    title: "Salesy app ad",
    label: "bad",
    brain: "Tallybook",
    inputs: { idea: "A video about why freelancers should use our invoicing app.", length: "s30", format: "talking_head" },
    ideal: script(
      beat("hook", 3, "Are you ready to take your freelance business to the next level?!", "Stock photos of laptops and coffee."),
      beat("setup", 9, "In today's fast-paced digital landscape, freelancers need a seamless, all-in-one solution.", "More stock photos of people smiling at laptops."),
      beat("turn", 12, "Tallybook is a game changer that will revolutionize how you get paid. Our customers say they get paid twice as fast!", "Logo animation with sparkles."),
      beat("ending", 6, "Sign up today before it's too late! Like and subscribe!", "Logo on screen with a big sign-up button."),
    ),
    note: "An ad, not a video: stock phrases, banned brand words (seamless, all-in-one), a made-up customer claim, stock photos, fake urgency and a like-and-subscribe ending. A freelancer learns nothing.",
  },
];
