import { describe, expect, test } from "bun:test";
import type { Message, Part } from "@opencode-ai/sdk/v2";
import {
  estimateTokens,
  renderDeliveryTranscript,
  renderPartText,
  renderTranscript,
  renderWithinTokenLimit,
  type Entry,
} from "./transcript";

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

  test("summarizes tool inputs in copied context", () => {
    const tool = part({
      type: "tool",
      tool: "read",
      state: { status: "completed", input: { filePath: "src/foo.ts" } },
    });
    expect(renderPartText(tool, false)).toBe(
      "[tool: read filePath=src/foo.ts]",
    );
  });

  test("caps tool input summaries at four keys and flattens values", () => {
    const tool = part({
      type: "tool",
      tool: "bash",
      state: {
        status: "running",
        input: { a: "one", b: 2, c: true, d: ["x", "y"], e: "ignored" },
      },
    });
    expect(renderPartText(tool, false)).toBe(
      "[tool: bash a=one b=2 c=true d=[2]]",
    );
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

describe("renderDeliveryTranscript", () => {
  test("drops tool, file, agent and subtask parts but keeps text", () => {
    const text = renderDeliveryTranscript(
      [
        entry("user", [part({ type: "text", text: "hi" })]),
        entry("assistant", [
          part({ type: "text", text: "done" }),
          part({ type: "tool", tool: "bash" }),
          part({ type: "file", filename: "a.ts" }),
          part({ type: "agent", name: "build" }),
          part({ type: "subtask", description: "do it" }),
        ]),
      ],
      false,
    );
    expect(text).toBe("User:\nhi\n\nAssistant:\ndone");
    expect(text).not.toContain("[tool:");
    expect(text).not.toContain("[file:");
    expect(text).not.toContain("[agent:");
    expect(text).not.toContain("[subtask:");
  });

  test("returns empty string when only non-text parts remain", () => {
    const text = renderDeliveryTranscript(
      [entry("assistant", [part({ type: "tool", tool: "bash" })])],
      false,
    );
    expect(text).toBe("");
  });

  test("still respects the thinking flag for reasoning", () => {
    const entries = [
      entry("assistant", [part({ type: "reasoning", text: "hmm" })]),
    ];
    expect(renderDeliveryTranscript(entries, false)).toBe("");
    expect(renderDeliveryTranscript(entries, true)).toBe("Assistant:\nhmm");
  });

  test("drops the injected mini-context block instead of echoing it", () => {
    const text = renderDeliveryTranscript(
      [
        entry("user", [
          part({
            type: "text",
            text: "<mini-context>\nUser:\nhi\n\nAssistant:\n[tool: edit]",
          }),
        ]),
        entry("user", [part({ type: "text", text: "real question" })]),
        entry("assistant", [part({ type: "text", text: "real answer" })]),
      ],
      false,
    );
    expect(text).toBe("User:\nreal question\n\nAssistant:\nreal answer");
    expect(text).not.toContain("<mini-context>");
    expect(text).not.toContain("[tool:");
  });

  test("returns empty string when only the context block remains", () => {
    const text = renderDeliveryTranscript(
      [
        entry("user", [
          part({ type: "text", text: "<mini-context>\nUser:\nhi" }),
        ]),
      ],
      false,
    );
    expect(text).toBe("");
  });
});

describe("estimateTokens", () => {
  test("approximates from character length", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(2);
  });
});

describe("renderWithinTokenLimit", () => {
  const entries = [
    entry("user", [part({ type: "text", text: "one" })]),
    entry("assistant", [part({ type: "text", text: "two" })]),
    entry("user", [part({ type: "text", text: "three" })]),
  ];

  test("keeps everything when the limit is large", () => {
    const result = renderWithinTokenLimit(entries, false, 50000);
    expect(result.text).toBe("User:\none\n\nAssistant:\ntwo\n\nUser:\nthree");
    expect(result.dropped).toBe(0);
  });

  test("drops the oldest entries that do not fit", () => {
    const result = renderWithinTokenLimit(entries, false, 4);
    expect(result.text).toBe("User:\nthree");
    expect(result.usedTokens).toBeGreaterThan(0);
    expect(result.dropped).toBeGreaterThan(0);
  });

  test("always keeps at least the newest entry", () => {
    const result = renderWithinTokenLimit(entries, false, 1);
    expect(result.text).toBe("User:\nthree");
  });

  test("returns empty text when there is nothing to render", () => {
    const result = renderWithinTokenLimit([], false, 100);
    expect(result).toEqual({ text: "", usedTokens: 0, dropped: 0 });
  });
});
