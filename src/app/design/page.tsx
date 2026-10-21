import type { Metadata } from "next";
import type { Pose } from "@/brand/geometry";
import { Mascot } from "@/components/brand/Mascot";
import { AppIcon, Mark } from "@/components/brand/Mark";
import { Wordmark, WORDMARK_VARIANTS, type WordmarkVariant } from "@/components/brand/Wordmark";
import { SiteFooter, SiteHeader } from "@/components/site/SiteHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Chip";
import { CreditPill } from "@/components/ui/CreditPill";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { Icon, ICON_NAMES } from "@/components/ui/Icon";
import { JobRow } from "@/components/ui/JobRow";
import { StatTile } from "@/components/ui/StatTile";
import { Toast } from "@/components/ui/Toast";
import { contrastRatio, formatRatio, wcagLevel } from "@/lib/contrast";
import { ChipDemo, LoadingButtonDemo, OverlayDemo, TabsDemo, ToastDemo, ToggleDemo } from "./demos";
import styles from "./design.module.css";

export const metadata: Metadata = { title: "Design system" };

const SECTIONS = [
  ["logo", "Logo"],
  ["mascot", "Mascot"],
  ["colour", "Colour"],
  ["type", "Type"],
  ["shape", "Shape and motion"],
  ["components", "Components"],
] as const;

const TOKENS: { name: string; night: string; light: string; use: string; variable: string }[] = [
  { name: "Background", night: "#0B1230", light: "#FFF4DC", use: "App ground", variable: "--bg" },
  { name: "Surface", night: "#141D44", light: "#FFFFFF", use: "Cards, panels, sheets", variable: "--surface" },
  { name: "Line", night: "#2A3668", light: "#E8D9B5", use: "Borders, dividers", variable: "--line" },
  { name: "Text", night: "#FFF4DC", light: "#0B1230", use: "Body and headings", variable: "--text" },
  { name: "Text muted", night: "#A9B3D9", light: "#3A4468", use: "Captions, helper text", variable: "--text-muted" },
  { name: "Blaze", night: "#FF5A1F", light: "#FF5A1F", use: "Logo, primary buttons, key moments", variable: "--blaze" },
  { name: "Cobalt", night: "#1F4DFF", light: "#1F4DFF", use: "Fills, secondary buttons, highlights", variable: "--cobalt" },
  { name: "Cobalt Glow", night: "#7C97FF", light: "#1F4DFF", use: "Cobalt as text or links on night", variable: "--cobalt-glow" },
  { name: "Blaze Text", night: "#FF5A1F", light: "#BF3E0E", use: "Derived: Blaze as text; deeper on light", variable: "--blaze-text" },
];

const PAIRS: { label: string; fg: string; bg: string; rule: "use" | "never" }[] = [
  { label: "Text on Background (night)", fg: "#FFF4DC", bg: "#0B1230", rule: "use" },
  { label: "Text muted on Background (night)", fg: "#A9B3D9", bg: "#0B1230", rule: "use" },
  { label: "Text on Surface (night)", fg: "#FFF4DC", bg: "#141D44", rule: "use" },
  { label: "Night text on a Blaze button", fg: "#0B1230", bg: "#FF5A1F", rule: "use" },
  { label: "Cream text on a Blaze button", fg: "#FFF4DC", bg: "#FF5A1F", rule: "never" },
  { label: "Cream text on a Cobalt fill", fg: "#FFF4DC", bg: "#1F4DFF", rule: "use" },
  { label: "Cobalt Glow as text on Night", fg: "#7C97FF", bg: "#0B1230", rule: "use" },
  { label: "Cobalt as text on Night", fg: "#1F4DFF", bg: "#0B1230", rule: "never" },
  { label: "Blaze as text on Night", fg: "#FF5A1F", bg: "#0B1230", rule: "use" },
  { label: "Text on Background (light)", fg: "#0B1230", bg: "#FFF4DC", rule: "use" },
  { label: "Text muted on Background (light)", fg: "#3A4468", bg: "#FFF4DC", rule: "use" },
  { label: "Cobalt as text on Cream (light)", fg: "#1F4DFF", bg: "#FFF4DC", rule: "use" },
  { label: "Blaze as text on Cream (light)", fg: "#FF5A1F", bg: "#FFF4DC", rule: "never" },
  { label: "Blaze Text (deep) on Cream (light)", fg: "#BF3E0E", bg: "#FFF4DC", rule: "use" },
];

