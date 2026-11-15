import { NextResponse } from "next/server";
import { z } from "zod";
import { adminCtx, dbError } from "@/lib/adminApi";
import { chunkText } from "@/lib/ai/knowledge";

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("instructions"), text: z.string().max(12000) }),
  z.object({ action: z.literal("add_doc"), title: z.string().trim().min(1).max(160), source: z.string().trim().max(200).optional(), text: z.string().min(1).max(400_000) }),
  z.object({ action: z.literal("doc"), id: z.string().uuid(), active: z.boolean().optional(), delete: z.boolean().optional() }),
  z.object({ action: z.literal("add_example"), question: z.string().trim().min(1).max(2000), answer: z.string().trim().min(1).max(8000) }),
  z.object({ action: z.literal("example"), id: z.string().uuid(), active: z.boolean().optional(), delete: z.boolean().optional() }),
  z.object({ action: z.literal("preview"), q: z.string().trim().min(1).max(500) }),
]);
/** Treino da TRADEON AI pelo painel (instruções, documentos, exemplos, prévia da busca). O banco confere se é administrador. */
export async function POST(req: Request) {
  const ctx = await adminCtx(req); if ("res" in ctx) return ctx.res;
  const a = Action.safeParse(await req.json().catch(() => null)); if (!a.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const d = a.data; const sb = ctx.sb;
  if (d.action === "add_doc") {
    const chunks = chunkText(d.text); if (!chunks.length) return NextResponse.json({ error: "empty_document" }, { status: 400 });
    if (chunks.length > 400) return NextResponse.json({ error: "document_too_large" }, { status: 400 });
    const { data, error } = await sb.rpc("admin_ai_add_doc", { p_title: d.title, p_source: d.source ?? null, p_chunks: chunks }); if (error) return dbError(error);
    return NextResponse.json({ id: data, chunks: chunks.length }, { status: 201 });
  }
  if (d.action === "preview") { const { data, error } = await sb.rpc("admin_ai_kb_preview", { q: d.q }); if (error) return dbError(error); return NextResponse.json({ items: data }); }
  const { data, error } = d.action === "instructions" ? await sb.rpc("admin_ai_set_instructions", { p_text: d.text })
    : d.action === "doc" ? await sb.rpc("admin_ai_doc_set", { p_id: d.id, p_active: d.active ?? null, p_delete: d.delete ?? false })
    : d.action === "add_example" ? await sb.rpc("admin_ai_add_example", { p_q: d.question, p_a: d.answer })
    : await sb.rpc("admin_ai_example_set", { p_id: d.id, p_active: d.active ?? null, p_delete: d.delete ?? false });
  if (error) return dbError(error);
  return NextResponse.json({ ok: true, id: data ?? null });
}
