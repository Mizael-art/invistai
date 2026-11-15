import { NextResponse } from "next/server";
import { z } from "zod";
import { CallInput } from "@/lib/calls";
import { adminCtx, dbError } from "@/lib/adminApi";

const Body = z.object({ call: z.unknown(), publish: z.boolean().default(false) }).strict();
/** Cria uma call VIP (rascunho ou publicada). Só administradores (verificado no banco). */
export async function POST(req: Request) {
  const ctx = await adminCtx(req); if ("res" in ctx) return ctx.res;
  const b = Body.safeParse(await req.json().catch(() => null)); if (!b.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const c = CallInput.safeParse(b.data.call); if (!c.success) return NextResponse.json({ error: "invalid_call", issues: c.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  const { data, error } = await ctx.sb.rpc("admin_create_call", { p: c.data, p_publish: b.data.publish });
  if (error) return dbError(error);
  return NextResponse.json({ id: data }, { status: 201 });
}
