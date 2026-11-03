export const TITLE_MARKER = /\[main:([^\]]+)\]/;
export const CONTEXT_PREFIX = "<mini-context>";
export const SYSTEM_REMINDER_PREFIX = "<system-reminder>";
export const SYSTEM_REMINDER_BLOCK =
  /<system-reminder>[\s\S]*?(?:<\/system-reminder>|$)/gi;

export function stripSystemReminder(text: string): string {
  if (!text) return "";
  const cleaned = text.replace(SYSTEM_REMINDER_BLOCK, "");
  return cleaned === text ? text : cleaned.trim();
}

export function isSystemReminder(message: unknown): boolean {
  if (!message) return false;
  if (typeof message === "string") {
    if (!message.includes(SYSTEM_REMINDER_PREFIX)) return false;
    return stripSystemReminder(message).length === 0;
  }
  if (typeof message !== "object") return false;
  const msg = message as Record<string, unknown>;

  let hasReminder = false;
  let hasRemainingContent = false;

  if (typeof msg.text === "string") {
    if (msg.text.includes(SYSTEM_REMINDER_PREFIX)) {
      hasReminder = true;
    }
    if (stripSystemReminder(msg.text).length > 0) {
      hasRemainingContent = true;
    }
  }

  const parts = msg.content ?? msg.parts;
  if (Array.isArray(parts)) {
    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      const partObj = part as Record<string, unknown>;
      if (typeof partObj.text === "string") {
        if (partObj.text.includes(SYSTEM_REMINDER_PREFIX)) {
          hasReminder = true;
        }
        if (stripSystemReminder(partObj.text).length > 0) {
          hasRemainingContent = true;
        }
      } else {
        hasRemainingContent = true;
      }
    }
  }

  return hasReminder && !hasRemainingContent;
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
