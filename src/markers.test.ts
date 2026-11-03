import { describe, expect, test } from "bun:test";
import {
  isMiniTitle,
  isSystemReminder,
  mainMarker,
  miniTitle,
  shortID,
} from "./markers";

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

  test("identifies system-reminder messages and text", () => {
    expect(isSystemReminder("<system-reminder> instructions")).toBe(true);
    expect(isSystemReminder("  <system-reminder>\ncontent")).toBe(true);
    expect(isSystemReminder({ text: "<system-reminder> rules" })).toBe(true);
    expect(
      isSystemReminder({
        content: [{ type: "text", text: "<system-reminder> foo" }],
      }),
    ).toBe(true);
    expect(
      isSystemReminder({
        parts: [{ type: "text", text: "<system-reminder> foo" }],
      }),
    ).toBe(true);
  });

  test("does not flag mini-context or regular user/assistant messages as system-reminder", () => {
    expect(isSystemReminder("<mini-context>\nsome context")).toBe(false);
    expect(isSystemReminder({ text: "<mini-context>\nsome context" })).toBe(
      false,
    );
    expect(isSystemReminder({ text: "hello world" })).toBe(false);
    expect(isSystemReminder("hello")).toBe(false);
    expect(
      isSystemReminder({
        content: [{ type: "text", text: "Regular answer" }],
      }),
    ).toBe(false);
    expect(isSystemReminder(undefined)).toBe(false);
    expect(isSystemReminder(null)).toBe(false);
  });
});
