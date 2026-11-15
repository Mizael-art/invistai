import { NextResponse } from "next/server";
import { z } from "zod";
import { CallInput } from "@/lib/calls";
import { adminCtx, dbError } from "@/lib/adminApi";

const ID = /^[0-9a-f-]{36}$/i;
/** Edita uma call (rascunho ou ativa). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await adminCtx(req); if ("res" in ctx) return ctx.res;
  const id = (await params).id; if (!ID.test(id)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const c = CallInput.safeParse(await req.json().catch(() => null)); if (!c.success) return NextResponse.json({ error: "invalid_call", issues: c.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  const { error } = await ctx.sb.rpc("admin_update_call", { p_id: id, p: c.data }); if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}
const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("publish") }),
  z.object({ action: z.literal("tp"), tp: z.number().int().min(1).max(4), price: z.number().positive().optional() }),
  z.object({ action: z.literal("close"), reason: z.enum(["stop", "targets", "manual"]), exit: z.number().positive().optional(), fees: z.number().min(0).max(10).optional(), note: z.string().trim().max(1000).optional() }),
  z.object({ action: z.literal("cancel"), note: z.string().trim().max(1000).optional() }),
  z.object({ action: z.literal("note"), note: z.string().trim().min(1).max(1000) }),
]);
/** Ações sobre a call: publicar, registrar alvo, encerrar (stop/alvos/manual), cancelar, anotar. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await adminCtx(req); if ("res" in ctx) return ctx.res;
  const id = (await params).id; if (!ID.test(id)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const a = Action.safeParse(await req.json().catch(() => null)); if (!a.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const d = a.data; const sb = ctx.sb;
  const { error } = d.action === "publish" ? await sb.rpc("admin_publish_call", { p_id: id })
    : d.action === "tp" ? await sb.rpc("admin_hit_target", { p_id: id, p_tp: d.tp, p_price: d.price ?? null })
    : d.action === "close" ? await sb.rpc("admin_close_call", { p_id: id, p_reason: d.reason, p_exit: d.exit ?? null, p_fees: d.fees ?? null, p_note: d.note ?? null })
    : d.action === "cancel" ? await sb.rpc("admin_cancel_call", { p_id: id, p_note: d.note ?? null })
    : await sb.rpc("admin_add_call_note", { p_id: id, p_note: d.note });
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}
