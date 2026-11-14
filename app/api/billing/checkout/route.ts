import { NextResponse } from "next/server";
import { z } from "zod";
import { sameOrigin } from "@/lib/originCheck";
import { rateLimit } from "@/lib/rateLimit";
import { publicOrigin } from "@/lib/publicUrl";
import { stripe, stripeEnv, StripeError } from "@/lib/billing/stripe";
import { getEntitlements } from "@/services/subscription";

const Body = z.object({ plan: z.enum(["pro", "max"]) }).strict();
/** Inicia a assinatura PRO/MAX no Checkout da Stripe. Quem já tem assinatura paga troca de plano/cancela pelo Portal. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ent = await getEntitlements(); if (!ent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const env = stripeEnv(); if (!env) return NextResponse.json({ error: "billing_not_configured" }, { status: 503 });
  if (!ent.user.emailConfirmed) return NextResponse.json({ error: "email_not_confirmed" }, { status: 403 });
  if (!rateLimit(`checkout:${ent.user.id}`, 5, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const p = Body.safeParse(await req.json().catch(() => null)); if (!p.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (ent.plan !== "free" && ent.sub?.provider_customer_id) return NextResponse.json({ error: "has_subscription", manage: true }, { status: 409 });
  const base = (process.env.APP_URL || publicOrigin(req));
  try {
    const s = await stripe<{ url: string }>(env, "POST", "/v1/checkout/sessions", {
      mode: "subscription", line_items: [{ price: env.prices[p.data.plan], quantity: 1 }],
      client_reference_id: ent.user.id, metadata: { user_id: ent.user.id, plan: p.data.plan }, subscription_data: { metadata: { user_id: ent.user.id, plan: p.data.plan } },
      ...(ent.sub?.provider_customer_id ? { customer: ent.sub.provider_customer_id } : { customer_email: ent.user.email ?? undefined }),
      success_url: `${base}/assinatura?checkout=success`, cancel_url: `${base}/assinatura?checkout=cancel`, locale: "pt-BR", allow_promotion_codes: "false",
    }, `checkout:${ent.user.id}:${p.data.plan}:${Math.floor(Date.now() / 60_000)}`);
    if (!/^https:\/\//.test(s.url)) return NextResponse.json({ error: "provider_error" }, { status: 502 });
    return NextResponse.json({ url: s.url });
  } catch (e) { return NextResponse.json({ error: "provider_error", code: e instanceof StripeError ? e.code : "network" }, { status: 502 }); }
}
