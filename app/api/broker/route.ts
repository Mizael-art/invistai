import { NextResponse } from "next/server";
import { z } from "zod";
import { sameOrigin } from "@/lib/originCheck";
import { rateLimit } from "@/lib/rateLimit";
import { getSupabase } from "@/lib/supabase/server";
import { getEntitlements } from "@/services/subscription";
import { isAdmin } from "@/services/calls";
import { can } from "@/lib/plans";
import { validateKey, BrokerError } from "@/lib/broker";
import { keyHint, seal, vaultReady } from "@/lib/broker/vault";
import { aad } from "@/services/broker";

export const runtime = "nodejs";
const Body = z.object({ exchange: z.enum(["bybit", "binance"]), label: z.string().trim().max(60).optional(), apiKey: z.string().trim().min(10).max(200).regex(/^[A-Za-z0-9_-]+$/), apiSecret: z.string().trim().min(10).max(200).regex(/^[A-Za-z0-9_+/=-]+$/) }).strict();
/** Conecta uma corretora: valida a chave na própria corretora (leitura sim, saque NÃO), cifra e guarda. Nada da chave volta ao navegador. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ent = await getEntitlements(); if (!ent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(ent.plan, "broker_api") && !(await isAdmin())) return NextResponse.json({ error: "plan_required", required: "max" }, { status: 403 });
  if (!rateLimit(`broker:connect:${ent.user.id}`, 6, 600_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const sb = await getSupabase(); const secret = process.env.BILLING_DB_SECRET;
  if (!sb || !secret || !vaultReady()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const p = Body.safeParse(await req.json().catch(() => null)); if (!p.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { exchange, apiKey, apiSecret } = p.data;
  let perms;
  try { perms = await validateKey(exchange, { apiKey, apiSecret }); }
  catch (e) { return NextResponse.json({ error: e instanceof BrokerError ? e.code : "unavailable" }, { status: 400 }); }
  const { data, error } = await sb.rpc("broker_save", { secret, p_exchange: exchange, p_label: p.data.label ?? "", p_key_hint: keyHint(apiKey), p_key_enc: seal(apiKey, aad(ent.user.id, exchange)),
    p_secret_enc: seal(apiSecret, aad(ent.user.id, exchange)), p_permissions: perms, p_can_trade: perms.spotTrade || perms.futuresTrade, p_ip_restricted: perms.ipRestricted });
  if (error) return NextResponse.json({ error: /too_many/.test(error.message) ? "too_many_connections" : "unavailable" }, { status: /too_many/.test(error.message) ? 400 : 503 });
  return NextResponse.json({ id: data, permissions: perms }, { status: 201 });
}
