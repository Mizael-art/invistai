import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";

/** Guarda de escopo: o módulo VIP/Aprender é só "Em breve" — nenhuma estrutura de banco/serviço/rota de pagamento, sinais ou cursos. */
const root = path.resolve(__dirname, "../..");
const FORBIDDEN = /subscri|assinatur|payment|pagament|signal|sinais|checkout|telegram|stripe|pix\b|course|curso|ebook|lesson|aula/i;
describe("escopo: VIP e Aprender somente 'Em breve'", () => {
  it("migrações não criam tabelas de assinatura, pagamento, sinais, cursos ou Telegram", () => {
    const dir = path.join(root, "supabase/migrations");
    for (const f of readdirSync(dir)) expect(readFileSync(path.join(dir, f), "utf8"), f).not.toMatch(FORBIDDEN);
  });
  it("não existem rotas de checkout/assinatura/sinais nem serviços correspondentes", () => {
    for (const p of ["app/(app)/vip/checkout", "app/(app)/vip/planos", "app/(app)/aprender/cursos", "app/vip", "app/aprender", "app/api/checkout", "app/api/subscriptions", "app/api/signals", "services/billing", "services/signals", "services/telegram"])
      expect(existsSync(path.join(root, p)), p).toBe(false);
  });
  it("as páginas /vip e /aprender usam apenas o componente ComingSoon", () => {
    for (const f of ["app/(app)/vip/page.tsx", "app/(app)/aprender/page.tsx"]) { const src = readFileSync(path.join(root, f), "utf8"); expect(src).toContain("ComingSoon"); expect(src).not.toMatch(/fetch\(|supabase|services\//i); }
  });
});
