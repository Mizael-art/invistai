import { NextResponse } from "next/server";
import { z } from "zod";
import { sameOrigin } from "@/lib/originCheck";
import { rateLimit } from "@/lib/rateLimit";
import { getSupabase } from "@/lib/supabase/server";
import { getEntitlements } from "@/services/subscription";
import { llmEnv, llmFallbackEnv, retriable, runChat, LlmError, type ChatTurn, type LlmEnv, type RunResult } from "@/lib/ai/llm";
import { systemPrompt, trainingBlock } from "@/lib/ai/prompt";
import { kbSearch, loadTraining } from "@/lib/ai/knowledge";
import { getPrefs } from "@/lib/i18n/server";

export const runtime = "nodejs";
export const maxDuration = 60;
const Body = z.object({ conversationId: z.string().uuid().optional(), message: z.string().trim().min(1).max(2000) }).strict();

/** Envia uma mensagem à TRADEON AI. Ordem: sessão → configuração → cota no banco (atômica) → modelo + ferramentas → persistência.
 *  Falha do modelo devolve a mensagem consumida (ai_release, protegido por segredo de servidor). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ent = await getEntitlements(); if (!ent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = Body.safeParse(await req.json().catch(() => null)); if (!p.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const env = llmEnv(); const sb = await getSupabase();
  if (!env || !sb) return NextResponse.json({ error: "ai_not_configured" }, { status: 503 });
  // Uso justo (por instância): protege contra abuso/custo mesmo nos planos ilimitados.
  if (!rateLimit(`ai:min:${ent.user.id}`, 8, 60_000) || !rateLimit(`ai:day:${ent.user.id}`, ent.plan === "free" ? 10 : 300, 86_400_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const secret = process.env.BILLING_DB_SECRET;
  const logAs = (e: LlmEnv, status: "ok" | "error" | "blocked", extra: { in?: number; out?: number; tools?: string[]; err?: string; ms?: number }) =>
    secret ? sb.rpc("ai_log_request", { secret, p_provider: e.baseUrl.includes("googleapis") ? "gemini" : e.baseUrl.includes("groq") ? "groq" : e.provider, p_model: e.model, p_in: extra.in ?? null, p_out: extra.out ?? null, p_tools: extra.tools ?? [], p_status: status, p_error: extra.err ?? null, p_latency: extra.ms ?? null }).then(() => {}, () => {}) : Promise.resolve();
  const log = (status: "ok" | "error" | "blocked", extra: { in?: number; out?: number; tools?: string[]; err?: string; ms?: number }) => logAs(env, status, extra);

  // Conversa: existente (do próprio usuário — RLS) ou nova.
  let convId = p.data.conversationId ?? null; let history: ChatTurn[] = [];
  if (convId) {
    const { data: c } = await sb.from("ai_conversations").select("id").eq("id", convId).maybeSingle(); if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const { data: m } = await sb.from("ai_messages").select("role,content").eq("conversation_id", convId).order("created_at", { ascending: false }).limit(12);
    history = ((m ?? []) as ChatTurn[]).reverse();
  }
  const { data: q, error: qe } = await sb.rpc("ai_try_consume");
  const quota = (Array.isArray(q) ? q[0] : q) as { allowed: boolean; plan: string; used: number; msg_limit: number | null; remaining: number | null } | null;
  if (qe || !quota) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  if (!quota.allowed) { await log("blocked", { err: "quota_exhausted" }); return NextResponse.json({ error: "quota_exhausted", plan: quota.plan, limit: quota.msg_limit, used: quota.used }, { status: 402 }); }
  const release = async () => { if (secret) await sb.rpc("ai_release", { secret }).then(() => {}, () => {}); };

  if (!convId) {
    const { data: c, error } = await sb.from("ai_conversations").insert({ user_id: ent.user.id, title: p.data.message.slice(0, 60) }).select("id").single();
    if (error || !c) { await release(); return NextResponse.json({ error: "unavailable" }, { status: 503 }); }
    convId = c.id as string;
  }
  const { data: um, error: ue } = await sb.from("ai_messages").insert({ conversation_id: convId, user_id: ent.user.id, role: "user", content: p.data.message }).select("id,created_at").single();
  if (ue || !um) { await release(); return NextResponse.json({ error: "unavailable" }, { status: 503 }); }

  const t0 = Date.now(); const { lang } = await getPrefs();
  try {
    const [training, hits] = await Promise.all([loadTraining(sb, secret), kbSearch(sb, secret, p.data.message, 3)]);
    const system = systemPrompt({ plan: ent.plan, lang }) + trainingBlock(training, hits);
    const ctx = { userId: ent.user.id, lang, kb: (q: string) => kbSearch(sb, secret, q, 4) };
    const turns: ChatTurn[] = [...history, { role: "user", content: p.data.message }];
    let used: LlmEnv = env; let r: RunResult;
    const fbEnv = llmFallbackEnv();
    try { r = await runChat(env, system, turns, ctx, fbEnv ? 30_000 : 55_000); }
    catch (e) {
      const fb = fbEnv; if (!fb || !(e instanceof LlmError) || !retriable(e.code)) throw e;
      await log("error", { err: `primary_${e.code}`, ms: Date.now() - t0 }); used = fb; r = await runChat(fb, system, turns, ctx, 25_000);
    }
    const { data: am, error: ae } = await sb.from("ai_messages").insert({ conversation_id: convId, user_id: ent.user.id, role: "assistant", content: r.text.slice(0, 24000), blocks: r.blocks }).select("id,created_at").single();
    if (ae || !am) throw new LlmError("persist_failed");
    await sb.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
    await logAs(used, "ok", { in: r.inputTokens, out: r.outputTokens, tools: r.tools, ms: Date.now() - t0 });
    return NextResponse.json({ conversationId: convId, userMessage: { id: um.id, created_at: um.created_at },
      message: { id: am.id, role: "assistant", content: r.text, blocks: r.blocks, saved: false, created_at: am.created_at },
      quota: { plan: quota.plan, used: quota.used, limit: quota.msg_limit, remaining: quota.remaining } }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    const code = e instanceof LlmError ? e.code : "unexpected";
    console.error("[ai] falha", code);
    await sb.from("ai_messages").delete().eq("id", um.id); await release(); await log("error", { err: code, ms: Date.now() - t0 });
    return NextResponse.json({ error: "ai_failed", code, conversationId: convId }, { status: 502 });
  }
}
