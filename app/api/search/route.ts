import { NextResponse } from "next/server";
import { getPrefs } from "@/lib/i18n/server";
import { rateLimit } from "@/lib/rateLimit";
import { runSearch, normalizeQuery, MIN_QUERY } from "@/services/search";

/** Busca global: somente ativos e mercados. Pública (conteúdo público), com limite por IP. */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("q");
  if (raw === null) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`search:${ip}`, Number(process.env.SEARCH_RATE_PER_MIN) || 30, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const q = normalizeQuery(raw);
  if (q.length < MIN_QUERY) return NextResponse.json({ q, markets: [], assets: [], errors: [] });
  const { lang } = await getPrefs();
  const res = NextResponse.json(await runSearch(q, lang));
  res.headers.set("Cache-Control", "private, max-age=30");
  return res;
}
