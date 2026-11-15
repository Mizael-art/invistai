import Link from "next/link";
import { clock, type Lang } from "@/lib/format";
import { movePct, targets, type VipCall } from "@/lib/calls";

type L = Record<string, string>;
/** Número no formato do mercado: sem casas desnecessárias, mantendo precisão de ativos baratos. */
export function lv(n: number | null, lang: Lang) {
  if (n === null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(lang === "pt" ? "pt-BR" : "en-US", { maximumFractionDigits: n >= 100 ? 2 : n >= 1 ? 4 : 8 }).format(n);
}
export const sgn = (n: number | null, lang: Lang) => (n === null ? "—" : `${n > 0 ? "+" : ""}${new Intl.NumberFormat(lang === "pt" ? "pt-BR" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}%`);

export function StatusPill({ c, l, lang }: { c: VipCall; l: L; lang: Lang }) {
  if (c.status === "active") return <span className="cv-st live" data-testid="cv-status">● {l["cv.st.active"]}{c.targets_hit ? ` · TP${c.targets_hit} ✓` : ""}</span>;
  if (c.status === "canceled") return <span className="cv-st cx" data-testid="cv-status">{l["cv.st.canceled"]}</span>;
  if (c.status === "draft") return <span className="cv-st cx" data-testid="cv-status">{l["cv.st.draft"]}</span>;
  const g = c.gross_result_pct ?? 0;
  return <span className={`cv-st ${g > 0 ? "pos" : g < 0 ? "neg" : "cx"}`} data-testid="cv-status">{c.close_reason === "stop" ? l["cv.st.stop"] : l["cv.st.closed"]} · {sgn(c.gross_result_pct, lang)}</span>;
}

export function CallCard({ c, l, lang, href }: { c: VipCall; l: L; lang: Lang; href?: string }) {
  const tps = targets(c);
  const body = (<>
    <div className="row sp cv-top"><div className="row" style={{ gap: 10 }}><span className={`cv-dir ${c.direction}`}>{c.direction.toUpperCase()}</span><b className="cv-sym">{c.symbol}</b></div>
      <span className="src">{clock(c.published_at ?? c.created_at, lang)}</span></div>
    <div className="cv-grid">
      <div className="cv-k"><span>{l["cv.entry"]}</span><b className="num">{lv(c.entry, lang)}</b></div>
      <div className="cv-k stop"><span>Stop</span><b className="num">{lv(c.stop, lang)}</b><small>{sgn(movePct(c, c.stop), lang)}</small></div>
      {tps.map((t, i) => <div key={i} className={`cv-k tp ${c.targets_hit > i ? "hit" : ""}`}><span>TP{i + 1}{c.targets_hit > i ? " ✓" : ""}</span><b className="num">{lv(t, lang)}</b><small>{sgn(movePct(c, t), lang)}</small></div>)}
    </div>
    <div className="row sp cv-foot">{c.leverage ? <span className="chip sm">{l["cv.lev"]} <b>{lv(c.leverage, lang)}x</b></span> : <span className="src">{l[`cv.m.${c.market}`]}</span>}<StatusPill c={c} l={l} lang={lang} /></div>
  </>);
  return href ? <Link href={href} className="card cv-card" data-testid="cv-card" data-status={c.status}>{body}</Link> : <section className="card cv-card" data-testid="cv-card" data-status={c.status}>{body}</section>;
}
