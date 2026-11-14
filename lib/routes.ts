/** Rotas que exigem sessão (validadas no servidor pelo middleware). */
export const PRIVATE_PREFIXES = ["/perfil", "/notificacoes", "/favoritos"];
export const isPrivatePath = (path: string) => PRIVATE_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));

/** Destino pós-login seguro: apenas caminhos internos (evita open redirect) e nunca as páginas de autenticação. */
export function safeNext(next: string | null | undefined): string {
  if (!next || typeof next !== "string" || next.length > 300) return "/";
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\u0000-\u001f]/.test(next)) return "/";
  if (/^\/(login|cadastro|recuperar-senha|redefinir-senha|api)(\/|\?|$)/.test(next)) return "/";
  return next;
}
