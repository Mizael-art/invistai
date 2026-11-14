import { NextResponse } from "next/server";
import { registerInput } from "@/schemas/auth";
import { getSupabase } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rateLimit";
import { sameOrigin } from "@/lib/originCheck";
import { mapSignUpError } from "@/lib/authErrors";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = registerInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const { name, email, phone, password } = parsed.data;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const ipMax = Number(process.env.REGISTER_RATE_IP_PER_HOUR) || 10;   // configurável (testes usam valor alto)
  if (!rateLimit(`reg-ip:${ip}`, ipMax, 3_600_000) || !rateLimit(`reg:${email}`, 3, 3_600_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const sb = await getSupabase();
  if (!sb) return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });
  try {
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name, phone } } });
    if (error) { const m = mapSignUpError(error); return NextResponse.json({ error: m.kind }, { status: m.status }); }
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return NextResponse.json({ error: "email_exists" }, { status: 409 });   // e-mail já cadastrado (resposta ofuscada do Supabase)
    if (data.session) return NextResponse.json({ status: "signed_in" });
    return NextResponse.json({ status: "confirmation_required" });
  } catch { return NextResponse.json({ error: "unavailable" }, { status: 503 }); }       // nunca registra e-mail/senha/telefone
}
