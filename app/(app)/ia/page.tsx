import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrefs } from "@/lib/i18n/server";
import { dict } from "@/lib/i18n/dictionary";
import { getEntitlements, aiQuota } from "@/services/subscription";
import { getConversation, listConversations, listSaved } from "@/services/ai";
import { llmEnv } from "@/lib/ai/llm";
import { stripeEnv } from "@/lib/billing/stripe";
import { clock } from "@/lib/format";
import { AiChat } from "@/features/ai/AiChat";
import { Markdown } from "@/features/ai/Markdown";
import { Blocks } from "@/features/ai/Blocks";

export const metadata: Metadata = { title: "TRADEON AI" };
export const dynamic = "force-dynamic";

export default async function IA({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ent = await getEntitlements(); if (!ent) redirect("/login?next=%2Fia");
  const sp = await searchParams; const { lang, tr } = await getPrefs(); const l = dict[lang] as unknown as Record<string, string>;
  if (sp.view === "saved") {
    const saved = await listSaved();
    return (<div className="ai-saved">
      <div className="page-h"><div><h1>{tr("ai.savedTitle" as never)}</h1><p className="mt" style={{ margin: "6px 0 0" }}>{l["ai.savedSub"]}</p></div><Link href="/ia" className="btn s">{l["ai.back"]}</Link></div>
      {saved.length === 0 ? <p className="note" data-testid="ai-no-saved">{l["ai.noSaved"]}</p> : saved.map((m) => (
        <article key={m.id} className="card" data-testid="ai-saved-item"><div className="row sp" style={{ marginBottom: 8 }}><span className="src">{clock(m.created_at, lang)}</span><Link href={`/ia?c=${m.conversation_id}`} className="lnk">{l["ai.open"]}</Link></div>
          <Markdown text={m.content} /><Blocks blocks={m.blocks} l={l} lang={lang} /></article>))}
    </div>);
  }
  const c = typeof sp.c === "string" ? sp.c : null;
  const [convs, conv, quota] = await Promise.all([listConversations(), c ? getConversation(c) : Promise.resolve(null), aiQuota()]);
  return <AiChat key={conv?.conv.id ?? "new"} lang={lang} l={l} configured={!!llmEnv()} billingConfigured={!!stripeEnv()} quota={quota} convs={convs} conv={conv ? { id: conv.conv.id, messages: conv.messages } : null} />;
}
