export const TITLE_MARKER = /\[main:([^\]]+)\]/;
export const CONTEXT_PREFIX = "<mini-context>";

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
