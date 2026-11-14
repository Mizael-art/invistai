"use client";
import { useState } from "react";
/** Encerra a sessão atual. `asMenuItem` renderiza como item do menu da conta. */
export function LogoutButton({ label, asMenuItem = false, icon }: { label: string; asMenuItem?: boolean; icon?: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  async function go() { if (busy) return; setBusy(true); try { await fetch("/api/auth/logout", { method: "POST" }); } finally { window.location.assign("/"); } }
  if (asMenuItem) return <button type="button" role="menuitem" onClick={go} disabled={busy}>{icon}{label}</button>;
  return <button className="btn s" onClick={go} disabled={busy}>{label}</button>;
}
