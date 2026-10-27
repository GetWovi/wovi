import { describe, expect, it } from "vitest";
import { embedText, isXPost, xPostFetcher } from "./link-fetcher";

const HTML =
  '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Gerald is 9 today &amp; still rising.<br><br>Proper loaf at 5 a.m. <a href="https://t.co/abc">https://t.co/abc</a> <a href="https://t.co/pic">pic.twitter.com/Xy12</a></p>&mdash; Crumb (@crumb) <a href="https://x.com/crumb/status/1">May 1, 2026</a></blockquote>';

describe("the X post reader", () => {
  it("knows a post link from any other link", () => {
    for (const u of ["https://x.com/crumb/status/1", "https://twitter.com/crumb/status/123?s=20", "https://mobile.x.com/crumb/status/9/photo/1"]) expect(isXPost(u)).toBe(true);
    for (const u of ["https://x.com/crumb", "https://www.tiktok.com/@crumb/video/1", "https://x.com.evil.io/crumb/status/1", "https://a.com/x.com/crumb/status/1"]) expect(isXPost(u)).toBe(false);
  });

  it("keeps the post's own words and drops the byline, tags and media links", () => {
    expect(embedText(HTML)).toBe("Gerald is 9 today & still rising.\n\nProper loaf at 5 a.m.");
    expect(embedText("<blockquote>no paragraph</blockquote>")).toBeNull();
  });

  it("asks X's embed lookup only for X posts, and gives null when X does not answer", async () => {
    const asked: string[] = [];
    const ok = (async (u: string) => (asked.push(u), new Response(JSON.stringify({ html: HTML }), { status: 200 }))) as typeof fetch;
    const r = xPostFetcher(ok);
    const signal = AbortSignal.timeout(1000);
    expect(await r.fetchText("https://x.com/crumb/status/1", signal)).toContain("Gerald is 9 today");
    expect(asked).toEqual(["https://publish.twitter.com/oembed?omit_script=1&dnt=true&url=https%3A%2F%2Fx.com%2Fcrumb%2Fstatus%2F1"]);
    expect(await r.fetchText("https://www.tiktok.com/@crumb/video/1", signal)).toBeNull();
    expect(asked).toHaveLength(1);
    const gone = (async () => new Response("Not found", { status: 404 })) as typeof fetch;
    expect(await xPostFetcher(gone).fetchText("https://x.com/crumb/status/2", signal)).toBeNull();
  });
});
