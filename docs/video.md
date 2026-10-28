# Make a video

The product doc's video rule (section 3, "Output rule: match the task, and stage the video"): video is never made in
one jump, and the person approves each stage before the next one costs more. `/app/video` does exactly that, in the
flow Funkai described on 28 Oct (version 2, `docs/video-v2-plan.md`): the idea, the AI suggests the settings and the
person confirms them, the storyboard is drafted and arranged, then the video is made and arrives ready to post.

| Step | What happens | Cost |
|---|---|---|
| 1. The idea | One box ("What do you want to make a video about?") with example ideas to tap. Optional: a reference video ("make it like this") and the person's own photos and clips, which go on the first scenes in the order picked. "Continue". | Nothing |
| 2. The proposal | `proposal.ts` reads the idea (and the reference and the default Brand Brain when there are some) in one call on the catalog's `text-fast` route and answers strict JSON: type, style, voiceover and voice, captions with look and position, length, format, mood, one sentence, one line on why, and at most two questions with tap answers when the idea is unclear. Read strictly; anything out of range takes the default, and an unreadable answer gives the default proposal ("A safe start"). Every setting is a chip to change. "Looks good, plan it". | Free to the person (about $0.0005), counted into the plan's price; 40 a person an hour |
| 3. The plan | `planner.ts` turns the idea, the settings and the answers into 4, 6 or 8 scenes on `text-standard` with a word budget for the length: what is said, what each picture shows, a few words on screen. Or a pasted script, or a Script Writer result ("Make this into a video"). | One small job (about $0.007) |
| 4. The storyboard | Drawn scene by scene, three at a time (`drawScene`, a per-video lock keeps pictures landing together from undoing each other), in the video's style. Then arrange it: drag a card (up and down buttons on a phone), duplicate, split at a sentence break, merge with the next, lock, delete, add, undo the last 10 changes (kept on the video). Restyle the whole video (only unlocked pictures that are not the person's own are drawn again, price shown first) or one scene's look. "Draw again" makes two pictures side by side to pick from. Use your own photo or clip on any scene. A free preview plays the pictures (or the motion graphics) with their timing and captions in the browser, no voice. A running total at the top: scenes, length, what the video step costs. Every field saves when it is left. | Pictures only: one job per picture, two options as one job, a restyle as one job |
| 5. The video | "Make the video" with its price and time. The voiceover per scene on `audio-standard` (kept per scene's words and voice, so making it again only records what changed), the cut or the motion graphics render, then the captions and the brand's end card. The progress bar shows the real steps (voice, scenes, captions, done) from the status route. Then the player, the MP4, and the ready-to-post pack: Caption Writer and Hashtag Optimizer runs from the script through the normal app API (priced first, charged as normal runs), each line with a copy button. "Change something" goes back to the storyboard with everything kept. | One credit job; the pack is two normal runs |

All videos are listed with a thumbnail (the first picture, or the first motion graphics frame), their stage and their
date; open any draft and carry on.

Credits work like the Brand Brain's AI read: estimated and shown on the button first, held before the call, settled
to what it really cost, refunded when nothing was made. Without billing (a local app, or with credits switched off)
it runs free. Measured on 27 Oct: one picture about $0.067, the voice about $0.0004 a scene, the cut free; a
four-scene video about $0.27 and 25 seconds.

**Switch.** `WOVI_VIDEO=on` shows it to everyone, `off` to nobody; anything else (the default) to builders only.

## Types and styles

Two separate choices (`styles.ts`). The **type** is what the video is for: Explainer, Product feature, Teaser, Story,
Ad, Tutorial, Announcement; it shapes the plan. The **style** is how it looks, and carries its own picture rules and
its own motion in the cut:

| Style | Pictures | Motion |
|---|---|---|
| 3D | Clean 3D animated render, soft light, rounded shapes | lively |
| 2D | Flat vector illustration, bold colours | lively |
| Realistic | Natural phone photo | slow |
| Hyperrealistic | Cinematic, high detail, dramatic light, shallow depth of field | slow |
| Comic | Comic panel, ink lines, halftone dots, original characters, no speech bubbles or words | a push-in every scene |
| Motion graphics | None: the minimal motion engine (below) | drawn frame by frame |
| Pixel | 16-bit pixel art, limited palette | still, scaled by whole pixels, hard cuts |

Every picture keeps `PICTURE_RULES`: no text, logos or watermarks; no real or famous person; no trademarks, brand
names or known characters. Each style card shows an example picture (`public/video-styles/`, all of the same café
table so only the look differs) and each voice a sample (`public/video-voices/`), both made once by
`scripts/video-samples.ts` (about $0.40).

## Captions and the brand

Captions (`captions.ts`) have three looks, Clean (a few words, white with an outline), Bold (big words, the one being
said lights up) and Minimal (small, quiet words), at the bottom or in the middle. The voice model gives no word
timing, so each word gets a share of its clip's measured speech time by its length, with a short pause after a comma
or a full stop; without a voice, the words run at a reading pace. The same cues drive the browser preview and the
video: each cue is drawn once as a transparent frame (resvg with the Outfit fonts) and laid over the made video as a
track in the finish pass (`finish.ts`), so a picture video and motion graphics get the same captions. Motion graphics
keeps them at the bottom and moves its drawing up to leave room on square and wide frames.

"Use my Brand Brain" (on by default when the workspace has one): the plan reads the brand's words, the pictures its
niche and mood board, the words on screen and the motion graphics shapes take its colour, the lit caption word takes
its colour when it has a real one (never a cream or a grey), and an end card (2.5 seconds) shows its name in its own
colours, with its logo above when the mood board has an image whose note or file name says "logo".

## Old videos

Version 1 saved one `kind` instead of a type and a style. `normalizeBrief` reads it on every load: minimal motion
becomes Motion graphics, the infographic 2D, the product video and the teaser Hyperrealistic, "something else" keeps
the person's own words for the pictures, and captions stay off where version 1 had no subtitles. Scenes get stable
ids once. Old videos open, change and render like new ones.

## Code

`src/lib/video/styles.ts` (types, styles, voices, caption looks, brand colour roles), `proposal.ts`, `planner.ts`,
`studio.ts` (the stages, arranging, undo, restyle, options, the voice cache, the render progress, credits, limits: 30
media jobs a person an hour, 120 a workspace a day), `media.ts` (OpenRouter images and voice, the ffmpeg cut, the fake
for tests), `captions.ts`, `finish.ts`, `motion.ts` and `motion-render.ts`, `pack.ts` (the post pack), `server.ts`;
`src/app/app/video/` (the pages, the actions, the status route the progress polls, and the file route, which answers
byte ranges because Safari on a phone only plays video that way) and `src/components/video/`.

**Later, per the doc.** A cloned "my voice" needs documented consent first, so it is not offered. The long-to-short
clipper is P1.

## Minimal motion (the Motion graphics style)

The look Funkai pointed to with his reference: a calm frame, one short line on top, a shape that draws itself (circle,
dotted circle, square, triangle, lines being written, wave, rays in a circle, a line with dots), a glowing dot that
rides it with a hand close behind, and the answer below. No pictures: the plan is the storyboard. The model only
picks the words and the shape (`MINIMAL_RULES` in `planner.ts`); every frame is SVG made by `motion.ts` from those
fields (the same function draws the preview on the page), rasterised by resvg with the Outfit fonts in
`assets/fonts` and piped into ffmpeg (`motion-render.ts`), 30 frames a second, with each scene's voice padded to its
length. Voiceover off gives the text-only look. The dot takes the brand's colour. Measured on 27 Oct: a 34 second
video renders in about 75 seconds on a laptop; the plan costs about $0.005 and the voice well under a cent.

## Your own photos and clips, and "make it like this"

Each scene of a picture video takes the person's own photo (JPG, PNG, WebP) or clip (MP4, MOV, WebM, up to 40 MB and
two minutes) instead of the drawn picture; the rights box is required and kept (`video_scene` in the safety store).
A clip's first second is its poster, and the cut uses the clip itself, looped or trimmed to the scene. Drawing the
scene again puts the AI picture back. A restyle never redraws the person's own photo or clip.

"Make it like this" on the idea screen reads a video the person likes (`reference.ts`): six frames to
`text-standard`, which answers the closest style, the mood, three colours, the pace and one or two sentences on the
look. The proposal starts from that style and mood; the plan follows the pace and feel, the pictures the look, and
motion graphics the colours. Only the style is described; the clip and its frames are not kept. Measured on 27 Oct:
about $0.006 a read. It is one small credit job (`paidJob`).
