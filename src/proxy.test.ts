import { describe, expect, it } from "vitest";
import { aliasRedirect } from "./proxy";

describe("one address", () => {
  it("forwards www and the Railway address, nothing else", () => {
    expect(aliasRedirect("www.getwovi.fun")).toBe(true);
    expect(aliasRedirect("wovi-production.up.railway.app")).toBe(true);
    expect(aliasRedirect("getwovi.fun")).toBe(false);
    expect(aliasRedirect("localhost:3900")).toBe(false);
    expect(aliasRedirect("healthcheck.railway.app")).toBe(false);
    expect(aliasRedirect(null)).toBe(false);
  });
});
