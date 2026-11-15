"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const ERR: Record<string, string> = {
  invalid_key: "Chave ou segredo inválidos (confira se copiou inteiros e se a chave não expirou).",
  withdraw_enabled: "Esta chave tem permissão de SAQUE. Por segurança a TRADEON não aceita: crie uma chave sem saque.",
  read_disabled: "A chave não tem permissão de leitura. Ative 'leitura' ao criar a chave.",
  permission_denied: "A corretora recusou a chave (permissão ou restrição de IP). Use uma chave somente leitura sem restrição de IP.",
  ip_not_allowed: "A chave tem restrição de IP e a TRADEON não tem IP fixo. Crie uma chave somente leitura sem restrição de IP.",
  rate_limited: "Muitas tentativas. Aguarde alguns minutos.", too_many_connections: "Limite de 5 conexões atingido. Desconecte uma para adicionar outra.",
  plan_required: "Conexão com corretora é exclusiva do plano MAX.", not_configured: "Conexão com corretoras ainda não configurada no servidor.", invalid: "Preencha a chave e o segredo corretamente.",
};
const HOWTO: Record<string, string[]> = {
  bybit: ["Bybit → Perfil → API → Criar nova chave → 'Chaves geradas pelo sistema'.", "Uso: 'Conexão de API'. Permissões: marque SOMENTE LEITURA (Read-Only).", "Não marque Transferência nem Saque. Sem IP fixo, a Bybit expira a chave em 90 dias."],
  binance: ["Binance → Perfil → Gerenciamento de API → Criar API → 'Gerada pelo sistema'.", "Deixe marcado só 'Ativar leitura'. NÃO marque saques, transferências, spot/margem nem futuros.", "Restrição de IP: deixe sem restrição (a TRADEON ainda não tem IP fixo)."],
};
/** Formulário de conexão. A chave vai só para o servidor (HTTPS), que valida na corretora, cifra e descarta o texto puro. */
export function ConnectForm() {
  const router = useRouter(); const [ex, setEx] = useState<"bybit" | "binance">("bybit"); const [label, setLabel] = useState(""); const [k, setK] = useState(""); const [s, setS] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    const r = await fetch("/api/broker", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ exchange: ex, label: label || undefined, apiKey: k.trim(), apiSecret: s.trim() }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setErr(ERR[j.error] ?? "Não foi possível conectar agora."); return; }
    setK(""); setS(""); setLabel(""); router.push(`/corretora?c=${j.id}`); router.refresh();
  }
  return (<form className="card" onSubmit={go} aria-label="Conectar corretora" data-testid="bk-form">
    <h2 className="cv-h">Conectar corretora</h2>
    <div className="seg2" role="radiogroup" aria-label="Corretora">{(["bybit", "binance"] as const).map((x) => <label key={x} className={ex === x ? "on long" : ""}><input type="radio" name="ex" value={x} checked={ex === x} onChange={() => setEx(x)} />{x === "bybit" ? "Bybit" : "Binance"}</label>)}</div>
    <ol className="bk-howto">{HOWTO[ex].map((t, i) => <li key={i}>{t}</li>)}</ol>
    <div className="af-row"><label className="af"><span>API Key</span><input value={k} onChange={(e) => setK(e.target.value)} autoComplete="off" spellCheck={false} data-testid="bk-key" required /></label>
      <label className="af"><span>API Secret</span><input type="password" value={s} onChange={(e) => setS(e.target.value)} autoComplete="new-password" spellCheck={false} data-testid="bk-secret" required /></label></div>
    <label className="af"><span>Apelido <small className="mt">(opcional)</small></span><input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="Ex.: Conta principal" data-testid="bk-label" /></label>
    {err && <p className="note" role="alert" data-testid="bk-err">{err}</p>}
    <button className="btn" disabled={busy || !k || !s} data-testid="bk-connect">{busy ? "Validando na corretora…" : "Validar e conectar"}</button>
    <p className="src" style={{ marginTop: 10 }}>🔒 A chave é validada direto na corretora, guardada criptografada (AES-256) e nunca volta para o navegador. Chaves com permissão de saque são recusadas. Você pode desconectar quando quiser.</p>
  </form>);
}