const POSES: { pose: Pose; state: string; when: string }[] = [
  { pose: "walking", state: "Walking", when: "A job is running or loading" },
  { pose: "waving", state: "Waving hello", when: "Onboarding, welcome, empty states" },
  { pose: "sleeping", state: "Sleeping", when: "An agent idle, waiting for a job" },
  { pose: "celebrating", state: "Celebrating", when: "A job done, a credit reward lands" },
];

const TYPE_SCALE: { token: string; px: number; weight: number; sample: string }[] = [
  { token: "--fs-5xl", px: 80, weight: 700, sample: "Your vision." },
  { token: "--fs-4xl", px: 48, weight: 700, sample: "Agents that execute it" },
  { token: "--fs-3xl", px: 36, weight: 700, sample: "One agent, one job" },
  { token: "--fs-2xl", px: 28, weight: 700, sample: "Hook Writer finished" },
  { token: "--fs-xl", px: 22, weight: 600, sample: "Ten hooks, ranked" },
  { token: "--fs-lg", px: 18, weight: 500, sample: "A caption in your voice for the platform you post on" },
  { token: "--fs-md", px: 16, weight: 400, sample: "Body text. Each agent does one task and does it well, so the result reads like you on a good day." },
  { token: "--fs-sm", px: 14, weight: 500, sample: "Helper text, labels and metadata" },
  { token: "--fs-xs", px: 12, weight: 600, sample: "TAGS AND FINE PRINT" },
];

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={styles.section} aria-labelledby={`${id}-title`}>
      <div className={styles.sectionHead}>
        <h2 id={`${id}-title`}>{title}</h2>
        {intro && <p className={styles.intro}>{intro}</p>}
      </div>
      {children}
    </section>
  );
}

function Sub({ title, children, note }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className={styles.sub}>
      <div className={styles.subHead}>
        <h3>{title}</h3>
        {note && <p className={styles.note}>{note}</p>}
      </div>
      {children}
    </div>
  );
}

