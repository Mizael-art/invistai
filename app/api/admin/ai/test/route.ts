import { NextResponse } from "next/server";
import { adminCtx } from "@/lib/adminApi";
import { isAdmin } from "@/services/calls";
import { llmEnv, llmFallbackEnv } from "@/lib/ai/llm";
import { probe } from "@/lib/ai/probe";

export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(req: Request) {
  const ctx = await adminCtx(req); if ("res" in ctx) return ctx.res;
  if (!(await isAdmin())) return NextResponse.json({ error: "admin_required" }, { status: 403 });
  const [primary, fallback] = await Promise.all([probe(llmEnv()), probe(llmFallbackEnv())]);
  return NextResponse.json({ primary, fallback }, { headers: { "cache-control": "no-store" } });
}
