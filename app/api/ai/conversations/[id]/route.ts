import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/originCheck";
import { getSupabase } from "@/lib/supabase/server";
import { getSessionUser } from "@/services/session";
import { getConversation } from "@/services/ai";

/** Mensagens de uma conversa (somente do próprio usuário) e exclusão da conversa. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSessionUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await getConversation((await params).id); if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(r, { headers: { "cache-control": "no-store" } });
}
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!(await getSessionUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = (await params).id; if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const sb = await getSupabase(); if (!sb) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const { data, error } = await sb.from("ai_conversations").delete().eq("id", id).select("id");
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  if (!data?.length) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
