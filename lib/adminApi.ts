import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/originCheck";
import { getSupabase } from "@/lib/supabase/server";
import { getSessionUser } from "@/services/session";

/** Base das rotas administrativas: sessão + mesma origem. A autorização real (é administrador?) é feita no banco
 *  pelas funções admin_* — o servidor não tem nenhum atalho que dispense essa checagem. */
export async function adminCtx(req: Request) {
  if (!sameOrigin(req)) return { res: NextResponse.json({ error: "forbidden" }, { status: 403 }) } as const;
  if (!(await getSessionUser())) return { res: NextResponse.json({ error: "unauthorized" }, { status: 401 }) } as const;
  const sb = await getSupabase(); if (!sb) return { res: NextResponse.json({ error: "unavailable" }, { status: 503 }) } as const;
  return { sb } as const;
}
const KNOWN = ["admin_required", "not_found", "call_finished", "not_draft", "not_active", "invalid_target", "target_out_of_order", "invalid_reason", "no_targets_hit", "exit_required", "cannot_remove_self"];
export function dbError(e: { message?: string; code?: string } | null) {
  const msg = e?.message ?? ""; const code = KNOWN.find((k) => msg.includes(k)) ?? (e?.code === "23514" ? "invalid_levels" : "unavailable");
  const status = code === "admin_required" ? 403 : code === "not_found" ? 404 : code === "unavailable" ? 503 : 400;
  return NextResponse.json({ error: code }, { status });
}
