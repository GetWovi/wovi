# Make a video, version 2: the plan

From Funkai's message (28 Oct, 04:30): "User gets to screen, tells what it wants, the idea, AI asks or confirms
specific preferences like what type of video, what the style is, does it need voice over or caption, etc, then story
board is drafted, user arranges the storyboard or edit the style if needed, video is generated. And it goes with
different styles: 3d, 2d, realistic, hyperrealistic, comics, motion graphics, pixel."

Goal: everything he asked for, plus the things that make it feel finished: you always know what happens next, what it
costs and how long it takes, and you end with a video that is ready to post.

## The flow, screen by screen

### 1. The idea
- One big box: "What do you want to make a video about?" with example ideas to tap.
- Optional: drop a reference video ("make it like this", already built) or your own photos and clips to use.
- One button: "Continue". Nothing is charged yet.

### 2. The AI suggests, you confirm (the heart of his flow)
- The AI reads the idea (and the reference and the Brand Brain when there are some) and answers in a few seconds
  with a ready proposal, written as one plain sentence and as settings you can tap:
  "A 30 second 3D product video, calm, with a warm voiceover and captions, vertical for TikTok and Reels."
- Every setting is a chip you can change: Type, Style, Voiceover, Captions, Length, Format, Mood.
- If the idea is unclear the AI asks at most two short questions first, with tap answers
  (for example "Who is it for?" with choices), never a wall of questions.
- One button: "Looks good, plan it". A small "why these settings" line shows its reasoning in one sentence.
- Cost: one tiny model call (about $0.002), part of the plan's price.

### 3. The settings (each one explained in plain words, with a picture)
- **Type** (what the video is for): Explainer, Product feature, Teaser, Story, Ad, Tutorial, Announcement.
- **Style** (how it looks), each as a card with a small example picture:
  - 3D: a clean 3D animated look, soft light, rounded shapes.
  - 2D: flat illustration, clear shapes, bold colours.
  - Realistic: natural photos, like shot on a good phone.
  - Hyperrealistic: cinematic, high detail, dramatic light, shallow depth of field.
  - Comic: comic book panels, ink lines, halftone dots, speech-bubble feel (no real characters).
  - Motion graphics: real line and shape animation, the minimal motion engine (no pictures).
  - Pixel: retro pixel art, limited palette.
- **Voiceover**: on or off. When on: pick a voice (Warm, Calm, Bright) with a "play sample" button that plays a
  2 second sample before you choose.
- **Captions**: on or off. When on: caption look (Clean, Bold word-by-word highlight like TikTok, Minimal) and
  position (bottom, middle).
- **Length**: 15, 30, 60 seconds. **Format**: 9:16, 1:1, 16:9. **Mood**: fun, calm, bold, premium.
- **Brand**: "Use my Brand Brain" switch: brand colours on text and shapes, the logo as an end card.

### 4. The storyboard (drafted, then yours to arrange)
- The plan appears as cards, one per scene: picture (or animation preview), what is said, what it shows, words on
  screen, seconds.
- **Arrange**: drag a card to move it (and up/down buttons on phones), duplicate, delete, add a scene, split a long
  scene in two, merge two scenes.
- **Edit the style** for the whole video at any time: pick another style and only the pictures are redrawn (price
  shown first). Or change one scene's look only.
- **Pictures**: "Draw again" gives two new options side by side; tap the one you like. Lock a scene so a restyle
  never touches it. Use your own photo or clip on any scene (already built).
- **Preview before paying**: a quick storyboard preview plays the pictures with their timing and captions in the
  browser, with no voice and no cost, so you see the flow before the video is made.
- **Undo** the last change, and every change saves itself.
- A running total at the top: scenes, length, and what the video step will cost.

### 5. The video
- One button: "Make the video", with price and time shown ("about 40 seconds").
- A progress bar with real steps: voice recorded, scenes cut, captions added, done.
- The result: player, download MP4, and a **ready-to-post pack**: a caption for each platform and hashtags, made by
  WOVI's own Caption Writer and Hashtag agents from the script (better than he asked: the video arrives ready to
  post, not just as a file).
- "Change something" goes back to the storyboard with everything kept; making it again only charges what changed.

### Always
- Each step shows what it costs before it runs, and the credits are charged only for what was made.
- Works on a phone as well as on a desktop. Every screen has a clear back button and nothing is lost.
- All videos are listed with a thumbnail, their stage and their date; open any draft and carry on.

## What is new to build (and what already exists)

| Part | Exists | New |
|---|---|---|
| Idea box, reference video, own photos and clips | yes | small layout update |
| AI proposal with tap-to-change chips and at most two questions | | new |
| Types (7) and styles (7) as separate choices with example pictures | 4 kinds | new, plus one example picture per style made once |
| Voiceover on/off, voice samples | voices | on/off switch, 3 sample clips made once |
| Captions on/off, 3 looks, 2 positions | always-on subtitles | new, including word-by-word highlight |
| Brand colours and logo end card | brand colour on the dot only | new |
| Storyboard drag, duplicate, split, merge, lock, undo | edit, add, remove | new |
| Restyle all or one scene, two picture options per redraw | redraw one | new |
| Free in-browser storyboard preview | | new |
| Progress steps, ready-to-post pack (captions and hashtags) | player, download | new |
| Draft list with thumbnails | list | thumbnails and dates |

## How it is checked before Funkai sees it

- Tests for every new piece (proposal parsing, styles, captions, arrange actions, restyle, pack).
- A full video made in each of the 7 styles on the live site, looked at frame by frame, voice checked against the
  script (transcribed), captions checked for timing.
- Phone and desktop screenshots of every screen, both themes, checked one by one.
- Testing cost: about $3 to $4 of OpenRouter (pictures are the main cost: 7 styles times about 5 pictures, plus the
  example pictures and voice samples made once). Logged in the expenses.

## Time

About 4 to 6 hours of building and checking. Shipped in one deploy at the end, after every check passes.
