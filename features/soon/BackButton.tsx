"use client";
import { useRouter } from "next/navigation";
import { canGoBack } from "@/lib/navStack";

/** Volta à página anterior do app quando houver histórico interno válido; caso contrário, vai ao Início. */
export function BackButton({ label }: { label: string }) {
  const router = useRouter();
  function go() {
    let stack: string[] = [];
    try { stack = JSON.parse(sessionStorage.getItem("iv_nav") || "[]"); } catch { /* ignore */ }
    if (Array.isArray(stack) && canGoBack(stack)) router.back(); else router.push("/");
  }
  return <button className="btn s" onClick={go}>← {label}</button>;
}
