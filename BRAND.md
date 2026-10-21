# WOVI brand and design system (phase 1)

WOVI is a marketplace of single-purpose AI agents for social content: one agent, one job. The brand comes from Funkai's boards: night first, Blaze orange on a deep navy, cobalt as the second voice, big rounded panels, Outfit, and the w as the mascot.

Everything is built from the tokens in `src/styles/tokens.css`. Never by eye.

## Tokens

One theme file holds both themes. Night is the default; light switches on with `<html data-theme="light">`.

| Token | Night (default) | Light | Use | CSS variable |
|---|---|---|---|---|
| Background | `#0B1230` | `#FFF4DC` | App ground | `--bg` |
| Surface (Raised) | `#141D44` | `#FFFFFF` | Cards, panels, sheets | `--surface` |
| Surface alt | `#1C2760` | `#FFF9EA` | Alternating panels | `--surface-alt` |
| Line | `#2A3668` | `#E8D9B5` | Borders, dividers | `--line` |
| Text | `#FFF4DC` | `#0B1230` | Body and headings | `--text` |
| Text muted | `#A9B3D9` | `#3A4468` | Captions, helper text | `--text-muted` |
| Blaze (primary) | `#FF5A1F` | `#FF5A1F` | Logo, primary buttons, key moments | `--blaze` |
| Cobalt (accent) | `#1F4DFF` | `#1F4DFF` | Fills, secondary buttons, highlights | `--cobalt` |
| Cobalt Glow | `#7C97FF` | `#1F4DFF` | Cobalt as text, lines and stickers on night | `--cobalt-glow` |

Derived tokens carry the contrast rules so nobody has to remember them:

- `--on-blaze` is Night. Text on a Blaze button is always Night (about 5.6:1). Cream on Blaze (2.9:1) is never used for text.
- `--on-cobalt` is Cream (5.4:1).
- `--link` is Cobalt Glow on night and Cobalt on light. Cobalt as text on Night (2.9:1) is never used.
- `--blaze-text` is Blaze on night and Blaze Deep `#BF3E0E` on light, because Blaze on Cream is only 2.9:1. Fills stay `#FF5A1F`.
- `--mascot-ink` is Cream on night and Night on light. It colours the mascot's limbs.
- `--hairline` and `--hairline-strong` are the panel borders (translucent text colour).

`npm run check:contrast` measures every pair and fails if one drops under its minimum. `/design` shows the same ratios.

The file also holds radii (`--r-sm` 12, `--r-md` 18, `--r-lg` 28, `--r-xl` 40, `--r-pill`), the spacing scale (`--s-1` 4px to `--s-9` 96px), motion (`--t-fast` 120ms, `--t-base` 200ms, `--t-slow` 320ms, `--ease`, `--ease-bounce`) and the type scale (`--fs-xs` 12px to `--fs-5xl`).

Theme switching: an inline script in `src/app/layout.tsx` applies the saved choice (`localStorage` key `wovi-theme`) or the system preference before paint. `ThemeToggle` switches and remembers.

## Logo

The wordmark is WOVI in chunky rounded strokes. The w is the mascot: three soft bumps on top, two rounded legs, a sleeping face (two closed-eye arcs, a small smile) and cobalt cheeks. O, V and I are geometric with fully rounded ends and the same stroke weight. The letters overlap slightly so the word reads as one line.

**The files in `public/brand/` are stand-ins** drawn from `src/brand/geometry.ts` and `src/brand/placeholder.tsx` until Funkai's final art is cropped in. The site shows the logo only through `src/components/brand/Logo.tsx`, which reads these files, so swapping the logo is a file swap:

| File | What it is |
|---|---|
| `public/brand/wovi-wordmark.svg` | Blaze letters, cream face. Night grounds (header, footer). |
| `public/brand/wovi-wordmark-on-light.svg` | Blaze letters, night face. Cream and white grounds (light mode). |
| `public/brand/wovi-wordmark-night.svg` | Night letters. For a Blaze ground. |
| `public/brand/wovi-wordmark-cream.svg` | Cream letters. For a Cobalt ground. |
| `public/brand/wovi-mark.svg`, `-on-light`, `-night`, `-cream` | The w alone, same four colourings. Used below 80px wide, avatars, credit pills. |
| `public/favicon.ico`, `public/brand/favicon.svg`, `favicon-32.png`, `favicon-16.png` | Favicon. |
| `public/brand/app-icon.svg`, `app-icon-512.png`, `app-icon-192.png` | App icon (Night tile, Blaze w). |
| `public/brand/og-banner.svg`, `og-banner.png` | Social banner, 1200 x 630. |
| `public/brand/wovi-wordmark-*-ground.svg` | The four versions with their ground and clearspace, for hand-off only. |

