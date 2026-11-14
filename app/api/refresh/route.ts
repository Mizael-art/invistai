import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { rateLimit } from "@/lib/rateLimit";
import { sameOrigin } from "@/lib/originCheck";

/** Revalida o cache de mercado/notícias. Limite por IP e um teto global (o IP vem de cabeçalho e pode ser forjado), para não esgotar a cota dos provedores. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`refresh:${ip}`, 3, 30_000) || !rateLimit("refresh:global", Number(process.env.REFRESH_GLOBAL_PER_MIN) || 30, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  revalidateTag("market"); revalidateTag("news");
  return NextResponse.json({ ok: true });
}
