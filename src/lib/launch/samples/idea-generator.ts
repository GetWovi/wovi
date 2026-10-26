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
        "A real consult at chair nine: the strand test, the questions, the honest answer. Ten minutes cut down to thirty seconds.",
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
        "The next time a consult ends in a no to bleach, film the plan you make instead and say how long it will last.",
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
        "Dan fixing one member's first deadlift: the brace, the hinge, the one cue that changed it. Just the bar, the cue and the lift.",
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
        "A member over 40 on their first ever lift here, with the real weight on screen, whatever it is.",
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
  {
    title: "Bakery Christmas orders on X",
    label: "gold",
    brain: "Crumb and Co",
    inputs: {
      topic: "mince pie boxes for Christmas",
      goal: "sell",
      platform: "x",
      coming_up: "Christmas orders open on Monday 30 November and close on Saturday 19 December. Mince pies come in boxes of six. Collection from the shop on Wednesday 23 and Thursday 24 December.",
    },
    ideal: items(
      i(
        "The first tray of mince pies on the 5 a.m. shift, flour still on the bench. Line: Christmas orders open Monday 30 November, boxes of six, collect on the 23rd or 24th.",
        "Photo with a line",
        "People who want their mince pies sorted early need the dates and the box size in one look, and the early tray makes it yours, not a supermarket's.",
      ),
      i(
        "A short thread on how a mince pie gets made here: pastry rubbed in by hand, filling spooned in, lids crimped, the tray going in. Last post: how to order a box of six.",
        "Short thread",
        "Your followers like seeing the hands and the process, and by the last post they know exactly what they are ordering.",
      ),
      i(
        "Poll: lid on, star on top, or no lid at all? The winner goes on this year's boxes, and you post the result with a photo of the tray.",
        "Poll",
        "A small, friendly argument about lids gets people thinking about mince pies before orders open, and the result gives you a second post.",
      ),
      i(
        "The order dates, written dry: orders open 30 November, close 19 December, and Gerald has been told the mince pies are not for him.",
        "Single post",
        "Buyers need the dates, and a dry line about Gerald at the end makes the notice sound like you, not a sign on the door.",
      ),
      i(
        "If a trial tray goes wrong, post it: a lid that slid, filling that bubbled over, and one line on what you changed before orders open.",
        "Photo with a line",
        "Owning the mistake is what made the 40 burned croissants your best post, and it makes the boxes people order easier to believe.",
      ),
      i(
        "One calm post the day before orders close on Saturday 19 December: the last day to order a box of six, with the collection days after it. No countdown.",
        "Single post",
        "People who meant to order and forgot need one plain reminder, and the dates as you gave them are all it takes.",
      ),
      i(
        "A short thread for people who have never had a mince pie from you: the real ingredients in the filling, how the pastry is made, how to warm one at home. Ends on the order dates.",
        "Short thread",
        "Naming what goes in gives new buyers a reason to pick your box over a supermarket one, and the thread doubles as the order page.",
      ),
    ),
    note: "Sells one thing, the box of six, with the order and collection dates exactly as given. Shows the hands and the real ingredients, ends on dry jokes, and has no hashtags, no exclamation marks and no discount up front.",
  },
  {
    title: "Bakery on sourdough holes",
    label: "gold",
    brain: "Crumb and Co",
    inputs: { topic: "sourdough holes", goal: "talk", platform: "tiktok" },
    ideal: items(
      i(
        "Cut a sourdough loaf on camera and ask: big holes or tight crumb, which do you want in your toast? Pin the best answer.",
        "Talking to camera",
        "People have firm views on the holes in their bread, and sourdough is what you bake every morning, so regulars and strangers both reply.",
      ),
      i(
        "Gerald, nine years old, close up in his jar on the 5 a.m. shift: where the holes start. One line of text per bubble.",
        "Text on screen over footage",
        "Gerald is the character your followers already know, and starting the holes story with him gets them commenting for him.",
      ),
      i(
        "Answer the comment: why does my sourdough have one big hole under the crust? Show one of your own loaves with the same hole, if you have one, and say what caused it.",
        "Answer a question from the comments",
        "Home bakers really ask this, and showing your own wonky loaf is the honest mess your followers come to you for.",
      ),
      i(
        "Two loaves side by side, one proved longer than the other, cut at the same moment. Ask which one people would take home.",
        "Voiceover over footage",
        "A side by side is easy to argue about, and the answer quietly teaches how much time has to do with the holes.",
      ),
      i(
        "The flattest sourdough of the week, cut open, and the dry line: holes, none. Ask people to guess what went wrong.",
        "Talking to camera",
        "Mistakes in the kitchen are one of your best topics, and a guessing game turns a bad loaf into a busy comment section.",
      ),
      i(
        "Shaping in real time at the bench, hands only: the fold that keeps the holes in, with each step as a line on screen.",
        "Step-by-step demo",
        "Your hands and the process are what people stay for, and home bakers will ask follow-up questions under it.",
      ),
      i(
        "A slice of this morning's sourdough, toasted, butter melting into the holes. One line: open crumb or tight crumb for this?",
        "Text on screen over footage",
        "A slow, warm shot with one small question is easy to answer while people are hungry, and it ends on a dry little choice.",
      ),
    ),
    note: "A two-word brief turned into seven ways to get people talking about holes, with Gerald, the 5 a.m. shift and a real mistake, no hashtags and no exclamation marks.",
  },
  {
    title: "Desk physio on laptop neck",
    label: "gold",
    brain: "Desk Stretch",
    inputs: { topic: "neck ache from looking down at a laptop all day", goal: "reach", platform: "shorts" },
    ideal: items(
      i(
        "2 moves for laptop neck, one per line on screen: chin tuck, then shoulder blades back. Ask which one they felt more.",
        "Text on screen over footage",
        "Neck and shoulders is one of your topics, and a short numbered move is what people search for after a long day at a laptop.",
      ),
      i(
        "Film from the side as a laptop goes from flat on the desk to raised on a stack of books, and the neck changes with it.",
        "Voiceover over footage",
        "A side view shows the problem in one second, so strangers get it straight away and send it on.",
      ),
      i(
        "One minute at your desk: a neck stretch in real time, with a timer on screen and no standing up.",
        "Step-by-step demo",
        "It builds on your one-minute posts, and people who sit all day can do it with you while they watch.",
      ),
      i(
        "Answer the comment: is laptop neck permanent? A calm, honest answer, and when to get it checked by a physio in person.",
        "Answer a question from the comments",
        "It is the worried question people type late at night, and an honest answer with no promises is the kind they share.",
      ),
      i(
        "3 places people put a laptop at home: the kitchen table, the sofa, the bed. Rate each one for your neck, one per line.",
        "Talking to camera",
        "Viewers recognise their own sofa or bed at once, which makes it the video they send to a friend who works from home.",
      ),
      i(
        "Laptop neck is not age. It is habit. Say it to camera, then show the one tiny habit to swap in each hour.",
        "Talking to camera",
        "It borrows the rhythm of the line your followers know you for, so it sounds like Desk Stretch from the first second.",
      ),
      i(
        "A day at a laptop in five shots, the head dropping a little lower in each, then one move to reset. Ask how low theirs goes by four o'clock.",
        "Text on screen over footage",
        "Tiny habits are your topic, and watching the slow slump through a day makes strangers check their own posture and comment.",
      ),
    ),
    note: "Reach through moves people search for and share, each opening with a number or one move per line and ending on a question. No emoji, no promise to fix anything, and a plain pointer to a physio.",
  },
  {
    title: "Desk physio selling video desk checks",
    label: "gold",
    brain: "Desk Stretch",
    inputs: {
      topic: "the new 20-minute video desk check, where I look at your desk setup on a call and suggest changes",
      goal: "sell",
      platform: "tiktok",
      coming_up: "Video desk checks open for booking on Monday 7 December. Each one is 20 minutes on a video call.",
    },
    ideal: items(
      i(
        "A real desk check: their desk on the call, the changes you suggest one per line on screen, 20 minutes cut down to 30 seconds.",
        "Step-by-step demo",
        "People only book what they can picture, and seeing a whole check in half a minute makes it feel small and easy.",
      ),
      i(
        "Open with a number: 20 minutes, 1 call, your own desk. Then what you look at first: chair height, screen height, where the mouse sits.",
        "Talking to camera",
        "Opening with a number is how your best posts start, and naming what you check tells people exactly what they are booking.",
      ),
      i(
        "Answer the comment: can you really check a desk over a video call? Show the call from your side and what one propped-up phone lets you see.",
        "Answer a question from the comments",
        "It is the doubt that stops people booking, and showing your side of the call answers it better than any promise.",
      ),
      i(
        "Rate my setup: film your own desk, make one change at a time, and ask what viewers would change on theirs. Booking opens Monday 7 December.",
        "Text on screen over footage",
        "Desk posture is your topic, and rating your own desk first shows people what a check feels like before they book one.",
      ),
      i(
        "What to film for the call, one per line on screen: your chair, your screen, and you sitting the way you normally do, from the side. Then the booking date.",
        "Text on screen over footage",
        "Knowing what to get ready makes booking feel like a small, sensible step rather than a big commitment.",
      ),
      i(
        "Your own desk filmed from above as you talk through a call with a client, voice only, the desk check from start to finish.",
        "Voiceover over footage",
        "It shows the calm way you talk to people one to one, which is what someone booking a call wants to hear first.",
      ),
      i(
        "Ask to camera: which part of your desk do you think is wrong? Then say video checks open for booking on Monday 7 December, and you will look at it with them.",
        "Talking to camera",
        "Ending on a question is your style, and the answers show you who is likely to book first.",
      ),
    ),
    note: "Sells one booking, the 20-minute video check, by showing it in use, with the launch date exactly as given. Opens with numbers, ends on questions, no emoji and no promise to fix pain.",
  },
  {
    title: "Coffee bar's new face on nights",
    label: "gold",
    brain: "Night Owl Coffee",
    inputs: {
      topic: "the people who work the night shift behind our counter",
      goal: "trust",
      platform: "reels",
      coming_up: "Sam moves from weekend days to the night shift from Thursday 12 November.",
    },
    ideal: items(
      i(
        "Sam's first night shift from the end of the counter: the lamp going on, the first cup poured, a regular coming in. Lowercase text on screen: new on the night shift.",
        "Text on screen over footage",
        "Your regulars like knowing who is behind the counter late, and a quiet first night lets them meet Sam before they walk in.",
      ),
      i(
        "Sam to camera, half whisper, on swapping weekend days for nights: what is different about the bar after midnight.",
        "Talking to camera",
        "Night shifts are your topic, and hearing it from someone who has worked both makes the late bar feel like a real place.",
      ),
      i(
        "The close, filmed in real time and cut to 30 seconds: chairs up, cups stacked, the lamp off last, with a sleepy lowercase voiceover from whoever closed.",
        "Voiceover over footage",
        "Showing the work nobody sees builds trust, and the slow pace matches the warm, sleepy feel people follow you for.",
      ),
      i(
        "Answer the comment: who makes the coffee after midnight? Introduce the night shift one face at a time, with Sam last, on nights from Thursday 12 November.",
        "Answer a question from the comments",
        "It turns a question your followers really have into a small introduction, and faces behind the counter are why people come back.",
      ),
      i(
        "Each person on the night shift makes their own last cup of the night and says what it is. Sam goes first.",
        "Talking to camera",
        "The last cup of the night is a feeling your followers know from your posts, and a person's order says more than a bio.",
      ),
      i(
        "Hands only: Sam learning the way the bar pours, close up under the lamp, one lowercase line per step.",
        "Step-by-step demo",
        "Seeing someone new being taught tells people every cup is made the same careful way, whoever is on.",
      ),
      i(
        "A lowercase card on the counter with steam drifting in front of it: from 12 november, sam is on nights. Nothing else on screen.",
        "Text on screen over footage",
        "It gives the news exactly as it is, in the short, quiet way your followers expect, and they will welcome Sam in the comments.",
      ),
    ),
    note: "Builds trust through the people behind the counter, with Sam's move to nights exactly as given. Lowercase on screen, short lines, no hashtags, no capitals for shouting and no hustle talk.",
  },
  {
    title: "Coffee bar after the clocks go back",
    label: "gold",
    brain: "Night Owl Coffee",
    inputs: { topic: "the clocks going back and dark by five", goal: "reach", platform: "x" },
    ideal: items(
      i(
        "One lowercase post at five, when it is already dark: for the people whose day starts when the lights come on. the lamp is on.",
        "Single post",
        "Strangers who work late will see themselves in it and pass it on, and it says what you are for without a pitch.",
      ),
      i(
        "The window from the pavement at dusk, lamp light on wet glass. Line, lowercase: dark at five. warm in here.",
        "Photo with a line",
        "A warm picture on a dark evening is the kind people repost to say they wish they were there, which is how new night owls find you.",
      ),
      i(
        "Poll, lowercase: now it is dark by five, when does your night start? before six, after ten, or it never really ends.",
        "Poll",
        "A light question about the dark evenings reaches people outside your regulars, and every vote is someone awake when you are.",
      ),
      i(
        "A short thread, one lowercase line each, on the long nights from behind the counter: the first dark evening, the coats getting thicker, the last cup getting later.",
        "Short thread",
        "Night shifts and the regulars are your topics, and small true details from the counter are what people share.",
      ),
      i(
        "A post for night workers who now finish in the dark and start in the dark: one line saying there is a warm cup waiting, nothing more.",
        "Single post",
        "People on night shifts rarely see a post written for them, so they send it to the people they work with.",
      ),
      i(
        "One cup on the counter, the clock behind it just after five and black outside. Line: the night shift starts earlier now.",
        "Photo with a line",
        "It turns the clocks going back into a small, sleepy joke your followers will answer with their own start time.",
      ),
      i(
        "A short thread asking whether decaf after midnight still makes sense when the night starts at five, and how the dark changes their order. One reply each.",
        "Short thread",
        "It ties the dark evenings to decaf after midnight, a topic your followers already argue about, so new people join in.",
      ),
    ),
    note: "Reach on X from a short brief: lines strangers on late shifts would share, all lowercase and under three lines, with no hours, prices or dates that were not given. No hashtags, no capitals for shouting.",
  },
  {
    title: "Gym on the hip hinge",
    label: "gold",
    brain: "Northside Strength",
    inputs: { topic: "the hip hinge, for beginners who think they cannot deadlift", goal: "reach", platform: "tiktok" },
    ideal: items(
      i(
        "The hip hinge with a broom handle along the back: head, upper back and tailbone touching it, and the coach correcting one member's hinge.",
        "Step-by-step demo",
        "Form before weight is one of your topics, and a broom handle is a test strangers can try in their own kitchen and share.",
      ),
      i(
        "Answer the comment: I cannot deadlift, my back is bad. The coach answers plainly: start with the hinge, and tell the coach or a physio about your back first.",
        "Answer a question from the comments",
        "It speaks to the worry that keeps beginners away, and a careful, plain answer is the kind people send to a friend.",
      ),
      i(
        "Margaret's first hinge next to her 60 kg deadlift at 61: where that lift started.",
        "Text on screen over footage",
        "Margaret's 60 kg is the post people already know you for, and showing where it began makes the hinge worth learning.",
      ),
      i(
        "Hinge or squat? The coach shows both side by side with an empty bar and asks which one viewers do when they pick up a box at home.",
        "Talking to camera",
        "A side by side is quick to understand, and lifting a box is a moment every viewer has had.",
      ),
      i(
        "Three cues for the hinge, said by the coach between sets in plain gym words, one cue per shot, chalk on hands and the roller door behind.",
        "Voiceover over footage",
        "It sounds like a coach between sets, which is how you sound, and short cues are easy to save for a first session.",
      ),
      i(
        "Day one, before any bar: the hinge drill the coach uses with beginners, shown in real time so people see how simple the start is.",
        "Step-by-step demo",
        "People who never thought a gym was for them need to see day one is this simple, which is what your gym is for.",
      ),
      i(
        "A common first-hinge mistake on a real member: knees forward, back rounding, then the coach's fix on the bar.",
        "Text on screen over footage",
        "Showing the coach fixing a real member's form is what you do best, and beginners save the fix for their own first session.",
      ),
    ),
    note: "Reach without a single promise: a test people can try at home, real coaching on the bar, Margaret's real numbers only with her yes, and a pointer to a physio. No weight-loss or body talk, no banned gym words.",
  },
  {
    title: "Invoicing app's automatic reminders",
    label: "gold",
    brain: "Tallybook",
    inputs: {
      topic: "automatic payment reminders: Tallybook sends a polite reminder for you when an invoice is due and when it is late",
      goal: "sell",
      platform: "tiktok",
      coming_up: "Automatic reminders go live for every Tallybook account on Tuesday 17 November. You choose the days they go out and can edit the wording.",
    },
    ideal: items(
      i(
        "Screen recording: turn on automatic reminders for a real invoice, pick day 1, day 7 and day 14, edit the wording, done. One highlighted line per step.",
        "Step-by-step demo",
        "It is the worked example your followers come for, on the real screen, and it shows the feature in the time it takes to use it.",
      ),
      i(
        "Read out the awkward chasing email you would normally write for a late invoice, then show Tallybook sending a polite one on the due date instead.",
        "Voiceover over footage",
        "Late payments is your biggest topic, and freelancers who hate chasing will see at once what the reminders take off their plate.",
      ),
      i(
        "Answer the comment: will an automatic reminder annoy my client? Show the wording you can edit, and say it depends on the client and how you set it up.",
        "Answer a question from the comments",
        "It is the worry that stops freelancers switching reminders on, and saying it depends on their situation keeps you honest.",
      ),
      i(
        "The £2,400 invoice, 30 days late, 3 reminders: the same worked example as before, now with the reminders going out on their own.",
        "Text on screen over footage",
        "Same shape as your freelancer maths post, with one change people can see in a second.",
      ),
      i(
        "To camera, calm: from Tuesday 17 November, reminders go out on their own, on the days you choose, in your words. Then cut to the screen.",
        "Talking to camera",
        "The launch date said plainly, with no countdown, is how your followers like news, and the screen proves it straight after.",
      ),
      i(
        "A due date on the invoice, then the reminder that goes out on that exact date, side by side on screen.",
        "Text on screen over footage",
        "It builds on your post about writing a date instead of 30 days, so people who saved that one get the next step.",
      ),
      i(
        "What the client sees: the reminder landing in an inbox, read out line by line in plain English, with nothing pushy in it.",
        "Voiceover over footage",
        "Freelancers want to know how it lands on the other side, and seeing the client's view is what makes them try it.",
      ),
    ),
    note: "Sells one feature by showing it on the real screen, with the launch date and what people control exactly as given. Worked numbers from the brand's own example, no emoji and no fake urgency.",
  },
  {
    title: "Invoicing app on Self Assessment dates",
    label: "gold",
    brain: "Tallybook",
    inputs: {
      topic: "Self Assessment dates sole traders mix up",
      goal: "trust",
      platform: "shorts",
      coming_up: "A live Q and A on Self Assessment dates with our support team on Thursday 10 December at 6 p.m., on YouTube.",
    },
    ideal: items(
      i(
        "A calendar on screen with the Self Assessment dates circled one at a time, each with one plain line on what it is for, ending on: yours depend on your situation.",
        "Text on screen over footage",
        "Self Assessment dates are one of your topics, and a calm calendar is what sole traders save and come back to.",
      ),
      i(
        "Answer the comment: is the paper deadline the same as the online one? A straight answer on screen, and the Q and A on 10 December for follow-ups.",
        "Answer a question from the comments",
        "It clears up a real mix-up in plain English, and pointing to the live Q and A shows people where to ask about their own case.",
      ),
      i(
        "Your support team to camera, saying who will be on the live Q and A on Thursday 10 December at 6 p.m., and the one thing they will not do: advise on one person's tax.",
        "Talking to camera",
        "Seeing the people behind the app, and hearing what they will not do, is what makes a money app easy to trust.",
      ),
      i(
        "A sole trader's year on a timeline, invoice by invoice, with the points where a Self Assessment date lands marked on the real Tallybook screen.",
        "Step-by-step demo",
        "One worked example on the real screen is how you explain best, and it shows the dates as part of a normal year, not a threat.",
      ),
      i(
        "Three Self Assessment mix-ups, one per screen, each named calmly with the plain fix underneath.",
        "Voiceover over footage",
        "Mix-ups feel less scary once someone names them calmly, which is how you talk about tax.",
      ),
      i(
        "Where Tallybook keeps the tax year's invoices, shown as a screen recording and read out calmly, ending on the Q and A date.",
        "Step-by-step demo",
        "It shows a freelancer what to have ready before a deadline, on the real screen of the app they use.",
      ),
      i(
        "Ask viewers to leave their Self Assessment date questions under the video, so the Q and A on 10 December is built around them.",
        "Talking to camera",
        "Asking for questions first builds the Q and A around where your followers get stuck, and they come back to hear the answer.",
      ),
    ),
    note: "Builds trust by explaining dates calmly on the real screen and pointing people to the live Q and A, with its date and time exactly as given. States no tax dates that were not given, and never gives one person tax advice.",
  },
  {
    title: "Plumber's new apprentice",
    label: "gold",
    brain: "Fernhill Plumbing",
    inputs: {
      topic: "how we teach a new apprentice",
      goal: "trust",
      platform: "reels",
      coming_up: "Jordan starts as our apprentice on Monday 9 November. Jordan is happy to be filmed.",
    },
    ideal: items(
      i(
        "Jordan's first day in the van: the tools laid out on the floor, and what each one is for, in plain terms. No customers in shot.",
        "Voiceover over footage",
        "Showing who will turn up at the door, and how they are taught, is why people trust a firm with their home.",
      ),
      i(
        "Here is what we found, apprentice edition: Jordan takes a bath panel off with a torch and says what they see before you say what it is.",
        "Step-by-step demo",
        "It uses your usual opener and shows people the work gets checked twice, which is what they want from whoever comes round.",
      ),
      i(
        "The first job you teach Jordan: finding and turning a stopcock under a real kitchen sink in Bristol, with no house number in shot.",
        "Step-by-step demo",
        "The stopcock is your best-known lesson, and watching a beginner learn it makes viewers go and find their own.",
      ),
      i(
        "Jordan to camera at the end of the first week: one thing about plumbing they did not expect, in their own words.",
        "Talking to camera",
        "A new face talking plainly makes the firm feel like real people, and your regulars will welcome Jordan in the comments.",
      ),
      i(
        "Call or check it yourself? Jordan guesses on three common jobs, and you say which is a call-out and which people can look at themselves.",
        "Talking to camera",
        "Saying when people do not need you is how you earn the call, and a beginner's guesses make it friendly rather than a lecture.",
      ),
      i(
        "Copper pipe close up: your hands guiding Jordan's on a first joint, slow and steady, with one line on screen on why it is done this way.",
        "Text on screen over footage",
        "Hands and tools close up is how your jobs look, and the patience in it tells customers their job will not be rushed.",
      ),
      i(
        "Answer the comment: will an apprentice work on my house on their own? Explain plainly how jobs are shared at Fernhill.",
        "Answer a question from the comments",
        "It is a fair worry when a new name turns up, and a straight answer keeps the trust the apprentice posts build.",
      ),
    ),
    note: "Trust through a new face learning the real job, with Jordan's start date and consent exactly as given. Shows the area but no customers, house numbers or prices, gives people one thing to check, and no exclamation marks.",
  },
  {
    title: "Plumber on outside taps in summer",
    label: "gold",
    brain: "Fernhill Plumbing",
    inputs: { topic: "outside taps and hosepipes as summer starts", goal: "talk", platform: "x" },
    ideal: items(
      i(
        "Poll: where is the valve that turns off your outside tap? Under the kitchen sink, in the garage, or no idea.",
        "Poll",
        "A tap people walk past every day makes an easy vote, and the no idea answers show you what to teach next.",
      ),
      i(
        "An outside tap from a real job in Bristol, area named and house number out of shot, with one line on what to look for and a question: when did you last check yours?",
        "Photo with a line",
        "It shows a real job and one thing people can check themselves, and the question gets them replying about their own taps.",
      ),
      i(
        "A short thread on the hosepipe left on the tap all winter: what it can do to the tap, how to check yours, and when it is worth a call.",
        "Short thread",
        "It turns your getting ready for winter topic round, and people reply with what they left on their tap.",
      ),
      i(
        "Dripping outside tap: worth a look or worth a call? Ask people to reply with what theirs does, and answer a few plainly.",
        "Single post",
        "Saying when to call and when not to is how you talk, and replies about real drips give you the next posts.",
      ),
      i(
        "A tap with a frost cover next to one without, side by side. Line: which one is yours?",
        "Photo with a line",
        "A side by side is quick to read on X, and people answer with a photo of their own tap.",
      ),
      i(
        "A short thread, in plain terms, on the outside tap: where its stopcock usually is, how to turn it off, and what a slow drip in summer means for winter.",
        "Short thread",
        "The stopcock is your best-known lesson, and moving it outside gives people a reason to compare where theirs is.",
      ),
      i(
        "A friendly argument: does the hosepipe stay on the tap all year, yes or no? Your answer the next day, with the reason.",
        "Single post",
        "It is a small disagreement people have with their neighbours, and coming back with your answer keeps it going.",
      ),
    ),
    note: "Gets people talking about a summer job on X with polls, side by sides and real questions, ties it back to winter and the stopcock, and never scares anyone into booking. No prices, no house numbers, no exclamation marks.",
  },
  {
    title: "Budget cook selling the meal plan",
    label: "gold",
    brain: "Twelve Quid Kitchen",
    inputs: {
      topic: "my December meal plan: a printable PDF with five dinners, the shopping list and what each dinner cost to the penny",
      goal: "sell",
      platform: "shorts",
      coming_up: "The December plan goes on sale on Tuesday 1 December. The shopping list and prices come from my Sunday shop on 29 November.",
    },
    ideal: items(
      i(
        "The Sunday shop on 29 November unpacked onto the counter with the receipt, then the December plan's shopping list on screen next to it, line for line.",
        "Text on screen over footage",
        "The receipt is your proof, and seeing the list match it is what makes people trust a plan enough to buy it.",
      ),
      i(
        "Flick through the PDF page by page: five dinners, the list, the price per portion to the penny, with the shop named and a line that prices change.",
        "Step-by-step demo",
        "People buy what they can see, and prices to the penny are why they come to you in the first place.",
      ),
      i(
        "One dinner from the plan cooked start to finish, its price per portion on screen, then: the other four are in the December plan, out Tuesday 1 December.",
        "Voiceover over footage",
        "Showing one dinner whole is the honest way to sell the other four, and it is the same shape as your receipt posts.",
      ),
      i(
        "Answer the comment: is the plan just the recipes from your videos? Say plainly what is in the PDF and what is not.",
        "Answer a question from the comments",
        "It is the fair question before people pay, and a straight answer about what they get keeps you sounding like a friend, not a shop.",
      ),
      i(
        "The maths, to camera: the receipt total from the 29 November shop, split across five dinners and worked out on a notepad.",
        "Talking to camera",
        "People come to you for the maths, and doing it live is the proof they want before they buy.",
      ),
      i(
        "A printed copy stuck on the fridge, a tick next to each dinner as the week goes on, and one line on screen: December plan, out Tuesday 1 December.",
        "Text on screen over footage",
        "It shows the plan being used in a real small kitchen, which sells it better than a list of what is inside.",
      ),
      i(
        "Batch cook day from the plan: two of the five dinners made in one go, split into tubs, with the price per tub written on each lid.",
        "Step-by-step demo",
        "Batch cooking is one of your topics, and people who see two dinners from one session will want the plan for the rest.",
      ),
    ),
    note: "Sells one product, the December plan, by showing it in use with the receipt, the shop and prices to the penny. Uses the sale and shop dates exactly as given, invents no price, and has no diet talk or budget shaming.",
  },
  {
    title: "Budget cook's Christmas dinner challenge",
    label: "gold",
    brain: "Twelve Quid Kitchen",
    inputs: { topic: "can Christmas dinner for four come in under £12? I am going to try it this year", goal: "talk", platform: "tiktok" },
    ideal: items(
      i(
        "Ask it to camera: Christmas dinner for four, under £12, possible or not? Read out the best replies in the next video.",
        "Talking to camera",
        "It is a question with two strong sides, and your followers will want to be proved right.",
      ),
      i(
        "Text on screen over the chopping board: if Christmas dinner has to come in under £12, which one thing stays? The roast, the pigs in blankets or the pudding.",
        "Text on screen over footage",
        "A small, friendly argument about what makes Christmas, and every answer tells you what goes on your list.",
      ),
      i(
        "The Sunday shop for the trial run, receipt on the counter, each item priced to the penny on screen, the shop named and a line that prices change.",
        "Voiceover over footage",
        "The receipt is how your followers check your maths, and they will tell you in the comments where they would have shopped.",
      ),
      i(
        "Answer the comment: what about the gravy? Show how much of the £12 it takes, and ask if it is worth it.",
        "Answer a question from the comments",
        "Small parts of the dinner start the liveliest arguments, and answering one keeps the series going.",
      ),
      i(
        "The maths on a notepad, out loud: £12 split between four people, to the penny, and what that leaves for each part of the plate.",
        "Talking to camera",
        "People come to you for the maths, and seeing what each plate gets makes them comment with their own sums.",
      ),
      i(
        "Ask people for the swap they make to keep Christmas dinner cheap, then try the top three in your small kitchen.",
        "Step-by-step demo",
        "Letting followers shape the dinner turns your challenge into theirs, and they come back to see their swap tried.",
      ),
      i(
        "Pigs in blankets or stuffing: if only one fits under £12, which goes? Text on screen, and votes in the comments.",
        "Text on screen over footage",
        "A playful either-or keeps people talking, and the result tells you what to cook first.",
      ),
    ),
    note: "A one-line seasonal brief turned into seven ways to get people arguing kindly about the £12 Christmas dinner, with the receipt and the maths to the penny. No diet talk, no 'hack', and nobody's budget shamed.",
  },
  {
    title: "Salon on twice-a-year cuts",
    label: "gold",
    brain: "Chair Nine",
    inputs: {
      topic: "low-maintenance cuts for people who only see a hairdresser twice a year",
      goal: "reach",
      platform: "reels",
      coming_up: "Quiet week: free chairs on Tuesday 17 and Wednesday 18 November.",
    },
    ideal: items(
      i(
        "A low-maintenance cut on a client who comes twice a year: the technique named, the time it took, and how it will sit at three and six months.",
        "Step-by-step demo",
        "People who rarely get to a salon search for exactly this, and saying how it grows out is the bit nobody else shows them.",
      ),
      i(
        "Hands sectioning hair at chair nine, with the questions you ask a twice-a-year client on screen one at a time.",
        "Text on screen over footage",
        "It shows strangers a cut can be planned around their life, which they send to the friend who never books.",
      ),
      i(
        "Answer the comment: what cut grows out well if I only go twice a year? Say which cuts you would suggest and why, without promising one suits every head.",
        "Answer a question from the comments",
        "It is the question people type before they pick a salon, and an honest answer brings them to you from that search.",
      ),
      i(
        "A stylist to camera at chair nine, mid-cut: the one choice that makes grown out look planned instead of forgotten.",
        "Talking to camera",
        "Grown out is one of your words, and a stylist chatting while they work is how your posts sound.",
      ),
      i(
        "The quiet week, said plainly over the empty chairs in window light: free chairs on Tuesday 17 and Wednesday 18 November.",
        "Text on screen over footage",
        "A quiet week is a real chance for people who keep putting off a cut, and plain dates make it easy to act on.",
      ),
      i(
        "Lived-in, explained: a voiceover over a cut in progress on what lived-in means for someone who books twice a year.",
        "Voiceover over footage",
        "Lived-in is a word people search without knowing what it means, so a clear answer reaches new people.",
      ),
      i(
        "One client's cut on day one, at three months and at six, and what to ask for at the next visit.",
        "Step-by-step demo",
        "Saying how long a cut will last is what you are known for, and a timeline is the frame people pause on and save.",
      ),
    ),
    note: "Reach through what people who rarely see a hairdresser search for, with the technique, the time and how it grows out. The quiet-week dates exactly as given, clients only with their yes, no filters and no banned beauty words.",
  },
  {
    title: "Salon on wedding hair trials",
    label: "gold",
    brain: "Chair Nine",
    inputs: { topic: "booking hair for a summer wedding: is a trial worth it", goal: "talk", platform: "x" },
    ideal: items(
      i(
        "Poll: a hair trial before the wedding? Yes every time, only for a big change, or never had one. Your view the day after.",
        "Poll",
        "People have strong views on trials, and the votes show you what your followers want to hear about next.",
      ),
      i(
        "A short thread from chair nine on what happens in a trial: the consult, the pins, the photos in window light, and how long it took.",
        "Short thread",
        "It puts the consult, one of your topics, into a wedding, so people reply with their own trial stories.",
      ),
      i(
        "A bit cheeky: the trial is the one day the hair is allowed to go wrong. Ask who has had one go wrong.",
        "Single post",
        "A small, honest line about trials is easy to agree or argue with, and people answer with their own stories.",
      ),
      i(
        "Pins, a comb and a phone showing the client's reference photo on the trolley. Line: trial or no trial, how did yours go?",
        "Photo with a line",
        "It is how your trolley really looks, and an open question under it gets replies from people who have been there.",
      ),
      i(
        "A short thread on when you would say skip the trial and when you would say book one, honest, with the time each one takes.",
        "Short thread",
        "Saying when people can skip a trial is the same honest move as your post about not bleaching Priya's hair, and it starts a fair debate.",
      ),
      i(
        "The hair on the day has to last until the last dance. How long did yours last? Reply with the hour it fell.",
        "Single post",
        "How long a style lasts is what you always talk about, and the replies are funny and honest at once.",
      ),
      i(
        "A lived-in colour at chair nine. Line: colour three weeks before the wedding, or one week before?",
        "Photo with a line",
        "Timing colour around a wedding is a real question people argue about, and it leads to your consult without selling it.",
      ),
    ),
    note: "A real question with two sides, asked in the stylist's warm, cheeky voice across polls, threads and photos. Says how long things take and last, shows clients only with their yes, invents no prices and mocks nobody's hair.",
  },
  {
    title: "Groomer's puppy intro sessions",
    label: "gold",
    brain: "Muddy Paws Grooming",
    inputs: {
      topic: "puppy intro sessions, so a puppy's first groom is short and calm",
      goal: "sell",
      platform: "reels",
      coming_up: "Puppy intro sessions start on Saturday 21 November. Each one is 30 minutes: feet, face, a bath and a towel dry, no full cut.",
    },
    ideal: items(
      i(
        "A puppy's first intro session: feet first, then the face, then the bath, a calm hand on the collar the whole way. Name and breed on screen.",
        "Step-by-step demo",
        "Owners of new puppies want to see exactly what happens in the 30 minutes, and seeing it calm is what gets them to book.",
      ),
      i(
        "Why 30 minutes and not a full groom: explain at the table that a short, calm first visit makes the next one easier.",
        "Talking to camera",
        "Explaining why a groom takes the time it does is how you talk, and it answers what owners wonder before they book.",
      ),
      i(
        "The towel dry, close up with the sound on: just a towel and a pause. One line on screen: puppy intro sessions from Saturday 21 November.",
        "Text on screen over footage",
        "Same shape as your post about towel drying Biscuit, and owners can hear how calm the first visit is.",
      ),
      i(
        "Answer the comment: when should my puppy have their first groom? Say what the intro session covers, feet, face, bath and towel dry, and why there is no full cut.",
        "Answer a question from the comments",
        "It is what new puppy owners are wondering, and a plain answer with the session in it turns their question into a booking.",
      ),
      i(
        "The van by the sea wall, the table set with a small towel and a comb, the door opening for the first puppy. Voiceover on what owners can expect.",
        "Voiceover over footage",
        "The quiet van is the look your followers know, and walking owners through the visit makes booking feel easy.",
      ),
      i(
        "Pick-up after an intro session, from the owner's side of the door: the puppy trotting out, and one line on what comes at the next visit.",
        "Voiceover over footage",
        "A calm puppy at pick-up shows owners what the session is for, and they can picture their own walking out the same way.",
      ),
      i(
        "Over the bath, one line at a time: puppy intro sessions, 30 minutes, feet, face, bath, towel dry, from Saturday 21 November.",
        "Text on screen over footage",
        "It gives owners every fact they need in one short clip they can send to whoever else walks the dog.",
      ),
    ),
    note: "Sells one booking, the puppy intro session, by showing it calm and in use, with its start date and contents exactly as given. Dog's name and breed on screen, calm handling only, no promises about skin and no cute filler words.",
  },
  {
    title: "Groomer on winter beach walks",
    label: "gold",
    brain: "Muddy Paws Grooming",
    inputs: { topic: "winter beach walks", goal: "reach", platform: "tiktok" },
    ideal: items(
      i(
        "What a winter beach walk leaves in a coat: sand, salt and tangles, combed out gently on the table, with the dog's name and breed on screen.",
        "Step-by-step demo",
        "Owners near the sea will know the sand at once, and coat care between grooms is a topic you can teach in seconds.",
      ),
      i(
        "Rinse or no rinse after the beach? Say to camera what salt water does to a coat over a winter, and what you would do at home.",
        "Talking to camera",
        "Dog owners by the sea ask themselves this on the walk home, and a plain answer gets saved and shared.",
      ),
      i(
        "The towel by the back door: a short towel routine after a wet walk, shown on a calm dog, step by step.",
        "Step-by-step demo",
        "A small job owners can do at home is the kind of video they send to the rest of the family.",
      ),
      i(
        "Answer the comment: why does my dog get matted after the beach? Show where it starts, behind the ears and under the collar, kindly and with no blame.",
        "Answer a question from the comments",
        "Matting is one of your topics, and explaining it without blame is why owners listen to you.",
      ),
      i(
        "The van parked by the sea wall, a wet dog on the table, the sound of the sea and the comb. Text on screen: where the beach goes after the walk.",
        "Text on screen over footage",
        "Your van by the sea is a picture strangers stop for, and it shows where you are without saying it.",
      ),
      i(
        "Three spots to check after a beach walk, one per shot: between the toes, the armpits, the tail. Calm hands, the dog's name on screen.",
        "Voiceover over footage",
        "One quick check owners can do themselves reaches people well beyond your village, and they come back for the next one.",
      ),
      i(
        "A doodle coat after a week of beach walks, combed out slowly, with one line on screen on why it takes the time it does.",
        "Text on screen over footage",
        "It builds on your doodle coat post, and saying why it takes time keeps it kind to the owner.",
      ),
    ),
    note: "A three-word seasonal brief turned into seven things owners by the sea would share: real coats, calm hands, one thing to check at home. Never a dog in distress, no blame for matting and no cute filler words.",
  },
  {
    title: "Ceramics glaze test for batch 16",
    label: "gold",
    brain: "Kiln Street Ceramics",
    inputs: {
      topic: "how a new glaze gets tested before it goes on a mug",
      goal: "trust",
      platform: "shorts",
      coming_up: "Batch 16 goes in the kiln on Wednesday 18 November with six test tiles of a new green glaze. The kiln opens on Friday 20 November.",
    },
    ideal: items(
      i(
        "Six test tiles dipped in the new green glaze, one at a time, hands and buckets in shot. On screen: batch 16, kiln day Wednesday 18 November.",
        "Step-by-step demo",
        "Glaze tests are one of your topics, and showing every tile before firing means people believe the results, good or bad.",
      ),
      i(
        "Opening the kiln on Friday 20 November: the six tiles lifted out in silence, the camera close on each one before you say a word.",
        "Voiceover over footage",
        "Kiln days are a topic your followers know, and letting the tiles show first is the quiet, exact way you talk.",
      ),
      i(
        "The tiles in a row on the shelf, each labelled, and you to camera saying which one goes on a mug and which never will, and why.",
        "Talking to camera",
        "Saying no to a glaze on camera shows people you only sell what passed, which makes your good pieces believable.",
      ),
      i(
        "If a tile fails, close up on it: a run, a crawl or pinholes, named plainly, with one line on what you will change.",
        "Text on screen over footage",
        "Showing the failures is what made your cracked-handle post work, and a failed tile makes the good glaze easier to trust.",
      ),
      i(
        "Answer the comment: why not put the new glaze straight on a mug? Explain at the bench what a test tile tells you that a mug cannot.",
        "Answer a question from the comments",
        "Buyers rarely think to ask this, and the answer shows how much care goes into one mug.",
      ),
      i(
        "The glaze bucket, the scale and the notebook: how you write down a test, one measurement per line on screen, kept exactly.",
        "Text on screen over footage",
        "Quiet, exact detail is how you talk about clay, and makers and buyers both save this kind of record.",
      ),
      i(
        "If the green passes, a mug next to its test tile: the colour on a flat tile and on a curve, shown side by side.",
        "Step-by-step demo",
        "It shows why no two pieces look the same, which is what people trust your shop for.",
      ),
    ),
    note: "Trust through the whole test, from dipping to the kiln opening, with batch 16, the six tiles and both dates exactly as given. Shows failures honestly, never calls a piece perfect and claims nothing about food safety.",
  },
  {
    title: "Ceramics on mugs as presents",
    label: "gold",
    brain: "Kiln Street Ceramics",
    inputs: { topic: "people asking which mug to buy as a Christmas present", goal: "talk", platform: "reels" },
    ideal: items(
      i(
        "Two mugs from the same batch side by side, one with a glaze run, one without. On screen: which would you give? Answers in the comments.",
        "Text on screen over footage",
        "A friendly argument about flaws is an honest way to talk about presents, and it is what your seconds posts are built on.",
      ),
      i(
        "Hold each mug shape up to camera and ask: for the person who drinks tea all day, which one? Read the replies in the next video.",
        "Talking to camera",
        "People already ask you this, and turning it round gets them describing who they are buying for.",
      ),
      i(
        "Answer the comment: is a mug with a glaze run a good present? Show a run close up and say why you keep it.",
        "Answer a question from the comments",
        "It answers the doubt in plain words and makes the run sound intended, the way your glaze posts do.",
      ),
      i(
        "Hands round a mug in the cold studio, steam rising, and one line on screen: what goes in the first cup from a mug you were given?",
        "Text on screen over footage",
        "A small, warm question gets people talking about who they buy for, without you selling a thing.",
      ),
      i(
        "Trimming a mug on the wheel in real time, with a voiceover asking: handle on the left or the right, does it matter for a present?",
        "Voiceover over footage",
        "Hands on the wheel is how your clips look, and a tiny argument keeps people watching to the end.",
      ),
      i(
        "One mug from a batch, from the wheel to the kiln, ending on a question: would knowing this change which mug you give?",
        "Step-by-step demo",
        "Showing how a pot was made is the idea behind your shop, and the question turns the craft into a conversation.",
      ),
      i(
        "Ask to camera: a matching set or every mug different? One sentence each way, then hand it to the comments.",
        "Talking to camera",
        "Every piece being one of a kind is what you are about, so this is the argument your followers will want to have.",
      ),
    ),
    note: "Gets people talking about presents through flaws, shapes and how a mug is made, in the maker's quiet voice. No gift-guide words, no countdown to Christmas, never calls a piece perfect and says nothing about food safety.",
  },
];
