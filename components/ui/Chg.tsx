import { pct, type Lang } from "@/lib/format";
/** Variação percentual em pílula (▲ verde / ▼ vermelha). Sem dado → "—" neutro (nunca vira 0%). */
export function Chg({ v, lang, title }: { v: number | null; lang: Lang; title?: string }) {
  const cls = v === null ? "flat" : v > 0 ? "up" : v < 0 ? "dn" : "flat";
  return <span className={`chg ${cls}`} title={title}>{pct(v, lang)}</span>;
}
