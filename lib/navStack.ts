/** Pilha de navegação interna (sessionStorage) para decidir se "Voltar" pode usar o histórico do app ou deve ir ao Início.
 *  `isPop` indica navegação por histórico (botão voltar/avançar, router.back) — só então uma página igual à anterior desempilha;
 *  navegação por link (push) sempre empilha, mesmo que o destino seja a página de dois passos atrás. */
export const NAV_MAX = 50;
export function nextStack(stack: string[], path: string, isPop = false): string[] {
  if (stack[stack.length - 1] === path) return stack;                                      // mesma página (ex.: refresh)
  if (isPop && stack.length >= 2 && stack[stack.length - 2] === path) return stack.slice(0, -1);   // voltou uma página
  const n = [...stack, path];
  return n.length > NAV_MAX ? n.slice(-NAV_MAX) : n;
}
export const canGoBack = (stack: string[]) => stack.length > 1;
