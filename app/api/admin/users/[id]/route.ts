import { NextResponse } from "next/server";
import { z } from "zod";
import { adminCtx, dbError } from "@/lib/adminApi";

/** Concede/remove permissão administrativa (auditado no banco; ninguém remove a si mesmo). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await adminCtx(req); if ("res" in ctx) return ctx.res;
  const id = (await params).id; const b = z.object({ admin: z.boolean() }).strict().safeParse(await req.json().catch(() => null));
  if (!/^[0-9a-f-]{36}$/i.test(id) || !b.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { error } = await ctx.sb.rpc("admin_set_admin", { p_user: id, p_admin: b.data.admin }); if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}
