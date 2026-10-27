/**
 * One real result per live launch agent, for the public agent pages
 * (/agents/[id]). Each comes from WOVI's test runs on a made-up sample
 * business: its inputs, the typed output the engine parsed, the same output
 * as the readable text the bench shows, and the quality score it got. Trend
 * Scout's also carries the pages its live web search found.
 *
 * Static data: nothing on the public pages ever runs an agent. A test parses
 * every output with the engine's own parser against its agent's current
 * output shape, so a spec change that breaks an example fails the build.
 */
import type { RunOutput } from "@/lib/runs/output";

export type ShowcaseSource = { url: string; title: string; published: string | null };

export type ShowcaseExample = {
  /** A short name for the run. */
  title: string;
  /** The made-up sample business it ran for. */
  business: string;
  /** The form as it was filled in, by input key. */
  inputs: Record<string, string | string[]>;
  output: RunOutput;
  /** The output as readable text (formatOutput). */
  text: string;
  /** The combined quality score, 0 to 100. */
  quality: number;
  /** The pages a web search found, for agents with a lookup tool. */
  sources: ShowcaseSource[] | null;
};

export const SHOWCASE: Record<string, ShowcaseExample> = {
  "trend-scout": {
    "title": "Local plumber on Reels",
    "business": "Fernhill Plumbing",
    "inputs": {
      "niche": "plumbing and heating firm",
      "platform": "reels"
    },
    "output": {
      "kind": "list",
      "items": [
        {
          "trend": "Zoom in: the tiny reveal",
          "what_it_looks_like": "A wide shot of an ordinary spot, then a slow zoom that lands on one small detail hiding in plain sight.",
          "evidence": "A trends guide published 26 October 2026 lists the tiny reveal for the week of 26 October to 1 November, as a format that hides a small surprise in plain sight.",
          "source": "https://mysocialboutique.co/instagram-trends-2026/",
          "how_you_could_use_it": "Start wide on a bath panel in a Bristol bathroom, then zoom slowly onto a soft, dark joist below a slow drip. One line: here is what we found, and how to check yours with a torch and the panel off."
        },
        {
          "trend": "Process, not just the finished job",
          "what_it_looks_like": "The plumbing work shown step by step as it happens, tools and dust sheets included, before the tidy result.",
          "evidence": "Later's weekly Reels trends guide describes process reveals and behind-the-scenes work as a portfolio format that helps audiences connect. No date is given for this entry, so treat the signal as older.",
          "source": "https://later.com/blog/instagram-reels-trends/",
          "how_you_could_use_it": "Top up boiler pressure on a real Bristol job, one step per clip: filling loop, gauge, valve closed. End in plain terms on when this is a safe job to do yourself and when it is worth calling a pro."
        },
        {
          "trend": "The Eye Test meme",
          "what_it_looks_like": "An eye-test style prompt where the viewer has to spot the one detail that matters. Quick to make, and it points customers to what they need.",
          "evidence": "Your Social Team included the Eye Test meme in its 19 October 2026 roundup of Instagram trends, as a quick format businesses can adapt.",
          "source": "https://www.instagram.com/p/DerRZIdEYMc",
          "how_you_could_use_it": "Show a boiler pressure gauge with the caption: can you read this one. Then say in plain terms where the needle should sit, and when a low reading means a call to a pro."
        },
        {
          "trend": "\"But I'm also...\" Reel",
          "what_it_looks_like": "The business introduces itself, then shows the other sides of the work and the family behind it, one clip per side.",
          "evidence": "Your Social Team featured the \"But I'm Also...\" Reel in its 19 October 2026 trends roundup, as a way to show more of a business and its people.",
          "source": "https://www.instagram.com/p/DerRZIdEYMc",
          "how_you_could_use_it": "We are a family firm fixing leaks in Bristol. But we also sort boiler pressure, show people where their stopcock is and get homes ready for winter. Hands and tools only, with no customer faces or house numbers."
        },
        {
          "trend": "Cosy October montage",
          "what_it_looks_like": "Slow, warm autumn clips set to a gentle seasonal instrumental: radiators, steam from a kettle, low evening light.",
          "evidence": "SocialPilot's audio roundup, covering 12 to 25 October, says October-themed tracks and instrumentals are being used for cosy fall montages, with instrumentals flagged as options for business accounts. No publish date is given.",
          "source": "https://www.socialpilot.co/blog/instagram-reels-trends",
          "how_you_could_use_it": "Pick a calm autumn instrumental from the Meta Sound Collection and show a winter-ready check in a Bristol home: radiators warm at the top, boiler pressure on the gauge, stopcock found. One check per clip, worth a look this week."
        }
      ]
    },
    "text": "Trend: Zoom in: the tiny reveal\nWhat it looks like: A wide shot of an ordinary spot, then a slow zoom that lands on one small detail hiding in plain sight.\nEvidence: A trends guide published 26 October 2026 lists the tiny reveal for the week of 26 October to 1 November, as a format that hides a small surprise in plain sight.\nSource: https://mysocialboutique.co/instagram-trends-2026/\nHow you could use it: Start wide on a bath panel in a Bristol bathroom, then zoom slowly onto a soft, dark joist below a slow drip. One line: here is what we found, and how to check yours with a torch and the panel off.\n\nTrend: Process, not just the finished job\nWhat it looks like: The plumbing work shown step by step as it happens, tools and dust sheets included, before the tidy result.\nEvidence: Later's weekly Reels trends guide describes process reveals and behind-the-scenes work as a portfolio format that helps audiences connect. No date is given for this entry, so treat the signal as older.\nSource: https://later.com/blog/instagram-reels-trends/\nHow you could use it: Top up boiler pressure on a real Bristol job, one step per clip: filling loop, gauge, valve closed. End in plain terms on when this is a safe job to do yourself and when it is worth calling a pro.\n\nTrend: The Eye Test meme\nWhat it looks like: An eye-test style prompt where the viewer has to spot the one detail that matters. Quick to make, and it points customers to what they need.\nEvidence: Your Social Team included the Eye Test meme in its 19 October 2026 roundup of Instagram trends, as a quick format businesses can adapt.\nSource: https://www.instagram.com/p/DerRZIdEYMc\nHow you could use it: Show a boiler pressure gauge with the caption: can you read this one. Then say in plain terms where the needle should sit, and when a low reading means a call to a pro.\n\nTrend: \"But I'm also...\" Reel\nWhat it looks like: The business introduces itself, then shows the other sides of the work and the family behind it, one clip per side.\nEvidence: Your Social Team featured the \"But I'm Also...\" Reel in its 19 October 2026 trends roundup, as a way to show more of a business and its people.\nSource: https://www.instagram.com/p/DerRZIdEYMc\nHow you could use it: We are a family firm fixing leaks in Bristol. But we also sort boiler pressure, show people where their stopcock is and get homes ready for winter. Hands and tools only, with no customer faces or house numbers.\n\nTrend: Cosy October montage\nWhat it looks like: Slow, warm autumn clips set to a gentle seasonal instrumental: radiators, steam from a kettle, low evening light.\nEvidence: SocialPilot's audio roundup, covering 12 to 25 October, says October-themed tracks and instrumentals are being used for cosy fall montages, with instrumentals flagged as options for business accounts. No publish date is given.\nSource: https://www.socialpilot.co/blog/instagram-reels-trends\nHow you could use it: Pick a calm autumn instrumental from the Meta Sound Collection and show a winter-ready check in a Bristol home: radiators warm at the top, boiler pressure on the gauge, stopcock found. One check per clip, worth a look this week.",
    "quality": 95,
    "sources": [
      {
        "url": "https://mysocialboutique.co/instagram-trends-2026/",
        "title": "Instagram Trends for September 2026: Trending Reels, Posts & Carousels",
        "published": "2026-10-26"
      },
      {
        "url": "https://later.com/blog/instagram-reels-trends/",
        "title": "Top Instagram Reels Trends to Try in 2026 (Updated Weekly)",
        "published": "2026-10-23"
      },
      {
        "url": "https://kabo.sh/tools/trending-instagram-audio",
        "title": "Trending Instagram Reels Audio Today, Updated Daily · Kabo",
        "published": "2026-10-24"
      },
      {
        "url": "https://www.socialpilot.co/blog/instagram-reels-trends",
        "title": "Instagram Reels Trends: Trending Audio This Week (2026)",
        "published": null
      },
      {
        "url": "https://www.instagram.com/p/DerRZIdEYMc",
        "title": "Instagram",
        "published": "2026-10-19"
      },
      {
        "url": "https://verlynk.com/blog/instagram-reels-trends-october-2026-10-trends-creators-should-try-right-now",
        "title": "Instagram Reels Trends October 2026: 10 Trends Creators Should Try Right Now | Verlynk",
        "published": null
      }
    ]
  },
  "idea-generator": {
    "title": "Groomer's puppy intro sessions",
    "business": "Muddy Paws Grooming",
    "inputs": {
      "topic": "puppy intro sessions, so a puppy's first groom is short and calm",
      "goal": "sell",
      "platform": "reels",
      "coming_up": "Puppy intro sessions start on Saturday 21 November. Each one is 30 minutes: feet, face, a bath and a towel dry, no full cut."
    },
    "output": {
      "kind": "list",
      "items": [
        {
          "idea": "A puppy intro session in 30 seconds, filmed with the owner's yes: feet, face, a bath, a towel dry, one line on screen per step, the puppy's name and breed in the first frame.",
          "format": "Step-by-step demo",
          "why_it_fits": "Owners book what they can picture, and seeing the whole 30 minutes shown calmly makes a first groom feel small and safe."
        },
        {
          "idea": "To camera: 30 minutes sounds short. Here is why it is meant to be. Feet, face, bath, towel dry, and no full cut, so the first groom ends before the puppy is tired.",
          "format": "Talking to camera",
          "why_it_fits": "It is the same shape as your two-hours post, turned round: explaining where the time goes, and why less of it is kinder for a puppy."
        },
        {
          "idea": "Towel dry only, no dryer: a puppy wrapped and patted dry, with your voice explaining that a first visit is about leaving calm, not leaving finished.",
          "format": "Voiceover over footage",
          "why_it_fits": "It builds on the Biscuit dryer post your followers liked, comfort before speed, now for a dog meeting the groom for the first time."
        },
        {
          "idea": "Answer the comment: why no full cut on a first visit? Say plainly what the session covers and what it leaves for later, then that intro sessions start Saturday 21 November.",
          "format": "Answer a question from the comments",
          "why_it_fits": "It is the fair question before someone books, and a straight answer about what they get sounds like you at pick-up, not a sales pitch."
        },
        {
          "idea": "Feet first, close up: holding a puppy's paw gently, a pause, then the next paw. One line on screen: the bit nervous dogs find hardest later, started early.",
          "format": "Text on screen over footage",
          "why_it_fits": "Nervous dogs are your main topic, and owners will see how an easy start with the feet now could help later grooms go more gently."
        },
        {
          "idea": "Between the intro session and the first full groom: the one brush to use at home and how to hold a puppy's foot for a few seconds a day.",
          "format": "Step-by-step demo",
          "why_it_fits": "It is the same shape as your one-comb doodle post, a plain lesson and one tool, and it covers coat care between grooms for brand-new owners."
        },
        {
          "idea": "Text over a calm puppy at pick-up: what a 30-minute intro session is, one line each, ending on: puppy intro sessions start Saturday 21 November.",
          "format": "Text on screen over footage",
          "why_it_fits": "Ending at pick-up is where owners see the result that matters, a calm dog, and the date gives them one clear thing to book."
        }
      ]
    },
    "text": "Idea: A puppy intro session in 30 seconds, filmed with the owner's yes: feet, face, a bath, a towel dry, one line on screen per step, the puppy's name and breed in the first frame.\nFormat: Step-by-step demo\nWhy it fits: Owners book what they can picture, and seeing the whole 30 minutes shown calmly makes a first groom feel small and safe.\n\nIdea: To camera: 30 minutes sounds short. Here is why it is meant to be. Feet, face, bath, towel dry, and no full cut, so the first groom ends before the puppy is tired.\nFormat: Talking to camera\nWhy it fits: It is the same shape as your two-hours post, turned round: explaining where the time goes, and why less of it is kinder for a puppy.\n\nIdea: Towel dry only, no dryer: a puppy wrapped and patted dry, with your voice explaining that a first visit is about leaving calm, not leaving finished.\nFormat: Voiceover over footage\nWhy it fits: It builds on the Biscuit dryer post your followers liked, comfort before speed, now for a dog meeting the groom for the first time.\n\nIdea: Answer the comment: why no full cut on a first visit? Say plainly what the session covers and what it leaves for later, then that intro sessions start Saturday 21 November.\nFormat: Answer a question from the comments\nWhy it fits: It is the fair question before someone books, and a straight answer about what they get sounds like you at pick-up, not a sales pitch.\n\nIdea: Feet first, close up: holding a puppy's paw gently, a pause, then the next paw. One line on screen: the bit nervous dogs find hardest later, started early.\nFormat: Text on screen over footage\nWhy it fits: Nervous dogs are your main topic, and owners will see how an easy start with the feet now could help later grooms go more gently.\n\nIdea: Between the intro session and the first full groom: the one brush to use at home and how to hold a puppy's foot for a few seconds a day.\nFormat: Step-by-step demo\nWhy it fits: It is the same shape as your one-comb doodle post, a plain lesson and one tool, and it covers coat care between grooms for brand-new owners.\n\nIdea: Text over a calm puppy at pick-up: what a 30-minute intro session is, one line each, ending on: puppy intro sessions start Saturday 21 November.\nFormat: Text on screen over footage\nWhy it fits: Ending at pick-up is where owners see the result that matters, a calm dog, and the date gives them one clear thing to book.",
    "quality": 95,
    "sources": null
  },
  "hook-writer": {
    "title": "Gerald and the cold snap",
    "business": "Crumb and Co",
    "inputs": {
      "idea": "Cold snap this week and the bakery was cold. Gerald, our sourdough starter, took 14 hours to rise instead of the usual 8. We moved his jar next to the oven overnight and Saturday's bake was back on time.",
      "platform": "x",
      "who_for": "people who keep a sourdough starter at home"
    },
    "output": {
      "kind": "list",
      "items": [
        "Gerald took 14 hours to rise. He usually needs 8.",
        "We let the bakery go cold. Gerald noticed.",
        "Gerald slept next to the oven last night.",
        "Saturday's bake was on time. Gerald had help.",
        "A cold snap slowed our sourdough starter by six hours.",
        "Our mistake: we left Gerald in a cold bakery.",
        "Cold kitchen? Move your starter next to the oven.",
        "Your starter is not dead. It is probably just cold.",
        "Cold snap, 5 a.m. shift, one sulking starter.",
        "Is your starter slow this week? Gerald was too."
      ]
    },
    "text": "Gerald took 14 hours to rise. He usually needs 8.\nWe let the bakery go cold. Gerald noticed.\nGerald slept next to the oven last night.\nSaturday's bake was on time. Gerald had help.\nA cold snap slowed our sourdough starter by six hours.\nOur mistake: we left Gerald in a cold bakery.\nCold kitchen? Move your starter next to the oven.\nYour starter is not dead. It is probably just cold.\nCold snap, 5 a.m. shift, one sulking starter.\nIs your starter slow this week? Gerald was too.",
    "quality": 96,
    "sources": null
  },
  "script-writer": {
    "title": "Dal at 46p a portion",
    "business": "Twelve Quid Kitchen",
    "inputs": {
      "idea": "Red lentil dal, four portions: red lentils 89p, a tin of tomatoes 45p, an onion 12p, garlic 18p, spices from the cupboard about 20p. £1.84 in total, so 46p a portion. Bought at the big Tesco on Sunday, and prices change. Method: onion and garlic in the pan, then the lentils, tomatoes, spices and enough water to cover, and stir till the lentils go soft.",
      "length": "s30",
      "format": "voiceover",
      "footage": "the receipt, the hob, the pan, my kitchen counter, the four tubs",
      "mood": "energetic"
    },
    "output": {
      "kind": "script",
      "sections": [
        {
          "section": "hook",
          "spoken": "Four dinners. 46p each. Here's the receipt.",
          "on_screen": "The receipt flat on the kitchen counter, phone-camera close. Text: \"46p a portion\"",
          "seconds": 3
        },
        {
          "section": "setup",
          "spoken": "The Sunday shop, big Tesco. Red lentils, 89p. Tin of tomatoes, 45p. Onion, 12p. Garlic, 18p. Spices from the cupboard, about 20p. Prices change, so check yours.",
          "on_screen": "Slow pan down the receipt on the counter, finger tapping each line. Text: \"Tesco, Sunday. Prices change\"",
          "seconds": 9
        },
        {
          "section": "turn",
          "spoken": "Onion and garlic in the pan. Then the lentils, the tomatoes, the spices, and just enough water to cover. Now stir. Keep stirring. Ignore the mess on my hob, I am. Stir till the lentils go soft and that's it, that's dal.",
          "on_screen": "The pan on the hob, onion and garlic going in, then lentils, tomatoes and water. Steam rising, quick cuts of the spoon stirring. Text: \"Stir till soft\"",
          "seconds": 12
        },
        {
          "section": "ending",
          "spoken": "£1.84 in total. Four tubs. 46p a portion, to the penny. I love the maths.",
          "on_screen": "The four tubs lined up on the counter, steam on the lids, receipt beside them. Text: \"£1.84 = 4 dinners\"",
          "seconds": 6
        }
      ]
    },
    "text": "Hook (3 s)\nSay: Four dinners. 46p each. Here's the receipt.\nOn screen: The receipt flat on the kitchen counter, phone-camera close. Text: \"46p a portion\"\n\nSetup (9 s)\nSay: The Sunday shop, big Tesco. Red lentils, 89p. Tin of tomatoes, 45p. Onion, 12p. Garlic, 18p. Spices from the cupboard, about 20p. Prices change, so check yours.\nOn screen: Slow pan down the receipt on the counter, finger tapping each line. Text: \"Tesco, Sunday. Prices change\"\n\nTurn (12 s)\nSay: Onion and garlic in the pan. Then the lentils, the tomatoes, the spices, and just enough water to cover. Now stir. Keep stirring. Ignore the mess on my hob, I am. Stir till the lentils go soft and that's it, that's dal.\nOn screen: The pan on the hob, onion and garlic going in, then lentils, tomatoes and water. Steam rising, quick cuts of the spoon stirring. Text: \"Stir till soft\"\n\nEnding (6 s)\nSay: £1.84 in total. Four tubs. 46p a portion, to the penny. I love the maths.\nOn screen: The four tubs lined up on the counter, steam on the lids, receipt beside them. Text: \"£1.84 = 4 dinners\"",
    "quality": 97,
    "sources": null
  },
  "caption-writer": {
    "title": "Iron red glaze test tiles",
    "business": "Kiln Street Ceramics",
    "inputs": {
      "post": "Glaze test tiles out of the kiln this morning: the same iron red glaze on six tiles at three thicknesses. Thin goes almost black at the edges, thick pools and runs. Each tile numbered in pencil on the back.",
      "platforms": [
        "shorts"
      ],
      "length": "medium",
      "action": "nothing"
    },
    "output": {
      "kind": "caption_set",
      "captions": [
        {
          "platform": "shorts",
          "variants": [
            "Iron red glaze test: the same glaze at three thicknesses\nSix tiles out of the kiln this morning. Thin goes almost black at the edges. Thick pools and runs. Each one is numbered in pencil on the back, so we know which is which.",
            "Glaze test tiles: what one iron red does at three thicknesses\nSame glaze, same kiln, six tiles. The thick ones pool and run. The thin ones darken toward black at the edges. The numbers are in pencil on the back. That is how we choose."
          ]
        }
      ]
    },
    "text": "YouTube Shorts\n1. Iron red glaze test: the same glaze at three thicknesses\nSix tiles out of the kiln this morning. Thin goes almost black at the edges. Thick pools and runs. Each one is numbered in pencil on the back, so we know which is which.\n2. Glaze test tiles: what one iron red does at three thicknesses\nSame glaze, same kiln, six tiles. The thick ones pool and run. The thin ones darken toward black at the edges. The numbers are in pencil on the back. That is how we choose.",
    "quality": 96,
    "sources": null
  },
  "hashtag-picker": {
    "title": "Due date wording on Shorts",
    "business": "Tallybook",
    "inputs": {
      "caption": "Swap 'Payment terms: 30 days' for 'Due 14 March'. A date is harder to ignore than a rule. One line on your invoice, and here is where it goes.",
      "platform": "shorts"
    },
    "output": {
      "kind": "list",
      "items": [
        {
          "type": "hashtag",
          "term": "#Invoicing",
          "where": "Description, first of the three hashtags",
          "why": "Freelancers follow this broad tag for practical invoice guidance."
        },
        {
          "type": "hashtag",
          "term": "#InvoicePaymentTerms",
          "where": "Description, second hashtag",
          "why": "Freelancers looking to clarify when an invoice should be paid."
        },
        {
          "type": "hashtag",
          "term": "#LatePayments",
          "where": "Description, third hashtag",
          "why": "Freelancers looking for ways to make payment deadlines clearer."
        },
        {
          "type": "keyword",
          "term": "what to write on an invoice",
          "where": "Shorts title",
          "why": "Freelancers searching for clear wording to put on their invoices."
        },
        {
          "type": "keyword",
          "term": "invoice due date wording",
          "where": "First line of the description",
          "why": "Freelancers looking for a simple way to state when payment is due."
        },
        {
          "type": "keyword",
          "term": "payment terms on invoice",
          "where": "Second line of the description",
          "why": "Freelancers searching how to show payment terms on an invoice."
        }
      ]
    },
    "text": "Type: hashtag\nTerm: #Invoicing\nWhere: Description, first of the three hashtags\nWhy: Freelancers follow this broad tag for practical invoice guidance.\n\nType: hashtag\nTerm: #InvoicePaymentTerms\nWhere: Description, second hashtag\nWhy: Freelancers looking to clarify when an invoice should be paid.\n\nType: hashtag\nTerm: #LatePayments\nWhere: Description, third hashtag\nWhy: Freelancers looking for ways to make payment deadlines clearer.\n\nType: keyword\nTerm: what to write on an invoice\nWhere: Shorts title\nWhy: Freelancers searching for clear wording to put on their invoices.\n\nType: keyword\nTerm: invoice due date wording\nWhere: First line of the description\nWhy: Freelancers looking for a simple way to state when payment is due.\n\nType: keyword\nTerm: payment terms on invoice\nWhere: Second line of the description\nWhy: Freelancers searching how to show payment terms on an invoice.",
    "quality": 94,
    "sources": null
  },
  "repurposer": {
    "title": "Forty croissants, from X to video",
    "business": "Crumb and Co",
    "inputs": {
      "post": "We burned 40 croissants so you would not have to. Lamination is butter folded into dough, again and again, cold. Too warm and the butter melts in. Croissant 41 had layers you could count.",
      "posted_on": "x",
      "to": [
        "reels",
        "tiktok"
      ],
      "keep": "Croissant 41"
    },
    "output": {
      "kind": "caption_set",
      "captions": [
        {
          "platform": "reels",
          "variants": [
            "Hook: Croissant 41. You can count the layers.\nScript: This is what 40 burned croissants bought us. Lamination is butter folded into dough, again and again, cold. Too warm and the butter melts in. Then you get bread that thinks it is a croissant. Forty of those. Then Croissant 41. Have a count. We did. Twice.\nOn screen: Open on Croissant 41 torn in half, close on the layers. Text: \"Croissant 41\". Cut to hands folding cold butter into dough on a floured bench. Text: \"again and again, cold\". Cut to a tray of burned croissants. Text: \"1 to 40\". End back on the layers of 41.\nCaption: Croissant 41 had layers you could count. The 40 before it did not.\nLamination is butter folded into dough, again and again, cold. Too warm and the butter melts in. We learned that 40 times."
          ]
        },
        {
          "platform": "tiktok",
          "variants": [
            "Hook: We burned 40 croissants. This is croissant 41.\nScript: Lamination is butter folded into dough. Again and again. Cold. Too warm and the butter melts in, and the layers go with it. We found that out 40 times. Croissant 41 had layers you could count. Forty failures for one croissant. Fair trade, we reckon.\nOn screen: Overhead of hands folding a cold slab of butter into dough. Text: \"butter into dough, cold\". Fold, turn, fold again. Cut to a tray of burned croissants. Text: \"40\". Slow reveal of Croissant 41 being pulled apart. Text: \"Croissant 41\". Hold on the layers.\nCaption: 40 burned croissants, one lesson. Keep the butter cold or it melts into the dough. Croissant 41 had layers you could count."
          ]
        }
      ]
    },
    "text": "Instagram Reels\nHook: Croissant 41. You can count the layers.\nScript: This is what 40 burned croissants bought us. Lamination is butter folded into dough, again and again, cold. Too warm and the butter melts in. Then you get bread that thinks it is a croissant. Forty of those. Then Croissant 41. Have a count. We did. Twice.\nOn screen: Open on Croissant 41 torn in half, close on the layers. Text: \"Croissant 41\". Cut to hands folding cold butter into dough on a floured bench. Text: \"again and again, cold\". Cut to a tray of burned croissants. Text: \"1 to 40\". End back on the layers of 41.\nCaption: Croissant 41 had layers you could count. The 40 before it did not.\nLamination is butter folded into dough, again and again, cold. Too warm and the butter melts in. We learned that 40 times.\n\nTikTok\nHook: We burned 40 croissants. This is croissant 41.\nScript: Lamination is butter folded into dough. Again and again. Cold. Too warm and the butter melts in, and the layers go with it. We found that out 40 times. Croissant 41 had layers you could count. Forty failures for one croissant. Fair trade, we reckon.\nOn screen: Overhead of hands folding a cold slab of butter into dough. Text: \"butter into dough, cold\". Fold, turn, fold again. Cut to a tray of burned croissants. Text: \"40\". Slow reveal of Croissant 41 being pulled apart. Text: \"Croissant 41\". Hold on the layers.\nCaption: 40 burned croissants, one lesson. Keep the butter cold or it melts into the dough. Croissant 41 had layers you could count.",
    "quality": 96,
    "sources": null
  }
};
