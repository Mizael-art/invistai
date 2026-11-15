import { NextResponse } from "next/server";
import { z } from "zod";
import { sameOrigin } from "@/lib/originCheck";
import { rateLimit } from "@/lib/rateLimit";
import { getSupabase } from "@/lib/supabase/server";
import { getSessionUser } from "@/services/session";
import { loadSnapshot } from "@/services/broker";

export const runtime = "nodejs";
const ID = /^[0-9a-f-]{36}$/i;
/** Estado atual da conta na corretora (saldos, posições, ordens, histórico, P&L). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = (await params).id; if (!ID.test(id)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (!rateLimit(`broker:snap:${u.id}`, 12, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const r = await loadSnapshot(u.id, id);
  return r.ok ? NextResponse.json(r.data, { headers: { "cache-control": "no-store" } }) : NextResponse.json({ error: r.code }, { status: r.code === "not_found" ? 404 : 502 });
}
/** Renomear ou autorizar uso pelos bots. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!(await getSessionUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = (await params).id; const b = z.object({ label: z.string().trim().max(60).optional(), bots_allowed: z.boolean().optional() }).strict().safeParse(await req.json().catch(() => null));
  if (!ID.test(id) || !b.success || !Object.keys(b.data).length) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const sb = await getSupabase(); if (!sb) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  if (b.data.bots_allowed) { const { data: c } = await sb.from("broker_connections").select("status,can_trade").eq("id", id).maybeSingle();
    if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 }); if (c.status !== "active" || !c.can_trade) return NextResponse.json({ error: "trade_permission_required" }, { status: 400 }); }
  const { data, error } = await sb.from("broker_connections").update(b.data).eq("id", id).select("id"); if (error) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return data?.length ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_found" }, { status: 404 });
}
/** Desconectar: apaga a conexão e as credenciais cifradas. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!(await getSessionUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = (await params).id; if (!ID.test(id)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const sb = await getSupabase(); if (!sb) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const { data, error } = await sb.from("broker_connections").delete().eq("id", id).select("id"); if (error) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return data?.length ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_found" }, { status: 404 });
}
