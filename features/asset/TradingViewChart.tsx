"use client";
import { useEffect, useRef, useState } from "react";
import { buildTvConfig, INTERVALS, DEFAULT_INTERVAL, EMA_LENGTHS, TV_SCRIPT, isIntervalKey, type ChartStyle, type IntervalKey } from "@/services/market/tradingview";

type L = Record<"loading" | "failed" | "retry" | "period" | "type" | "candles" | "line" | "attrib" | "more" | "indicators" | "emaLegend", string> & Partial<Record<`i.${IntervalKey}`, string>>;
const PREF = "iv_chart";   // tempo/tipo/indicadores lembrados neste navegador (conveniência; nada vai para o servidor)

/** Gráfico do ativo (widget oficial do TradingView) com barra de tempos no estilo de corretora:
 *  15m · 1h · 4h · 1D visíveis, "Mais" com 1m/5m/30m/2h/1S/1M, velas ou linha e EMAs 7/14/28 + volume. */
export function TradingViewChart({ symbol, theme, lang, labels }: { symbol: string; theme: "dark" | "light"; lang: "pt" | "en"; labels: L }) {
  const host = useRef<HTMLDivElement>(null); const moreBtn = useRef<HTMLButtonElement>(null);
  const [interval, setIntervalKey] = useState<IntervalKey>(DEFAULT_INTERVAL);
  const [style, setStyle] = useState<ChartStyle>("candles");
  const [indicators, setIndicators] = useState(true);
  const [more, setMore] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {                                     // preferências salvas (se houver); tolera armazenamento bloqueado
    try { const p = JSON.parse(localStorage.getItem(PREF) || "{}"); if (isIntervalKey(p.i)) setIntervalKey(p.i); if (p.s === "line" || p.s === "candles") setStyle(p.s); if (typeof p.e === "boolean") setIndicators(p.e); } catch { /* sem preferências */ }
    setLoaded(true);
  }, []);
  useEffect(() => { if (!loaded) return; try { localStorage.setItem(PREF, JSON.stringify({ i: interval, s: style, e: indicators })); } catch { /* ignora */ } }, [interval, style, indicators, loaded]);
  useEffect(() => {
    if (!more) return;
    const close = (e: Event) => { if (e instanceof KeyboardEvent && e.key !== "Escape") return; if (e instanceof MouseEvent && (e.target as HTMLElement).closest(".tf-more")) return; setMore(false); if (e instanceof KeyboardEvent) moreBtn.current?.focus(); };
    document.addEventListener("keydown", close); document.addEventListener("mousedown", close);
    return () => { document.removeEventListener("keydown", close); document.removeEventListener("mousedown", close); };
  }, [more]);

  useEffect(() => {
    const el = host.current; if (!el || !loaded) return;
    setStatus("loading"); el.innerHTML = "";
    const wrap = document.createElement("div"); wrap.className = "tradingview-widget-container"; wrap.style.cssText = "height:100%;width:100%";
    const inner = document.createElement("div"); inner.className = "tradingview-widget-container__widget"; inner.style.cssText = "height:calc(100% - 22px);width:100%";
    const copy = document.createElement("div"); copy.className = "tradingview-widget-copyright";
    const a = document.createElement("a"); a.href = "https://www.tradingview.com/"; a.target = "_blank"; a.rel = "noopener nofollow"; a.textContent = "Track all markets on TradingView"; copy.append(a);
    const script = document.createElement("script"); script.type = "text/javascript"; script.async = true; script.src = TV_SCRIPT;
    script.dataset.tvConfig = "1"; script.text = JSON.stringify(buildTvConfig({ symbol, theme, lang, interval, style, indicators }));
    script.onerror = () => setStatus("failed");
    wrap.append(inner, copy, script); el.append(wrap);
    const obs = new MutationObserver(() => { if (el.querySelector("iframe")) { setStatus("ready"); obs.disconnect(); clearTimeout(t); } });
    obs.observe(el, { childList: true, subtree: true });
    const t = setTimeout(() => setStatus((s) => (s === "ready" ? s : "failed")), 15000);
    return () => { clearTimeout(t); obs.disconnect(); el.innerHTML = ""; };
  }, [symbol, theme, lang, interval, style, indicators, attempt, loaded]);

  const lab = (k: IntervalKey) => labels[`i.${k}`] ?? k;
  const extra = INTERVALS.filter((i) => !i.main), extraOn = extra.some((i) => i.key === interval);
  return (<div className="tvchart">
    <div className="tf-bar">
      <div className="tf" role="group" aria-label={labels.period}>
        <button type="button" className={style === "line" ? "on" : ""} aria-pressed={style === "line"} onClick={() => setStyle(style === "line" ? "candles" : "line")} title={labels.line}>{labels.line}</button>
        {INTERVALS.filter((i) => i.main).map((i) => (
          <button key={i.key} type="button" className={interval === i.key ? "on" : ""} aria-pressed={interval === i.key} onClick={() => { setIntervalKey(i.key); setMore(false); }}>{lab(i.key)}</button>))}
        <span className="tf-more">
          <button ref={moreBtn} type="button" className={extraOn ? "on" : ""} aria-haspopup="menu" aria-expanded={more} onClick={() => setMore((v) => !v)} data-testid="tf-more">
            {extraOn ? lab(interval) : labels.more} <span aria-hidden="true" className="caret">▾</span></button>
          {more && <div className="tf-menu" role="menu" aria-label={labels.more}>{extra.map((i) => (
            <button key={i.key} type="button" role="menuitemradio" aria-checked={interval === i.key} className={interval === i.key ? "on" : ""} onClick={() => { setIntervalKey(i.key); setMore(false); moreBtn.current?.focus(); }}>{lab(i.key)}</button>))}</div>}
        </span>
      </div>
      <div className="tf tf-r" role="group" aria-label={labels.type}>
        <button type="button" className={style === "candles" ? "on" : ""} aria-pressed={style === "candles"} onClick={() => setStyle("candles")} aria-label={labels.candles} title={labels.candles}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M7 3v4M7 17v4M17 3v6M17 17v4" /><rect x="4.5" y="7" width="5" height="10" rx="1" /><rect x="14.5" y="9" width="5" height="8" rx="1" /></svg></button>
        <button type="button" className={indicators ? "on" : ""} aria-pressed={indicators} onClick={() => setIndicators((v) => !v)} title={labels.emaLegend}>{labels.indicators} <span className="mt" style={{ fontWeight: 500 }}>EMA {EMA_LENGTHS.join("/")}</span></button>
      </div>
    </div>
    <div className="tvbox" style={{ position: "relative" }}>
      <div ref={host} data-testid="tv-host" style={{ height: "100%", width: "100%" }} />
      {status === "loading" && <div className="note" role="status" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none", borderRadius: 0 }}>{labels.loading}</div>}
      {status === "failed" && <div className="note" role="alert" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", background: "var(--sf)", borderRadius: 0 }}>
        <div><p>{labels.failed}</p><button className="btn" onClick={() => setAttempt((n) => n + 1)}>{labels.retry}</button></div></div>}
    </div>
    <p className="src">{labels.attrib}</p>
  </div>);
}
