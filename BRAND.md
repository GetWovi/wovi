# WOVI brand and design system (phase 1)

WOVI is a marketplace of single-purpose AI agents for social content. The brand is a flowing wordmark whose w is the mascot, Wovi. The product is night-first: dark by default, with a light alternate.

Everything is built from tokens in `src/styles/tokens.css`. Never by eye.

## Tokens

| Token | Night (default) | Light | Use | CSS variable |
|---|---|---|---|---|
| Background | `#0B1230` | `#FFF4DC` | App ground | `--bg` |
| Surface | `#141D44` | `#FFFFFF` | Cards, panels, sheets | `--surface` |
| Line | `#2A3668` | `#E8D9B5` | Borders, dividers | `--line` |
| Text | `#FFF4DC` | `#0B1230` | Body and headings | `--text` |
| Text muted | `#A9B3D9` | `#3A4468` | Captions, helper text | `--text-muted` |
| Blaze (primary) | `#FF5A1F` | `#FF5A1F` | Logo, primary buttons, key moments | `--blaze` |
| Cobalt (accent) | `#1F4DFF` | `#1F4DFF` | Fills, secondary buttons, highlights | `--cobalt` |
| Cobalt Glow | `#7C97FF` | `#1F4DFF` | Cobalt used as text or links on night | `--cobalt-glow` |

Derived tokens, so the rules below never have to be remembered by hand:

- `--on-blaze` is Night. Text on a Blaze fill is always Night (5.9:1). Cream on Blaze is 2.9:1 and is never used.
- `--on-cobalt` is Cream (5.4:1 on Cobalt).
- `--link` is Cobalt Glow on night (6.8:1) and Cobalt on light (5.4:1). Cobalt as text on Night is 3.1:1 and is never used.
- `--blaze-text` is Blaze on night (5.9:1) and Blaze Deep `#BF3E0E` on light (4.9:1), because Blaze as text on Cream is only 2.9:1. Fills always stay `#FF5A1F`.
- `--mascot-ink` is Cream on night and Night on light. It colours the mascot's face and limbs.

`npm run check:contrast` measures every pair in use and fails if one drops under its minimum. The `/design` page shows the same ratios.

The file also defines radii (`--r-sm` 10, `--r-md` 16, `--r-lg` 24, `--r-xl` 32, `--r-pill`), a spacing scale (`--s-1` 4px to `--s-9` 96px), shadows, motion durations (`--t-fast` 120ms, `--t-base` 200ms, `--t-slow` 320ms, `--ease`, `--ease-bounce`) and the type scale (`--fs-xs` 12px to `--fs-5xl`).

Theme switching: `<html data-theme="night|light">`. An inline script in `src/app/layout.tsx` applies the saved choice (`localStorage` key `wovi-theme`) or the system preference before paint. `ThemeToggle` switches and remembers; storage access is wrapped in try/catch.

## Logo

The wordmark reads **wovI**: lowercase w, o, v, then a tall capital I. The letters overlap slightly so the word is one flowing line: the w tucks into the o, the o touches the v, the v touches the I. The w is the mascot and carries the face.

Versions (components in `src/components/brand/Wordmark.tsx`, files in `public/brand/`):

| Version | Letters | Ground | Use | File |
|---|---|---|---|---|
| Primary | Blaze | Night | Header, splash, social banners | `wordmark-primary.svg` |
| Light mode | Blaze | Cream | Light surfaces, print | `wordmark-light.svg` |
| Night on Blaze | Night | Blaze | Colour moments, merch, stickers | `wordmark-night-on-blaze.svg` |
| Cream on Cobalt | Cream | Cobalt | Accent surfaces, partner tiles | `wordmark-cream-on-cobalt.svg` |

Each file includes its ground and the clearspace. The `-transparent` files hold the letters alone. In the app chrome, `<Wordmark variant="theme" />` draws Blaze letters with a face that follows the theme.

Mascot only (`src/components/brand/Mark.tsx`): the w alone, for anything below 80px wide, avatars, the app icon and the favicon. Files: `mark-on-night.svg`, `mark-on-light.svg`, `app-icon.svg`, `app-icon-512.png`, `app-icon-192.png`, `favicon.svg`, `favicon-32.png`, `favicon-16.png`, `favicon.ico`. Social banner: `og-banner.svg` and `og-banner.png` (1200 x 630).

