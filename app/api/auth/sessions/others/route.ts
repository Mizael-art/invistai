import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rateLimit";
import { sameOrigin } from "@/lib/originCheck";

/** Encerra as OUTRAS sessões (mantém a atual) usando o recurso real do Supabase Auth (`signOut({ scope: "others" })`).
 *  Os refresh tokens das outras sessões são revogados; access tokens já emitidos valem até expirar (≤ 1 h por padrão). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sb = await getSupabase();
  if (!sb) return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });
  const { data } = await sb.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!rateLimit(`others:${data.user.id}`, 5, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  try {
    const { error } = await sb.auth.signOut({ scope: "others" });
    if (error) return NextResponse.json({ error: "unavailable" }, { status: 503 });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "unavailable" }, { status: 503 }); }
}
