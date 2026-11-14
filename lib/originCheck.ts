/** Defesa extra contra CSRF em rotas que alteram estado: se houver cabeçalho Origin, ele deve ser o mesmo host da requisição. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;                       // clientes não-navegador (curl/testes) não enviam Origin
  try { return new URL(origin).host === (req.headers.get("x-forwarded-host") || req.headers.get("host")); } catch { return false; }
}
