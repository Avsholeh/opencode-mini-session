import { describe, expect, test } from "bun:test";
import type { Message, Part } from "@opencode-ai/sdk/v2";
import { renderPartText, renderTranscript, type Entry } from "./transcript";

const part = (value: Record<string, unknown>): Part => value as unknown as Part;

const entry = (role: "user" | "assistant", parts: Array<Part>): Entry => ({
  info: { role } as unknown as Message,
  parts,
});

describe("renderPartText", () => {
  test("renders text", () => {
    expect(renderPartText(part({ type: "text", text: "hello" }), false)).toBe(
      "hello",
    );
  });

  test("hides reasoning unless thinking is enabled", () => {
    const reasoning = part({ type: "reasoning", text: "hmm" });
    expect(renderPartText(reasoning, false)).toBe("");
    expect(renderPartText(reasoning, true)).toBe("hmm");
  });

  test("labels tool, file, agent and subtask parts", () => {
    expect(renderPartText(part({ type: "tool", tool: "bash" }), false)).toBe(
      "[tool: bash]",
    );
    expect(
      renderPartText(part({ type: "file", filename: "a.ts" }), false),
    ).toBe("[file: a.ts]");
    expect(renderPartText(part({ type: "agent", name: "build" }), false)).toBe(
      "[agent: build]",
    );
    expect(
      renderPartText(part({ type: "subtask", description: "do it" }), false),
    ).toBe("[subtask: do it]");
  });

  test("falls back to url when filename is missing", () => {
    expect(
      renderPartText(part({ type: "file", url: "https://x" }), false),
    ).toBe("[file: https://x]");
  });
});

describe("renderTranscript", () => {
  test("labels roles and joins blocks", () => {
    const text = renderTranscript(
      [
        entry("user", [part({ type: "text", text: "hi" })]),
        entry("assistant", [part({ type: "text", text: "hey" })]),
      ],
      false,
    );
    expect(text).toBe("User:\nhi\n\nAssistant:\nhey");
  });

  test("drops entries with no renderable body", () => {
    const text = renderTranscript(
      [
        entry("assistant", [part({ type: "reasoning", text: "secret" })]),
        entry("user", [part({ type: "text", text: "  " })]),
      ],
      false,
    );
    expect(text).toBe("");
  });

  test("returns empty string for no entries", () => {
    expect(renderTranscript([], false)).toBe("");
  });
});
