"use client";
import { useEffect, useRef, useState } from "react";

/** Contador de uma aba de Favoritos: valor do servidor, descontado na hora quando um item é removido nesta tela
 *  (evento "iv:fav-removed"). Quando o servidor envia o novo valor, o desconto local deixa de valer — sem descontar duas vezes. */
export function FavCount({ kind, initial, testid }: { kind: "all" | "asset" | "news"; initial: number; testid: string }) {
  const [st, setSt] = useState({ base: initial, d: 0 }); const base = useRef(initial);
  base.current = initial;
  useEffect(() => {
    const h = (e: Event) => { const t = (e as CustomEvent<string>).detail; if (kind === "all" || kind === t) setSt((s) => ({ base: base.current, d: (s.base === base.current ? s.d : 0) + 1 })); };
    window.addEventListener("iv:fav-removed", h); return () => window.removeEventListener("iv:fav-removed", h);
  }, [kind]);
  const d = st.base === initial ? st.d : 0;
  return <span className="mt" data-testid={testid}>{Math.max(0, initial - d)}</span>;
}
