import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getPrefs } from "@/lib/i18n/server";
import { getSessionUser } from "@/services/session";
import { parseFavoritesParams } from "@/schemas/favoritesPage";
import { FavoritesContent } from "@/features/favorites/FavoritesContent";
import { Skeleton } from "@/features/home/blocks";

export const metadata: Metadata = { title: "Favoritos — TRADEON" };
export default async function Favoritos({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Ffavoritos");                       // o middleware já protege; defesa extra
  const p = parseFavoritesParams(await searchParams); const { tr } = await getPrefs();
  return (<>
    <div><h1>{tr("fv.title")}</h1><p className="mt">{tr("fv.sub")}</p></div>
    <Suspense key={JSON.stringify(p)} fallback={<Skeleton h={360} />}><FavoritesContent userId={user.id} p={p} /></Suspense>
  </>);
}
