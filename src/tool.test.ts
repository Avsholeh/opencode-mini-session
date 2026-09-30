import { describe, expect, test } from "bun:test";
import type { ToolPart, ToolState } from "@opencode-ai/sdk/v2";
import { toolLabel, toolLine } from "./tool";

const pending = (input: Record<string, unknown> = {}): ToolState =>
  ({ status: "pending", input, raw: "" }) as unknown as ToolState;

const running = (
  input: Record<string, unknown> = {},
  title?: string,
): ToolState =>
  ({
    status: "running",
    input,
    title,
    time: { start: 1 },
  }) as unknown as ToolState;

const completed = (
  input: Record<string, unknown> = {},
  title = "",
): ToolState =>
  ({
    status: "completed",
    input,
    output: "",
    title,
    metadata: {},
    time: { start: 1, end: 2 },
  }) as unknown as ToolState;

const errored = (error: string): ToolState =>
  ({
    status: "error",
    input: {},
    error,
    time: { start: 1, end: 2 },
  }) as unknown as ToolState;

const part = (tool: string, value: ToolState): ToolPart =>
  ({ tool, state: value }) as unknown as ToolPart;

describe("toolLabel", () => {
  test("derives from input when there is no title", () => {
    expect(toolLabel("bash", pending({ command: "cat package.json" }))).toBe(
      "cat package.json",
    );
  });

  test("prefers the server title", () => {
    expect(
      toolLabel("bash", completed({ command: "other" }, "cat package.json")),
    ).toBe("cat package.json");
  });

  test("uses filePath for read and write", () => {
    expect(toolLabel("read", pending({ filePath: "src/a.ts" }))).toBe(
      "src/a.ts",
    );
    expect(toolLabel("write", pending({ filePath: "src/b.ts" }))).toBe(
      "src/b.ts",
    );
  });

  test("collapses whitespace to one line", () => {
    expect(toolLabel("bash", pending({ command: "cat a\n&& cat b" }))).toBe(
      "cat a && cat b",
    );
  });

  test("truncates long labels", () => {
    const label = toolLabel("bash", pending({ command: "x".repeat(100) }));
    expect(label).toHaveLength(81);
    expect(label?.endsWith("…")).toBe(true);
  });

  test("returns undefined for empty input", () => {
    expect(toolLabel("bash", pending())).toBeUndefined();
  });
});

describe("toolLine", () => {
  test("pending shows the tool and label", () => {
    expect(
      toolLine(part("bash", pending({ command: "cat package.json" }))),
    ).toEqual({ text: "· bash · cat package.json", error: false });
  });

  test("running derives the label", () => {
    expect(toolLine(part("read", running({ filePath: "src/a.ts" }))).text).toBe(
      "→ read · src/a.ts…",
    );
  });

  test("completed prefers the server title", () => {
    expect(
      toolLine(part("read", completed({ filePath: "src/a.ts" }, "src/b.ts")))
        .text,
    ).toBe("✓ read · src/b.ts");
  });

  test("pending without input shows the tool only", () => {
    expect(toolLine(part("bash", pending())).text).toBe("· bash");
  });

  test("error flags the line", () => {
    expect(toolLine(part("bash", errored("boom")))).toEqual({
      text: "✕ bash · boom",
      error: true,
    });
  });
});
