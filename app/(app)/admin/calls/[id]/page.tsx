import Link from "next/link";
import { notFound } from "next/navigation";
import { getCall } from "@/services/calls";
import { dict } from "@/lib/i18n/dictionary";
import { clock } from "@/lib/format";
import { CallCard } from "@/features/calls/CallCard";
import { CallForm } from "@/features/admin/CallForm";
import { CallActions } from "@/features/admin/CallActions";

const OK: Record<string, string> = { published: "Call publicada e assinantes notificados.", draft: "Rascunho salvo (não visível aos assinantes).", saved: "Alterações salvas." };
export default async function AdminCall({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const r = await getCall((await params).id); if (!r) notFound(); const ok = (await searchParams).ok;
  const { call: c, events } = r; const l = dict.pt as unknown as Record<string, string>; const editable = c.status === "draft" || c.status === "active";
  return (<>
    <div className="page-h"><div><Link href="/admin/calls" className="src">← Calls</Link><h1 style={{ marginTop: 6 }}>{c.direction.toUpperCase()} · {c.symbol}</h1></div>{c.status !== "draft" && <Link href={`/calls/${c.id}`} className="btn s">Ver como assinante</Link>}</div>
    {ok && OK[ok] && <p className="note" role="status" data-testid="adm-ok">{OK[ok]}</p>}
    <div className="cv-detail">
      <div style={{ display: "grid", gap: 16, alignContent: "start" }}><CallCard c={c} l={l} lang="pt" />{editable && <><h2 className="cv-h">Editar</h2><CallForm call={c} /></>}</div>
      <div style={{ display: "grid", gap: 16, alignContent: "start" }}>{editable && <CallActions c={c} />}
        <section className="card"><h2 className="cv-h">Histórico</h2><ol className="cv-tl">{events.map((e) => <li key={e.id}><b>{l[`cv.ev.${e.type}`]}{e.tp_index ? ` TP${e.tp_index}` : ""}</b>{e.price !== null && <span className="num"> · {e.price}</span>}<span className="src"> · {clock(e.created_at, "pt")}</span>{e.note && <p className="src" style={{ margin: "2px 0 0" }}>{e.note}</p>}</li>)}</ol></section></div>
    </div>
  </>);
}
