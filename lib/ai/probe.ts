import type { LlmEnv } from "./llm";

/** Diagnóstico da conexão com a IA (só admin): lista modelos disponíveis na chave e faz uma chamada mínima. Nunca devolve a chave. */
export async function probe(env: LlmEnv | null) {
  if (!env) return { configured: false };
  const host = new URL(env.baseUrl).host; const t0 = Date.now();
  const H: Record<string, string> = env.provider === "anthropic" ? { "x-api-key": env.apiKey, "anthropic-version": "2023-06-01" } : { authorization: `Bearer ${env.apiKey}` };
  let models: string[] = [];
  try { const r = await fetch(`${env.baseUrl}${env.provider === "anthropic" ? "/v1/models" : "/models"}`, { headers: H, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (r.ok) { const j = await r.json() as { data?: { id: string }[] }; models = (j.data ?? []).map((m) => m.id.replace(/^models\//, "")).slice(0, 60); } } catch {}
  try {
    const r = env.provider === "anthropic"
      ? await fetch(`${env.baseUrl}/v1/messages`, { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ model: env.model, max_tokens: 10, messages: [{ role: "user", content: "Responda apenas: OK" }] }), cache: "no-store", signal: AbortSignal.timeout(12000) })
      : await fetch(`${env.baseUrl}/chat/completions`, { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ model: env.model, max_tokens: 10, messages: [{ role: "user", content: "Responda apenas: OK" }] }), cache: "no-store", signal: AbortSignal.timeout(12000) });
    const j = await r.json().catch(() => ({})) as { error?: { message?: string } | { message?: string }[] };
    const msg = Array.isArray(j.error) ? j.error[0]?.message : j.error?.message;
    return { configured: true, host, model: env.model, ok: r.ok, status: r.status, latencyMs: Date.now() - t0, error: r.ok ? null : (msg ?? `HTTP ${r.status}`).slice(0, 300), models };
  } catch (e) { return { configured: true, host, model: env.model, ok: false, status: 0, latencyMs: Date.now() - t0, error: e instanceof Error ? e.message.slice(0, 200) : "network", models }; }
}
