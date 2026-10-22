import { items, type LaunchSample } from "./types";

const tag = (term: string, where: string, why: string) => ({ type: "hashtag", term, where, why });
const kw = (term: string, where: string, why: string) => ({ type: "keyword", term, where, why });

export const HASHTAG_OPTIMIZER_SAMPLES: LaunchSample[] = [
  {
    title: "One tin, three dinners on TikTok",
    label: "gold",
    brain: "Twelve Quid Kitchen",
    inputs: {
      caption: "One tin of chickpeas, three dinners, about 18p of chickpeas each. Curry, sandwich filling, crispy on a salad.",
      platform: "tiktok",
    },
    ideal: items(
      tag("#BudgetMeals", "End of the caption", "The broad category the whole channel sits in."),
      tag("#Chickpeas", "End of the caption", "The one ingredient every dinner in the post uses."),
      tag("#CheapDinners", "End of the caption", "Says what the viewer gets: three dinners for very little."),
      tag("#BatchCooking", "End of the caption", "One tin cooked across the week is batch cooking, a brand topic."),
      kw("chickpea recipes", "First line of the caption", "What someone types when they have a tin of chickpeas and no plan."),
      kw("dinners on a budget", "On-screen text in the first 3 seconds", "Puts the budget angle in the words people search for."),
    ),
    note: "Four hashtags and two search words, as TikTok wants; every term is about chickpeas, cheap dinners or the channel itself.",
  },
  {
    title: "Squat cues for a Manchester gym",
    label: "gold",
    brain: "Northside Strength",
    inputs: {
      caption: "Second session, first proper squat. Coach Sam's three cues: knees out, chest up, slower on the way down. Form first, weight later.",
      platform: "reels",
      location: "Manchester",
    },
    ideal: items(
      tag("#StrengthTraining", "End of the caption", "The broad category, so the post sits with other strength content."),
      tag("#SquatForm", "End of the caption", "The post is a squat form fix, and the cues are the value."),
      tag("#BeginnerWorkout", "End of the caption", "Speaks to the person this post is for: someone new to lifting."),
      tag("#ManchesterGym", "End of the caption", "The local tag, for people near enough to come in."),
      kw("beginner squat form", "First line of the caption", "The exact question this clip answers."),
      kw("beginner gym Manchester", "First line of the caption, beside the cues", "Local search for someone looking for a place to start."),
    ),
    note: "Four hashtags, never more than five on Instagram, one local tag and one local search phrase, all tied to the squat in the clip.",
  },
  {
    title: "Stopcock on Shorts in Bristol",
    label: "gold",
    brain: "Fernhill Plumbing",
    inputs: {
      caption: "Where is your stopcock? Under the kitchen sink, near the front door, or in a hallway cupboard. Clockwise shuts it off.",
      platform: "shorts",
      location: "Bristol",
    },
    ideal: items(
      tag("#Plumbing", "Description, first of the three hashtags", "The broad category, for anyone browsing home repair."),
      tag("#Stopcock", "Description, second hashtag", "The exact thing the video shows."),
      tag("#BristolPlumber", "Description, third hashtag", "The local tag, for people near enough to call."),
      kw("find your stopcock", "Shorts title", "What people type when they need it fast."),
      kw("turn off water supply", "First line of the description", "The task behind the question, in the words people use."),
      kw("plumber Bristol", "Last line of the description", "Local search, for the people the firm can actually visit."),
    ),
    note: "Three hashtags (the ones Shorts shows above the title) and three search words for the title and description, one of each local.",
  },
  {
    title: "Gerald on X, no hashtags",
    label: "gold",
    brain: "Crumb and Co",
    inputs: {
      caption: "Gerald, our sourdough starter, is nine this week. He has never missed a bake.",
      platform: "x",
      location: "Leeds",
    },
    ideal: items(
      kw("sourdough starter", "First line, where it already is", "The words people search, and the whole post is about one."),
      kw("Leeds bakery", "Work into the post, like: our Leeds bakery", "Local search for people who could come in for a loaf."),
      kw("Leeds sourdough", "A reply under the post, with where to buy it", "People nearby search for the bread and the place together."),
      kw("feeding a starter", "A reply showing how Gerald is fed", "Home bakers search how to keep a starter going; Gerald is nine years of it."),
      kw("old sourdough starter", "Say nine years old in the post", "Says the age plainly, the way people search for long-lived starters."),
      kw("bread in Leeds", "Your X bio, not the post", "Keeps the post short while the profile catches local searches."),
    ),
    note: "The brand's don'ts say no hashtags, so all six are search words with a place for each. The brand rule beats the X mix.",
  },
  {
    title: "Hashtag wall for a desk physio",
    label: "bad",
    brain: "Desk Stretch",
    inputs: { caption: "3 moves for a stiff neck at your desk. Which one do you skip?", platform: "reels" },
    ideal: items(
      tag("#fyp", "End of the caption", "Gets you on the For You page."),
      tag("#viral", "End of the caption", "Guaranteed to go viral."),
      tag("#explorepage", "End of the caption", "More reach."),
      tag("#MiracleCure", "End of the caption", "Neck pain gone overnight."),
      tag("#instagood", "End of the caption", "A popular tag."),
      tag("#fitness", "End of the caption", "Unlock your reach."),
    ),
    note: "Spam tags that say nothing about the post, a cure claim, six hashtags where Instagram allows five, a reach promise, and no search words at all.",
  },
];
