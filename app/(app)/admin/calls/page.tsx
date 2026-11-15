import Link from "next/link";
import { listCalls } from "@/services/calls";
import { callStats } from "@/lib/calls";
import { dict } from "@/lib/i18n/dictionary";
import { CallCard, sgn } from "@/features/calls/CallCard";

export default async function AdminCalls() {
  const calls = await listCalls({ limit: 300 }); const l = dict.pt as unknown as Record<string, string>;
  if (!calls) return <p className="note" role="alert">Não foi possível carregar as calls.</p>;
  const st = callStats(calls);
  return (<>
    <div className="page-h"><div><h1>Calls VIP</h1><p className="mt" style={{ margin: "6px 0 0" }}>{st.active} ativas · {st.closed} encerradas · {calls.filter((c) => c.status === "draft").length} rascunhos · resultado médio {sgn(st.avgGrossPct, "pt")}</p></div>
      <Link href="/admin/calls/nova" className="btn" data-testid="adm-new-call">+ Nova call</Link></div>
    {calls.length === 0 ? <p className="note">Nenhuma call criada ainda.</p> : <div className="cv-list">{calls.map((c) => <CallCard key={c.id} c={c} l={l} lang="pt" href={`/admin/calls/${c.id}`} />)}</div>}
  </>);
}
