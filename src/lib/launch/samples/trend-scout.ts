import { items, type LaunchSample } from "./types";

const t = (trend: string, what_it_looks_like: string, evidence: string, source: string, how_you_could_use_it: string) => ({ trend, what_it_looks_like, evidence, source, how_you_could_use_it });

/** Example addresses: they show the shape. A real run cites the pages its own lookup found, and a check holds it to them. */
const src = (path: string) => `https://example.com/${path}`;

const SOURCE_NOTE = " The sources are example addresses that show the shape; a real run cites the pages its lookup found.";

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
        "A gym marketing roundup from 17 October lists uncut first-attempt lifts among the fastest-rising beginner formats, mostly from small gyms with original audio.",
        src("gym-trends/first-lift"),
        "Film a new member's first deadlift with the coach's cue on screen, then their face. Only with their permission.",
      ),
      t(
        "Form fix, side by side",
        "Split screen: a common beginner mistake on one side, the fix on the other, with the coach talking over both.",
        "A TikTok search trends page from 20 October shows form check rising three weeks in a row, led by coaches at small gyms.",
        src("search/form-check"),
        "The coach shows the most common squat mistake from beginner sessions and the one cue that fixes it. Form first, weight later.",
      ),
      t(
        "Age on screen, number on the bar",
        "Text on screen with a member's age and the weight, then the lift in real time, no music drop.",
        "A fitness creator newsletter from 15 October says posts pairing age and weight roughly doubled in two weeks, mostly from small accounts.",
        src("newsletter/age-and-weight"),
        "Margaret, 61, and her 60 kg deadlift, with her permission, plus one line on how: two sessions a week for six months.",
      ),
      t(
        "What your first session really looks like",
        "A point-of-view walk through a first visit, step by step, ending on something small and friendly.",
        "A weekly search report from 21 October lists first gym session among the ten fastest-rising fitness searches.",
        src("search/first-gym-session"),
        "Show the first session in 30 seconds: 20 minutes learning to brace, one lift, a cup of tea. Nothing scary in it.",
      ),
      t(
        "Video reply to a comment",
        "A short answer to one viewer's comment, with the comment shown as a sticker on screen.",
        "A small-business TikTok guide updated 12 October says video replies to comments are a steady format for a month, not a spike.",
        src("guides/comment-replies"),
        "Answer the most common beginner question in the comments, like whether you need to be fit to start, with the coach on camera.",
      ),
    ),
    note: "Every trend is a format, not a theme, and every use is a post this gym could shoot this week with its own people and numbers." + SOURCE_NOTE,
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
        "A trades marketing roundup from 16 October says slow reveal clips from local trades have risen three weeks running.",
        src("trades/reveal-clips"),
        "The Redland bath panel job: torch on the soft joist, then what a ten-minute plumbing fix early would have saved.",
      ),
      t(
        "One thing to check tonight",
        "A 15-second check viewers can do at home, one step per line of on-screen text.",
        "A home and DIY Reels report from 19 October says check-this-at-home posts are up about 40% this month.",
        src("reels/check-at-home"),
        "Find your stopcock: where it usually is, which way to turn it, and why today and not during a leak.",
      ),
      t(
        "What is that noise",
        "A household sound plays first, like a gurgling radiator or a ticking pipe, then a plain explanation of what it means.",
        "A Reels trends list from 18 October calls sound-first home repair posts a small but rising format.",
        src("reels/sound-first"),
        "Record a gurgling radiator on a job and explain bleeding it, and when the noise means calling a heating engineer.",
      ),
      t(
        "Gauge close-up with one number",
        "A tight shot of a dial or meter with one number in big text and what it should read.",
        "A seasonal search report from 20 October shows boiler pressure searches rising as the weather turns, with gauge close-ups common.",
        src("search/boiler-pressure"),
        "Boiler pressure: the gauge, the range to look for, the one safe thing to do yourself, and when to call.",
      ),
      t(
        "Van to finished job in one shot",
        "A short time-lapse from opening the van door to the finished job, with the area named in text.",
        "Weak signal. A trades roundup from 2 October says time-lapse job clips are steady, not rising, but often saved.",
        src("trades/time-lapse"),
        "A winter boiler check in Bristol, van to done, naming the area but never the house number or a customer's face.",
      ),
    ),
    note: "Practical formats that fit the brand's show the job, teach the fix rule, and every one respects the privacy don'ts." + SOURCE_NOTE,
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
        "A food creator trends roundup from 19 October lists receipt-first openings as rising in UK budget cooking.",
        src("food/receipt-first"),
        "The Sunday shop receipt on screen, then each dinner for a few seconds with its price per portion.",
      ),
      t(
        "Price tags on everything",
        "Every ingredient shown with its price as a sticker, adding up to a running total in the corner.",
        "A budget food newsletter from 21 October says on-screen running totals now appear in many top budget cooking posts.",
        src("newsletter/running-totals"),
        "Chickpea curry with every ingredient priced to the penny and the total per portion at the end.",
      ),
      t(
        "One ingredient, three dinners",
        "The same ingredient used three ways across the week, with a count of how much is left.",
        "A TikTok search trends page from 20 October shows one tin meals up about 30% this month.",
        src("search/one-tin-meals"),
        "One tin of chickpeas across three dinners, with a running count of what is left in the tin.",
      ),
      t(
        "Rate my shop, kindly",
        "Viewers share a shopping list or receipt and the creator picks one thing to stretch further.",
        "A food creator trends roundup from 19 October says reply formats on shopping hauls doubled this month in budget food.",
        src("food/shop-replies"),
        "Invite followers to share their weekly shop and pick one thing to stretch, kindly, never judging anyone's budget.",
      ),
      t(
        "Real-time dinner, one take",
        "A whole dinner cooked in one continuous shot, sped up, with a clock and the price on screen.",
        "Weak signal. A guide updated 8 October calls one-take cooking clips steady rather than rising, but still saved a lot.",
        src("guides/one-take"),
        "This week's lowest-cost dinner start to finish in one take, with the clock and the price per portion on screen.",
      ),
    ),
    note: "Each trend fits the receipts-as-proof idea and the to-the-penny voice; the shop-rating idea is framed so it never shames a budget." + SOURCE_NOTE,
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
        "A roundup of X formats from 18 October lists two-line contrast posts among the most reposted from freelance accounts.",
        src("x-formats/two-line"),
        "'Payment terms: 30 days' against 'Due 14 March', with one line on why a date is harder to ignore.",
      ),
      t(
        "Screenshot with one highlighted line",
        "A product screenshot with a single line highlighted and one sentence explaining it.",
        "A software marketing newsletter from 16 October says single-highlight screenshots are up about 25% this month.",
        src("newsletter/highlight-screenshots"),
        "A Tallybook invoice with only the due date highlighted, and one sentence for freelancers on why it matters.",
      ),
      t(
        "Numbered money maths",
        "A post that walks through one sum in numbered lines, each line a step.",
        "A roundup of X formats from 18 October says numbered money posts have risen for three weeks among UK freelancers.",
        src("x-formats/numbered-money"),
        "The £2,400 invoice that is 30 days late: what to send on day 1, day 7 and day 14, one line each.",
      ),
      t(
        "Poll, then the answer",
        "A two-option poll, followed the next day by a reply with the answer and the reason.",
        "A creator analytics post from 20 October says polls from freelancer accounts draw about three times the replies of plain posts.",
        src("analytics/polls"),
        "Poll: a date or 30 days on your invoices? The next day, reply with why a date is harder to ignore.",
      ),
      t(
        "Myth, corrected in one post",
        "One common belief, stated plainly, then corrected in a sentence or two.",
        "Weak signal. A guide updated 5 October calls myth-correction posts steady, not rising.",
        src("guides/myth-correction"),
        "Your invoice is not late, their payment is: a calm post on what to send on the day it is due.",
      ),
    ),
    note: "Text-first formats that suit X, each turned into one calm, worked example for freelancers, never salesy." + SOURCE_NOTE,
  },
  {
    title: "Generic advice with no evidence",
    label: "bad",
    brain: "Crumb and Co",
    inputs: { niche: "bakery", platform: "reels" },
    ideal: items(
      t("Trending audio", "Use whatever sound is trending right now.", "Everyone is using it.", "trending audio", "Post your products with a trending sound to unlock the power of Reels."),
      t("Behind the scenes content", "Show your audience what happens behind the scenes.", "Behind the scenes is huge right now.", "everyone knows", "Next-level behind the scenes content for your bakery."),
      t("Day in the life", "Film a day in your life.", "Very popular.", "popular right now", "A day in the life of a baker, guaranteed to go viral."),
      t("Tips and tricks", "Share helpful tips with your followers.", "Tips always perform well.", "tips", "Share baking tips and tricks."),
      t("Post consistently", "Post every day to grow.", "The algorithm loves consistency.", "the algorithm", "Post every day and watch your bakery skyrocket."),
    ),
    note: "Themes, not formats; no evidence and no source from the lookup; nothing only this bakery could shoot; stock phrases and a promise of going viral.",
  },
];
