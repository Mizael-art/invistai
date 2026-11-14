import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { safeTarget, badgeText, isKnownKind } from "@/lib/notifications";
import { parseNotificationsParams, markReadInput } from "@/schemas/notifications";

describe("safeTarget", () => {
  it("aceita caminhos internos", () => { for (const t of ["/perfil", "/mercado/bitcoin", "/noticias?cat=crypto"]) expect(safeTarget(t)).toBe(t); });
  it("rejeita externos, protocolo relativo, javascript:, barras invertidas, controle e lixo", () => {
    for (const t of ["https://evil.com", "//evil.com", "javascript:alert(1)", "/\\evil", "/a\nb", "", null, 1, "/<script>", "x".repeat(400)]) expect(safeTarget(t), String(t)).toBeNull();
  });
});
describe("badgeText", () => { it("0 → vazio; até 9 → número; mais → 9+", () => { expect(badgeText(0)).toBe(""); expect(badgeText(3)).toBe("3"); expect(badgeText(10)).toBe("9+"); expect(badgeText(-1)).toBe(""); }); });
describe("tipos conhecidos", () => { it("só eventos reais da conta", () => { for (const k of ["welcome", "email_confirmed", "password_changed"]) expect(isKnownKind(k)).toBe(true); for (const k of ["signal", "price_alert", ""]) expect(isKnownKind(k)).toBe(false); }); });
describe("parseNotificationsParams", () => {
  it("valida e usa padrões", () => { expect(parseNotificationsParams({ cat: "x", state: "y", page: "-1" })).toEqual({ cat: "all", state: "all", page: 1 }); expect(parseNotificationsParams({ cat: ["account", "x"], state: "unread", page: "2" })).toEqual({ cat: "account", state: "unread", page: 2 }); });
});
describe("markReadInput", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  it("aceita ids ou all (com categoria opcional)", () => { for (const ok of [{ ids: [id] }, { all: true }, { all: true, category: "account" }]) expect(markReadInput.safeParse(ok).success).toBe(true); });
  it("rejeita vazio, ids inválidos, mistura e categorias inexistentes", () => {
    for (const bad of [{}, { ids: [] }, { ids: ["x"] }, { ids: [id], all: true }, { all: false }, { all: true, category: "signals" }, { ids: Array(101).fill(id) }, { all: true, user_id: id }]) expect(markReadInput.safeParse(bad).success, JSON.stringify(bad).slice(0, 60)).toBe(false);
  });
});
describe("migração 0007", () => {
  const sql = readFileSync(path.resolve(__dirname, "../../supabase/migrations/20260101000007_notifications.sql"), "utf8");
  it("RLS, sem INSERT por usuários e UPDATE restrito a read_at", () => {
    expect(sql).toContain("enable row level security"); expect(sql).not.toMatch(/for insert/i); expect(sql).toContain("grant update (read_at)"); expect(sql).toContain("revoke update");
  });
  it("só categorias existentes e eventos reais da conta (sem notificações financeiras)", () => { expect(sql).toContain("('market','news','account')"); expect(sql).not.toMatch(/signal|price|sinal/i); });
});
