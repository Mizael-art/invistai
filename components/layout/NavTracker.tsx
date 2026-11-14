"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { nextStack } from "@/lib/navStack";

export function NavTracker() {
  const path = usePathname();
  const popped = useRef(false);
  useEffect(() => { const h = () => { popped.current = true; }; window.addEventListener("popstate", h); return () => window.removeEventListener("popstate", h); }, []);
  useEffect(() => {
    try {
      const cur: string[] = JSON.parse(sessionStorage.getItem("iv_nav") || "[]");
      sessionStorage.setItem("iv_nav", JSON.stringify(nextStack(Array.isArray(cur) ? cur : [], path, popped.current)));
    } catch { /* sessionStorage indisponível: Voltar cai no Início */ }
    popped.current = false;
  }, [path]);
  return null;
}