export default function DesignPage() {
  return (
    <>
      <SiteHeader active="design" />
      <main className="container">
        <header className={styles.pageHead}>
          <Tag tone="blaze">Phase 1</Tag>
          <h1>WOVI design system</h1>
          <p className={styles.lead}>
            Night first, built from tokens. Switch the theme in the header to check every piece on both grounds.
          </p>
          <nav className={styles.jump} aria-label="Sections">
            {SECTIONS.map(([id, label]) => (
              <a key={id} href={`#${id}`} className={styles.jumpLink}>
                {label}
              </a>
            ))}
          </nav>
        </header>

        <Section id="logo" title="Logo" intro="One stroke draws the whole word. The w tucks into the o, the o touches the v, the v touches a tall capital I with slab terminals so it never reads as an l. The w is the same letter Wovi is drawn from.">
          <div className={styles.logoGrid}>
            {(Object.keys(WORDMARK_VARIANTS) as WordmarkVariant[])
              .filter((v) => v !== "theme")
              .map((v) => (
                <figure key={v} className={styles.logoTile}>
                  <Wordmark variant={v} height={150} withBackground className={styles.logoArt} />
                  <figcaption>
                    <strong>{WORDMARK_VARIANTS[v].name}</strong>
                    <span className="muted">{WORDMARK_VARIANTS[v].use}</span>
                  </figcaption>
                </figure>
              ))}
          </div>
          <Sub title="Mascot only" note="Below 80px wide, and for avatars, app icon and favicon, the w stands alone: a clean letter under 32px, the face from 32px up.">
            <div className={styles.markRow}>
              {[16, 24, 32, 48, 64, 80].map((s) => (
                <div key={s} className={styles.markCell}>
                  <Mark size={s} />
                  <span className={styles.caption}>{s}px</span>
                </div>
              ))}
              <div className={styles.markCell}>
                <Mark size={80} face={false} />
                <span className={styles.caption}>Letter only</span>
              </div>
              <div className={styles.markCell}>
                <AppIcon size={96} />
                <span className={styles.caption}>App icon</span>
              </div>
              <div className={styles.markCell}>
                <AppIcon size={48} />
                <span className={styles.caption}>192 / 48</span>
              </div>
              <div className={styles.markCell}>
                <AppIcon size={32} rounded={false} />
                <span className={styles.caption}>Favicon</span>
              </div>
            </div>
          </Sub>
          <Sub title="Rules">
            <ul className={styles.rules}>
              <li>Keep the height of the o free on every side of the wordmark.</li>
              <li>Never respace, outline, stretch or recolour the letters.</li>
              <li>Primary is Blaze on Night. On light surfaces use Blaze on Cream. Night on Blaze and Cream on Cobalt are the colour variants.</li>
              <li>The wordmark is always the clean letters. The face, limbs and outline of Wovi follow the surface: Cream where the ground is dark, Night where it is light.</li>
              <li>Under 32px the mark is the letter alone; the face only appears where it can be seen.</li>
            </ul>
          </Sub>
        </Section>

        <Section id="mascot" title="Mascot" intro="Wovi is the w from the wordmark with a face, a sticker outline, and thin arms and legs that appear in poses. Each pose is a product state.">
          <div className={styles.poseGrid}>
            {POSES.map((p) => (
              <figure key={p.pose} className={styles.poseTile}>
                <Mascot pose={p.pose} size={200} />
                <figcaption>
                  <strong>{p.state}</strong>
                  <span className="muted">{p.when}</span>
                </figcaption>
              </figure>
            ))}
          </div>
          <Sub title="Sizes" note="From 24px to 320px. Below 48px the face is a hint; the pose still reads.">
            <div className={styles.sizeRow}>
              {[24, 32, 48, 64, 96, 160, 240, 320].map((s) => (
                <div key={s} className={styles.markCell}>
                  <Mascot pose="waving" size={s} animate={false} />
                  <span className={styles.caption}>{s}</span>
                </div>
              ))}
            </div>
          </Sub>
          <Sub title="On either ground" note="Limbs, face lines and the outline use Cream on night and Night on light. Pass ink when the surface differs from the theme.">
            <div className={styles.groundRow}>
              <div className={styles.groundNight}>
                <Mascot pose="celebrating" size={120} ink="cream" />
                <span>Cream ink on Night</span>
              </div>
              <div className={styles.groundLight}>
                <Mascot pose="celebrating" size={120} ink="night" />
                <span>Night ink on Cream</span>
              </div>
              <div className={styles.groundCobalt}>
                <Mascot pose="walking" size={120} ink="cream" />
                <span>Cream ink on Cobalt</span>
              </div>
              <div className={styles.groundBlaze}>
                <Mascot pose="sleeping" size={120} ink="night" />
                <span>Night ink on Blaze</span>
              </div>
            </div>
          </Sub>
          <Sub title="Motion" note="Wovi bobs, waves, breathes or hops. Motion never blocks a job and stops under prefers-reduced-motion.">
            <div className={styles.row}>
              {POSES.map((p) => (
                <Mascot key={p.pose} pose={p.pose} size={72} />
              ))}
              <span className="muted">Static:</span>
              {POSES.map((p) => (
                <Mascot key={p.pose} pose={p.pose} size={72} animate={false} />
              ))}
            </div>
          </Sub>
        </Section>

        <Section id="colour" title="Colour" intro="Eight brand tokens plus one derived text token. Blaze is the brand and the primary action; Cobalt fills and highlights; Cobalt Glow carries Cobalt as text on night; Blaze Text carries Blaze as text on light.">
          <div className={styles.swatches}>
            {TOKENS.map((t) => (
              <div key={t.name} className={styles.swatch}>
                <div className={styles.swatchPair}>
                  <span className={styles.swatchChip} style={{ background: t.night }} title={`Night ${t.night}`} />
                  <span className={styles.swatchChip} style={{ background: t.light }} title={`Light ${t.light}`} />
                </div>
                <strong>{t.name}</strong>
                <span className={styles.caption}>
                  <code>{t.night}</code> night
                </span>
                <span className={styles.caption}>
                  <code>{t.light}</code> light
                </span>
                <span className="muted">{t.use}</span>
                <code className={styles.varName}>{t.variable}</code>
              </div>
            ))}
          </div>
          <Sub title="Contrast" note="Measured with WCAG 2 relative luminance. Text on a Blaze button is Night, never Cream. Cobalt as text on Night is too weak; use Cobalt Glow.">
            <div className={styles.contrast}>
              {PAIRS.map((p) => {
                const r = contrastRatio(p.fg, p.bg);
                return (
                  <div key={p.label} className={[styles.pair, p.rule === "never" ? styles.never : ""].filter(Boolean).join(" ")}>
                    <span className={styles.pairSample} style={{ background: p.bg, color: p.fg }}>
                      Aa
                    </span>
                    <span className={styles.pairText}>
                      <span>{p.label}</span>
                      <span className={styles.caption}>
                        {p.fg} on {p.bg}
                      </span>
                    </span>
                    <span className={styles.pairRatio}>
                      <strong>{formatRatio(r)}</strong>
                      <span className={styles.caption}>{wcagLevel(r)}</span>
                    </span>
                    <Tag tone={p.rule === "never" ? "blaze" : "cobalt"}>{p.rule === "never" ? "Never" : "Use"}</Tag>
                  </div>
                );
              })}
            </div>
          </Sub>
        </Section>

        <Section id="type" title="Type" intro="Outfit in Regular, Medium, SemiBold and Bold, self-hosted. Headlines tight, body relaxed.">
          <div className={styles.typeList}>
            {TYPE_SCALE.map((t) => (
              <div key={t.token} className={styles.typeRow}>
                <span className={styles.typeMeta}>
                  <code>{t.token}</code> {t.px}px / {t.weight}
                </span>
                <span className={styles.typeSample} style={{ fontSize: t.px, fontWeight: t.weight, lineHeight: t.px >= 36 ? 1.05 : t.px >= 22 ? 1.2 : 1.5 }}>
                  {t.sample}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section id="shape" title="Shape and motion" intro="Round and bold. Large radii, thick strokes, no hairlines. Motion is quick and springy.">
          <div className={styles.shapeGrid}>
            <Sub title="Radii">
              <div className={styles.row}>
                {[
                  ["--r-sm", "10px"],
                  ["--r-md", "16px"],
                  ["--r-lg", "24px"],
                  ["--r-xl", "32px"],
                  ["--r-pill", "999px"],
                ].map(([token, value]) => (
                  <div key={token} className={styles.markCell}>
                    <span className={styles.radiusBox} style={{ borderRadius: value }} />
                    <span className={styles.caption}>
                      <code>{token}</code>
                    </span>
                  </div>
                ))}
              </div>
            </Sub>
            <Sub title="Spacing">
              <div className={styles.spacingRow}>
                {[4, 8, 12, 16, 24, 32, 48, 64].map((s, i) => (
                  <div key={s} className={styles.markCell}>
                    <span className={styles.spaceBar} style={{ width: s }} />
                    <span className={styles.caption}>
                      <code>--s-{i + 1}</code> {s}
                    </span>
                  </div>
                ))}
              </div>
            </Sub>
            <Sub title="Shadows">
              <div className={styles.row}>
                {["sm", "md", "lg"].map((s) => (
                  <div key={s} className={styles.markCell}>
                    <span className={styles.shadowBox} style={{ boxShadow: `var(--shadow-${s})` }} />
                    <span className={styles.caption}>
                      <code>--shadow-{s}</code>
                    </span>
                  </div>
                ))}
              </div>
            </Sub>
            <Sub title="Icons" note="24 grid, 2.5 stroke, round caps.">
              <div className={styles.iconRow}>
                {ICON_NAMES.map((n) => (
                  <span key={n} className={styles.iconCell} title={n}>
                    <Icon name={n} />
                  </span>
                ))}
              </div>
            </Sub>
            <Sub title="Motion" note="120ms fast, 200ms base, 320ms slow. One standard ease and one bounce for knobs and mascots.">
              <div className={styles.row}>
                <code>--t-fast 120ms</code>
                <code>--t-base 200ms</code>
                <code>--t-slow 320ms</code>
                <code>--ease</code>
                <code>--ease-bounce</code>
              </div>
            </Sub>
          </div>
        </Section>

        <Section id="components" title="Components" intro="Every base component in its states. Primary is Blaze with Night text, secondary is Cobalt with Cream text.">
          <Sub title="Button">
            <div className={styles.stack}>
              <div className={styles.row}>
                <Button size="sm">Small</Button>
                <Button>Run agent</Button>
                <Button size="lg">Large</Button>
                <Button leading={<Icon name="plus" />}>With icon</Button>
                <Button disabled>Disabled</Button>
              </div>
              <div className={styles.row}>
                <Button variant="secondary" size="sm">
                  Small
                </Button>
                <Button variant="secondary">Save brief</Button>
                <Button variant="secondary" size="lg">
                  Large
                </Button>
                <Button variant="secondary" trailing={<Icon name="arrow-right" />}>
                  Next
                </Button>
                <Button variant="secondary" disabled>
                  Disabled
                </Button>
              </div>
              <div className={styles.row}>
                <Button variant="ghost" size="sm">
                  Small
                </Button>
                <Button variant="ghost">Cancel</Button>
                <Button variant="ghost" size="lg">
                  Large
                </Button>
                <Button variant="ghost" leading={<Icon name="copy" />}>
                  Copy
                </Button>
                <Button variant="ghost" disabled>
                  Disabled
                </Button>
              </div>
              <LoadingButtonDemo />
            </div>
          </Sub>

          <Sub title="Card">
            <div className={styles.cardGrid}>
              <Card title="Raised" actions={<Button size="sm" variant="ghost">Edit</Button>}>
                <p className="muted">The default card. Surface, a line and a soft shadow.</p>
              </Card>
              <Card variant="outlined" title="Outlined">
                <p className="muted">Flat, for lists and dense screens.</p>
              </Card>
              <Card variant="tint" title="Tint">
                <p className="muted">A soft Cobalt tint for callouts and highlights.</p>
              </Card>
              <Card interactive title="Interactive">
                <p className="muted">Lifts on hover. Use when the whole card opens something.</p>
              </Card>
            </div>
          </Sub>

          <Sub title="Input, Textarea, Select">
            <div className={styles.formGrid}>
              <Input label="Agent name" placeholder="Hook Writer" hint="Shown in the marketplace." />
              <Input label="Search agents" placeholder="Search" leading={<Icon name="search" size={20} />} />
              <Input label="Price per run" defaultValue="two credits" error="Enter a whole number of credits." />
              <Input label="Disabled" placeholder="Not editable" disabled />
              <Select
                label="Format"
                options={[
                  { value: "short", label: "Short video" },
                  { value: "carousel", label: "Carousel" },
                  { value: "thread", label: "Thread" },
                  { value: "long", label: "Long form" },
                ]}
              />
              <Textarea label="Brief" placeholder="What is the post about, and who is it for?" hint="One or two sentences is enough." />
            </div>
          </Sub>

          <Sub title="Chip and Tag" note="Chips select or filter. Tags label.">
            <div className={styles.stack}>
              <ChipDemo />
              <div className={styles.row}>
                <Tag>Neutral</Tag>
                <Tag tone="blaze">New</Tag>
                <Tag tone="cobalt">Captions</Tag>
              </div>
            </div>
          </Sub>

          <Sub title="Badge (score)" note="A ring that fills with the score. 85 and up is Blaze, 70 and up is Cobalt.">
            <div className={styles.row}>
              <Badge score={92} />
              <Badge score={76} />
              <Badge score={54} />
              <Badge score={100} size="sm" />
              <Badge score={68} size="sm" />
            </div>
          </Sub>

          <Sub title="Toggle">
            <ToggleDemo />
          </Sub>

          <Sub title="Tabs">
            <TabsDemo />
          </Sub>

          <Sub title="Modal and Sheet" note="Close with Escape, the close button or the overlay.">
            <OverlayDemo />
          </Sub>

          <Sub title="Toast" note="Success brings Wovi celebrating.">
            <div className={styles.stack}>
              <div className={styles.toastGrid}>
                <Toast static tone="success" title="Caption Writer finished" description="4 captions ready to review." />
                <Toast static tone="info" title="Brief saved" description="Agents will use it on the next run." />
                <Toast static tone="warning" title="Low credits" description="2 credits left." />
              </div>
              <ToastDemo />
            </div>
          </Sub>

          <Sub title="Empty state" note="Wovi waves hello where there is nothing yet.">
            <div className={styles.emptyGrid}>
              <EmptyState
                title="No jobs yet"
                description="Pick an agent, give it a brief, and your first result lands here."
                action={<Button leading={<Icon name="plus" />}>Start a job</Button>}
              />
              <EmptyState size="sm" title="No saved agents" description="Save an agent from the marketplace to see it here." />
            </div>
          </Sub>

          <Sub title="Job status row" note="Running, idle and done, using the poses.">
            <div className={styles.stackSm}>
              <JobRow status="running" agent="Hook Writer" task="10 hooks for the bakery custom-cake post" meta="Started just now" action={<Button size="sm" variant="ghost">View</Button>} />
              <JobRow status="idle" agent="Trend Scout" task="Waiting for a brief" meta="Last run yesterday" action={<Button size="sm" variant="secondary">Run</Button>} />
              <JobRow status="done" agent="Caption Writer" task="Caption for the short cut of the kitchen tour" meta={<CreditPill amount={2} kind="cost" size="sm" />} action={<Button size="sm">Open</Button>} />
            </div>
          </Sub>

          <Sub title="Credit pill">
            <div className={styles.row}>
              <CreditPill amount={1250} />
              <CreditPill amount={2} kind="cost" />
              <CreditPill amount={15} kind="reward" />
              <CreditPill amount={1250} size="sm" />
              <CreditPill amount={2} kind="cost" size="sm" />
              <CreditPill amount={15} kind="reward" size="sm" />
            </div>
          </Sub>

          <Sub title="Avatar">
            <div className={styles.row}>
              <Avatar name="Mara Lind" size={24} />
              <Avatar name="Mara Lind" size={32} />
              <Avatar name="Jonas Berg" size={40} />
              <Avatar name="Priya Nair" size={56} />
              <Avatar name="Theo Adeyemi" size={80} />
              <Avatar name="Hook Writer" kind="agent" size={40} />
              <Avatar name="Trend Scout" kind="agent" size={56} />
            </div>
          </Sub>

          <Sub title="Stat tile">
            <div className={styles.statGrid}>
              <StatTile label="Jobs this week" value="48" delta={{ text: "+12", direction: "up" }} hint="vs last week" />
              <StatTile label="Credits spent" value="96" delta={{ text: "-8", direction: "down" }} hint="vs last week" />
              <StatTile label="Average score" value="88" delta={{ text: "same", direction: "flat" }} />
              <StatTile label="Credits earned" value="15" hint="from reviews" emphasis />
            </div>
          </Sub>
        </Section>
      </main>
      <SiteFooter />
    </>
  );
}
