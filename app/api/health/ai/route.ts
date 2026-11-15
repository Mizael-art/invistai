import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { rateLimit } from "@/lib/rateLimit";
import { llmEnv, llmFallbackEnv, runChat, LlmError } from "@/lib/ai/llm";
import { probe } from "@/lib/ai/probe";
import { systemPrompt } from "@/lib/ai/prompt";

export const runtime = "nodejs";
export const maxDuration = 60;
/** Diagnóstico operacional da IA (sem sessão), protegido por HEALTH_TOKEN. `full=1` roda uma análise real com ferramentas.
 *  Não devolve chaves nem dados de usuários; sem token configurado responde 404. */
export async function GET(req: Request) {
  const expected = process.env.HEALTH_TOKEN; const u = new URL(req.url); const got = u.searchParams.get("token") ?? "";
  if (!expected || expected.length < 24) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const a = Buffer.from(got), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!rateLimit("health:ai", 6, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const [primary, fallback] = await Promise.all([probe(llmEnv()), probe(llmFallbackEnv())]);
  let full: unknown = null;
  const env = llmEnv();
  if (u.searchParams.get("full") === "1" && env) {
    const t0 = Date.now();
    try {
      const r = await runChat(env, systemPrompt({ plan: "pro", lang: "pt" }), [{ role: "user", content: u.searchParams.get("q")?.slice(0, 200) || "Analise o BTC agora" }], { userId: "00000000-0000-0000-0000-000000000000", lang: "pt" }, 35_000);
      full = { ok: true, ms: Date.now() - t0, tools: r.tools, blocks: r.blocks.map((x) => x.type), tokens: { in: r.inputTokens, out: r.outputTokens }, text: r.text.slice(0, 1500) };
    } catch (e) { full = { ok: false, ms: Date.now() - t0, error: e instanceof LlmError ? e.code : "unexpected" }; }
  }
  return NextResponse.json({ primary, fallback, full }, { headers: { "cache-control": "no-store" } });
}
