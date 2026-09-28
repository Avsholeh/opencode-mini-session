import type { Message, Part } from "@opencode-ai/sdk/v2";

export type Entry = { info: Message; parts: Array<Part> };

export function renderPartText(part: Part, thinking: boolean): string {
  switch (part.type) {
    case "text":
      return part.text;
    case "reasoning":
      return thinking ? part.text : "";
    case "tool":
      return `[tool: ${part.tool}]`;
    case "file":
      return `[file: ${part.filename ?? part.url}]`;
    case "agent":
      return `[agent: ${part.name}]`;
    case "subtask":
      return `[subtask: ${part.description}]`;
    default:
      return "";
  }
}

export function renderTranscript(
  entries: ReadonlyArray<Entry>,
  thinking: boolean,
): string {
  const blocks: string[] = [];
  for (const entry of entries) {
    const role = entry.info.role === "user" ? "User" : "Assistant";
    const body = (entry.parts ?? [])
      .map((part) => renderPartText(part, thinking))
      .filter((value) => value && value.trim().length > 0)
      .join("\n")
      .trim();
    if (body) blocks.push(`${role}:\n${body}`);
  }
  return blocks.join("\n\n");
}
