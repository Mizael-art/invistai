import { NextResponse } from "next/server";
import { appPrefsInput } from "@/schemas/preferences";
import { getSupabase } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rateLimit";
import { sameOrigin } from "@/lib/originCheck";
import { setPrefCookies } from "@/lib/prefCookies";

/** Tema e idioma da conta (valem em todos os dispositivos após o login). Também atualiza os cookies deste navegador. */
export async function PUT(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = appPrefsInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const sb = await getSupabase();
  if (!sb) return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });
  const { data } = await sb.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!rateLimit(`appprefs:${data.user.id}`, 30, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const { error } = await sb.from("profiles").upsert({ id: data.user.id, ...parsed.data }, { onConflict: "id" });
  if (error) { console.error("appprefs error", error.code); return NextResponse.json({ error: "db_error" }, { status: 500 }); }
  const res = NextResponse.json({ ok: true }); setPrefCookies(res, parsed.data); return res;
}