Rules:

- Keep the height of the o free on every side of the wordmark.
- Never respace, outline, stretch or recolour the letters.
- The face uses Cream where the ground is dark and Night where it is light. Blaze letters take the ink of the surface they sit on.
- Below 28px the face is dropped and the w stays a clean letter.

## Mascot: Wovi

A rounded w with a closed-eye smile and cheeks, with thin arms and legs that appear in poses. Component: `src/components/brand/Mascot.tsx`. Limbs, face and outlines use Cream on night and Night on light (`ink="auto"` follows the theme; pass `ink="cream"` or `ink="night"` when the surface differs).

| Pose | Product state |
|---|---|
| `walking` | A job is running or loading |
| `waving` | Onboarding, welcome, empty states |
| `sleeping` | An agent idle, waiting for a job |
| `celebrating` | A job done, a credit reward lands |
| `standing` | Neutral, when no state applies |

Sizes from 24px to 320px. Each pose has gentle CSS motion (`src/styles/mascot.css`): walking bobs and swings, waving waves from the shoulder, sleeping breathes with drifting z's, celebrating hops with confetti. Motion never blocks a job and is off under `prefers-reduced-motion`. Pass `animate={false}` for a still.

Static files for every pose and ground: `public/brand/mascot-<pose>-on-night.svg` and `-on-light.svg`.

## Type and shape

Outfit (Regular 400, Medium 500, SemiBold 600, Bold 700) for headlines and interface, self-hosted through `next/font/google` at build time. Headlines tight (line-height 1.05 to 1.2, slight negative tracking), body relaxed (1.5).

Shapes are round and bold: large radii, 2px to 3px strokes, icons on a 24 grid with a 2.5 stroke and round caps. No hairlines.

## Components

All in `src/components/ui/`, styled with CSS modules on the tokens.

| Component | Notes |
|---|---|
| `Button`, `ButtonLink` | `primary` Blaze with Night text, `secondary` Cobalt with Cream text, `ghost` outlined. Sizes `sm`, `md`, `lg`. `loading` shows Wovi walking and blocks clicks. `ButtonLink` is the same look for navigation. |
| `Card` | `raised` (default), `outlined`, `tint` (soft Cobalt). `interactive` lifts on hover. Optional `title` and `actions`. |
| `Input`, `Textarea`, `Select` | Label, hint, error (Blaze text, with an icon), `leading` icon, disabled. |
| `Chip`, `Tag` | Chips select (`selected`, Cobalt fill) or remove (`onRemove`). Tags label, in `neutral`, `blaze` or `cobalt`. |
| `Badge` | A score 0 to 100 as a ring. 85 and up Blaze, 70 and up Cobalt, else neutral. |
| `Toggle` | Switch with label and description; on is Cobalt. |
| `Tabs` | `pill` or `line`, keyboard arrows, optional counts. |
| `Modal`, `Sheet` | Escape, overlay or the close button dismiss. Sheet slides from the bottom, or the right with `side="right"` on wide screens. |
| `Toast` | `ToastProvider` wraps the app; `useToast().toast({ tone, title, description })`. Success shows Wovi celebrating. |
| `EmptyState` | Wovi waving with a title, text and an action. |
| `JobRow` | One job with its agent; `running`, `idle` and `done` use the walking, sleeping and celebrating poses. |
| `CreditPill` | A credit amount with the w mark as the coin; `balance`, `cost` or `reward`. |
| `Avatar` | Initials in a stable palette colour, an image, or the w mark for agents. |
| `StatTile` | Label, value, delta and hint; `emphasis` is a Blaze tile for the one number that matters. |
| `ThemeToggle` | Night and light switch. |
| `Icon` | The bold icon set. |

The `/design` page shows every component in its states on both themes.

## Scripts

- `npm run dev` on port 3900, `npm run build`, `npm start`, `npm run lint`
- `npm run brand:svg` writes the SVG files in `public/brand/` from the React components
- `npm run brand:png` renders the PNG and ICO files with headless Chrome
- `npm run check:contrast` measures the contrast pairs

## Copy rules

Plain English, no em dashes, no lorem ipsum, no invented numbers or customer claims. Example agent names: Hook Writer, Caption Writer, Trend Scout, Script Writer, Hashtag Picker, Repurposer.
