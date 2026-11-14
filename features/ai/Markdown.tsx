import { Fragment, type ReactNode } from "react";

/** Renderizador de markdown mínimo e seguro para as respostas da IA: títulos, listas, negrito, itálico e código.
 *  Monta elementos React (nunca HTML bruto) e ignora links/imagens — o texto do modelo não pode injetar nada na página. */
function inline(s: string, key: string): ReactNode[] {
  const out: ReactNode[] = []; const re = /(\*\*[^*]+\*\*|`[^`]+`|(?<![\w*])\*[^*\s][^*]*\*(?![\w*])|(?<!\w)_[^_\s][^_]*_(?!\w))/g; let last = 0; let m: RegExpExecArray | null; let i = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const t = m[0], k = `${key}-${i++}`;
    if (t.startsWith("**")) out.push(<strong key={k}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={k}>{t.slice(1, -1)}</code>);
    else out.push(<em key={k}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out.map((x) => (typeof x === "string" ? x.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") : x));
}
export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n"); const nodes: ReactNode[] = []; let list: { ordered: boolean; items: string[] } | null = null; let para: string[] = [];
  const flushPara = () => { if (para.length) { nodes.push(<p key={`p${nodes.length}`}>{inline(para.join(" "), `p${nodes.length}`)}</p>); para = []; } };
  const flushList = () => { if (list) { const L = list.ordered ? "ol" : "ul"; const k = `l${nodes.length}`; nodes.push(<L key={k}>{list.items.map((it, i) => <li key={i}>{inline(it, `${k}-${i}`)}</li>)}</L>); list = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd(); const h = /^(#{1,4})\s+(.*)$/.exec(line); const ul = /^\s*[-*•]\s+(.*)$/.exec(line); const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) { flushPara(); flushList(); nodes.push(<hr key={`hr${nodes.length}`} />); continue; }
    if (h) { flushPara(); flushList(); const lvl = h[1].length; const k = `h${nodes.length}`; nodes.push(lvl <= 3 ? <h3 key={k}>{inline(h[2], k)}</h3> : <h4 key={k}>{inline(h[2], k)}</h4>); continue; }
    if (ul || ol) { flushPara(); const ordered = !!ol; if (list && list.ordered !== ordered) flushList(); list ??= { ordered, items: [] }; list.items.push((ul ?? ol)![1]); continue; }
    if (/^\|.*\|$/.test(line.trim())) { flushList(); para.push(line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()).filter((c) => c && !/^:?-+:?$/.test(c)).join(" · ")); continue; }
    flushList(); para.push(line.trim());
  }
  flushPara(); flushList();
  return <div className="ai-md">{nodes.map((n, i) => <Fragment key={i}>{n}</Fragment>)}</div>;
}
