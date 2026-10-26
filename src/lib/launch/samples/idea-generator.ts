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
  {
    title: "Salon selling the colour consult",
    label: "gold",
    brain: "Chair Nine",
    inputs: {
      topic: "booking a colour consult before a big change, like going from dark to blonde",
      goal: "sell",
      platform: "tiktok",
      coming_up: "From Monday 2 November there are consult slots on Monday evenings as well as during the day.",
    },
    ideal: items(
      i(
        "A real consult at chair nine, filmed with the client's yes: the strand test, the questions, the honest answer. Ten minutes cut down to thirty seconds.",
        "Step-by-step demo",
        "People planning a big colour change are nervous about what happens first, and seeing the whole consult makes booking one feel easy.",
      ),
      i(
        "Answer the comment: can I go from dark to blonde in one visit? Show what the consult checks first, and why the honest answer is sometimes not in one go.",
        "Answer a question from the comments",
        "It is the exact question people type before they book, and a straight maybe makes them believe you when the answer is yes.",
      ),
      i(
        "Hands sectioning hair, with what the consult asks on screen one line at a time: last colour, any box dye, how often you can come back, how grown out you are happy to go.",
        "Text on screen over footage",
        "Shows people the consult is a short chat about their own hair, not a sales pitch, so the booking feels small.",
      ),
      i(
        "The next time a consult ends in a no to bleach, film the plan you make instead and say how long it will last, with the client's yes.",
        "Voiceover over footage",
        "Same shape as the Priya post, and saying no on camera tells people you care more about their hair than the booking.",
      ),
      i(
        "Ten minutes now or a year of grown-out colour you never wanted: a stylist says it to camera at chair nine, then points to the new Monday evening slots.",
        "Talking to camera",
        "Puts the consult in time people can feel, which is the push someone needs to book instead of putting it off again.",
      ),
      i(
        "The salon after the day's last cut, one chair lit, foils on the trolley. On screen: consults on Monday evenings from 2 November.",
        "Text on screen over footage",
        "People who work all day finally get a slot that fits, and the quiet evening shot makes the news look like your salon, not an advert.",
      ),
      i(
        "Not only colour: film a consult for a low-maintenance cut, showing the client where it will sit once grown out and saying how long it lasts before the next trim.",
        "Voiceover over footage",
        "People who want hair they never have to think about will book once they see the consult is for cuts too, not just big colour changes.",
      ),
    ),
    note: "Sells one booking, the consult, by showing it in use, and uses the real Monday evening slots exactly as given. Never mocks home dye, asks the client's yes before filming, and invents no times or prices.",
  },
  {
    title: "Groomer on nervous dogs",
    label: "gold",
    brain: "Muddy Paws Grooming",
    inputs: { topic: "nervous dogs, especially ones who had a bad groom somewhere before", goal: "trust", platform: "shorts" },
    ideal: items(
      i(
        "What calm handling looks like, close up: one hand on the collar, the clippers shown and switched on before they touch, a pause each time the dog leans away.",
        "Step-by-step demo",
        "Owners of nervous dogs want to see the hands, not the finished cut, and this shows them exactly how theirs would be held.",
      ),
      i(
        "Biscuit the cockapoo at pick-up, filmed from the owner's side of the door: how a nervous dog walks out when nobody rushed him.",
        "Voiceover over footage",
        "Owners judge a groomer by how their dog walks out, and it follows on from the Biscuit and the dryer post that worked so well.",
      ),
      i(
        "Answer the comment: my dog shakes at the groomer, is it worth trying again? Talk through how you start a groom with a dog like that.",
        "Answer a question from the comments",
        "It is what owners of nervous dogs are really asking, and a calm, honest answer is what gets a worried owner to book.",
      ),
      i(
        "A groom in the van with the sound left on: no music, just low voices and the clippers. One line on screen about what a calm groom sounds like.",
        "Text on screen over footage",
        "Owners can hear the calm before they ever book, which says more than anything you could write in a caption.",
      ),
      i(
        "Three signs a dog needs a break mid-groom, said to camera at the table, and what you do when you see each one.",
        "Talking to camera",
        "Shows owners you read their dog as you work, which is the whole reason they would trust you with a nervous one.",
      ),
      i(
        "Why a matted nervous dog gets a short clip: the coat close up, a comb that will not go through, and the kinder choice explained without blaming anyone.",
        "Voiceover over footage",
        "Owners often feel told off about matting, and a kind explanation is what brings them back sooner next time.",
      ),
      i(
        "Between grooms: one gentle brushing routine owners can do on the sofa, in short sessions with breaks, so the next groom has less to work through.",
        "Step-by-step demo",
        "Gives owners something easy to do at home that makes the next visit kinder on their dog, so they save it for later.",
      ),
    ),
    note: "Builds trust by showing the hands, the pace and the breaks, with a real dog by name and breed. No owner is blamed for matting, no dog is shown upset, and nothing is promised about skin.",
  },
  {
    title: "Ceramics seconds sale on X",
    label: "gold",
    brain: "Kiln Street Ceramics",
    inputs: {
      topic: "the seconds sale this Sunday",
      goal: "sell",
      platform: "x",
      coming_up: "Seconds sale on Sunday 1 November, online from 10 a.m. 19 pieces from batch 15, fired on 21 October: mugs, small bowls and two serving plates.",
    },
    ideal: items(
      i(
        "All 19 seconds from batch 15 on one shelf, flaws turned to the camera. One line: fired 21 October, on sale Sunday 1 November at 10 a.m., half price.",
        "Photo with a line",
        "Seconds buyers want the what and the when in one look, and seeing every flaw at once tells them nothing is hidden.",
      ),
      i(
        "A short thread, one piece of batch 15 per post: the flaw close up, named plainly, and why it missed the full-price shelf.",
        "Short thread",
        "People who buy seconds want to know exactly what they are getting, and the thread doubles as the sale list on Sunday.",
      ),
      i(
        "One of the two serving plates, lit so the flaw shows. Line: why it is a second, and why it was still worth keeping.",
        "Photo with a line",
        "Showing the flaw on a big piece is honest selling, and it is the photo people will look at twice before Sunday.",
      ),
      i(
        "Poll: which flaw would you take home at half price? A glaze run, a wobbly base, or neither, I wait for full price.",
        "Poll",
        "A dry little question gets people picturing a second on their own shelf, which is the step before they buy one.",
      ),
      i(
        "What a second is not: different clay, a different kiln, a lesser pot. Same batch as the full-price shelf; only the finish missed. Sunday, 10 a.m., online.",
        "Single post",
        "It answers the doubt that stops first-time buyers, that seconds are worse pots, in a few lines they can read in passing.",
      ),
      i(
        "Kiln day for batch 15, 21 October, told plainly: what came out, what you set aside as seconds, and how you decided.",
        "Short thread",
        "It builds on the post about opening the kiln at 7, and people trust a sale more once they have watched the pots come out.",
      ),
      i(
        "Sunday evening, after the sale: a plain post saying how many of the 19 found homes, and the date of the next seconds sale, the first Sunday in December.",
        "Single post",
        "Honest about what sold, and it gives anyone who missed out a date to plan for instead of a reason to rush.",
      ),
    ),
    note: "Sells one sale with its real batch, count, kiln day and time, shows every flaw, and never counts down or oversells a piece. Says nothing about food or dishwasher safety.",
  },
  {
    title: "Budget cook on cheap protein",
    label: "gold",
    brain: "Twelve Quid Kitchen",
    inputs: { topic: "cheap protein for a week of dinners", goal: "reach", platform: "reels" },
    ideal: items(
      i(
        "The protein from this week's Sunday shop laid out on the counter, each tin, bag and box with its price per portion to the penny on screen. Shop named, and a line that prices change.",
        "Text on screen over footage",
        "Strangers on a budget search for exactly this, and a price on every item makes it worth saving and sending on.",
      ),
      i(
        "A single tin of chickpeas stretched across three different dinners: the tin, its line on the receipt, then each dinner in under ten seconds.",
        "Step-by-step demo",
        "Same shape as your chickpea post, and one cheap tin turned into three dinners is the kind of thing people share with flatmates.",
      ),
      i(
        "Eggs against lentils against tinned fish: price per portion to the penny, side by side on the counter, and you read out the winner.",
        "Talking to camera",
        "A cheap protein face-off with real prices is the kind of video people send to whoever does the shop in their house.",
      ),
      i(
        "The maths out loud: a voiceover over the receipt as you work out what the protein in each dinner cost across the week.",
        "Voiceover over footage",
        "People come to you for the maths, and doing it on screen with the real receipt is the proof they trust and pass on.",
      ),
      i(
        "Answer the comment: what is the cheapest protein that is not beans? Your honest pick from this week's shop, with the receipt in shot.",
        "Answer a question from the comments",
        "Answers something people already ask you, so the next person who searches it finds your answer and the receipt behind it.",
      ),
      i(
        "Batch cook day: the protein for the week's dinners cooked in one go, split into tubs, with the price per tub written on each lid.",
        "Step-by-step demo",
        "Batch cooking is one of your favourite things to film, and a lid with a price on it is a frame people pause on.",
      ),
      i(
        "The lentils that went to mush this week, what you made with them anyway, and what the mistake cost to the penny.",
        "Talking to camera",
        "People share the times it goes wrong, and laughing at your own mush keeps you sounding like a friend, not a cooking show.",
      ),
    ),
    note: "Every idea is something a stranger on a budget would search for or share, with the receipt and the price per portion, and no price or shop is made up. No diet talk and no shaming anyone's budget.",
  },
  {
    title: "Coffee bar on decaf after midnight",
    label: "gold",
    brain: "Night Owl Coffee",
    inputs: {
      topic: "decaf after midnight",
      goal: "talk",
      platform: "x",
      coming_up: "From Friday 6 November we stay open until 3 a.m. on Fridays and Saturdays.",
    },
    ideal: items(
      i(
        "A poll posted just after midnight, all lowercase: after twelve you order decaf, the real thing, or tea, i am not a monster.",
        "Poll",
        "Night owls have firm views on decaf after midnight, and posting just after twelve catches them awake and in the mood to vote.",
      ),
      i(
        "One short lowercase post asking the night shift to settle it: is decaf after midnight sensible or a betrayal of the bean? Ask for their order in the replies.",
        "Single post",
        "A small, friendly argument anyone awake can join in one reply, and the replies tell you what your regulars really drink.",
      ),
      i(
        "From behind the counter: the kinds of people who order decaf after midnight, one line each and no names, ending on which one are you.",
        "Short thread",
        "People reply to find themselves in it, and your regulars will argue about which one they are.",
      ),
      i(
        "Two cups side by side under the lamp, no labels. Line: guess which one is the decaf. Post the answer at 1 a.m.",
        "Photo with a line",
        "A guessing game pulls replies from everyone sure they can tell, and the answer brings them back the same night.",
      ),
      i(
        "The later weekends, said quietly: still open until 3 a.m. on fridays and saturdays from 6 november, then one question: decaf or one more cup at 2?",
        "Single post",
        "The new hours are real news for people awake late, and ending on a question turns a notice into a conversation.",
      ),
      i(
        "Decaf being poured at the counter, steam in the lamp light, and one line asking the night shift what their last cup of the night is.",
        "Photo with a line",
        "A warm, quiet picture is what your followers expect from you, and a question under it makes them answer instead of scrolling past.",
      ),
      i(
        "Decaf after midnight, for and against, as a sleepy back and forth between you and whoever is on the night shift with you. One line each, three posts.",
        "Short thread",
        "Lets people pick a side in an argument that is already friendly, and it is short enough to read at 1 a.m.",
      ),
    ),
    note: "Every idea is a real question or a small, friendly disagreement about the brand's own topic, short and lowercase where it is a post, with the new hours exactly as given. No hashtags, no shouting in capitals, no hustle talk.",
  },
  {
    title: "Gym's over-40 first deadlifts",
    label: "gold",
    brain: "Northside Strength",
    inputs: {
      topic: "members over 40 learning their first deadlift",
      goal: "trust",
      platform: "shorts",
      coming_up: "A beginners' class for over-40s starts on Saturday 7 November at 9 a.m., coached by Dan.",
    },
    ideal: items(
      i(
        "Dan fixing one member's first deadlift, filmed with their yes: the brace, the hinge, the one cue that changed it. Just the bar, the cue and the lift.",
        "Step-by-step demo",
        "People over 40 worry they will be left to get it wrong, and watching a coach slow someone down is what makes them trust you.",
      ),
      i(
        "A first deadlift lesson on an empty bar, in real time, so someone over 40 can see exactly what the first session asks of them.",
        "Voiceover over footage",
        "Same shape as the first-session post that took the fear out of starting, aimed at the people the Saturday class is for.",
      ),
      i(
        "Answer the comment you hear most from over-40s: am I too old to start lifting? Dan answers plainly to camera and mentions the Saturday class at 9.",
        "Answer a question from the comments",
        "It is the doubt that keeps people from ever walking in, and hearing it from the coach who will be there makes coming easier.",
      ),
      i(
        "A member over 40 on their first ever lift here, filmed only with their yes, with the real weight on screen, whatever it is.",
        "Text on screen over footage",
        "Real first lifts by people their own age tell over-40s more than any promise could, and a small honest number is the point.",
      ),
      i(
        "The roller door going up on the empty gym in the morning light, with who the Saturday class is for, when it starts and who coaches it on screen.",
        "Text on screen over footage",
        "Tells people who never thought a gym was for them where to be and who will meet them, which takes away half the nerves.",
      ),
      i(
        "Form first, weight later: Dan to camera on why a beginner over 40 starts light, and what has to look right before any plates go on.",
        "Talking to camera",
        "Answers the fear of getting hurt, and hearing that nobody will rush them is what people over 40 need before they come in.",
      ),
      i(
        "Answer the comment: can I deadlift with a dodgy knee? A plain answer: tell the coach first, and check with a physio or GP if you are not sure.",
        "Answer a question from the comments",
        "Honest answers about sore joints show you take their body seriously, which is the trust people over 40 look for in a gym.",
      ),
    ),
    note: "Trust through the coach's hands and real first lifts, with the class facts exactly as given. No weight-loss promise, no body talk, members filmed only with their yes, and a plain pointer to a physio or GP.",
  },
];
