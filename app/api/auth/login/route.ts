import { NextResponse } from "next/server";
import { loginInput } from "@/schemas/auth";
import { getSupabase } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rateLimit";
import { sameOrigin } from "@/lib/originCheck";
import { mapAuthError } from "@/lib/authErrors";
import { getProfile } from "@/services/profile";
import { setPrefCookies } from "@/lib/prefCookies";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = loginInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const { email, password } = parsed.data;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`login-ip:${ip}`, 30, 60_000) || !rateLimit(`login:${ip}:${email}`, 8, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const sb = await getSupabase();
  if (!sb) return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error || !data.session) { const m = mapAuthError(error); return NextResponse.json({ error: m.kind }, { status: m.status }); }
    const res = NextResponse.json({ ok: true });
    try { const prof = await getProfile(data.session.user.id); setPrefCookies(res, prof); } catch { /* preferências são opcionais */ }   // tema/idioma salvos na conta valem neste dispositivo
    return res;
  } catch { return NextResponse.json({ error: "unavailable" }, { status: 503 }); }     // nunca registra e-mail/senha
}
