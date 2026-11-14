import { NextResponse } from "next/server";
import { profileInput } from "@/schemas/auth";
import { getSupabase } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rateLimit";
import { sameOrigin } from "@/lib/originCheck";

/** Atualiza SOMENTE nome e telefone do próprio usuário (RLS). E-mail e demais campos são rejeitados (schema estrito). */
export async function PUT(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = profileInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const sb = await getSupabase();
  if (!sb) return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });
  const { data } = await sb.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!rateLimit(`profile:${data.user.id}`, 20, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const { error } = await sb.from("profiles").upsert({ id: data.user.id, name: parsed.data.name, phone: parsed.data.phone }, { onConflict: "id" });
  if (error) { console.error("profile error", error.code); return NextResponse.json({ error: "db_error" }, { status: 500 }); }
  return NextResponse.json({ ok: true, name: parsed.data.name, phone: parsed.data.phone });
}
