/**
 * Automated contrast check for the token pairs the brand relies on.
 * Fails (exit 1) if a pair marked "use" drops under its minimum.
 * Run: npm run check:contrast
 */
import { contrastRatio, formatRatio, wcagLevel } from "../src/lib/contrast.ts";

const PAIRS = [
  ["Text on Background (night)", "#FFF4DC", "#0B1230", 4.5],
  ["Text muted on Background (night)", "#A9B3D9", "#0B1230", 4.5],
  ["Text on Surface (night)", "#FFF4DC", "#141D44", 4.5],
  ["Text muted on Surface (night)", "#A9B3D9", "#141D44", 4.5],
  ["Night text on Blaze (primary button)", "#0B1230", "#FF5A1F", 4.5],
  ["Cream text on Cobalt (secondary button)", "#FFF4DC", "#1F4DFF", 4.5],
  ["Cobalt Glow text on Night", "#7C97FF", "#0B1230", 4.5],
  ["Cobalt Glow text on Surface (night)", "#7C97FF", "#141D44", 4.5],
  ["Blaze text on Night (large only)", "#FF5A1F", "#0B1230", 3],
  ["Text on Background (light)", "#0B1230", "#FFF4DC", 4.5],
  ["Text muted on Background (light)", "#3A4468", "#FFF4DC", 4.5],
  ["Text on Surface (light)", "#0B1230", "#FFFFFF", 4.5],
  ["Cobalt text on Cream (light)", "#1F4DFF", "#FFF4DC", 4.5],
  ["Blaze Text (deep) on Cream (light)", "#BF3E0E", "#FFF4DC", 4.5],
  ["Blaze Text (deep) on Surface (light)", "#BF3E0E", "#FFFFFF", 4.5],
  ["Line on Background (night, non-text)", "#2A3668", "#0B1230", 1.3],
  ["Line on Background (light, non-text)", "#E8D9B5", "#FFF4DC", 1.1],
];

const NEVER = [
  ["Cream text on Blaze", "#FFF4DC", "#FF5A1F"],
  ["Cobalt text on Night", "#1F4DFF", "#0B1230"],
  ["Blaze text on Cream", "#FF5A1F", "#FFF4DC"],
];

let failed = false;
console.log("Pairs in use");
for (const [label, fg, bg, min] of PAIRS) {
  const r = contrastRatio(fg, bg);
  const ok = r >= min;
  if (!ok) failed = true;
  const level = min < 3 ? "non-text" : wcagLevel(r);
  console.log(`${ok ? "ok  " : "FAIL"} ${formatRatio(r).padStart(7)}  ${level.padEnd(9)} ${label}  (${fg} on ${bg}, min ${min})`);
}
console.log("\nPairs the brand forbids (for the record)");
for (const [label, fg, bg] of NEVER) {
  const r = contrastRatio(fg, bg);
  console.log(`never ${formatRatio(r).padStart(7)}  ${wcagLevel(r).padEnd(9)} ${label}  (${fg} on ${bg})`);
}
if (failed) {
  console.error("\nA pair in use is under its minimum.");
  process.exit(1);
}
