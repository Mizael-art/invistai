export type AuthFailure = "invalid_credentials" | "email_not_confirmed" | "rate_limited" | "unavailable";
export type SignUpFailure = "email_exists" | "weak_password" | "rate_limited" | "email_send_failed" | "unavailable";
/** Traduz erros do Supabase Auth em categorias seguras (nunca vaza detalhes nem confirma se um e-mail existe). */
export function mapAuthError(err: { code?: string; status?: number; name?: string; message?: string } | null | undefined): { kind: AuthFailure; status: number } {
  const code = err?.code, st = err?.status ?? 0;
  if (code === "email_not_confirmed") return { kind: "email_not_confirmed", status: 403 };
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || st === 429) return { kind: "rate_limited", status: 429 };
  if (code === "invalid_credentials" || code === "user_not_found" || code === "validation_failed" || (st === 400 && !code)) return { kind: "invalid_credentials", status: 401 };
  return { kind: "unavailable", status: 503 };                   // 5xx, rede, retryable fetch, desconhecido
}

/** Erros do signUp → categorias seguras. `email_send_failed` = o provedor não conseguiu enviar o e-mail de confirmação (ex.: SMTP). */
export function mapSignUpError(err: { code?: string; status?: number; message?: string; name?: string } | null | undefined): { kind: SignUpFailure; status: number } {
  const code = err?.code, st = err?.status ?? 0, msg = (err?.message ?? "").toLowerCase();
  if (code === "user_already_exists" || code === "email_exists") return { kind: "email_exists", status: 409 };
  if (code === "weak_password") return { kind: "weak_password", status: 400 };
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || st === 429) return { kind: "rate_limited", status: 429 };
  // O supabase-js entrega 5xx como AuthRetryableFetchError (sem `code`); reconhecemos a falha de SMTP pela mensagem do GoTrue.
  if (/error sending.*(email|mail)|smtp/.test(msg)) return { kind: "email_send_failed", status: 502 };
  return { kind: "unavailable", status: 503 };
}
const CONFIRM_TYPES = ["email", "signup", "recovery"] as const;
/** Tipos de link aceitos em /auth/confirm: confirmação de cadastro (email/signup) e recuperação de senha (recovery). */
export const isConfirmType = (t: unknown): t is (typeof CONFIRM_TYPES)[number] => typeof t === "string" && (CONFIRM_TYPES as readonly string[]).includes(t);

/** Tipo repassado ao verifyOtp do Supabase (signup/email → "email"). */
export const otpTypeFor = (t: (typeof CONFIRM_TYPES)[number]): "email" | "recovery" => (t === "recovery" ? "recovery" : "email");

export type ResetFailure = "weak_password" | "same_password" | "invalid_link" | "rate_limited" | "unavailable";
/** Erros do updateUser (redefinição) → categorias seguras. Sessão ausente/expirada = link inválido. */
export function mapResetError(err: { code?: string; status?: number; name?: string; message?: string } | null | undefined): { kind: ResetFailure; status: number } {
  const code = err?.code, st = err?.status ?? 0, name = err?.name ?? "", msg = (err?.message ?? "").toLowerCase();
  if (code === "weak_password" || name === "AuthWeakPasswordError") return { kind: "weak_password", status: 400 };
  if (code === "same_password") return { kind: "same_password", status: 400 };
  if (name === "AuthSessionMissingError" || code === "session_not_found" || code === "bad_jwt" || st === 401 || /session missing|jwt/.test(msg)) return { kind: "invalid_link", status: 401 };
  if (code === "over_request_rate_limit" || st === 429) return { kind: "rate_limited", status: 429 };
  return { kind: "unavailable", status: 503 };
}
