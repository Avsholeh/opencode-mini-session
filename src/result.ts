export type FailureReason = "no-target" | "failed";

export type Result<T> =
  { ok: true; value: T } | { ok: false; error: string; reason: FailureReason };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail(
  error: string,
  reason: FailureReason = "failed",
): Result<never> {
  return { ok: false, error, reason };
}

export function describe(error: unknown): string {
  const raw = error as { message?: unknown; data?: { message?: unknown } };
  return String(raw?.data?.message ?? raw?.message ?? JSON.stringify(error));
}

export function unwrap<T>(
  result: { data?: T; error?: unknown },
  what: string,
): T {
  if (result.error !== undefined)
    throw new Error(`could not ${what}: ${describe(result.error)}`);
  if (result.data === undefined || result.data === null)
    throw new Error(`could not ${what}`);
  return result.data;
}
