import { z } from "zod";

/** Domínios/TLDs de exemplo que nunca são aceitos como endereço oficial (evita placeholder em produção). */
const PLACEHOLDER = /(^|\.)(example\.(com|org|net)|exemplo\.(com|com\.br)|invalid|example|localhost)$/i;

/** Valida o e-mail de suporte vindo da configuração. Retorna null se ausente ou inválido — nunca inventa um endereço. */
export function parseSupportEmail(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s || s.length > 254 || /[\s?&#,;<>"'()\\]/.test(s)) return null;
  if (!z.string().email().safeParse(s).success) return null;
  const domain = s.split("@")[1] ?? "";
  if (PLACEHOLDER.test(domain)) return null;
  return s;
}

/** E-mail de suporte configurado (SUPPORT_EMAIL, lido em runtime no servidor). */
export function getSupportEmail(): string | null {
  const raw = process.env.SUPPORT_EMAIL;
  const v = parseSupportEmail(raw);
  if (raw && raw.trim() && !v) console.warn("[suporte] SUPPORT_EMAIL inválido; o canal de suporte fica indisponível.");
  return v;
}

export const SUPPORT_TOPICS = ["general", "access", "data", "account", "delete", "bug"] as const;
export type SupportTopic = (typeof SUPPORT_TOPICS)[number];
export const isSupportTopic = (v: unknown): v is SupportTopic => typeof v === "string" && (SUPPORT_TOPICS as readonly string[]).includes(v);

/** Link mailto: válido (assunto e corpo codificados). */
export function mailtoHref(email: string, subject: string, body?: string): string {
  const q = [`subject=${encodeURIComponent(subject)}`]; if (body) q.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${email}?${q.join("&")}`;
}

/** Filtro das perguntas frequentes (sem acento, sem diferenciar maiúsculas). */
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export function filterFaq<T extends { q: string; a: string }>(items: T[], query: string): T[] {
  const terms = norm(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return items;
  return items.filter((i) => { const t = norm(i.q + " " + i.a); return terms.every((w) => t.includes(w)); });
}
