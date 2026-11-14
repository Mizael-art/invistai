/** Destino de uma notificação: somente caminhos internos seguros; qualquer outro valor → sem destino. */
export function safeTarget(t: unknown): string | null {
  if (typeof t !== "string" || t.length === 0 || t.length > 300) return null;
  if (!t.startsWith("/") || t.startsWith("//") || t.includes("\\") || /[\u0000-\u001f]/.test(t)) return null;
  if (!/^\/[A-Za-z0-9/_?=&%.-]*$/.test(t)) return null;
  return t;
}
export const KNOWN_KINDS = ["welcome", "email_confirmed", "password_changed"] as const;
export type KnownKind = (typeof KNOWN_KINDS)[number];
export const isKnownKind = (k: string): k is KnownKind => (KNOWN_KINDS as readonly string[]).includes(k);
export const badgeText = (n: number) => (n <= 0 ? "" : n > 9 ? "9+" : String(n));
