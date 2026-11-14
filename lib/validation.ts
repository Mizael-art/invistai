import { parsePhoneNumberFromString } from "libphonenumber-js/min";

/** Nome: NFC, sem caracteres de controle, espaços colapsados; 2–100 caracteres com ao menos uma letra. */
export function normalizeName(s: string): string { return s.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim(); }
export const isValidName = (n: string) => n.length >= 2 && n.length <= 100 && /\p{L}/u.test(n);

/** Telefone → E.164. Padrão Brasil (DDD + 8/9 dígitos, com ou sem +55); aceita números internacionais com "+". Retorna null se inválido. */
export function normalizePhone(input: string): string | null {
  const t = input.trim(); if (!t || t.length > 30) return null;
  const p = parsePhoneNumberFromString(t, "BR");
  return p && p.isValid() ? p.number : null;
}

export interface PasswordRules { length: boolean; upper: boolean; number: boolean; special: boolean }
export const MAX_PASSWORD = 72;                                  // limite do bcrypt usado pelo Supabase Auth
export function passwordRules(pw: string): PasswordRules {
  return { length: pw.length >= 8, upper: /[A-ZÀ-Ý]/.test(pw), number: /\d/.test(pw), special: /[^A-Za-z0-9À-ÿ\s]/.test(pw) };
}
export const passwordOk = (pw: string) => pw.length <= MAX_PASSWORD && Object.values(passwordRules(pw)).every(Boolean);
