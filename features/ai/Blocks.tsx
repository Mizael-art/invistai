import type { Block } from "@/lib/ai/tools";
import { clock, pct, type Lang } from "@/lib/format";
import { LineChart } from "@/components/ui/LineChart";
import { Chg } from "@/components/ui/Chg";

/** Cartões visuais montados a partir dos dados REAIS que as ferramentas retornaram (não do texto do modelo). */
type L = Record<string, string>;
const FIAT = new Set(["USD", "BRL", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "MXN", "CNY", "ZAR"]);
export function px(n: number | null, cur: string, lang: Lang) {
  if (n === null || !Number.isFinite(n)) return "—";
  const d = n >= 1000 ? 2 : n >= 1 ? 4 : Math.min(8, Math.max(4, 2 - Math.floor(Math.log10(n)) + 3));
  const s = new Intl.NumberFormat(lang === "pt" ? "pt-BR" : "en-US", { minimumFractionDigits: n >= 1000 ? 2 : 2, maximumFractionDigits: d }).format(n);
  return FIAT.has(cur) ? `${cur === "USD" ? "US$" : cur === "BRL" ? "R$" : cur} ${s}` : `${s} ${cur}`;
}
const VCLS: Record<string, string> = { alta: "", baixa: "r", aguardar: "a", insuficiente: "v" };
const TREND: Record<string, string> = { up: "▲", down: "▼", range: "◆" };
function Src({ b, l, lang }: { b: { source: string; asOf: string }; l: L; lang: Lang }) { return <p className="src ai-src">{l["ai.source"]}: {b.source} · {clock(b.asOf, lang)}</p>; }
function Score({ v }: { v: number }) {
  const r = 18, c = 2 * Math.PI * r;
  return (<span className="ai-score" aria-label={`Score ${v}/100`}><svg width="46" height="46" viewBox="0 0 46 46" aria-hidden="true"><circle cx="23" cy="23" r={r} fill="none" stroke="var(--bd2)" strokeWidth="4" />
    <circle cx="23" cy="23" r={r} fill="none" stroke={v >= 65 ? "var(--g-tx)" : v >= 45 ? "var(--am)" : "var(--rd)"} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 23 23)" /></svg><b>{v}</b></span>);
}

