"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminTraining } from "@/services/calls";

type Probe = { configured: boolean; host?: string; model?: string; ok?: boolean; status?: number; latencyMs?: number; error?: string | null; models?: string[] };
const ERR: Record<string, string> = { admin_required: "Sua conta não é administradora.", empty_document: "O documento está vazio.", document_too_large: "Documento grande demais (máx. ~400 trechos). Divida em partes.", invalid: "Dados inválidos." };
async function post(body: object) {
  const r = await fetch("/api/admin/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); return { ok: r.ok, j };
}
/** Painel "Treinar IA": instruções, base de conhecimento (arquivos .txt/.md ou texto colado), exemplos, prévia da busca e teste de conexão. */
export function AiTraining({ t }: { t: AdminTraining }) {
  const router = useRouter(); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null); const [busy, setBusy] = useState(false);
  const [instr, setInstr] = useState(t.instructions); const [title, setTitle] = useState(""); const [source, setSource] = useState(""); const [text, setText] = useState("");
  const [q, setQ] = useState(""); const [a, setA] = useState(""); const [pq, setPq] = useState(""); const [prev, setPrev] = useState<{ title: string; content: string }[] | null>(null);
  const [probe, setProbe] = useState<{ primary: Probe; fallback: Probe } | null>(null);
  async function run(body: object, okText: string, after?: () => void) {
    setBusy(true); setMsg(null); const { ok, j } = await post(body); setBusy(false);
    if (!ok) { setMsg({ ok: false, text: ERR[j.error] ?? "Não foi possível salvar." }); return; }
    setMsg({ ok: true, text: typeof j.chunks === "number" ? `${okText} (${j.chunks} trechos indexados).` : okText }); after?.(); router.refresh();
  }
  async function files(fl: FileList | null) {
    if (!fl?.length) return; const f = fl[0];
    if (!/\.(txt|md|markdown|csv)$/i.test(f.name)) { setMsg({ ok: false, text: "Envie arquivos de texto (.txt ou .md). Para PDF/Word, copie o texto e cole abaixo." }); return; }
    if (f.size > 400_000) { setMsg({ ok: false, text: "Arquivo grande demais (máx. 400 KB). Divida em partes." }); return; }
    setText(await f.text()); if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 160));
  }
  const P = ({ p, label }: { p: Probe; label: string }) => !p.configured ? <p className="src">{label}: não configurada.</p> : (
    <div className={`note ${p.ok ? "" : ""}`} role={p.ok ? "status" : "alert"} data-testid={`probe-${label === "Principal" ? "primary" : "fallback"}`}>
      <b>{label}: {p.ok ? "conectada ✓" : "falhou ✗"}</b> <span className="src">· {p.host} · modelo <code>{p.model}</code>{p.latencyMs ? ` · ${p.latencyMs} ms` : ""}</span>
      {p.error && <p style={{ margin: "6px 0 0" }}>{p.error}</p>}
      {!!p.models?.length && <details style={{ marginTop: 6 }}><summary className="src">Modelos disponíveis nesta chave ({p.models.length})</summary><p className="src" style={{ marginTop: 6 }}>{p.models.join(" · ")}</p></details>}
    </div>);
  return (<div className="adm-ai">
    {msg && <p className="note" role={msg.ok ? "status" : "alert"} data-testid="ai-train-msg">{msg.text}</p>}
    <section className="card"><div className="row sp"><h2 className="cv-h">Conexão</h2><button type="button" className="btn s" disabled={busy} data-testid="ai-probe"
      onClick={async () => { setBusy(true); const r = await fetch("/api/admin/ai/test", { method: "POST" }); setBusy(false); if (r.ok) setProbe(await r.json()); else setMsg({ ok: false, text: "Não foi possível testar." }); }}>Testar conexão</button></div>
      <p className="src">A chave fica só no servidor (variáveis da Vercel). O teste faz uma chamada mínima e lista os modelos que a chave pode usar.</p>
      {probe && <div style={{ display: "grid", gap: 8, marginTop: 8 }}><P p={probe.primary} label="Principal" /><P p={probe.fallback} label="Reserva" /></div>}
    </section>
    <section className="card"><h2 className="cv-h">Instruções da IA</h2>
      <p className="src">Complementam as regras fixas de segurança (nunca as substituem): tom, foco, método da casa, o que destacar. {t.instructions_updated_at && `Atualizado em ${new Date(t.instructions_updated_at).toLocaleString("pt-BR")}.`}</p>
      <textarea rows={8} value={instr} onChange={(e) => setInstr(e.target.value)} maxLength={12000} data-testid="ai-instr" placeholder="Ex.: Sempre comente gestão de risco (risco por operação de 0,5% a 1%). Use linguagem simples para iniciantes. Priorize o tempo gráfico de 4h…" />
      <div className="row sp" style={{ marginTop: 8 }}><span className="src">{instr.length}/12000</span><button type="button" className="btn" disabled={busy} onClick={() => run({ action: "instructions", text: instr }, "Instruções salvas.")} data-testid="ai-instr-save">Salvar instruções</button></div>
    </section>
    <section className="card"><h2 className="cv-h">Base de conhecimento</h2>
      <p className="src">Documentos da casa (playbooks, gestão de risco, glossário, metodologia). A cada pergunta, os trechos mais relevantes são enviados à IA, que cita o documento.</p>
      <div className="af-row"><label className="af"><span>Título</span><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} data-testid="kb-title" /></label>
        <label className="af"><span>Fonte <small className="mt">(opcional)</small></span><input value={source} onChange={(e) => setSource(e.target.value)} maxLength={200} data-testid="kb-source" /></label></div>
      <label className="af"><span>Arquivo .txt / .md <small className="mt">(ou cole o texto abaixo)</small></span><input type="file" accept=".txt,.md,.markdown,.csv,text/plain,text/markdown" onChange={(e) => files(e.target.files)} data-testid="kb-file" /></label>
      <label className="af"><span>Conteúdo</span><textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} data-testid="kb-text" /></label>
      <button type="button" className="btn" disabled={busy || !title.trim() || !text.trim()} onClick={() => run({ action: "add_doc", title, source: source || undefined, text }, "Documento adicionado", () => { setTitle(""); setSource(""); setText(""); })} data-testid="kb-add">Adicionar à base</button>
      {t.docs.length === 0 ? <p className="mt" style={{ marginTop: 12 }}>Nenhum documento ainda.</p> :
        <div className="tw" style={{ marginTop: 12 }}><table data-testid="kb-docs"><thead><tr><th>Documento</th><th>Trechos</th><th>Situação</th><th /></tr></thead><tbody>{t.docs.map((d) => <tr key={d.id}>
          <td><b>{d.title}</b>{d.source && <div className="src">{d.source}</div>}<div className="src">{d.chars.toLocaleString("pt-BR")} caracteres</div></td><td className="num">{d.chunks}</td>
          <td><span className={`bd ${d.active ? "" : "v"}`}>{d.active ? "Ativo" : "Desativado"}</span></td>
          <td><div className="row" style={{ gap: 6, flexWrap: "nowrap" }}><button type="button" className="btn s sm" disabled={busy} onClick={() => run({ action: "doc", id: d.id, active: !d.active }, d.active ? "Documento desativado." : "Documento ativado.")}>{d.active ? "Desativar" : "Ativar"}</button>
            <button type="button" className="btn s sm d" disabled={busy} onClick={() => { if (confirm(`Excluir "${d.title}" da base?`)) run({ action: "doc", id: d.id, delete: true }, "Documento excluído."); }} data-testid="kb-del">Excluir</button></div></td></tr>)}</tbody></table></div>}
      <div style={{ marginTop: 14 }}><label className="af"><span>Testar busca: o que a IA receberia para esta pergunta?</span><div className="row"><input value={pq} onChange={(e) => setPq(e.target.value)} style={{ flex: 1 }} data-testid="kb-q" />
        <button type="button" className="btn s" disabled={busy || !pq.trim()} onClick={async () => { setBusy(true); const { ok, j } = await post({ action: "preview", q: pq }); setBusy(false); setPrev(ok ? j.items : []); }} data-testid="kb-preview">Buscar</button></div></label>
        {prev && (prev.length === 0 ? <p className="src" data-testid="kb-none">Nenhum trecho encontrado — a IA responderia só com as instruções e as ferramentas de dados.</p>
          : <ol className="kb-prev" data-testid="kb-hits">{prev.map((h, i) => <li key={i}><b>[{h.title}]</b><p className="src">{h.content.slice(0, 400)}{h.content.length > 400 ? "…" : ""}</p></li>)}</ol>)}</div>
    </section>
    <section className="card"><h2 className="cv-h">Exemplos de resposta</h2>
      <p className="src">Pares pergunta → resposta ideal no estilo da TRADEON (até 8 ativos são enviados). Não use números de mercado fixos: eles vêm sempre das ferramentas.</p>
      <label className="af"><span>Pergunta</span><input value={q} onChange={(e) => setQ(e.target.value)} maxLength={2000} data-testid="ex-q" /></label>
      <label className="af"><span>Resposta ideal</span><textarea rows={5} value={a} onChange={(e) => setA(e.target.value)} maxLength={8000} data-testid="ex-a" /></label>
      <button type="button" className="btn" disabled={busy || !q.trim() || !a.trim()} onClick={() => run({ action: "add_example", question: q, answer: a }, "Exemplo adicionado.", () => { setQ(""); setA(""); })} data-testid="ex-add">Adicionar exemplo</button>
      {t.examples.length > 0 && <ul className="kb-ex" data-testid="ex-list">{t.examples.map((e) => <li key={e.id} className={e.active ? "" : "off"}><div><b>{e.question}</b><p className="src" style={{ whiteSpace: "pre-wrap" }}>{e.answer.slice(0, 300)}{e.answer.length > 300 ? "…" : ""}</p></div>
        <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}><button type="button" className="btn s sm" disabled={busy} onClick={() => run({ action: "example", id: e.id, active: !e.active }, "Exemplo atualizado.")}>{e.active ? "Desativar" : "Ativar"}</button>
          <button type="button" className="btn s sm d" disabled={busy} onClick={() => { if (confirm("Excluir este exemplo?")) run({ action: "example", id: e.id, delete: true }, "Exemplo excluído."); }}>Excluir</button></div></li>)}</ul>}
    </section>
  </div>);
}
