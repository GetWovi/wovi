# Make a video

The product doc's video rule (section 3, "Output rule: match the task, and stage the video"): video is never made in
one jump, and the person approves each stage before the next one costs more. `/app/video` does exactly that.

| Stage | What happens | Cost |
|---|---|---|
| 1. Plan | The guided start (Funkai's flow): the idea, then the kind of video (2D animated infographic, hyper-realistic product video, teaser, or the person's own words), then the vibe (fun, calm, bold, premium), the length (15, 30, 60 seconds) and the format (9:16, 1:1, 16:9). `planner.ts` turns them into 4, 6 or 8 scenes on `text-standard` with the default Brand Brain as material: what is said, what each picture shows, a few words on screen. Or a pasted script, or a Script Writer result ("Make this into a video"). | One small job (about $0.007), the others free |
| 2. Storyboard | Drawn scene by scene, three at a time, each picture shown as it lands (`drawScene`, one small job each; a per-video lock keeps pictures landing together from undoing each other). One picture per scene in the video's format and the kind's style (`styleFor`) on the catalog's `image-standard` route, drawn from what the scene shows and the default Brand Brain's niche and mood board. No text, no real or famous person. | One credit job for all pictures |
| 3. Approve | Every field saves when it is left; add or remove scenes; change any scene's words, what it shows, its words on screen or its seconds; draw one picture again; pick a voice (warm, calm, bright). | Free, a redraw is one small job |
| 4. Video | The voiceover per scene on the `audio-standard` route, each picture held as long as its words take (at least its own seconds), cut by ffmpeg in the format asked (1080x1920, 1080x1080 or 1920x1080) with the kind's motion (slow, lively or a punchy push-in), the words on screen as a headline that fades in, and subtitles timed to the voice (not on a teaser). Play it, download it. | One credit job |

Credits work like the Brand Brain's AI read: estimated and shown on the button first, held before the call, settled
to what it really cost, refunded when nothing was made. Without billing (a local app, or with credits switched off)
it runs free. Measured on 27 Oct: one picture about $0.067, the voice about $0.0004 a scene, the cut free; a
four-scene video about $0.27 and 25 seconds.

**Switch.** `WOVI_VIDEO=on` shows it to everyone, `off` to nobody; anything else (the default) to builders only.

**Code.** `src/lib/video/media.ts` (OpenRouter images and voice, the ffmpeg cut, and the fake for tests),
`studio.ts` (the stages, credits, limits: 30 media jobs a person an hour, 120 a workspace a day), `server.ts`,
`src/app/app/video/` (the pages, the actions, and the file route, which answers byte ranges because Safari on a
phone only plays video that way) and `src/components/video/`.

**Later, per the doc.** A cloned "my voice" needs documented consent first, so it is not offered. Subtitles burned
into the video and the long-to-short clipper are P1.

## Minimal motion

The kind Funkai pointed to with his reference: a calm frame, one short line on top, a shape that draws itself (circle,
dotted circle, square, triangle, lines being written, wave, rays in a circle, a line with dots), a glowing dot that
rides it with a hand close behind, and the answer below. No pictures: the plan is the storyboard. The model only
picks the words and the shape (`MINIMAL_RULES` in `planner.ts`); every frame is SVG made by `motion.ts` from those
fields (the same function draws the preview on the page), rasterised by resvg with the Outfit fonts in
`assets/fonts` and piped into ffmpeg (`motion-render.ts`), 30 frames a second, with each scene's voice padded to its
length. "No voice" gives the text-only look. The dot takes the brand's colour: the first colour swatch on the default
Brand Brain's mood board. Measured on 27 Oct: a 34 second video renders in about 75 seconds on a laptop; the plan
costs about $0.005 and the voice well under a cent.

## Your own photos and clips, and "make it like this"

Each panel of a picture video takes the person's own photo (JPG, PNG, WebP) or clip (MP4, MOV, WebM, up to 40 MB and
two minutes) instead of the drawn picture; the rights box is required and kept (`video_scene` in the safety store).
A clip's first second is its poster, and the cut uses the clip itself, looped or trimmed to the scene. Drawing the
scene again puts the AI picture back.

"Like my reference video" on the kind step reads a video the person likes (`reference.ts`): six frames to
`text-standard`, which answers the closest kind, the vibe, three colours, the pace and one or two sentences on the
look. The brief keeps it: the plan follows the pace and feel, the pictures follow the look, and minimal motion takes
the colours. Only the style is described; the clip and its frames are not kept. Measured on 27 Oct: about $0.006 a
read. It is one small credit job (`paidJob`).
