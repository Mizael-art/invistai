import type { Metadata } from "next";
import Link from "next/link";
import { getPrefs } from "@/lib/i18n/server";
import { Icon } from "@/components/ui/Icon";
import { getEntitlements } from "@/services/subscription";
import { can } from "@/lib/plans";

export const metadata: Metadata = { title: "VIP — TRADEON" };
export const dynamic = "force-dynamic";
/** Área VIP: hub dos recursos pagos. Mostra o que está disponível e o que ainda está em desenvolvimento (sem simular conteúdo). */
export default async function Vip() {
  const { tr } = await getPrefs(); const ent = await getEntitlements(); const plan = ent?.plan ?? "free";
  return (<>
    <div className="page-h"><div><h1>VIP</h1><p className="mt" style={{ margin: "6px 0 0" }}>{tr("vip.sub" as never)}</p></div></div>
    <div className="vip-hub">
      <Link href="/calls" className="card vip-item" data-testid="vip-calls"><span className="plan-ic" aria-hidden="true"><Icon name="vip" size={20} /></span><div><b>Calls VIP</b><p className="mt">{tr("vip.calls" as never)}</p></div>
        <span className={`bd ${can(plan, "calls") ? "" : "v"}`}>{can(plan, "calls") ? tr("vip.available" as never) : "PRO · MAX"}</span></Link>
      <div className="card vip-item" data-testid="vip-portfolios" aria-disabled="true"><span className="plan-ic" aria-hidden="true"><Icon name="market" size={20} /></span><div><b>{tr("vip.portfolios" as never)}</b><p className="mt">{tr("vip.portfoliosText" as never)}</p></div><span className="bd v">{tr("soon.title")}</span></div>
      <div className="card vip-item" data-testid="vip-bots" aria-disabled="true"><span className="plan-ic" aria-hidden="true"><Icon name="refresh" size={20} /></span><div><b>Trading Bots</b><p className="mt">{tr("vip.botsText" as never)}</p></div><span className="bd v">{tr("soon.title")}</span></div>
    </div>
  </>);
}
