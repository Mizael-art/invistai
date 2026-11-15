import { NextResponse } from "next/server";
import { z } from "zod";
import { adminCtx, dbError } from "@/lib/adminApi";

const Body = z.union([
  z.object({ admin: z.boolean() }).strict(),
  z.object({ plan: z.enum(["free", "pro", "max"]), days: z.number().int().min(1).max(3650).nullable().optional(), note: z.string().max(200).optional() }).strict(),
]);
/** Ações do admin sobre uma conta (autorização e auditoria no banco):
 *  - { admin } concede/remove permissão administrativa (ninguém remove a si mesmo);
 *  - { plan, days?, note? } concede plano PRO/MAX como cortesia (sem cobrança, separado de assinatura/pagamento) ou "free" para retirar a cortesia. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await adminCtx(req); if ("res" in ctx) return ctx.res;
  const id = (await params).id; const b = Body.safeParse(await req.json().catch(() => null));
  if (!/^[0-9a-f-]{36}$/i.test(id) || !b.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { error } = "admin" in b.data
    ? await ctx.sb.rpc("admin_set_admin", { p_user: id, p_admin: b.data.admin })
    : await ctx.sb.rpc("admin_set_plan", { p_user: id, p_plan: b.data.plan, p_days: b.data.plan === "free" ? null : b.data.days ?? null, p_note: b.data.note || null });
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}
