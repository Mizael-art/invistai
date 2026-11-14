import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/originCheck";
import { rateLimit } from "@/lib/rateLimit";
import { publicOrigin } from "@/lib/publicUrl";
import { stripe, stripeEnv, StripeError } from "@/lib/billing/stripe";
import { getEntitlements } from "@/services/subscription";

/** Portal do Cliente (Stripe): trocar de plano (upgrade/downgrade), cancelar, ver faturas e atualizar o cartão. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ent = await getEntitlements(); if (!ent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const env = stripeEnv(); if (!env) return NextResponse.json({ error: "billing_not_configured" }, { status: 503 });
  if (!ent.sub?.provider_customer_id) return NextResponse.json({ error: "no_customer" }, { status: 409 });
  if (!rateLimit(`portal:${ent.user.id}`, 10, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  try {
    const s = await stripe<{ url: string }>(env, "POST", "/v1/billing_portal/sessions", { customer: ent.sub.provider_customer_id, return_url: `${(process.env.APP_URL || publicOrigin(req))}/assinatura`, locale: "pt-BR" });
    if (!/^https:\/\//.test(s.url)) return NextResponse.json({ error: "provider_error" }, { status: 502 });
    return NextResponse.json({ url: s.url });
  } catch (e) { return NextResponse.json({ error: "provider_error", code: e instanceof StripeError ? e.code : "network" }, { status: 502 }); }
}
