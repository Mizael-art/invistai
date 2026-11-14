import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import { sameOrigin } from "@/lib/originCheck";

/** Encerra somente a sessão atual (scope local) e limpa os cookies. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sb = await getSupabase();
  if (!sb) return NextResponse.json({ ok: true });
  try { await sb.auth.signOut({ scope: "local" }); } catch { /* cookies são limpos mesmo se o provedor falhar */ }
  return NextResponse.json({ ok: true });
}
