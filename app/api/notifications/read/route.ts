import { NextResponse } from "next/server";
import { markReadInput } from "@/schemas/notifications";
import { getSupabase } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rateLimit";
import { sameOrigin } from "@/lib/originCheck";

/** Marca notificações do PRÓPRIO usuário como lidas (user_id da sessão + RLS). Idempotente. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = markReadInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const sb = await getSupabase();
  if (!sb) return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });
  const { data } = await sb.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!rateLimit(`notif:${data.user.id}`, 60, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  let q = sb.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", data.user.id).is("read_at", null);
  if ("ids" in parsed.data) q = q.in("id", parsed.data.ids);
  else if (parsed.data.category) q = q.eq("category", parsed.data.category);
  const { error } = await q;
  if (error) { console.error("notif error", error.code); return NextResponse.json({ error: "db_error" }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
