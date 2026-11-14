"use client";
import { useEffect, useRef, useState } from "react";
import { buildTvConfig, PERIODS, TV_SCRIPT, type ChartStyle, type PeriodKey } from "@/services/market/tradingview";

type L = Record<"loading" | "failed" | "retry" | "period" | "type" | "candles" | "line" | "attrib" | "p1D" | "p5D" | "p1M" | "p6M" | "p1A" | "pALL", string>;
export function TradingViewChart({ symbol, theme, lang, labels }: { symbol: string; theme: "dark" | "light"; lang: "pt" | "en"; labels: L }) {
  const host = useRef<HTMLDivElement>(null);
  const [period, setPeriod] = useState<PeriodKey>("1M");
  const [style, setStyle] = useState<ChartStyle>("candles");
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const el = host.current; if (!el) return;
    setStatus("loading"); el.innerHTML = "";
    const wrap = document.createElement("div"); wrap.className = "tradingview-widget-container"; wrap.style.cssText = "height:100%;width:100%";
    const inner = document.createElement("div"); inner.className = "tradingview-widget-container__widget"; inner.style.cssText = "height:calc(100% - 22px);width:100%";
    const copy = document.createElement("div"); copy.className = "tradingview-widget-copyright";
    const a = document.createElement("a"); a.href = "https://www.tradingview.com/"; a.target = "_blank"; a.rel = "noopener nofollow"; a.textContent = "Track all markets on TradingView"; copy.append(a);
    const script = document.createElement("script"); script.type = "text/javascript"; script.async = true; script.src = TV_SCRIPT;
    script.dataset.tvConfig = "1"; script.text = JSON.stringify(buildTvConfig({ symbol, theme, lang, period, style }));
    script.onerror = () => setStatus("failed");
    wrap.append(inner, copy, script); el.append(wrap);
    const obs = new MutationObserver(() => { if (el.querySelector("iframe")) { setStatus("ready"); obs.disconnect(); clearTimeout(t); } });
    obs.observe(el, { childList: true, subtree: true });
    const t = setTimeout(() => setStatus((s) => (s === "ready" ? s : "failed")), 15000);
    return () => { clearTimeout(t); obs.disconnect(); el.innerHTML = ""; };
  }, [symbol, theme, lang, period, style, attempt]);

  const pl = (k: PeriodKey) => labels[`p${k}` as keyof L];
  return (<div>
    <div className="row sp" style={{ marginBottom: 10 }}>
      <div className="row" role="group" aria-label={labels.period}>{PERIODS.map((p) => (
        <button key={p.key} className={`chip ${period === p.key ? "on" : ""}`} aria-pressed={period === p.key} onClick={() => setPeriod(p.key)}>{pl(p.key)}</button>))}</div>
      <div className="row" role="group" aria-label={labels.type}>{(["candles", "line"] as const).map((k) => (
        <button key={k} className={`chip ${style === k ? "on" : ""}`} aria-pressed={style === k} onClick={() => setStyle(k)}>{labels[k]}</button>))}</div>
    </div>
    <div className="tvbox" style={{ position: "relative" }}>
      <div ref={host} data-testid="tv-host" style={{ height: "100%", width: "100%" }} />
      {status === "loading" && <div className="note" role="status" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>{labels.loading}</div>}
      {status === "failed" && <div className="note" role="alert" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", background: "var(--sf)" }}>
        <div><p>{labels.failed}</p><button className="btn" onClick={() => setAttempt((n) => n + 1)}>{labels.retry}</button></div></div>}
    </div>
    <p className="src">{labels.attrib}</p>
  </div>);
}
