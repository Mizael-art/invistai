import type { Metadata } from "next";
import { adminAudit, adminOverview } from "@/services/calls";
import { brl } from "@/lib/plans";
import { clock } from "@/lib/format";

export const metadata: Metadata = { title: "Admin — TRADEON" };
type O = { users: number; plans: Record<string, number> | null; subscriptions: Record<string, number> | null; mrr_cents: number; canceled_30d: number;
  payments_30d: Record<string, { n: number; cents: number }> | null; ai_30d: { requests: number; errors: number; blocked: number; input_tokens: number; output_tokens: number; avg_latency_ms: number | null } | null;
  calls: Record<string, number> | null; generated_at: string };
const ACT: Record<string, string> = { "vip_call.create": "Call criada", "vip_call.publish": "Call publicada", "vip_call.update": "Call editada", "vip_call.tp_hit": "Alvo registrado", "vip_call.close": "Call encerrada", "vip_call.cancel": "Call cancelada", "vip_call.note": "Nota na call", "admin.grant": "Admin concedido", "admin.revoke": "Admin removido" };

export default async function AdminHome() {
  const [o, audit] = await Promise.all([adminOverview() as Promise<O | null>, adminAudit(20)]);
  if (!o) return <p className="note" role="alert">Não foi possível carregar os indicadores.</p>;
  const k: [string, string, string?][] = [
    ["Usuários", String(o.users)], ["FREE / PRO / MAX", `${o.plans?.free ?? 0} / ${o.plans?.pro ?? 0} / ${o.plans?.max ?? 0}`],
    ["Receita recorrente (MRR)", brl(o.mrr_cents), "Soma dos preços dos planos pagos vigentes (não inclui impostos/taxas)"], ["Cancelamentos (30 dias)", String(o.canceled_30d)],
    ["Pagamentos pagos (30 dias)", `${o.payments_30d?.paid?.n ?? 0} · ${brl(o.payments_30d?.paid?.cents ?? 0)}`], ["Pagamentos recusados (30 dias)", String(o.payments_30d?.failed?.n ?? 0)],
    ["IA: requisições (30 dias)", String(o.ai_30d?.requests ?? 0), `${o.ai_30d?.errors ?? 0} erros · ${o.ai_30d?.blocked ?? 0} bloqueios por cota`],
    ["IA: tokens (entrada / saída)", `${(o.ai_30d?.input_tokens ?? 0).toLocaleString("pt-BR")} / ${(o.ai_30d?.output_tokens ?? 0).toLocaleString("pt-BR")}`, o.ai_30d?.avg_latency_ms ? `Latência média ${o.ai_30d.avg_latency_ms} ms` : undefined],
    ["Calls ativas / encerradas", `${o.calls?.active ?? 0} / ${o.calls?.closed ?? 0}`, `${o.calls?.draft ?? 0} rascunhos · ${o.calls?.canceled ?? 0} canceladas`],
  ];
  return (<>
    <div className="page-h"><div><h1>Administração</h1><p className="mt" style={{ margin: "6px 0 0" }}>Indicadores calculados no banco · {clock(o.generated_at, "pt")}</p></div></div>
    <div className="cv-kpis" data-testid="adm-kpis">{k.map(([t, v, s]) => <div key={t} className="card cv-kpi"><span className="src">{t}</span><b className="num">{v}</b>{s && <small className="src">{s}</small>}</div>)}</div>
    <section className="card"><h2 className="cv-h">Auditoria recente</h2>{!audit?.length ? <p className="mt">Nenhuma ação administrativa registrada.</p> :
      <div className="tw"><table data-testid="adm-audit"><thead><tr><th>Quando</th><th>Ação</th><th>Alvo</th></tr></thead><tbody>{audit.map((a) => <tr key={a.id}><td>{clock(a.created_at, "pt")}</td><td>{ACT[a.action] ?? a.action}</td><td className="src">{a.target_type} {a.target_id?.slice(0, 8)}</td></tr>)}</tbody></table></div>}</section>
  </>);
}
