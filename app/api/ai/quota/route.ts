import { NextResponse } from "next/server";
import { getSessionUser } from "@/services/session";
import { aiQuota } from "@/services/subscription";

/** Cota da TRADEON AI da conta logada, calculada no banco (não no navegador). */
export async function GET() {
  if (!(await getSessionUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = await aiQuota(); if (!q) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return NextResponse.json(q, { headers: { "cache-control": "no-store" } });
}
