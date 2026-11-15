import Link from "next/link";

/** Bloqueio de recurso pago: explica o que o plano libera, sem mostrar nenhum dado protegido. */
export function Paywall({ l, feature }: { l: Record<string, string>; feature: "calls" | "vip_portfolios" | "bots" }) {
  return (<section className="card paywall" data-testid="paywall">
    <span className="lock-ic" aria-hidden="true"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 11h11v9h-11zM8.5 11V8a3.5 3.5 0 0 1 7 0v3" /></svg></span>
    <h1>{l[`pw.${feature}.title`]}</h1>
    <p className="mt">{l[`pw.${feature}.text`]}</p>
    <Link href="/assinatura" className="btn" data-testid="paywall-cta">{l[`pw.${feature}.cta`]}</Link>
  </section>);
}
