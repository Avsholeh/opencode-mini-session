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
  result: T | { data?: T; error?: unknown },
  what: string,
): T {
  if (result !== null && typeof result === "object") {
    if ("error" in result && (result as any).error !== undefined) {
      throw new Error(`could not ${what}: ${describe((result as any).error)}`);
    }
    if ("data" in result) {
      return (result as any).data as T;
    }
  }
  return result as T;
}
