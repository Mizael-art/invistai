import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getPrefs } from "@/lib/i18n/server";
import { dict } from "@/lib/i18n/dictionary";
import { clock } from "@/lib/format";
import { getEntitlements } from "@/services/subscription";
import { isAdmin } from "@/services/calls";
import { listConnections, loadSnapshot, type Conn } from "@/services/broker";
import { can } from "@/lib/plans";
import { vaultReady } from "@/lib/broker/vault";
import { Paywall } from "@/features/calls/Paywall";
import { ConnectForm } from "@/features/broker/ConnectForm";
import { ConnActions } from "@/features/broker/ConnActions";
import type { AccountSnapshot } from "@/lib/broker/types";

export const metadata: Metadata = { title: "Corretora — TRADEON" };
export const dynamic = "force-dynamic";
const NAME = { bybit: "Bybit", binance: "Binance" } as const;
const ERR: Record<string, string> = { invalid_key: "A chave foi recusada pela corretora (inválida, expirada ou revogada). Desconecte e conecte uma nova.", withdraw_enabled: "A chave passou a ter permissão de saque — leitura bloqueada por segurança. Remova a permissão de saque ou crie outra chave.",
  read_disabled: "A chave perdeu a permissão de leitura.", permission_denied: "A corretora recusou a chave (permissão/IP).", ip_not_allowed: "A corretora bloqueou o acesso por IP.", rate_limited: "A corretora limitou as consultas. Tente em instantes.",
  unavailable: "A corretora não respondeu agora.", vault_unavailable: "Cofre de credenciais indisponível no servidor.", not_found: "Conexão não encontrada." };
