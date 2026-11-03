export const TITLE_MARKER = /\[main:([^\]]+)\]/;
export const CONTEXT_PREFIX = "<mini-context>";
export const SYSTEM_REMINDER_PREFIX = "<system-reminder>";

export function isSystemReminder(message: unknown): boolean {
  if (!message) return false;
  if (typeof message === "string") {
    return message.trimStart().startsWith(SYSTEM_REMINDER_PREFIX);
  }
  if (typeof message !== "object") return false;
  const msg = message as Record<string, unknown>;
  if (
    typeof msg.text === "string" &&
    msg.text.trimStart().startsWith(SYSTEM_REMINDER_PREFIX)
  ) {
    return true;
  }
  const parts = msg.content ?? msg.parts;
  if (Array.isArray(parts)) {
    for (const part of parts) {
      if (
        part &&
        typeof (part as { text?: unknown }).text === "string" &&
        (part as { text: string }).text
          .trimStart()
          .startsWith(SYSTEM_REMINDER_PREFIX)
      ) {
        return true;
      }
    }
  }
  return false;
}

export function shortID(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

export function mainMarker(title: string | undefined): string | undefined {
  const match = title?.match(TITLE_MARKER);
  return match ? match[1] : undefined;
}

export function isMiniTitle(title: string | undefined): boolean {
  return Boolean(title && TITLE_MARKER.test(title));
}

export function miniTitle(main: string): string {
  return `mini — side chat [main:${main}]`;
}
