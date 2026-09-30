import type { ToolPart, ToolState } from "@opencode-ai/sdk/v2";

const MAX_LABEL = 80;

const PRIMARY_KEYS: Record<string, string> = {
  bash: "command",
  read: "filePath",
  write: "filePath",
  edit: "filePath",
  glob: "pattern",
  grep: "pattern",
  webfetch: "url",
  websearch: "query",
  task: "description",
  skill: "name",
};

const FALLBACK_KEYS = [
  "command",
  "filePath",
  "path",
  "pattern",
  "query",
  "url",
  "description",
  "name",
];

function primitive(
  input: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = input[key];
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return undefined;
}

function normalize(value: string): string {
  const flat = value.replace(/\s+/g, " ").trim();
  if (flat.length <= MAX_LABEL) return flat;
  return `${flat.slice(0, MAX_LABEL)}…`;
}

function deriveLabel(
  tool: string,
  input: Record<string, unknown>,
): string | undefined {
  const primary = PRIMARY_KEYS[tool];
  if (primary) {
    const value = primitive(input, primary);
    if (value) return normalize(value);
  }
  for (const key of FALLBACK_KEYS) {
    const value = primitive(input, key);
    if (value) return normalize(value);
  }
  return undefined;
}

export function toolLabel(tool: string, state: ToolState): string | undefined {
  if (
    (state.status === "running" || state.status === "completed") &&
    state.title
  ) {
    return normalize(state.title);
  }
  return deriveLabel(tool, state.input ?? {});
}

export function toolLine(part: ToolPart): { text: string; error: boolean } {
  const state = part.state;
  const label = toolLabel(part.tool, state);
  const suffix = label ? ` · ${label}` : "";
  switch (state.status) {
    case "pending":
      return { text: `· ${part.tool}${suffix}`, error: false };
    case "running":
      return { text: `→ ${part.tool}${suffix}…`, error: false };
    case "completed":
      return { text: `✓ ${part.tool}${suffix}`, error: false };
    default:
      return { text: `✕ ${part.tool} · ${state.error}`, error: true };
  }
}
