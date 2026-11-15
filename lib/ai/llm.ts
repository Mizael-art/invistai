import { TOOL_DEFS, runTool, type Block, type ToolCtx } from "./tools";

/** Camada própria de orquestração: conversa com o modelo (OpenAI Chat Completions ou compatível, ou Anthropic Messages),
 *  executa as ferramentas pedidas no servidor e devolve o texto final + cartões. A chave fica só no servidor. */
export interface LlmEnv { provider: "openai" | "anthropic"; apiKey: string; model: string; baseUrl: string }
/** IA reserva (opcional), usada quando a principal atinge limite, cai ou falha: AI_FALLBACK_PROVIDER / _API_KEY / _MODEL / _BASE_URL. */
export function llmFallbackEnv(e = process.env): LlmEnv | null {
  if (!e.AI_FALLBACK_API_KEY) return null;
  return llmEnv({ AI_PROVIDER: e.AI_FALLBACK_PROVIDER, AI_API_KEY: e.AI_FALLBACK_API_KEY, AI_MODEL: e.AI_FALLBACK_MODEL, AI_BASE_URL: e.AI_FALLBACK_BASE_URL } as unknown as NodeJS.ProcessEnv);
}
/** Erros em que vale tentar a IA reserva (limite, indisponibilidade, rede). Erros de conteúdo/configuração não. */
export const retriable = (code: string) => code === "rate_limited" || code === "timeout" || code === "network" || /^http_5\d\d$/.test(code);
export function llmEnv(e = process.env): LlmEnv | null {
  const provider = e.AI_PROVIDER === "anthropic" ? "anthropic" : "openai"; const apiKey = e.AI_API_KEY || (provider === "openai" ? e.OPENAI_API_KEY : e.ANTHROPIC_API_KEY);
  if (!apiKey) return null;
  return { provider, apiKey, model: e.AI_MODEL || (provider === "openai" ? "gpt-4.1-mini" : "claude-haiku-4-5"),
    baseUrl: (e.AI_BASE_URL || (provider === "openai" ? "https://api.openai.com/v1" : "https://api.anthropic.com")).replace(/\/$/, "") };
}
export interface ChatTurn { role: "user" | "assistant"; content: string }
export interface RunResult { text: string; blocks: Block[]; tools: string[]; inputTokens: number; outputTokens: number }
export class LlmError extends Error { constructor(public code: string) { super(code); } }

const MAX_ROUNDS = 6, MAX_TOOL_CALLS = 10;
async function post(url: string, headers: Record<string, string>, body: unknown, signal: AbortSignal) {
  let res: Response;
  try { res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal, cache: "no-store" }); }
  catch (e) { throw new LlmError(signal.aborted ? "timeout" : "network"); }
  if (res.status === 401 || res.status === 403) throw new LlmError("auth");
  if (res.status === 429) throw new LlmError("rate_limited");
  if (!res.ok) throw new LlmError(`http_${res.status}`);
  return res.json() as Promise<Record<string, unknown>>;
}

export async function runChat(env: LlmEnv, system: string, history: ChatTurn[], ctx: ToolCtx, timeoutMs = 55_000): Promise<RunResult> {
  const signal = AbortSignal.timeout(timeoutMs); const blocks: Block[] = []; const tools: string[] = []; let inTok = 0, outTok = 0, calls = 0;
  const exec = async (name: string, args: unknown) => { calls++; tools.push(name); if (calls > MAX_TOOL_CALLS) return { error: "tool_limit" }; const r = await runTool(name, args, ctx); blocks.push(...r.blocks); return r.result; };
  const parseArgs = (s: unknown) => { if (typeof s !== "string") return s ?? {}; try { return JSON.parse(s); } catch { return {}; } };

  if (env.provider === "openai") {
    const msgs: Record<string, unknown>[] = [{ role: "system", content: system }, ...history.map((h) => ({ role: h.role, content: h.content }))];
    const toolsDef = TOOL_DEFS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const j = await post(`${env.baseUrl}/chat/completions`, { authorization: `Bearer ${env.apiKey}` }, { model: env.model, messages: msgs, tools: toolsDef, tool_choice: round === MAX_ROUNDS - 1 ? "none" : "auto", temperature: 0.3, max_tokens: 1600 }, signal);
      const u = j.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined; inTok += u?.prompt_tokens ?? 0; outTok += u?.completion_tokens ?? 0;
      const m = (j.choices as { message?: { content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[] | undefined)?.[0]?.message;
      if (!m) throw new LlmError("invalid_response");
      if (m.tool_calls?.length) {
        msgs.push({ role: "assistant", content: m.content ?? null, tool_calls: m.tool_calls });
        for (const tc of m.tool_calls) msgs.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(await exec(tc.function.name, parseArgs(tc.function.arguments))).slice(0, 24_000) });
        continue;
      }
      if (!m.content?.trim()) throw new LlmError("empty");
      return { text: m.content.trim(), blocks: dedupe(blocks), tools, inputTokens: inTok, outputTokens: outTok };
    }
    throw new LlmError("too_many_rounds");
  }
  // Anthropic Messages API
  const msgs: { role: string; content: unknown }[] = history.map((h) => ({ role: h.role, content: h.content }));
  const toolsDef = TOOL_DEFS.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const j = await post(`${env.baseUrl}/v1/messages`, { "x-api-key": env.apiKey, "anthropic-version": "2023-06-01" },
      { model: env.model, system, messages: msgs, max_tokens: 1600, temperature: 0.3, ...(round === MAX_ROUNDS - 1 ? { tool_choice: { type: "none" } } : {}), tools: toolsDef }, signal);
    const u = j.usage as { input_tokens?: number; output_tokens?: number } | undefined; inTok += u?.input_tokens ?? 0; outTok += u?.output_tokens ?? 0;
    const content = (j.content as { type: string; text?: string; id?: string; name?: string; input?: unknown }[] | undefined) ?? [];
    const uses = content.filter((c) => c.type === "tool_use");
    if (uses.length) {
      msgs.push({ role: "assistant", content });
      const results = []; for (const tu of uses) results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(await exec(tu.name!, tu.input)).slice(0, 24_000) });
      msgs.push({ role: "user", content: results }); continue;
    }
    const text = content.filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
    if (!text) throw new LlmError("empty");
    return { text, blocks: dedupe(blocks), tools, inputTokens: inTok, outputTokens: outTok };
  }
  throw new LlmError("too_many_rounds");
}
/** Mantém o cartão mais recente de cada ativo/tipo e no máximo 6 cartões. */
function dedupe(b: Block[]): Block[] {
  const seen = new Set<string>(); const out: Block[] = [];
  for (let i = b.length - 1; i >= 0; i--) { const x = b[i]; const k = x.type === "asset" || x.type === "chart" ? `${x.type}:${x.symbol}` : x.type; if (seen.has(k)) continue; seen.add(k); out.unshift(x); }
  return out.slice(-6);
}
