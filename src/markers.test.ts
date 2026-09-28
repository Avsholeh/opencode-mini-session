import { describe, expect, test } from "bun:test";
import { isMiniTitle, mainMarker, miniTitle, shortID } from "./markers";

describe("markers", () => {
  test("miniTitle round-trips through mainMarker", () => {
    const title = miniTitle("ses_123");
    expect(mainMarker(title)).toBe("ses_123");
    expect(isMiniTitle(title)).toBe(true);
  });

  test("plain titles are not mini titles", () => {
    expect(isMiniTitle("My session")).toBe(false);
    expect(mainMarker("My session")).toBeUndefined();
    expect(isMiniTitle(undefined)).toBe(false);
  });

  test("extracts the marker anywhere in the title", () => {
    expect(mainMarker("anything [main:abc] trailing")).toBe("abc");
  });

  test("shortID truncates long ids", () => {
    expect(shortID("0123456789")).toBe("01234567");
    expect(shortID("abc")).toBe("abc");
  });
});
