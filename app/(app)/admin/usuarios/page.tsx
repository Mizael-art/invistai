import { adminListUsers } from "@/services/calls";
import { getSessionUser } from "@/services/session";
import { clock } from "@/lib/format";
import { AdminToggle } from "@/features/admin/AdminToggle";

export default async function AdminUsers({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const q = (sp.q ?? "").slice(0, 80); const page = Math.max(0, Number(sp.p) || 0);
  const [users, me] = await Promise.all([adminListUsers(q, page * 50), getSessionUser()]);
  return (<>
    <div className="page-h"><div><h1>Usuários</h1><p className="mt" style={{ margin: "6px 0 0" }}>Plano efetivo calculado no banco · dados pessoais visíveis só para administradores</p></div></div>
    <form className="row cv-filters" action="/admin/usuarios" method="get" role="search"><label className="sr" htmlFor="uq">Buscar</label><input id="uq" name="q" defaultValue={q} placeholder="E-mail ou nome" /><button className="btn s">Buscar</button></form>
    {!users ? <p className="note" role="alert">Não foi possível carregar os usuários.</p> : users.length === 0 ? <p className="note">Nenhum usuário encontrado.</p> :
      <div className="card"><div className="tw"><table data-testid="adm-users"><thead><tr><th>Usuário</th><th>Plano</th><th>Assinatura</th><th>IA</th><th>Desde</th><th>Admin</th></tr></thead>
        <tbody>{users.map((u) => <tr key={u.id}><td><b>{u.name ?? "—"}</b><div className="src">{u.email}</div></td><td><span className={`bd ${u.plan === "free" ? "v" : ""}`}>{u.plan.toUpperCase()}</span></td>
          <td className="src">{u.sub_status ?? "—"}{u.period_end ? ` · até ${clock(u.period_end, "pt")}` : ""}</td><td className="num">{u.ai_used}</td><td className="src">{clock(u.created_at, "pt")}</td>
          <td>{u.is_admin && <span className="bd">admin</span>} <AdminToggle id={u.id} admin={u.is_admin} self={u.id === me?.id} /></td></tr>)}</tbody></table></div></div>}
    <p className="src">Bloqueio/suspensão de contas ainda não implementado: exige a chave de serviço do Supabase (Auth Admin) num backend separado — ver relatório.</p>
  </>);
}
