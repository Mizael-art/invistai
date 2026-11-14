import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { getPrefs } from "@/lib/i18n/server";
import { AssetView } from "@/features/asset/AssetView";
import { Skeleton } from "@/features/home/blocks";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params; return { title: `${id.slice(0, 40)} — TRADEON` };
}
export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { tr } = await getPrefs();
  return (<>
    <div><Link href="/mercado" className="btn s" style={{ textDecoration: "none" }}>← {tr("as.back")}</Link></div>
    <Suspense key={id} fallback={<Skeleton h={500} />}><AssetView id={id} /></Suspense>
  </>);
}
