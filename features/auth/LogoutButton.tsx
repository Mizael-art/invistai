"use client";
import { useState } from "react";
export function LogoutButton({ label }: { label: string }) {
  const [busy, setBusy] = useState(false);
  async function go() { if (busy) return; setBusy(true); try { await fetch("/api/auth/logout", { method: "POST" }); } finally { window.location.assign("/"); } }
  return <button className="btn s" onClick={go} disabled={busy}>{label}</button>;
}
