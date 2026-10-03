import type { Message, Part } from "@opencode-ai/sdk/v2";
import { CONTEXT_PREFIX } from "./markers";

export type Entry = { info: Message; parts: Array<Part> };

const MAX_SUMMARY = 48;

function truncate(value: string, max: number): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function summarizeValue(value: unknown): string {
  if (typeof value === "string") return truncate(value, MAX_SUMMARY);
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (Array.isArray(value)) return `[${value.length}]`;
  if (value && typeof value === "object") return "{...}";
  if (value === null || value === undefined) return String(value);
  return String(value);
}

export function formatToolInputs(input: Record<string, unknown>): string {
  return Object.entries(input)
    .slice(0, 4)
    .map(([key, value]) => `${key}=${summarizeValue(value)}`)
    .join(" ");
}

export function renderPartText(part: Part, thinking: boolean): string {
  switch (part.type) {
    case "text":
      return part.text;
    case "reasoning":
      return thinking ? part.text : "";
    case "tool": {
      const inputs = formatToolInputs(part.state?.input ?? {});
      return inputs ? `[tool: ${part.tool} ${inputs}]` : `[tool: ${part.tool}]`;
    }
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

function renderEntry(entry: Entry, thinking: boolean): string {
  const role = entry.info.role === "user" ? "User" : "Assistant";
  const body = (entry.parts ?? [])
    .map((part) => renderPartText(part, thinking))
    .filter((value) => value && value.trim().length > 0)
    .join("\n")
    .trim();
  return body ? `${role}:\n${body}` : "";
}

export function renderTranscript(
  entries: ReadonlyArray<Entry>,
  thinking: boolean,
): string {
  return entries
    .map((entry) => renderEntry(entry, thinking))
    .filter((block) => block.length > 0)
    .join("\n\n");
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.4);
}

export function renderWithinTokenLimit(
  entries: ReadonlyArray<Entry>,
  thinking: boolean,
  limit: number,
): { text: string; usedTokens: number; dropped: number } {
  const chunks = entries
    .map((entry) => renderEntry(entry, thinking))
    .filter((text) => text.length > 0);
  const selected: string[] = [];
  let usedTokens = 0;
  let dropped = 0;

  for (let index = chunks.length - 1; index >= 0; index -= 1) {
    const text = chunks[index];
    const tokens = estimateTokens(text);
    if (selected.length > 0 && usedTokens + tokens > limit) {
      dropped = index + 1;
      break;
    }
    selected.push(text);
    usedTokens += tokens;
    if (usedTokens >= limit) {
      dropped = index;
      break;
    }
  }

  return {
    text: selected.reverse().join("\n\n"),
    usedTokens,
    dropped,
  };
}

export function renderDeliveryTranscript(
  entries: ReadonlyArray<Entry>,
  thinking: boolean,
): string {
  const textOnly = entries.map((entry) => ({
    ...entry,
    parts: (entry.parts ?? []).filter((part) => {
      if (part.type === "reasoning") return true;
      if (part.type !== "text") return false;
      return !part.text.startsWith(CONTEXT_PREFIX);
    }),
  }));
  return renderTranscript(textOnly, thinking);
}
