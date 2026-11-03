import { describe, expect, test } from "bun:test";
import {
  isMiniTitle,
  isSystemReminder,
  mainMarker,
  miniTitle,
  shortID,
  stripSystemReminder,
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

  test("stripSystemReminder removes reminder blocks from text", () => {
    expect(
      stripSystemReminder("<system-reminder>instructions</system-reminder>"),
    ).toBe("");
    expect(
      stripSystemReminder(
        "<system-reminder>instructions</system-reminder>\n\nhello world",
      ),
    ).toBe("hello world");
    expect(
      stripSystemReminder("hello <system-reminder>foo</system-reminder> world"),
    ).toBe("hello  world");
    expect(
      stripSystemReminder(
        "<system-reminder>one</system-reminder>question<system-reminder>two</system-reminder>",
      ),
    ).toBe("question");
    expect(stripSystemReminder("<system-reminder> unclosed")).toBe("");
    expect(stripSystemReminder("hello plain text")).toBe("hello plain text");
    expect(stripSystemReminder("")).toBe("");
  });

  test("does not flag mixed messages with reminders as system-reminder", () => {
    expect(
      isSystemReminder(
        "<system-reminder>instructions</system-reminder>\nhello",
      ),
    ).toBe(false);
    expect(
      isSystemReminder({
        text: "<system-reminder>rules</system-reminder>\nWhat is TypeScript?",
      }),
    ).toBe(false);
    expect(
      isSystemReminder({
        content: [
          {
            type: "text",
            text: "<system-reminder>rules</system-reminder>\nWhat is TypeScript?",
          },
        ],
      }),
    ).toBe(false);
    expect(
      isSystemReminder({
        parts: [
          { type: "text", text: "<system-reminder>rules</system-reminder>" },
          { type: "text", text: "What is TypeScript?" },
        ],
      }),
    ).toBe(false);
  });
});
