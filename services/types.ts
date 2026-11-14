export type ProviderErrorCode = "not_configured" | "rate_limited" | "unavailable" | "invalid_response";
export class ProviderError extends Error {
  constructor(public code: ProviderErrorCode, message?: string) { super(message ?? code); }
}
export type Result<T> = { ok: true; data: T; fetchedAt: string } | { ok: false; error: ProviderErrorCode };
export async function toResult<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try { return { ok: true, data: await fn(), fetchedAt: new Date().toISOString() }; }
  catch (e) { return { ok: false, error: e instanceof ProviderError ? e.code : "unavailable" }; }
}
