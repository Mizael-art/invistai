/** Origem pública da requisição (respeita proxies): `req.nextUrl` usa o hostname interno do servidor, o que trocaria o host nos redirects e perderia os cookies. */
export function publicOrigin(req: Request): string {
  const h = req.headers;
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host") || new URL(req.url).host;
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || new URL(req.url).protocol.replace(":", "");
  return `${proto}://${host}`;
}
export const publicUrl = (req: Request, pathAndQuery: string) => new URL(pathAndQuery, publicOrigin(req));
