import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** Cofre de credenciais de corretoras: AES-256-GCM com chave de servidor (BROKER_ENC_KEY, 32 bytes em base64).
 *  O texto cifrado é amarrado ao usuário e à corretora (AAD): copiar o valor para outra conta não o torna válido.
 *  Nada aqui é registrado em log. */
const VERSION = "v1";
function key(): Buffer | null {
  const raw = process.env.BROKER_ENC_KEY; if (!raw) return null;
  try { const k = Buffer.from(raw, "base64"); return k.length === 32 ? k : null; } catch { return null; }
}
export const vaultReady = () => key() !== null;
export function seal(plain: string, aad: string): string {
  const k = key(); if (!k) throw new Error("vault_unavailable");
  const iv = randomBytes(12); const c = createCipheriv("aes-256-gcm", k, iv); c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]); const tag = c.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}
export function open(sealed: string, aad: string): string {
  const k = key(); if (!k) throw new Error("vault_unavailable");
  const [v, iv, tag, ct] = sealed.split(":"); if (v !== VERSION || !iv || !tag || !ct) throw new Error("vault_format");
  const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64")); d.setAAD(Buffer.from(aad)); d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
}
export const keyHint = (apiKey: string) => (apiKey.length <= 8 ? "••••" : `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`);
