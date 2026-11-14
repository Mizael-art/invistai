import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resetInput } from "@/schemas/auth";
import { getSupabase } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rateLimit";
import { sameOrigin } from "@/lib/originCheck";
import { mapResetError } from "@/lib/authErrors";
import { RECOVERY_COOKIE } from "@/lib/recovery";

/** Define a nova senha. Exige sessão criada por link de recuperação (cookie HttpOnly + sessão válida). Ao concluir, encerra TODAS as sessões. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = resetInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`reset:${ip}`, 10, 15 * 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const sb = await getSupabase();
  if (!sb) return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });
  const jar = await cookies();
  if (jar.get(RECOVERY_COOKIE)?.value !== "1") return NextResponse.json({ error: "invalid_link" }, { status: 401 });
  try {
    const { data } = await sb.auth.getUser();
    if (!data.user) { jar.delete(RECOVERY_COOKIE); return NextResponse.json({ error: "invalid_link" }, { status: 401 }); }
    const { error } = await sb.auth.updateUser({ password: parsed.data.password });
    if (error) { const m = mapResetError(error); return NextResponse.json({ error: m.kind }, { status: m.status }); }
    try { await sb.auth.signOut({ scope: "global" }); } catch { /* o cookie é limpo mesmo se o provedor falhar */ }
    jar.delete(RECOVERY_COOKIE);
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "unavailable" }, { status: 503 }); }       // nunca registra a senha
}
