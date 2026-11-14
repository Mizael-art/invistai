import { NextResponse } from "next/server";
import { favoriteInput } from "@/schemas/favorites";
import { getSupabase } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rateLimit";
import { sameOrigin } from "@/lib/originCheck";

async function mutate(req: Request, action: "add" | "remove") {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = favoriteInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const sb = await getSupabase();
  if (!sb) return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });
  const { data } = await sb.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!rateLimit(`fav:${data.user.id}`, 60, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const key = { user_id: data.user.id, item_type: parsed.data.itemType, item_id: parsed.data.itemId };
  const { error } = action === "add"
    ? await sb.from("favorites").upsert({ ...key, metadata: parsed.data.metadata ?? null }, { onConflict: "user_id,item_type,item_id", ignoreDuplicates: true })
    : await sb.from("favorites").delete().match(key);
  if (error) { console.error("favorites error", error.code); return NextResponse.json({ error: "db_error" }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
export const POST = (req: Request) => mutate(req, "add");
export const DELETE = (req: Request) => mutate(req, "remove");
