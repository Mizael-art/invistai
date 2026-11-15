import { NextResponse } from "next/server";
import { forgotInput } from "@/schemas/auth";
import { getSupabase } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rateLimit";
import { sameOrigin } from "@/lib/originCheck";
import { mapSignUpError } from "@/lib/authErrors";
import { appBase } from "@/lib/publicUrl";

/** Solicita o e-mail de recuperação. A resposta de sucesso é a MESMA para e-mails existentes e inexistentes (não revela cadastro). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = forgotInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const { email } = parsed.data;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const ipMax = Number(process.env.FORGOT_RATE_IP_PER_HOUR) || 10;
  if (!rateLimit(`forgot-ip:${ip}`, ipMax, 3_600_000) || !rateLimit(`forgot:${email}`, 3, 3_600_000) || !rateLimit(`forgot-min:${ip}:${email}`, 1, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const sb = await getSupabase();
  if (!sb) return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });
  try {
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${appBase(req)}/auth/confirm?type=recovery` });
    if (error) { const m = mapSignUpError(error); return NextResponse.json({ error: m.kind === "email_exists" || m.kind === "weak_password" ? "unavailable" : m.kind }, { status: m.kind === "email_exists" || m.kind === "weak_password" ? 503 : m.status }); }
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "unavailable" }, { status: 503 }); }      // nunca registra o e-mail
}
