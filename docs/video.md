# Make a video

The product doc's video rule (section 3, "Output rule: match the task, and stage the video"): video is never made in
one jump, and the person approves each stage before the next one costs more. `/app/video` does exactly that.

| Stage | What happens | Cost |
|---|---|---|
| 1. Script | Scenes from a Script Writer result ("Make this into a video" on the result) or a pasted script, one scene per paragraph, at most 8. | Free |
| 2. Storyboard | One 9:16 picture per scene on the catalog's `image-standard` route, drawn from what the scene shows and the default Brand Brain's niche and mood board. No text, no real or famous person. | One credit job for all pictures |
| 3. Approve | Change any scene's words, what it shows or its seconds; draw one picture again; pick a voice (warm, calm, bright). | Free, a redraw is one small job |
| 4. Video | The voiceover per scene on the `audio-standard` route, each picture held as long as its words take (at least its own seconds), cut by ffmpeg into a 1080x1920 H.264 MP4 with AAC sound. Play it, download it. | One credit job |

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
