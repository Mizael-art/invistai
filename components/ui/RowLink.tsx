"use client";
import { useRouter } from "next/navigation";

/** Linha de tabela clicável. Não usa o truque do link "esticado" (::after absoluto): no Safari do iPhone a <tr> não serve
 *  de referência para position:absolute, e o link da última linha cobria a página (tocar na busca abria outra moeda). */
export function RowLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  return (<tr className={className} data-href={href} onClick={(e) => {
    if ((e.target as HTMLElement).closest("a,button,input,select,textarea,label")) return;
    if (window.getSelection()?.toString()) return;
    router.push(href);
  }}>{children}</tr>);
}
