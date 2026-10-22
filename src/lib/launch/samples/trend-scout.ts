import { items, type LaunchSample } from "./types";

const t = (trend: string, what_it_looks_like: string, evidence: string, how_you_could_use_it: string) => ({ trend, what_it_looks_like, evidence, how_you_could_use_it });

const PLACEHOLDER_NOTE = " The evidence lines show the shape trend_lookup must return; their numbers are placeholders until the tool exists.";

export const TREND_SCOUT_SAMPLES: LaunchSample[] = [
  {
    title: "Beginner strength gym on TikTok",
    label: "gold",
    brain: "Northside Strength",
    inputs: { niche: "beginner strength gym", platform: "tiktok" },
    ideal: items(
      t(
        "First lift, filmed start to finish",
        "One person's very first attempt at a lift, uncut, with the coach's cue as on-screen text and their face at the end.",
        "Lookup: 58 posts from UK fitness accounts this week, up from 21 the week before. Top example from a small gym, original audio.",
        "Film a new member's first deadlift with the coach's cue on screen, then their face. Only with their permission.",
      ),
      t(
        "Form fix, side by side",
        "Split screen: a common beginner mistake on one side, the fix on the other, with the coach talking over both.",
        "Lookup: the search term form check has risen three weeks in a row; 34 posts from small gyms this week.",
        "The coach shows the most common squat mistake from beginner sessions and the one cue that fixes it. Form first, weight later.",
      ),
      t(
        "Age on screen, number on the bar",
        "Text on screen with a member's age and the weight, then the lift in real time, no music drop.",
        "Lookup: posts pairing age and weight in strength niches roughly doubled in 14 days, mostly from accounts under 10k followers.",
        "Margaret, 61, and her 60 kg deadlift, with her permission, plus one line on how: two sessions a week for six months.",
      ),
      t(
        "What your first session really looks like",
        "A point-of-view walk through a first visit, step by step, ending on something small and friendly.",
        "Lookup: first gym session is among the ten fastest-rising fitness searches this week.",
        "Show the first session in 30 seconds: 20 minutes learning to brace, one lift, a cup of tea. Nothing scary in it.",
      ),
      t(
        "Video reply to a comment",
        "A short answer to one viewer's comment, with the comment shown as a sticker on screen.",
        "Lookup: comment replies are about one in six top small-gym posts this week. A steady signal for a month, not a spike.",
        "Answer the most common beginner question in the comments, like whether you need to be fit to start, with the coach on camera.",
      ),
    ),
    note: "Every trend is a format, not a theme, and every use is a post this gym could shoot this week with its own people and numbers." + PLACEHOLDER_NOTE,
  },
  {
    title: "Local plumber on Reels",
    label: "gold",
    brain: "Fernhill Plumbing",
    inputs: { niche: "plumbing and heating firm", platform: "reels" },
    ideal: items(
      t(
        "Here is what we found reveals",
        "Panel off, torch on, a slow reveal of the problem, with a calm voiceover in plain words.",
        "Lookup: reveal clips from UK trades up three weeks running; about 120 posts from local trades this week.",
        "The Redland bath panel job: torch on the soft joist, then what a ten-minute plumbing fix early would have saved.",
      ),
      t(
        "One thing to check tonight",
        "A 15-second check viewers can do at home, one step per line of on-screen text.",
        "Lookup: check-this-at-home posts in home and DIY Reels up about 40% this month.",
        "Find your stopcock: where it usually is, which way to turn it, and why today and not during a leak.",
      ),
      t(
        "What is that noise",
        "A household sound plays first, like a gurgling radiator or a ticking pipe, then a plain explanation of what it means.",
        "Lookup: sound-first home repair posts are a small but rising format; 18 posts this week, up from 7.",
        "Record a gurgling radiator on a job and explain bleeding it, and when the noise means calling a heating engineer.",
      ),
      t(
        "Gauge close-up with one number",
        "A tight shot of a dial or meter with one number in big text and what it should read.",
        "Lookup: boiler pressure searches rising as the weather turns; 9 of the top 20 heating Reels this week show a gauge.",
        "Boiler pressure: the gauge, the range to look for, the one safe thing to do yourself, and when to call.",
      ),
      t(
        "Van to finished job in one shot",
        "A short time-lapse from opening the van door to the finished job, with the area named in text.",
        "Lookup: weak signal. Time-lapse job clips are steady, not rising, but they are the most saved format for local trades this month.",
        "A winter boiler check in Bristol, van to done, naming the area but never the house number or a customer's face.",
      ),
    ),
    note: "Practical formats that fit the brand's show the job, teach the fix rule, and every one respects the privacy don'ts." + PLACEHOLDER_NOTE,
  },
  {
    title: "Budget cooking creator on TikTok",
    label: "gold",
    brain: "Twelve Quid Kitchen",
    inputs: { niche: "budget cooking creator", platform: "tiktok" },
    ideal: items(
      t(
        "Receipt first, food after",
        "Open on the receipt in hand with the total circled, then fast cuts of every meal it made.",
        "Lookup: receipt-first openings in UK budget cooking up from 12 to 47 posts in two weeks.",
        "The Sunday shop receipt on screen, then each dinner for a few seconds with its price per portion.",
      ),
      t(
        "Price tags on everything",
        "Every ingredient shown with its price as a sticker, adding up to a running total in the corner.",
        "Lookup: on-screen running totals appear in 6 of the top 20 budget cooking posts this week.",
        "Chickpea curry with every ingredient priced to the penny and the total per portion at the end.",
      ),
      t(
        "One ingredient, three dinners",
        "The same ingredient used three ways across the week, with a count of how much is left.",
        "Lookup: one-ingredient series rising for budget cooking; the search term one tin meals is up about 30% this month.",
        "One tin of chickpeas across three dinners, with a running count of what is left in the tin.",
      ),
      t(
        "Rate my shop, kindly",
        "Viewers share a shopping list or receipt and the creator picks one thing to stretch further.",
        "Lookup: stitch and reply formats on shopping hauls up 2x in budget food this month; comments full of lists.",
        "Invite followers to share their weekly shop and pick one thing to stretch, kindly, never judging anyone's budget.",
      ),
      t(
        "Real-time dinner, one take",
        "A whole dinner cooked in one continuous shot, sped up, with a clock and the price on screen.",
        "Lookup: one-take cooking clips steady in the top budget cooking posts; not new, still saved a lot.",
        "This week's lowest-cost dinner start to finish in one take, with the clock and the price per portion on screen.",
      ),
    ),
    note: "Each trend fits the receipts-as-proof idea and the to-the-penny voice; the shop-rating idea is framed so it never shames a budget." + PLACEHOLDER_NOTE,
  },
  {
    title: "Invoicing app on X",
    label: "gold",
    brain: "Tallybook",
    inputs: { niche: "invoicing app for freelancers", platform: "x" },
    ideal: items(
      t(
        "Two-line before and after",
        "Two short lines, the old way and the better way, and nothing else.",
        "Lookup: two-line contrast posts among the most reposted formats from freelance accounts this week.",
        "'Payment terms: 30 days' against 'Due 14 March', with one line on why a date is harder to ignore.",
      ),
      t(
        "Screenshot with one highlighted line",
        "A product screenshot with a single line highlighted and one sentence explaining it.",
        "Lookup: single-highlight screenshots up about 25% in software accounts this month.",
        "A Tallybook invoice with only the due date highlighted, and one sentence for freelancers on why it matters.",
      ),
      t(
        "Numbered money maths",
        "A post that walks through one sum in numbered lines, each line a step.",
        "Lookup: numbered-step posts with pound amounts rising among UK freelancer accounts for three weeks.",
        "The £2,400 invoice that is 30 days late: what to send on day 1, day 7 and day 14, one line each.",
      ),
      t(
        "Poll, then the answer",
        "A two-option poll, followed the next day by a reply with the answer and the reason.",
        "Lookup: polls from freelancer accounts drawing about 3x the replies of plain posts this week.",
        "Poll: a date or 30 days on your invoices? The next day, reply with why a date is harder to ignore.",
      ),
      t(
        "Myth, corrected in one post",
        "One common belief, stated plainly, then corrected in a sentence or two.",
        "Lookup: weak signal. Correction posts are steady, not rising, but fit the freelance money topic well.",
        "Your invoice is not late, their payment is: a calm post on what to send on the day it is due.",
      ),
    ),
    note: "Text-first formats that suit X, each turned into one calm, worked example for freelancers, never salesy." + PLACEHOLDER_NOTE,
  },
  {
    title: "Generic advice with no evidence",
    label: "bad",
    brain: "Crumb and Co",
    inputs: { niche: "bakery", platform: "reels" },
    ideal: items(
      t("Trending audio", "Use whatever sound is trending right now.", "Everyone is using it.", "Post your products with a trending sound to unlock the power of Reels."),
      t("Behind the scenes content", "Show your audience what happens behind the scenes.", "Behind the scenes is huge right now.", "Next-level behind the scenes content for your bakery."),
      t("Day in the life", "Film a day in your life.", "Very popular.", "A day in the life of a baker, guaranteed to go viral."),
      t("Tips and tricks", "Share helpful tips with your followers.", "Tips always perform well.", "Share baking tips and tricks."),
      t("Post consistently", "Post every day to grow.", "The algorithm loves consistency.", "Post every day and watch your bakery skyrocket."),
    ),
    note: "Themes, not formats; no evidence from a lookup; nothing only this bakery could shoot; stock phrases and a promise of going viral.",
  },
];
