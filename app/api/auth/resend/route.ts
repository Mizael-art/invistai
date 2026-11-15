import { NextResponse } from "next/server";
import { resendInput } from "@/schemas/auth";
import { getSupabase } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rateLimit";
import { sameOrigin } from "@/lib/originCheck";
import { mapSignUpError } from "@/lib/authErrors";
import { appBase } from "@/lib/publicUrl";

/** Reenvia o e-mail de confirmação. Resposta genérica (não revela se o e-mail existe). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let body: unknown = {};
  try { const t = await req.text(); if (t) body = JSON.parse(t); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = resendInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const sb = await getSupabase();
  if (!sb) return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });
  let email = parsed.data.email;
  if (!email) { const { data } = await sb.auth.getUser(); email = data.user?.email ?? undefined; }       // usuário logado e não confirmado
  if (!email) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`resend:${ip}:${email}`, 1, 60_000) || !rateLimit(`resend-h:${email}`, 5, 3_600_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  try {
    const { error } = await sb.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${appBase(req)}/auth/confirm?next=%2F` } });
    if (error) { const m = mapSignUpError(error); return NextResponse.json({ error: m.kind }, { status: m.status }); }
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "unavailable" }, { status: 503 }); }
}
