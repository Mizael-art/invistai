import { NextResponse } from "next/server";
import { z } from "zod";
import { sameOrigin } from "@/lib/originCheck";
import { getSupabase } from "@/lib/supabase/server";
import { getSessionUser } from "@/services/session";

const Body = z.object({ saved: z.boolean() }).strict();
/** Salvar/remover uma análise (resposta da IA) do histórico de análises salvas. Só a coluna `saved` é alterável. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!(await getSessionUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = (await params).id; const p = Body.safeParse(await req.json().catch(() => null));
  if (!/^[0-9a-f-]{36}$/i.test(id) || !p.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const sb = await getSupabase(); if (!sb) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const { data, error } = await sb.from("ai_messages").update({ saved: p.data.saved }).eq("id", id).eq("role", "assistant").select("id,saved");
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  if (!data?.length) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(data[0]);
}
