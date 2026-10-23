/**
 * The HTML version of a mail, from its plain text. Every mail WOVI sends is
 * written as plain text first (sign-in, invites, report notices, withdrawal
 * receipts, account deletion, notifications), and the real providers send
 * this simple HTML beside it: the same words, paragraphs, links that can be
 * tapped, a line that is only a link shown as a button, and "WOVI" with the
 * contact address at the foot. No images, no tracking, no remote fonts.
 *
 * A mail can bring its own `html` instead (the sign-in mail does, to show the
 * code large). Client-safe: no Node imports.
 */
import { CONTACT_EMAIL, operatorLine } from "@/lib/legal/operator";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const URL_RE = /https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)]/g;

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const INK = "#0B1230";
const MUTED = "#3A4468";
const BLAZE = "#FF5A1F";

/** One line of text with its links made tappable. */
function inline(line: string): string {
  let out = "";
  let at = 0;
  for (const m of line.matchAll(URL_RE)) {
    out += esc(line.slice(at, m.index));
    out += `<a href="${esc(m[0])}" style="color:${INK};text-decoration:underline">${esc(m[0])}</a>`;
    at = (m.index ?? 0) + m[0].length;
  }
  return out + esc(line.slice(at));
}

function button(url: string): string {
  return [
    `<p style="margin:0 0 8px"><a href="${esc(url)}" style="display:inline-block;background:${BLAZE};color:#FFFFFF;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:999px">Open in WOVI</a></p>`,
    `<p style="margin:0 0 16px;font-size:12px;color:${MUTED};word-break:break-all">${esc(url)}</p>`,
  ].join("");
}

/** The body of a mail as HTML paragraphs: blank lines split them, a line that is only a link becomes a button. */
export function bodyHtml(text: string): string {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const out: string[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (!lines.length) continue;
    let para: string[] = [];
    const flush = () => {
      if (para.length) out.push(`<p style="margin:0 0 16px">${para.join("<br>")}</p>`);
      para = [];
    };
    for (const l of lines) {
      const t = l.trim();
      if (/^https?:\/\/\S+$/.test(t)) {
        flush();
        out.push(button(t));
      } else para.push(inline(l));
    }
    flush();
  }
  return out.join("\n");
}

/** The whole document around a body: a plain card, the wordmark, and the contact line. */
export function wrapHtml(subject: string, body: string): string {
  return [
    "<!doctype html>",
    `<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>`,
    `<body style="margin:0;padding:0;background:#FFF4DC">`,
    `<div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:${FONT};font-size:16px;line-height:1.5;color:${INK}">`,
    `<p style="margin:0 0 20px;font-size:22px;font-weight:800;letter-spacing:-0.02em">WOVI</p>`,
    `<div style="background:#FFFFFF;border:2px solid ${INK};border-radius:16px;padding:24px">`,
    body,
    "</div>",
    `<p style="margin:16px 0 0;font-size:12px;color:${MUTED}">${esc(operatorLine())}. <a href="mailto:${CONTACT_EMAIL}" style="color:${MUTED}">${CONTACT_EMAIL}</a></p>`,
    "</div></body></html>",
  ].join("\n");
}

/** The HTML for a plain-text mail. */
export function htmlFromText(subject: string, text: string): string {
  // The contact line some mails end with is the HTML's footer already.
  const foot = `${operatorLine()}. ${CONTACT_EMAIL}`;
  const trimmed = text.trimEnd();
  const body = trimmed.endsWith(`\n${foot}`) ? trimmed.slice(0, -foot.length) : trimmed;
  return wrapHtml(subject, bodyHtml(body));
}

/** The sign-in mail's HTML: the button, then the code large, then the small print. */
export function signInHtml(input: { subject: string; link: string; code: string; minutes: number }): string {
  const body = [
    `<p style="margin:0 0 16px">Sign in to WOVI with this link:</p>`,
    button(input.link),
    `<p style="margin:0 0 8px">Or enter this code:</p>`,
    `<p style="margin:0 0 16px;font-size:32px;font-weight:800;letter-spacing:0.18em;font-family:ui-monospace,Menlo,Consolas,monospace">${esc(input.code)}</p>`,
    `<p style="margin:0;color:${MUTED}">Both work once and expire in ${input.minutes} minutes. If you did not ask for this, ignore this email.</p>`,
  ].join("\n");
  return wrapHtml(input.subject, body);
}