export function Blocks({ blocks, l, lang }: { blocks: Block[]; l: L; lang: Lang }) {
  if (!blocks?.length) return null;
  return (<div className="ai-blocks">{blocks.map((b, i) => {
    switch (b.type) {
      case "asset": return (<section key={i} className="ai-card" data-testid="ai-asset" aria-label={b.symbol}>
        <div className="row sp"><div><b className="ai-sym">{b.symbol}</b><div className="row" style={{ gap: 8, marginTop: 4 }}><span className="num">{px(b.price, b.currency, lang)}</span>{b.changePct24h !== null && <Chg v={b.changePct24h} lang={lang} />}</div></div>
          <div className="row" style={{ gap: 10 }}><span className={`bd ${VCLS[b.verdict] ?? "v"}`} data-testid="ai-verdict">{l[`ai.v.${b.verdict}`] ?? b.verdict}</span><Score v={b.score} /></div></div>
        <p className="mt ai-regime">{b.regime} · {l["ai.confidence"]} {b.confidence}</p>
        {b.trends.length > 0 && <div className="ai-tfs">{b.trends.map((t) => <span key={t.tf} className={`ai-tf ${t.trend}`}><b>{t.tf}</b> {TREND[t.trend]} {t.bias > 0 ? "+" : ""}{t.bias}{t.rsi !== null && <small> · RSI {Math.round(t.rsi)}</small>}</span>)}</div>}
        <div className="ai-ev">
          {b.contra.length > 0 && <div><h5>{l["ai.contra"]}</h5><ul>{b.contra.map((x, j) => <li key={j} className="dn">{x}</li>)}</ul></div>}
          {b.favor.length > 0 && <div><h5>{l["ai.favor"]}</h5><ul>{b.favor.map((x, j) => <li key={j} className="up">{x}</li>)}</ul></div>}
          {b.risks.length > 0 && <div><h5>{l["ai.risks"]}</h5><ul>{b.risks.map((x, j) => <li key={j} className="rk">{x}</li>)}</ul></div>}
        </div>
        {b.reference && <div className="ai-ref"><h5>{l["ai.levels"]}</h5><div className="row" style={{ gap: 8 }}>
          {b.reference.invalidation !== null && <span className="chip sm">{l["ai.invalidation"]}: <b className="num">{px(b.reference.invalidation, b.currency, lang)}</b></span>}
          {b.reference.targets.map((t, j) => <span key={j} className="chip sm">{l["ai.target"]} {j + 1}: <b className="num">{px(t, b.currency, lang)}</b>{b.reference!.rr[j] !== null && <small className="mt"> · R/R {b.reference!.rr[j]}</small>}</span>)}
        </div><p className="src">{b.reference.note}</p></div>}
        <Src b={b} l={l} lang={lang} />
      </section>);
      case "chart": return (<section key={i} className="ai-card" data-testid="ai-chart"><div className="row sp"><b className="ai-sym">{b.symbol} · {b.tf}</b>{b.changePct !== null && <Chg v={b.changePct} lang={lang} />}</div>
        <LineChart values={b.points.map((p) => p.c)} label={`${b.symbol} ${b.tf}`} height={150} /><Src b={b} l={l} lang={lang} /></section>);
      case "scan": return (<section key={i} className="ai-card" data-testid="ai-scan"><div className="row sp"><b>{l["ai.scan"]}</b><span className="mt src">{l["ai.scanned"].replace("{n}", String(b.scanned))}</span></div>
        <ol className="ai-rank">{b.items.map((x, j) => <li key={x.symbol}><span className="ai-pos">{j + 1}</span><div style={{ minWidth: 0 }}><div className="row" style={{ gap: 8 }}><b>{x.symbol}</b><Chg v={x.changePct24h} lang={lang} /><span className={`bd ${VCLS[x.verdict] ?? "v"}`}>{l[`ai.v.${x.verdict}`] ?? x.verdict}</span></div>
          {x.highlights[0] && <p className="src" style={{ margin: "2px 0 0" }}>{x.highlights[0]}</p>}</div><span className="ai-sc num">{x.score}</span></li>)}</ol>
        {!b.items.length && <p className="mt">{l["ai.scanEmpty"]}</p>}<Src b={b} l={l} lang={lang} /></section>);
      case "compare": return (<section key={i} className="ai-card" data-testid="ai-compare"><div className="tw"><table><thead><tr><th>{l["ai.asset"]}</th><th>{l["ai.price"]}</th><th>24h</th><th>Score</th><th>{l["ai.bias"]}</th></tr></thead>
        <tbody>{b.items.map((x) => <tr key={x.symbol}><td><b>{x.symbol}</b><div className="src">{x.regime}</div></td><td className="num">{px(x.price, x.currency, lang)}</td><td>{pct(x.changePct24h, lang)}</td><td className="num">{x.score}</td><td><span className={`bd ${VCLS[x.verdict] ?? "v"}`}>{l[`ai.v.${x.verdict}`] ?? x.verdict}</span></td></tr>)}</tbody></table></div><Src b={b} l={l} lang={lang} /></section>);
      case "news": return (<section key={i} className="ai-card" data-testid="ai-news"><b>{l["ai.news"]}</b><ul className="ai-news">{b.items.map((n) => <li key={n.url}>{/^https:\/\//.test(n.url) ? <a href={n.url} target="_blank" rel="noopener noreferrer nofollow">{n.title}</a> : n.title}<span className="src"> · {n.source} · {clock(n.publishedAt, lang)}</span></li>)}</ul><Src b={b} l={l} lang={lang} /></section>);
      case "overview": return (<section key={i} className="ai-card" data-testid="ai-overview"><b>{l["ai.overview"]}</b><div className="ai-ov">{b.items.map((x) => <div key={x.symbol} className="ai-ovi"><span>{x.symbol}</span><b className="num">{px(x.price, x.currency, lang)}</b><Chg v={x.changePct24h} lang={lang} /></div>)}</div><Src b={b} l={l} lang={lang} /></section>);
    }
  })}</div>);
}
