"use client";
import { useState } from "react";
import { filterFaq } from "@/lib/support";

type L = Record<string, string>;
export function SupportFaq({ items, labels }: { items: { id: string; q: string; a: string }[]; labels: L }) {
  const [q, setQ] = useState("");
  const list = filterFaq(items, q);
  return (<section aria-labelledby="sp-faq-h">
    <h2 id="sp-faq-h">{labels["sp.faq"]}</h2>
    <div className="row" style={{ marginBottom: 10 }}>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value.slice(0, 80))} placeholder={labels["sp.faqSearch"]} aria-label={labels["sp.faqSearch"]} data-testid="sp-faq-search" style={{ flex: 1, minWidth: 0 }} />
    </div>
    <p className="src" aria-live="polite" data-testid="sp-faq-count">{labels["sp.faqCount"].replace("{n}", String(list.length)).replace("{t}", String(items.length))}</p>
    {list.length ? list.map((i) => (
      <details key={i.id} className="card sp-faq" data-faq={i.id} style={{ marginTop: 8 }}><summary style={{ cursor: "pointer", fontWeight: 600 }}>{i.q}</summary><p className="mt" style={{ marginTop: 8 }}>{i.a}</p></details>
    )) : <div className="card" data-testid="sp-faq-empty"><p>{labels["sp.faqEmpty"]}</p><button type="button" className="btn s" onClick={() => setQ("")}>{labels["sp.faqClear"]}</button></div>}
  </section>);
}
