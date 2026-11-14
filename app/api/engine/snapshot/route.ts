import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rateLimit";
import { EngineError, snapshot } from "@/lib/engine";
import { ASSET_CLASSES, type AssetClass } from "@/lib/engine/types";

export const runtime = "nodejs";
/** Snapshot técnico público do motor TRADEON (dados de mercado públicos, sem dados de usuário). Limitado por IP. */
const Q = z.object({ symbol: z.string().trim().min(1).max(24), class: z.enum(ASSET_CLASSES as [AssetClass, ...AssetClass[]]).optional() });
export async function GET(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
  if (!rateLimit(`engine:${ip}`, 20, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const u = new URL(req.url); const p = Q.safeParse({ symbol: u.searchParams.get("symbol") ?? "", class: u.searchParams.get("class") ?? undefined });
  if (!p.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    const s = await snapshot(p.data.symbol, p.data.class);
    return NextResponse.json(s, { headers: { "cache-control": "public, s-maxage=30, stale-while-revalidate=60" } });
  } catch (e) {
    const code = e instanceof EngineError ? e.code : "unavailable";
    return NextResponse.json({ error: code }, { status: code === "unknown_symbol" ? 404 : code === "unsupported_asset_class" ? 422 : code === "rate_limited" ? 429 : 503 });
  }
}
