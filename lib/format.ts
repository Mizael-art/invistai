export type Lang = "pt" | "en";
const loc = (l: Lang) => (l === "pt" ? "pt-BR" : "en-US");
/** Fuso dos horários exibidos. O servidor (Vercel) roda em UTC; sem isto, "Atualizado 17:20" apareceria para um usuário às 14:20 em Brasília.
 *  Configurável por APP_TIMEZONE (IANA). Mesmo valor no servidor e no navegador, evitando divergência na hidratação. */
export const TIME_ZONE = (() => { const z = process.env.APP_TIMEZONE || "America/Sao_Paulo"; try { new Intl.DateTimeFormat("en", { timeZone: z }); return z; } catch { return "America/Sao_Paulo"; } })();
export function money(n: number, l: Lang, cur = "USD") {
  const d = n < 1 ? 4 : 2;
  return new Intl.NumberFormat(loc(l), { style: "currency", currency: cur, minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
}
export function pct(n: number | null, l: Lang) {
  if (n === null) return "—";
  return `${n >= 0 ? "+" : ""}${new Intl.NumberFormat(loc(l), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}%`;
}
export function relTime(iso: string | null, l: Lang, now = Date.now()) {
  if (!iso) return "—";
  const diff = Math.round((Date.parse(iso) - now) / 1000), rtf = new Intl.RelativeTimeFormat(loc(l), { numeric: "auto" });
  const a = Math.abs(diff);
  if (a < 60) return rtf.format(Math.round(diff), "second");
  if (a < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (a < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}
export function clock(iso: string | null, l: Lang) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(loc(l), { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", timeZone: TIME_ZONE }).format(new Date(iso));
}
export function num(n: number, l: Lang, d = 2) { return new Intl.NumberFormat(loc(l), { minimumFractionDigits: d, maximumFractionDigits: d }).format(n); }
/** Preço com a moeda de referência sempre identificada. Forex: "1 USD = x QUOTE". */
export function priceText(a: { price: number; currency: string; quote?: string }, l: Lang) {
  return a.quote ? `${num(a.price, l, 4)} ${a.quote}` : money(a.price, l, a.currency);
}
export function compactMoney(n: number, l: Lang, cur = "USD") {
  return new Intl.NumberFormat(loc(l), { style: "currency", currency: cur, notation: "compact", maximumFractionDigits: 2 }).format(n);
}
export function compactNum(n: number, l: Lang) { return new Intl.NumberFormat(loc(l), { notation: "compact", maximumFractionDigits: 2 }).format(n); }
