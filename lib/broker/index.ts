import { bybitPermissions, bybitSnapshot } from "./bybit";
import { binancePermissions, binanceSnapshot } from "./binance";
import { BrokerError, type AccountSnapshot, type Creds, type Exchange, type Permissions } from "./types";

/** Ponto único de acesso às corretoras. Para adicionar outra corretora: implementar permissions() e snapshot() e registrar aqui. */
const ADAPTERS: Record<Exchange, { permissions: (c: Creds) => Promise<Permissions>; snapshot: (c: Creds, p: Permissions) => Promise<AccountSnapshot> }> = {
  bybit: { permissions: bybitPermissions, snapshot: bybitSnapshot },
  binance: { permissions: binancePermissions, snapshot: binanceSnapshot },
};
/** Valida a chave: precisa ler a conta e NÃO pode ter permissão de saque (regra obrigatória da plataforma). */
export async function validateKey(ex: Exchange, c: Creds): Promise<Permissions> {
  const p = await ADAPTERS[ex].permissions(c);
  if (p.withdraw) throw new BrokerError("withdraw_enabled");
  if (!p.read) throw new BrokerError("read_disabled");
  return p;
}
export async function accountSnapshot(ex: Exchange, c: Creds): Promise<AccountSnapshot> {
  const p = await validateKey(ex, c);                // revalida a cada leitura: se o usuário habilitar saque depois, a conexão para
  return ADAPTERS[ex].snapshot(c, p);
}
export { BrokerError } from "./types";
export type { AccountSnapshot, Exchange, Permissions } from "./types";