const usd = (n: number | null, d = 2) => (n === null ? "—" : `US$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d })}`);
const qty = (n: number | null) => (n === null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: n >= 100 ? 2 : 8 }));
const px = (n: number | null) => (n === null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: n >= 100 ? 2 : n >= 1 ? 4 : 8 }));
const pnl = (n: number | null, suffix = "") => (n === null ? <span>—</span> : <b className={n > 0 ? "up" : n < 0 ? "dn" : ""}>{n > 0 ? "+" : ""}{n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{suffix}</b>);

/** Minha corretora (MAX): conexões e visão da conta igual à corretora — saldos, P&L, posições, ordens e histórico. */
export default async function Corretora({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ent = await getEntitlements(); if (!ent) redirect("/login?next=%2Fcorretora");
  const { lang } = await getPrefs(); const l = dict[lang] as unknown as Record<string, string>;
  if (!can(ent.plan, "broker_api") && !(await isAdmin())) return <Paywall l={l} feature="broker_api" />;
  const conns = await listConnections(); const sel = (await searchParams).c;
  const cur = conns?.find((c) => c.id === sel) ?? conns?.[0] ?? null;
  return (<>
    <div className="page-h"><div><h1>Minha corretora</h1><p className="mt" style={{ margin: "6px 0 0" }}>Saldos, P&L, posições, ordens e histórico direto da sua conta — somente leitura.</p></div></div>
    {!vaultReady() && <p className="note" role="alert">Conexão com corretoras ainda não configurada no servidor (chave do cofre ausente).</p>}
    {conns && conns.length > 0 && <nav className="ctabs" aria-label="Conexões" data-testid="bk-tabs">{conns.map((c) => <Link key={c.id} href={`/corretora?c=${c.id}`} className={cur?.id === c.id ? "on" : ""}>{NAME[c.exchange]}{c.label ? ` · ${c.label}` : ""}{c.status === "invalid" ? " ⚠" : ""}</Link>)}<Link href="/corretora?c=new" className={sel === "new" ? "on" : ""}>+ Conectar</Link></nav>}
    {conns === null ? <p className="note" role="alert">Não foi possível carregar suas conexões.</p>
      : !cur || sel === "new" ? <div className="bk-new"><ConnectForm /></div>
      : <Suspense key={cur.id} fallback={<div className="card"><p className="mt">Consultando {NAME[cur.exchange]}…</p></div>}><Account conn={cur} userId={ent.user.id} lang={lang} /></Suspense>}
  </>);
}

async function Account({ conn, userId, lang }: { conn: Conn; userId: string; lang: "pt" | "en" }) {
  const r = await loadSnapshot(userId, conn.id);
  const head = (<div className="card bk-conn"><div className="row sp"><div><b>{NAME[conn.exchange]}{conn.label ? ` · ${conn.label}` : ""}</b> <span className="src">chave {conn.key_hint}</span>
    <div className="row" style={{ gap: 6, marginTop: 6 }}><span className={`bd ${conn.status === "active" && r.ok ? "" : "r"}`}>{conn.status === "active" && r.ok ? "Conectada" : "Com problema"}</span>
      <span className="bd v">Leitura</span>{(r.ok ? r.data.permissions.spotTrade || r.data.permissions.futuresTrade : conn.can_trade) && <span className="bd a">Negociação habilitada</span>}<span className="bd v">Saque bloqueado</span></div></div>
    <ConnActions id={conn.id} name={NAME[conn.exchange]} /></div></div>);
  if (!r.ok) return <>{head}<p className="note" role="alert" data-testid="bk-snap-err">{ERR[r.code] ?? ERR.unavailable}</p></>;
  const s = r.data;
  return (<div className="bk" data-testid="bk-account">
    {head}
    <div className="cv-kpis" data-testid="bk-kpis">
      <div className="card cv-kpi"><span className="src">Patrimônio</span><b className="num" data-testid="bk-equity">{usd(s.equityUsd)}</b></div>
      <div className="card cv-kpi"><span className="src">Disponível</span><b className="num">{usd(s.availableUsd)}</b></div>
      <div className="card cv-kpi"><span className="src">P&L não realizado</span><span className="num bk-big" data-testid="bk-upnl">{pnl(s.unrealizedPnlUsd, " US$")}</span></div>
      <div className="card cv-kpi"><span className="src">P&L realizado (7 dias)</span><span className="num bk-big" data-testid="bk-rpnl">{pnl(s.realizedPnl7dUsd, " US$")}</span></div>
    </div>
    {s.errors.length > 0 && <p className="note" role="status" data-testid="bk-partial">Algumas seções não puderam ser lidas agora: {[...new Set(s.errors.map((e) => SEC[e.section] ?? e.section))].join(", ")}.</p>}
    <section className="card"><h2 className="cv-h">Posições abertas ({s.positions.length})</h2>{s.positions.length === 0 ? <p className="mt">Nenhuma posição aberta.</p> :
      <div className="tw"><table data-testid="bk-positions"><thead><tr><th>Ativo</th><th>Lado</th><th>Tamanho</th><th>Entrada</th><th>Marca</th><th>P&L</th><th className="hs">Liq.</th></tr></thead>
        <tbody>{s.positions.map((p) => <tr key={p.symbol + p.side}><td><b>{p.symbol}</b><div className="src">{p.market}{p.leverage ? ` · ${p.leverage}x` : ""}</div></td><td><span className={`cv-dir ${p.side}`}>{p.side === "long" ? "LONG" : "SHORT"}</span></td>
          <td className="num">{qty(p.size)}</td><td className="num">{px(p.entry)}</td><td className="num">{px(p.mark)}</td><td className="num">{pnl(p.pnl)}{p.pnlPct !== null && <div className="src">{p.pnlPct > 0 ? "+" : ""}{p.pnlPct.toFixed(2)}%</div>}</td><td className="num hs">{px(p.liq)}</td></tr>)}</tbody></table></div>}</section>
    <section className="card"><h2 className="cv-h">Saldos</h2>{s.balances.length === 0 ? <p className="mt">Sem saldo.</p> :
      <div className="tw"><table data-testid="bk-balances"><thead><tr><th>Ativo</th><th>Total</th><th>Disponível</th><th>Valor (US$)</th></tr></thead>
        <tbody>{s.balances.slice(0, 30).map((b) => <tr key={b.account + b.asset}><td><b>{b.asset}</b><div className="src">{b.account}</div></td><td className="num">{qty(b.total)}</td><td className="num">{qty(b.free)}</td><td className="num">{usd(b.usdValue)}</td></tr>)}</tbody></table></div>}</section>
    <section className="card"><h2 className="cv-h">Ordens abertas ({s.openOrders.length})</h2>{s.openOrders.length === 0 ? <p className="mt">Nenhuma ordem aberta.</p> :
      <div className="tw"><table data-testid="bk-orders"><thead><tr><th>Ativo</th><th>Lado</th><th>Tipo</th><th>Preço</th><th>Qtd.</th><th className="hs">Criada</th></tr></thead>
        <tbody>{s.openOrders.map((o) => <tr key={o.id}><td><b>{o.symbol}</b>{o.reduceOnly && <div className="src">reduzir posição</div>}</td><td className={o.side === "buy" ? "up" : "dn"}>{o.side === "buy" ? "Compra" : "Venda"}</td><td>{o.type}</td><td className="num">{px(o.price)}</td><td className="num">{qty(o.qty)}</td><td className="src hs">{clock(o.createdAt, lang)}</td></tr>)}</tbody></table></div>}</section>
    <section className="card"><h2 className="cv-h">P&L realizado — últimos 7 dias</h2>{s.closedPnl.length === 0 ? <p className="mt">Nenhuma posição encerrada no período.</p> :
      <div className="tw"><table data-testid="bk-closed"><thead><tr><th>Ativo</th><th>Entrada → Saída</th><th>P&L (US$)</th><th>Quando</th></tr></thead>
        <tbody>{s.closedPnl.slice(0, 50).map((c, i) => <tr key={i}><td><b>{c.symbol}</b></td><td className="num">{c.entry !== null ? `${px(c.entry)} → ${px(c.exit)}` : "—"}</td><td className="num">{pnl(c.pnl)}</td><td className="src">{clock(c.time, lang)}</td></tr>)}</tbody></table></div>}</section>
    <section className="card"><h2 className="cv-h">Histórico de trades</h2>{s.trades.length === 0 ? <p className="mt">Nenhuma execução recente.</p> :
      <div className="tw"><table data-testid="bk-trades"><thead><tr><th>Ativo</th><th>Lado</th><th>Preço</th><th>Qtd.</th><th className="hs">Taxa</th><th>Quando</th></tr></thead>
        <tbody>{s.trades.map((t) => <tr key={t.id + t.market}><td><b>{t.symbol}</b><div className="src">{t.market}</div></td><td className={t.side === "buy" ? "up" : "dn"}>{t.side === "buy" ? "Compra" : "Venda"}</td><td className="num">{px(t.price)}</td><td className="num">{qty(t.qty)}</td><td className="num hs">{t.fee !== null ? `${qty(t.fee)} ${t.feeAsset ?? ""}` : "—"}</td><td className="src">{clock(t.time, lang)}</td></tr>)}</tbody></table></div>}</section>
    <p className="src">Fonte: API oficial da {NAME[s.exchange]} · consultado em {clock(s.fetchedAt, lang)} · valores em US$ conforme a corretora. Somente leitura: a TRADEON não move fundos.</p>
  </div>);
}
const SEC: Record<string, string> = { balances: "saldos", positions: "posições", orders: "ordens", trades: "histórico de trades", closed_pnl: "P&L realizado", futures: "conta de futuros" };