Replace the files, keep the names, and the header, footer, design page, favicon and OG image all update. `src/components/brand/Logo.tsx` holds the path list (`LOGO_FILES`); `src/app/layout.tsx` reads the favicon, app icon and OG paths from it. Transparent SVGs with the letters only are expected for the wordmark and mark files; the `<img>` is sized by height, so any aspect ratio works.

Versions, as on the board:

| Version | Colours | Where |
|---|---|---|
| Primary | Blaze on Night | App header, splash, social banners |
| Light mode | Blaze on Cream | Light theme, documents |
| Colour variants | Night on Blaze, Cream on Cobalt | Campaign graphics, merch |
| Mascot only | The w alone | Below 80px wide, avatars, app icon, favicon |

Rules: keep the height of the o free on every side; never respace, outline, stretch or recolour the wordmark; below 80px wide use the w alone.

## Mascot: the w is Wovi

Wovi is the w with thin arms and legs (round-ended lines, little curled feet) in four poses. Component: `src/components/brand/Mascot.tsx`, geometry in `src/brand/geometry.ts`, motion in `src/styles/mascot.css`. The body stays Blaze; the face is Cream with Cobalt cheeks; limbs follow `--mascot-ink` (Cream on night, Night on light) or an explicit `ink="cream" | "night"`.

| Pose (`pose` prop) | Board name | Product state |
|---|---|---|
| `move` | On the move (walking) | A job is running or loading |
| `hello` | Hello (waving) | Onboarding, welcome, empty states |
| `wait` | Waiting for a job (sleeping, zz) | An agent is idle, waiting for a job |
| `done` | Job done (celebrating, sparkle) | A job is done, a credit reward lands |

`size` is the rendered width (24 to 320px). Each pose has gentle motion: every pose breathes; move bobs and swings the legs; hello waves and sways; wait breathes slowly while the z's float; done hops with the arms lifting and the sparkle twinkling. Motion never blocks a job and is off under `prefers-reduced-motion`. `animate={false}` gives a still.

Static files for each pose: `public/brand/mascot-<pose>-on-night.svg` and `-on-light.svg`.

Accents (`src/components/brand/Accents.tsx`): `Sticker` is the hand-drawn-feeling outlined pill in Cobalt Glow ("one agent", "one job"), tilted a few degrees; `Sparkle` is the four-point star.

## Type and style

Outfit (Regular 400, Medium 500, SemiBold 600, Bold 700) for headlines and interface, loaded through `next/font/google`. Headlines are cream, bold and tight; eyebrows are small, Blaze, letter-spaced uppercase (`.eyebrow` in `globals.css`); secondary text is the muted lavender-gray.

Flat and round: big raised panels (28 to 40px radius) with a hairline border on night, no gradients for their own sake. Icons are bold (24 grid, 2.5 stroke, round caps), never thin hairlines. Buttons and chips are pills. Panels alternate Surface and Surface alt; Blaze and Cobalt panels are the colour moments (on a Blaze panel do not place the mascot, its body disappears).

## Components

All in `src/components/ui/`, styled with CSS modules on the tokens. Button (primary Blaze with Night text, secondary Cobalt with Cream text, ghost; `loading` shows Wovi on the move), Card, Input, Textarea, Select, Chip, Tag, Badge, Toggle, Tabs, Modal, Sheet, Toast (success shows Wovi, job done), EmptyState (Wovi says hello), JobRow (running, waiting and done use move, wait and done), CreditPill (the w mark as the coin), Avatar (the w mark for agents), StatTile, ThemeToggle, Icon and BrandIcon (GitHub and X). `/design` shows every component in its states on both themes.

## Homepage

`/` is the launch site, built like the boards: night ground, large rounded panels, orange eyebrows, cream headlines, the mascot poses as the storytelling. Sections in `src/components/home/`: the hero (Wovi saying hello with the stickers and a sparkle), a job start to finish (a deterministic demo of three agents with their states), how a post is made (five stage panels, Wovi walks the rail on scroll), Brand Brain, the agents (eight cards and the three states), anti-slop review, MCP and API, creators, and the closing on a Cobalt panel with the footer. Motion is GSAP ScrollTrigger reveals; everything is fully visible under `prefers-reduced-motion`.

## Scripts

- `npm run dev` on port 3900, `npm run build`, `npm start`, `npm run lint`
- `npm run brand:svg` writes the stand-in SVG files in `public/brand/` from the geometry (skip once the final files are in)
- `npm run brand:png` renders the PNG and ICO files from the SVGs with headless Chrome
- `npm run check:contrast` measures the contrast pairs
- `node scripts/screenshots.mjs` takes screen-sized screenshots of the running site with headless Chrome

## Copy rules

Plain English, short. No em dashes, no lorem ipsum, no invented numbers or customer claims. Claim only what the product does. No fees, splits, percentages or token talk on the site. Early access is a mailto link.
