import { NextResponse } from "next/server";
import { prefsInput } from "@/schemas/preferences";
import { getSupabase } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rateLimit";
import { sameOrigin } from "@/lib/originCheck";

/** Categorias de notícias e/ou de notificações do usuário. Salvar a preferência NÃO significa que haverá envio de notificações. */
export async function PUT(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = prefsInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const sb = await getSupabase();
  if (!sb) return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });
  const { data } = await sb.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!rateLimit(`prefs:${data.user.id}`, 20, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const row: Record<string, unknown> = { user_id: data.user.id };
  if (parsed.data.newsCategories) row.news_categories = parsed.data.newsCategories;
  if (parsed.data.notificationCategories) row.notification_categories = parsed.data.notificationCategories;
  const { error } = await sb.from("user_preferences").upsert(row, { onConflict: "user_id" });
  if (error) { console.error("prefs error", error.code); return NextResponse.json({ error: "db_error" }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
