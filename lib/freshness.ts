export const STALE_AFTER_MS = 15 * 60 * 1000;
export function isStale(updatedAt: string | null, now = Date.now(), after = STALE_AFTER_MS): boolean {
  if (!updatedAt) return true;
  const t = Date.parse(updatedAt);
  return Number.isNaN(t) || now - t > after;
}
