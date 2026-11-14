const hits = new Map<string, number[]>();
/** Limite simples em memória (por instância). Em produção multi-instância, trocar por Redis/Upstash. */
export function rateLimit(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { hits.set(key, arr); return false; }
  arr.push(now); hits.set(key, arr); return true;
}
