import { adminListUsers } from "@/services/calls";
import { getSessionUser } from "@/services/session";
import { clock } from "@/lib/format";
import { AdminToggle } from "@/features/admin/AdminToggle";
import { PlanControl } from "@/features/admin/PlanControl";

const day = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" });
const paidPlan = (u: { sub_plan: string | null; sub_status: string | null; period_end: string | null }) =>
  u.sub_plan && u.sub_plan !== "free" && ["active", "trialing", "past_due"].includes(u.sub_status ?? "") && (!u.period_end || Date.parse(u.period_end) > Date.now()) ? u.sub_plan : "free";

export default async function AdminUsers({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const q = (sp.q ?? "").slice(0, 80); const page = Math.max(0, Number(sp.p) || 0);
  const [users, me] = await Promise.all([adminListUsers(q, page * 50), getSessionUser()]);
  return (<>
    <div className="page-h"><div><h1>Usuários</h1><p className="mt" style={{ margin: "6px 0 0" }}>Plano efetivo calculado no banco · dados pessoais visíveis só para administradores</p></div></div>
    <form className="row cv-filters" action="/admin/usuarios" method="get" role="search"><label className="sr" htmlFor="uq">Buscar</label><input id="uq" name="q" defaultValue={q} placeholder="E-mail ou nome" /><button className="btn s">Buscar</button></form>
    {!users ? <p className="note" role="alert">Não foi possível carregar os usuários.</p> : users.length === 0 ? <p className="note">Nenhum usuário encontrado.</p> :
      <div className="card"><table className="adm-users" data-testid="adm-users"><thead><tr><th>Usuário</th><th>Plano</th><th>Alterar plano</th><th>IA</th><th>Desde</th><th>Admin</th></tr></thead>
        <tbody>{users.map((u) => { const paid = paidPlan(u); return (<tr key={u.id}>
          <td data-l="Usuário"><b>{u.name ?? "—"}</b><div className="src au-mail">{u.email}</div></td>
          <td data-l="Plano"><span className={`bd ${u.plan === "free" ? "v" : ""}`} data-testid="adm-plan-badge">{u.plan.toUpperCase()}</span>
            <div className="src" data-testid="adm-plan-src">{u.grant_plan ? `cortesia ${u.grant_plan.toUpperCase()}${u.grant_expires ? ` até ${day(u.grant_expires)}` : " · sem prazo"}` : null}
              {u.grant_plan && paid !== "free" ? " · " : null}{paid !== "free" ? `pago ${paid.toUpperCase()}${u.period_end ? ` até ${day(u.period_end)}` : ""}` : null}
              {!u.grant_plan && paid === "free" && u.sub_status && u.sub_status !== "none" ? `assinatura ${u.sub_status}` : null}</div></td>
          <td data-l="Alterar plano"><PlanControl id={u.id} email={u.email} grant={u.grant_plan} paid={paid} /></td>
          <td data-l="Mensagens IA" className="num">{u.ai_used}</td><td data-l="Desde" className="src">{clock(u.created_at, "pt")}</td>
          <td data-l="Admin">{u.is_admin && <span className="bd">admin</span>} <AdminToggle id={u.id} admin={u.is_admin} self={u.id === me?.id} /></td></tr>); })}</tbody></table></div>}
    <p className="src">“Alterar plano” libera PRO/MAX como cortesia (sem cobrança, registrado na auditoria) e não mexe em assinatura paga. Bloqueio/suspensão de contas ainda não implementado: exige a chave de serviço do Supabase (Auth Admin) num backend separado.</p>
  </>);
}
